import { useMemo, useState } from 'react';
import { Band, EmptyState, ErrorPanel, LinkButton, LoadingRows, Segmented, Stat, Tag } from '@/components/ui';
import { LineChart } from '@/components/chart/LineChart';
import { BarRow } from '@/components/chart/BarRow';
import { KeyboardHeatmap } from '@/components/chart/KeyboardHeatmap';
import { useAsync, useDocumentTitle } from '@/hooks';
import { data } from '@/lib/data';
import { useSession } from '@/stores/session';
import {
  RANGE_LABELS,
  decimate,
  distributionByTarget,
  personalRecords,
  seriesByDay,
  summarise,
  withinRange,
  type Range,
} from '@/lib/analytics/aggregate';
import { confusionPairs, errorRate, keyAccuracy, weakestKeys } from '@/lib/analytics/heatmap';
import { deriveInsights, testsUntilInsights } from '@/lib/analytics/insights';
import { formatLongDuration } from '@/lib/typing/metrics';
import type { TestResult } from '@/lib/typing/types';

const RANGES: Range[] = ['7d', '30d', '3m', '1y', 'all'];

export default function Dashboard() {
  useDocumentTitle('Analysis — Baud');
  const user = useSession((s) => s.user);
  const [range, setRange] = useState<Range>('30d');

  const state = useAsync<TestResult[]>(
    () => (user ? data().listTests(user.id) : Promise.resolve([])),
    [user?.id],
  );

  if (state.status === 'loading') {
    return (
      <div className="measure px-4 py-10 sm:px-6">
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="measure px-4 py-10 sm:px-6">
        <ErrorPanel message={state.error} onRetry={state.retry} />
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="measure px-4 py-16 sm:px-6">
        <p className="gutter-label mb-3">Analysis</p>
        <h1 className="mb-8 font-display text-2xl tracking-[-0.05em]">Nothing to analyse yet.</h1>
        <EmptyState
          title="No typing tests yet."
          body="Take one test and this page fills in: pace over time, accuracy, consistency, a keyboard heatmap and your records. It takes fifteen seconds."
          action={<LinkButton to="/practice" variant="primary">Start typing</LinkButton>}
        />
      </div>
    );
  }

  return <DashboardBody tests={state.data} range={range} onRange={setRange} />;
}

function DashboardBody({
  tests,
  range,
  onRange,
}: {
  tests: TestResult[];
  range: Range;
  onRange: (r: Range) => void;
}) {
  const scoped = useMemo(() => withinRange(tests, range), [tests, range]);
  const summary = useMemo(() => summarise(scoped), [scoped]);
  const days = useMemo(() => decimate(seriesByDay(scoped)), [scoped]);
  const buckets = useMemo(() => distributionByTarget(scoped), [scoped]);
  const records = useMemo(() => personalRecords(tests), [tests]);
  const keys = useMemo(() => keyAccuracy(scoped), [scoped]);
  const weak = useMemo(() => weakestKeys(scoped), [scoped]);
  const pairs = useMemo(() => confusionPairs(scoped), [scoped]);
  const insights = useMemo(() => deriveInsights(tests), [tests]);
  const missing = testsUntilInsights(tests);

  const rangeControl = (
    <Segmented
      label="Time range"
      value={range}
      onChange={onRange}
      options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
    />
  );

  const maxTests = Math.max(1, ...buckets.map((b) => b.tests));

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="gutter-label mb-3">Analysis</p>
          <h1 className="font-display text-2xl tracking-[-0.05em]">
            {summary.tests} test{summary.tests === 1 ? '' : 's'} in the last {RANGE_LABELS[range].toLowerCase()}
          </h1>
        </div>
        {rangeControl}
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-t border-rule py-8 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Avg WPM" value={summary.avgWpm.toFixed(1)} tone="signal" />
        <Stat label="Best WPM" value={Math.round(summary.bestWpm)} />
        <Stat label="Avg accuracy" value={`${summary.avgAccuracy.toFixed(1)}%`} />
        <Stat label="Best accuracy" value={`${summary.bestAccuracy.toFixed(1)}%`} />
        <Stat label="Tests" value={summary.tests} />
        <Stat label="Typing time" value={formatLongDuration(summary.typingSeconds)} />
        <Stat label="Streak" value={summary.streak} unit={summary.streak === 1 ? 'day' : 'days'} />
      </div>

      <Band label="Insights">
        {insights.length > 0 ? (
          <ul className="space-y-3">
            {insights.map((insight) => (
              <li key={insight.id} className="flex items-start gap-3 border-t border-rule pt-3 first:border-t-0 first:pt-0">
                <Tag tone={insight.tone === 'up' ? 'signal' : insight.tone === 'down' ? 'fault' : 'default'}>
                  {insight.tone === 'up' ? 'up' : insight.tone === 'down' ? 'watch' : 'note'}
                </Tag>
                <p className="text-sm text-paper">{insight.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">
            Not enough data yet for reliable insights.{' '}
            {missing > 0
              ? `About ${missing} more test${missing === 1 ? '' : 's'} will do it.`
              : 'Keep going — nothing has moved far enough to be worth stating.'}
          </p>
        )}
      </Band>

      <Band label="Pace">
        {days.length >= 2 ? (
          <LineChart
            ariaLabel="Words per minute by day"
            labels={days.map((d) => d.label)}
            yUnit=" wpm"
            series={[
              { id: 'best', label: 'Best', color: 'var(--color-trace)', points: days.map((d) => d.bestWpm), dashed: true },
              { id: 'avg', label: 'Average', color: 'var(--color-signal)', points: days.map((d) => d.avgWpm), fill: true },
            ]}
          />
        ) : (
          <p className="text-sm text-mute">Two days of tests will draw a trend line.</p>
        )}
      </Band>

      <Band label="Accuracy">
        {days.length >= 2 ? (
          <LineChart
            ariaLabel="Accuracy by day"
            labels={days.map((d) => d.label)}
            yUnit="%"
            yMax={100}
            series={[
              { id: 'acc', label: 'Accuracy', color: 'var(--color-signal)', points: days.map((d) => d.avgAccuracy), fill: true },
            ]}
          />
        ) : (
          <p className="text-sm text-mute">Two days of tests will draw a trend line.</p>
        )}
      </Band>

      <Band label="Consistency">
        <p className="mb-5 max-w-xl text-sm text-mute">
          Consistency is how even your pace is within a test — 100 means every second looked the
          same. Your average is <span className="tnum text-paper">{summary.avgConsistency.toFixed(1)}%</span>.
        </p>
        {days.length >= 2 ? (
          <LineChart
            ariaLabel="Consistency by day"
            labels={days.map((d) => d.label)}
            yUnit="%"
            yMax={100}
            yMin={0}
            series={[
              { id: 'cons', label: 'Consistency', color: 'var(--color-trace)', points: days.map((d) => d.avgConsistency), fill: true },
            ]}
          />
        ) : (
          <p className="text-sm text-mute">Two days of tests will draw a trend line.</p>
        )}
      </Band>

      <Band label="By length">
        {buckets.length > 0 ? (
          <div>
            {buckets.map((bucket) => (
              <BarRow
                key={bucket.key}
                label={bucket.label}
                value={bucket.avgWpm}
                max={Math.max(...buckets.map((b) => b.avgWpm))}
                detail={`${bucket.avgWpm.toFixed(1)} wpm · ${bucket.avgAccuracy.toFixed(1)}% · ${bucket.tests}/${maxTests} tests`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-mute">Take a timed or word-count test to compare lengths.</p>
        )}
      </Band>

      <Band label="Records">
        {records.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {records.map((record) => (
              <Stat key={record.label} label={record.label} value={record.value} detail={record.detail} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-mute">Records appear after your first test of five seconds or more.</p>
        )}
      </Band>

      <Band label="Keyboard">
        <KeyboardHeatmap stats={keys} />
      </Band>

      <Band label="Errors">
        <p className="mb-6 text-sm text-mute">
          Overall error rate in this range:{' '}
          <span className="tnum text-paper">{(errorRate(scoped) * 100).toFixed(2)}%</span>.
        </p>

        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <p className="gutter-label mb-3">Weakest keys</p>
            {weak.length > 0 ? (
              <div>
                {weak.map((key) => (
                  <BarRow
                    key={key.key}
                    label={key.key.toUpperCase()}
                    value={1 - key.accuracy}
                    max={Math.max(...weak.map((k) => 1 - k.accuracy))}
                    color="var(--color-fault)"
                    detail={`${(key.accuracy * 100).toFixed(1)}% · ${key.attempts} tries`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-mute">
                No key has enough attempts yet to be called weak. That is a good sign.
              </p>
            )}
          </div>

          <div>
            <p className="gutter-label mb-3">Most common substitutions</p>
            {pairs.length > 0 ? (
              <ul className="font-mono text-xs">
                {pairs.map((pair) => (
                  <li
                    key={`${pair.expected}${pair.typed}`}
                    className="flex items-center justify-between border-t border-rule py-2 first:border-t-0"
                  >
                    <span>
                      <span className="text-mute">{pair.expected}</span>
                      <span className="mx-2 text-mute">→</span>
                      <span className="text-fault">{pair.typed}</span>
                    </span>
                    <span className="tnum text-mute">{pair.count}×</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-mute">No repeated substitutions recorded in this range.</p>
            )}
          </div>
        </div>
      </Band>
    </div>
  );
}
