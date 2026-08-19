/** A labelled horizontal bar. Used for distributions and race progress. */
export function BarRow({
  label,
  value,
  max,
  detail,
  color = 'var(--color-signal)',
  animate = true,
}: {
  label: string;
  value: number;
  max: number;
  detail?: string;
  color?: string;
  animate?: boolean;
}) {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));

  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 py-2 sm:grid-cols-[8rem_1fr_auto] sm:gap-4">
      <span className="truncate font-mono text-xs text-mute">{label}</span>
      <span className="h-1.5 w-full bg-slab" aria-hidden>
        <span
          className="block h-full origin-left"
          style={{
            background: color,
            transform: `scaleX(${ratio})`,
            transition: animate ? 'transform var(--t-slow) var(--ease-out-quint)' : undefined,
          }}
        />
      </span>
      <span className="tnum text-xs text-paper">
        {detail ?? value.toFixed(0)}
      </span>
    </div>
  );
}
