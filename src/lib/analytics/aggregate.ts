import { isScoreable, mean } from '../typing/metrics';
import type { TestResult } from '../typing/types';

export type Range = '7d' | '30d' | '3m' | '1y' | 'all';

export const RANGE_LABELS: Record<Range, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '3m': '3 months',
  '1y': '1 year',
  all: 'All time',
};

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '3m': 91, '1y': 365, all: Infinity };

export function withinRange(tests: TestResult[], range: Range): TestResult[] {
  const days = RANGE_DAYS[range];
  if (!Number.isFinite(days)) return tests;
  const since = Date.now() - days * 864e5;
  return tests.filter((t) => t.createdAt >= since);
}

export function scoreable(tests: TestResult[]): TestResult[] {
  return tests.filter(isScoreable);
}

export interface Summary {
  tests: number;
  avgWpm: number;
  bestWpm: number;
  avgAccuracy: number;
  bestAccuracy: number;
  avgConsistency: number;
  typingSeconds: number;
  streak: number;
}

export function summarise(all: TestResult[]): Summary {
  const valid = scoreable(all);
  const typingSeconds = all.reduce((s, t) => s + t.durationS, 0);
  if (valid.length === 0) {
    return {
      tests: all.length,
      avgWpm: 0,
      bestWpm: 0,
      avgAccuracy: 0,
      bestAccuracy: 0,
      avgConsistency: 0,
      typingSeconds,
      streak: streak(all),
    };
  }
  return {
    tests: all.length,
    avgWpm: mean(valid.map((t) => t.wpm)),
    bestWpm: Math.max(...valid.map((t) => t.wpm)),
    avgAccuracy: mean(valid.map((t) => t.accuracy)),
    bestAccuracy: Math.max(...valid.map((t) => t.accuracy)),
    avgConsistency: mean(valid.map((t) => t.consistency)),
    typingSeconds,
    streak: streak(all),
  };
}

export interface DayPoint {
  day: number;
  label: string;
  avgWpm: number;
  bestWpm: number;
  avgAccuracy: number;
  avgConsistency: number;
  tests: number;
}

/** One point per local calendar day that has at least one test. */
export function seriesByDay(tests: TestResult[]): DayPoint[] {
  const buckets = new Map<string, TestResult[]>();
  for (const test of scoreable(tests)) {
    const date = new Date(test.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const list = buckets.get(key);
    if (list) list.push(test);
    else buckets.set(key, [test]);
  }

  return Array.from(buckets.entries())
    .map(([, list]) => {
      const day = new Date(list[0].createdAt);
      day.setHours(0, 0, 0, 0);
      return {
        day: day.getTime(),
        label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        avgWpm: mean(list.map((t) => t.wpm)),
        bestWpm: Math.max(...list.map((t) => t.wpm)),
        avgAccuracy: mean(list.map((t) => t.accuracy)),
        avgConsistency: mean(list.map((t) => t.consistency)),
        tests: list.length,
      };
    })
    .sort((a, b) => a.day - b.day);
}

export interface Bucket {
  key: string;
  label: string;
  tests: number;
  avgWpm: number;
  bestWpm: number;
  avgAccuracy: number;
}

/** Performance grouped by test length — the basis of the "best duration" insight. */
export function distributionByTarget(tests: TestResult[]): Bucket[] {
  const groups = new Map<string, TestResult[]>();
  for (const test of scoreable(tests)) {
    if (test.mode !== 'time' && test.mode !== 'words') continue;
    const key = test.mode === 'time' ? `${test.target}s` : `${test.target}w`;
    const list = groups.get(key);
    if (list) list.push(test);
    else groups.set(key, [test]);
  }

  return Array.from(groups.entries())
    .map(([key, list]) => ({
      key,
      label: key.endsWith('s') ? `${key.slice(0, -1)} sec` : `${key.slice(0, -1)} words`,
      tests: list.length,
      avgWpm: mean(list.map((t) => t.wpm)),
      bestWpm: Math.max(...list.map((t) => t.wpm)),
      avgAccuracy: mean(list.map((t) => t.accuracy)),
    }))
    .sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10));
}

export interface PersonalRecord {
  label: string;
  value: string;
  detail: string;
  testId: string | null;
}

export function personalRecords(tests: TestResult[]): PersonalRecord[] {
  const valid = scoreable(tests);
  if (valid.length === 0) return [];

  const bestBy = (fn: (t: TestResult) => number) =>
    valid.reduce((a, t) => (fn(t) > fn(a) ? t : a));

  const fastest = bestBy((t) => t.wpm);
  const mostAccurate = bestBy((t) => t.accuracy);
  const steadiest = bestBy((t) => t.consistency);
  const when = (t: TestResult) => new Date(t.createdAt).toLocaleDateString();

  return [
    { label: 'Fastest', value: `${Math.round(fastest.wpm)} wpm`, detail: when(fastest), testId: fastest.id },
    { label: 'Most accurate', value: `${mostAccurate.accuracy.toFixed(1)}%`, detail: when(mostAccurate), testId: mostAccurate.id },
    { label: 'Steadiest', value: `${Math.round(steadiest.consistency)}%`, detail: when(steadiest), testId: steadiest.id },
    {
      label: 'Longest streak',
      value: `${longestStreak(tests)} ${longestStreak(tests) === 1 ? 'day' : 'days'}`,
      detail: 'consecutive days',
      testId: null,
    },
    { label: 'Tests completed', value: String(tests.length), detail: 'all time', testId: null },
  ];
}

function dayKeys(tests: TestResult[]): Set<string> {
  return new Set(tests.map((t) => new Date(t.createdAt).toDateString()));
}

/** Consecutive days up to today (or yesterday, if today has no test yet). */
export function streak(tests: TestResult[]): number {
  if (tests.length === 0) return 0;
  const days = dayKeys(tests);
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(cursor.toDateString())) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function longestStreak(tests: TestResult[]): number {
  if (tests.length === 0) return 0;
  const days = Array.from(dayKeys(tests))
    .map((d) => new Date(d).setHours(0, 0, 0, 0))
    .sort((a, b) => a - b);

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === 864e5 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Down-samples a series so a chart never renders more nodes than it has pixels. */
export function decimate<T>(points: T[], max = 400): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  return out;
}
