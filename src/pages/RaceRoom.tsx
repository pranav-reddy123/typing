import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, EmptyState, LinkButton, LoadingRows, Stat, Tag, cn } from '@/components/ui';
import { RaceTrack } from '@/components/race/RaceTrack';
import { TypingSurface } from '@/components/typing/TypingSurface';
import { useCopy, useDocumentTitle } from '@/hooks';
import { useRace } from '@/hooks/useRace';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import { data } from '@/lib/data';
import { DEFAULT_CONFIG, type TestResult } from '@/lib/typing/types';
import type { LiveMetrics } from '@/lib/typing/engine';

export default function RaceRoom() {
  const { code = '' } = useParams();
  useDocumentTitle(`Race ${code} — Baud`);
  const user = useSession((s) => s.user);
  const race = useRace(code.toUpperCase(), user);
  const [copied, copy] = useCopy();

  const players = useMemo(() => Object.values(race.state.players), [race.state.players]);
  const finishedRef = useRef(false);

  const config = useMemo(
    () =>
      race.load.status === 'ready'
        ? { ...DEFAULT_CONFIG, mode: 'words' as const, target: race.load.race.wordCount }
        : DEFAULT_CONFIG,
    [race.load],
  );

  const { reportProgress, reportFinished } = race;

  const onProgress = useCallback(
    (m: LiveMetrics) => {
      reportProgress(m.progress * 100, m.wpm, m.accuracy);
    },
    [reportProgress],
  );

  const onFinish = useCallback(
    async (result: TestResult) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      reportFinished(result.wpm, result.accuracy);
      try {
        await data().saveTest({
          ...result,
          raceId: race.load.status === 'ready' ? race.load.race.id : null,
        });
      } catch {
        toast.error('Your race result could not be saved to your history.');
      }
    },
    [reportFinished, race.load],
  );

  const shareLink = `${window.location.origin}/race/${code.toUpperCase()}`;

  useEffect(() => () => race.leave(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (race.load.status === 'loading') {
    return (
      <div className="measure px-4 py-12 sm:px-6">
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (race.load.status !== 'ready') {
    const explain = {
      missing: {
        title: 'No race with that code.',
        body: 'Codes are four characters and case-insensitive. Check it with whoever sent it, or start your own.',
      },
      expired: {
        title: 'That race expired.',
        body: 'Races stay open for two hours. Create a new one and share the fresh code.',
      },
      closed: {
        title: 'This race already started.',
        body: 'Joining mid-race cannot produce a fair result. Create your own and invite the same people.',
      },
    }[race.load.status];

    return (
      <div className="measure px-4 py-16 sm:px-6">
        <p className="gutter-label mb-3">Race {code.toUpperCase()}</p>
        <EmptyState
          title={explain.title}
          body={explain.body}
          action={<LinkButton to="/race" variant="primary">Create a race</LinkButton>}
        />
      </div>
    );
  }

  const inLobby = race.state.status === 'lobby';
  const done = race.state.status === 'finished';
  const myPlace = race.me?.place ?? null;

  return (
    <div className="measure px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="gutter-label">Race</p>
          <span className="font-display text-lg tracking-[-0.04em] text-signal">
            RACE-{code.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge state={race.connection} />
          <Button
            small
            onClick={async () => {
              const ok = await copy(shareLink);
              if (ok) toast.success('Invite link copied.');
              else toast.error('Could not reach the clipboard. Share the code instead.');
            }}
          >
            {copied ? 'Copied' : 'Copy invite link'}
          </Button>
        </div>
      </header>

      {race.connection === 'reconnecting' && (
        <p role="alert" className="mb-5 border border-fault/30 bg-fault/5 px-4 py-3 text-sm">
          Connection lost. Reconnecting…
        </p>
      )}

      <section aria-label="Players" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="gutter-label">
            {players.length} player{players.length === 1 ? '' : 's'}
          </p>
          {inLobby && players.length < 2 && (
            <p className="text-tick text-mute" role="status">
              Waiting for players…
            </p>
          )}
        </div>
        <RaceTrack players={players} meId={user?.id ?? null} running={!inLobby} />
      </section>

      {inLobby && (
        <section className="mb-10 border-t border-rule pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant={race.me?.ready ? 'ghost' : 'primary'}
              onClick={() => race.setReady(!race.me?.ready)}
            >
              {race.me?.ready ? 'Not ready' : "I'm ready"}
            </Button>
            <p className="text-sm text-mute">
              {players.length < 2
                ? 'Send the code to a friend. The race starts when everyone is ready.'
                : players.every((p) => p.ready)
                  ? 'Starting…'
                  : `Waiting on ${players.filter((p) => !p.ready).length} player(s).`}
            </p>
          </div>
        </section>
      )}

      {race.countdownMs !== null && (
        <Countdown ms={race.countdownMs} />
      )}

      {/* Mounted during the countdown too, locked: the passage is readable
          before the start, and the engine is warm the instant the clock hits 0. */}
      {(race.state.status === 'countdown' || race.state.status === 'running' || done) && (
        <section className={cn('border-t border-rule pt-8', done && 'opacity-70')}>
          <TypingSurface
            config={config}
            nonce={0}
            seed={race.load.race.textSeed}
            locked={race.countdownMs !== null}
            autoFocus
            onProgress={onProgress}
            onFinish={onFinish}
          />
        </section>
      )}

      {done && (
        <section aria-label="Race results" className="mt-10 border-t border-rule pt-8">
          <p className="gutter-label mb-4">Result</p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat
              label="Your place"
              value={myPlace ? `#${myPlace}` : '—'}
              tone={myPlace === 1 ? 'signal' : 'default'}
            />
            <Stat label="Your WPM" value={(race.me?.wpm ?? 0).toFixed(1)} />
            <Stat label="Your accuracy" value={`${(race.me?.accuracy ?? 0).toFixed(0)}%`} />
            <Stat label="Field" value={players.length} unit="players" />
          </div>
          <div className="mt-8 flex gap-3">
            <LinkButton to="/race" variant="primary">
              Race again
            </LinkButton>
            <LinkButton to="/dashboard">View analysis</LinkButton>
          </div>
        </section>
      )}
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  const seconds = Math.ceil(ms / 1000);
  return (
    <div
      className="flex items-center justify-center border-y border-rule py-12"
      role="status"
      aria-live="assertive"
    >
      <span
        key={seconds}
        className="font-display text-5xl leading-none tracking-[-0.06em] text-signal"
        style={{ animation: 'countdown 900ms var(--ease-out-quint)' }}
      >
        {seconds > 0 ? seconds : 'GO'}
      </span>
      <style>
        {'@keyframes countdown { from { opacity: 0.2; transform: scale(0.94) } to { opacity: 1; transform: scale(1) } }'}
      </style>
    </div>
  );
}

function ConnectionBadge({ state }: { state: string }) {
  const tone = state === 'open' ? 'default' : state === 'reconnecting' ? 'fault' : 'default';
  const label =
    state === 'open' ? 'live' : state === 'connecting' ? 'connecting' : state === 'reconnecting' ? 'reconnecting' : 'offline';
  return <Tag tone={tone as 'default' | 'fault'}>{label}</Tag>;
}
