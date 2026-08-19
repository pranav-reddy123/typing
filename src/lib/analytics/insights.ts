import { mean, stdDev } from '../typing/metrics';
import type { TestResult } from '../typing/types';
import { distributionByTarget, scoreable } from './aggregate';
import { weakestKeys } from './heatmap';

export interface Insight {
  id: string;
  text: string;
  tone: 'up' | 'down' | 'neutral';
}

/**
 * Insights are only emitted when they are statistically defensible. Each rule
 * carries an explicit sample-size and margin guard; when none of them pass, the
 * caller renders "not enough data yet" rather than inventing an observation.
 */
export function deriveInsights(tests: TestResult[]): Insight[] {
  const valid = scoreable(tests);
  const out: Insight[] = [];

  out.push(...monthlyTrend(valid));
  out.push(...bestDuration(valid));
  out.push(...punctuationCost(valid));
  out.push(...weakKey(valid));
  out.push(...timeOfDay(valid));

  return out.slice(0, 3);
}

function monthlyTrend(tests: TestResult[]): Insight[] {
  const now = Date.now();
  const recent = tests.filter((t) => t.createdAt >= now - 30 * 864e5);
  const prior = tests.filter((t) => t.createdAt < now - 30 * 864e5 && t.createdAt >= now - 60 * 864e5);
  if (recent.length < 10 || prior.length < 10) return [];

  const a = mean(prior.map((t) => t.wpm));
  const b = mean(recent.map((t) => t.wpm));
  if (a === 0) return [];
  const delta = ((b - a) / a) * 100;
  if (Math.abs(delta) < 2) return [];

  return [
    {
      id: 'monthly-trend',
      tone: delta > 0 ? 'up' : 'down',
      text:
        delta > 0
          ? `Your WPM improved by ${delta.toFixed(1)}% this month.`
          : `Your WPM is down ${Math.abs(delta).toFixed(1)}% from last month.`,
    },
  ];
}

function bestDuration(tests: TestResult[]): Insight[] {
  const buckets = distributionByTarget(tests).filter((b) => b.tests >= 5);
  if (buckets.length < 2) return [];

  const sorted = [...buckets].sort((a, b) => b.avgAccuracy - a.avgAccuracy);
  const [best, runnerUp] = sorted;
  // Require the lead to exceed the pooled standard error, not just be positive.
  const pooledError = 100 / Math.sqrt(best.tests + runnerUp.tests);
  if (best.avgAccuracy - runnerUp.avgAccuracy < pooledError * 0.5) return [];

  return [
    {
      id: 'best-duration',
      tone: 'neutral',
      text: `Your accuracy is strongest during ${best.label} tests.`,
    },
  ];
}

function punctuationCost(tests: TestResult[]): Insight[] {
  const withPunct = tests.filter((t) => t.punctuation);
  const without = tests.filter((t) => !t.punctuation);
  if (withPunct.length < 5 || without.length < 5) return [];

  const delta = mean(without.map((t) => t.wpm)) - mean(withPunct.map((t) => t.wpm));
  if (Math.abs(delta) < 3) return [];

  return [
    {
      id: 'punctuation',
      tone: delta > 0 ? 'down' : 'up',
      text:
        delta > 0
          ? `Punctuation costs you ${delta.toFixed(1)} WPM.`
          : `You type ${Math.abs(delta).toFixed(1)} WPM faster with punctuation on.`,
    },
  ];
}

function weakKey(tests: TestResult[]): Insight[] {
  const weak = weakestKeys(tests, 1);
  if (weak.length === 0) return [];
  const key = weak[0];

  const all = tests.flatMap((t) => t.tallies);
  const totalAttempts = all.reduce((s, t) => s + t.count, 0);
  const totalErrors = all.filter((t) => t.typed !== t.expected).reduce((s, t) => s + t.count, 0);
  if (totalAttempts === 0) return [];
  const meanAccuracy = (totalAttempts - totalErrors) / totalAttempts;
  if (meanAccuracy - key.accuracy < 0.05) return [];

  const suffix = key.confusedWith && key.confusedWith !== '⌫' ? ` — usually typed as "${key.confusedWith}".` : '.';
  return [
    {
      id: 'weak-key',
      tone: 'down',
      text: `Your weakest key is "${key.key}" at ${(key.accuracy * 100).toFixed(0)}% accuracy${suffix}`,
    },
  ];
}

function timeOfDay(tests: TestResult[]): Insight[] {
  if (tests.length < 15) return [];
  const parts: Record<string, number[]> = { morning: [], afternoon: [], evening: [], night: [] };
  for (const test of tests) {
    const hour = new Date(test.createdAt).getHours();
    const part = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    parts[part].push(test.accuracy);
  }

  const populated = Object.entries(parts).filter(([, v]) => v.length >= 5);
  if (populated.length < 2) return [];

  const ranked = populated.map(([k, v]) => ({ part: k, accuracy: mean(v), n: v.length })).sort((a, b) => b.accuracy - a.accuracy);
  if (ranked[0].accuracy - ranked[1].accuracy < 2) return [];

  return [
    {
      id: 'time-of-day',
      tone: 'neutral',
      text: `You are most accurate in the ${ranked[0].part}.`,
    },
  ];
}

/** How many more tests are needed before insights become meaningful. */
export function testsUntilInsights(tests: TestResult[]): number {
  return Math.max(0, 10 - scoreable(tests).length);
}

/** Spread of a user's WPM — used on the consistency panel. */
export function wpmSpread(tests: TestResult[]): { mean: number; sd: number } {
  const wpm = scoreable(tests).map((t) => t.wpm);
  return { mean: mean(wpm), sd: stdDev(wpm) };
}
