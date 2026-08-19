import type { Difficulty } from './words';

export type TestMode = 'time' | 'words' | 'quote' | 'custom' | 'zen';

export interface TestConfig {
  mode: TestMode;
  /** seconds for `time`, word count for `words`; ignored otherwise */
  target: number;
  punctuation: boolean;
  numbers: boolean;
  difficulty: Difficulty;
  language: string;
  customText: string;
}

export const DEFAULT_CONFIG: TestConfig = {
  mode: 'time',
  target: 30,
  punctuation: false,
  numbers: false,
  difficulty: 'normal',
  language: 'english',
  customText: '',
};

export const TIME_TARGETS = [15, 30, 60, 120] as const;
export const WORD_TARGETS = [10, 25, 50, 100, 250] as const;

export interface CharCounts {
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
}

/** One second of the test, sampled by the engine. */
export interface Sample {
  t: number;
  wpm: number;
  raw: number;
  errors: number;
}

/** (expected, typed) -> count. `typed` is null for an omitted character. */
export interface KeyTally {
  expected: string;
  typed: string | null;
  count: number;
}

export interface TestResult {
  id: string;
  userId: string | null;
  mode: TestMode;
  target: number;
  durationS: number;
  language: string;
  punctuation: boolean;
  numbers: boolean;
  difficulty: Difficulty;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  chars: CharCounts;
  keystrokes: number;
  words: number;
  errors: number;
  samples: Sample[];
  tallies: KeyTally[];
  raceId: string | null;
  createdAt: number;
}
