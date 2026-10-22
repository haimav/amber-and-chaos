// Captures the README screenshots into docs/screenshots/ (JPEG, 1440x900).
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 82 });
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await wait(9000); // let the Pattern draw itself a little
  await shot('title');

  // a staged battle: Amber host vs Chaos host near the centre of the Vale of Garnath
  await page.click('#mSkirmish'); await wait(200);
  await page.click('.fac[data-f="amber"]');
  await page.selectOption('#sTheme', 'garnath');
  await page.uncheck('#sFog');
  await page.fill('#sSeed', '4242');
  await page.click('#go');
  await wait(2500);
  await page.evaluate(() => {
    const g = AC.game, T = AC.TILE;
    const me = g.localPlayer, foe = g.players.find((p) => p.id !== me && !p.isNeutral).id;
    for (const u of g.units.slice()) if (g.players[u.owner].isNeutral) u.dead = true;
    const cx = g.map.w / 2 * T, cy = g.map.h / 2 * T;
    const spawn = (pid, list, x, y) => { let k = 0; const ids = []; for (const [id, n] of list) for (let i = 0; i < n; i++) { const a = k * 2.4, r = 16 + Math.sqrt(k) * 16; ids.push(g.spawnUnit(id, pid, x + Math.cos(a) * r, y + Math.sin(a) * r).id); k++; } return ids; };
    const a = spawn(me, [['corwin', 1], ['benedict', 1], ['fiona', 1], ['guard', 8], ['ranger', 6], ['lancer', 4], ['rifleman', 4], ['gryphon', 2], ['tidecaller', 2]], cx - 7 * T, cy);
    const b = spawn(foe, [['dara', 1], ['brand', 1], ['borel', 1], ['demon', 9], ['crossbow', 6], ['hellmaid', 3], ['manticore', 2], ['wyvern', 2]], cx + 7 * T, cy);
    g.players[me].upgrades.jewel = true; g.players[foe].upgrades.wave = true;
    for (let y = -6; y <= 6; y++) for (let x = 2; x <= 14; x++) if (x * x / 1.6 + y * y < 60) g.map.setRoad(Math.floor(cx / T) + x, Math.floor(cy / T) + y, 1);
    g.command(me, { type: 'attackMove', ids: a, x: cx + 8 * T, y: cy });
    g.command(foe, { type: 'attackMove', ids: b, x: cx - 8 * T, y: cy });
    AC.renderer.centerOn(cx, cy + 40);
    AC.renderer.cam.zoom = 1.05;
    AC.input.setSelection(a.slice(0, 3), true);
    window.__a = a; window.__b = b;
  });
  await wait(4200);
  await page.evaluate(() => {
    const g = AC.game, T = AC.TILE, me = g.localPlayer;
    const foe = g.players.find((p) => p.id !== me && !p.isNeutral).id;
    const fi = g.units.find((u) => u.def.id === 'fiona' && !u.dead);
    const enemy = g.units.filter((u) => u.owner === foe && !u.dead);
    if (fi && enemy.length) { const t = enemy[Math.floor(enemy.length / 2)]; g.command(me, { type: 'cast', ids: [fi.id], ab: 'jewel_storm', x: t.x, y: t.y }); }
    const br = g.units.find((u) => u.def.id === 'brand' && !u.dead);
    const mine = g.units.filter((u) => u.owner === me && !u.dead && !u.def.air);
    if (br && mine.length) { const t = mine[Math.floor(mine.length / 2)]; g.command(foe, { type: 'cast', ids: [br.id], ab: 'pyrokinesis', x: t.x, y: t.y }); }
    const co = g.units.find((u) => u.def.id === 'corwin' && !u.dead);
    if (co) g.command(me, { type: 'cast', ids: [co.id], ab: 'pattern_image' });
  });
  await wait(1900);
  await shot('battle');

  // Chaos base later in a game
  await page.evaluate(() => AC.quitToTitle());
  await wait(300);
  await page.click('#mSkirmish'); await wait(200);
  await page.click('.fac[data-f="chaos"]');
  await page.selectOption('#sTheme', 'abyss');
  await page.selectOption('#sOppF', 'amber');
  await page.check('#sFog');
  await page.fill('#sSeed', '777');
  await page.click('#go');
  await wait(2500);
  await page.evaluate(() => {
    // let the AI play our side for a while to raise a base
    const g = AC.game;
    const ai = new AC.AI(g, g.localPlayer, {});
    g.ais.push(ai);
    for (let i = 0; i < 30 * 60 * 5.5; i++) { g.tick(AC.TICK); g.events.length = 0; g.fxq.length = 0; }
    g.ais.splice(g.ais.indexOf(ai), 1);
    const hq = g.hq(g.localPlayer);
    AC.renderer.centerOn(hq.x + 120, hq.y + 60);
    const sel = g.buildings.find((b) => b.owner === g.localPlayer && b.def.id === 'logrus_shrine') || hq;
    AC.input.setSelection([sel.id], true);
  });
  await wait(1500);
  await shot('chaos-base');

  // campaign briefing and a mission
  await page.evaluate(() => AC.quitToTitle());
  await wait(300);
  await page.click('#mCampaign'); await wait(300);
  await shot('campaign');
  await page.click('.mission[data-id="kolvir"]'); await wait(300);
  await page.click('#go');
  await wait(2500);
  await page.evaluate(() => { const g = AC.game; for (let i = 0; i < 30 * 25; i++) { g.tick(AC.TICK); } AC.renderer.centerOn(30 * 32, 50 * 32); });
  await wait(1200);
  await shot('mission-kolvir');

  await browser.close();
  if (errors.length) { console.log('ERRORS', errors); process.exitCode = 1; } else console.log('screenshots written to', OUT);
})();
