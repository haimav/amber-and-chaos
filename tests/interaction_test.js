// UI interaction test with assertions: drives the real HUD/input with mouse and keyboard in
// headless Chromium and checks that the simulation responded.
'use strict';
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : ''));
  if (!ok) failures++;
}

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  const wait = (ms) => page.waitForTimeout(ms);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const toScreen = (x, y) => ev(([x, y]) => AC.renderer.toScreen(x, y), [x, y]);

  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await wait(600);

  // ---------------------------------------------------------------- Amber skirmish
  await page.click('#mSkirmish'); await wait(150);
  await page.click('.fac[data-f="amber"]');
  await page.uncheck('#sFog');
  await page.fill('#sSeed', '99');
  await page.click('#go');
  await wait(2200);
  await ev(() => { const g = AC.game; g.players[g.localPlayer].res.d = 5000; g.players[g.localPlayer].res.p = 3000; g.opts.buildSpeed = 20; });

  // build a Hall of Trumps with a steward through the UI
  const hq = await ev(() => { const b = AC.game.hq(AC.game.localPlayer); return { x: b.x, y: b.y, id: b.id }; });
  await ev((id) => AC.renderer.centerOn(AC.game.get(id).x, AC.game.get(id).y), hq.id);
  await wait(100);
  const wId = await ev(() => AC.game.units.find((u) => u.owner === AC.game.localPlayer && u.def.role === 'worker').id);
  await ev((id) => AC.input.setSelection([id]), wId);
  await wait(150);
  await page.keyboard.press('b'); await wait(80);
  await page.keyboard.press('t'); await wait(80);
  check('placement mode for Hall of Trumps', await ev(() => AC.ui.mode === 'place' && AC.ui.placeDef === 'hall_trumps'));
  const spot = await ev(() => {
    const g = AC.game, me = g.localPlayer, b = g.hq(me);
    for (const [dx, dy] of AC.util.spiral(12)) {
      const tx = b.tx + 6 + dx, ty = b.ty + dy - 6;
      if (g.canPlace(me, 'hall_trumps', tx, ty).ok && g.canPlace(me, 'hall_trumps', tx - 1, ty - 1).ok) return [(tx + 1.5) * 32, (ty + 1.5) * 32];
    }
    return null;
  });
  let s = await toScreen(spot[0], spot[1]);
  await page.mouse.move(s[0], s[1]); await wait(120);
  await page.mouse.click(s[0], s[1]); await wait(300);
  check('hall placement order issued', await ev((id) => { const u = AC.game.get(id); return !!(u.order && u.order.type === 'build' && u.order.def === 'hall_trumps'); }, wId));
  await ev(() => { AC.settings.gameSpeed = 2; });
  await wait(6000);
  const hall = await ev(() => { const b = AC.game.buildings.find((x) => x.def.id === 'hall_trumps' && x.owner === AC.game.localPlayer); return b ? { id: b.id, built: b.built, x: b.x, y: b.y } : null; });
  check('hall of trumps built by the steward', hall && hall.built, hall);

  // train Corwin via hotkey on the hall
  await ev((id) => AC.input.setSelection([id]), hall.id); await wait(200);
  await page.keyboard.press('c'); await wait(200);
  check('Corwin queued at the hall', await ev((id) => AC.game.get(id).trainQ.some((q) => q.id === 'corwin'), hall.id));
  // research Jewel of Judgment (X)
  await page.keyboard.press('x'); await wait(200);
  check('Jewel research started', await ev(() => !!AC.game.players[AC.game.localPlayer].researching.jewel));
  // rally point by right-click
  s = await toScreen(hall.x + 200, hall.y + 100);
  await page.mouse.click(s[0], s[1], { button: 'right' }); await wait(150);
  check('rally point set', await ev((id) => !!AC.game.get(id).rally, hall.id));
  await wait(5000);
  const corwin = await ev(() => { const u = AC.game.units.find((x) => x.def.id === 'corwin'); return u ? u.id : 0; });
  check('Corwin trained', !!corwin);
  check('Jewel researched', await ev(() => !!AC.game.players[AC.game.localPlayer].upgrades.jewel));

  // control group with Option(Alt)+1, deselect, recall with 1
  await ev((id) => AC.input.setSelection([id]), corwin); await wait(100);
  await page.keyboard.press('Alt+Digit1'); await wait(100);
  await ev(() => AC.input.setSelection([])); await wait(100);
  await page.keyboard.press('Digit1'); await wait(150);
  check('control group recalls Corwin', await ev((id) => AC.ui.selected.length === 1 && AC.ui.selected[0] === id, corwin));

  // spawn an enemy near Corwin, target Silver... use Jewel storm (E) with the mouse
  await ev((id) => {
    const g = AC.game, c = g.get(id);
    const foe = g.players.find((p) => p.id !== g.localPlayer && !p.isNeutral).id;
    window.__enemy = [];
    for (let i = 0; i < 4; i++) window.__enemy.push(g.spawnUnit('demon', foe, c.x + 180 + i * 20, c.y).id);
    AC.renderer.centerOn(c.x + 90, c.y);
  }, corwin);
  await wait(150);
  await page.keyboard.press('e'); await wait(100);
  check('targeting mode for Jewel storm', await ev(() => AC.ui.mode === 'target' && AC.ui.targetAb === 'jewel_storm'));
  const ex = await ev(() => { const u = AC.game.get(window.__enemy[0]); return AC.renderer.toScreen(u.x, u.y); });
  await page.mouse.click(ex[0], ex[1]); await wait(1500);
  check('storm zone created and Corwin paid life', await ev((id) => AC.game.zones.some((z) => z.type === 'storm') || AC.game.get(id).cds.jewel_storm > 0, corwin));
  // Q: Image of the Pattern (instant)
  await page.keyboard.press('q'); await wait(600);
  check('Image of the Pattern cast', await ev((id) => (AC.game.get(id).cds.pattern_image || 0) > AC.game.time, corwin));
  // attack-move via A + minimap click
  await page.keyboard.press('a'); await wait(80);
  const mm = await ev(() => { const r = document.getElementById('minimap').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.5]; });
  await page.mouse.click(mm[0], mm[1]); await wait(200);
  check('attack-move via minimap', await ev((id) => { const u = AC.game.get(id); return !!u && !!u.order && (u.order.type === 'attackMove' || u.order.type === 'attack' || u.order.type === 'cast'); }, corwin));
  // tooltip shows on hover over a command button
  await ev((id) => AC.input.setSelection([id]), hall.id); await wait(300);
  const btn = await page.$('#cmdCard .cmd:not(.empty)');
  await btn.hover(); await wait(200);
  check('tooltip visible on hover', await ev(() => !document.getElementById('tooltip').classList.contains('hidden')));
  // pause and resume
  await page.keyboard.press('Escape'); await wait(150);
  check('pause menu opens', await ev(() => AC.paused === true));
  await page.keyboard.press('Escape'); await wait(150);
  check('pause menu closes', await ev(() => AC.paused === false));

  // ---------------------------------------------------------------- Chaos skirmish: road placement rules
  await ev(() => AC.quitToTitle()); await wait(300);
  await page.click('#mSkirmish'); await wait(150);
  await page.click('.fac[data-f="chaos"]');
  await page.uncheck('#sFog');
  await page.fill('#sSeed', '7');
  await page.click('#go');
  await wait(2200);
  const res = await ev(() => {
    const g = AC.game, me = g.localPlayer, b = g.hq(me), m = g.map;
    let on = null, off = null;
    for (const [dx, dy] of AC.util.spiral(18)) {
      const tx = b.tx + dx, ty = b.ty + dy;
      const r = g.canPlace(me, 'pit', tx, ty);
      let allRoad = true, anyRoad = false;
      for (let y = ty; y < ty + 3; y++) for (let x = tx; x < tx + 3; x++) { if (m.isRoad(x, y)) anyRoad = true; else allRoad = false; }
      if (!on && r.ok && allRoad) on = [tx, ty];
      if (!off && !anyRoad && m.passable(tx, ty, 1) && m.passable(tx + 2, ty + 2, 1) && m.passable(tx + 2, ty, 1) && m.passable(tx, ty + 2, 1)) off = [tx, ty, r.ok, r.why];
    }
    return { on, off };
  });
  check('chaos building allowed on the road', !!res.on, res.on);
  check('chaos building refused off the road', res.off && res.off[2] === false && /Black Road/.test(res.off[3]), res.off);
  const thrall = await ev(() => AC.game.units.find((u) => u.owner === AC.game.localPlayer && u.def.role === 'worker').id);
  await ev(([id, tx, ty]) => { AC.input.setSelection([id]); AC.game.players[AC.game.localPlayer].res.d = 2000; }, [thrall, ...res.on]);
  await wait(150);
  await page.keyboard.press('b'); await wait(80); await page.keyboard.press('p'); await wait(80);
  s = await toScreen((res.on[0] + 1.5) * 32, (res.on[1] + 1.5) * 32);
  await page.mouse.move(s[0], s[1]); await wait(120);
  await page.mouse.click(s[0], s[1]); await wait(4000);
  const pit = await ev(() => { const b = AC.game.buildings.find((x) => x.def.id === 'pit' && x.owner === AC.game.localPlayer); return b ? { progress: b.progress } : null; });
  check('demon pit summoned and growing on its own', pit && pit.progress > 0, pit);
  check('thrall released after summoning', await ev((id) => { const u = AC.game.get(id); return !u.order || u.order.type !== 'build'; }, thrall));

  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); failures++; }
  console.log(failures ? failures + ' FAILURE(S)' : 'ALL INTERACTION CHECKS PASSED');
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
