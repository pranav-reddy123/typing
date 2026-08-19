import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks';

export interface Series {
  id: string;
  label: string;
  color: string;
  points: number[];
  /** Renders as a faint area under the line. */
  fill?: boolean;
  dashed?: boolean;
}

export interface LineChartProps {
  series: Series[];
  labels: string[];
  height?: number;
  yUnit?: string;
  /** Forces the y-axis floor; otherwise derived from the data. */
  yMin?: number;
  yMax?: number;
  ariaLabel: string;
}

const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

/**
 * A line chart in ~120 lines of SVG. Drawn to our type scale and palette, with
 * one entrance animation and none on update — a chart that re-animates whenever
 * data changes is harder to read, not friendlier.
 */
export function LineChart({
  series,
  labels,
  height = 220,
  yUnit,
  yMin,
  yMax,
  ariaLabel,
}: LineChartProps) {
  const gradientId = useId();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  // The viewBox tracks the real container width. Without this the SVG is
  // letterboxed and centred by preserveAspectRatio, which leaves the chart
  // floating in the middle of its band.
  const hostRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.max(280, Math.round(entry.contentRect.width));
      setWidth((current) => (Math.abs(current - next) > 1 ? next : current));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const { min, max, paths, areas } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const rawMin = yMin ?? Math.min(...all);
    const rawMax = yMax ?? Math.max(...all);
    const span = rawMax - rawMin || 1;
    const lo = yMin ?? Math.max(0, rawMin - span * 0.15);
    const hi = yMax ?? rawMax + span * 0.15;

    const x = (i: number, n: number) => (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v: number) => plotH - ((v - lo) / (hi - lo || 1)) * plotH;

    return {
      min: lo,
      max: hi,
      paths: series.map((s) =>
        s.points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, s.points.length).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      ),
      areas: series.map((s) => {
        if (!s.fill || s.points.length === 0) return '';
        const line = s.points
          .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, s.points.length).toFixed(1)},${y(v).toFixed(1)}`)
          .join(' ');
        return `${line} L${plotW.toFixed(1)},${plotH} L0,${plotH} Z`;
      }),
    };
  }, [series, plotH, plotW, yMax, yMin]);

  const ticks = [0, 0.5, 1].map((t) => min + (max - min) * (1 - t));
  const n = series[0]?.points.length ?? 0;
  const hoverX = hover !== null && n > 1 ? (hover / (n - 1)) * plotW : 0;

  return (
    <figure ref={hostRef} className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full select-none"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          if (n <= 1) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const px = ratio * width - PAD.left;
          setHover(Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))));
        }}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.id} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        <g transform={`translate(${PAD.left} ${PAD.top})`}>
          {ticks.map((value, i) => {
            const y = (i / (ticks.length - 1)) * plotH;
            return (
              <g key={i}>
                <line x1="0" y1={y} x2={plotW} y2={y} stroke="var(--color-rule)" strokeWidth="1" />
                <text
                  x="-8"
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[var(--color-mute)]"
                  style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                >
                  {Math.round(value)}
                </text>
              </g>
            );
          })}

          {series.map((s, i) =>
            s.fill ? <path key={`a-${s.id}`} d={areas[i]} fill={`url(#${gradientId}-${i})`} /> : null,
          )}

          {series.map((s, i) => (
            <path
              key={s.id}
              d={paths[i]}
              fill="none"
              stroke={s.color}
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '3 4' : undefined}
              style={
                reduced
                  ? undefined
                  : {
                      strokeDasharray: s.dashed ? '3 4' : 2000,
                      strokeDashoffset: s.dashed ? 0 : 2000,
                      animation: s.dashed
                        ? undefined
                        : `draw var(--t-slow) var(--ease-out-quint) ${i * 90}ms forwards`,
                    }
              }
            />
          ))}

          {hover !== null && (
            <g>
              <line x1={hoverX} y1="0" x2={hoverX} y2={plotH} stroke="var(--color-rule-hi)" strokeWidth="1" />
              {series.map((s) => {
                const v = s.points[hover];
                if (v === undefined) return null;
                const y = plotH - ((v - min) / (max - min || 1)) * plotH;
                return <circle key={s.id} cx={hoverX} cy={y} r="3" fill={s.color} />;
              })}
            </g>
          )}

          {labels.length > 0 && (
            <>
              <text
                x="0"
                y={plotH + 15}
                className="fill-[var(--color-mute)]"
                style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
              >
                {labels[0]}
              </text>
              <text
                x={plotW}
                y={plotH + 15}
                textAnchor="end"
                className="fill-[var(--color-mute)]"
                style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
              >
                {labels[labels.length - 1]}
              </text>
            </>
          )}
        </g>
        <style>{'@keyframes draw { to { stroke-dashoffset: 0 } }'}</style>
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-2 text-tick text-mute">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} aria-hidden />
            {s.label}
            {hover !== null && s.points[hover] !== undefined ? (
              <span className="tnum text-paper">
                {s.points[hover].toFixed(s.points[hover] % 1 === 0 ? 0 : 1)}
                {yUnit}
              </span>
            ) : null}
          </span>
        ))}
        {hover !== null && labels[hover] ? (
          <span className="text-tick text-mute">{labels[hover]}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
