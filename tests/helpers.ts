import type { Page } from '@playwright/test';

export function uniqueUser(prefix = 'tester') {
  const id = Math.random().toString(36).slice(2, 8);
  return {
    username: `${prefix}_${id}`,
    email: `${prefix}_${id}@example.com`,
    password: 'baudpass123',
  };
}

export async function signUp(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/dashboard|practice/);
}

/**
 * Types the visible passage. Reads the words straight from the DOM so the test
 * follows whatever the seeded generator produced.
 */
export async function typeTest(page: Page, words = 12): Promise<void> {
  const input = page.locator('#typing-input');
  await input.click();

  const text = await page.evaluate((count) => {
    const nodes = Array.from(document.querySelectorAll('.typing-words .word'));
    return nodes
      .slice(0, count)
      .map((n) => n.textContent ?? '')
      .join(' ');
  }, words);

  await input.pressSequentially(text, { delay: 60 });
}

export async function typeAllWords(page: Page): Promise<void> {
  const input = page.locator('#typing-input');
  await input.click();
  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.typing-words .word'))
      .map((n) => n.textContent ?? '')
      .join(' '),
  );
  // ~90 ms per key keeps the synthetic run inside the plausibility window the
  // provider enforces (results above 400 wpm are rejected, by design).
  await input.pressSequentially(text, { delay: 90 });
}
