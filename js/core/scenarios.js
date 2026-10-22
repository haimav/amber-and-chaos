// Amber and Chaos — campaign scenarios ("The Chronicles").
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;
  const TER = AC.TER;

  // extra scenario-only definitions
  AC.BUILDINGS.ygg = {
    id: 'ygg', kind: 'building', name: 'Ygg', faction: 'neutral', size: 2, hp: 99999, armor: 20, armorType: 'fortified', invulnerable: true,
    cost: { d: 0, p: 0 }, time: 1, sight: 3, art: 'ygg', scenarioOnly: true,
    desc: 'The talking tree that Oberon planted to mark the border between Order and Chaos.',
  };

  // ------------------------------------------------------------------ helpers
  const S = (AC.ScenarioKit = {});
  S.newMap = function (w, h, theme, seed, base) {
    const m = new AC.GameMap(w, h, seed, theme);
    m.terrain.fill(base != null ? base : TER.GRASS);
    return m;
  };
  S.noise = function (m, seed, scale, thr, ter, where) {
    const nz = U.makeNoise(seed);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (where && !where(x, y)) continue;
        if (nz.fbm(x * scale, y * scale, 4) > thr) m.terrain[y * m.w + x] = ter;
      }
  };
  S.border = function (m, ter) {
    for (let i = 0; i < m.w; i++) { m.terrain[i] = ter; m.terrain[(m.h - 1) * m.w + i] = ter; }
    for (let i = 0; i < m.h; i++) { m.terrain[i * m.w] = ter; m.terrain[i * m.w + m.w - 1] = ter; }
  };
  S.path = function (m, pts, w, ter) {
    for (let i = 0; i < pts.length - 1; i++) m.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, ter);
  };
  S.field = function (g, cx, cy, ang, n, dist, amount) {
    const m = g.map;
    const free = (x, y) => {
      if (x < 2 || y < 2 || x > m.w - 3 || y > m.h - 3) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (m.occ[(y + dy) * m.w + x + dx]) return false;
      return true;
    };
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * (1.4 / Math.max(1, n - 1));
      let placed = false;
      for (const dd of [0, 1, -1, 2, 3, -2]) {
        const d = dist + (i % 2) * 0.9 + dd;
        const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
        if (!free(x, y)) continue;
        m.disc(x, y, 1.5, TER.SAND);
        g.spawnResource(x, y, amount || 1500);
        placed = true;
        break;
      }
    }
  };
  S.spawn = function (g, pid, list, x, y, opts) {
    const out = [];
    let k = 0;
    for (const [id, n] of list) {
      for (let i = 0; i < n; i++) {
        const a = k * 2.399, r = 14 + Math.sqrt(k) * 14;
        const u = g.spawnUnit(id, pid, x + Math.cos(a) * r, y + Math.sin(a) * r);
        if (opts && opts.level && u.def.hero) { u.level = opts.level; g.applyLevel(u); u.hp = u.maxHp; u.xp = AC.HERO_LEVELS[opts.level - 1]; }
        if (opts && opts.angle != null) u.angle = opts.angle;
        out.push(u);
        k++;
      }
    }
    return out;
  };
  // A scripted hero arrives. If the player already called that hero, the one in the field
  // is brought to the spot rather than doubled, and a copy waiting in a hall is sent back.
  S.hero = function (g, pid, id, x, y, level) {
    const p = g.players[pid];
    for (const b of g.buildings) {
      if (b.dead || b.owner !== pid) continue;
      for (let i = b.trainQ.length - 1; i >= 0; i--) {
        if (b.trainQ[i].id !== id) continue;
        g.refund(p, b.trainQ[i].cost || AC.UNITS[id].cost);
        b.trainQ.splice(i, 1);
      }
    }
    let u = g.units.find((e) => !e.dead && e.owner === pid && e.def.id === id);
    if (u) {
      AC.issue(g, u, null, false);
      AC.Abilities.teleport(g, u, x, y, p.faction === 'chaos' ? '#c080ff' : '#ffe08a');
    } else u = g.spawnUnit(id, pid, x, y);
    if (level > 1 && (u.level || 1) < level) { u.level = level; u.xp = AC.HERO_LEVELS[level - 1]; g.applyLevel(u); }
    u.hp = u.maxHp; u.mana = u.maxMana;
    return u;
  };
  // defenders of a stronghold: they fight whatever comes near, but the computer never
  // sends them away in its attack waves
  S.garrison = function (us) {
    for (const u of us) { u.garrison = true; u.homeX = u.x; u.homeY = u.y; }
    return us;
  };
  // the enemy's income for the chosen difficulty (Hard leaves it at the computer's own rate)
  S.enemyIncome = (opts, normal) => (opts.difficulty === 'hard' ? 1 : opts.difficulty === 'easy' ? 0.7 : normal);
  S.say = function (g, who, text, portrait, color, life) { g.emit({ type: 'dialog', who, text, portrait, color: color || 0, life }); };
  S.obj = function (g, id, text, opts) {
    const o = Object.assign({ id, text, done: false, failed: false }, opts || {});
    const i = g.objectives.findIndex((x) => x.id === id);
    if (i >= 0) g.objectives[i] = o; else g.objectives.push(o);
    g.emit({ type: 'objectives' });
    return o;
  };
  S.getObj = (g, id) => g.objectives.find((o) => o.id === id);
  S.done = function (g, id) {
    const o = S.getObj(g, id);
    if (o && !o.done) { o.done = true; g.emit({ type: 'objectives' }); g.message('Objective complete: ' + o.text, { kind: 'good' }); g.sfx('research', 0, 0); }
  };
  S.at = function (g, t, fn) { (g.scenario.timers = g.scenario.timers || []).push({ t, fn }); };
  S.runTimers = function (g) {
    const ts = g.scenario.timers;
    if (!ts) return;
    for (let i = ts.length - 1; i >= 0; i--) if (g.time >= ts[i].t) { const f = ts[i].fn; ts.splice(i, 1); f(g); }
  };
  S.unitsNear = (g, pid, x, y, r, filter) => g.units.filter((u) => !u.dead && u.owner === pid && Math.hypot(u.x - x, u.y - y) < r && (!filter || filter(u)));
  S.newGame = function (opts) {
    const g = new AC.Game({ seed: opts.seed || 1, fog: opts.fog !== false, headless: !!opts.headless });
    g.mode = 'campaign';
    return g;
  };
  S.finish = function (g) {
    g.updateVision();
    g.recomputeSupply();
    // scenario armies may exceed what their buildings support: grant the difference plus room to grow
    for (const p of g.players) {
      if (p.isNeutral) continue;
      if (p.supplyUsed + 10 > p.supplyCap) { p.supplyBonus = p.supplyUsed + 10 - p.supplyCap; g.recomputeSupply(); }
    }
    g.covDirty = true;
    g.updateRoad(0.5);
    return g;
  };
  S.lay = function (g, x0, y0, x1, y1, w) {
    // lay a black road band
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(U.lerp(x0, x1, i / n)), y = Math.round(U.lerp(y0, y1, i / n) + Math.sin(i * 0.25) * 1.5);
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (dx * dx + dy * dy <= w * w + 1) g.map.setRoad(x + dx, y + dy, 1);
    }
  };
  // AI whose only job is to send its units at a target
  S.waveAttack = function (g, units, x, y) {
    g.command(units[0] ? units[0].owner : 0, { type: 'attackMove', ids: units.map((u) => u.id), x, y, creeps: false });
  };

  // ------------------------------------------------------------------ scenarios
  const SC = [];
  AC.SCENARIOS = SC;

  // 1 ---------------------------------------------------------------- The Circle in Lorraine
  SC.push({
    id: 'lorraine', num: 1, title: 'The Circle in Lorraine', book: 'The Guns of Avalon', faction: 'amber',
    blurb: 'Lorraine is being eaten by the Circle, a stain that belches demons and drains life from the land. Corwin, still recovering, rides with Ganelon to hold it back.',
    intro: [
      'Free of Eric\'s dungeons, his eyes regrown, Corwin rides through Shadow toward Avalon. In the land of Lorraine he finds a wounded knight, and an old acquaintance in command of its soldiers: Ganelon, whom Corwin once exiled from Avalon for treachery.',
      'Lorraine is dying. A Circle has opened in the land, a growing stain that belches forth demonic creatures and steals the life of the people. The demons know Corwin. They call him "opener". His curse on Eric, flung from the steps of Amber, may have let them through.',
      'Hold the keep through the night of the great assault. Then ride for the Circle and slay the goat-faced lord who leads them. With him dead, the way into Lorraine will close.',
    ],
    tips: ['Stewards gather diamonds; the Barracks trains Guards. Militia of Lorraine are cheap and fast to raise.', 'Corwin\'s Image of the Pattern (Q) withers the Black Road and burns creatures of Chaos.', 'The Black Road drains the life of your soldiers. Fight at its edge, not on it.'],
    create(opts) {
      const g = S.newGame(opts);
      const m = S.newMap(80, 80, 'lorraine', 31);
      S.noise(m, 31, 0.09, 0.66, TER.FOREST);
      S.noise(m, 77, 0.08, 0.76, TER.ROCK);
      // a stream with two fords
      for (let y = 0; y < 80; y++) {
        const x = Math.round(42 + Math.sin(y * 0.12) * 4);
        for (let dx = -1; dx <= 2; dx++) m.terrain[y * 80 + x + dx] = dx === 0 || dx === 1 ? TER.WATER : TER.SHALLOW;
      }
      m.fillRect(36, 22, 50, 24, TER.DIRT); m.fillRect(36, 56, 50, 58, TER.DIRT);
      m.disc(14, 62, 11, TER.GRASS); m.disc(14, 62, 3, TER.STONE);
      m.disc(62, 16, 10, TER.ASH); m.disc(20, 34, 6, TER.GRASS); m.disc(40, 40, 5, TER.GRASS); m.disc(62, 62, 7, TER.GRASS);
      S.path(m, [[18, 58], [30, 50], [40, 40], [52, 30], [60, 20]], 1, TER.DIRT);
      S.path(m, [[18, 62], [36, 57], [50, 57], [62, 62]], 1, TER.DIRT);
      S.border(m, TER.ROCK);
      g.setMap(m);
      g.mapName = 'Lorraine';
      const me = g.addPlayer({ name: 'Corwin of Amber', faction: 'amber', color: AC.PLAYER_COLORS[0], startD: 350, startP: 120 });
      const foe = g.addPlayer({ name: 'The Circle', faction: 'chaos', color: AC.PLAYER_COLORS[1], team: 1 });
      g.addPlayer({ name: 'Wild things of Shadow', isNeutral: true, faction: 'neutral', team: -99, color: AC.NEUTRAL_COLOR });
      g.localPlayer = 0;
      g.allowedBuilds = new Set(['hall_steward', 'barracks', 'lodge', 'shrine', 'lighthouse', 'keep']);
      g.trainOverride = { barracks: ['lorraine_militia', 'guard', 'lancer'] };
      // base
      const keep = g.spawnBuilding('keep', 0, 12, 60, true);
      g.spawnBuilding('barracks', 0, 18, 64, true);
      g.spawnBuilding('village', 0, 8, 56, true);
      g.spawnBuilding('village', 0, 18, 58, true);
      g.spawnBuilding('village', 0, 9, 66, true);
      S.field(g, 13.5, 61.5, Math.atan2(1, -1), 7, 7, 1500);
      S.field(g, 20, 34, Math.PI, 5, 3.2, 1200);
      g.spawnSite(40, 40, 'Broken Pattern of Lorraine');
      for (let k = 0; k < 6; k++) { const w = g.spawnUnit('steward', 0, 420 + k * 22, 2020); w.order = { type: 'gather', target: AC.Behavior.findResource(g, w, keep.x, keep.y, 12 * T).id }; }
      const corwin = S.hero(g, 0, 'corwin', 24 * T, 56 * T, 2);
      const ganelon = S.hero(g, 0, 'ganelon', 25 * T, 58 * T, 2);
      S.spawn(g, 0, [['lorraine_militia', 6], ['guard', 3], ['ranger', 3]], 22 * T, 60 * T);
      // the Circle
      const circle = g.spawnBuilding('the_circle', 1, 60, 12, true);
      g.spawnBuilding('hollow', 1, 66, 20, true);
      S.lay(g, 60, 16, 36, 40, 2);
      S.spawn(g, 1, [['demon', 6], ['crossbow', 2]], 56 * T, 20 * T);
      for (const u of g.units) if (u.owner === 1) u.order = { type: 'hold' };
      // wild things
      for (const [x, y] of [[30, 20], [58, 64], [10, 30]]) S.spawn(g, 2, [['shadow_wolf', 2]], x * T, y * T).forEach((u) => { u.homeX = u.x; u.homeY = u.y; });
      g.ais = [];
      const sc = (g.scenario = { id: 'lorraine', customVictoryOnly: true, wave: 0, nextWave: 70, lordId: 0, circleId: circle.id, corwinId: corwin.id, keepId: keep.id, phase: 1 });
      S.obj(g, 'survive', 'Hold the keep of Lorraine until the assault breaks', { progress: '6:00' });
      S.obj(g, 'corwin', 'Corwin must survive');
      S.say(g, 'Ganelon', 'So. You came back, Corwin. The Circle grows every night. Tonight they come for the keep.', 'ganelon');
      S.say(g, 'Corwin', 'Then we hold it. Bring the stewards in, and put every blade on the wall.', 'corwin');
      sc.onTick = (g) => {
        S.runTimers(g);
        const lordU = g.get(sc.lordId);
        if (sc.phase === 1) {
          const left = Math.max(0, 360 - g.time);
          const o = S.getObj(g, 'survive');
          if (o) { const p = U.formatTime(left); if (o.progress !== p) { o.progress = p; g.emit({ type: 'objectives' }); } }
          if (g.time >= sc.nextWave) {
            sc.wave++;
            sc.nextWave = g.time + 55;
            const n = sc.wave;
            const list = [['demon', Math.min(10, 2 + n)]];
            if (n >= 3) list.push(['stalker', Math.min(4, n - 2)]);
            if (n >= 4) list.push(['crossbow', Math.min(4, n - 3)]);
            if (n >= 6) list.push(['hellmaid', 1]);
            const us = S.spawn(g, 1, list, 58 * T, 22 * T);
            S.waveAttack(g, us, 14 * T, 60 * T);
            g.message('Demons pour from the Circle!', { kind: 'warn' });
            g.sfx('chaosWave', 58 * T, 22 * T);
          }
          if (g.time >= 360) {
            sc.phase = 2;
            // the lord of the Circle shows himself only when the assault breaks
            const lord = g.spawnUnit('goat_lord', 1, 58 * T, 19 * T);
            lord.homeX = lord.x; lord.homeY = lord.y;
            lord.order = { type: 'hold' };
            sc.lordId = lord.id;
            g.fx('pattern', { x: lord.x, y: lord.y, r: 90 });
            S.done(g, 'survive');
            S.obj(g, 'lord', 'Ride to the Circle and slay the goat-faced lord');
            S.say(g, 'Ganelon', 'They falter! Now, while they reel, we ride for the Circle itself.', 'ganelon');
            S.say(g, 'Corwin', 'Their leader knows my name. Let us see if he knows his own death.', 'corwin');
            sc.nextWave = g.time + 80;
          }
        } else if (sc.phase === 2) {
          if (g.time >= sc.nextWave) {
            sc.nextWave = g.time + 75;
            const us = S.spawn(g, 1, [['demon', 4], ['stalker', 2]], 58 * T, 22 * T);
            S.waveAttack(g, us, 14 * T, 60 * T);
          }
        }
        // the lord is roused when enemies come near or strike him, and fights for the Circle
        if (lordU && !lordU.dead && sc.phase < 3 && g.tickN % 15 === 0) {
          const foes = g.units.filter((u) => !u.dead && u.owner === 0 && !g.isStealthed(u) && Math.hypot(u.x - lordU.homeX, u.y - lordU.homeY) < 14 * T);
          if (!lordU.roused && (lordU.hp < lordU.maxHp || foes.some((u) => Math.hypot(u.x - lordU.x, u.y - lordU.y) < 9 * T))) {
            lordU.roused = true;
            S.say(g, 'The Goat-Faced Lord', 'Opener! You granted us passage. Will you now deny it?', 'goat_lord', 1);
          }
          if (lordU.roused) {
            const busy = lordU.order && (lordU.order.type === 'attack' || lordU.order.type === 'attackMove');
            if (foes.length && !busy) {
              foes.sort((a, b) => Math.hypot(a.x - lordU.x, a.y - lordU.y) - Math.hypot(b.x - lordU.x, b.y - lordU.y));
              AC.issue(g, lordU, { type: 'attackMove', x: foes[0].x, y: foes[0].y }, false);
            } else if (!foes.length && Math.hypot(lordU.x - lordU.homeX, lordU.y - lordU.homeY) > 3 * T && !(lordU.order && lordU.order.type === 'move')) {
              // nothing left near the Circle: back to its rim
              AC.issue(g, lordU, { type: 'move', x: lordU.homeX, y: lordU.homeY }, false);
              lordU.queue.push({ type: 'hold' });
            }
          }
        }
        if (sc.phase === 3 && g.time > sc.endT) sc.result = 0;
      };
      sc.onDeath = (g, e, src) => {
        if (sc.lordId && e.id === sc.lordId) {
          sc.phase = 3;
          S.done(g, 'lord');
          S.say(g, 'Corwin', 'The way is closed. Lorraine will heal, in time.', 'corwin');
          const c = g.get(sc.circleId);
          if (c && !c.dead) g.kill(c, src);
          for (const u of g.units) if (!u.dead && u.owner === 1) g.kill(u, null);
          sc.endT = g.time + 5;
        }
        if (e.id === sc.corwinId) { const o = S.getObj(g, 'corwin'); if (o) o.failed = true; sc.result = 1; }
        if (e.id === sc.keepId) { g.message('The keep has fallen.', { kind: 'warn' }); sc.result = 1; }
      };
      sc.checkVictory = (g) => (sc.result != null ? sc.result : null);
      return S.finish(g);
    },
    epilogue: 'The Circle shrank and was gone, and in its place lay only a scar on the land. Ganelon asked to ride with Corwin to Avalon. Corwin, who remembered an old betrayal, said yes, and wondered at himself.',
  });

  // 2 ---------------------------------------------------------------- The Guns of Avalon
  SC.push({
    id: 'kolvir', num: 2, title: 'The Guns of Avalon', book: 'The Guns of Avalon', faction: 'amber',
    blurb: 'Corwin returns to Amber with riflemen whose ammunition is jeweler\'s rouge, and finds Kolvir already besieged by the creatures of the Black Road.',
    intro: [
      'Gunpowder will not burn in Amber. But Corwin has learned that jeweler\'s rouge from Avalon will. He has bought rifles with the loose diamonds of a far Shadow, and armed the Shadow-folk who once followed him as a god.',
      'He comes to Kolvir meaning to take the throne from Eric, and finds Amber already under siege. A Black Road runs out of Shadow to the very foot of the mountain. Manticores and wyvern-riders from the Courts of Chaos are climbing the slopes.',
      'Break the siege. Then follow the Black Road east and destroy every work of Chaos that stands upon it.',
    ],
    tips: ['Rouge Riflemen hit hard at long range, but they are fragile. Screen them with Guards.', 'Eric has given you the Jewel of Judgment. Any hero can call its storm (E), at the cost of their own life force.', 'The Lighthouses of Cabra can see and shoot far. Build them at the passes.'],
    create(opts) {
      const g = S.newGame(opts);
      const m = S.newMap(96, 96, 'kolvir', 57);
      S.noise(m, 57, 0.08, 0.7, TER.FOREST, (x, y) => x < 44 && y < 34);
      S.noise(m, 91, 0.1, 0.72, TER.FOREST);
      S.noise(m, 23, 0.09, 0.7, TER.ROCK, (x) => x > 46);
      S.noise(m, 66, 0.08, 0.6, TER.ASH, (x, y) => x > 50 && Math.abs(y - 48) < 20);
      // Kolvir massif
      m.disc(22, 48, 19, TER.ROCK, 2.5, true);
      m.disc(20, 48, 10, TER.GRASS, 1.2, true);
      m.disc(19, 48, 4, TER.STONE);
      S.path(m, [[28, 48], [36, 49], [44, 50]], 2, TER.DIRT); // the great stair
      S.path(m, [[22, 40], [24, 32], [26, 26]], 1, TER.DIRT); // north path into Arden
      for (let y = 0; y < 96; y++) for (let x = 0; x < 4; x++) m.terrain[y * 96 + x] = TER.WATER;
      m.disc(52, 28, 7, TER.GRASS); m.disc(52, 70, 7, TER.GRASS); m.disc(82, 50, 12, TER.ASH); m.disc(40, 70, 6, TER.GRASS);
      S.path(m, [[40, 60], [40, 74], [44, 90]], 1, TER.DIRT);
      S.border(m, TER.ROCK);
      g.setMap(m);
      g.mapName = 'Kolvir';
      g.addPlayer({ name: 'Corwin of Amber', faction: 'amber', color: AC.PLAYER_COLORS[0], startD: 500, startP: 200 });
      g.addPlayer({ name: 'The Courts of Chaos', faction: 'chaos', color: AC.PLAYER_COLORS[1], team: 1, isAI: true, difficulty: opts.difficulty || 'normal', startD: 900, startP: 300 });
      g.addPlayer({ name: 'Wild things of Shadow', isNeutral: true, faction: 'neutral', team: -99, color: AC.NEUTRAL_COLOR });
      g.localPlayer = 0;
      g.players[0].upgrades.jewel = true;
      // Amber
      const castle = g.spawnBuilding('castle', 0, 17, 46, true);
      g.spawnBuilding('barracks', 0, 13, 41, true);
      g.spawnBuilding('shrine', 0, 23, 41, true);
      g.spawnBuilding('hall_steward', 0, 13, 52, true);
      g.spawnBuilding('hall_steward', 0, 16, 53, true);
      g.spawnBuilding('lighthouse', 0, 26, 45, true);
      g.spawnBuilding('lighthouse', 0, 26, 51, true);
      g.spawnBuilding('hall_trumps', 0, 21, 52, true);
      S.field(g, 19, 48, Math.PI * 0.95, 6, 6.2, 1500);
      S.field(g, 52, 28, -Math.PI / 2, 6, 4, 1300);
      S.field(g, 52, 70, Math.PI / 2, 6, 4, 1300);
      for (let k = 0; k < 8; k++) { const w = g.spawnUnit('steward', 0, 17 * T + (k % 4) * 22, 44 * T + Math.floor(k / 4) * 22); const r = AC.Behavior.findResource(g, w, castle.x, castle.y, 12 * T); if (r) w.order = { type: 'gather', target: r.id }; }
      S.spawn(g, 0, [['guard', 8], ['ranger', 6]], 27 * T, 48 * T);
      if (opts.difficulty !== 'hard') { g.spawnBuilding('lighthouse', 0, 19, 40, true); g.spawnBuilding('lighthouse', 0, 19, 56, true); }
      const corwin = S.hero(g, 0, 'corwin', 40 * T, 64 * T, 3);
      S.spawn(g, 0, [['rifleman', 8]], 40 * T, 67 * T);
      g.spawnSite(52, 28, 'Broken Pattern of Arden\'s Edge');
      g.spawnSite(52, 70, 'Broken Pattern of Garnath');
      // Chaos stronghold at the end of the road
      S.lay(g, 94, 50, 44, 50, 2);
      g.spawnBuilding('spire', 1, 80, 48, true);
      g.spawnBuilding('pit', 1, 76, 42, true);
      g.spawnBuilding('hendrake', 1, 84, 42, true);
      g.spawnBuilding('logrus_shrine', 1, 76, 54, true);
      g.spawnBuilding('hollow', 1, 86, 54, true);
      g.spawnBuilding('hollow', 1, 88, 46, true);
      g.spawnBuilding('serpent_eye', 1, 72, 48, true);
      g.spawnBuilding('obelisk', 1, 66, 50, true);
      g.spawnBuilding('obelisk', 1, 56, 49, true);
      S.field(g, 82, 50, 0, 7, 7, 1500);
      for (let k = 0; k < 10; k++) { const w = g.spawnUnit('thrall', 1, 82 * T + (k % 5) * 20, 47 * T + Math.floor(k / 5) * 20); const r = AC.Behavior.findResource(g, w, 82 * T, 50 * T, 12 * T); if (r) w.order = { type: 'gather', target: r.id }; }
      // the garrison of the stronghold
      const hardK = opts.difficulty === 'hard' ? 1.4 : opts.difficulty === 'easy' ? 0.6 : 0.85;
      const k = (n) => Math.max(1, Math.round(n * hardK));
      S.garrison(S.spawn(g, 1, [['demon', k(12)], ['crossbow', k(8)], ['hellmaid', k(3)], ['manticore', k(2)], ['wyvern', k(2)]], 74 * T, 50 * T));
      g.spawnBuilding('pit', 1, 88, 38, true);
      g.spawnBuilding('den', 1, 88, 58, true);
      g.spawnBuilding('serpent_eye', 1, 72, 44, true);
      g.spawnBuilding('serpent_eye', 1, 72, 54, true);
      // the siege at the foot of the stair
      const siege = S.spawn(g, 1, [['manticore', 2], ['wyvern', 2], ['demon', 6], ['crossbow', 4]], 40 * T, 49 * T);
      for (const u of siege) { u.order = { type: 'attackMove', x: 31 * T, y: 48 * T }; u.homeX = 33 * T; u.homeY = 48 * T; }
      for (const [x, y] of [[34, 22], [64, 80]]) S.spawn(g, 2, [['wild_manticore', 1]], x * T, y * T).forEach((u) => { u.homeX = u.x; u.homeY = u.y; });
      const ai = new AC.AI(g, 1, { firstWave: opts.difficulty === 'hard' ? 300 : 400, noCreep: true, gatherMult: S.enemyIncome(opts, 0.8) });
      ai.rally = { x: 70 * T, y: 50 * T };
      castle.maxHp = castle.hp = 5200; // the heart of Amber is not easily breached
      g.get(g.buildings.find((b) => b.def.id === 'spire' && b.owner === 1).id).maxHp = 4800;
      for (const b of g.buildings) if (b.def.id === 'spire' && b.owner === 1) b.hp = b.maxHp;
      g.ais.push(ai);
      const sc = (g.scenario = { id: 'kolvir', customVictoryOnly: true, siege: siege.map((u) => u.id), castleId: castle.id, phase: 1 });
      S.obj(g, 'siege', 'Break the siege at the foot of Kolvir');
      S.obj(g, 'road', 'Destroy every work of Chaos upon the Black Road');
      S.obj(g, 'sites', 'Hold both Broken Patterns', { optional: true });
      S.obj(g, 'castle', 'Castle Amber must not fall');
      S.say(g, 'Corwin', 'Smoke on Kolvir. Wyverns over the stair. Someone has already brought war to Amber.', 'corwin');
      S.say(g, 'Eric', 'Corwin… I have held them as long as I could. Take it. The Jewel. Keep it from them…', 'corwin', 3, 7);
      S.at(g, 6, (g) => { S.say(g, 'Corwin', 'My brother is dead, and the Jewel of Judgment hangs at my throat. Riflemen, to the stair!', 'corwin'); g.message('Eric dies. You now bear the Jewel of Judgment: your heroes can call its storm (E).', { kind: 'good', life: 8 }); });
      S.at(g, 170, (g) => {
        const b = S.hero(g, 0, 'benedict', 22 * T, 50 * T, 4);
        g.fx('trump', { x: b.x, y: b.y, color: '#ffe08a', big: true });
        S.say(g, 'Benedict', 'Your Trump found me, Corwin. I will take the riflemen. Their weapon is ugly, but it works.', 'benedict');
      });
      S.at(g, 470, (g) => {
        const d = S.hero(g, 1, 'dara', 19 * T, 50 * T, 4);
        const maids = S.spawn(g, 1, [['hellmaid', 3]], 21 * T, 52 * T);
        g.fx('pattern', { x: d.x, y: d.y, r: 120 });
        S.say(g, 'Dara', 'I have walked your Pattern, Corwin. Amber will be destroyed!', 'dara', 1);
        g.command(1, { type: 'attackMove', ids: [d.id, ...maids.map((u) => u.id)], x: castle.x, y: castle.y });
        g.message('Dara has walked the Pattern beneath the castle. She is a creature of Chaos!', { kind: 'warn', life: 8 });
      });
      sc.onTick = (g) => {
        S.runTimers(g);
        if (g.tickN % 30 !== 0) return;
        const o1 = S.getObj(g, 'siege');
        const left = sc.siege.filter((id) => { const u = g.get(id); return u && !u.dead && u.owner === 1; }).length;
        if (!o1.done) { o1.progress = left + ' remain'; if (left === 0) { S.done(g, 'siege'); S.say(g, 'Benedict', 'The stair is clear. Now we follow the Road to its end.', 'benedict'); } g.emit({ type: 'objectives' }); }
        const works = g.buildings.filter((b) => !b.dead && b.owner === 1).length;
        const o2 = S.getObj(g, 'road');
        if (o2.progress !== works + ' remain') { o2.progress = works + ' remain'; g.emit({ type: 'objectives' }); }
        if (works === 0) { S.done(g, 'road'); sc.result = 0; }
        const held = g.sites.filter((s) => s.capOwner === 0).length;
        const o3 = S.getObj(g, 'sites');
        if (held === 2 && !o3.done) S.done(g, 'sites');
      };
      sc.onDeath = (g, e) => { if (e.id === sc.castleId) { S.getObj(g, 'castle').failed = true; sc.result = 1; } };
      sc.checkVictory = (g) => (sc.result != null ? sc.result : null);
      return S.finish(g);
    },
    epilogue: 'The Road was broken where it touched Kolvir, and Amber stood. Corwin found himself regent, though not king, with the Jewel of Judgment heavy at his throat. And the woman called Dara had walked the Pattern and vanished, promising ruin.',
  });

  // 3 ---------------------------------------------------------------- The Tower of Brand
  SC.push({
    id: 'tower', num: 3, title: 'The Tower of Brand', book: 'Sign of the Unicorn', faction: 'amber',
    blurb: 'Brand lies imprisoned in a land lit without a sun, guarded by a glass dragon. Corwin, Random and Gérard go to bring him out.',
    intro: [
      'Brand, long missing, called to Random once through a card in a poker hand, begging for help. Now the family has found him through his Trump. He is held in a tower in a land lit without a sun, where boulders orbit one another in slow and complicated patterns.',
      'Random tried this once and failed. Something guards the tower: transparent, prismatic, dragon-like.',
      'Lead Corwin, Random and Gérard across the strange land. Slay the guardian and reach the tower door. There are no reinforcements here, and no Trumps home until the work is done.',
    ],
    tips: ['There is no base in this mission. Keep your heroes together and use their abilities.', 'Stand beside a Broken Pattern to claim it. Your heroes heal swiftly while they stand near one you hold.', 'Gérard\'s Hold the Line (W) draws the enemy to him while he shrugs off half their blows.'],
    create(opts) {
      const g = S.newGame(opts);
      const m = S.newMap(72, 72, 'shadow', 13, TER.ROCK);
      // winding valley
      const pts = [[8, 64], [18, 58], [22, 46], [16, 34], [24, 24], [38, 28], [48, 40], [58, 34], [56, 20], [62, 10]];
      for (let i = 0; i < pts.length - 1; i++) m.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3, TER.ASH);
      for (const [x, y] of pts) m.disc(x, y, 5.5, TER.ASH, 1.5, true);
      m.disc(8, 64, 7, TER.ASH); m.disc(56, 16, 8, TER.ASH); m.disc(62, 8, 5, TER.STONE);
      S.noise(m, 13, 0.15, 0.68, TER.GRASS, (x, y) => m.terrain[y * 72 + x] === TER.ASH);
      S.border(m, TER.ROCK);
      g.setMap(m);
      g.mapName = 'A land without a sun';
      g.addPlayer({ name: 'The Princes of Amber', faction: 'amber', color: AC.PLAYER_COLORS[0], startD: 0, startP: 0 });
      g.addPlayer({ name: 'Wild things of Shadow', isNeutral: true, faction: 'neutral', team: -99, color: AC.NEUTRAL_COLOR });
      g.localPlayer = 0;
      const heroes = [S.hero(g, 0, 'corwin', 8 * T, 63 * T, 4), S.hero(g, 0, 'random', 9 * T, 65 * T, 4), S.hero(g, 0, 'gerard', 7 * T, 65 * T, 4)];
      const tower = g.spawnBuilding('brand_tower', 1, 61, 4, true);
      for (const [x, y, name] of [[22, 46, 'Broken Pattern'], [38, 28, 'Broken Pattern'], [56, 30, 'Broken Pattern']]) g.spawnSite(x, y, name);
      const N = 1;
      const camps = [
        [18, 56, [['shadow_wolf', 3]]], [16, 36, [['shadow_wolf', 3], ['wild_manticore', 1]]], [26, 24, [['stalker', 3]]],
        [44, 34, [['wild_manticore', 2]]], [50, 42, [['shadow_wolf', 4]]], [58, 26, [['stalker', 3], ['shadow_wolf', 2]]],
      ];
      for (const [x, y, l] of camps) S.spawn(g, N, l, x * T, y * T).forEach((u) => { u.homeX = u.x; u.homeY = u.y; });
      const dragon = g.spawnUnit('glass_dragon', N, 56 * T, 15 * T);
      dragon.homeX = dragon.x; dragon.homeY = dragon.y;
      const sc = (g.scenario = { id: 'tower', customVictoryOnly: true, heroes: heroes.map((h) => h.id), dragonId: dragon.id, phase: 1 });
      S.obj(g, 'cross', 'Cross the sunless land to Brand\'s tower');
      S.obj(g, 'dragon', 'Slay the glass guardian');
      S.obj(g, 'door', 'Bring a hero to the tower door');
      S.obj(g, 'live', 'At least one of the three must live');
      S.say(g, 'Random', 'Last time I came here the thing in front of the tower nearly had me. Don\'t let it get between you and the rocks.', 'random');
      S.say(g, 'Gérard', 'Then it will have to get past me.', 'gerard');
      sc.onTick = (g) => {
        S.runTimers(g);
        // heal at held Broken Patterns
        for (const s of g.sites) {
          if (s.capOwner !== 0) continue;
          for (const u of S.unitsNear(g, 0, s.x, s.y, 3.5 * T)) { u.hp = Math.min(u.maxHp, u.hp + 30 * AC.TICK); u.mana = Math.min(u.maxMana, u.mana + 6 * AC.TICK); }
        }
        const alive = sc.heroes.map((id) => g.get(id)).filter((h) => h && !h.dead);
        if (!alive.length) { S.getObj(g, 'live').failed = true; sc.result = 1; return; }
        if (sc.phase === 1 && alive.some((h) => h.y < 30 * T && h.x > 40 * T)) {
          sc.phase = 2; S.done(g, 'cross');
          S.say(g, 'Corwin', 'There, in the light that comes from nowhere. Something glitters in front of the tower.', 'corwin');
        }
        const dr = g.get(sc.dragonId);
        if (sc.phase >= 1 && sc.phase < 4 && (!dr || dr.dead) && !S.getObj(g, 'dragon').done) { S.done(g, 'dragon'); sc.phase = 3; }
        if (sc.phase === 3 && alive.some((h) => Math.hypot(h.x - 62.5 * T, h.y - 8.5 * T) < 3.2 * T)) {
          sc.phase = 4; S.done(g, 'door');
          S.say(g, 'Gérard', 'The door is barred from within. Stand back.', 'gerard');
          S.say(g, 'Brand', 'Brothers… you came. Get me out of here, before—', 'brand', 3);
          S.say(g, 'Corwin', 'A blade! Someone of the blood struck through the Trump contact. Gérard, carry him. We go home.', 'corwin');
          sc.endT = g.time + 14;
        }
        if (sc.phase === 4 && g.time > sc.endT) sc.result = 0;
      };
      sc.checkVictory = (g) => (sc.result != null ? sc.result : null);
      return S.finish(g);
    },
    epilogue: 'They brought Brand home to Amber, bleeding from a wound no stranger had given him. Gérard sat by his bed with a blade across his knees. Someone in the family wanted Brand silenced, and nobody would say who.',
  });

  // 4 ---------------------------------------------------------------- Patternfall
  SC.push({
    id: 'patternfall', num: 4, title: 'Patternfall', book: 'The Courts of Chaos', faction: 'amber',
    blurb: 'Benedict leads the hosts of Amber against the Courts at the edge of the Abyss, while Corwin rides the dissolving Black Road with the Jewel.',
    intro: [
      'Oberon has gone to repair the Primal Pattern, and the effort may kill him. Behind him a storm of raw Chaos is spreading across all of Shadow. Brand has fled to the Courts with half the secrets of Amber.',
      'Benedict has trumped the armies of Amber to the very edge of the Abyss, where the Courts of Chaos stand under a sky half striped and half swirling black. Corwin rides toward him along the Black Road, carrying the Jewel of Judgment.',
      'Destroy the Thelbane Spire. Beware Brand, who can go anywhere he wills, and Borel of Hendrake, the finest blade of the Courts. And beware the storms that roll out of the Abyss.',
    ],
    tips: ['Storms of Chaos sweep the field from the east from time to time. You are warned before each one. Move out of its path!', 'Corwin and Caine will join you during the battle.', 'The Shrine of the Unicorn can bless your whole host (B).'],
    create(opts) {
      const g = S.newGame(opts);
      const W = 112;
      const m = S.newMap(W, W, 'courts', 73, TER.ASH);
      S.noise(m, 73, 0.09, 0.7, TER.ROCK);
      S.noise(m, 81, 0.1, 0.72, TER.FOREST, (x) => x < 50);
      S.noise(m, 85, 0.07, 0.62, TER.GRASS, (x) => x < 40);
      for (let y = 0; y < W; y++) {
        const edge = 100 + Math.round(Math.sin(y * 0.15) * 3 + Math.sin(y * 0.37) * 2);
        for (let x = edge; x < W; x++) m.terrain[y * W + x] = TER.ABYSS;
      }
      m.disc(14, 56, 13, TER.GRASS, 1.5, true); m.disc(13, 56, 4, TER.STONE);
      m.disc(86, 56, 14, TER.ASH, 1.5, true);
      m.disc(46, 30, 7, TER.ASH); m.disc(46, 82, 7, TER.ASH); m.disc(60, 56, 6, TER.ASH);
      S.path(m, [[20, 56], [40, 56], [60, 56], [76, 56]], 2, TER.DIRT);
      S.border(m, TER.ROCK);
      for (let y = 0; y < W; y++) for (let x = 100; x < W; x++) if (m.terrain[y * W + x] === TER.ROCK) m.terrain[y * W + x] = TER.ABYSS;
      g.setMap(m);
      g.mapName = 'The Courts of Chaos';
      g.addPlayer({ name: 'The Host of Amber', faction: 'amber', color: AC.PLAYER_COLORS[0], startD: 700, startP: 300 });
      g.addPlayer({ name: 'The Courts of Chaos', faction: 'chaos', color: AC.PLAYER_COLORS[1], team: 1, isAI: true, difficulty: opts.difficulty === 'hard' ? 'hard' : 'normal', startD: 700, startP: 300 });
      g.addPlayer({ name: 'Wild things of Shadow', isNeutral: true, faction: 'neutral', team: -99, color: AC.NEUTRAL_COLOR });
      g.localPlayer = 0;
      g.spawnBuilding('ygg', 2, 39, 62, true);
      // Amber camp
      const keep = g.spawnBuilding('keep', 0, 12, 54, true);
      g.spawnBuilding('barracks', 0, 8, 47, true);
      g.spawnBuilding('barracks', 0, 16, 47, true);
      g.spawnBuilding('shrine', 0, 8, 60, true);
      g.spawnBuilding('armory', 0, 16, 61, true);
      g.spawnBuilding('hall_trumps', 0, 20, 52, true);
      g.spawnBuilding('lodge', 0, 4, 52, true);
      for (const [x, y] of [[4, 46], [4, 58], [20, 46], [20, 60]]) g.spawnBuilding('hall_steward', 0, x, y, true);
      S.field(g, 13.5, 55.5, Math.PI * 0.7, 7, 7, 1500);
      S.field(g, 46, 30, -Math.PI / 2, 6, 4, 1500);
      S.field(g, 46, 82, Math.PI / 2, 6, 4, 1500);
      for (let k = 0; k < 10; k++) { const w = g.spawnUnit('steward', 0, 13 * T + (k % 5) * 20, 52 * T + Math.floor(k / 5) * 20); const r = AC.Behavior.findResource(g, w, keep.x, keep.y, 12 * T); if (r) w.order = { type: 'gather', target: r.id }; }
      S.hero(g, 0, 'benedict', 26 * T, 56 * T, 5);
      S.hero(g, 0, 'gerard', 26 * T, 59 * T, 4);
      S.spawn(g, 0, [['guard', 10], ['ranger', 8], ['lancer', 6], ['rifleman', 6], ['tidecaller', 2]], 28 * T, 56 * T);
      g.spawnSite(46, 30, 'Broken Pattern'); g.spawnSite(46, 82, 'Broken Pattern'); g.spawnSite(60, 56, 'Broken Pattern of the Rim');
      // the Courts
      S.lay(g, 34, 56, 80, 56, 1);
      const spire = g.spawnBuilding('spire', 1, 86, 54, true);
      const cb = [['pit', 82, 46], ['pit', 90, 46], ['hendrake', 82, 62], ['hendrake', 90, 62], ['den', 78, 52], ['roost', 94, 53], ['logrus_shrine', 76, 58], ['logrus_shrine', 86, 66],
        ['hall_houses', 86, 42], ['serpent_eye', 74, 50], ['serpent_eye', 74, 60], ['serpent_eye', 80, 68], ['hollow', 94, 44], ['hollow', 94, 48], ['hollow', 94, 60], ['hollow', 94, 64], ['hollow', 78, 44], ['hollow', 78, 66]];
      g.map.disc(86, 56, 14, TER.ASH);
      for (let y = 40; y < 72; y++) for (let x = 72; x < 98; x++) g.map.setRoad(x, y, 1);
      for (const [id, x, y] of cb) g.spawnBuilding(id, 1, x, y, true);
      S.field(g, 87.5, 56.5, 0, 7, 7, 1800);
      for (let k = 0; k < 14; k++) { const w = g.spawnUnit('thrall', 1, 86 * T + (k % 7) * 18, 52 * T + Math.floor(k / 7) * 18); const r = AC.Behavior.findResource(g, w, 88 * T, 56 * T, 12 * T); if (r) w.order = { type: 'gather', target: r.id }; }
      const brand = S.hero(g, 1, 'brand', 82 * T, 56 * T, 5);
      S.hero(g, 1, 'borel', 82 * T, 58 * T, 4);
      const hk = opts.difficulty === 'hard' ? 1.4 : opts.difficulty === 'easy' ? 0.65 : 1;
      const k = (n) => Math.max(1, Math.round(n * hk));
      S.garrison(S.spawn(g, 1, [['demon', k(9)], ['crossbow', k(7)], ['hellmaid', k(3)], ['manticore', k(2)], ['wyvern', k(2)], ['spitter', k(1)]], 72 * T, 56 * T));
      S.garrison(S.spawn(g, 1, [['demon', k(4)], ['crossbow', k(3)], ['manticore', 1]], 84 * T, 50 * T));
      spire.maxHp = spire.hp = 5000;
      const ai = new AC.AI(g, 1, { firstWave: 300, noCreep: true, gatherMult: S.enemyIncome(opts, 1) });
      ai.rally = { x: 70 * T, y: 56 * T };
      g.ais.push(ai);
      const sc = (g.scenario = { id: 'patternfall', customVictoryOnly: true, spireId: spire.id, brandId: brand.id, nextStorm: 230 });
      S.obj(g, 'spire', 'Destroy the Thelbane Spire');
      S.obj(g, 'brand', 'Slay Brand, the traitor', { optional: true });
      S.say(g, 'Benedict', 'We hold the rim. Fiona and the others are watching through the Trumps. When Corwin comes, we strike.', 'benedict');
      S.at(g, 140, (g) => {
        const c = S.hero(g, 0, 'corwin', 3 * T, 56 * T, 5);
        g.players[0].upgrades.jewel = true;
        g.fx('trump', { x: c.x, y: c.y, color: '#ffe08a', big: true });
        S.say(g, 'Corwin', 'The Road came apart under my horse, but the Jewel is safe. I have seen a new Pattern, Benedict. Mine. Now let us end this.', 'corwin');
        g.message('Corwin has arrived bearing the Jewel of Judgment: heroes can call its storm (E).', { kind: 'good', life: 8 });
      });
      S.at(g, 420, (g) => {
        const c = S.hero(g, 0, 'caine', 30 * T, 50 * T, 5);
        g.fx('trump', { x: c.x, y: c.y, color: '#2f8a4a', big: true });
        S.say(g, 'Caine', 'Surprised? The body you buried was one of my shadows. I have been watching. Leave Brand to me.', 'caine');
      });
      sc.onTick = (g) => {
        S.runTimers(g);
        if (g.time >= sc.nextStorm - 12 && !sc.warned) {
          sc.warned = true;
          sc.stormY = (20 + Math.random() * 72) * T;
          g.message('A storm of Chaos is rising out of the Abyss!', { kind: 'warn' });
          g.sfx('alert', 0, 0);
          g.fx('target', { x: 98 * T, y: sc.stormY, r: 5 * T, t: 12, color: '#ff40c0', player: 0 });
        }
        if (g.time >= sc.nextStorm) {
          sc.warned = false;
          sc.nextStorm = g.time + 130;
          g.zones.push({ type: 'wave', x: 98 * T, y: sc.stormY, r: 5 * T, t: 40, dur: 40, owner: 1, src: 0, acc: 0, vx: -70, vy: 0, reveal: 6, moving: true });
        }
      };
      sc.onDeath = (g, e, src) => {
        if (e.id === sc.spireId) { S.done(g, 'spire'); sc.result = 0; }
        if (e.id === sc.brandId && !S.getObj(g, 'brand').done) {
          S.done(g, 'brand');
          if (src && src.def && src.def.id === 'caine') S.say(g, 'Caine', 'Silver-tipped, through the throat. For Martin, brother.', 'caine');
          else S.say(g, 'Corwin', 'Brand falls, and the Abyss takes him. Let no one say he did not choose it.', 'corwin');
          sc.brandDead = true;
        }
        if (sc.brandDead && e.def.id === 'brand') g.bannedHeroes = new Set(['brand']); // he does not come back
      };
      sc.checkVictory = (g) => {
        if (sc.result != null) return sc.result;
        if (!g.buildings.some((b) => !b.dead && b.owner === 0)) return 1;
        return null;
      };
      return S.finish(g);
    },
    epilogue: 'The storm broke against Corwin\'s new Pattern and passed over. Out of the Abyss came the Unicorn, wearing the Jewel of Judgment. It looked at each of them in turn, and knelt before Random. The princes and princesses of Amber knelt with it, and Random was king.',
  });

  // 5 ---------------------------------------------------------------- Daughter of Chaos (Chaos campaign)
  SC.push({
    id: 'dara', num: 5, title: 'Daughter of Chaos', book: 'The Guns of Avalon (from the other side)', faction: 'chaos',
    blurb: 'Play the Courts. Push the Black Road through Arden and bring Dara to the Pattern beneath Castle Amber.',
    intro: [
      'Dara is a great-granddaughter of Benedict, through the Hellmaid Lintra, and she was raised in the Courts. Borel of Hendrake taught her the sword. The Courts have a use for blood like hers: anyone of the line who walks the Pattern of Amber gains power over it.',
      'Julian holds the Forest of Arden with his rangers and his hellhounds. Beyond Arden rises Kolvir, and beneath Castle Amber lies the Pattern.',
      'Extend the Black Road into Shadow. Burn Julian\'s lodge. Then bring Dara to the Pattern and keep her alive while she walks it.',
    ],
    tips: ['Your works must stand on the Black Road. Road Obelisks can be summoned anywhere and spread the Road around them.', 'Enemy soldiers on the Black Road lose health. Fight on your own ground!', 'Dara\'s Shape of Chaos (Q) makes her terrible in melee.'],
    create(opts) {
      const g = S.newGame(opts);
      const W = 96;
      const m = S.newMap(W, W, 'arden', 41);
      S.noise(m, 41, 0.085, 0.56, TER.FOREST, (x) => x > 26 && x < 70);
      S.noise(m, 43, 0.1, 0.7, TER.FOREST);
      m.disc(14, 48, 15, TER.ROCK, 2.5, true);
      m.disc(14, 48, 10, TER.GRASS, 1, true);
      S.path(m, [[20, 48], [30, 48]], 2, TER.DIRT);
      m.disc(84, 48, 11, TER.ASH, 1.5, true);
      m.disc(42, 30, 6, TER.GRASS); m.disc(56, 66, 6, TER.GRASS); m.disc(34, 48, 6, TER.GRASS); m.disc(64, 40, 6, TER.GRASS);
      S.path(m, [[30, 48], [42, 44], [56, 50], [74, 48]], 1, TER.DIRT);
      S.path(m, [[42, 30], [44, 40]], 1, TER.DIRT); S.path(m, [[56, 66], [54, 54]], 1, TER.DIRT);
      S.border(m, TER.ROCK);
      g.setMap(m);
      g.mapName = 'The Forest of Arden';
      g.addPlayer({ name: 'The Courts of Chaos', faction: 'chaos', color: AC.PLAYER_COLORS[1], startD: 500, startP: 250 });
      g.addPlayer({ name: 'Amber', faction: 'amber', color: AC.PLAYER_COLORS[0], team: 1, isAI: true, difficulty: opts.difficulty || 'normal', startD: 500, startP: 150 });
      g.addPlayer({ name: 'Wild things of Shadow', isNeutral: true, faction: 'neutral', team: -99, color: AC.NEUTRAL_COLOR });
      g.localPlayer = 0;
      // Chaos
      const bastion = g.spawnBuilding('spire', 0, 82, 46, true);
      g.spawnBuilding('pit', 0, 86, 40, true);
      g.spawnBuilding('hollow', 0, 88, 52, true);
      g.spawnBuilding('hall_houses', 0, 78, 52, true);
      S.field(g, 84, 48, 0, 7, 7, 1500);
      S.field(g, 64, 40, -Math.PI / 2, 5, 3.5, 1300);
      S.field(g, 56, 66, Math.PI / 2, 5, 3.5, 1300);
      for (let k = 0; k < 8; k++) { const w = g.spawnUnit('thrall', 0, 82 * T + (k % 4) * 20, 44 * T + Math.floor(k / 4) * 20); const r = AC.Behavior.findResource(g, w, 84 * T, 48 * T, 12 * T); if (r) w.order = { type: 'gather', target: r.id }; }
      const dara = S.hero(g, 0, 'dara', 76 * T, 48 * T, 3);
      S.spawn(g, 0, [['demon', 6], ['hellmaid', 2], ['crossbow', 4]], 74 * T, 50 * T);
      // Amber
      const castle = g.spawnBuilding('castle', 1, 10, 46, true);
      g.spawnBuilding('barracks', 1, 15, 41, true);
      g.spawnBuilding('hall_steward', 1, 7, 52, true);
      g.spawnBuilding('hall_steward', 1, 10, 52, true);
      g.spawnBuilding('shrine', 1, 16, 51, true);
      g.spawnBuilding('lighthouse', 1, 20, 45, true);
      g.spawnBuilding('lighthouse', 1, 20, 50, true);
      const lodge = g.spawnBuilding('lodge', 1, 41, 26, true);
      g.spawnBuilding('lighthouse', 1, 45, 30, true);
      S.field(g, 12, 48, Math.PI, 6, 6, 1500);
      for (let k = 0; k < 10; k++) { const w = g.spawnUnit('steward', 1, 12 * T + (k % 5) * 20, 44 * T); const r = AC.Behavior.findResource(g, w, castle.x, castle.y, 12 * T); if (r) w.order = { type: 'gather', target: r.id }; }
      const julian = S.hero(g, 1, 'julian', 43 * T, 32 * T, 3);
      S.garrison(S.spawn(g, 1, [['ranger', 6], ['hellhound', 4]], 42 * T, 34 * T)).forEach((u) => (u.order = { type: 'hold' }));
      S.garrison(S.spawn(g, 1, [['guard', 6], ['ranger', 4]], 24 * T, 48 * T));
      const pattern = g.spawnSite(17, 48, 'The Pattern');
      pattern.noCapture = true; pattern.isPattern = true;
      const ai = new AC.AI(g, 1, { firstWave: 420, noCreep: true, noExpand: true, gatherMult: S.enemyIncome(opts, 0.8) });
      g.ais.push(ai);
      for (const [x, y] of [[60, 20], [30, 76]]) S.spawn(g, 2, [['shadow_wolf', 3]], x * T, y * T).forEach((u) => { u.homeX = u.x; u.homeY = u.y; });
      const sc = (g.scenario = { id: 'dara', customVictoryOnly: true, lodgeId: lodge.id, daraHero: 'dara', patternId: pattern.id, walk: 0, phase: 1 });
      S.obj(g, 'lodge', 'Burn Julian\'s Lodge of Arden');
      S.obj(g, 'walk', 'Bring Dara to the Pattern beneath Castle Amber, and keep her there for 30 seconds');
      S.obj(g, 'julian', 'Slay Julian, Lord of Arden', { optional: true });
      S.say(g, 'Borel', 'Remember what I taught you, child. The blood of Amber runs in you. Let it open their Pattern to us.', 'borel', 1);
      S.say(g, 'Dara', 'I remember everything. Spread the Road. Arden first.', 'dara', 1);
      sc.julianId = julian.id;
      sc.onTick = (g) => {
        S.runTimers(g);
        const d = g.units.find((u) => !u.dead && u.owner === 0 && u.def.id === 'dara');
        const pt = g.get(sc.patternId);
        const arden = S.getObj(g, 'lodge');
        const onPattern = d && pt && Math.hypot(d.x - pt.x, d.y - pt.y) < 2.4 * T;
        if (onPattern && !(arden && arden.done)) {
          // Julian's riders would be on her before the First Veil
          if (!sc.toldLodge) { sc.toldLodge = true; S.say(g, 'Dara', 'Not yet. While Arden stands, Julian\'s riders will reach me before the First Veil. Burn the lodge first.', 'dara', 1); }
        } else if (onPattern) {
          if (!sc.walk) { S.say(g, 'Dara', 'The First Veil… it is like walking through lead. I will not stop.', 'dara', 1); g.message('Dara walks the Pattern! Keep her alive!', { kind: 'warn' }); }
          sc.walk += AC.TICK;
          if (g.tickN % 15 === 0) g.fx('pattern', { x: pt.x, y: pt.y, r: 70 });
        } else if (sc.walk > 0) sc.walk = Math.max(0, sc.walk - AC.TICK * 0.5);
        if (!onPattern) sc.toldLodge = false;
        const o = S.getObj(g, 'walk');
        const p = sc.walk > 0 ? Math.floor(sc.walk) + ' / 30s' : '';
        if (o.progress !== p) { o.progress = p; g.emit({ type: 'objectives' }); }
        if (sc.walk >= 30 && !o.done) {
          S.done(g, 'walk');
          S.say(g, 'Dara', 'It is done. I have walked your Pattern, and Amber will be destroyed!', 'dara', 1);
          sc.endT = g.time + 6;
        }
        if (o.done && g.time > sc.endT) sc.result = 0;
      };
      sc.onDeath = (g, e) => {
        if (e.id === sc.lodgeId) { S.done(g, 'lodge'); S.say(g, 'Dara', 'Arden burns. Now, Kolvir.', 'dara', 1); }
        if (e.id === sc.julianId) S.done(g, 'julian');
      };
      sc.checkVictory = (g) => {
        if (sc.result != null) return sc.result;
        if (!g.buildings.some((b) => !b.dead && b.owner === 0)) return 1;
        return null;
      };
      return S.finish(g);
    },
    epilogue: 'Dara came out of the Pattern changed: tall, terrible, glittering, a creature of Chaos wearing a woman\'s face. She was gone before the princes could reach the cavern. What she had gained there, only the Courts knew.',
  });
})();
