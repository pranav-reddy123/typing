import { useMemo, useState } from 'react';
import { KEY_ROWS, MIN_ATTEMPTS, type KeyStat } from '@/lib/analytics/heatmap';

/**
 * Accuracy per key, tinted toward the fault colour in proportion to error rate.
 *
 * The scale adapts to the user rather than to an absolute threshold — a typist
 * at 99% overall should still see which of their keys is worst. Keys with too
 * few attempts stay neutral; "no data" must never read as "perfect".
 */
export function KeyboardHeatmap({ stats }: { stats: KeyStat[] }) {
  const byKey = useMemo(() => new Map(stats.map((s) => [s.key, s])), [stats]);
  const [active, setActive] = useState<KeyStat | null>(null);

  const worst = useMemo(() => {
    const reliable = stats.filter((s) => s.reliable);
    return reliable.length > 0 ? Math.min(...reliable.map((s) => s.accuracy)) : 0.9;
  }, [stats]);

  const tint = (stat: KeyStat | undefined): string => {
    if (!stat || !stat.reliable) return 'var(--color-slab)';
    const span = Math.max(0.02, 1 - worst);
    const severity = Math.min(1, (1 - stat.accuracy) / span);
    return `color-mix(in oklab, var(--color-fault) ${(severity * 62).toFixed(1)}%, var(--color-slab))`;
  };

  return (
    <div>
      {/* Wide content scrolls inside its own container; the page body never does. */}
      <div
        className="-mx-1 overflow-x-auto px-1"
        role="group"
        aria-label="Keyboard accuracy heatmap"
      >
        <div className="flex min-w-max flex-col items-start gap-1 sm:gap-1.5">
          {KEY_ROWS.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex gap-1 sm:gap-1.5"
              style={{ paddingLeft: `calc(${rowIndex} * var(--key-indent, 10px))` }}
            >
            {row.map((key) => {
              const stat = byKey.get(key);
              const label = stat?.reliable
                ? `${key}: ${(stat.accuracy * 100).toFixed(1)}% over ${stat.attempts} attempts`
                : `${key}: not enough data`;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  onMouseEnter={() => setActive(stat ?? null)}
                  onFocus={() => setActive(stat ?? null)}
                  onMouseLeave={() => setActive(null)}
                  onBlur={() => setActive(null)}
                  style={{ background: tint(stat) }}
                  className="h-7 w-7 rounded-[3px] border border-rule font-mono text-micro uppercase text-paper transition-colors duration-[var(--t-fast)] hover:border-rule-hi sm:h-10 sm:w-10 sm:text-xs"
                >
                  {key}
                </button>
              );
            })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 min-h-[3.25rem] border-t border-rule pt-3" role="status" aria-live="polite">
        {active ? (
          active.reliable ? (
            <p className="font-mono text-xs text-paper">
              <span className="uppercase text-signal">{active.key}</span> — {(active.accuracy * 100).toFixed(1)}%
              accuracy over {active.attempts} attempts, {active.errors} wrong
              {active.confusedWith && active.confusedWith !== '⌫'
                ? `, most often typed as "${active.confusedWith}"`
                : ''}
              .
            </p>
          ) : (
            <p className="font-mono text-xs text-mute">
              <span className="uppercase">{active.key}</span> — {active.attempts} attempts. Needs{' '}
              {MIN_ATTEMPTS} before the number means anything.
            </p>
          )
        ) : (
          <p className="text-tick text-mute">
            Hover or tab through a key. Darker red means more errors, relative to your own worst key.
          </p>
        )}
      </div>
    </div>
  );
}
