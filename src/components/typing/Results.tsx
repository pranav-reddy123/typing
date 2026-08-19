import { Link } from 'react-router-dom';
import { Button, Stat, Tag, cn } from '@/components/ui';
import { LineChart } from '@/components/chart/LineChart';
import { useCopy, useCountUp, useReducedMotion } from '@/hooks';
import { formatDuration } from '@/lib/typing/metrics';
import type { TestResult } from '@/lib/typing/types';
import { toast } from '@/stores/toast';

export interface ResultsProps {
  result: TestResult;
  /** The user's average WPM before this test, or null when it is their first. */
  averageWpm: number | null;
  personalBest: boolean;
  onRetry: () => void;
  onNewTest: () => void;
}

export function Results({ result, averageWpm, personalBest, onRetry, onNewTest }: ResultsProps) {
  const reduced = useReducedMotion();
  const wpm = useCountUp(result.wpm, 640, 0);
  const accuracy = useCountUp(result.accuracy, 640, 1);
  const [copied, copy] = useCopy();

  const delta = averageWpm === null ? null : result.wpm - averageWpm;
  const labels = result.samples.map((s) => `${s.t}s`);

  const share = async () => {
    const text = `${Math.round(result.wpm)} wpm · ${result.accuracy.toFixed(1)}% accuracy · ${
      result.mode === 'time' ? `${result.target}s` : `${result.target} words`
    } on Baud`;
    const ok = await copy(`${text}\n${window.location.origin}`);
    if (ok) toast.success('Result copied to your clipboard.');
    else toast.error('Could not reach the clipboard. Copy the numbers manually.');
  };

  return (
    <section
      aria-label="Test results"
      className="w-full"
      style={
        reduced
          ? undefined
          : { animation: 'results-in 360ms var(--ease-out-quint) both' }
      }
    >
      <style>
        {'@keyframes results-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }'}
      </style>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-8">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="gutter-label">Words per minute</span>
            {personalBest ? <Tag tone="signal">Personal best</Tag> : null}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl leading-none tracking-[-0.06em] text-signal tabular-nums">
              {wpm}
            </span>
            {delta !== null && (
              <span
                className={cn(
                  'text-sm tabular-nums',
                  delta >= 0 ? 'text-good' : 'text-fault',
                )}
              >
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(1)} vs your average
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="gutter-label mb-2">Accuracy</div>
          <span className="font-display text-4xl leading-none tracking-[-0.05em] tabular-nums">
            {accuracy}
            <span className="text-lg text-mute">%</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-b border-rule py-7 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Raw" value={Math.round(result.rawWpm)} unit="wpm" />
        <Stat label="Consistency" value={Math.round(result.consistency)} unit="%" />
        <Stat label="Duration" value={formatDuration(result.durationS)} />
        <Stat label="Characters" value={`${result.chars.correct}/${result.chars.incorrect}`} detail="correct / wrong" />
        <Stat label="Extra · missed" value={`${result.chars.extra} · ${result.chars.missed}`} />
        <Stat label="Errors" value={result.errors} detail={`${result.keystrokes} keystrokes`} />
      </div>

      {result.samples.length > 1 ? (
        <div className="border-b border-rule py-7">
          <p className="gutter-label mb-4">Pace over the test</p>
          <LineChart
            ariaLabel={`Words per minute over ${Math.round(result.durationS)} seconds`}
            height={200}
            labels={labels}
            yMin={0}
            series={[
              {
                id: 'raw',
                label: 'Raw',
                color: 'var(--color-trace)',
                points: result.samples.map((s) => s.raw),
                dashed: true,
              },
              {
                id: 'wpm',
                label: 'Net WPM',
                color: 'var(--color-signal)',
                points: result.samples.map((s) => s.wpm),
                fill: true,
              },
            ]}
          />
        </div>
      ) : (
        <div className="border-b border-rule py-7 text-sm text-mute">
          The test was too short to plot a pace curve. Try 30 seconds or longer.
        </div>
      )}

      <div className="flex flex-wrap gap-2 py-7">
        <Button variant="primary" onClick={onRetry}>
          Retry this text
        </Button>
        <Button onClick={onNewTest}>New test</Button>
        <Link
          to={`/history?test=${result.id}`}
          className="inline-flex h-10 items-center rounded-[var(--radius-control)] border border-rule px-4 text-sm hover:border-rule-hi hover:bg-slab"
        >
          View analysis
        </Link>
        <Button variant="quiet" onClick={share}>
          {copied ? 'Copied' : 'Share result'}
        </Button>
      </div>
    </section>
  );
}
