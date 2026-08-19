import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTransport } from '@/lib/realtime';
import {
  emptyState,
  racePlaces,
  reduce,
  type ConnectionState,
  type RaceEvent,
  type RacePlayer,
  type RaceState,
  type RaceTransport,
} from '@/lib/realtime/protocol';
import { data } from '@/lib/data';
import type { Race } from '@/lib/data/types';
import type { User } from '@/lib/data/types';

/** Seconds between the last player readying up and the start of the race. */
const COUNTDOWN_MS = 4000;
/** How long the race runs on after the first player finishes. */
const STRAGGLER_MS = 60_000;
/** No more than four progress messages per second, per player. */
const PROGRESS_INTERVAL_MS = 250;
const DISCONNECT_AFTER_MS = 12_000;

export type RaceLoad =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'closed' }
  | { status: 'ready'; race: Race };

export interface UseRace {
  load: RaceLoad;
  state: RaceState;
  connection: ConnectionState;
  me: RacePlayer | null;
  isHost: boolean;
  countdownMs: number | null;
  setReady: (ready: boolean) => void;
  reportProgress: (progress: number, wpm: number, accuracy: number) => void;
  reportFinished: (wpm: number, accuracy: number) => void;
  leave: () => void;
}

export function useRace(code: string, user: User | null): UseRace {
  const [load, setLoad] = useState<RaceLoad>({ status: 'loading' });
  const [state, setState] = useState<RaceState>(() => emptyState(code));
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [now, setNow] = useState(() => Date.now());

  const transportRef = useRef<RaceTransport | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastProgress = useRef(0);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);

  const dispatch = useCallback((event: RaceEvent) => {
    setState((current) => reduce(current, event));
  }, []);

  /* ---- connect ------------------------------------------------------- */

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let transport: RaceTransport | null = null;

    void (async () => {
      const race = await data().getRaceByCode(code);
      if (cancelled) return;

      if (!race) {
        setLoad({ status: 'missing' });
        return;
      }
      if (race.status === 'expired') {
        setLoad({ status: 'expired' });
        return;
      }
      // A race already under way cannot be joined fairly.
      const alreadyIn = (await data().listRaceParticipants(race.id)).some((p) => p.userId === user.id);
      if ((race.status === 'running' || race.status === 'countdown') && !alreadyIn) {
        setLoad({ status: 'closed' });
        return;
      }

      await data().joinRace(race.id);
      if (cancelled) return;
      setLoad({ status: 'ready', race });

      const me: RacePlayer = {
        userId: user.id,
        username: user.username,
        avatarSeed: user.avatarSeed,
        ready: false,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finishedAt: null,
        place: null,
        connected: true,
        lastSeen: Date.now(),
        joinedAt: Date.now(),
      };

      // Seed local state from the durable record so a solo reload is not blank.
      const roster = await data().listRaceParticipants(race.id);
      setState((current) => {
        let next: RaceState = { ...current, hostId: race.hostId, status: race.status };
        for (const p of roster) {
          next = reduce(next, {
            t: 'PLAYER_JOINED',
            at: p.joinedAt,
            player: { ...p, lastSeen: p.joinedAt },
          });
        }
        return next;
      });

      transport = await createTransport();
      if (cancelled) {
        void transport.leave();
        return;
      }
      transportRef.current = transport;
      transport.onConnection(setConnection);
      transport.subscribe((event) => {
        dispatch(event);
        // The host is the authority for late joiners.
        if (event.t === 'STATE_REQUEST' && stateRef.current.hostId === user.id) {
          transportRef.current?.send({ t: 'STATE_SNAPSHOT', state: stateRef.current, at: Date.now() });
        }
      });
      await transport.join(code, me);
    })();

    return () => {
      cancelled = true;
      void transport?.leave();
      transportRef.current = null;
    };
  }, [code, user, dispatch]);

  /* ---- clock --------------------------------------------------------- */

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const me = user ? (state.players[user.id] ?? null) : null;
  const isHost = Boolean(user && state.hostId === user.id);

  /* ---- host duties: start, finish, disconnect detection --------------- */

  useEffect(() => {
    if (!isHost || load.status !== 'ready') return;
    const players = Object.values(state.players);

    if (
      state.status === 'lobby' &&
      players.length >= 2 &&
      players.every((p) => p.ready) &&
      !startedRef.current
    ) {
      startedRef.current = true;
      const startsAt = Date.now() + COUNTDOWN_MS;
      transportRef.current?.send({ t: 'RACE_STARTED', startsAt, at: Date.now() });
      dispatch({ t: 'RACE_STARTED', startsAt, at: Date.now() });
      void data().setRaceStatus(load.race.id, 'running', startsAt);
    }

    if (state.status === 'running' && !finishedRef.current) {
      const finishers = players.filter((p) => p.finishedAt !== null);
      const first = finishers.length > 0 ? Math.min(...finishers.map((p) => p.finishedAt!)) : null;
      const everyoneDone = players.every((p) => p.finishedAt !== null || !p.connected);
      const strandedTooLong = first !== null && now - first > STRAGGLER_MS;

      if ((everyoneDone && finishers.length > 0) || strandedTooLong) {
        finishedRef.current = true;
        const places = racePlaces(state);
        transportRef.current?.send({ t: 'RACE_FINISHED', places, at: Date.now() });
        dispatch({ t: 'RACE_FINISHED', places, at: Date.now() });
        void data().setRaceStatus(load.race.id, 'finished');
      }
    }
  }, [isHost, load, state, now, dispatch]);

  /* ---- countdown ------------------------------------------------------ */

  const countdownMs = useMemo(() => {
    if (state.startsAt === null) return null;
    if (state.status === 'finished') return null;
    const remaining = state.startsAt - now;
    return remaining > 0 ? remaining : null;
  }, [state.startsAt, state.status, now]);

  /**
   * Promote countdown -> running when the clock passes `startsAt`.
   *
   * This has to live here rather than in the reducer, which is forbidden from
   * reading the clock. Every client holds the same absolute `startsAt`, so every
   * client flips at the same instant with no message exchanged — and the race no
   * longer depends on someone's progress event arriving to get started, which it
   * could not do while input was still locked.
   */
  useEffect(() => {
    if (state.status !== 'countdown') return;
    if (state.startsAt === null || now < state.startsAt) return;
    setState((current) =>
      current.status === 'countdown' ? { ...current, status: 'running' } : current,
    );
  }, [state.status, state.startsAt, now]);

  /* ---- outbound ------------------------------------------------------- */

  const setReady = useCallback(
    (ready: boolean) => {
      if (!user) return;
      const event: RaceEvent = { t: 'PLAYER_READY', userId: user.id, ready, at: Date.now() };
      transportRef.current?.send(event);
      dispatch(event);
      if (load.status === 'ready') void data().saveRaceResult(load.race.id, { ready });
    },
    [user, dispatch, load],
  );

  const reportProgress = useCallback(
    (progress: number, wpm: number, accuracy: number) => {
      if (!user) return;
      const stamp = Date.now();
      // Throttled to 4 Hz: ~240 messages per player for a 60 s race, not 6 000.
      if (stamp - lastProgress.current < PROGRESS_INTERVAL_MS) return;
      lastProgress.current = stamp;
      const event: RaceEvent = {
        t: 'PLAYER_PROGRESS',
        userId: user.id,
        progress: Math.round(progress),
        wpm: Math.round(wpm),
        accuracy: Math.round(accuracy),
        at: stamp,
      };
      transportRef.current?.send(event);
      dispatch(event);
    },
    [user, dispatch],
  );

  const reportFinished = useCallback(
    (wpm: number, accuracy: number) => {
      if (!user) return;
      const finishedAt = Date.now();
      const event: RaceEvent = {
        t: 'PLAYER_FINISHED',
        userId: user.id,
        wpm,
        accuracy,
        finishedAt,
        at: finishedAt,
      };
      transportRef.current?.send(event);
      dispatch(event);
      if (load.status === 'ready') {
        void data().saveRaceResult(load.race.id, { wpm, accuracy, progress: 100, finishedAt });
      }
    },
    [user, dispatch, load],
  );

  const leave = useCallback(() => {
    void transportRef.current?.leave();
  }, []);

  /* ---- mark silent players as disconnected ---------------------------- */

  useEffect(() => {
    if (state.status !== 'running') return;
    for (const player of Object.values(state.players)) {
      if (player.userId === user?.id) continue;
      if (player.finishedAt !== null || !player.connected) continue;
      if (now - player.lastSeen > DISCONNECT_AFTER_MS) {
        dispatch({ t: 'PLAYER_LEFT', userId: player.userId, at: now });
      }
    }
  }, [now, state, user, dispatch]);

  // Memoised: consumers put these into effect dependency lists, and a fresh
  // object every render would re-run them four times a second.
  return useMemo(
    () => ({
      load,
      state,
      connection,
      me,
      isHost,
      countdownMs,
      setReady,
      reportProgress,
      reportFinished,
      leave,
    }),
    [
      load,
      state,
      connection,
      me,
      isHost,
      countdownMs,
      setReady,
      reportProgress,
      reportFinished,
      leave,
    ],
  );
}
