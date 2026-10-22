// Amber and Chaos — buffs, auras, hero abilities, zones and global powers.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;
  const A = (AC.Abilities = {});
  const B = () => AC.Behavior;

  const DEBUFFS = { stun: 1, root: 1, slow: 1, poison: 1, hunted: 1, weaken: 1, taunt: 1 };

  A.addBuff = function (g, e, b) {
    for (const x of e.buffs) {
      if (x.id === b.id && (x.src === b.src || !b.stackBySrc)) {
        x.t = Math.max(x.t, b.t);
        Object.assign(x, b, { t: x.t });
        return x;
      }
    }
    e.buffs.push(b);
    return b;
  };
  A.hasBuff = (e, id) => e.buffs.some((b) => b.id === id);

  function playerUp(p) {
    const up = { meleeDmg: 0, rangedDmg: 0, rangedRange: 0, armor: 0, gunDmg: 0 };
    if (!p) return up;
    for (const k in p.upgrades) {
      const u = AC.UPGRADES[k];
      if (!u || !u.effect) continue;
      for (const f in u.effect) if (up[f] != null) up[f] += u.effect[f];
    }
    return up;
  }

  A.computeMods = function (g, dt) {
    const ups = g.players.map(playerUp);
    // auras
    for (const h of g.units) {
      if (h.dead || !h.def.aura) continue;
      const a = h.def.aura;
      const list = g.hash.query(h.x, h.y, a.radius * T, []);
      for (const u of list) {
        if (u.dead || !g.areAllies(u.owner, h.owner)) continue;
        if (U.dist2(u.x, u.y, h.x, h.y) > (a.radius * T) ** 2) continue;
        A.addBuff(g, u, { id: 'aura_' + a.kind, t: 0.25, amt: a.amount, src: h.id });
      }
    }
    for (const e of g.units) {
      if (e.dead) continue;
      const m = e.mods || (e.mods = {});
      m.dmg = 1; m.atkSpeed = 1; m.speed = 1; m.armor = 0; m.dmgTaken = 1; m.regen = 0;
      m.stunned = false; m.rooted = false; m.riposte = false; m.lifesteal = 0; m.range = 0; m.manaRegen = 1;
      const up = ups[e.owner];
      if (up && e.def.role !== 'worker') {
        if (e.def.projectile) { m.dmg += up.rangedDmg; m.range += up.rangedRange; }
        else m.dmg += up.meleeDmg;
        if (e.def.art === 'rifleman' || e.def.art === 'bombard') m.dmg += up.gunDmg;
        m.armor += up.armor;
      }
      let taunt = null;
      for (let i = e.buffs.length - 1; i >= 0; i--) {
        const b = e.buffs[i];
        b.t -= dt;
        if (b.t <= 0) { e.buffs.splice(i, 1); continue; }
        switch (b.id) {
          case 'stun': m.stunned = true; break;
          case 'root': m.rooted = true; break;
          case 'slow': m.speed *= 1 - b.amt; break;
          case 'haste': m.speed *= 1 + (b.speed || 0); m.atkSpeed *= 1 + (b.atk || 0); break;
          case 'hunted': m.dmgTaken *= 1.5; break;
          case 'holdLine': m.dmgTaken *= 0.5; break;
          case 'riposte': m.riposte = true; break;
          case 'fury': m.atkSpeed *= 1.4; m.lifesteal += 0.2; break;
          case 'chaosShape': m.dmg *= 1.4; m.armor += 2; m.regen += 9; break;
          case 'drum': m.speed *= 1.8; m.dmg *= 1.3; break;
          case 'feign': m.speed *= 1.3; break;
          case 'weaken': m.dmgTaken *= 1.0; m.dmg *= 0.7; break;
          case 'aura_damage': m.dmg += b.amt; break;
          case 'aura_armor': m.armor += b.amt; break;
          case 'surge': m.dmg *= 1.25; m.speed *= 1.2; break;
          case 'taunt': taunt = b; break;
          case 'poison':
            if (!e.def.hero || true) g.damage(null, e, b.dps * dt, 'true', { silent: true });
            break;
        }
      }
      if (taunt && !m.stunned) {
        const by = g.get(taunt.by);
        if (by && !by.dead && (!e.order || e.order.target !== by.id) && e.def.dmg && !(by.def.air && !e.def.canHitAir)) {
          // an auto (leashed) attack, so the unit gives up the chase once the taunt is over
          AC.issue(g, e, { type: 'attack', target: by.id, auto: true, homeX: e.x, homeY: e.y }, false);
        }
      }
    }
  };

  // ------------------------------------------------------------------ casting
  A.canCast = function (g, e, abId) {
    const ab = AC.ABILITIES[abId];
    if (!ab) return { ok: false, why: 'Unknown ability.' };
    if (!e.def.abilities || e.def.abilities.indexOf(abId) < 0) return { ok: false, why: 'Cannot do that.' };
    const p = g.players[e.owner];
    if (ab.requires && !(p && p.upgrades[ab.requires])) return { ok: false, why: 'Requires ' + AC.UPGRADES[ab.requires].name + '.' };
    if (e.mods && e.mods.stunned) return { ok: false, why: 'Stunned.' };
    if ((e.cds[abId] || 0) > g.time) return { ok: false, why: ab.name + ' is not ready.' };
    if (ab.shared && p && (p.sharedCd[abId] || 0) > g.time) return { ok: false, why: ab.name + ' is not ready.' };
    if (e.mana < ab.mana) return { ok: false, why: 'Not enough mana.' };
    if (ab.powerCost && p && p.res.p < ab.powerCost) return { ok: false, why: 'Not enough ' + p.F.power + '.' };
    if ((abId === 'trump_recall' || abId === 'ways_recall') && !g.hq(e.owner)) return { ok: false, why: 'You have no seat of power.' };
    return { ok: true };
  };

  A.validTarget = function (g, e, ab, t) {
    if (!t || t.dead || t.kind !== 'unit') return false;
    if (ab.id === 'possess') {
      if (!g.areEnemies(e.owner, t.owner) || t.def.hero || t.def.boss || (t.def.supply || 0) >= 4 || t.def.summon) return false;
      return g.visibleTo(e.owner, t);
    }
    if (!g.areEnemies(e.owner, t.owner)) return false;
    if (ab.id === 'heave' && (t.def.boss || t.def.air)) return false;
    return g.visibleTo(e.owner, t);
  };

  A.updateCast = function (g, e, o, dt) {
    const ab = AC.ABILITIES[o.ab];
    const chk = A.canCast(g, e, o.ab);
    if (!chk.ok) {
      if (!o.silent) g.emit({ type: 'error', player: e.owner, text: chk.why });
      B().nextOrder(g, e);
      return;
    }
    if (ab.target === 'none') { A.execute(g, e, ab, o); return; }
    // give up if the caster stops getting closer (target out of reach, e.g. deep in a forest)
    const stalled = (d) => {
      if (o.best == null || d < o.best - 6) { o.best = d; o.bestT = g.time; return false; }
      if (g.time - o.bestT < 4) return false;
      if (!o.silent) g.emit({ type: 'error', player: e.owner, text: 'Cannot reach the target.' });
      B().nextOrder(g, e);
      return true;
    };
    if (ab.target === 'point') {
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d <= ab.range) { A.execute(g, e, ab, o); return; }
      if (stalled(d)) return;
      B().moveToward(g, e, o.x, o.y, ab.range - 8, dt);
      return;
    }
    if (ab.target === 'unit') {
      const t = g.get(o.target);
      if (!A.validTarget(g, e, ab, t)) {
        if (!o.silent) g.emit({ type: 'error', player: e.owner, text: 'Invalid target.' });
        B().nextOrder(g, e);
        return;
      }
      const gap = B().gap(g, e, t);
      if (gap <= ab.range) { A.execute(g, e, ab, o); return; }
      if (stalled(gap)) return;
      if (e.path && Math.hypot(e.pathGoalX - t.x, e.pathGoalY - t.y) > 30) e.path = null;
      B().moveToward(g, e, t.x, t.y, 2, dt);
    }
  };

  function enemiesIn(g, e, x, y, r, opts) {
    const out = [];
    const list = g.hash.query(x, y, r + 20, []);
    for (const u of list) {
      if (u.dead || !g.areEnemies(e.owner, u.owner)) continue;
      if (Math.hypot(u.x - x, u.y - y) > r + u.radius * 0.5) continue;
      if (opts && opts.ground && u.def.air) continue;
      if (opts && opts.visible && !g.visibleTo(e.owner, u)) continue;
      out.push(u);
    }
    return out;
  }
  function alliesIn(g, e, x, y, r) {
    const out = [];
    const list = g.hash.query(x, y, r + 20, []);
    for (const u of list) {
      if (u.dead || !g.areAllies(u.owner, e.owner)) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      out.push(u);
    }
    return out;
  }
  A.enemiesIn = enemiesIn;
  A.alliesIn = alliesIn;
  function isChaosCreature(g, u) {
    if (u.def.faction === 'chaos') return true;
    const p = g.players[u.owner];
    return !!(p && p.faction === 'chaos' && !p.isNeutral);
  }

  function teleport(g, e, x, y, color) {
    const bits = g.moveBits(e);
    let tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (!e.def.air) {
      const np = g.pf.nearestPassable(tx, ty, bits, 6);
      if (!np) return false;
      if (np[0] !== tx || np[1] !== ty) { x = np[0] * T + T / 2; y = np[1] * T + T / 2; }
    }
    g.fx('trump', { x: e.x, y: e.y, color });
    e.x = e.prevX = x; e.y = e.prevY = y;
    e.path = null;
    g.fx('trump', { x, y, color });
    g.sfx('teleport', x, y);
    return true;
  }
  A.teleport = teleport;

  A.execute = function (g, e, ab, o) {
    const p = g.players[e.owner];
    if (ab.channel) {
      e.channel = { ab: ab.id, t: ab.channel, x: o.x, y: o.y, target: o.target };
      e.mana -= ab.mana;
      e.cds[ab.id] = g.time + ab.cd;
      g.fx('channel', { id: e.id, t: ab.channel, color: ab.color });
      g.sfx('channel', e.x, e.y);
      B().nextOrder(g, e);
      return;
    }
    e.mana -= ab.mana;
    e.cds[ab.id] = g.time + ab.cd;
    if (ab.shared && p) p.sharedCd[ab.id] = g.time + ab.cd;
    if (ab.powerCost && p) p.res.p -= ab.powerCost;
    e.atkAnim = 0.4;
    const t = o.target ? g.get(o.target) : null;
    if (t) e.angle = Math.atan2(t.y - e.y, t.x - e.x);
    else if (o.x != null) e.angle = Math.atan2(o.y - e.y, o.x - e.x);
    g.emit({ type: 'cast', player: e.owner, id: e.id, ab: ab.id, x: e.x, y: e.y });
    switch (ab.id) {
      case 'pattern_image': {
        const r = ab.radius / T;
        const cx = e.x / T, cy = e.y / T;
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let x = Math.floor(cx - r); x <= cx + r; x++)
            if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) g.map.setRoad(x, y, 0);
        for (const u of enemiesIn(g, e, e.x, e.y, ab.radius)) {
          if (!isChaosCreature(g, u)) continue;
          g.damage(e, u, ab.dmg, 'magic');
          A.addBuff(g, u, { id: 'slow', t: 4, amt: 0.4 });
        }
        g.fx('pattern', { x: e.x, y: e.y, r: ab.radius });
        g.sfx('pattern', e.x, e.y);
        break;
      }
      case 'ride_drum':
        A.addBuff(g, e, { id: 'drum', t: ab.dur });
        g.fx('ring', { x: e.x, y: e.y, r: 30, color: '#e0e4f0', t: 0.5 });
        g.sfx('gallop', e.x, e.y);
        break;
      case 'strategist':
      case 'rally_lorraine':
        for (const u of alliesIn(g, e, e.x, e.y, ab.radius)) A.addBuff(g, u, { id: 'haste', t: ab.dur, speed: 0.15, atk: 0.4 });
        g.fx('ring', { x: e.x, y: e.y, r: ab.radius, color: ab.color, t: 0.9 });
        g.sfx('horn', e.x, e.y);
        break;
      case 'war_drums':
        for (const u of alliesIn(g, e, e.x, e.y, ab.radius)) A.addBuff(g, u, { id: 'haste', t: ab.dur, speed: 0.25, atk: 0.25 });
        g.fx('ring', { x: e.x, y: e.y, r: ab.radius, color: ab.color, t: 0.9 });
        g.fx('drums', { x: e.x, y: e.y, t: 1.4 });
        g.sfx('drums', e.x, e.y);
        break;
      case 'whirlwind':
        for (const u of enemiesIn(g, e, e.x, e.y, ab.radius, { ground: true })) g.damage(e, u, ab.dmg * (e.lvlDmg || 1), 'hero');
        for (const b of g.bhash.query(e.x, e.y, ab.radius + 3 * T, [])) if (!b.dead && g.areEnemies(e.owner, b.owner) && g.edgeDist(b, e.x, e.y) < ab.radius) g.damage(e, b, ab.dmg * 0.5, 'hero');
        g.fx('whirl', { x: e.x, y: e.y, r: ab.radius });
        g.sfx('whirl', e.x, e.y);
        break;
      case 'heave': {
        if (!t) break;
        g.damage(e, t, ab.dmg, 'hero');
        if (!t.dead) {
          const a = Math.atan2(t.y - e.y, t.x - e.x);
          let k = 0;
          const bits = g.moveBits(t);
          for (let s = 8; s <= 3 * T; s += 8) {
            const nx = t.x + Math.cos(a) * s, ny = t.y + Math.sin(a) * s;
            if (!g.map.passableWorld(nx, ny, bits)) break;
            k = s;
          }
          g.fx('heave', { x0: t.x, y0: t.y, x1: t.x + Math.cos(a) * k, y1: t.y + Math.sin(a) * k, id: t.id });
          t.x += Math.cos(a) * k; t.y += Math.sin(a) * k;
          t.path = null;
          A.addBuff(g, t, { id: 'stun', t: t.def.hero ? 1.5 : 2 });
        }
        g.sfx('heave', e.x, e.y);
        break;
      }
      case 'hold_line':
        for (const u of enemiesIn(g, e, e.x, e.y, ab.radius)) if (!u.def.hero || true) A.addBuff(g, u, { id: 'taunt', t: 3, by: e.id });
        A.addBuff(g, e, { id: 'holdLine', t: ab.dur });
        g.fx('ring', { x: e.x, y: e.y, r: ab.radius, color: '#a0b0ff', t: 0.7 });
        g.sfx('shield', e.x, e.y);
        break;
      case 'hounds':
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const h = g.spawnUnit('hound_summon', e.owner, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, { summonT: ab.dur });
          h.order = { type: 'follow', target: e.id };
          g.fx('spawn', { x: h.x, y: h.y, color: '#ddd' });
        }
        g.sfx('horn', e.x, e.y);
        g.sfx('howl', e.x, e.y);
        break;
      case 'the_hunt':
        if (t) { A.addBuff(g, t, { id: 'hunted', t: ab.dur, src: e.owner }); g.fx('mark', { id: t.id, t: ab.dur }); }
        g.sfx('horn', e.x, e.y);
        break;
      case 'psychic_bind':
        if (t) {
          g.damage(e, t, ab.dmg, 'magic');
          if (!t.dead) A.addBuff(g, t, { id: 'stun', t: t.def.hero ? 3 : ab.dur });
          g.fx('bind', { id: t.id, x: t.x, y: t.y, from: { x: e.x, y: e.y }, t: t.def.hero ? 3 : ab.dur });
        }
        g.sfx('bind', e.x, e.y);
        break;
      case 'sorcery_fire':
        g.zones.push({ type: 'blast', x: o.x, y: o.y, r: ab.radius, t: 0.75, dmg: ab.dmg, owner: e.owner, src: e.id, color: '#ff8a30' });
        g.fx('target', { x: o.x, y: o.y, r: ab.radius, t: 0.75, color: '#ff8a30' });
        g.sfx('fireCast', e.x, e.y);
        break;
      case 'silver_arrow':
        if (t) {
          const pr = { kind: 'silver', owner: e.owner, src: e.id, target: t.id, dmg: ab.dmg, dmgType: 'pierce', heroMult: 1.5, x: e.x, y: e.y, speed: 900, splash: 0, big: true };
          pr.prevX = pr.x; pr.prevY = pr.y; pr.tx = t.x; pr.ty = t.y; pr.sx = pr.x; pr.sy = pr.y; pr.dist0 = 1;
          g.projectiles.push(pr);
        }
        g.sfx('silverArrow', e.x, e.y);
        break;
      case 'feigned_death':
        A.addBuff(g, e, { id: 'feign', t: ab.dur });
        g.fx('puff', { x: e.x, y: e.y, color: '#244' });
        g.sfx('vanish', e.x, e.y);
        // enemies lose their target
        for (const u of g.units) if (!u.dead && u.order && u.order.target === e.id && g.areEnemies(u.owner, e.owner)) AC.issue(g, u, null, false);
        break;
      case 'trump_summons': {
        const hq = g.hq(e.owner);
        if (!hq) break;
        let n = 0;
        const list = g.units.filter((u) => !u.dead && u.owner === e.owner && !u.def.hero && u.def.role !== 'worker' && !u.def.air && U.dist2(u.x, u.y, hq.x, hq.y) < (14 * T) ** 2);
        list.sort((a, b) => U.dist2(a.x, a.y, hq.x, hq.y) - U.dist2(b.x, b.y, hq.x, hq.y));
        for (const u of list) {
          if (n >= 10) break;
          const a = (n / 10) * Math.PI * 2;
          teleport(g, u, e.x + Math.cos(a) * 44, e.y + Math.sin(a) * 44, '#ffe08a');
          u.order = null; u.queue.length = 0;
          n++;
        }
        g.fx('trump', { x: e.x, y: e.y, color: '#ffe08a', big: true });
        if (!n) g.emit({ type: 'error', player: e.owner, text: 'No soldiers stand near your seat of power.' });
        break;
      }
      case 'jewel_storm':
        e.hp = Math.max(1, e.hp - e.hp * ab.hpCost);
        g.zones.push({ type: 'storm', x: o.x, y: o.y, r: ab.radius, t: ab.dur, dur: ab.dur, owner: e.owner, src: e.id, acc: 0, reveal: 5 });
        g.fx('storm', { x: o.x, y: o.y, r: ab.radius, t: ab.dur });
        g.fx('jewelGlow', { id: e.id, t: 1.5 });
        g.sfx('thunder', o.x, o.y);
        g.emit({ type: 'jewelUsed', player: e.owner });
        break;
      case 'chaos_shape':
        A.addBuff(g, e, { id: 'chaosShape', t: ab.dur });
        g.fx('shapeshift', { x: e.x, y: e.y, id: e.id });
        g.sfx('roar', e.x, e.y);
        break;
      case 'borel_lunge':
        if (t) {
          const a = Math.atan2(t.y - e.y, t.x - e.x);
          const dx = t.x - Math.cos(a) * (t.radius + e.radius + 4), dy = t.y - Math.sin(a) * (t.radius + e.radius + 4);
          if (g.map.passableWorld(dx, dy, g.moveBits(e))) {
            g.fx('dash', { x0: e.x, y0: e.y, x1: dx, y1: dy, color: '#ffa0d0' });
            e.x = dx; e.y = dy; e.path = null;
          }
          g.damage(e, t, ab.dmg * (e.lvlDmg || 1), 'hero');
          e.order = { type: 'attack', target: t.id };
          g.sfx('sword', e.x, e.y);
          return;
        }
        break;
      case 'living_trump':
        teleport(g, e, o.x, o.y, '#60ff90');
        break;
      case 'pyrokinesis':
        g.zones.push({ type: 'fire', x: o.x, y: o.y, r: ab.radius, t: ab.dur, dps: ab.dps, owner: e.owner, src: e.id, acc: 0 });
        g.fx('fireField', { x: o.x, y: o.y, r: ab.radius, t: ab.dur });
        g.sfx('fireCast', o.x, o.y);
        break;
      case 'riposte':
        A.addBuff(g, e, { id: 'riposte', t: ab.dur });
        g.fx('ring', { x: e.x, y: e.y, r: 26, color: '#ff6060', t: 0.5 });
        g.sfx('shield', e.x, e.y);
        break;
      case 'call_hendrake':
        for (let i = 0; i < 2; i++) {
          const a = (i / 2) * Math.PI * 2 + 0.5;
          const h = g.spawnUnit('hendrake_summon', e.owner, e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34, { summonT: ab.dur });
          h.order = { type: 'follow', target: e.id };
          g.fx('summon', { x: h.x, y: h.y, r: 16 });
        }
        g.sfx('summon', e.x, e.y);
        break;
      case 'spheres': {
        if (!t) break;
        let cur = t;
        const hit = new Set();
        let px = e.x, py = e.y;
        for (let i = 0; i < 4 && cur; i++) {
          hit.add(cur.id);
          g.fx('beam', { x0: px, y0: py, x1: cur.x, y1: cur.y, color: '#d0d0e0', t: 0.35, delay: i * 0.12, sphere: true });
          g.damage(e, cur, ab.dmg, 'magic');
          px = cur.x; py = cur.y;
          let nxt = null, nd = 1e9;
          for (const u of enemiesIn(g, e, px, py, 4 * T, { visible: true })) {
            if (hit.has(u.id) || u.dead) continue;
            const d = Math.hypot(u.x - px, u.y - py);
            if (d < nd) { nd = d; nxt = u; }
          }
          cur = nxt;
        }
        g.sfx('spheres', e.x, e.y);
        break;
      }
      case 'machinations':
        for (const u of enemiesIn(g, e, e.x, e.y, ab.radius)) A.addBuff(g, u, { id: 'weaken', t: ab.dur });
        g.fx('ring', { x: e.x, y: e.y, r: ab.radius, color: '#9090b0', t: 1.0 });
        g.sfx('whisper', e.x, e.y);
        break;
      case 'logrus_blink':
        if (teleport(g, e, o.x, o.y, '#c080ff')) e.nextHitBonus = 1.6;
        break;
      case 'fury':
        A.addBuff(g, e, { id: 'fury', t: ab.dur });
        g.fx('ring', { x: e.x, y: e.y, r: 28, color: '#ff3030', t: 0.6 });
        g.sfx('roar', e.x, e.y);
        break;
      case 'tendrils':
        for (const u of enemiesIn(g, e, o.x, o.y, ab.radius, { ground: true })) {
          g.damage(e, u, ab.dmg, 'magic');
          A.addBuff(g, u, { id: 'root', t: ab.dur });
        }
        g.fx('tendrils', { x: o.x, y: o.y, r: ab.radius, t: ab.dur });
        g.sfx('tendrils', o.x, o.y);
        break;
      case 'logrus_mend':
        for (const u of alliesIn(g, e, e.x, e.y, ab.radius)) {
          u.hp = Math.min(u.maxHp, u.hp + ab.heal);
          g.fx('heal', { x: u.x, y: u.y, color: '#b0ffb0' });
        }
        g.fx('ring', { x: e.x, y: e.y, r: ab.radius, color: '#a0ffa0', t: 0.8 });
        g.sfx('heal', e.x, e.y);
        break;
      case 'chaos_wave':
        g.zones.push({ type: 'wave', x: o.x, y: o.y, r: ab.radius, t: ab.dur, dur: ab.dur, owner: e.owner, src: e.id, acc: 0, reveal: 5 });
        g.fx('wave', { x: o.x, y: o.y, r: ab.radius, t: ab.dur });
        g.sfx('chaosWave', o.x, o.y);
        g.emit({ type: 'waveUsed', player: e.owner });
        break;
      case 'possess': {
        if (!t) break;
        const old = t.owner;
        AC.issue(g, t, null, false); // refunds its paid builds and frees its diamond, for the old owner
        t.owner = e.owner;
        t.buffs.length = 0;
        if (t.def.role === 'worker') t.carry = 0;
        g.fx('possess', { x0: e.x, y0: e.y, x1: t.x, y1: t.y });
        g.sfx('possess', t.x, t.y);
        e.dead = true; // consumed
        g.emit({ type: 'possessed', player: e.owner, from: old, id: t.id });
        g.recomputeSupplySoon = true;
        return;
      }
    }
    if (e.order && e.order.type === 'cast') B().nextOrder(g, e);
  };

  A.finishChannel = function (g, e, c) {
    if (c.ab === 'trump_recall' || c.ab === 'ways_recall') {
      const hq = g.hq(e.owner);
      if (!hq) return;
      const a = Math.random() * Math.PI * 2;
      teleport(g, e, hq.x + Math.cos(a) * (hq.radius + 24), hq.y + Math.sin(a) * (hq.radius + 24), c.ab === 'trump_recall' ? '#ffe08a' : '#c080ff');
      e.order = null; e.queue.length = 0;
    }
  };

  // ------------------------------------------------------------------ zones
  A.updateZones = function (g, dt) {
    const keep = [];
    for (const z of g.zones) {
      z.t -= dt;
      if (z.vx || z.vy) {
        z.x += (z.vx || 0) * dt; z.y += (z.vy || 0) * dt;
        z.fxT = (z.fxT || 0) - dt;
        if (z.fxT <= 0) { z.fxT = 0.45; g.fx('wave', { x: z.x, y: z.y, r: z.r, t: 1.3 }); if (Math.random() < 0.3) g.sfx('chaosWave', z.x, z.y); }
        if (z.x < -300 || z.x > g.worldW + 300 || z.y < -300 || z.y > g.worldH + 300) z.t = 0;
      }
      const src = g.get(z.src) || { owner: z.owner, kind: 'zone' };
      switch (z.type) {
        case 'blast':
          if (z.t <= 0) {
            for (const u of enemiesIn(g, src, z.x, z.y, z.r)) g.damage(src, u, z.dmg, 'magic');
            for (const b of g.bhash.query(z.x, z.y, z.r + 3 * T, [])) if (!b.dead && g.areEnemies(z.owner, b.owner) && g.edgeDist(b, z.x, z.y) < z.r) g.damage(src, b, z.dmg * 0.5, 'magic');
            g.fx('explosion', { x: z.x, y: z.y, r: z.r, kind: 'fire' });
            g.sfx('boom', z.x, z.y);
          }
          break;
        case 'storm': {
          z.acc += dt;
          while (z.acc >= 0.32) {
            z.acc -= 0.32;
            const list = enemiesIn(g, src, z.x, z.y, z.r);
            const bl = g.bhash.query(z.x, z.y, z.r + 3 * T, []).filter((b) => !b.dead && g.areEnemies(z.owner, b.owner) && g.edgeDist(b, z.x, z.y) < z.r);
            let tgt = null;
            if (list.length) tgt = list[Math.floor(Math.random() * list.length)];
            else if (bl.length) tgt = bl[Math.floor(Math.random() * bl.length)];
            if (tgt) {
              g.damage(src, tgt, 58, 'magic');
              g.fx('lightning', { x: tgt.x, y: tgt.y });
            } else {
              const a = Math.random() * Math.PI * 2, d = Math.random() * z.r;
              g.fx('lightning', { x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d });
            }
            if (Math.random() < 0.5) g.sfx('thunder', z.x, z.y);
            else g.sfx('zap', z.x, z.y);
          }
          for (const u of enemiesIn(g, src, z.x, z.y, z.r)) A.addBuff(g, u, { id: 'slow', t: 0.4, amt: 0.25 });
          break;
        }
        case 'fire':
          z.acc += dt;
          while (z.acc >= 0.25) {
            z.acc -= 0.25;
            for (const u of enemiesIn(g, src, z.x, z.y, z.r, { ground: true })) g.damage(src, u, z.dps * 0.25, 'magic', { silent: true });
            for (const b of g.bhash.query(z.x, z.y, z.r + 3 * T, [])) if (!b.dead && g.areEnemies(z.owner, b.owner) && g.edgeDist(b, z.x, z.y) < z.r) g.damage(src, b, z.dps * 0.12, 'magic');
          }
          break;
        case 'wave': {
          z.acc += dt;
          while (z.acc >= 0.25) {
            z.acc -= 0.25;
            for (const u of enemiesIn(g, src, z.x, z.y, z.r)) if (!isChaosCreature(g, u)) g.damage(src, u, 40 * 0.25, 'magic', { silent: true });
            for (const b of g.bhash.query(z.x, z.y, z.r + 3 * T, [])) if (!b.dead && g.areEnemies(z.owner, b.owner) && g.edgeDist(b, z.x, z.y) < z.r) g.damage(src, b, 22 * 0.25, 'magic');
            // lay the road
            for (let k = 0; k < 6; k++) {
              const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r;
              g.map.setRoad(Math.floor((z.x + Math.cos(a) * d) / T), Math.floor((z.y + Math.sin(a) * d) / T), 1);
            }
          }
          break;
        }
      }
      if (z.t > 0) keep.push(z);
    }
    g.zones = keep;
  };

  // ------------------------------------------------------------------ global powers
  A.canPower = function (g, pid, powerId) {
    const pw = AC.POWERS[powerId];
    const p = g.players[pid];
    if (!pw || !p) return { ok: false, why: 'Unknown power.' };
    if ((p.powerCd[powerId] || 0) > g.time) return { ok: false, why: pw.name + ' is not ready.' };
    if (!g.canAfford(p, pw.cost)) return { ok: false, why: 'Not enough ' + p.F.power + '.' };
    return { ok: true };
  };
  A.usePower = function (g, pid, powerId, fromB) {
    const chk = A.canPower(g, pid, powerId);
    if (!chk.ok) { g.emit({ type: 'error', player: pid, text: chk.why }); return false; }
    const pw = AC.POWERS[powerId];
    const p = g.players[pid];
    g.pay(p, pw.cost);
    p.powerCd[powerId] = g.time + pw.cd;
    if (powerId === 'unicorn_blessing') {
      for (const u of g.units) {
        if (u.dead || u.owner !== pid) continue;
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4);
        u.buffs = u.buffs.filter((b) => !DEBUFFS[b.id]);
        g.fx('heal', { x: u.x, y: u.y, color: '#ffffff' });
      }
      if (fromB) g.fx('unicorn', { x: fromB.x, y: fromB.y - 30 });
      g.sfx('unicorn', fromB ? fromB.x : 0, fromB ? fromB.y : 0);
    } else if (powerId === 'logrus_surge') {
      for (const u of g.units) {
        if (u.dead || u.owner !== pid) continue;
        A.addBuff(g, u, { id: 'surge', t: 15 });
      }
      if (fromB) g.fx('serpent', { x: fromB.x, y: fromB.y - 30 });
      g.sfx('chaosWave', fromB ? fromB.x : 0, fromB ? fromB.y : 0);
    }
    g.emit({ type: 'power', player: pid, power: powerId });
    return true;
  };
})();
