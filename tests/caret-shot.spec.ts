import { test } from '@playwright/test';

/** Zoomed capture of the caret sitting on the text. CAPTURE=1 to regenerate. */
test('caret closeup', async ({ page }) => {
  test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to regenerate');

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto('/practice');
  const input = page.locator('#typing-input');
  await input.click();

  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.typing-words .word'))
      .slice(0, 5)
      .map((n) => n.textContent ?? '')
      .join(' '),
  );
  await input.pressSequentially(text, { delay: 45 });
  await page.waitForTimeout(400);

  const box = await page.locator('.typing-viewport').boundingBox();
  if (!box) throw new Error('no typing viewport');
  await page.screenshot({
    path: 'screens/30-caret-closeup.png',
    clip: { x: box.x, y: box.y - 4, width: Math.min(box.width, 560), height: 56 },
  });
});
