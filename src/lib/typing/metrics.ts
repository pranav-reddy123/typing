import type { CharCounts, Sample } from './types';

/**
 * The single source of truth for every metric in the product.
 * Nothing else in the codebase may compute WPM, accuracy or consistency.
 *
 * A "word" is five characters — the standard convention, so results are
 * comparable with every other typing test that reports WPM.
 */
const CHARS_PER_WORD = 5;

/** Net WPM: only characters correct at submission count. */
export function netWpm(correctChars: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return (correctChars / CHARS_PER_WORD) / (seconds / 60);
}

/** Raw WPM: every keystroke counts, right or wrong. */
export function rawWpm(typedChars: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return (typedChars / CHARS_PER_WORD) / (seconds / 60);
}

/** Accuracy over the whole test, including keystrokes later corrected. */
export function accuracy(correctKeystrokes: number, totalKeystrokes: number): number {
  if (totalKeystrokes <= 0) return 100;
  return (correctKeystrokes / totalKeystrokes) * 100;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/**
 * Consistency = 100 × (1 − coefficient of variation) of per-second raw WPM.
 * An even typist scores near 100; one who bursts and stalls scores low even at
 * the same average speed. Floored at 0 — a CV above 1 is already "not steady".
 */
export function consistency(samples: Sample[]): number {
  const raw = samples.map((s) => s.raw).filter((v) => v > 0);
  if (raw.length < 2) return 0;
  const m = mean(raw);
  if (m === 0) return 0;
  const cv = stdDev(raw) / m;
  return Math.max(0, Math.min(100, (1 - cv) * 100));
}

export function totalChars(c: CharCounts): number {
  return c.correct + c.incorrect + c.extra + c.missed;
}

export function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * Whether a test counts toward averages, records and leaderboards.
 *
 * Keystrokes, not duration: a 10-word test can legitimately finish in four
 * seconds, and a duration floor would silently erase a whole mode. What we
 * actually want to exclude is a test nobody really took.
 */
export function isScoreable(test: { keystrokes: number; durationS: number }): boolean {
  return test.keystrokes >= 20 && test.durationS >= 1;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** "4h 12m" — used for total typing time on the dashboard and profiles. */
export function formatLongDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
