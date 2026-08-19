import { expect, test } from '@playwright/test';
import { signUp, typeAllWords, uniqueUser } from './helpers';

test.describe('authentication', () => {
  test('signup, sign out and sign back in', async ({ page }) => {
    const user = uniqueUser();
    await signUp(page, user);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: user.username })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('/');
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('Username or email').fill(user.username);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/dashboard/);
  });

  test('rejects a weak password with a specific message', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Email').fill('someone@example.com');
    await page.getByLabel('Username').fill('shortpass');
    await page.getByLabel('Password').fill('abc');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Password needs at least 8 characters.')).toBeVisible();
  });

  test('rejects an invalid username', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Email').fill('someone2@example.com');
    await page.getByLabel('Username').fill('ab');
    await page.getByLabel('Password').fill('baudpass123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Username needs at least 3 characters.')).toBeVisible();
  });

  test('does not reveal which half of a wrong credential failed', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill('nobody_at_all');
    await page.getByLabel('Password').fill('whateverpass1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Those credentials do not match an account.')).toBeVisible();
  });

  test('an auth-gated route redirects to login and returns you afterwards', async ({ page }) => {
    await page.goto('/history');
    await page.waitForURL(/login\?next=/);

    const user = uniqueUser();
    await page.goto('/signup');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/dashboard/);
  });

  test('tests taken before signing up move into the account', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('group', { name: 'Test mode' }).getByRole('button', { name: 'words' }).click();
    await page.getByRole('group', { name: 'Word count' }).getByRole('button', { name: '10', exact: true }).click();
    await typeAllWords(page);
    await expect(page.getByRole('region', { name: 'Test results' })).toBeVisible();

    await signUp(page, uniqueUser('claimer'));
    await page.goto('/history');
    await expect(page.getByRole('table')).toBeVisible();
  });
});
