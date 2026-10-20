import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, ...(process.env.COMRADE_BROWSER_CHANNEL ? { channel: process.env.COMRADE_BROWSER_CHANNEL } : {}) });
await mkdir('build/evidence', { recursive: true });
try {
  for (const faction of ['gdi', 'nod']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    await page.addInitScript(() => {
      window.__comradeAudioSources = 0;
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) { window.__comradeAudioSources++; return original.apply(this, args); };
    });
    const errors = [];
    const engineRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/engines\/vanillatd\.(js|wasm)(\?|$)/.test(request.url())) engineRequests.push(request.url()); });
    await page.goto(process.env.COMRADE_URL || 'http://127.0.0.1:3001');
    assert.equal(await page.locator('input[type=file]').count(), 0);
    if (faction === 'nod') await page.getByRole('button', { name: 'NOD Brotherhood of Nod' }).click();
    await page.getByRole('button', { name: `DEPLOY ${faction.toUpperCase()} FORCES` }).click();
    await page.waitForFunction(() => window.comrade?.snapshot().frame > 30, null, { timeout: 120000 });
    const release = await page.evaluate(async () => (await (await fetch('/health', { cache: 'no-store' })).json()).commit);
    assert.equal(engineRequests.length, 2);
    for (const request of engineRequests) assert.equal(new URL(request).searchParams.get('release'), release, 'Engine JS and WASM must match the deployed release');
    const initial = await page.evaluate(() => window.comrade.snapshot());
    assert.equal(initial.credits, 6000);
    assert.equal(initial.power, 140);
    assert.equal(initial.buildings, 4);
    await page.getByRole('button', { name: /ENABLE GAME AUDIO|SOUND ENABLED/ }).click();
    await page.waitForFunction(() => window.comrade.snapshot().audioRunning === true, null, { timeout: 10000 });
    console.log(`${faction}: simulation and OpenAL context running`);
    if (faction === 'gdi') {
      await page.getByTestId('engine-status').filter({ hasText: 'Battlefield active' }).waitFor();
      const box = await page.locator('canvas').boundingBox();
      const click = async (x, y) => {
        await page.mouse.move(box.x + x * box.width / 640, box.y + y * box.height / 400);
        await page.waitForTimeout(200);
        await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
        await page.waitForTimeout(200);
      };
      const before = await page.evaluate(() => window.comrade.snapshot());
      const tank = before.entities.find(e => e.id === 1);
      const x = (tank.cell % 64 - before.camera % 64) * 24;
      const y = (Math.floor(tank.cell / 64) - Math.floor(before.camera / 64)) * 24 + 14;
      // Drag around the cell to tolerate the original engine's subcell camera offset.
      await page.mouse.move(box.x + (x - 24) * box.width / 640, box.y + (y - 24) * box.height / 400);
      await page.waitForTimeout(200); await page.mouse.down();
      await page.mouse.move(box.x + (x + 24) * box.width / 640, box.y + (y + 24) * box.height / 400, { steps: 8 });
      await page.waitForTimeout(200); await page.mouse.up();
      await page.waitForFunction(() => window.comrade.snapshot().selected === 1);
      await click(x + 48, y + 24);
      await page.waitForFunction(cell => window.comrade.snapshot().entities.find(e => e.id === 1).cell !== cell, tank.cell, { timeout: 15000 });
      console.log('Real browser mouse selection and native movement passed');
      const order = (action, extra = {}) => page.evaluate(({ action, extra }) => window.comrade.order({ version: 1, type: 'order', sequence: 1, tick: window.comrade.snapshot().frame, action, entities: [], ...extra }), { action, extra });
      assert.equal(await order('harvest', { entities: [0], cell: 1554 }), 1);
      assert.equal(await order('attack', { entities: [1], target: 20008 }), 1);
      assert.equal(await order('build', { item: 'NUKE' }), 1);
      // Production and proximity are evaluated by the native engine, without cheats.
      await page.waitForFunction(() => window.comrade.snapshot().spent >= 300, null, { timeout: 45000 });
      let placed = false;
      for (let attempt = 0; attempt < 30 && !placed; attempt++) {
        for (const cell of [655, 654, 716, 715, 846, 847, 910]) {
          if (await order('place', { item: 'NUKE', cell })) { placed = true; break; }
        }
        if (!placed) await page.waitForTimeout(1000);
      }
      assert.equal(placed, true, 'Native construction placement must succeed');
      await page.waitForFunction(() => window.comrade.snapshot().power >= 240, null, { timeout: 15000 });
      console.log('Native power plant placed and generating power');
      assert.equal(await order('train', { item: 'E1' }), 1);
      await page.waitForFunction(() => window.comrade.snapshot().entities.filter(e => e.owner === 0 && e.name === 'E1').length > 5, null, { timeout: 45000 });
      console.log('Native infantry production and exit passed');
      await page.waitForFunction(() => window.comrade.snapshot().harvested > 0, null, { timeout: 90000 });
      await page.waitForFunction(() => { const target = window.comrade.snapshot().entities.find(e => e.id === 20008); return !target || target.hp < 50; }, null, { timeout: 60000 });
      console.log('GDI native economy, construction, placement, training, combat and OpenAL audio passed:', await page.evaluate(() => window.comrade.snapshot()));
      assert.ok(await page.evaluate(() => window.__comradeAudioSources > 0), 'Native audio must schedule actual sound buffers');
    }
    await page.screenshot({ path: `build/evidence/${faction}-battlefield.png`, fullPage: true });
    assert.deepEqual(errors, [], 'Browser must not emit uncaught errors');
    console.log(`${faction}: bundled content, native simulation and audio passed`);
    await page.close();
  }
} finally { await browser.close(); }
