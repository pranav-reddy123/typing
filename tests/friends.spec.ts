import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signUp, uniqueUser } from './helpers';

async function openAccount(context: BrowserContext, prefix: string) {
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.removeItem('baud:session');
  });
  const user = uniqueUser(prefix);
  await signUp(page, user);
  return { page, user };
}

async function closeAll(...pages: Page[]) {
  for (const page of pages) await page.close();
}

test.describe('friends', () => {
  test('an empty friends list says what to do next', async ({ page }) => {
    await signUp(page, uniqueUser('alone'));
    await page.goto('/friends');
    await expect(page.getByText('No friends yet.')).toBeVisible();
    await expect(page.getByText('Type a username to look someone up.')).toBeVisible();
  });

  test('search needs two characters and reports no matches honestly', async ({ page }) => {
    await signUp(page, uniqueUser('searcher'));
    await page.goto('/friends');
    await page.getByLabel('Search by username').fill('zzqq_nobody');
    await expect(page.getByText(/No accounts match/)).toBeVisible();
  });

  test('a request can be sent, accepted, and shows up on both sides', async ({ context }) => {
    const a = await openAccount(context, 'sender');
    const b = await openAccount(context, 'receiver');

    await a.page.goto('/friends');
    await a.page.getByLabel('Search by username').fill(b.user.username);
    await a.page.getByRole('button', { name: 'Add friend' }).click();
    await expect(a.page.getByText(/Request sent to/)).toBeVisible();

    await b.page.goto('/friends');
    await expect(b.page.getByText(a.user.username).first()).toBeVisible();
    await b.page.getByRole('button', { name: 'Accept' }).click();
    await expect(b.page.getByText(/are now friends/)).toBeVisible();

    await a.page.reload();
    await expect(a.page.getByRole('heading', { name: '1 friend' })).toBeVisible();

    await closeAll(a.page, b.page);
  });

  test('a request can be declined and does not create a friendship', async ({ context }) => {
    const a = await openAccount(context, 'asker');
    const b = await openAccount(context, 'decliner');

    await a.page.goto('/friends');
    await a.page.getByLabel('Search by username').fill(b.user.username);
    await a.page.getByRole('button', { name: 'Add friend' }).click();

    await b.page.goto('/friends');
    await b.page.getByRole('button', { name: 'Decline' }).click();
    await expect(b.page.getByText('Request declined.')).toBeVisible();
    await expect(b.page.getByText('No friends yet.')).toBeVisible();

    await closeAll(a.page, b.page);
  });

  test('a friend can be removed', async ({ context }) => {
    const a = await openAccount(context, 'keeper');
    const b = await openAccount(context, 'leaver');

    await a.page.goto('/friends');
    await a.page.getByLabel('Search by username').fill(b.user.username);
    await a.page.getByRole('button', { name: 'Add friend' }).click();

    await b.page.goto('/friends');
    await b.page.getByRole('button', { name: 'Accept' }).click();
    await expect(b.page.getByRole('heading', { name: '1 friend' })).toBeVisible();

    await b.page.getByRole('button', { name: 'Remove' }).click();
    await expect(b.page.getByText('No friends yet.')).toBeVisible();

    await closeAll(a.page, b.page);
  });
});
