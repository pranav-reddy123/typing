import { expect, test } from '@playwright/test';

/**
 * The hard requirement is 60 fps during typing. These measure the two things
 * that would break it: the cost of handling one keystroke, and whether any
 * single task blocks the main thread long enough to drop frames.
 */
test.describe('performance', () => {
  test('a keystroke costs well under one frame', async ({ page }) => {
    await page.goto('/practice');
    await page.locator('#typing-input').click();

    const result = await page.evaluate(async () => {
      const input = document.querySelector('#typing-input') as HTMLInputElement;
      const letters = 'the quick brown fox jumps over a lazy dog and then keeps going for a while';
      const samples: number[] = [];

      for (let round = 0; round < 4; round++) {
        for (const char of letters) {
          const start = performance.now();
          input.dispatchEvent(
            new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }),
          );
          samples.push(performance.now() - start);
        }
      }

      const first = samples[0];
      const rest = samples.slice(1).sort((a, b) => a - b);
      const worstIndex = samples.indexOf(Math.max(...samples));
      return {
        count: samples.length,
        first,
        worstIndex,
        median: rest[Math.floor(rest.length / 2)],
        p95: rest[Math.floor(rest.length * 0.95)],
        max: rest[rest.length - 1],
      };
    });

    console.log(
      `keystroke cost — n=${result.count} first=${result.first.toFixed(3)}ms ` +
        `median=${result.median.toFixed(3)}ms p95=${result.p95.toFixed(3)}ms ` +
        `max=${result.max.toFixed(3)}ms worstAtIndex=${result.worstIndex}`,
    );

    // One frame at 60 fps is 16.7 ms. A keystroke must not come close.
    expect(result.p95).toBeLessThan(4);
    expect(result.max).toBeLessThan(16);
  });

  test('typing produces no long tasks', async ({ page }) => {
    await page.goto('/practice');
    await page.locator('#typing-input').click();

    await page.evaluate(() => {
      (window as unknown as { __long: number[] }).__long = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as unknown as { __long: number[] }).__long.push(entry.duration);
        }
      }).observe({ entryTypes: ['longtask'] });
    });

    const text = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.typing-words .word'))
        .slice(0, 20)
        .map((n) => n.textContent ?? '')
        .join(' '),
    );
    await page.locator('#typing-input').pressSequentially(text, { delay: 25 });

    const longTasks = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    console.log(`long tasks during typing: ${longTasks.length} ${JSON.stringify(longTasks)}`);
    expect(longTasks.filter((d) => d > 50).length).toBe(0);
  });

  test('the eager bundle stays small and defers the rest', async ({ page }) => {
    const scripts: Array<{ url: string; size: number }> = [];
    page.on('response', async (response) => {
      if (response.url().endsWith('.js') && response.status() === 200) {
        try {
          scripts.push({ url: response.url(), size: (await response.body()).length });
        } catch {
          /* body already consumed */
        }
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    const total = scripts.reduce((s, f) => s + f.size, 0);
    console.log(
      `initial JS: ${(total / 1024).toFixed(1)} kB across ${scripts.length} files\n` +
        scripts.map((s) => `  ${s.url.split('/').pop()} ${(s.size / 1024).toFixed(1)} kB`).join('\n'),
    );

    // Supabase must never appear on a route that does not use it.
    expect(scripts.some((s) => s.url.includes('supabase'))).toBe(false);
    expect(total).toBeLessThan(700 * 1024);
  });
});
