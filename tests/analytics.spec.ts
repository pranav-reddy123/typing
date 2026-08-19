import { expect, test } from '@playwright/test';
import { signUp, typeAllWords, uniqueUser } from './helpers';

async function takeTest(page: import('@playwright/test').Page) {
  await page.goto('/practice');
  await page.getByRole('group', { name: 'Test mode' }).getByRole('button', { name: 'words' }).click();
  await page.getByRole('group', { name: 'Word count' }).getByRole('button', { name: '10', exact: true }).click();
  await typeAllWords(page);
  await expect(page.getByRole('region', { name: 'Test results' })).toBeVisible();
}

test.describe('analytics', () => {
  test('an empty dashboard invites a first test instead of showing a fake chart', async ({ page }) => {
    await signUp(page, uniqueUser('empty'));
    await page.goto('/dashboard');
    await expect(page.getByText('No typing tests yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start typing' })).toBeVisible();
  });

  test('a completed test populates the dashboard with real numbers', async ({ page }) => {
    await signUp(page, uniqueUser('analyst'));
    await takeTest(page);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /1 test in the last/ })).toBeVisible();
    await expect(page.getByText('Avg WPM')).toBeVisible();
    await expect(page.getByText('Keyboard')).toBeVisible();

    // With one test there is no trend, and the product says so rather than
    // drawing a line through a single point.
    await expect(page.getByText('Two days of tests will draw a trend line.').first()).toBeVisible();
  });

  test('insights stay silent until there is enough data', async ({ page }) => {
    await signUp(page, uniqueUser('insight'));
    await takeTest(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/Not enough data yet for reliable insights/)).toBeVisible();
  });

  test('history lists the test, sorts, and opens a detail view', async ({ page }) => {
    await signUp(page, uniqueUser('historian'));
    await takeTest(page);

    await page.goto('/history');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(2); // header + one test

    await page.getByRole('button', { name: 'wpm' }).click();
    await expect(page.getByRole('button', { name: /wpm/ })).toBeVisible();

    await page.getByRole('button', { name: /Open the test from/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Consistency')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('a filter with no matches explains itself', async ({ page }) => {
    await signUp(page, uniqueUser('filterer'));
    await takeTest(page);

    await page.goto('/history');
    await page.getByRole('group', { name: 'Filter by mode' }).getByRole('button', { name: 'quote' }).click();
    await expect(page.getByText('Nothing matches that filter.')).toBeVisible();
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('the profile shows the account and its records', async ({ page }) => {
    const user = uniqueUser('profiler');
    await signUp(page, user);
    await takeTest(page);

    await page.goto(`/profile/${user.username}`);
    await expect(page.getByRole('heading', { name: user.username })).toBeVisible();
    await expect(page.getByText('Best WPM')).toBeVisible();
    // Scoped to the achievements list: the achievement toast carries the same
    // words and would otherwise make this ambiguous.
    await expect(page.getByRole('listitem').filter({ hasText: 'First run' })).toBeVisible();
  });

  test('an unknown profile does not 500 or blank out', async ({ page }) => {
    await page.goto('/profile/definitely_not_a_user');
    await expect(page.getByText(/No account called/)).toBeVisible();
  });

  test('the leaderboard ranks a real result', async ({ page }) => {
    const user = uniqueUser('ranker');
    await signUp(page, user);
    await takeTest(page);

    await page.goto('/leaderboard');
    await expect(page.getByRole('table')).toBeVisible();
    // Scoped to the table — the header also links to your own profile.
    await expect(
      page.getByRole('table').getByRole('link', { name: new RegExp(user.username) }),
    ).toBeVisible();
  });
});
