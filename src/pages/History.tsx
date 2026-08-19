import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorPanel,
  LinkButton,
  LoadingRows,
  Segmented,
  Stat,
  Tag,
  cn,
} from '@/components/ui';
import { LineChart } from '@/components/chart/LineChart';
import { useAsync, useDocumentTitle } from '@/hooks';
import { data } from '@/lib/data';
import { useSession } from '@/stores/session';
import { formatDuration } from '@/lib/typing/metrics';
import type { TestMode, TestResult } from '@/lib/typing/types';

type SortKey = 'createdAt' | 'wpm' | 'accuracy' | 'consistency';

const MODE_FILTERS: Array<{ value: TestMode | 'all'; label: string }> = [
  { value: 'all', label: 'all' },
  { value: 'time', label: 'time' },
  { value: 'words', label: 'words' },
  { value: 'quote', label: 'quote' },
  { value: 'custom', label: 'custom' },
  { value: 'zen', label: 'zen' },
];

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'wpm', label: 'wpm' },
  { key: 'accuracy', label: 'acc' },
  { key: 'consistency', label: 'cons', className: 'hidden sm:table-cell' },
  { key: 'createdAt', label: 'when' },
];

export default function History() {
  useDocumentTitle('History — Baud');
  const user = useSession((s) => s.user);
  const [params, setParams] = useSearchParams();

  const [mode, setMode] = useState<TestMode | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('createdAt');
  const [descending, setDescending] = useState(true);

  const state = useAsync<TestResult[]>(
    () => (user ? data().listTests(user.id) : Promise.resolve([])),
    [user?.id],
  );

  const openId = params.get('test');

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const filtered = mode === 'all' ? state.data : state.data.filter((t) => t.mode === mode);
    const sorted = [...filtered].sort((a, b) => {
      const delta = a[sort] - b[sort];
      return descending ? -delta : delta;
    });
    return sorted;
  }, [state, mode, sort, descending]);

  const open = useMemo(() => rows.find((t) => t.id === openId) ?? null, [rows, openId]);

  if (state.status === 'loading') {
    return (
      <div className="measure px-4 py-10 sm:px-6">
        <LoadingRows rows={8} />
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
        <p className="gutter-label mb-3">History</p>
        <h1 className="mb-8 font-display text-2xl tracking-[-0.05em]">No tests recorded.</h1>
        <EmptyState
          title="No typing tests yet."
          body="Every test you finish is stored here with its full pace curve, so you can open any one of them again."
          action={<LinkButton to="/practice" variant="primary">Start typing</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="gutter-label mb-3">History</p>
          <h1 className="font-display text-2xl tracking-[-0.05em]">
            {rows.length} of {state.data.length} tests
          </h1>
        </div>
        <Segmented label="Filter by mode" value={mode} onChange={setMode} options={MODE_FILTERS} />
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing matches that filter."
          body={`You have no ${mode} tests recorded. Change the filter, or take one.`}
          action={<Button onClick={() => setMode('all')}>Show all</Button>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Typing test history. Column headers sort the table.
            </caption>
            <thead>
              <tr className="border-y border-rule">
                <th scope="col" className="gutter-label py-2 pr-3 font-normal">
                  mode
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className={cn('py-2 pr-3', column.className)}>
                    <button
                      type="button"
                      onClick={() => {
                        if (sort === column.key) setDescending((d) => !d);
                        else {
                          setSort(column.key);
                          setDescending(true);
                        }
                      }}
                      aria-sort={sort === column.key ? (descending ? 'descending' : 'ascending') : 'none'}
                      className={cn(
                        'gutter-label transition-colors hover:text-paper',
                        sort === column.key && 'text-signal',
                      )}
                    >
                      {column.label}
                      {sort === column.key ? (descending ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                ))}
                <th scope="col" className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((test) => (
                <tr key={test.id} className="border-b border-rule hover:bg-slab">
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-xs text-mute">
                      {test.mode === 'time'
                        ? `${test.target}s`
                        : test.mode === 'words'
                          ? `${test.target}w`
                          : test.mode}
                    </span>
                    {test.punctuation ? <span className="ml-2 text-micro text-mute">punct</span> : null}
                    {test.numbers ? <span className="ml-2 text-micro text-mute">num</span> : null}
                  </td>
                  <td className="tnum py-2.5 pr-3 text-sm text-signal">{test.wpm.toFixed(1)}</td>
                  <td className="tnum py-2.5 pr-3 text-sm">{test.accuracy.toFixed(1)}%</td>
                  <td className="tnum hidden py-2.5 pr-3 text-sm text-mute sm:table-cell">
                    {test.consistency.toFixed(0)}%
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-mute">
                    {new Date(test.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setParams({ test: test.id })}
                      className="text-xs text-mute transition-colors hover:text-signal"
                      aria-label={`Open the test from ${new Date(test.createdAt).toLocaleString()}`}
                    >
                      open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={Boolean(open)}
        onClose={() => setParams({})}
        title={open ? `${open.wpm.toFixed(1)} wpm` : 'Test'}
      >
        {open ? <TestDetail test={open} /> : null}
      </Dialog>
    </div>
  );
}

function TestDetail({ test }: { test: TestResult }) {
  const worst = [...test.tallies]
    .filter((t) => t.typed !== t.expected)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Tag tone="signal">{test.mode === 'time' ? `${test.target}s` : test.mode}</Tag>
        <Tag>{test.difficulty}</Tag>
        {test.punctuation ? <Tag>punctuation</Tag> : null}
        {test.numbers ? <Tag>numbers</Tag> : null}
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-5">
        <Stat label="Accuracy" value={`${test.accuracy.toFixed(1)}%`} />
        <Stat label="Raw" value={Math.round(test.rawWpm)} unit="wpm" />
        <Stat label="Consistency" value={`${test.consistency.toFixed(0)}%`} />
        <Stat label="Duration" value={formatDuration(test.durationS)} />
        <Stat label="Errors" value={test.errors} />
        <Stat label="Characters" value={`${test.chars.correct}/${test.chars.incorrect}`} />
      </div>

      {test.samples.length > 1 ? (
        <div className="mt-6">
          <LineChart
            ariaLabel="Pace during this test"
            height={140}
            yMin={0}
            labels={test.samples.map((s) => `${s.t}s`)}
            series={[
              { id: 'wpm', label: 'Net WPM', color: 'var(--color-signal)', points: test.samples.map((s) => s.wpm), fill: true },
            ]}
          />
        </div>
      ) : null}

      {worst.length > 0 ? (
        <div className="mt-6 border-t border-rule pt-4">
          <p className="gutter-label mb-2">Mistakes in this test</p>
          <ul className="font-mono text-xs text-mute">
            {worst.map((t) => (
              <li key={`${t.expected}${t.typed}`}>
                {t.expected} → <span className="text-fault">{t.typed ?? 'skipped'}</span> ×{t.count}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 border-t border-rule pt-4 text-sm text-mute">
          No character-level mistakes in this test.
        </p>
      )}
    </div>
  );
}
