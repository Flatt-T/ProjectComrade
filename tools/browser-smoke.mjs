import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, ...(process.env.COMRADE_BROWSER_CHANNEL ? { channel: process.env.COMRADE_BROWSER_CHANNEL } : {}) });
await mkdir('build/evidence', { recursive: true });
// The privacy banner and the Google Funding Choices dialog render asynchronously
// and can intercept pointer events; decline them before touching the lobby.
async function dismissConsent(page) {
  // The site banner mounts only after auth resolves and the Google Funding
  // Choices dialog appears whenever it pleases; both can intercept pointer
  // events, so loop until neither is present any more.
  const banner = page.locator('aside.consent-banner');
  const fcRoot = page.locator('.fc-consent-root, .fc-dialog');
  for (let i = 0; i < 25; i++) {
    if (!(await banner.count()) && !(await fcRoot.count())) break;
    for (const label of ['NO ANALYTICS', 'NO, KEEP IT GENERIC']) {
      const btn = banner.getByRole('button', { name: label, exact: true }).first();
      if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => {});
    }
    if (await fcRoot.count()) {
      for (const frame of page.frames()) {
        const decline = frame.getByRole('button', { name: /^(do not consent|reject all)$/i }).first();
        if (await decline.isVisible().catch(() => false)) {
          await decline.click({ timeout: 2000 }).catch(() => {});
          break;
        }
      }
    }
    await page.waitForTimeout(500);
  }
}
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
    await dismissConsent(page);
    assert.equal(await page.locator('input[type=file]').count(), 0);
    // Registration-free war room: callsign, create a game, pick a side, launch.
    await page.getByLabel('Your name').fill(`Smoke ${faction}`);
    await dismissConsent(page);
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
  // Selects are found by their label: the lobby's first select is now each player's team picker.
  const setSelect = (page, label, value) => page.getByLabel(label).selectOption(value);
  const enter = async (page, name) => {
    await page.getByLabel('Your name').fill(name);
    await dismissConsent(page);
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
    await dismissConsent(page);
    await enter(page, `Smoke ${style}`);
    await page.getByRole('button', { name: /CREATE A NEW GAME/ }).click();
    await page.getByRole('button', { name: /START OPERATION/ }).waitFor();
    await setSelect(page, 'Game style', style);
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

  // Four independent browser sessions in one invite-only lockstep match.
  const names = ['Lockstep A', 'Lockstep B', 'Lockstep C', 'Lockstep D'];
  const contexts = await Promise.all(names.map(() => browser.newContext({ viewport: { width: 1400, height: 900 } })));
  const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
  const [host, ...guests] = pages;
  const errors = [];
  for (const page of pages) page.on('pageerror', error => errors.push(error.message));

  let room;
  host.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(payload.toString());
      if (message.type === 'room') room = message;
    });
  });
  const waitForRoom = async (predicate, description) => {
    const deadline = Date.now() + 10000;
    while (!room || !predicate(room)) {
      if (Date.now() >= deadline) throw new Error(description);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  };

  await host.goto(base);
  await dismissConsent(host);
  await enter(host, names[0]);
  await host.getByRole('button', { name: /CREATE A NEW GAME/ }).click();
  await host.getByRole('button', { name: /START OPERATION/ }).waitFor();
  await setSelect(host, 'Visibility', 'invite');
  await waitForRoom(r => r.options.visibility === 'invite', 'Room did not become invite-only');
  await setSelect(host, 'Game style', 'dune2k');
  await waitForRoom(r => r.options.style === 'dune2k', 'Room did not select the Dune-style game');
  await setSelect(host, 'Battlefield', 'four-sietches');
  await waitForRoom(r => r.options.map === 'four-sietches', 'Room did not select Four Sietches');
  await setSelect(host, 'AI opponents', '0');
  await waitForRoom(r => r.options.settings.ai === 0, 'Room did not remove AI opponents');
  await setSelect(host, 'Human players', '4');
  await waitForRoom(r => r.options.maxPlayers === 4, 'Room did not open four human seats');

  const invite = await host.locator('.room-share code').innerText();
  for (const [index, guest] of guests.entries()) {
    await guest.goto(invite);
    await dismissConsent(guest);
    await enter(guest, names[index + 1]);
    await guest.getByRole('button', { name: /READY UP/ }).click();
  }
  await host.waitForFunction(expected => expected.every(name =>
    [...document.querySelectorAll('.player')].some(p => p.textContent.includes(name) && p.querySelector('.pready.on')),
  ), names.slice(1));

  await host.getByRole('button', { name: /START OPERATION/ }).click();
  await Promise.all(pages.map(page => page.waitForFunction(() => !!window.comradeFusion, null, { timeout: 30000 })));
  const slots = await Promise.all(pages.map(page => page.evaluate(() => {
    window.__sums = {};
    const { game, slot } = window.comradeFusion;
    const step = game.step.bind(game);
    game.step = () => { step(); if (game.tick % 30 === 0) window.__sums[game.tick] = game.checksum(); };
    return slot;
  })));
  assert.equal(new Set(slots).size, 4, 'All four players must hold separate slots');
  const locations = await Promise.all(pages.map(page => page.evaluate(() => {
    const { game, slot, issue } = window.comradeFusion;
    const mcv = [...game.entities.values()].find(e => e.owner === slot && game.pack.units[e.type]?.deploysTo);
    if (!mcv) throw new Error('Missing starting MCV');
    const yardType = game.pack.units[mcv.type].deploysTo;
    const yard = game.pack.structures[yardType];
    const here = game.cellOf(mcv);
    const originX = here % game.map.w, originY = Math.floor(here / game.map.w);
    for (let radius = 0; radius <= 12; radius++) {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = originX + dx, y = originY + dy;
        const cell = y * game.map.w + x;
        if (!game.canPlace(game.players[slot], yardType, x - (yard.w >> 1), y - (yard.h >> 1), true, mcv.id)) continue;
        if (cell !== here && !game.pathFor(mcv, cell).length) continue;
        if (cell !== here) issue({ t: 'move', ids: [mcv.id], x, y });
        return { id: mcv.id, cell };
      }
    }
    throw new Error(`No deployable ground near the starting MCV for slot ${slot}`);
  })));
  await Promise.all(pages.map((page, index) => page.waitForFunction(({ id, cell }) => {
    const { game } = window.comradeFusion;
    const mcv = game.entities.get(id);
    return mcv && game.cellOf(mcv) === cell && mcv.order === 'idle';
  }, locations[index], { timeout: 45000 })));
  await Promise.all(pages.map((page, index) => page.evaluate(({ id }) => {
    window.comradeFusion.issue({ t: 'deploy', ids: [id] });
  }, locations[index])));
  await Promise.all(pages.map(page => page.waitForFunction(expected => {
    const { game } = window.comradeFusion;
    return expected.every(slot => [...game.entities.values()].some(e =>
      e.owner === slot && game.pack.structures[e.type]?.constructionYard));
  }, slots, { timeout: 30000 })));

  await Promise.all(pages.map(page => page.waitForFunction(() => window.comradeFusion.game.tick > 450, null, { timeout: 90000 })));
  const sums = await Promise.all(pages.map(page => page.evaluate(() => window.__sums)));
  const common = Object.keys(sums[0]).filter(t => sums.every(client => t in client));
  assert.ok(common.length >= 5, 'All four clients must reach shared checkpoints');
  for (const t of common) {
    for (const client of sums.slice(1)) assert.equal(sums[0][t], client[t], `Lockstep checksum mismatch at tick ${t}`);
  }
  assert.deepEqual(errors, [], 'Lockstep clients must not emit uncaught errors');
  console.log(`Four-browser Fusion match stayed in sync across ${common.length} checkpoints`);
  await Promise.all(contexts.map(context => context.close()));
} finally { await browser.close(); }
