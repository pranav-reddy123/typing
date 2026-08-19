# Multiplayer

## Principles

1. **The transport is swappable, the protocol is not.** One event union
   (`src/lib/realtime/protocol.ts`) is spoken by every transport.
2. **Server-authoritative where it matters.** Race status, the countdown target
   timestamp, and finish order come from the server. Progress and live WPM are
   client-reported because they are cosmetic during the race and re-derived at the
   end.
3. **The text is derived, never transmitted.** All clients seed the same PRNG with
   `race.text_seed` and generate identical words.

## Transports

| Transport | Used when | Mechanism |
|---|---|---|
| `SupabaseTransport` | `VITE_SUPABASE_URL` is set | Realtime channel `race:{code}` - `broadcast` for events, `presence` for connection state |
| `BroadcastChannelTransport` | otherwise | `BroadcastChannel('baud:race:{code}')` - genuine cross-window message passing, plus a `localStorage` mirror so a window that joins late can replay current state |

Both implement:

```ts
interface RaceTransport {
  join(code: string, me: RacePlayer): Promise<void>;
  send(event: RaceEvent): void;
  subscribe(handler: (e: RaceEvent) => void): () => void;
  leave(): Promise<void>;
  readonly connection: 'connecting' | 'open' | 'reconnecting' | 'closed';
}
```

The BroadcastChannel transport is not a mock of multiplayer: two independent browser
windows, with no shared React tree and no shared store, exchange the same events in
the same order over a real message bus. Swapping in Supabase changes the transport
file and nothing else.

## Event model

```ts
type RaceEvent =
  | { t: 'PLAYER_JOINED';   player: RacePlayer; at: number }
  | { t: 'PLAYER_READY';    userId: string; ready: boolean; at: number }
  | { t: 'RACE_STARTED';    startsAt: number; at: number }
  | { t: 'PLAYER_PROGRESS'; userId: string; progress: number; wpm: number; accuracy: number; at: number }
  | { t: 'PLAYER_FINISHED'; userId: string; wpm: number; accuracy: number; finishedAt: number; at: number }
  | { t: 'RACE_FINISHED';   places: Array<{ userId: string; place: number }>; at: number }
  | { t: 'PLAYER_LEFT';     userId: string; at: number }
  | { t: 'STATE_REQUEST';   from: string; at: number }
  | { t: 'STATE_SNAPSHOT';  state: RaceState; at: number };
```

`STATE_REQUEST` / `STATE_SNAPSHOT` are the late-join and reconnect mechanism: a
client that opens a channel asks for the current state and the host answers. Without
this pair, a player joining 4 seconds late would see an empty lobby.

## State machine

```
        create/join
             |
             v
      +-------------+   all ready (>=2 players)   +-------------+
      |   lobby     |---------------------------->|  countdown  |
      +-------------+                              +-------------+
             ^                                            |
             | player leaves, <2 remain                   | startsAt reached
             |                                            v
             |                                     +-------------+
             |                                     |   running   |
             |                                     +-------------+
             |                                            |
             |            all finished OR 60s after first finisher
             |                                            v
             |                                     +-------------+
             +-------------------------------------|  finished   |
                          "race again"             +-------------+
```

`expired` is a terminal state entered when `expires_at` passes while still in lobby.

## The reducer

Every client runs the identical pure reducer:

```ts
function reduce(state: RaceState, event: RaceEvent): RaceState
```

It is pure, total, and order-tolerant: events carry an `at` timestamp and stale
progress events (`at` older than the last applied one for that player) are dropped.
This is what makes out-of-order delivery and duplicate events harmless.

The one transition the reducer cannot make is `countdown -> running`, because that
depends on the clock and the reducer is forbidden from reading it. `useRace`
performs it instead, comparing `now` against the absolute `startsAt` every client
already holds. No message is exchanged and every client flips at the same instant.

This matters more than it looks. An earlier version promoted the race to `running`
on the first `PLAYER_PROGRESS` event — but input is locked during the countdown, so
nobody could produce that event, and the race only ever started because the
transport's liveness heartbeat happened to send one. A start that depends on a
heartbeat is a start that intermittently does not happen.

## Edge cases and how each is handled

| Case | Handling |
|---|---|
| **Duplicate user** | Players are keyed by `userId`. A second `PLAYER_JOINED` for the same id replaces the entry; the composite PK enforces it server-side. Joining the same race in two tabs shows one player. |
| **Late join, lobby** | Allowed. `STATE_REQUEST` fetches the roster. |
| **Late join, running** | Rejected with "This race already started." plus a button to create a new one. Joining a race mid-run cannot produce a fair result. |
| **Disconnect** | Presence leave (or a 10 s progress heartbeat timeout) marks the player `disconnected`. Their row stays visible, greyed, so the remaining players see what happened rather than a player silently vanishing. |
| **Reconnect** | The transport retries with exponential backoff (0.5 s -> 8 s, jittered). On reopen the client sends `STATE_REQUEST` and resumes. The UI shows "Connection lost. Reconnecting..." and blocks nothing the user can still do offline. |
| **Host leaves** | Host is not special after `RACE_STARTED`. In the lobby, host migrates to the earliest-joined remaining player, who then answers `STATE_REQUEST`. |
| **Race expiration** | `expires_at` = created + 2 h. A lobby past expiry renders the expired state and offers to create a fresh race. |
| **Network latency** | The countdown is driven by an absolute `startsAt` timestamp, not a local counter, so a 300 ms-latency client still starts within one frame of everyone else. Clock skew is corrected by measuring the offset between the server's `at` and local receipt time. |
| **Stragglers** | The race ends 60 s after the first finisher. Unfinished players are placed by progress, not left hanging. |
| **Progress flood** | Progress is throttled to 4 Hz per client (every 250 ms) and only when the value actually changed - about 240 messages for a 60 s race per player, not 6 000. |

## Rendering the race without dropping frames

The live race screen has two independent halves:

- The **typing surface** runs the same zero-re-render engine as practice.
- The **track** re-renders only when a progress event arrives, at most 4 Hz, and
  each player row animates via a CSS `transform: scaleX()` transition. No layout
  animation, no per-frame React work.

Your own progress is written to your own row directly from the engine's tick, so
your bar never lags your typing even if the network stalls.
