import { expect, test } from '@playwright/test';

/**
 * The caret must sit on the text, not below it.
 *
 * It is positioned with a transform against the active character's box, so this
 * measures the painted rectangles rather than trusting the arithmetic: the
 * caret's top should meet the character cell's top, and its bottom should land
 * on the baseline rather than hanging past the descender.
 */
async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const caret = document.querySelector('.caret') as HTMLElement;
    const words = Array.from(document.querySelectorAll('.typing-words .word'));
    // The character the caret is currently in front of.
    const active =
      (document.querySelector('.typing-words .c-pending') as HTMLElement | null) ??
      (words[0].firstChild as HTMLElement);
    const c = caret.getBoundingClientRect();
    const g = active.getBoundingClientRect();
    return {
      caretTop: c.top,
      caretBottom: c.bottom,
      caretHeight: c.height,
      cellTop: g.top,
      cellBottom: g.bottom,
      cellHeight: g.height,
    };
  });
}

test.describe('caret alignment', () => {
  test('the caret sits on the character cell, not below it', async ({ page }) => {
    await page.goto('/practice');
    await page.locator('#typing-input').click();
    await page.waitForTimeout(200);

    const m = await measure(page);

    // Top edges meet.
    expect(Math.abs(m.caretTop - m.cellTop)).toBeLessThanOrEqual(1.5);
    // The caret ends at the baseline, comfortably above the descender.
    expect(m.caretBottom).toBeLessThan(m.cellBottom);
    // And it is not a stub: it covers most of the cell.
    expect(m.caretHeight / m.cellHeight).toBeGreaterThan(0.7);
  });

  test('the caret stays aligned after the text wraps to a new line', async ({ page }) => {
    await page.goto('/practice');
    const input = page.locator('#typing-input');
    await input.click();

    // Type past the first two lines so the viewport scrolls.
    const text = await page.evaluate(() => {
      const words = Array.from(document.querySelectorAll('.typing-words .word'));
      const firstTop = (words[0] as HTMLElement).offsetTop;
      const thirdLine = words.filter((w) => (w as HTMLElement).offsetTop > firstTop);
      const upto = words.indexOf(thirdLine[0]) + 4;
      return words.slice(0, upto).map((w) => w.textContent ?? '').join(' ') + ' ';
    });
    await input.pressSequentially(text, { delay: 15 });
    await page.waitForTimeout(300);

    const m = await measure(page);
    expect(Math.abs(m.caretTop - m.cellTop)).toBeLessThanOrEqual(1.5);
    expect(m.caretBottom).toBeLessThan(m.cellBottom);
  });
});
