// Amber and Chaos — player commands (shared by the UI and the AI).
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;
  const G = AC.Game.prototype;

  // Orders that never finish on their own: queueing behind them would wait forever.
  const ENDLESS = { gather: 1, patrol: 1, hold: 1, follow: 1 };
  AC.QUEUE_MAX = 16;

  // Give unit u an order (or queue it). Returns false if the order could not be accepted.
  function issue(g, u, order, queue) {
    if (queue && order && (u.order || u.queue.length)) {
      // Behind an order that never ends (and nothing real queued yet): another endless order
      // replaces it (gather from a different diamond); anything else is done first, and the
      // unit then takes up the old order again (a worker goes back to its diamonds).
      // Endless orders that reach the front with work queued behind them yield the same way
      // (Behavior.yieldEndless).
      if (u.order && ENDLESS[u.order.type] && u.queue.every((q) => q.resumed)) {
        const old = u.order;
        const resume = ENDLESS[order.type] ? null : old.type === 'gather' ? { type: 'gather', target: old.target, resumed: true } : old;
        if (old.type === 'gather') g.releaseMiner(u);
        u.order = order;
        u.queue.length = 0;
        u.path = null; u.repaths = 0; u.subTarget = 0; u.stuckN = 0;
        if (resume) u.queue.push(resume);
        return true;
      }
      if (u.queue.length >= AC.QUEUE_MAX) return false;
      // keep an automatic return-to-gathering at the end of the queue
      const last = u.queue[u.queue.length - 1];
      if (last && last.resumed) u.queue.splice(u.queue.length - 1, 0, order);
      else u.queue.push(order);
      return true;
    }
    if (u.order && u.order.type === 'gather') g.releaseMiner(u);
    if (u.order && u.order.type === 'build' && u.order.paid && !u.order.placed) {
      g.refund(g.players[u.owner], AC.BUILDINGS[u.order.def].cost);
    }
    for (const q of u.queue) if (q.type === 'build' && q.paid && !q.placed) g.refund(g.players[u.owner], AC.BUILDINGS[q.def].cost);
    u.order = order;
    u.queue.length = 0;
    u.path = null; u.repaths = 0; u.subTarget = 0; u.stuckN = 0;
    return true;
  }
  AC.issue = issue;
  // unplaced, paid build orders of a given type held by a player's workers
  function pendingBuilds(g, pid, defId) {
    let n = 0;
    for (const u of g.units) {
      if (u.dead || u.owner !== pid || u.def.role !== 'worker') continue;
      for (const o of [u.order, ...u.queue]) if (o && o.type === 'build' && !o.placed && o.def === defId) n++;
    }
    return n;
  }

  // Assign formation slots around (x,y)
  function formation(g, units, x, y) {
    const n = units.length;
    const out = new Map();
    if (n === 1) { out.set(units[0].id, [x, y]); return out; }
    let avgR = 0;
    for (const u of units) avgR += u.radius;
    avgR /= n;
    const spacing = avgR * 2.3;
    const slots = [];
    const sp = U.spiral(8);
    for (const [ox, oy] of sp) {
      if (slots.length >= n) break;
      const sx = x + ox * spacing, sy = y + oy * spacing;
      const air = units[0].def.air;
      if (!air && !g.map.passableWorld(sx, sy, 1)) continue;
      slots.push([sx, sy]);
    }
    while (slots.length < n) slots.push([x, y]);
    // greedy assignment: farthest units pick first
    const cx = units.reduce((a, u) => a + u.x, 0) / n, cy = units.reduce((a, u) => a + u.y, 0) / n;
    const dir = Math.atan2(y - cy, x - cx);
    const order = units.slice().sort((a, b) => {
      // project onto travel direction so front units take front slots
      const pa = (a.x - cx) * Math.cos(dir) + (a.y - cy) * Math.sin(dir);
      const pb = (b.x - cx) * Math.cos(dir) + (b.y - cy) * Math.sin(dir);
      return pb - pa;
    });
    const used = new Uint8Array(slots.length);
    for (const u of order) {
      let bi = -1, bd = 1e18;
      for (let i = 0; i < slots.length; i++) {
        if (used[i]) continue;
        const d = U.dist2(slots[i][0], slots[i][1], u.x + (x - cx), u.y + (y - cy));
        if (d < bd) { bd = d; bi = i; }
      }
      used[bi] = 1;
      out.set(u.id, slots[bi]);
    }
    return out;
  }

  function groupMove(g, units, type, x, y, queue, creeps) {
    if (!units.length) return;
    const ground = units.filter((u) => !u.def.air), air = units.filter((u) => u.def.air);
    for (const grp of [ground, air]) {
      if (!grp.length) continue;
      const slots = formation(g, grp, x, y);
      let shared = null, cx = 0, cy = 0;
      if (grp.length > 1 && !grp[0].def.air && !queue) {
        cx = grp.reduce((a, u) => a + u.x, 0) / grp.length;
        cy = grp.reduce((a, u) => a + u.y, 0) / grp.length;
        shared = g.pf.find(cx, cy, x, y, 1, { radius: 10 });
      }
      for (const u of grp) {
        const s = slots.get(u.id);
        const o = { type, x: s[0], y: s[1] };
        if (creeps) o.creeps = true;
        if (type === 'patrol') { o.ax = u.x; o.ay = u.y; }
        issue(g, u, o, queue);
        if (shared && shared.length && u.order === o && g.moveBits(u) === 1 && Math.hypot(u.x - cx, u.y - cy) < 5 * T) {
          const p0 = shared[0];
          if (g.pf.los(u.x, u.y, p0[0], p0[1], 1, u.radius)) {
            const path = shared.map((p) => [p[0], p[1]]);
            path[path.length - 1] = [s[0], s[1]];
            // offset the intermediate waypoints slightly so the column does not collapse into a line
            u.path = path; u.pathI = 0; u.pathGoalX = s[0]; u.pathGoalY = s[1];
          }
        }
      }
    }
  }

  G.command = function (pid, c) {
    const g = this;
    const p = g.players[pid];
    if (!p) return false;
    if (g.over && !g.opts.continueAfterOver) return false;
    const ents = (c.ids || []).map((id) => g.get(id)).filter((e) => e && !e.dead && e.owner === pid);
    const units = ents.filter((e) => e.kind === 'unit');
    const blds = ents.filter((e) => e.kind === 'building');
    const err = (text) => { g.emit({ type: 'error', player: pid, text }); return false; };
    switch (c.type) {
      case 'move':
      case 'attackMove':
      case 'patrol':
        groupMove(g, units, c.type, c.x, c.y, c.queue, c.creeps || (c.type === 'attackMove' && c.human));
        if (c.type !== 'move' || units.length) g.fx('cmd', { x: c.x, y: c.y, kind: c.type === 'move' ? 'move' : 'attack', player: pid });
        return true;
      case 'smart': return smart(g, pid, units, blds, c);
      case 'attack': {
        const t = g.get(c.target);
        if (!t || t.dead) return false;
        for (const u of units) if (u.def.dmg) issue(g, u, { type: 'attack', target: t.id }, c.queue);
        g.fx('cmdTarget', { id: t.id, kind: 'attack', player: pid });
        return true;
      }
      case 'stop':
        for (const u of units) { issue(g, u, null, false); u.order = null; }
        return true;
      case 'hold':
        for (const u of units) issue(g, u, { type: 'hold' }, c.queue);
        return true;
      case 'gather': {
        const r = g.get(c.target);
        if (!r || r.kind !== 'resource') return false;
        for (const u of units) if (u.def.role === 'worker') issue(g, u, { type: 'gather', target: r.id }, c.queue);
        return true;
      }
      case 'returnCargo':
        for (const u of units) if (u.def.role === 'worker' && u.carry > 0) {
          const res = u.order && u.order.type === 'gather' ? u.order.target : 0;
          issue(g, u, { type: 'returnCargo', resume: res }, c.queue);
        }
        return true;
      case 'build': {
        const def = AC.BUILDINGS[c.def];
        if (!def || def.faction !== p.faction || def.scenarioOnly || !g.canBuildType(def.id)) return err('You cannot build that here.');
        const workers = units.filter((u) => u.def.role === 'worker');
        if (!workers.length) return err('Only workers can build.');
        if (!g.meetsReq(pid, def)) return err('Requires ' + g.missingReq(pid, def).join(', ') + '.');
        if ((def.id === 'castle' || def.id === 'spire') && (g.hasBuilding(pid, def.id) || pendingBuilds(g, pid, def.id))) return err('There can be only one ' + def.name + '.');
        const chk = g.canPlace(pid, def.id, c.tx, c.ty, workers[0].id);
        if (!chk.ok) return err(chk.why);
        if (!g.canAfford(p, def.cost)) return err(p.res.d < def.cost.d ? 'Not enough diamonds.' : 'Not enough ' + p.F.power + '.');
        // closest worker
        const cx = (c.tx + def.size / 2) * T, cy = (c.ty + def.size / 2) * T;
        let w = workers[0], bd = 1e18;
        if (!c.queue) for (const u of workers) { const d = U.dist2(u.x, u.y, cx, cy); if (d < bd) { bd = d; w = u; } }
        if (c.queue && w.queue.length >= AC.QUEUE_MAX) return err('That worker has too many orders.');
        g.pay(p, def.cost);
        if (!issue(g, w, { type: 'build', def: def.id, tx: c.tx, ty: c.ty, paid: true }, c.queue)) { g.refund(p, def.cost); return err('That worker has too many orders.'); }
        g.sfx('place', cx, cy);
        return true;
      }
      case 'construct': {
        const b = g.get(c.target);
        if (!b || b.built || b.owner !== pid) return false;
        for (const u of units) if (u.def.role === 'worker') issue(g, u, { type: 'build', def: b.def.id, tx: b.tx, ty: b.ty, placed: true, bid: b.id }, c.queue);
        return true;
      }
      case 'repair': {
        const b = g.get(c.target);
        if (!b || !b.built || b.owner !== pid) return false;
        for (const u of units) if (u.def.role === 'worker' && p.faction === 'amber') issue(g, u, { type: 'repair', target: b.id }, c.queue);
        return true;
      }
      case 'train': return train(g, pid, blds, c.def);
      case 'cancelTrain': {
        const b = blds[0];
        if (!b || !b.trainQ.length) return false;
        const i = c.index != null ? c.index : b.trainQ.length - 1;
        const q = b.trainQ[i];
        if (!q) return false;
        b.trainQ.splice(i, 1);
        g.refund(p, q.cost);
        g.recomputeSupply();
        return true;
      }
      case 'research': {
        const b = blds.find((x) => x.built && x.def.researches && x.def.researches.indexOf(c.up) >= 0 && !x.research);
        const up = AC.UPGRADES[c.up];
        if (!up) return false;
        if (p.upgrades[c.up]) return err('Already known.');
        if (p.researching[c.up]) return err('Already being researched.');
        if (!b) return err('That building is busy.');
        if (!g.canAfford(p, up.cost)) return err(p.res.d < up.cost.d ? 'Not enough diamonds.' : 'Not enough ' + p.F.power + '.');
        g.pay(p, up.cost);
        b.research = { id: up.id, t: 0, time: up.time };
        p.researching[up.id] = true;
        return true;
      }
      case 'cancelResearch': {
        const b = blds.find((x) => x.research);
        if (!b) return false;
        const up = AC.UPGRADES[b.research.id];
        g.refund(p, up.cost);
        delete p.researching[up.id];
        b.research = null;
        return true;
      }
      case 'cancelBuild': {
        for (const b of blds) {
          if (b.built) continue;
          g.refund(p, b.def.cost, 0.75);
          g.kill(b, null);
        }
        return true;
      }
      case 'rally':
        for (const b of blds) b.rally = { x: c.x, y: c.y, target: c.target || 0 };
        if (blds.length) g.fx('cmd', { x: c.x, y: c.y, kind: 'rally', player: pid });
        return true;
      case 'cast': return cast(g, pid, units, c);
      case 'power': {
        const b = blds.find((x) => x.built && x.def.powers && x.def.powers.indexOf(c.power) >= 0);
        if (!b) return false;
        return AC.Abilities.usePower(g, pid, c.power, b);
      }
    }
    return false;
  };

  function smart(g, pid, units, blds, c) {
    const t = c.target ? g.get(c.target) : null;
    if (blds.length && !units.length) {
      return g.command(pid, { type: 'rally', ids: blds.map((b) => b.id), x: c.x, y: c.y, target: t && (t.kind === 'resource' || t.kind === 'unit') ? t.id : 0 });
    }
    if (!units.length) return false;
    if (t && !t.dead) {
      if ((t.kind === 'unit' || t.kind === 'building') && g.areEnemies(pid, t.owner) && g.visibleTo(pid, t)) {
        const fighters = units.filter((u) => u.def.dmg && !(t.def.air && !u.def.canHitAir));
        const others = units.filter((u) => fighters.indexOf(u) < 0);
        for (const u of fighters) issue(g, u, { type: 'attack', target: t.id }, c.queue);
        if (others.length) groupMove(g, others, 'move', t.x, t.y, c.queue);
        g.fx('cmdTarget', { id: t.id, kind: 'attack', player: pid });
        return true;
      }
      if (t.kind === 'resource') {
        const ws = units.filter((u) => u.def.role === 'worker');
        const rest = units.filter((u) => u.def.role !== 'worker');
        for (const u of ws) issue(g, u, { type: 'gather', target: t.id }, c.queue);
        if (rest.length) groupMove(g, rest, 'move', c.x, c.y, c.queue);
        g.fx('cmdTarget', { id: t.id, kind: 'gather', player: pid });
        return true;
      }
      if (t.kind === 'building' && g.areAllies(pid, t.owner)) {
        const p = g.players[pid];
        let handled = false;
        const rest = [];
        for (const u of units) {
          if (u.def.role === 'worker' && t.owner === pid) {
            if (!t.built && t.def.faction === 'amber') { issue(g, u, { type: 'build', def: t.def.id, tx: t.tx, ty: t.ty, placed: true, bid: t.id }, c.queue); handled = true; continue; }
            if (u.carry > 0 && t.built && t.def.dropoff) { issue(g, u, { type: 'returnCargo', resume: u.order && u.order.type === 'gather' ? u.order.target : 0 }, c.queue); handled = true; continue; }
            if (t.built && t.hp < t.maxHp && p.faction === 'amber') { issue(g, u, { type: 'repair', target: t.id }, c.queue); handled = true; continue; }
          }
          rest.push(u);
        }
        if (rest.length) {
          const [ax, ay] = AC.Behavior.approachPoint(t, c.x, c.y, 18);
          groupMove(g, rest, 'move', ax, ay, c.queue);
        }
        g.fx('cmdTarget', { id: t.id, kind: 'friend', player: pid });
        return true;
      }
      if (t.kind === 'unit' && g.areAllies(pid, t.owner) && units.indexOf(t) < 0) {
        for (const u of units) issue(g, u, { type: 'follow', target: t.id }, c.queue);
        g.fx('cmdTarget', { id: t.id, kind: 'friend', player: pid });
        return true;
      }
    }
    groupMove(g, units, 'move', c.x, c.y, c.queue);
    g.fx('cmd', { x: c.x, y: c.y, kind: 'move', player: pid });
    return true;
  }

  // Returns the effective cost/time for training def (hero revival is cheaper)
  G.trainCost = function (pid, defId) {
    const d = AC.UNITS[defId];
    const p = this.players[pid];
    if (d.hero && p && p.deadHeroes[defId]) {
      const lv = p.deadHeroes[defId].level;
      return { cost: { d: Math.round(d.cost.d * 0.5 + lv * 15), p: Math.round(d.cost.p * 0.5) }, time: 22 + lv * 4, revive: true };
    }
    return { cost: d.cost, time: d.time, revive: false };
  };
  G.heroStatus = function (pid, heroId) {
    for (const u of this.units) if (!u.dead && u.owner === pid && u.def.id === heroId) return 'alive';
    for (const b of this.buildings) if (!b.dead && b.owner === pid && b.trainQ.some((q) => q.id === heroId)) return 'queued';
    return this.players[pid].deadHeroes[heroId] ? 'dead' : 'available';
  };

  function train(g, pid, blds, defId) {
    const p = g.players[pid];
    const d = AC.UNITS[defId];
    if (!d) return false;
    const err = (text) => { g.emit({ type: 'error', player: pid, text }); return false; };
    const cands = blds.filter((b) => b.built && (g.trainsOf(b).indexOf(defId) >= 0 || (b.def.heroes && b.def.heroes.indexOf(defId) >= 0)));
    if (!cands.length) return err('Nothing here can train that.');
    if (d.hero) {
      if (g.bannedHeroes && g.bannedHeroes.has(defId)) return err(d.name + ' will not return.');
      const st = g.heroStatus(pid, defId);
      if (st === 'alive') return err(d.name + ' already walks among you.');
      if (st === 'queued') return err(d.name + ' is already answering your call.');
      g.recomputeSupply();
      if (p.heroCount >= AC.MAX_HEROES) return err('No more than ' + AC.MAX_HEROES + ' heroes may take the field.');
    }
    const tc = g.trainCost(pid, defId);
    if (!g.canAfford(p, tc.cost)) return err(p.res.d < tc.cost.d ? 'Not enough diamonds.' : 'Not enough ' + p.F.power + '.');
    g.recomputeSupply();
    if (p.supplyUsed + d.supply > p.supplyCap) {
      if (g.time - p.lastSupplyAlert > 4) { p.lastSupplyAlert = g.time; g.emit({ type: 'supply', player: pid }); }
      return err(p.supplyCap >= AC.MAX_SUPPLY ? 'Your host has reached its greatest size.' : 'Not enough supply. Build more ' + AC.BUILDINGS[p.F.supplyBldg].name + 's.');
    }
    cands.sort((a, b) => a.trainQ.length - b.trainQ.length);
    const b = cands[0];
    if (b.trainQ.length >= 5) return err('The queue is full.');
    g.pay(p, tc.cost);
    b.trainQ.push({ id: defId, t: 0, time: tc.time, cost: tc.cost });
    p.supplyUsed += d.supply;
    if (d.hero) p.heroCount++;
    return true;
  }

  function cast(g, pid, units, c) {
    const ab = AC.ABILITIES[c.ab];
    if (!ab) return false;
    const casters = units.filter((u) => u.def.abilities && u.def.abilities.indexOf(c.ab) >= 0);
    if (!casters.length) return false;
    let firstErr = null;
    const ready = casters.filter((u) => {
      const r = AC.Abilities.canCast(g, u, c.ab);
      if (!r.ok && !firstErr) firstErr = r.why;
      return r.ok;
    });
    if (!ready.length) { g.emit({ type: 'error', player: pid, text: firstErr }); return false; }
    if (ab.target === 'none' && !ab.shared) {
      // every selected caster that is ready casts (e.g. all ty'iga… or all heroes recalling)
      const list = ab.id === 'trump_recall' || ab.id === 'ways_recall' ? ready : [ready[0]];
      for (const u of list) issue(g, u, { type: 'cast', ab: ab.id }, c.queue);
      return true;
    }
    // targeted: pick nearest ready caster
    const tx = c.target ? g.get(c.target) : null;
    const px = tx ? tx.x : c.x, py = tx ? tx.y : c.y;
    if (ab.target === 'unit' && !AC.Abilities.validTarget(g, ready[0], ab, tx)) return g.emit({ type: 'error', player: pid, text: 'Invalid target.' }), false;
    ready.sort((a, b) => U.dist2(a.x, a.y, px, py) - U.dist2(b.x, b.y, px, py));
    issue(g, ready[0], { type: 'cast', ab: ab.id, x: c.x, y: c.y, target: c.target || 0 }, c.queue);
    if (ab.target === 'point') g.fx('cmd', { x: c.x, y: c.y, kind: 'cast', player: pid });
    return true;
  }
})();
