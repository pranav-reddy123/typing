import { Avatar, Tag, cn } from '@/components/ui';
import type { RacePlayer } from '@/lib/realtime/protocol';

/**
 * The field. Re-renders only when a progress event arrives (at most 4 Hz per
 * player) and each bar moves with a CSS transform transition — no layout
 * animation, no per-frame React work.
 */
export function RaceTrack({
  players,
  meId,
  running,
}: {
  players: RacePlayer[];
  meId: string | null;
  running: boolean;
}) {
  const ordered = [...players].sort((a, b) => {
    if (a.place !== null && b.place !== null) return a.place - b.place;
    if (b.progress !== a.progress) return b.progress - a.progress;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <ol className="space-y-1">
      {ordered.map((player) => {
        const mine = player.userId === meId;
        return (
          <li
            key={player.userId}
            className={cn(
              'grid grid-cols-[auto_7rem_1fr_auto] items-center gap-3 border-b border-rule py-2.5 sm:grid-cols-[auto_9rem_1fr_5rem_4rem]',
              !player.connected && 'opacity-45',
            )}
          >
            <Avatar seed={player.avatarSeed} size={22} username={player.username} />

            <span className="flex min-w-0 items-center gap-2">
              <span className={cn('truncate font-mono text-xs', mine ? 'text-signal' : 'text-paper')}>
                {player.username}
                {mine ? ' (you)' : ''}
              </span>
              {player.place !== null && <Tag tone={player.place === 1 ? 'signal' : 'default'}>#{player.place}</Tag>}
              {!player.connected && <Tag tone="fault">left</Tag>}
              {!running && player.ready && <Tag tone="signal">ready</Tag>}
            </span>

            <span className="h-2 w-full bg-slab" aria-hidden>
              <span
                className="block h-full origin-left"
                style={{
                  background: player.finishedAt !== null ? 'var(--color-good)' : mine ? 'var(--color-signal)' : 'var(--color-trace)',
                  transform: `scaleX(${Math.max(0, Math.min(1, player.progress / 100))})`,
                  transition: 'transform 220ms linear',
                }}
              />
            </span>

            <span className="tnum hidden text-right text-xs text-paper sm:block">
              {player.wpm.toFixed(0)} <span className="text-mute">wpm</span>
            </span>
            <span className="tnum text-right text-xs text-mute">{player.progress}%</span>

            <span className="sr-only">
              {player.username}: {player.progress}% complete, {player.wpm.toFixed(0)} words per minute
            </span>
          </li>
        );
      })}
    </ol>
  );
}
