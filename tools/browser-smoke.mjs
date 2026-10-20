import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, ...(process.env.COMRADE_BROWSER_CHANNEL ? { channel: process.env.COMRADE_BROWSER_CHANNEL } : {}) });
try {
  for (const game of ['td', 'ra']) {
    const page = await browser.newPage();
    await page.goto(process.env.COMRADE_URL || 'http://127.0.0.1:3001');
    await page.selectOption('#game', game);
    await page.getByRole('button', { name: '01 / Initialize WASM' }).click();
    await page.getByTestId('engine-status').filter({ hasText: 'WASM initialized · MEMFS verified' }).waitFor({ timeout: 120000 });
    console.log(`${game}: actual WASM initialization and MEMFS read/write passed`);
    await page.close();
  }
} finally { await browser.close(); }
