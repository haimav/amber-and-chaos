// Browser smoke test: loads index.html from file:// in headless Chromium, clicks through the
// menus, plays a skirmish with real mouse/keyboard input, opens every campaign mission and
// fails on any page error. Screenshots go to tests/shots/.
// Usage: node tests/browser_test.js [--quick]
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const quick = process.argv.includes('--quick');

(async () => {
  const launch = { args: ['--autoplay-policy=no-user-gesture-required'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launch.executablePath = undefined;
  const browser = await pw.chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const wait = (ms) => page.waitForTimeout(ms);

  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await wait(1800);
  await shot('01-title');

  // menus
  await page.click('#mHow'); await wait(300); await shot('02-how'); await page.click('#back');
  await page.click('#mCodex'); await wait(300); await shot('03-codex');
  await page.click('.tab[data-t="Lords of Chaos"]'); await wait(200); await shot('03b-codex-chaos'); await page.click('#back');
  await page.click('#mSettings'); await wait(200); await shot('04-settings'); await page.click('#back');
  await page.click('#mCampaign'); await wait(300); await shot('05-campaign');
  await page.click('.mission[data-id="lorraine"]'); await wait(300); await shot('06-briefing');
  await page.click('#back'); await page.click('#back');

  // skirmish as Amber
  await page.click('#mSkirmish'); await wait(300);
  await page.click('.fac[data-f="amber"]');
  await page.selectOption('#sTheme', 'garnath');
  await shot('07-skirmish-setup');
  await page.click('#go');
  await wait(2500);
  await shot('08-skirmish-start');

  // speed things up for the test
  await page.evaluate(() => { AC.settings.gameSpeed = 2; });
  // select the castle and train a worker with its hotkey
  const hq = await page.evaluate(() => { const g = AC.game; const b = g.hq(g.localPlayer); const [x, y] = AC.renderer.toScreen(b.x, b.y); return { x, y }; });
  await page.mouse.click(hq.x, hq.y);
  await wait(200);
  await page.keyboard.press('s');
  await page.keyboard.press('s');
  await wait(300);
  await shot('09-castle-selected');
  // box-select workers, open build menu, place a barracks via hotkeys
  await page.mouse.move(hq.x - 260, hq.y - 260);
  await page.mouse.down();
  await page.mouse.move(hq.x + 260, hq.y + 260, { steps: 6 });
  await page.mouse.up();
  await wait(300);
  await page.keyboard.press('b');
  await wait(200);
  await shot('10-build-menu');
  await page.keyboard.press('h');
  await wait(100);
  const spot = await page.evaluate(() => {
    const g = AC.game, me = g.localPlayer, b = g.hq(me);
    for (const [dx, dy] of AC.util.spiral(10)) {
      const tx = b.tx + 5 + dx, ty = b.ty + 5 + dy;
      if (g.canPlace(me, 'hall_steward', tx, ty).ok) { const [x, y] = AC.renderer.toScreen((tx + 1) * 32, (ty + 1) * 32); return { x, y }; }
    }
    return null;
  });
  if (spot) { await page.mouse.move(spot.x, spot.y); await wait(100); await shot('11-placement'); await page.mouse.click(spot.x, spot.y); }
  await wait(400);
  // right-click a resource with workers (smart gather)
  const res = await page.evaluate(() => { const g = AC.game; const r = g.resources[0]; const [x, y] = AC.renderer.toScreen(r.x, r.y); return { x, y }; });
  await page.mouse.click(res.x, res.y, { button: 'right' });
  // trackpad-style pan and pinch zoom
  await page.mouse.move(700, 400);
  await page.mouse.wheel(120, 40);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -60); await page.keyboard.up('Control');
  await wait(3000);
  await shot('12-after-input');

  // give the player some forces and let the battle run
  await page.evaluate(() => {
    const g = AC.game, me = g.localPlayer, b = g.hq(me);
    g.players[me].res.d += 3000; g.players[me].res.p += 1500;
    const ids = [];
    for (const id of ['corwin', 'benedict', 'guard', 'guard', 'ranger', 'ranger', 'rifleman', 'lancer', 'tidecaller', 'gryphon']) ids.push(g.spawnUnit(id, me, b.x + 140, b.y + 60).id);
    AC.input.setSelection(ids);
  });
  await wait(300);
  await shot('13-army');
  await page.keyboard.press('q'); // Corwin: Image of the Pattern (instant)
  await wait(600);
  await page.keyboard.press('Tab');
  await wait(200);
  await shot('14-abilities');
  // attack-move toward the enemy start via minimap
  await page.keyboard.press('a');
  const mm = await page.evaluate(() => { const r = document.getElementById('minimap').getBoundingClientRect(); const g = AC.game; const e = g.players.find((p) => p.id !== g.localPlayer && !p.isNeutral); return { x: r.left + (e.startTile.tx / g.map.w) * r.width, y: r.top + (e.startTile.ty / g.map.h) * r.height }; });
  await page.mouse.click(mm.x, mm.y);
  await wait(quick ? 4000 : 15000);
  // follow the army
  await page.evaluate(() => { const g = AC.game; const u = g.units.find((x) => x.owner === g.localPlayer && x.def.hero); if (u) AC.renderer.centerOn(u.x, u.y); });
  await wait(1500);
  await shot('15-battle');
  // jewel research + storm hotkeys path through UI functions
  await page.evaluate(() => { const g = AC.game; g.players[g.localPlayer].upgrades.jewel = true; });
  await page.keyboard.press('Escape'); await wait(300); await shot('16-pause'); await page.keyboard.press('Escape');
  const stats = await page.evaluate(() => ({ time: AC.game.time, units: AC.game.units.length, fx: AC.renderer.fx.length, chunks: AC.renderer.chunks.size }));
  console.log('skirmish stats', JSON.stringify(stats));

  // quick performance probe: time 120 frames of rendering
  const perf = await page.evaluate(async () => {
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) AC.renderer.render(0.5, 0.016);
    return (performance.now() - t0) / 60;
  });
  console.log('avg render ms', perf.toFixed(2));

  // each campaign mission
  const ids = await page.evaluate(() => AC.SCENARIOS.map((s) => s.id));
  for (const id of ids) {
    await page.evaluate(() => AC.quitToTitle());
    await wait(300);
    await page.click('#mCampaign'); await wait(200);
    await page.click(`.mission[data-id="${id}"]`); await wait(200);
    await page.click('#go');
    await wait(2500);
    await page.evaluate(() => { AC.settings.gameSpeed = 2; });
    await wait(quick ? 2000 : 6000);
    await shot('20-mission-' + id);
  }
  // Chaos skirmish on the Abyss map
  await page.evaluate(() => AC.quitToTitle());
  await wait(300);
  await page.click('#mSkirmish'); await wait(200);
  await page.click('.fac[data-f="chaos"]');
  await page.selectOption('#sTheme', 'abyss');
  await page.selectOption('#sOppF', 'amber');
  await page.click('#go');
  await wait(2500);
  await page.evaluate(() => { AC.settings.gameSpeed = 2; });
  await wait(quick ? 3000 : 8000);
  await shot('30-chaos-skirmish');
  // force a victory to check the results screen
  await page.evaluate(() => { const g = AC.game; for (const b of g.buildings) if (b.owner !== g.localPlayer && !g.players[b.owner].isNeutral) g.kill(b, null); });
  await wait(4500);
  await shot('31-results');

  await browser.close();
  if (errors.length) {
    console.log('ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else console.log('OK: no page errors');
})().catch((e) => { console.error(e); process.exitCode = 1; });
