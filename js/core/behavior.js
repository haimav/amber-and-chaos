// Amber and Chaos — unit & building behaviour, movement, combat, projectiles.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;
  const B = (AC.Behavior = {});

  const PROJ_SPEED = {
    arrow: 560, bolt: 600, bullet: 1500, magic: 430, water: 380, feather: 470, javelin: 500, wisp: 390, fire: 430,
    silver: 760, sphere: 420, tendril: 420, shell: 330, glob: 300, prism: 520,
  };
  const ARCED = { shell: true, glob: true };

  // ------------------------------------------------------------------ helpers
  B.isMelee = (d) => !d.projectile;
  B.range = (e) => (e.def.range || 20) + (e.mods ? e.mods.range : 0);
  B.gap = function (g, e, t) {
    if (t.kind === 'building') return g.edgeDist(t, e.x, e.y) - e.radius;
    return Math.hypot(t.x - e.x, t.y - e.y) - e.radius - t.radius;
  };
  B.canTarget = function (g, e, t) {
    if (!t || t.dead) return false;
    if (t.kind !== 'unit' && t.kind !== 'building') return false;
    if (!g.areEnemies(e.owner, t.owner)) return false;
    if (!e.def.dmg && !(e.def.attack)) return false;
    if (t.def.invulnerable) return false;
    if (t.def.air && !e.def.canHitAir) return false;
    if (!g.visibleTo(e.owner, t)) return false;
    return true;
  };

  // Find best target within radius r of e
  B.findTarget = function (g, e, r, opts) {
    const list = g.hash.query(e.x, e.y, r, B._q1 || (B._q1 = []));
    const neutralSeeker = !!(g.players[e.owner] && g.players[e.owner].isNeutral);
    let best = null, bs = 1e18;
    const rr = r * r;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t === e || t.dead || !g.areEnemies(e.owner, t.owner)) continue;
      if (e.unreach && e.unreach[t.id] > g.time && B.gap(g, e, t) > B.range(e)) continue;
      // leave peaceful wild creatures alone unless they are fighting us (or we hunt them)
      if (!neutralSeeker && g.players[t.owner].isNeutral && !(opts && opts.creeps) && !(t.order && t.order.type === 'attack')) continue;
      const d2 = U.dist2(t.x, t.y, e.x, e.y);
      if (d2 > rr) continue;
      if (!B.canTarget(g, e, t)) continue;
      let s = Math.sqrt(d2);
      if (t.def.role === 'worker') s += 70;
      if (!t.def.dmg) s += 60;
      if (t.lastAttacker === e.id) s -= 30;
      if (t.def.hero) s -= 10;
      if (s < bs) { bs = s; best = t; }
    }
    if (!(opts && opts.unitsOnly)) {
      const bl = g.bhash.query(e.x, e.y, r + 3 * T, B._q2 || (B._q2 = []));
      for (let i = 0; i < bl.length; i++) {
        const t = bl[i];
        if (t.dead || !g.areEnemies(e.owner, t.owner)) continue;
        if (e.unreach && e.unreach[t.id] > g.time && B.gap(g, e, t) > B.range(e)) continue;
        const d = g.edgeDist(t, e.x, e.y);
        if (d > r) continue;
        if (!B.canTarget(g, e, t)) continue;
        const s = d + (t.def.attack ? 90 : 170);
        if (s < bs) { bs = s; best = t; }
      }
    }
    return best;
  };

  // ------------------------------------------------------------------ movement
  function requestPath(g, e, gx, gy) {
    e.pathGoalX = gx; e.pathGoalY = gy;
    if (e.def.air) { e.path = [[gx, gy]]; e.pathI = 0; return; }
    const bits = g.moveBits(e);
    // a clear straight line needs no search (most combat chases)
    const d = Math.hypot(gx - e.x, gy - e.y);
    if (d < 14 * T && g.map.passableWorld(gx, gy, bits) && g.pf.los(e.x, e.y, gx, gy, bits, e.radius)) {
      e.path = [[gx, gy]]; e.pathI = 0; e.pathWait = false;
      return;
    }
    if (g.pathBudget <= 0) { e.path = null; e.pathWait = true; return; }
    e.pathWait = false;
    const p = g.pf.find(e.x, e.y, gx, gy, bits, { radius: e.radius, maxNodes: Math.min(9000, Math.max(1500, g.pathBudget)) });
    g.pathBudget -= g.pf.lastExpanded || 1;
    e.path = p; e.pathI = 0;
  }
  B.requestPath = requestPath;

  // returns true when within `arrive` of (gx,gy)
  function moveToward(g, e, gx, gy, arrive, dt) {
    const d = Math.hypot(gx - e.x, gy - e.y);
    if (d <= arrive) { e.moving = false; return true; }
    if (e.mods.rooted) { e.moving = false; return false; }
    if (!e.path || e.pathWait || Math.abs(e.pathGoalX - gx) > 24 || Math.abs(e.pathGoalY - gy) > 24) requestPath(g, e, gx, gy);
    let wx = gx, wy = gy;
    if (e.path && e.path.length) {
      while (e.pathI < e.path.length) {
        const w = e.path[e.pathI];
        const last = e.pathI === e.path.length - 1;
        const dd = Math.hypot(w[0] - e.x, w[1] - e.y);
        if (!last && dd < 16) { e.pathI++; continue; }
        if (last && dd < Math.max(4, arrive * 0.5)) {
          // reached end of (possibly partial) path
          e.pathI++;
          break;
        }
        wx = w[0]; wy = w[1];
        break;
      }
      if (e.pathI >= e.path.length) {
        // path exhausted but not arrived: blocked goal
        e.moving = false;
        e.blockedT = (e.blockedT || 0) + dt;
        if (e.blockedT > 0.6) { e.blockedT = 0; e.path = null; e.repaths++; }
        return e.repaths > 3 || d < arrive + 40;
      }
    }
    const sp = e.def.speed * e.mods.speed;
    let ang = Math.atan2(wy - e.y, wx - e.x);
    const tr = (e.def.turnRate || 12) * dt;
    e.angle = U.turnToward(e.angle, ang, tr);
    if (e.def.turnRate && Math.abs(U.angleDiff(e.angle, ang)) > 0.6) { e.moving = false; return false; }
    const step = Math.min(sp * dt, Math.hypot(wx - e.x, wy - e.y));
    e.x += Math.cos(ang) * step;
    e.y += Math.sin(ang) * step;
    e.moving = true;
    e.moveDist = (e.moveDist || 0) + step;
    e.anim += step / 18;
    if (e.def.charge && e.moveDist > 3 * T) e.chargeReady = true;
    // stuck detection
    e.stuckClock = (e.stuckClock || 0) + dt;
    if (e.stuckClock > 0.7) {
      const moved = Math.hypot(e.x - (e.stuckX || 0), e.y - (e.stuckY || 0));
      e.stuckX = e.x; e.stuckY = e.y; e.stuckClock = 0;
      if (moved < sp * 0.7 * 0.25) {
        e.stuckN = (e.stuckN || 0) + 1;
        if (d < 2.5 * T + arrive && e.stuckN >= 2) { e.stuckN = 0; e.moving = false; return true; } // crowded at goal
        if (e.stuckN >= 2) { e.path = null; e.repaths++; e.stuckN = 0; }
      } else e.stuckN = 0;
    }
    return false;
  }
  B.moveToward = moveToward;

  // Point just outside a building nearest to (x,y)
  function approachPoint(b, x, y, pad) {
    const x0 = b.tx * T, y0 = b.ty * T, x1 = (b.tx + b.size) * T, y1 = (b.ty + b.size) * T;
    let px = U.clamp(x, x0, x1), py = U.clamp(y, y0, y1);
    let nx = x - px, ny = y - py;
    let d = Math.hypot(nx, ny);
    if (d < 0.001) {
      // inside: push to nearest edge
      const dl = x - x0, dr = x1 - x, dt = y - y0, db = y1 - y;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) { px = x0; nx = -1; ny = 0; } else if (m === dr) { px = x1; nx = 1; ny = 0; } else if (m === dt) { py = y0; nx = 0; ny = -1; } else { py = y1; nx = 0; ny = 1; }
      d = 1;
    }
    return [px + (nx / d) * pad, py + (ny / d) * pad];
  }
  B.approachPoint = approachPoint;

  function stopMoving(e) { e.moving = false; e.path = null; e.repaths = 0; e.blockedT = 0; }

  function nextOrder(g, e) {
    if (e.order && e.order.type === 'gather') g.releaseMiner(e);
    e.order = e.queue.length ? e.queue.shift() : null;
    stopMoving(e);
    e.subTarget = 0;
    if (e.order) e.order.started = false;
  }
  B.nextOrder = nextOrder;

  // Orders that never finish on their own (gathering, patrol, hold, follow) give way to real
  // orders queued behind them, and are taken up again once those are done. Of several endless
  // orders, the one the player queued last wins; returns to an interrupted order (flagged
  // resumed) are older than anything queued since.
  const ENDLESS = { gather: 1, patrol: 1, hold: 1, follow: 1 };
  B.resumeOf = (o) => (o.type === 'gather' ? { type: 'gather', target: o.target, resumed: true } : Object.assign(o, { resumed: true }));
  function yieldEndless(g, e) {
    const o = e.order;
    if (!o || !ENDLESS[o.type]) return;
    const q = e.queue;
    if (!q.some((x) => !ENDLESS[x.type])) {
      // nothing real queued: switch to the newest endless order the player queued, if any
      let k = q.length - 1;
      while (k >= 0 && q[k].resumed) k--;
      const newest = k >= 0 ? q[k] : null;
      q.length = 0;
      if (newest) { q.push(newest); nextOrder(g, e); }
      return;
    }
    // real work behind: do it first, then come back here unless a later endless order supersedes this one
    const last = q[q.length - 1];
    if (!ENDLESS[last.type] || last.resumed) {
      if (!o.resumed) while (q.length && q[q.length - 1].resumed) q.pop();
      if (!q.length || !ENDLESS[q[q.length - 1].type]) q.push(B.resumeOf(o));
    }
    nextOrder(g, e);
  }

  // ------------------------------------------------------------------ combat
  function doAttack(g, e, t) {
    const def = e.def;
    e.lastAtkT = g.time;
    e.atkAnim = 0.3;
    let dmg = def.dmg * e.mods.dmg * (e.lvlDmg || 1);
    if (def.vsChaos && (t.def.hero || t.def.faction === 'chaos')) dmg *= def.vsChaos;
    if (def.bonusVsBuildings && t.kind === 'building') dmg *= def.bonusVsBuildings;
    if (def.charge && e.chargeReady) {
      dmg *= 2; e.chargeReady = false;
      g.fx('spark', { x: t.x, y: t.y, color: '#fff2a0', big: true });
    }
    if (e.nextHitBonus) { dmg *= e.nextHitBonus; e.nextHitBonus = 0; }
    // leaving hiding
    for (let i = e.buffs.length - 1; i >= 0; i--) if (e.buffs[i].id === 'feign') { e.buffs.splice(i, 1); dmg *= 2; }
    e.moveDist = 0;
    if (def.projectile) {
      const kind = def.projectile;
      const pr = {
        kind, owner: e.owner, src: e.id, target: t.id, dmg, dmgType: def.dmgType,
        x: e.x + Math.cos(e.angle) * e.radius, y: e.y + Math.sin(e.angle) * e.radius,
        speed: PROJ_SPEED[kind] || 450, splash: def.splash || 0, arc: !!ARCED[kind], air: !!def.air,
        canHitAir: !!def.canHitAir, poison: def.poison,
      };
      pr.prevX = pr.x; pr.prevY = pr.y;
      pr.tx = t.x; pr.ty = t.y;
      pr.sx = pr.x; pr.sy = pr.y;
      pr.dist0 = Math.hypot(pr.tx - pr.x, pr.ty - pr.y) || 1;
      if (pr.arc) pr.ground = true;
      g.projectiles.push(pr);
      g.sfx(kind === 'bullet' ? 'rifle' : kind === 'shell' ? 'cannon' : kind === 'glob' ? 'spit' : kind === 'arrow' || kind === 'silver' ? 'arrow' : kind === 'bolt' ? 'crossbow' : kind === 'javelin' || kind === 'feather' ? 'arrow' : 'magicShot', e.x, e.y);
      if (kind === 'bullet') g.fx('muzzle', { x: pr.x, y: pr.y, angle: e.angle });
    } else {
      g.damage(e, t, dmg, def.dmgType, { melee: true });
      if (def.poison && !t.dead && t.kind === 'unit') AC.Abilities.addBuff(g, t, { id: 'poison', t: def.poison.dur, dps: def.poison.dps, src: e.owner });
      const beast = def.art === 'hellhound' || def.art === 'wolf' || def.art === 'manticore' || def.art === 'sphinx' || def.art === 'demon';
      g.sfx(t.kind === 'building' ? 'hitBuilding' : beast ? 'claw' : 'sword', t.x, t.y);
      g.fx('spark', { x: (t.x + e.x) / 2 + (Math.random() - 0.5) * 6, y: (t.y + e.y) / 2 - 6, color: t.kind === 'building' ? '#d8c8a0' : '#ffe6c0' });
    }
  }
  B.doAttack = doAttack;

  // Engage target t: approach and strike. returns false if target invalid
  function engage(g, e, t, dt, noChase) {
    if (!B.canTarget(g, e, t)) return false;
    const gap = B.gap(g, e, t);
    const rng = B.range(e);
    if (e.def.minRange && gap < e.def.minRange) {
      if (noChase) return false;
      // back off
      const a = Math.atan2(e.y - t.y, e.x - t.x);
      moveToward(g, e, e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, 4, dt);
      return true;
    }
    if (gap > rng) {
      if (noChase) return false;
      let gx = t.x, gy = t.y;
      if (t.kind === 'building') [gx, gy] = approachPoint(t, e.x, e.y, e.radius + 2);
      // keep repathing as target moves
      if (e.path && Math.hypot(e.pathGoalX - gx, e.pathGoalY - gy) > 30) e.path = null;
      moveToward(g, e, gx, gy, 2, dt);
      return true;
    }
    // in range
    e.moving = false;
    e.path = null;
    const ang = Math.atan2(t.y - e.y, t.x - e.x);
    e.angle = U.turnToward(e.angle, ang, (e.def.turnRate || 14) * dt);
    if (e.atkCd <= 0 && Math.abs(U.angleDiff(e.angle, ang)) < 0.5) {
      doAttack(g, e, t);
      e.atkCd = e.def.cd / e.mods.atkSpeed;
    }
    return true;
  }
  B.engage = engage;

  // A chase that has not closed in for 4 seconds is given up, and the target ignored for a
  // while unless it comes within reach. Orders the unit picked for itself give up on anything
  // (a faster foe, a press of bodies); a direct order only on a target standing where the unit
  // cannot go (a ranger deep in a forest, a sniper on a cliff).
  function chaseStalled(g, e, t, strict) {
    const gap = B.gap(g, e, t);
    const c = e.chase || (e.chase = { id: 0, best: 0, t: 0, seen: 0 });
    const fresh = g.time - c.seen > 0.5; // a record left from an earlier, broken-off chase
    c.seen = g.time;
    if (c.id !== t.id || fresh || gap <= B.range(e) || gap < c.best - 6) { c.id = t.id; c.best = gap; c.t = g.time; return false; }
    if (g.time - c.t < 4) return false;
    if (strict && (t.kind !== 'unit' || t.def.air || e.def.air || g.map.passableWorld(t.x, t.y, g.moveBits(e)))) return false;
    c.id = 0;
    // remember every foe given up on, and extend the ones still ignored, so a unit among several
    // unreachable foes gives up on all of them and carries on with its order
    const u = e.unreach || (e.unreach = {});
    const until = g.time + 10;
    for (const k in u) { if (u[k] <= g.time) delete u[k]; else u[k] = until; }
    u[t.id] = until;
    return true;
  }
  B.chaseStalled = chaseStalled;

  // ------------------------------------------------------------------ unit update
  B.updateUnit = function (g, e, dt) {
    const def = e.def;
    if (e.summonT) {
      e.summonT -= dt;
      if (e.summonT <= 0) { g.fx('puff', { x: e.x, y: e.y, color: '#aaa' }); e.dead = true; g.recomputeSupplySoon = true; return; }
    }
    const regen = (def.regen || (def.hero ? 0.7 : 0.15)) + e.mods.regen;
    if (e.hp < e.maxHp && regen > 0) e.hp = Math.min(e.maxHp, e.hp + regen * dt);
    if (e.maxMana) e.mana = Math.min(e.maxMana, e.mana + (def.manaRegen || 0.6) * e.mods.manaRegen * dt);
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.atkAnim > 0) e.atkAnim -= dt;
    if (e.mods.stunned) { e.moving = false; return; }
    if (e.channel) {
      e.moving = false;
      e.channel.t -= dt;
      if (e.channel.t <= 0) { const c = e.channel; e.channel = null; AC.Abilities.finishChannel(g, e, c); }
      return;
    }
    if (def.autoHeal) autoHeal(g, e, dt);
    const owner = g.players[e.owner];
    if (owner && owner.isNeutral) return creep(g, e, dt);

    if (e.queue.length) yieldEndless(g, e);
    const o = e.order;
    if (!o) return idle(g, e, dt);
    switch (o.type) {
      case 'move': {
        if (moveToward(g, e, o.x, o.y, o.arrive || 6, dt)) nextOrder(g, e);
        break;
      }
      case 'attackMove':
      case 'patrol': {
        // look for targets en route
        let t = e.subTarget ? g.get(e.subTarget) : null;
        if (t && (!B.canTarget(g, e, t) || Math.hypot(t.x - e.x, t.y - e.y) > def.sight * T * 1.2)) { t = null; e.subTarget = 0; e.path = null; }
        e.scanT = (e.scanT || 0) - dt;
        if (e.scanT <= 0 && def.dmg) {
          e.scanT = 0.25 + Math.random() * 0.1;
          const nt = B.findTarget(g, e, def.sight * T * 0.9, o.creeps ? { creeps: true } : null);
          if (nt && (!t || B.gap(g, e, nt) + 40 < B.gap(g, e, t))) { t = nt; e.subTarget = nt.id; e.path = null; }
        }
        if (t) { if (!engage(g, e, t, dt) || chaseStalled(g, e, t, false)) { e.subTarget = 0; e.path = null; } break; }
        if (moveToward(g, e, o.x, o.y, o.arrive || 8, dt)) {
          if (o.type === 'patrol') {
            const ax = o.ax, ay = o.ay;
            o.ax = o.x; o.ay = o.y; o.x = ax; o.y = ay;
            e.path = null;
          } else nextOrder(g, e);
        }
        break;
      }
      case 'attack': {
        const t = g.get(o.target);
        if (!t || t.dead) { nextOrder(g, e); break; }
        if (o.auto) {
          if (Math.hypot(e.x - o.homeX, e.y - o.homeY) > 10 * T || !B.canTarget(g, e, t)) {
            e.order = { type: 'move', x: o.homeX, y: o.homeY, arrive: 20, auto: true };
            stopMoving(e);
            break;
          }
        }
        if (!B.canTarget(g, e, t)) {
          // lost sight: go to last known position
          if (!o.lostT) { o.lostT = g.time; o.lx = t.x; o.ly = t.y; }
          if (g.areEnemies(e.owner, t.owner) && g.time - o.lostT < 6 && !(t.def.air && !def.canHitAir)) {
            if (moveToward(g, e, o.lx, o.ly, 12, dt)) nextOrder(g, e);
          } else nextOrder(g, e);
          break;
        }
        o.lostT = 0;
        engage(g, e, t, dt);
        if (chaseStalled(g, e, t, !o.auto)) {
          if (o.auto) { e.order = { type: 'move', x: o.homeX, y: o.homeY, arrive: 20, auto: true }; stopMoving(e); } else nextOrder(g, e);
        }
        break;
      }
      case 'hold': {
        e.moving = false;
        e.scanT = (e.scanT || 0) - dt;
        let t = e.subTarget ? g.get(e.subTarget) : null;
        if (t && (!B.canTarget(g, e, t) || B.gap(g, e, t) > B.range(e))) t = null;
        if (!t && e.scanT <= 0 && def.dmg) {
          e.scanT = 0.25;
          const nt = B.findTarget(g, e, B.range(e) + e.radius + 40);
          if (nt && B.gap(g, e, nt) <= B.range(e)) t = nt;
          e.subTarget = t ? t.id : 0;
        }
        if (t) engage(g, e, t, dt, true);
        break;
      }
      case 'follow': {
        const t = g.get(o.target);
        if (!t || t.dead) { nextOrder(g, e); break; }
        // fighters that follow (summoned hounds, Hendrake warriors, escorts) fight near their leader
        if (def.dmg && def.role !== 'worker') {
          let st = e.subTarget ? g.get(e.subTarget) : null;
          if (st && (!B.canTarget(g, e, st) || Math.hypot(st.x - t.x, st.y - t.y) > 8 * T)) { st = null; e.subTarget = 0; e.path = null; }
          e.scanT = (e.scanT || 0) - dt;
          if (!st && e.scanT <= 0) {
            e.scanT = 0.3 + Math.random() * 0.1;
            const nt = B.findTarget(g, e, def.sight * T * 0.8);
            if (nt && Math.hypot(nt.x - t.x, nt.y - t.y) <= 8 * T) { st = nt; e.subTarget = nt.id; e.path = null; }
          }
          if (st) { engage(g, e, st, dt); break; }
        }
        if (Math.hypot(t.x - e.x, t.y - e.y) > 2 * T + t.radius) {
          if (e.path && Math.hypot(e.pathGoalX - t.x, e.pathGoalY - t.y) > 48) e.path = null;
          moveToward(g, e, t.x, t.y, t.radius + e.radius + 20, dt);
        } else e.moving = false;
        break;
      }
      case 'gather': gather(g, e, o, dt); break;
      case 'returnCargo': returnCargo(g, e, o, dt); break;
      case 'build': build(g, e, o, dt); break;
      case 'repair': repair(g, e, o, dt); break;
      case 'cast': AC.Abilities.updateCast(g, e, o, dt); break;
      default: nextOrder(g, e);
    }
  };

  function idle(g, e, dt) {
    e.moving = false;
    e.path = null;
    if (e.def.role === 'worker' || !e.def.dmg) return;
    e.scanT = (e.scanT || 0) - dt;
    if (e.scanT > 0) return;
    e.scanT = 0.3 + Math.random() * 0.15;
    let t = B.findTarget(g, e, e.def.sight * T * 0.8);
    if (!t && e.lastAttacker && g.time - e.lastHitT < 2) {
      const a = g.get(e.lastAttacker);
      if (a && B.canTarget(g, e, a)) t = a;
    }
    if (t) e.order = { type: 'attack', target: t.id, auto: true, homeX: e.x, homeY: e.y };
  }

  function creep(g, e, dt) {
    const o = e.order;
    const hx = e.homeX, hy = e.homeY;
    if (o && o.type === 'attack') {
      const t = g.get(o.target);
      if (!t || t.dead || Math.hypot(e.x - hx, e.y - hy) > 8 * T || !B.canTarget(g, e, t)) {
        e.order = { type: 'move', x: hx, y: hy };
        stopMoving(e);
        return;
      }
      engage(g, e, t, dt);
      return;
    }
    if (o && o.type === 'move') {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.08 * dt);
      if (moveToward(g, e, o.x, o.y, 10, dt)) { e.order = null; stopMoving(e); }
      return;
    }
    e.moving = false;
    e.scanT = (e.scanT || 0) - dt;
    if (e.scanT > 0) return;
    e.scanT = 0.4 + Math.random() * 0.2;
    if (e.hp < e.maxHp && g.time - e.lastHitT > 6) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05);
    let t = B.findTarget(g, e, (e.def.boss ? 4 : 4.5) * T, { unitsOnly: true });
    if (!t && e.lastAttacker && g.time - e.lastHitT < 3) {
      const a = g.get(e.lastAttacker);
      if (a && !a.dead && Math.hypot(a.x - hx, a.y - hy) < 10 * T) t = a;
    }
    if (t) {
      e.order = { type: 'attack', target: t.id };
      // pack aggro: alert nearby creeps
      const near = g.hash.query(e.x, e.y, 5 * T, []);
      for (const n of near) if (n !== e && !n.dead && n.owner === e.owner && !n.order) n.order = { type: 'attack', target: t.id };
    }
  }

  function autoHeal(g, e, dt) {
    const h = e.def.autoHeal;
    e.healCd = (e.healCd || 0) - dt;
    if (e.healCd > 0 || e.mana < h.cost) return;
    const list = g.hash.query(e.x, e.y, h.range, []);
    let best = null, bv = 0;
    for (const u of list) {
      if (u.dead || !g.areAllies(u.owner, e.owner) || u.def.kind !== 'unit') continue;
      const miss = u.maxHp - u.hp;
      if (miss < h.amount * 0.6) continue;
      if (Math.hypot(u.x - e.x, u.y - e.y) > h.range) continue;
      const v = miss / u.maxHp + (u.def.hero ? 0.2 : 0);
      if (v > bv) { bv = v; best = u; }
    }
    if (best) {
      best.hp = Math.min(best.maxHp, best.hp + h.amount);
      e.mana -= h.cost;
      e.healCd = h.cd;
      g.fx('heal', { x: best.x, y: best.y, from: { x: e.x, y: e.y }, color: '#7ff0e0' });
      g.sfx('heal', best.x, best.y);
    }
  }

  // ------------------------------------------------------------------ economy
  B.findResource = function (g, e, x, y, maxD, avoidBusy, exclude) {
    let best = null, bs = 1e18;
    const own = e.order && e.order.type === 'gather' ? e.order.target : 0;
    for (const r of g.resources) {
      if (r.dead || r.amount <= 0 || (exclude && exclude[r.id] > g.time)) continue;
      const d = Math.hypot(r.x - x, r.y - y);
      if (d > maxD) continue;
      let s = d;
      if (avoidBusy) {
        const c = (r.claims || 0) - (r.id === own ? 1 : 0);
        s += Math.max(0, c) * 44;
        if (r.miner && r.miner !== e.id) s += 24;
      }
      if (s < bs) { bs = s; best = r; }
    }
    return best;
  };

  function gather(g, e, o, dt) {
    const p = g.players[e.owner];
    let r = g.get(o.target);
    if (!r || r.dead || r.amount <= 0) {
      if (r && r.miner === e.id) r.miner = 0;
      r = B.findResource(g, e, o.lx || e.x, o.ly || e.y, 12 * T, true, o.avoid);
      if (!r) {
        if (e.carry > 0) { e.order = { type: 'returnCargo', resume: 0 }; stopMoving(e); }
        else nextOrder(g, e);
        return;
      }
      o.target = r.id; o.stage = 'go'; o.side = 0;
    }
    o.lx = r.x; o.ly = r.y;
    if (!o.stage) o.stage = e.carry >= e.def.carry ? 'ret' : 'go';
    if (o.stage === 'go') {
      if (e.carry >= e.def.carry) { o.stage = 'ret'; return; }
      // approach from the side of the dropoff; if that side is walled off, try the others in turn
      const dp = g.nearestDropoff(e.owner, r.x, r.y);
      const k = o.side || 0, a = (dp ? Math.atan2(dp.y - r.y, dp.x - r.x) : 0) + (k & 1 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 4);
      const ax = r.x + Math.cos(a) * 24, ay = r.y + Math.sin(a) * 24;
      const dd = Math.hypot(r.x - e.x, r.y - e.y);
      const reach = e.radius + 44; // includes standing in a diagonal neighbour tile hemmed in by rock
      if (dd <= reach) {
        if (r.miner && r.miner !== e.id) {
          const m = g.get(r.miner);
          if (!m || m.dead || !m.order || m.order.type !== 'gather' || m.order.target !== r.id || m.order.stage !== 'mine') r.miner = 0;
        }
        if (r.miner && r.miner !== e.id) {
          // busy: now and then look for a less crowded neighbour
          e.moving = false;
          o.waitT = (o.waitT || 0) - dt;
          if (o.waitT <= 0) {
            o.waitT = 0.4 + Math.random() * 0.3;
            const alt = B.findResource(g, e, r.x, r.y, 6 * T, true, o.avoid);
            if (alt && alt !== r) { r.claims = Math.max(0, (r.claims || 1) - 1); alt.claims = (alt.claims || 0) + 1; o.target = alt.id; o.side = 0; e.path = null; }
          }
          return;
        }
        r.miner = e.id;
        o.stage = 'mine';
        o.side = 0;
        o.t = e.def.mineTime;
        stopMoving(e);
        e.angle = Math.atan2(r.y - e.y, r.x - e.x);
      } else {
        if (moveToward(g, e, ax, ay, 6, dt) && Math.hypot(r.x - e.x, r.y - e.y) > reach) {
          // this side cannot be reached: try the next one, nearest the dropoff side first; after
          // all eight, give this diamond up for a minute
          e.path = null; e.repaths = 0;
          o.side = (o.side || 0) + 1;
          if (o.side > 7) {
            if (r.miner === e.id) r.miner = 0;
            (o.avoid || (o.avoid = {}))[r.id] = g.time + 60;
            o.target = 0; o.side = 0;
          }
        }
      }
      return;
    }
    if (o.stage === 'mine') {
      o.t -= dt;
      e.atkAnim = (Math.sin(g.time * 9) > 0.6) ? 0.2 : e.atkAnim;
      if (Math.random() < dt * 1.5) g.sfx('mine', r.x, r.y);
      if (o.t <= 0) {
        const amt = Math.min(e.def.carry, r.amount);
        r.amount -= amt;
        e.carry = amt;
        r.miner = 0;
        if (r.amount <= 0) {
          r.dead = true;
          g.fx('sparkle', { x: r.x, y: r.y, n: 14 });
          g.emit({ type: 'depleted', x: r.x, y: r.y, player: e.owner });
        }
        o.stage = 'ret';
        stopMoving(e);
      }
      return;
    }
    if (o.stage === 'ret') {
      const d = g.nearestDropoff(e.owner, e.x, e.y);
      if (!d) { e.moving = false; return; }
      if (g.edgeDist(d, e.x, e.y) <= e.radius + 14) {
        deposit(g, e, p);
        o.stage = 'go';
        stopMoving(e);
      } else {
        const [ax, ay] = approachPoint(d, e.x, e.y, e.radius + 2);
        moveToward(g, e, ax, ay, 4, dt);
      }
    }
  }
  function deposit(g, e, p) {
    if (e.carry > 0 && p) {
      const v = e.carry * (p.gatherMult || 1);
      p.res.d += v;
      p.stats.gathered += v;
      if (g.localPlayer === p.id) g.fx('float', { x: e.x, y: e.y - 18, text: '+' + Math.round(v), color: '#cfeeff', small: true });
    }
    e.carry = 0;
  }
  function returnCargo(g, e, o, dt) {
    const p = g.players[e.owner];
    const d = g.nearestDropoff(e.owner, e.x, e.y);
    if (!d || e.carry <= 0) { nextOrder(g, e); return; }
    if (g.edgeDist(d, e.x, e.y) <= e.radius + 14) {
      deposit(g, e, p);
      if (o.resume) e.order = { type: 'gather', target: o.resume, stage: 'go' };
      else nextOrder(g, e);
      stopMoving(e);
    } else {
      const [ax, ay] = approachPoint(d, e.x, e.y, e.radius + 2);
      moveToward(g, e, ax, ay, 4, dt);
    }
  }

  function rectGap(tx, ty, s, x, y) {
    const x0 = tx * T, y0 = ty * T, x1 = x0 + s * T, y1 = y0 + s * T;
    const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
    return Math.hypot(dx, dy);
  }

  function build(g, e, o, dt) {
    const def = AC.BUILDINGS[o.def];
    const p = g.players[e.owner];
    if (!o.placed) {
      const s = def.size;
      const gap = rectGap(o.tx, o.ty, s, e.x, e.y);
      if (gap <= e.radius + 14) {
        const chk = g.canPlace(e.owner, o.def, o.tx, o.ty, e.id);
        if (!chk.ok) {
          if (o.paid) { g.refund(p, def.cost); o.paid = false; }
          g.emit({ type: 'error', player: e.owner, text: chk.why });
          nextOrder(g, e);
          return;
        }
        const b = g.spawnBuilding(o.def, e.owner, o.tx, o.ty, false);
        o.placed = true; o.bid = b.id;
        g.sfx(def.faction === 'chaos' ? 'summon' : 'build', b.x, b.y);
        g.fx(def.faction === 'chaos' ? 'summon' : 'dust', { x: b.x, y: b.y, r: b.radius });
        g.emit({ type: 'buildingPlaced', player: e.owner, id: b.id });
        if (def.faction === 'chaos') { nextOrder(g, e); return; }
        stopMoving(e);
      } else {
        const cx = (o.tx + s / 2) * T, cy = (o.ty + s / 2) * T;
        // aim for nearest point of the footprint
        const px = U.clamp(e.x, o.tx * T, (o.tx + s) * T), py = U.clamp(e.y, o.ty * T, (o.ty + s) * T);
        const tgx = U.lerp(px, cx, 0.2), tgy = U.lerp(py, cy, 0.2);
        if (moveToward(g, e, tgx, tgy, 4, dt)) {
          if (rectGap(o.tx, o.ty, s, e.x, e.y) > e.radius + 14) {
            o.tries = (o.tries || 0) + 1;
            if (o.tries > 3) {
              if (o.paid) { g.refund(p, def.cost); o.paid = false; }
              g.emit({ type: 'error', player: e.owner, text: 'Cannot reach that place.' });
              nextOrder(g, e);
            } else e.path = null;
          }
        }
      }
      return;
    }
    // constructing (Amber)
    const b = g.get(o.bid);
    if (!b || b.dead || b.built) {
      // freshly built resource-dropoff: go gather nearby automatically
      if (b && b.built && b.def.dropoff && !e.queue.length) {
        const r = B.findResource(g, e, b.x, b.y, 10 * T, true);
        if (r) { e.order = { type: 'gather', target: r.id }; stopMoving(e); return; }
      }
      nextOrder(g, e);
      return;
    }
    if (g.edgeDist(b, e.x, e.y) > e.radius + 14) {
      const [ax, ay] = approachPoint(b, e.x, e.y, e.radius + 2);
      moveToward(g, e, ax, ay, 4, dt);
    } else {
      e.moving = false;
      e.path = null;
      b.builders++;
      e.angle = Math.atan2(b.y - e.y, b.x - e.x);
      e.atkAnim = Math.sin(g.time * 8 + e.id) > 0.5 ? 0.2 : e.atkAnim;
      if (Math.random() < dt * 1.2) g.sfx('hammer', b.x, b.y);
    }
  }

  function repair(g, e, o, dt) {
    const b = g.get(o.target);
    if (!b || b.dead || !b.built || b.hp >= b.maxHp) { nextOrder(g, e); return; }
    if (g.edgeDist(b, e.x, e.y) > e.radius + 14) {
      const [ax, ay] = approachPoint(b, e.x, e.y, e.radius + 2);
      moveToward(g, e, ax, ay, 4, dt);
    } else {
      e.moving = false;
      b.hp = Math.min(b.maxHp, b.hp + 14 * dt);
      e.atkAnim = Math.sin(g.time * 8 + e.id) > 0.5 ? 0.2 : e.atkAnim;
      if (Math.random() < dt) g.sfx('hammer', b.x, b.y);
    }
  }

  // ------------------------------------------------------------------ separation & terrain collision
  B.separate = function (g, dt) {
    const m = g.map;
    const list = B._sq || (B._sq = []);
    for (let i = 0; i < g.units.length; i++) {
      const e = g.units[i];
      if (e.dead) continue;
      const air = !!e.def.air;
      g.hash.query(e.x, e.y, e.radius + 22, list);
      const eGather = e.def.role === 'worker' && e.order && (e.order.type === 'gather' || e.order.type === 'returnCargo');
      for (let k = 0; k < list.length; k++) {
        const n = list[k];
        if (n.id <= e.id || n.dead || !!n.def.air !== air) continue;
        if (eGather && n.def.role === 'worker' && n.order && (n.order.type === 'gather' || n.order.type === 'returnCargo')) continue;
        let dx = n.x - e.x, dy = n.y - e.y;
        let d = Math.hypot(dx, dy);
        const min = (e.radius + n.radius) * (air ? 0.7 : 0.92);
        if (d >= min) continue;
        if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
        const ov = (min - d) * 0.5;
        let we = e.moving ? 0.3 : 0.7, wn = n.moving ? 0.3 : 0.7;
        if (e.mods.stunned || e.mods.rooted || (e.order && e.order.type === 'hold') || e.channel) we = 0.05;
        if (n.mods.stunned || n.mods.rooted || (n.order && n.order.type === 'hold') || n.channel) wn = 0.05;
        // mining workers hold their ground
        if (e.order && e.order.stage === 'mine') we = 0.05;
        if (n.order && n.order.stage === 'mine') wn = 0.05;
        // heavier units push lighter ones
        we *= n.radius / (e.radius + n.radius) * 2;
        wn *= e.radius / (e.radius + n.radius) * 2;
        const tot = we + wn || 1;
        const ux = dx / d, uy = dy / d;
        const pe = Math.min(ov * 2 * (we / tot), 6), pn = Math.min(ov * 2 * (wn / tot), 6);
        e.x -= ux * pe; e.y -= uy * pe;
        n.x += ux * pn; n.y += uy * pn;
      }
    }
    // terrain push-out
    for (let i = 0; i < g.units.length; i++) {
      const e = g.units[i];
      if (e.dead) continue;
      e.x = U.clamp(e.x, 4, g.worldW - 4);
      e.y = U.clamp(e.y, 4, g.worldH - 4);
      if (e.def.air) continue;
      const bits = g.moveBits(e);
      const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
      if (!m.passable(tx, ty, bits)) {
        // inside a blocked tile: eject to nearest open tile
        const np = g.pf.nearestPassable(tx, ty, bits, 6);
        if (np) {
          const cx = np[0] * T + T / 2, cy = np[1] * T + T / 2;
          const d = Math.hypot(cx - e.x, cy - e.y);
          const s = Math.min(d, 6);
          if (d > 0) { e.x += ((cx - e.x) / d) * s; e.y += ((cy - e.y) / d) * s; }
        }
        continue;
      }
      const r = e.radius * 0.8;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = tx + ox, ny = ty + oy;
          if (m.passable(nx, ny, bits)) continue;
          const x0 = nx * T, y0 = ny * T;
          const cx = U.clamp(e.x, x0, x0 + T), cy = U.clamp(e.y, y0, y0 + T);
          const dx = e.x - cx, dy = e.y - cy;
          const d = Math.hypot(dx, dy);
          if (d < r && d > 0.001) {
            e.x += (dx / d) * (r - d);
            e.y += (dy / d) * (r - d);
          }
        }
    }
  };

  // ------------------------------------------------------------------ buildings
  B.updateBuilding = function (g, b, dt) {
    const def = b.def;
    const p = g.players[b.owner];
    if (!b.built) {
      let rate = 0;
      if (def.faction !== 'amber' || def.scenarioOnly) rate = 1;
      else if (b.builders > 0) rate = Math.min(2.4, 1 + 0.6 * (b.builders - 1));
      b.builders = 0;
      if (rate > 0) {
        const inc = (dt / def.time) * rate * (g.opts.buildSpeed || 1);
        b.progress += inc;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * inc);
        if (b.progress >= 1) g.onBuildingComplete(b);
      }
      return;
    }
    b.builders = 0;
    if (b.trainQ.length) {
      const q = b.trainQ[0];
      q.t += dt * (g.opts.buildSpeed || 1);
      if (q.t >= q.time) {
        b.trainQ.shift();
        B.spawnFromBuilding(g, b, q.id);
      }
    }
    if (b.research) {
      b.research.t += dt * (g.opts.buildSpeed || 1);
      if (b.research.t >= b.research.time) {
        const id = b.research.id;
        b.research = null;
        if (p) {
          p.upgrades[id] = true;
          delete p.researching[id];
          g.emit({ type: 'researchComplete', player: p.id, id });
          g.sfx('research', b.x, b.y);
        }
      }
    }
    if (def.attack) towerAttack(g, b, dt);
  };

  // can a unit standing on tile (x0, y0) beside building b walk away from it, or is the tile
  // a pocket sealed by the building and the rock around it?
  B.leadsOut = function (g, b, x0, y0, bits) {
    const m = g.map, s = b.size, R = 4;
    const seen = new Set([y0 * m.w + x0]), q = [x0, y0];
    while (q.length) {
      const y = q.pop(), x = q.pop();
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0), j = ny * m.w + nx;
        if (seen.has(j) || !m.passable(nx, ny, bits)) continue;
        if (nx < b.tx - R || nx >= b.tx + s + R || ny < b.ty - R || ny >= b.ty + s + R || seen.size >= 40) return true;
        seen.add(j); q.push(nx, ny);
      }
    }
    return false;
  };
  // the open tile beside building b nearest (px, py) that leads away from it (or, failing that, any open tile)
  B.exitTile = function (g, b, px, py, bits, air) {
    let best = null, bd = 1e18, sealed = null, sd = 1e18;
    const s = b.size;
    for (let y = b.ty - 1; y <= b.ty + s; y++)
      for (let x = b.tx - 1; x <= b.tx + s; x++) {
        if (x >= b.tx && x < b.tx + s && y >= b.ty && y < b.ty + s) continue;
        if (!air && !g.map.passable(x, y, bits)) continue;
        const d = U.dist2(x * T + T / 2, y * T + T / 2, px, py);
        if (d >= bd) continue;
        if (air || B.leadsOut(g, b, x, y, bits)) { bd = d; best = [x, y]; } else if (d < sd) { sd = d; sealed = [x, y]; }
      }
    return best || sealed;
  };

  B.spawnFromBuilding = function (g, b, unitId) {
    const def = AC.UNITS[unitId];
    const p = g.players[b.owner];
    // exit tile nearest to rally (or below)
    const rx = b.rally ? b.rally.x : b.x, ry = b.rally ? b.rally.y : (b.ty + b.size + 2) * T;
    const s = b.size;
    const best = B.exitTile(g, b, rx, ry, g.moveBits({ def }), def.air) || [b.tx + Math.floor(s / 2), b.ty + s];
    const u = g.spawnUnit(unitId, b.owner, best[0] * T + T / 2, best[1] * T + T / 2);
    u.angle = Math.atan2(ry - u.y, rx - u.x);
    if (p) p.stats.trained++;
    g.fx('spawn', { x: u.x, y: u.y, color: p ? p.color.light : '#fff', faction: def.faction });
    if (b.rally) {
      const rt = b.rally.target ? g.get(b.rally.target) : null;
      if (rt && rt.kind === 'resource' && def.role === 'worker') u.order = { type: 'gather', target: rt.id };
      else if (rt && rt.kind === 'unit' && !rt.dead && g.areAllies(rt.owner, u.owner)) u.order = { type: 'follow', target: rt.id };
      else u.order = { type: def.role === 'worker' ? 'move' : 'attackMove', x: b.rally.x + (Math.random() - 0.5) * 30, y: b.rally.y + (Math.random() - 0.5) * 30 };
    } else if (def.role === 'worker') {
      const r = B.findResource(g, u, b.x, b.y, 12 * T, true);
      if (r && b.def.dropoff) u.order = { type: 'gather', target: r.id };
    }
    g.emit({ type: 'unitReady', player: b.owner, id: u.id, def: unitId, x: u.x, y: u.y });
    g.recomputeSupplySoon = true;
    return u;
  };

  function towerAttack(g, b, dt) {
    const a = b.def.attack;
    b.atkCd -= dt;
    if (b.atkCd > 0) return;
    let t = b.targetId ? g.get(b.targetId) : null;
    const fake = { owner: b.owner, def: { dmg: a.dmg, canHitAir: a.canHitAir }, x: b.x, y: b.y, radius: b.radius, id: b.id };
    if (t && (!B.canTarget(g, fake, t) || Math.hypot(t.x - b.x, t.y - b.y) - t.radius > a.range + b.radius * 0.5)) t = null;
    if (!t) {
      t = null;
      const list = g.hash.query(b.x, b.y, a.range + b.radius, []);
      let bd = 1e18;
      for (const u of list) {
        if (!B.canTarget(g, fake, u)) continue;
        const d = Math.hypot(u.x - b.x, u.y - b.y) - u.radius;
        if (d > a.range + b.radius * 0.5) continue;
        const s = d + (u.def.role === 'worker' ? 60 : 0);
        if (s < bd) { bd = s; t = u; }
      }
      b.targetId = t ? t.id : 0;
    }
    if (!t) { b.atkCd = 0.25; return; }
    b.atkCd = a.cd;
    const pr = {
      kind: a.projectile, owner: b.owner, src: b.id, target: t.id, dmg: a.dmg, dmgType: a.dmgType,
      x: b.x, y: b.y - b.size * 10, speed: PROJ_SPEED[a.projectile] || 450, splash: 0, canHitAir: true,
    };
    pr.prevX = pr.x; pr.prevY = pr.y; pr.tx = t.x; pr.ty = t.y; pr.sx = pr.x; pr.sy = pr.y;
    pr.dist0 = Math.hypot(pr.tx - pr.x, pr.ty - pr.y) || 1;
    g.projectiles.push(pr);
    g.sfx(a.projectile === 'arrow' ? 'arrow' : 'magicShot', b.x, b.y);
  }

  // ------------------------------------------------------------------ projectiles
  B.updateProjectiles = function (g, dt) {
    const out = [];
    for (const pr of g.projectiles) {
      const t = g.get(pr.target);
      if (!pr.ground && t && !t.dead) { pr.tx = t.x; pr.ty = t.y - (t.def.air ? 22 : 0); }
      const dx = pr.tx - pr.x, dy = pr.ty - pr.y;
      const d = Math.hypot(dx, dy);
      const step = pr.speed * dt;
      if (d <= step + 2) {
        pr.x = pr.tx; pr.y = pr.ty;
        impact(g, pr, t);
        continue;
      }
      pr.x += (dx / d) * step; pr.y += (dy / d) * step;
      pr.angle = Math.atan2(dy, dx);
      pr.life = (pr.life || 0) + dt;
      if (pr.life > 6) continue;
      out.push(pr);
    }
    g.projectiles = out;
  };
  function impact(g, pr, t) {
    const src = g.get(pr.src) || { owner: pr.owner, kind: 'proj', id: pr.src };
    if (pr.splash) {
      const list = g.hash.query(pr.x, pr.y, pr.splash + 20, []);
      for (const u of list) {
        if (u.dead || !g.areEnemies(pr.owner, u.owner)) continue;
        if (u.def.air && !pr.canHitAir) continue;
        const d = Math.hypot(u.x - pr.x, u.y - pr.y) - u.radius;
        if (d > pr.splash) continue;
        const f = d <= 0 ? 1 : 1 - 0.5 * (d / pr.splash);
        g.damage(src, u, pr.dmg * f, pr.dmgType);
      }
      const bl = g.bhash.query(pr.x, pr.y, pr.splash + 3 * T, []);
      for (const b of bl) {
        if (b.dead || !g.areEnemies(pr.owner, b.owner)) continue;
        const d = g.edgeDist(b, pr.x, pr.y);
        if (d > pr.splash) continue;
        g.damage(src, b, pr.dmg * (d <= 0 ? 1 : 0.6), pr.dmgType);
      }
      g.fx('explosion', { x: pr.x, y: pr.y, r: pr.splash, kind: pr.kind });
      g.sfx(pr.kind === 'glob' ? 'splat' : 'boom', pr.x, pr.y);
      return;
    }
    if (!t || t.dead) return;
    g.damage(src, t, pr.dmg * (pr.heroMult && t.def.hero ? pr.heroMult : 1), pr.dmgType);
    if (pr.poison && !t.dead && t.kind === 'unit') AC.Abilities.addBuff(g, t, { id: 'poison', t: pr.poison.dur, dps: pr.poison.dps, src: pr.owner });
    g.fx('hit', { x: pr.x, y: pr.y, kind: pr.kind });
  }
})();
