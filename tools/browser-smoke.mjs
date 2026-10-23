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
    const contentRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/engines\/vanillatd\.(js|wasm)(\?|$)/.test(request.url())) engineRequests.push(request.url()); });
    page.on('request', request => { if (/\/content\/td\/[^/]+\.(MIX|INI|BIN)(\?|$)/.test(request.url())) contentRequests.push(request.url()); });
    await page.goto(process.env.COMRADE_URL || 'http://127.0.0.1:3001');
    assert.equal(await page.locator('input[type=file]').count(), 0);
    // Registration-free war room: callsign, create a game, pick a side, launch.
    await page.getByLabel('Your name').fill(`Smoke ${faction}`);
    await page.getByRole('button', { name: /ENTER THE WAR ROOM/ }).click();
    await page.getByRole('button', { name: /CREATE A NEW GAME/ }).click();
    await page.getByRole('button', { name: /START OPERATION/ }).waitFor();
    assert.match(await page.locator('.room-share code').innerText(), /\?room=[a-z]+-\d{4}$/, 'Rooms must expose a shareable invite link');
    if (faction === 'nod') {
      await page.getByRole('button', { name: 'NOD Brotherhood of Nod' }).click();
      await page.locator('.player.nod').waitFor();
    }
    await page.getByRole('button', { name: /START OPERATION/ }).click();
    await page.waitForFunction(() => window.comrade?.snapshot().frame > 30, null, { timeout: 120000 });
    const release = await page.evaluate(async () => (await (await fetch('/health', { cache: 'no-store' })).json()).commit);
    assert.equal(engineRequests.length, 2);
    for (const request of engineRequests) assert.equal(new URL(request).searchParams.get('release'), release, 'Engine JS and WASM must match the deployed release');
    assert.ok(contentRequests.length >= 3);
    for (const request of contentRequests) assert.match(new URL(request).searchParams.get('sha256') || '', /^[a-f0-9]{64}$/, 'Game resources must use content-versioned URLs');
    const initial = await page.evaluate(() => window.comrade.snapshot());
    assert.equal(initial.credits, 6000);
    assert.equal(initial.power, 140);
    assert.equal(initial.buildings, 4);
    await page.getByRole('button', { name: /ENABLE GAME AUDIO|SOUND ENABLED/ }).click();
    await page.waitForFunction(() => window.comrade.snapshot().audioRunning === true, null, { timeout: 10000 });
    console.log(`${faction}: simulation and OpenAL context running`);
    if (faction === 'gdi') {
      await page.getByTestId('engine-status').filter({ hasText: 'Battlefield active' }).waitFor();
      const box = await page.locator('#canvas').boundingBox();
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

  // ---------------------------------------------------------------- Fusion Engine
  const base = process.env.COMRADE_URL || 'http://127.0.0.1:3001';
  const setSelect = (page, index, value) => page.evaluate(({ index, value }) => {
    const sel = document.querySelectorAll('select')[index];
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, { index, value });
  const enter = async (page, name) => {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: /ENTER THE WAR ROOM/ }).click();
  };
  const fusionDeploy = async page => {
    await page.waitForFunction(() => window.comradeFusion?.game.tick > 30, null, { timeout: 30000 });
    await page.evaluate(() => {
      const { game, slot, issue } = window.comradeFusion;
      const mcv = [...game.entities.values()].find(e => e.owner === slot && game.pack.units[e.type]?.deploysTo);
      issue({ t: 'deploy', ids: [mcv.id] });
    });
    await page.waitForFunction(() => {
      const { game, slot } = window.comradeFusion;
      return [...game.entities.values()].some(e => e.owner === slot && game.pack.structures[e.type]?.constructionYard);
    }, null, { timeout: 30000 });
  };

  for (const style of ['dune2k', 'ra2']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await enter(page, `Smoke ${style}`);
    await page.getByRole('button', { name: /CREATE A NEW GAME/ }).click();
    await page.getByRole('button', { name: /START OPERATION/ }).waitFor();
    await setSelect(page, 0, style);
    await page.waitForFunction(style => document.querySelector('.room-head .eyebrow')?.textContent.includes(style === 'ra2' ? 'RED ALERT 2' : 'DUNE'), style);
    await page.getByRole('button', { name: /START OPERATION/ }).click();
    await fusionDeploy(page);
    await page.locator('.fusion-item').first().waitFor({ timeout: 10000 }); // Deploying unlocks the build sidebar.
    if (style === 'ra2') {
      // Classic controls with real input: drag-select, teams, Ctrl force-fire, Alt force-move.
      const box = await page.locator('.fusion-canvas').boundingBox();
      const at = id => page.evaluate(id => { const { game, renderer } = window.comradeFusion; const e = game.entities.get(id); return renderer.toScreen(e.x, e.y); }, id);
      const ids = await page.evaluate(() => {
        const { game, slot } = window.comradeFusion;
        const mine = t => [...game.entities.values()].find(e => e.owner === slot && e.type === t)?.id;
        return { tank: mine('grizzly'), gi: mine('gi') };
      });
      const t = await at(ids.tank);
      await page.mouse.move(box.x + t.x - 14, box.y + t.y - 14); await page.mouse.down();
      await page.mouse.move(box.x + t.x + 14, box.y + t.y + 14, { steps: 6 }); await page.mouse.up();
      await page.waitForFunction(id => window.comradeFusion.renderer.selected.has(id), ids.tank);
      await page.keyboard.press('Control+Digit1');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.comradeFusion.renderer.selected.size === 0);
      await page.keyboard.press('Digit1');
      await page.waitForFunction(id => window.comradeFusion.renderer.selected.has(id), ids.tank);
      const g = await at(ids.gi);
      await page.keyboard.down('Control'); await page.mouse.click(box.x + g.x, box.y + g.y); await page.keyboard.up('Control');
      await page.waitForFunction(({ tank, gi }) => { const e = window.comradeFusion.game.entities.get(tank); return e.order === 'attack' && e.target === gi && e.force; }, ids, { timeout: 5000 });
      await page.keyboard.down('Alt'); await page.mouse.click(box.x + t.x + 60, box.y + t.y + 40); await page.keyboard.up('Alt');
      await page.waitForFunction(id => window.comradeFusion.game.entities.get(id).order === 'move', ids.tank, { timeout: 5000 });
      console.log('ra2: drag-select, Ctrl+1 team recall, Ctrl force-fire and Alt force-move passed');
    }
    await page.screenshot({ path: `build/evidence/${style}-battlefield.png` });
    assert.deepEqual(errors, [], `${style}: browser must not emit uncaught errors`);
    console.log(`${style}: Fusion Engine match launched, simulated and deployed`);
    await page.close();
  }

  // Two real browsers in one lockstep match.
  const contextA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const a = await contextA.newPage(), b = await contextB.newPage();
  const errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  await a.goto(base);
  await enter(a, 'Lockstep A');
  await a.getByRole('button', { name: /CREATE A NEW GAME/ }).click();
  await a.getByRole('button', { name: /START OPERATION/ }).waitFor();
  await setSelect(a, 0, 'dune2k');
  await a.waitForFunction(() => document.querySelector('.room-head .eyebrow')?.textContent.includes('DUNE'));
  const invite = await a.locator('.room-share code').innerText();
  await b.goto(invite);
  await enter(b, 'Lockstep B');
  await b.getByRole('button', { name: /READY UP/ }).click();
  await a.waitForFunction(() => [...document.querySelectorAll('.player')].some(p => p.textContent.includes('Lockstep B') && p.querySelector('.pready.on')));
  const record = page => page.evaluate(() => {
    window.__sums = {};
    const g = window.comradeFusion.game, step = g.step.bind(g);
    g.step = () => { step(); if (g.tick % 30 === 0) window.__sums[g.tick] = g.checksum(); };
  });
  await a.getByRole('button', { name: /START OPERATION/ }).click();
  for (const page of [a, b]) await page.waitForFunction(() => !!window.comradeFusion, null, { timeout: 30000 });
  await record(a); await record(b);
  await fusionDeploy(a);
  // B's copy of the world must contain A's construction yard: commands crossed the relay.
  await b.waitForFunction(() => {
    const { game } = window.comradeFusion;
    return [...game.entities.values()].some(e => e.owner === 0 && game.pack.structures[e.type]?.constructionYard);
  }, null, { timeout: 30000 });
  for (const page of [a, b]) await page.waitForFunction(() => window.comradeFusion.game.tick > 450, null, { timeout: 90000 });
  const [sa, sb] = await Promise.all([a, b].map(page => page.evaluate(() => window.__sums)));
  const common = Object.keys(sa).filter(t => t in sb);
  assert.ok(common.length >= 5, 'Both clients must reach shared checkpoints');
  for (const t of common) assert.equal(sa[t], sb[t], `Lockstep checksum mismatch at tick ${t}`);
  assert.deepEqual(errors, [], 'Lockstep clients must not emit uncaught errors');
  console.log(`Two-browser lockstep match stayed in sync across ${common.length} checkpoints`);
  await contextA.close(); await contextB.close();
} finally { await browser.close(); }
