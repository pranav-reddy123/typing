import type { RaceStatus } from '../data/types';

export interface RacePlayer {
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
  lastSeen: number;
  joinedAt: number;
}

export interface RaceState {
  code: string;
  status: RaceStatus;
  startsAt: number | null;
  hostId: string | null;
  players: Record<string, RacePlayer>;
}

export type RaceEvent =
  | { t: 'PLAYER_JOINED'; player: RacePlayer; at: number }
  | { t: 'PLAYER_READY'; userId: string; ready: boolean; at: number }
  | { t: 'RACE_STARTED'; startsAt: number; at: number }
  | { t: 'PLAYER_PROGRESS'; userId: string; progress: number; wpm: number; accuracy: number; at: number }
  | { t: 'PLAYER_FINISHED'; userId: string; wpm: number; accuracy: number; finishedAt: number; at: number }
  | { t: 'RACE_FINISHED'; places: Array<{ userId: string; place: number }>; at: number }
  | { t: 'PLAYER_LEFT'; userId: string; at: number }
  | { t: 'STATE_REQUEST'; from: string; at: number }
  | { t: 'STATE_SNAPSHOT'; state: RaceState; at: number };

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RaceTransport {
  readonly connection: ConnectionState;
  join(code: string, me: RacePlayer): Promise<void>;
  send(event: RaceEvent): void;
  subscribe(handler: (event: RaceEvent) => void): () => void;
  onConnection(handler: (state: ConnectionState) => void): () => void;
  leave(): Promise<void>;
}

export function emptyState(code: string): RaceState {
  return { code, status: 'lobby', startsAt: null, hostId: null, players: {} };
}

/**
 * The reducer every client runs. Pure, total, and order-tolerant: each event
 * carries `at`, and an update older than the last one applied for that player is
 * discarded. That is what makes duplicate and out-of-order delivery harmless.
 */
export function reduce(state: RaceState, event: RaceEvent): RaceState {
  switch (event.t) {
    case 'PLAYER_JOINED': {
      const existing = state.players[event.player.userId];
      // Keyed by userId: rejoining from a second tab updates, never duplicates.
      const player: RacePlayer = existing
        ? { ...existing, ...event.player, connected: true, lastSeen: event.at }
        : { ...event.player, connected: true, lastSeen: event.at };
      return {
        ...state,
        hostId: state.hostId ?? player.userId,
        players: { ...state.players, [player.userId]: player },
      };
    }

    case 'PLAYER_READY': {
      const player = state.players[event.userId];
      if (!player) return state;
      return {
        ...state,
        players: {
          ...state.players,
          [event.userId]: { ...player, ready: event.ready, lastSeen: event.at },
        },
      };
    }

    case 'RACE_STARTED':
      if (state.status === 'running' || state.status === 'finished') return state;
      return { ...state, status: 'countdown', startsAt: event.startsAt };

    case 'PLAYER_PROGRESS': {
      const player = state.players[event.userId];
      if (!player) return state;
      if (event.at < player.lastSeen) return state; // stale
      if (player.finishedAt !== null) return state;
      return {
        ...state,
        status: state.status === 'countdown' ? 'running' : state.status,
        players: {
          ...state.players,
          [event.userId]: {
            ...player,
            progress: event.progress,
            wpm: event.wpm,
            accuracy: event.accuracy,
            connected: true,
            lastSeen: event.at,
          },
        },
      };
    }

    case 'PLAYER_FINISHED': {
      const player = state.players[event.userId];
      if (!player || player.finishedAt !== null) return state;
      const alreadyFinished = Object.values(state.players).filter((p) => p.finishedAt !== null).length;
      return {
        ...state,
        players: {
          ...state.players,
          [event.userId]: {
            ...player,
            progress: 100,
            wpm: event.wpm,
            accuracy: event.accuracy,
            finishedAt: event.finishedAt,
            place: alreadyFinished + 1,
            lastSeen: event.at,
          },
        },
      };
    }

    case 'RACE_FINISHED': {
      const players = { ...state.players };
      for (const { userId, place } of event.places) {
        const p = players[userId];
        if (p) players[userId] = { ...p, place };
      }
      return { ...state, status: 'finished', players };
    }

    case 'PLAYER_LEFT': {
      const player = state.players[event.userId];
      if (!player) return state;
      // In the lobby a leaver is removed; mid-race they stay visible but greyed,
      // so the field can see what happened instead of a player vanishing.
      if (state.status === 'lobby') {
        const players = { ...state.players };
        delete players[event.userId];
        const remaining = Object.values(players).sort((a, b) => a.joinedAt - b.joinedAt);
        return {
          ...state,
          players,
          hostId: state.hostId === event.userId ? (remaining[0]?.userId ?? null) : state.hostId,
        };
      }
      return {
        ...state,
        players: { ...state.players, [event.userId]: { ...player, connected: false } },
      };
    }

    case 'STATE_SNAPSHOT':
      // Merge rather than replace: our own local progress is fresher than a
      // snapshot that crossed the network.
      return {
        ...event.state,
        players: { ...event.state.players, ...pickFresher(state.players, event.state.players) },
      };

    case 'STATE_REQUEST':
      return state;

    default:
      return state;
  }
}

function pickFresher(
  mine: Record<string, RacePlayer>,
  theirs: Record<string, RacePlayer>,
): Record<string, RacePlayer> {
  const out: Record<string, RacePlayer> = {};
  for (const [id, player] of Object.entries(mine)) {
    const other = theirs[id];
    if (!other || player.lastSeen > other.lastSeen) out[id] = player;
  }
  return out;
}

export function racePlaces(state: RaceState): Array<{ userId: string; place: number }> {
  return Object.values(state.players)
    .slice()
    .sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
      if (a.finishedAt !== null) return -1;
      if (b.finishedAt !== null) return 1;
      return b.progress - a.progress;
    })
    .map((p, i) => ({ userId: p.userId, place: i + 1 }));
}
