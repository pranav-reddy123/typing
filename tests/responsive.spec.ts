import { expect, test } from '@playwright/test';
import { signUp, typeAllWords, uniqueUser } from './helpers';

const WIDTHS = [375, 390, 768, 1024, 1440, 1920];

/** Nothing may cause the page body to scroll sideways at any supported width. */
async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('responsive layout', () => {
  for (const width of WIDTHS) {
    test(`the home and practice routes fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Start typing' }).first()).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.goto('/practice');
      await expect(page.locator('.typing-words .word').first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }

  test('the dashboard and history fit on a 375px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signUp(page, uniqueUser('mobile'));

    await page.goto('/practice');
    await page.getByRole('group', { name: 'Test mode' }).getByRole('button', { name: 'words' }).click();
    await page.getByRole('group', { name: 'Word count' }).getByRole('button', { name: '10', exact: true }).click();
    await typeAllWords(page);
    await expect(page.getByRole('region', { name: 'Test results' })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto('/dashboard');
    await expect(page.getByText('Avg WPM')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto('/history');
    await expect(page.getByRole('table')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto('/leaderboard');
    await assertNoHorizontalOverflow(page);

    await page.goto('/race');
    await expect(page.getByRole('button', { name: 'Race a friend' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('typing works on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/practice');
    await page.locator('#typing-input').click();

    const first = await page.locator('.typing-words .word').first().textContent();
    await page.locator('#typing-input').pressSequentially(first!, { delay: 40 });
    await expect(page.locator('.typing-words .word').first().locator('.c-correct')).toHaveCount(
      first!.length,
    );
  });

  test('reduced motion disables the entrance animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Start typing' }).first()).toBeVisible();

    await page.goto('/practice');
    const caretAnimation = await page.evaluate(() => {
      const caret = document.querySelector('.caret');
      return caret ? getComputedStyle(caret).animationName : 'none';
    });
    expect(caretAnimation).toBe('none');
  });
});
