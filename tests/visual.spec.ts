import { test } from '@playwright/test';
import { signUp, typeAllWords, uniqueUser } from './helpers';

/**
 * Not assertions — a capture pass. Run with `npx playwright test visual` to
 * regenerate the screenshots used for design review.
 */
test.describe('visual capture', () => {
  test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to regenerate design screenshots');

  test('capture every route', async ({ page }) => {
    const shot = async (name: string) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `screens/${name}.png`, fullPage: true });
    };

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/');
    await shot('01-home');

    await page.goto('/practice');
    await shot('02-practice');

    const user = uniqueUser('shot');
    await signUp(page, user);

    for (let i = 0; i < 3; i++) {
      await page.goto('/practice');
      await page.getByRole('group', { name: 'Test mode' }).getByRole('button', { name: 'words' }).click();
      await page.getByRole('group', { name: 'Word count' }).getByRole('button', { name: '10', exact: true }).click();
      await typeAllWords(page);
      await page.waitForTimeout(600);
      if (i === 0) await shot('03-results');
    }

    await page.goto('/dashboard');
    await shot('04-dashboard');

    await page.goto('/history');
    await shot('05-history');

    await page.goto('/leaderboard');
    await shot('06-leaderboard');

    await page.goto('/friends');
    await shot('07-friends');

    await page.goto('/race');
    await shot('08-race-lobby');

    await page.getByRole('button', { name: 'Race a friend' }).click();
    await page.waitForURL(/\/race\/[A-Z0-9]{4}$/);
    await shot('09-race-room');

    await page.goto(`/profile/${user.username}`);
    await shot('10-profile');

    await page.goto('/settings');
    await shot('11-settings');

    await page.goto('/login');
    await shot('12-login');

    await page.goto('/nowhere');
    await shot('13-notfound');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/practice');
    await shot('20-mobile-practice');
    await page.goto('/dashboard');
    await shot('21-mobile-dashboard');
    await page.goto('/');
    await shot('22-mobile-home');
  });
});
