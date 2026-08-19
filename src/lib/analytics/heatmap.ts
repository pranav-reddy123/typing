import type { TestResult } from '../typing/types';

/** Below this many attempts a key's accuracy is noise, not a weakness. */
export const MIN_ATTEMPTS = 20;

export const KEY_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export interface KeyStat {
  key: string;
  attempts: number;
  errors: number;
  accuracy: number;
  /** Whether we have enough attempts to say anything about this key. */
  reliable: boolean;
  /** The character most often typed instead. */
  confusedWith: string | null;
}

export interface ConfusionPair {
  expected: string;
  typed: string;
  count: number;
}

interface Tally {
  attempts: number;
  errors: number;
  wrong: Map<string, number>;
}

function collect(tests: TestResult[]): Map<string, Tally> {
  const map = new Map<string, Tally>();
  for (const test of tests) {
    for (const tally of test.tallies) {
      const key = tally.expected.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = { attempts: 0, errors: 0, wrong: new Map() };
        map.set(key, entry);
      }
      entry.attempts += tally.count;
      if (tally.typed !== tally.expected) {
        entry.errors += tally.count;
        const typed = tally.typed ?? '⌫';
        entry.wrong.set(typed, (entry.wrong.get(typed) ?? 0) + tally.count);
      }
    }
  }
  return map;
}

export function keyAccuracy(tests: TestResult[]): KeyStat[] {
  const map = collect(tests);
  const out: KeyStat[] = [];

  for (const row of KEY_ROWS) {
    for (const key of row) {
      const entry = map.get(key);
      if (!entry || entry.attempts === 0) {
        out.push({ key, attempts: 0, errors: 0, accuracy: 1, reliable: false, confusedWith: null });
        continue;
      }
      let confusedWith: string | null = null;
      let most = 0;
      for (const [typed, count] of entry.wrong) {
        if (count > most) {
          most = count;
          confusedWith = typed;
        }
      }
      out.push({
        key,
        attempts: entry.attempts,
        errors: entry.errors,
        accuracy: (entry.attempts - entry.errors) / entry.attempts,
        reliable: entry.attempts >= MIN_ATTEMPTS,
        confusedWith,
      });
    }
  }
  return out;
}

export function weakestKeys(tests: TestResult[], limit = 5): KeyStat[] {
  return keyAccuracy(tests)
    .filter((k) => k.reliable && k.errors > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}

export function confusionPairs(tests: TestResult[], limit = 8): ConfusionPair[] {
  const counts = new Map<string, ConfusionPair>();
  for (const test of tests) {
    for (const tally of test.tallies) {
      if (tally.typed === null || tally.typed === tally.expected) continue;
      const key = `${tally.expected}->${tally.typed}`;
      const found = counts.get(key);
      if (found) found.count += tally.count;
      else counts.set(key, { expected: tally.expected, typed: tally.typed, count: tally.count });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Overall error rate across every recorded keystroke in the range. */
export function errorRate(tests: TestResult[]): number {
  let keystrokes = 0;
  let errors = 0;
  for (const test of tests) {
    keystrokes += test.keystrokes;
    errors += test.errors;
  }
  return keystrokes === 0 ? 0 : errors / keystrokes;
}
