import type { ProfileStats } from '../data/types';
import type { TestResult } from '../typing/types';
import { longestStreak } from '../analytics/aggregate';
import { isScoreable } from '../typing/metrics';

export interface Achievement {
  key: string;
  title: string;
  description: string;
  /** Sorting weight — higher tiers sit later in the grid. */
  tier: 1 | 2 | 3;
}

/**
 * Achievements name a measurable threshold and nothing else. No points, no
 * levels, no exclamation marks.
 */
export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first_test', title: 'First run', description: 'Complete a typing test', tier: 1 },
  { key: 'tests_100', title: 'Hundred', description: 'Complete 100 tests', tier: 2 },
  { key: 'tests_1000', title: 'Thousand', description: 'Complete 1,000 tests', tier: 3 },
  { key: 'wpm_100', title: '100 wpm', description: 'Finish a test at 100 wpm', tier: 2 },
  { key: 'wpm_120', title: '120 wpm', description: 'Finish a test at 120 wpm', tier: 2 },
  { key: 'wpm_150', title: '150 wpm', description: 'Finish a test at 150 wpm', tier: 3 },
  { key: 'accuracy_99', title: '99% accurate', description: 'Finish a test at 99% accuracy', tier: 2 },
  { key: 'accuracy_100', title: 'Clean sheet', description: 'Finish a test without a single error', tier: 3 },
  { key: 'consistency_90', title: 'Metronome', description: 'Finish a test at 90% consistency', tier: 2 },
  { key: 'hours_10', title: '10 hours', description: 'Spend 10 hours typing', tier: 2 },
  { key: 'streak_7', title: '7 day streak', description: 'Type on 7 consecutive days', tier: 1 },
  { key: 'streak_30', title: '30 day streak', description: 'Type on 30 consecutive days', tier: 3 },
  { key: 'race_win', title: 'First win', description: 'Win a race', tier: 1 },
  { key: 'race_win_10', title: 'Ten wins', description: 'Win 10 races', tier: 2 },
];

export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

/**
 * Pure evaluation against real records. Returns every key the user qualifies
 * for; the caller diffs against what is already granted.
 */
export function evaluateAchievements(tests: TestResult[], stats: ProfileStats): string[] {
  const earned: string[] = [];
  const add = (key: string, condition: boolean) => {
    if (condition) earned.push(key);
  };

  const valid = tests.filter(isScoreable);
  const bestWpm = valid.length ? Math.max(...valid.map((t) => t.wpm)) : 0;
  const bestAccuracy = valid.length ? Math.max(...valid.map((t) => t.accuracy)) : 0;
  const bestConsistency = valid.length ? Math.max(...valid.map((t) => t.consistency)) : 0;
  const flawless = valid.some((t) => t.errors === 0 && t.keystrokes > 50);

  add('first_test', tests.length >= 1);
  add('tests_100', tests.length >= 100);
  add('tests_1000', tests.length >= 1000);
  add('wpm_100', bestWpm >= 100);
  add('wpm_120', bestWpm >= 120);
  add('wpm_150', bestWpm >= 150);
  add('accuracy_99', bestAccuracy >= 99);
  add('accuracy_100', flawless);
  add('consistency_90', bestConsistency >= 90);
  add('hours_10', stats.typingSeconds >= 36000);
  add('streak_7', longestStreak(tests) >= 7);
  add('streak_30', longestStreak(tests) >= 30);
  add('race_win', stats.racesWon >= 1);
  add('race_win_10', stats.racesWon >= 10);

  return earned;
}
