import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signUp, uniqueUser } from './helpers';

/**
 * Two tabs in one browser profile, signed in as two different accounts, joined
 * to the same race. They have separate React trees, separate stores and
 * separate engines; the only thing they share is the BroadcastChannel bus.
 *
 * That bus is origin-scoped, so both players must live in the same browser
 * context — exactly the real-world local case. Sessions are tab-scoped
 * (`sessionStorage`), which is what lets the two tabs hold different accounts.
 */
async function openPlayer(context: BrowserContext, prefix: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.removeItem('baud:session');
  });
  await signUp(page, uniqueUser(prefix));
  return page;
}

test.describe('multiplayer races', () => {
  test('creating a race produces a shareable four-character code', async ({ page }) => {
    await signUp(page, uniqueUser('host'));
    await page.goto('/race');
    await page.getByRole('button', { name: 'Race a friend' }).click();

    await page.waitForURL(/\/race\/[A-Z0-9]{4}$/);
    await expect(page.getByText(/RACE-[A-Z0-9]{4}/)).toBeVisible();
    await expect(page.getByText('Waiting for players…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
  });

  test('a bad code explains itself instead of hanging', async ({ page }) => {
    await signUp(page, uniqueUser('lost'));
    await page.goto('/race/ZZZZ');
    await expect(page.getByText('No race with that code.')).toBeVisible();
  });

  test('joining with a malformed code is rejected in the form', async ({ page }) => {
    await signUp(page, uniqueUser('typo'));
    await page.goto('/race');
    await page.getByLabel('Invite code').fill('AB');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('Codes are four characters, like 8K2F.')).toBeVisible();
  });

  test('two players see each other, both ready up, and the race starts', async ({ context }) => {
    const host = await openPlayer(context, 'racehost');
    const guest = await openPlayer(context, 'raceguest');

    await host.goto('/race');
    await host.getByRole('button', { name: 'Race a friend' }).click();
    await host.waitForURL(/\/race\/[A-Z0-9]{4}$/);
    const code = host.url().split('/').pop()!;

    // The guest joins the same channel from an independent tab.
    await guest.goto(`/race/${code}`);

    await expect(host.getByText('2 players')).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByText('2 players')).toBeVisible({ timeout: 15_000 });

    await host.getByRole('button', { name: "I'm ready" }).click();
    await expect(guest.getByText('ready').first()).toBeVisible({ timeout: 10_000 });

    await guest.getByRole('button', { name: "I'm ready" }).click();

    // The countdown is driven by an absolute timestamp, so both start together.
    await expect(host.locator('#typing-input')).toBeVisible({ timeout: 20_000 });
    await expect(guest.locator('#typing-input')).toBeVisible({ timeout: 20_000 });

    await host.close();
    await guest.close();
  });

  test('progress from one player reaches the other', async ({ context }) => {
    const host = await openPlayer(context, 'prohost');
    const guest = await openPlayer(context, 'proguest');

    await host.goto('/race');
    await host.getByRole('button', { name: 'Race a friend' }).click();
    await host.waitForURL(/\/race\/[A-Z0-9]{4}$/);
    const code = host.url().split('/').pop()!;
    await guest.goto(`/race/${code}`);

    await expect(host.getByText('2 players')).toBeVisible({ timeout: 15_000 });
    await host.getByRole('button', { name: "I'm ready" }).click();
    await guest.getByRole('button', { name: "I'm ready" }).click();

    await expect(host.locator('.typing-words .word').first()).toBeVisible({ timeout: 20_000 });
    // Key events only reach the focused tab, and the guest was fronted last.
    await host.bringToFront();
    // Wait out the countdown before typing.
    await host.waitForTimeout(6000);

    const text = await host.evaluate(() =>
      Array.from(document.querySelectorAll('.typing-words .word'))
        .slice(0, 6)
        .map((n) => n.textContent ?? '')
        .join(' '),
    );
    await host.locator('#typing-input').click();
    await host.locator('#typing-input').pressSequentially(`${text} `, { delay: 45 });

    // The guest's copy of the host's row must move without any shared state.
    await expect
      .poll(
        async () =>
          guest.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('li span.tnum'));
            return cells.some((c) => {
              const value = parseInt(c.textContent ?? '0', 10);
              return Number.isFinite(value) && value > 0;
            });
          }),
        { timeout: 20_000 },
      )
      .toBe(true);

    await host.close();
    await guest.close();
  });
});
