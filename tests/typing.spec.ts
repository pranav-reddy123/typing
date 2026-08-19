import { expect, test } from '@playwright/test';
import { typeAllWords, typeTest } from './helpers';

test.describe('typing surface', () => {
  test('marks correct and incorrect characters as you type', async ({ page }) => {
    await page.goto('/practice');
    await page.locator('#typing-input').click();

    const firstWord = await page.locator('.typing-words .word').first().textContent();
    expect(firstWord).toBeTruthy();

    await page.locator('#typing-input').pressSequentially(firstWord!.slice(0, 3), { delay: 20 });
    await expect(page.locator('.typing-words .word').first().locator('.c-correct')).toHaveCount(3);

    await page.locator('#typing-input').press('Backspace');
    await expect(page.locator('.typing-words .word').first().locator('.c-correct')).toHaveCount(2);
  });

  test('flags a wrong character', async ({ page }) => {
    await page.goto('/practice');
    await page.locator('#typing-input').click();

    const first = await page.locator('.typing-words .word').first().textContent();
    const wrong = first![0] === 'z' ? 'q' : 'z';
    await page.locator('#typing-input').pressSequentially(wrong, { delay: 20 });

    await expect(page.locator('.typing-words .c-incorrect').first()).toBeVisible();
  });

  test('a words test completes and shows results', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('group', { name: 'Test mode' }).getByRole('button', { name: 'words' }).click();
    await page.getByRole('group', { name: 'Word count' }).getByRole('button', { name: '10', exact: true }).click();

    await typeAllWords(page);

    await expect(page.getByRole('region', { name: 'Test results' })).toBeVisible();
    await expect(page.getByText('Words per minute')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry this text' })).toBeVisible();
  });

  test('results report a plausible speed and full accuracy for clean typing', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('group', { name: 'Test mode' }).getByRole('button', { name: 'words' }).click();
    await page.getByRole('group', { name: 'Word count' }).getByRole('button', { name: '10', exact: true }).click();

    await typeAllWords(page);
    await expect(page.getByRole('region', { name: 'Test results' })).toBeVisible();

    const accuracy = await page.locator('text=Accuracy').first().isVisible();
    expect(accuracy).toBe(true);

    // 100% accuracy when every keystroke matched.
    await expect(page.getByText('100.0%').first()).toBeVisible();
  });

  test('escape restarts the test', async ({ page }) => {
    await page.goto('/practice');
    await typeTest(page, 3);
    await expect(page.locator('.typing-words .c-correct').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.typing-words .c-correct')).toHaveCount(0);
  });

  test('configuration persists across a reload', async ({ page }) => {
    await page.goto('/practice');
    await page.getByRole('group', { name: 'Duration in seconds' }).getByRole('button', { name: '60' }).click();
    await page.reload();
    await expect(
      page.getByRole('group', { name: 'Duration in seconds' }).getByRole('button', { name: '60' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('the whole test is reachable with the keyboard alone', async ({ page }) => {
    // The practice route focuses the typing input on load by design — you can
    // start typing without touching the mouse. The skip link is verified on a
    // route that does not claim focus.
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    await page.goto('/practice');
    await expect(page.locator('#typing-input')).toBeFocused();
    await typeTest(page, 2);
    await expect(page.locator('.typing-words .c-correct').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.typing-words .c-correct')).toHaveCount(0);
  });
});
