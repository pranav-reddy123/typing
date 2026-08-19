import { Idb } from './idb';
import { hashPassword, verifyPassword } from './crypto';
import { isPlausibleResult, validateEmail, validatePassword, validateUsername } from './validate';
import { raceCode, randomSeed } from '../typing/rng';
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

interface Credential {
  userId: string;
  email: string;
  hash: string;
}

interface Friendship {
  pair: string; // `${a}|${b}` with a < b
  a: string;
  b: string;
  createdAt: number;
}

const SESSION_KEY = 'baud:session';
const CONFIG_KEY = 'baud:config';
const ANON_USER = '__anon__';

const db = new Idb('baud', 1, [
  { name: 'profiles', keyPath: 'id', indexes: [{ name: 'by_username', keyPath: 'username', unique: true }] },
  { name: 'credentials', keyPath: 'userId', indexes: [{ name: 'by_email', keyPath: 'email', unique: true }] },
  { name: 'tests', keyPath: 'id', indexes: [{ name: 'by_user', keyPath: 'userId' }] },
  { name: 'friendships', keyPath: 'pair', indexes: [{ name: 'by_a', keyPath: 'a' }, { name: 'by_b', keyPath: 'b' }] },
  { name: 'friend_requests', keyPath: 'id', indexes: [{ name: 'by_to', keyPath: 'toUser' }, { name: 'by_from', keyPath: 'fromUser' }] },
  { name: 'races', keyPath: 'id', indexes: [{ name: 'by_code', keyPath: 'code', unique: true }] },
  { name: 'race_participants', keyPath: ['raceId', 'userId'], indexes: [{ name: 'by_race', keyPath: 'raceId' }, { name: 'by_user', keyPath: 'userId' }] },
  { name: 'achievements', keyPath: ['userId', 'key'], indexes: [{ name: 'by_user', keyPath: 'userId' }] },
  { name: 'settings', keyPath: 'userId' },
]);

function pairKey(a: string, b: string): { pair: string; a: string; b: string } {
  const [x, y] = a < b ? [a, b] : [b, a];
  return { pair: `${x}|${y}`, a: x, b: y };
}

/**
 * IndexedDB-backed provider. Mirrors the Postgres schema field-for-field so the
 * Supabase provider is a drop-in replacement.
 */
export class LocalProvider implements DataProvider {
  readonly kind = 'local' as const;
  private current: User | null = null;
  private hydrated = false;

  // ---- auth ----------------------------------------------------------

  async signUp(email: string, username: string, password: string): Promise<AuthResult> {
    const uname = username.trim().toLowerCase();
    const mail = email.trim().toLowerCase();
    const problem = validateEmail(mail) ?? validateUsername(uname) ?? validatePassword(password);
    if (problem) return { user: null, error: problem };

    const existingName = await db.getAllByIndex<User>('profiles', 'by_username', uname);
    if (existingName.length > 0) return { user: null, error: 'That username is taken.' };
    const existingMail = await db.getAllByIndex<Credential>('credentials', 'by_email', mail);
    if (existingMail.length > 0) return { user: null, error: 'An account already uses that email.' };

    const user: User = {
      id: crypto.randomUUID(),
      username: uname,
      displayName: uname,
      bio: '',
      avatarSeed: randomSeed(),
      createdAt: Date.now(),
    };
    await db.put('profiles', user);
    await db.put<Credential>('credentials', {
      userId: user.id,
      email: mail,
      hash: await hashPassword(password),
    });
    this.setSession(user);
    await this.claimAnonymousTests(user.id);
    return { user, error: null };
  }

  async signIn(identifier: string, password: string): Promise<AuthResult> {
    const id = identifier.trim().toLowerCase();
    let cred: Credential | undefined;

    if (id.includes('@')) {
      cred = (await db.getAllByIndex<Credential>('credentials', 'by_email', id))[0];
    } else {
      const profile = (await db.getAllByIndex<User>('profiles', 'by_username', id))[0];
      if (profile) cred = await db.get<Credential>('credentials', profile.id);
    }

    if (!cred || !(await verifyPassword(password, cred.hash))) {
      // Deliberately identical message for both cases — do not reveal which
      // half of the credential was wrong.
      return { user: null, error: 'Those credentials do not match an account.' };
    }

    const user = await db.get<User>('profiles', cred.userId);
    if (!user) return { user: null, error: 'Those credentials do not match an account.' };
    this.setSession(user);
    await this.claimAnonymousTests(user.id);
    return { user, error: null };
  }

  async signOut(): Promise<void> {
    this.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  async getSession(): Promise<User | null> {
    if (this.hydrated) return this.current;
    this.hydrated = true;
    // Tab-scoped session first, browser-scoped as the fallback. A new tab
    // inherits your session; a tab that signs in as someone else keeps that
    // account to itself, which is also what lets two accounts share one browser
    // during a race.
    const id = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    this.current = (await db.get<User>('profiles', id)) ?? null;
    return this.current;
  }

  async updateProfile(patch: Partial<Pick<User, 'displayName' | 'bio' | 'avatarSeed'>>): Promise<User> {
    const me = await this.requireUser();
    const next: User = { ...me, ...patch };
    await db.put('profiles', next);
    this.setSession(next);
    return next;
  }

  async deleteAccount(): Promise<void> {
    const me = await this.requireUser();
    const tests = await db.getAllByIndex<TestResult>('tests', 'by_user', me.id);
    for (const t of tests) await db.delete('tests', t.id);
    await db.delete('credentials', me.id);
    await db.delete('profiles', me.id);
    await db.delete('settings', me.id);
    await this.signOut();
  }

  // ---- preferences ---------------------------------------------------

  async getConfig(): Promise<TestConfig | null> {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TestConfig;
    } catch {
      return null;
    }
  }

  async setConfig(config: TestConfig): Promise<void> {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (this.current) await db.put('settings', { userId: this.current.id, config });
  }

  // ---- tests ---------------------------------------------------------

  async saveTest(result: TestResult): Promise<TestResult> {
    if (!isPlausibleResult(result)) {
      throw new Error('That result failed validation and was not saved.');
    }
    const record: TestResult = { ...result, userId: this.current?.id ?? ANON_USER };
    await db.put('tests', record);
    return record;
  }

  async listTests(userId: string, limit = 1000): Promise<TestResult[]> {
    const all = await db.getAllByIndex<TestResult>('tests', 'by_user', userId);
    return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async getTest(id: string): Promise<TestResult | null> {
    return (await db.get<TestResult>('tests', id)) ?? null;
  }

  async claimAnonymousTests(userId: string): Promise<number> {
    const orphans = await db.getAllByIndex<TestResult>('tests', 'by_user', ANON_USER);
    if (orphans.length === 0) return 0;
    await db.putMany('tests', orphans.map((t) => ({ ...t, userId })));
    return orphans.length;
  }

  // ---- social --------------------------------------------------------

  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const all = await db.getAll<User>('profiles');
    return all
      .filter((u) => u.username.includes(q) || u.displayName.toLowerCase().includes(q))
      .filter((u) => u.id !== this.current?.id)
      .slice(0, 20);
  }

  async getProfileByUsername(username: string): Promise<User | null> {
    const found = await db.getAllByIndex<User>('profiles', 'by_username', username.toLowerCase());
    return found[0] ?? null;
  }

  async getProfileById(id: string): Promise<User | null> {
    return (await db.get<User>('profiles', id)) ?? null;
  }

  async getProfileStats(userId: string): Promise<ProfileStats> {
    const tests = await this.listTests(userId);
    const valid = tests.filter(isScoreable);
    const races = await db.getAllByIndex<RaceParticipant>('race_participants', 'by_user', userId);

    if (valid.length === 0) {
      return {
        tests: tests.length,
        bestWpm: 0,
        avgWpm: 0,
        avgAccuracy: 0,
        bestAccuracy: 0,
        bestConsistency: 0,
        typingSeconds: tests.reduce((s, t) => s + t.durationS, 0),
        streak: 0,
        racesWon: races.filter((r) => r.place === 1).length,
      };
    }

    const sum = (fn: (t: TestResult) => number) => valid.reduce((s, t) => s + fn(t), 0);
    return {
      tests: tests.length,
      bestWpm: Math.max(...valid.map((t) => t.wpm)),
      avgWpm: sum((t) => t.wpm) / valid.length,
      avgAccuracy: sum((t) => t.accuracy) / valid.length,
      bestAccuracy: Math.max(...valid.map((t) => t.accuracy)),
      bestConsistency: Math.max(...valid.map((t) => t.consistency)),
      typingSeconds: tests.reduce((s, t) => s + t.durationS, 0),
      streak: streakDays(tests.map((t) => t.createdAt)),
      racesWon: races.filter((r) => r.place === 1).length,
    };
  }

  async listFriends(userId: string): Promise<User[]> {
    const asA = await db.getAllByIndex<Friendship>('friendships', 'by_a', userId);
    const asB = await db.getAllByIndex<Friendship>('friendships', 'by_b', userId);
    const ids = [...asA.map((f) => f.b), ...asB.map((f) => f.a)];
    const users = await Promise.all(ids.map((id) => db.get<User>('profiles', id)));
    return users.filter((u): u is User => Boolean(u));
  }

  async listFriendRequests(userId: string) {
    const incoming = (await db.getAllByIndex<FriendRequest>('friend_requests', 'by_to', userId))
      .filter((r) => r.status === 'pending');
    const outgoing = (await db.getAllByIndex<FriendRequest>('friend_requests', 'by_from', userId))
      .filter((r) => r.status === 'pending');
    return { incoming, outgoing };
  }

  async sendFriendRequest(toUserId: string): Promise<void> {
    const me = await this.requireUser();
    if (toUserId === me.id) throw new Error('You cannot add yourself.');

    const existing = await db.get<Friendship>('friendships', pairKey(me.id, toUserId).pair);
    if (existing) throw new Error('You are already friends.');

    const outgoing = await db.getAllByIndex<FriendRequest>('friend_requests', 'by_from', me.id);
    if (outgoing.some((r) => r.toUser === toUserId && r.status === 'pending')) {
      throw new Error('You already sent a request to this person.');
    }

    // If they already asked you, accept instead of creating a mirrored request.
    const incoming = await db.getAllByIndex<FriendRequest>('friend_requests', 'by_to', me.id);
    const theirs = incoming.find((r) => r.fromUser === toUserId && r.status === 'pending');
    if (theirs) {
      await this.respondToFriendRequest(theirs.id, true);
      return;
    }

    await db.put<FriendRequest>('friend_requests', {
      id: crypto.randomUUID(),
      fromUser: me.id,
      toUser: toUserId,
      status: 'pending',
      createdAt: Date.now(),
    });
  }

  async respondToFriendRequest(requestId: string, accept: boolean): Promise<void> {
    const me = await this.requireUser();
    const req = await db.get<FriendRequest>('friend_requests', requestId);
    if (!req) throw new Error('That request no longer exists.');
    if (req.toUser !== me.id) throw new Error('That request is not addressed to you.');

    await db.put<FriendRequest>('friend_requests', {
      ...req,
      status: accept ? 'accepted' : 'declined',
    });
    if (accept) {
      const key = pairKey(req.fromUser, req.toUser);
      await db.put<Friendship>('friendships', { ...key, createdAt: Date.now() });
    }
  }

  async removeFriend(userId: string): Promise<void> {
    const me = await this.requireUser();
    await db.delete('friendships', pairKey(me.id, userId).pair);
  }

  // ---- races ---------------------------------------------------------

  async createRace(wordCount: number): Promise<Race> {
    const me = await this.requireUser();
    const race: Race = {
      id: crypto.randomUUID(),
      code: raceCode(),
      hostId: me.id,
      textSeed: randomSeed(),
      wordCount,
      status: 'lobby',
      startsAt: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    };
    await db.put('races', race);
    await this.joinRace(race.id);
    return race;
  }

  async getRaceByCode(code: string): Promise<Race | null> {
    const found = await db.getAllByIndex<Race>('races', 'by_code', code.toUpperCase());
    const race = found[0];
    if (!race) return null;
    if (race.status === 'lobby' && Date.now() > race.expiresAt) {
      const expired: Race = { ...race, status: 'expired' };
      await db.put('races', expired);
      return expired;
    }
    return race;
  }

  async joinRace(raceId: string): Promise<RaceParticipant[]> {
    const me = await this.requireUser();
    const existing = await db.get<RaceParticipant>('race_participants', [raceId, me.id]);
    // Composite key: a second join is an upsert, never a duplicate player.
    await db.put<RaceParticipant>('race_participants', {
      raceId,
      userId: me.id,
      username: me.username,
      avatarSeed: me.avatarSeed,
      ready: existing?.ready ?? false,
      progress: existing?.progress ?? 0,
      wpm: existing?.wpm ?? 0,
      accuracy: existing?.accuracy ?? 0,
      finishedAt: existing?.finishedAt ?? null,
      place: existing?.place ?? null,
      connected: true,
      joinedAt: existing?.joinedAt ?? Date.now(),
    });
    return this.listRaceParticipants(raceId);
  }

  async listRaceParticipants(raceId: string): Promise<RaceParticipant[]> {
    const all = await db.getAllByIndex<RaceParticipant>('race_participants', 'by_race', raceId);
    return all.sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async saveRaceResult(raceId: string, patch: Partial<RaceParticipant>): Promise<void> {
    const me = await this.requireUser();
    const existing = await db.get<RaceParticipant>('race_participants', [raceId, me.id]);
    if (!existing) return;
    await db.put<RaceParticipant>('race_participants', { ...existing, ...patch });
  }

  async setRaceStatus(raceId: string, status: RaceStatus, startsAt?: number): Promise<void> {
    const race = await db.get<Race>('races', raceId);
    if (!race) return;
    await db.put<Race>('races', { ...race, status, startsAt: startsAt ?? race.startsAt });
  }

  async listRaceHistory(userId: string, limit = 20) {
    const mine = await db.getAllByIndex<RaceParticipant>('race_participants', 'by_user', userId);
    const finished = mine.filter((p) => p.finishedAt !== null).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    const out = [];
    for (const me of finished.slice(0, limit)) {
      const race = await db.get<Race>('races', me.raceId);
      if (!race) continue;
      out.push({ race, me, field: await this.listRaceParticipants(me.raceId) });
    }
    return out;
  }

  // ---- achievements --------------------------------------------------

  async listAchievements(userId: string) {
    const rows = await db.getAllByIndex<{ userId: string; key: string; earnedAt: number }>(
      'achievements',
      'by_user',
      userId,
    );
    return rows.map((r) => ({ key: r.key, earnedAt: r.earnedAt }));
  }

  async grantAchievements(userId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await db.putMany(
      'achievements',
      keys.map((key) => ({ userId, key, earnedAt: Date.now() })),
    );
  }

  // ---- leaderboards --------------------------------------------------

  async leaderboard(
    period: LeaderboardPeriod,
    scope: LeaderboardScope,
    viewerId: string | null,
  ): Promise<LeaderboardEntry[]> {
    const since =
      period === 'weekly'
        ? Date.now() - 7 * 864e5
        : period === 'monthly'
          ? Date.now() - 30 * 864e5
          : 0;

    let profiles = await db.getAll<User>('profiles');
    if (scope === 'friends' && viewerId) {
      const friends = await this.listFriends(viewerId);
      const allowed = new Set([viewerId, ...friends.map((f) => f.id)]);
      profiles = profiles.filter((p) => allowed.has(p.id));
    }

    const rows: Array<Omit<LeaderboardEntry, 'rank' | 'previousRank'> & { prevBest: number }> = [];
    for (const p of profiles) {
      const tests = (await this.listTests(p.id)).filter(
        (t) => t.createdAt >= since && isScoreable(t),
      );
      if (tests.length === 0) continue;
      const best = tests.reduce((a, t) => (t.wpm > a.wpm ? t : a));
      const priorWindow = (await this.listTests(p.id)).filter(
        (t) => since > 0 && t.createdAt < since && t.createdAt >= since - (Date.now() - since),
      );
      rows.push({
        userId: p.id,
        username: p.username,
        avatarSeed: p.avatarSeed,
        wpm: best.wpm,
        accuracy: best.accuracy,
        tests: tests.length,
        prevBest: priorWindow.length ? Math.max(...priorWindow.map((t) => t.wpm)) : 0,
      });
    }

    rows.sort((a, b) => b.wpm - a.wpm);
    const previousOrder = [...rows].sort((a, b) => b.prevBest - a.prevBest);

    return rows.map((r, i) => {
      const prevIndex = previousOrder.findIndex((p) => p.userId === r.userId);
      return {
        rank: i + 1,
        previousRank: r.prevBest > 0 ? prevIndex + 1 : null,
        userId: r.userId,
        username: r.username,
        avatarSeed: r.avatarSeed,
        wpm: r.wpm,
        accuracy: r.accuracy,
        tests: r.tests,
      };
    });
  }

  // ---- internals -----------------------------------------------------

  private setSession(user: User): void {
    this.current = user;
    this.hydrated = true;
    sessionStorage.setItem(SESSION_KEY, user.id);
    localStorage.setItem(SESSION_KEY, user.id);
  }

  private async requireUser(): Promise<User> {
    const user = await this.getSession();
    if (!user) throw new Error('Sign in to do that.');
    return user;
  }
}

/** Consecutive local calendar days ending today or yesterday. */
export function streakDays(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const days = new Set(timestamps.map((t) => new Date(t).toDateString()));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
