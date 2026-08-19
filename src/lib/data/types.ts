import type { TestConfig, TestResult } from '../typing/types';

export interface User {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarSeed: string;
  createdAt: number;
}

export interface FriendRequest {
  id: string;
  fromUser: string;
  toUser: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export type RaceStatus = 'lobby' | 'countdown' | 'running' | 'finished' | 'expired';

export interface Race {
  id: string;
  code: string;
  hostId: string;
  textSeed: string;
  wordCount: number;
  status: RaceStatus;
  startsAt: number | null;
  createdAt: number;
  expiresAt: number;
}

export interface RaceParticipant {
  raceId: string;
  userId: string;
  username: string;
  avatarSeed: string;
  ready: boolean;
  progress: number;
  wpm: number;
  accuracy: number;
  finishedAt: number | null;
  place: number | null;
  connected: boolean;
  joinedAt: number;
}

export interface ProfileStats {
  tests: number;
  bestWpm: number;
  avgWpm: number;
  avgAccuracy: number;
  bestAccuracy: number;
  bestConsistency: number;
  typingSeconds: number;
  streak: number;
  racesWon: number;
}

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'alltime';
export type LeaderboardScope = 'global' | 'friends';

export interface LeaderboardEntry {
  rank: number;
  previousRank: number | null;
  userId: string;
  username: string;
  avatarSeed: string;
  wpm: number;
  accuracy: number;
  tests: number;
}

export interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Every persistence and network concern in the product passes through this
 * interface. Two implementations exist: IndexedDB (`LocalProvider`) and Supabase
 * (`SupabaseProvider`). Nothing above this layer knows which is in use.
 */
export interface DataProvider {
  readonly kind: 'local' | 'supabase';

  // auth
  signUp(email: string, username: string, password: string): Promise<AuthResult>;
  signIn(identifier: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getSession(): Promise<User | null>;
  updateProfile(patch: Partial<Pick<User, 'displayName' | 'bio' | 'avatarSeed'>>): Promise<User>;
  deleteAccount(): Promise<void>;

  // preferences
  getConfig(): Promise<TestConfig | null>;
  setConfig(config: TestConfig): Promise<void>;

  // tests
  saveTest(result: TestResult): Promise<TestResult>;
  listTests(userId: string, limit?: number): Promise<TestResult[]>;
  getTest(id: string): Promise<TestResult | null>;
  /** Tests taken before signing in, migrated into the account on first login. */
  claimAnonymousTests(userId: string): Promise<number>;

  // social
  searchUsers(query: string): Promise<User[]>;
  getProfileByUsername(username: string): Promise<User | null>;
  getProfileById(id: string): Promise<User | null>;
  getProfileStats(userId: string): Promise<ProfileStats>;
  listFriends(userId: string): Promise<User[]>;
  listFriendRequests(userId: string): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>;
  sendFriendRequest(toUserId: string): Promise<void>;
  respondToFriendRequest(requestId: string, accept: boolean): Promise<void>;
  removeFriend(userId: string): Promise<void>;

  // races
  createRace(wordCount: number): Promise<Race>;
  getRaceByCode(code: string): Promise<Race | null>;
  joinRace(raceId: string): Promise<RaceParticipant[]>;
  listRaceParticipants(raceId: string): Promise<RaceParticipant[]>;
  saveRaceResult(raceId: string, participant: Partial<RaceParticipant>): Promise<void>;
  setRaceStatus(raceId: string, status: RaceStatus, startsAt?: number): Promise<void>;
  listRaceHistory(userId: string, limit?: number): Promise<Array<{ race: Race; me: RaceParticipant; field: RaceParticipant[] }>>;

  // achievements
  listAchievements(userId: string): Promise<Array<{ key: string; earnedAt: number }>>;
  grantAchievements(userId: string, keys: string[]): Promise<void>;

  // leaderboards
  leaderboard(
    period: LeaderboardPeriod,
    scope: LeaderboardScope,
    viewerId: string | null,
  ): Promise<LeaderboardEntry[]>;
}
