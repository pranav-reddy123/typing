import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, EmptyState, ErrorPanel, LinkButton, LoadingRows, Segmented, cn } from '@/components/ui';
import { useAsync, useDocumentTitle } from '@/hooks';
import { data } from '@/lib/data';
import { useSession } from '@/stores/session';
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardScope } from '@/lib/data/types';

const PERIODS: Array<{ value: LeaderboardPeriod; label: string }> = [
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
  { value: 'alltime', label: 'All time' },
];

export default function Leaderboard() {
  useDocumentTitle('Leaderboard — Baud');
  const user = useSession((s) => s.user);
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [scope, setScope] = useState<LeaderboardScope>('global');

  const state = useAsync<LeaderboardEntry[]>(
    () => data().leaderboard(period, scope, user?.id ?? null),
    [period, scope, user?.id],
  );

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <p className="gutter-label mb-3">Leaderboard</p>
      <h1 className="font-display text-2xl tracking-[-0.05em]">
        Best single test, {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}
      </h1>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-rule py-3">
        <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
        <span aria-hidden className="hidden h-4 w-px bg-rule sm:block" />
        <Segmented
          label="Scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'global', label: 'Everyone' },
            { value: 'friends', label: 'Friends' },
          ]}
        />
      </div>

      <div className="mt-6">
        {state.status === 'loading' && <LoadingRows rows={6} />}

        {state.status === 'error' && <ErrorPanel message={state.error} onRetry={state.retry} />}

        {state.status === 'empty' && (
          <EmptyState
            title={scope === 'friends' ? 'No friends on the board yet.' : 'Nobody has ranked yet.'}
            body={
              scope === 'friends'
                ? 'Add friends and their best tests in this period will appear here beside yours.'
                : 'The leaderboard ranks the best single test in the period. Take one and you are on it.'
            }
            action={<LinkButton to="/practice" variant="primary">Start typing</LinkButton>}
          />
        )}

        {state.status === 'ready' && (
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Leaderboard ranked by best words per minute</caption>
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="gutter-label w-12 py-2 font-normal">rank</th>
                <th scope="col" className="gutter-label py-2 font-normal">player</th>
                <th scope="col" className="gutter-label py-2 text-right font-normal">wpm</th>
                <th scope="col" className="gutter-label hidden py-2 text-right font-normal sm:table-cell">acc</th>
                <th scope="col" className="gutter-label hidden py-2 text-right font-normal sm:table-cell">tests</th>
                <th scope="col" className="gutter-label w-16 py-2 text-right font-normal">move</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((entry) => {
                const mine = entry.userId === user?.id;
                const move = entry.previousRank === null ? null : entry.previousRank - entry.rank;
                return (
                  <tr
                    key={entry.userId}
                    className={cn('border-b border-rule', mine && 'bg-signal/5')}
                  >
                    <td className="tnum py-3 text-sm text-mute">{entry.rank}</td>
                    <td className="py-3">
                      <Link
                        to={`/profile/${entry.username}`}
                        className="flex items-center gap-2.5 font-mono text-sm hover:text-signal"
                      >
                        <Avatar seed={entry.avatarSeed} size={22} username={entry.username} />
                        <span className="truncate">{entry.username}</span>
                        {mine && <span className="text-micro text-signal">you</span>}
                      </Link>
                    </td>
                    <td className="tnum py-3 text-right text-sm text-signal">{entry.wpm.toFixed(1)}</td>
                    <td className="tnum hidden py-3 text-right text-sm sm:table-cell">
                      {entry.accuracy.toFixed(1)}%
                    </td>
                    <td className="tnum hidden py-3 text-right text-sm text-mute sm:table-cell">
                      {entry.tests}
                    </td>
                    <td className="tnum py-3 text-right text-xs">
                      {move === null ? (
                        <span className="text-mute">new</span>
                      ) : move === 0 ? (
                        <span className="text-mute">—</span>
                      ) : (
                        <span
                          className={move > 0 ? 'text-good' : 'text-fault'}
                          style={{ transition: 'color var(--t-base)' }}
                        >
                          {move > 0 ? '↑' : '↓'}
                          {Math.abs(move)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 text-tick text-mute">
        Ranked by your best single test in the period. Tests shorter than five seconds are excluded.
      </p>
    </div>
  );
}
