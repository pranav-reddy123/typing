import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isPlausibleResult, validateEmail, validatePassword, validateUsername } from './validate';
import { raceCode, randomSeed } from '../typing/rng';
import { streakDays } from './local';
import { isScoreable } from '../typing/metrics';
import type { TestConfig, TestResult } from '../typing/types';
import type {
  AuthResult,
  DataProvider,
  FriendRequest,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardScope,
  ProfileStats,
  Race,
  RaceParticipant,
  RaceStatus,
  User,
} from './types';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      { auth: { persistSession: true, autoRefreshToken: true } },
    );
  }
  return client;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_seed: string;
  created_at: string;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    bio: row.bio ?? '',
    avatarSeed: row.avatar_seed,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toTest(row: Record<string, unknown>, samples?: Record<string, number[]>): TestResult {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    mode: row.mode as TestResult['mode'],
    target: (row.target as number) ?? 0,
    durationS: Number(row.duration_s),
    language: row.language as string,
    punctuation: Boolean(row.punctuation),
    numbers: Boolean(row.numbers),
    difficulty: row.difficulty as TestResult['difficulty'],
    wpm: Number(row.wpm),
    rawWpm: Number(row.raw_wpm),
    accuracy: Number(row.accuracy),
    consistency: Number(row.consistency),
    chars: {
      correct: row.chars_correct as number,
      incorrect: row.chars_incorrect as number,
      extra: (row.chars_extra as number) ?? 0,
      missed: (row.chars_missed as number) ?? 0,
    },
    keystrokes: row.keystrokes as number,
    words: 0,
    errors: row.chars_incorrect as number,
    samples: (samples?.wpm ?? []).map((wpm, i) => ({
      t: i + 1,
      wpm,
      raw: samples?.raw?.[i] ?? 0,
      errors: samples?.errors?.[i] ?? 0,
    })),
    tallies: [],
    raceId: (row.race_id as string) ?? null,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

function toParticipant(row: Record<string, unknown>): RaceParticipant {
  const profile = row.profiles as ProfileRow | undefined;
  return {
    raceId: row.race_id as string,
    userId: row.user_id as string,
    username: profile?.username ?? 'player',
    avatarSeed: profile?.avatar_seed ?? row.user_id as string,
    ready: Boolean(row.ready),
    progress: Number(row.progress ?? 0),
    wpm: Number(row.wpm ?? 0),
    accuracy: Number(row.accuracy ?? 0),
    finishedAt: row.finished_at ? new Date(row.finished_at as string).getTime() : null,
    place: (row.place as number) ?? null,
    connected: !row.left_at,
    joinedAt: new Date(row.joined_at as string).getTime(),
  };
}

function toRace(row: Record<string, unknown>): Race {
  return {
    id: row.id as string,
    code: row.code as string,
    hostId: row.host_id as string,
    textSeed: row.text_seed as string,
    wordCount: row.word_count as number,
    status: row.status as RaceStatus,
    startsAt: row.starts_at ? new Date(row.starts_at as string).getTime() : null,
    createdAt: new Date(row.created_at as string).getTime(),
    expiresAt: new Date(row.expires_at as string).getTime(),
  };
}

const CONFIG_KEY = 'baud:config';

/**
 * Postgres-backed provider. Every statement here runs under the row-level
 * security policies in `docs/database.md` — this client has no elevated rights,
 * and a compromised client can still only read and write what those policies
 * allow.
 */
export class SupabaseProvider implements DataProvider {
  readonly kind = 'supabase' as const;

  // ---- auth ----------------------------------------------------------

  async signUp(email: string, username: string, password: string): Promise<AuthResult> {
    const uname = username.trim().toLowerCase();
    const problem =
      validateEmail(email) ?? validateUsername(uname) ?? validatePassword(password);
    if (problem) return { user: null, error: problem };

    const taken = await supabase().from('profiles').select('id').eq('username', uname).maybeSingle();
    if (taken.data) return { user: null, error: 'That username is taken.' };

    const { data: auth, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: uname } },
    });
    if (error || !auth.user) return { user: null, error: error?.message ?? 'Could not create the account.' };

    const { data: profile, error: profileError } = await supabase()
      .from('profiles')
      .insert({ id: auth.user.id, username: uname, display_name: uname, avatar_seed: randomSeed() })
      .select()
      .single();
    if (profileError) return { user: null, error: profileError.message };

    await this.claimAnonymousTests(auth.user.id);
    return { user: toUser(profile as ProfileRow), error: null };
  }

  async signIn(identifier: string, password: string): Promise<AuthResult> {
    let email = identifier.trim();
    if (!email.includes('@')) {
      const { data: profile } = await supabase()
        .from('profiles')
        .select('id')
        .eq('username', identifier.trim().toLowerCase())
        .maybeSingle();
      if (!profile) return { user: null, error: 'Those credentials do not match an account.' };
      // Sign-in by username requires an RPC that maps username -> email, since
      // auth.users is not client-readable. See docs/database.md.
      const { data: mapped } = await supabase().rpc('email_for_username', {
        p_username: identifier.trim().toLowerCase(),
      });
      if (!mapped) return { user: null, error: 'Those credentials do not match an account.' };
      email = mapped as string;
    }

    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: 'Those credentials do not match an account.' };

    const user = await this.getSession();
    if (user) await this.claimAnonymousTests(user.id);
    return { user, error: user ? null : 'Could not load your profile.' };
  }

  async signOut(): Promise<void> {
    await supabase().auth.signOut();
  }

  async getSession(): Promise<User | null> {
    const { data: session } = await supabase().auth.getUser();
    if (!session.user) return null;
    const { data: profile } = await supabase()
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    return profile ? toUser(profile as ProfileRow) : null;
  }

  async updateProfile(patch: Partial<Pick<User, 'displayName' | 'bio' | 'avatarSeed'>>): Promise<User> {
    const me = await this.requireUser();
    const { data, error } = await supabase()
      .from('profiles')
      .update({
        display_name: patch.displayName,
        bio: patch.bio,
        avatar_seed: patch.avatarSeed,
      })
      .eq('id', me.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toUser(data as ProfileRow);
  }

  async deleteAccount(): Promise<void> {
    const { error } = await supabase().rpc('delete_own_account');
    if (error) throw new Error(error.message);
    await this.signOut();
  }

  // ---- preferences ---------------------------------------------------

  async getConfig(): Promise<TestConfig | null> {
    const me = await supabase().auth.getUser();
    if (me.data.user) {
      const { data } = await supabase()
        .from('user_settings')
        .select('config')
        .eq('user_id', me.data.user.id)
        .maybeSingle();
      if (data?.config && Object.keys(data.config).length > 0) return data.config as TestConfig;
    }
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as TestConfig) : null;
  }

  async setConfig(config: TestConfig): Promise<void> {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    const me = await supabase().auth.getUser();
    if (!me.data.user) return;
    await supabase()
      .from('user_settings')
      .upsert({ user_id: me.data.user.id, config, updated_at: new Date().toISOString() });
  }

  // ---- tests ---------------------------------------------------------

  async saveTest(result: TestResult): Promise<TestResult> {
    if (!isPlausibleResult(result)) throw new Error('That result failed validation and was not saved.');
    const me = await supabase().auth.getUser();
    if (!me.data.user) {
      // Anonymous tests are held locally until the user signs in.
      const held = JSON.parse(localStorage.getItem('baud:anon-tests') ?? '[]') as TestResult[];
      held.push(result);
      localStorage.setItem('baud:anon-tests', JSON.stringify(held.slice(-50)));
      return result;
    }
    const userId = me.data.user.id;

    const { error } = await supabase().from('typing_tests').insert({
      id: result.id,
      user_id: userId,
      mode: result.mode,
      duration_s: Math.round(result.durationS),
      target: result.target,
      language: result.language,
      punctuation: result.punctuation,
      numbers: result.numbers,
      difficulty: result.difficulty,
      wpm: result.wpm,
      raw_wpm: result.rawWpm,
      accuracy: result.accuracy,
      consistency: result.consistency,
      chars_correct: result.chars.correct,
      chars_incorrect: result.chars.incorrect,
      chars_extra: result.chars.extra,
      chars_missed: result.chars.missed,
      keystrokes: result.keystrokes,
      race_id: result.raceId,
    });
    if (error) throw new Error(error.message);

    await supabase().from('typing_samples').insert({
      test_id: result.id,
      wpm: result.samples.map((s) => Math.round(s.wpm)),
      raw: result.samples.map((s) => Math.round(s.raw)),
      errors: result.samples.map((s) => s.errors),
    });

    if (result.tallies.length > 0) {
      await supabase().from('typing_events').insert(
        result.tallies.map((t) => ({
          test_id: result.id,
          expected: t.expected,
          typed: t.typed,
          count: t.count,
        })),
      );
    }
    return { ...result, userId };
  }

  async listTests(userId: string, limit = 1000): Promise<TestResult[]> {
    const { data, error } = await supabase()
      .from('typing_tests')
      .select('*, typing_samples(wpm, raw, errors)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) =>
      toTest(row as Record<string, unknown>, (row as { typing_samples?: Record<string, number[]> }).typing_samples),
    );
  }

  async getTest(id: string): Promise<TestResult | null> {
    const { data } = await supabase()
      .from('typing_tests')
      .select('*, typing_samples(wpm, raw, errors), typing_events(expected, typed, count)')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    const test = toTest(data as Record<string, unknown>, (data as { typing_samples?: Record<string, number[]> }).typing_samples);
    const events = (data as { typing_events?: Array<{ expected: string; typed: string | null; count: number }> }).typing_events;
    return { ...test, tallies: events ?? [] };
  }

  async claimAnonymousTests(userId: string): Promise<number> {
    const held = JSON.parse(localStorage.getItem('baud:anon-tests') ?? '[]') as TestResult[];
    if (held.length === 0) return 0;
    for (const test of held) await this.saveTest({ ...test, userId });
    localStorage.removeItem('baud:anon-tests');
    return held.length;
  }

  // ---- social --------------------------------------------------------

  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const { data } = await supabase()
      .from('profiles')
      .select('*')
      .ilike('username', `%${q}%`)
      .limit(20);
    return (data ?? []).map((r) => toUser(r as ProfileRow));
  }

  async getProfileByUsername(username: string): Promise<User | null> {
    const { data } = await supabase()
      .from('profiles')
      .select('*')
      .eq('username', username.toLowerCase())
      .maybeSingle();
    return data ? toUser(data as ProfileRow) : null;
  }

  async getProfileById(id: string): Promise<User | null> {
    const { data } = await supabase().from('profiles').select('*').eq('id', id).maybeSingle();
    return data ? toUser(data as ProfileRow) : null;
  }

  async getProfileStats(userId: string): Promise<ProfileStats> {
    const tests = await this.listTests(userId);
    const valid = tests.filter(isScoreable);
    const { count: racesWon } = await supabase()
      .from('race_participants')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('place', 1);

    const base = {
      tests: tests.length,
      typingSeconds: tests.reduce((s, t) => s + t.durationS, 0),
      streak: streakDays(tests.map((t) => t.createdAt)),
      racesWon: racesWon ?? 0,
    };
    if (valid.length === 0) {
      return { ...base, bestWpm: 0, avgWpm: 0, avgAccuracy: 0, bestAccuracy: 0, bestConsistency: 0 };
    }
    const sum = (fn: (t: TestResult) => number) => valid.reduce((s, t) => s + fn(t), 0);
    return {
      ...base,
      bestWpm: Math.max(...valid.map((t) => t.wpm)),
      avgWpm: sum((t) => t.wpm) / valid.length,
      avgAccuracy: sum((t) => t.accuracy) / valid.length,
      bestAccuracy: Math.max(...valid.map((t) => t.accuracy)),
      bestConsistency: Math.max(...valid.map((t) => t.consistency)),
    };
  }

  async listFriends(userId: string): Promise<User[]> {
    const { data } = await supabase()
      .from('friendships')
      .select('user_a, user_b, a:profiles!friendships_user_a_fkey(*), b:profiles!friendships_user_b_fkey(*)')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);
    return (data ?? []).map((row) => {
      const r = row as unknown as { user_a: string; a: ProfileRow; b: ProfileRow };
      return toUser(r.user_a === userId ? r.b : r.a);
    });
  }

  async listFriendRequests(userId: string) {
    const { data } = await supabase()
      .from('friend_requests')
      .select('*')
      .eq('status', 'pending')
      .or(`from_user.eq.${userId},to_user.eq.${userId}`);
    const rows = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as string,
        fromUser: row.from_user as string,
        toUser: row.to_user as string,
        status: row.status as FriendRequest['status'],
        createdAt: new Date(row.created_at as string).getTime(),
      };
    });
    return {
      incoming: rows.filter((r) => r.toUser === userId),
      outgoing: rows.filter((r) => r.fromUser === userId),
    };
  }

  async sendFriendRequest(toUserId: string): Promise<void> {
    const me = await this.requireUser();
    if (me.id === toUserId) throw new Error('You cannot add yourself.');
    const { error } = await supabase()
      .from('friend_requests')
      .insert({ from_user: me.id, to_user: toUserId });
    if (error) throw new Error(error.message);
  }

  async respondToFriendRequest(requestId: string, accept: boolean): Promise<void> {
    // A security-definer function performs the accept: it flips the request and
    // writes the canonically ordered friendship row in one transaction.
    const { error } = await supabase().rpc('respond_to_friend_request', {
      p_request: requestId,
      p_accept: accept,
    });
    if (error) throw new Error(error.message);
  }

  async removeFriend(userId: string): Promise<void> {
    const me = await this.requireUser();
    const [a, b] = me.id < userId ? [me.id, userId] : [userId, me.id];
    const { error } = await supabase().from('friendships').delete().eq('user_a', a).eq('user_b', b);
    if (error) throw new Error(error.message);
  }

  // ---- races ---------------------------------------------------------

  async createRace(wordCount: number): Promise<Race> {
    const me = await this.requireUser();
    const { data, error } = await supabase()
      .from('races')
      .insert({ code: raceCode(), host_id: me.id, text_seed: randomSeed(), word_count: wordCount })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const race = toRace(data as Record<string, unknown>);
    await this.joinRace(race.id);
    return race;
  }

  async getRaceByCode(code: string): Promise<Race | null> {
    const { data } = await supabase()
      .from('races')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();
    return data ? toRace(data as Record<string, unknown>) : null;
  }

  async joinRace(raceId: string): Promise<RaceParticipant[]> {
    const me = await this.requireUser();
    const { error } = await supabase()
      .from('race_participants')
      .upsert({ race_id: raceId, user_id: me.id, left_at: null }, { onConflict: 'race_id,user_id' });
    if (error) throw new Error(error.message);
    return this.listRaceParticipants(raceId);
  }

  async listRaceParticipants(raceId: string): Promise<RaceParticipant[]> {
    const { data } = await supabase()
      .from('race_participants')
      .select('*, profiles(username, avatar_seed)')
      .eq('race_id', raceId)
      .order('joined_at');
    return (data ?? []).map((r) => toParticipant(r as Record<string, unknown>));
  }

  async saveRaceResult(raceId: string, patch: Partial<RaceParticipant>): Promise<void> {
    const me = await this.requireUser();
    // RLS restricts this update to the caller's own row and these columns only.
    await supabase()
      .from('race_participants')
      .update({
        ready: patch.ready,
        progress: patch.progress,
        wpm: patch.wpm,
        accuracy: patch.accuracy,
        finished_at: patch.finishedAt ? new Date(patch.finishedAt).toISOString() : undefined,
      })
      .eq('race_id', raceId)
      .eq('user_id', me.id);
  }

  async setRaceStatus(raceId: string, status: RaceStatus, startsAt?: number): Promise<void> {
    // Server-authoritative: only this function may write status/starts_at.
    const { error } = await supabase().rpc('set_race_status', {
      p_race: raceId,
      p_status: status,
      p_starts_at: startsAt ? new Date(startsAt).toISOString() : null,
    });
    if (error) throw new Error(error.message);
  }

  async listRaceHistory(userId: string, limit = 20) {
    const { data } = await supabase()
      .from('race_participants')
      .select('*, races(*), profiles(username, avatar_seed)')
      .eq('user_id', userId)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(limit);

    const out = [];
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const race = toRace(r.races as Record<string, unknown>);
      out.push({
        race,
        me: toParticipant(r),
        field: await this.listRaceParticipants(race.id),
      });
    }
    return out;
  }

  // ---- achievements --------------------------------------------------

  async listAchievements(userId: string) {
    const { data } = await supabase()
      .from('user_achievements')
      .select('key, earned_at')
      .eq('user_id', userId);
    return (data ?? []).map((r) => ({
      key: (r as { key: string }).key,
      earnedAt: new Date((r as { earned_at: string }).earned_at).getTime(),
    }));
  }

  async grantAchievements(userId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await supabase()
      .from('user_achievements')
      .upsert(keys.map((key) => ({ user_id: userId, key })), { onConflict: 'user_id,key' });
  }

  // ---- leaderboards --------------------------------------------------

  async leaderboard(
    period: LeaderboardPeriod,
    scope: LeaderboardScope,
    viewerId: string | null,
  ): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase().rpc('leaderboard', {
      p_period: period,
      p_scope: scope,
      p_viewer: viewerId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>, i: number) => ({
      rank: i + 1,
      previousRank: (row.previous_rank as number) ?? null,
      userId: row.user_id as string,
      username: row.username as string,
      avatarSeed: row.avatar_seed as string,
      wpm: Number(row.wpm),
      accuracy: Number(row.accuracy),
      tests: Number(row.tests),
    }));
  }

  private async requireUser(): Promise<User> {
    const user = await this.getSession();
    if (!user) throw new Error('Sign in to do that.');
    return user;
  }
}
