// Amber and Chaos — computer opponent.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;

  // [building, count, earliest time (s)] — supply buildings are managed separately
  const PLANS = {
    amber: [
      ['barracks', 1, 0], ['shrine', 1, 50], ['hall_trumps', 1, 110], ['lodge', 1, 170], ['lighthouse', 1, 230],
      ['armory', 1, 270], ['shrine', 2, 300], ['barracks', 2, 360], ['aerie', 1, 450], ['keep', 1, 420], ['lodge', 2, 560], ['shrine', 3, 650],
      ['lighthouse', 2, 600], ['armory', 2, 700], ['barracks', 3, 840], ['keep', 2, 900], ['lighthouse', 3, 1000], ['aerie', 2, 1100],
    ],
    chaos: [
      ['pit', 1, 0], ['logrus_shrine', 1, 50], ['hall_houses', 1, 110], ['hendrake', 1, 170], ['serpent_eye', 1, 230],
      ['den', 1, 270], ['logrus_shrine', 2, 300], ['pit', 2, 360], ['roost', 1, 450], ['bastion', 1, 420], ['hendrake', 2, 560], ['logrus_shrine', 3, 650],
      ['serpent_eye', 2, 600], ['den', 2, 700], ['pit', 3, 840], ['bastion', 2, 900], ['serpent_eye', 3, 1000], ['roost', 2, 1100],
    ],
  };
  const MIX = {
    amber: { guard: 3, ranger: 3, lancer: 2, hellhound: 1.2, rifleman: 3, tidecaller: 0.8, gryphon: 1.3, bombard: 0.8 },
    chaos: { demon: 3.2, crossbow: 3, hellmaid: 2, stalker: 1.1, manticore: 2, wyvern: 1.3, tyiga: 0.5, spitter: 0.8 },
  };
  const RESEARCH = {
    amber: ['avalon_steel', 'arden_yew', 'jewel', 'rebman_mail', 'rouge'],
    chaos: ['hell_claws', 'logrus_sight', 'wave', 'shifting_hide', 'road_spread'],
  };
  const HERO_PREF = {
    amber: ['corwin', 'benedict', 'fiona', 'gerard', 'random', 'julian', 'caine'],
    chaos: ['dara', 'brand', 'borel', 'mandor', 'suhuy', 'jurt'],
  };
  const DIFF = {
    easy: { think: 1.0, gather: 0.8, firstWave: 480, wave0: 12, waveInc: 4, abil: 0.5, workers: 14 },
    normal: { think: 0.5, gather: 1.0, firstWave: 330, wave0: 16, waveInc: 6, abil: 0.9, workers: 18 },
    hard: { think: 0.3, gather: 1.3, firstWave: 250, wave0: 18, waveInc: 8, abil: 1.0, workers: 22 },
  };

  class AI {
    constructor(game, pid, opts) {
      this.g = game;
      this.pid = pid;
      this.opts = opts || {};
      const p = game.players[pid];
      this.p = p;
      this.d = DIFF[p.difficulty] || DIFF.normal;
      p.gatherMult = this.d.gather * (this.opts.gatherMult || 1);
      this.t = 0;
      this.next = Math.random() * 0.5;
      this.state = 'build';
      this.waveN = 0;
      this.nextWaveT = this.opts.firstWave != null ? this.opts.firstWave : this.d.firstWave;
      this.waveSize = this.d.wave0;
      this.attackTarget = null;
      this.lastReissue = 0;
      this.siteSquad = new Set();
      this.creepT = 200;
      this.heroPrefs = U.shuffle(HERO_PREF[p.faction].slice(), Math.random).sort((a, b) => (HERO_PREF[p.faction].indexOf(a) < 3 ? -1 : 0) - (HERO_PREF[p.faction].indexOf(b) < 3 ? -1 : 0));
      this.rng = U.rng(pid * 1013 + 7);
    }
    cmd(c) { return this.g.command(this.pid, c); }

    update(dt) {
      this.t += dt;
      if (this.t < this.next) return;
      this.next = this.t + this.d.think;
      if (!this.p.alive || this.g.over) return;
      if (this.opts.passive) { this.scan(); this.micro(); return; }
      this.scan();
      if (!this.opts.noEconomy) {
        this.economy();
        this.building();
        this.research();
      }
      this.heroes();
      this.production();
      this.military();
      this.micro();
      this.powers();
    }

    scan() {
      const g = this.g, pid = this.pid;
      this.my = g.units.filter((u) => !u.dead && u.owner === pid);
      this.workers = this.my.filter((u) => u.def.role === 'worker');
      this.army = this.my.filter((u) => u.def.role !== 'worker' && !u.def.summon && !u.garrison);
      this.garrison = this.my.filter((u) => u.garrison && !(u.order && u.order.type === 'hold'));
      this.heroList = this.my.filter((u) => u.def.hero);
      this.blds = g.buildings.filter((b) => !b.dead && b.owner === pid);
      this.hqs = this.blds.filter((b) => b.def.dropoff);
      this.mainHq = g.hq(pid) || this.blds[0];
      this.count = {};
      for (const b of this.blds) this.count[b.def.id] = (this.count[b.def.id] || 0) + 1;
      this.armySupply = this.army.reduce((a, u) => a + (u.def.supply || 0), 0);
      if (this.mainHq && !this.rally) {
        const a = Math.atan2(g.worldH / 2 - this.mainHq.y, g.worldW / 2 - this.mainHq.x);
        this.rally = { x: this.mainHq.x + Math.cos(a) * 7 * T, y: this.mainHq.y + Math.sin(a) * 7 * T };
      }
    }

    // ------------------------------------------------------------ economy
    economy() {
      const g = this.g, p = this.p;
      const bases = this.hqs.filter((b) => b.built).length || 1;
      const want = Math.min(32, this.d.workers + (bases - 1) * 8);
      if (this.workers.length < want) {
        for (const h of this.hqs) {
          if (!h.built || h.trainQ.length >= 1) continue;
          if (g.canAfford(p, AC.UNITS[p.F.worker].cost) && p.supplyUsed + 1 <= p.supplyCap) this.cmd({ type: 'train', ids: [h.id], def: p.F.worker });
        }
      }
      // idle workers to work
      for (const w of this.workers) {
        if (w.order || w.queue.length) continue;
        let best = null, bd = 1e18;
        for (const h of this.hqs) {
          if (!h.built) continue;
          const r = AC.Behavior.findResource(g, w, h.x, h.y, 11 * T, true);
          if (!r) continue;
          const d = U.dist2(r.x, r.y, w.x, w.y);
          if (d < bd) { bd = d; best = r; }
        }
        if (!best) best = AC.Behavior.findResource(g, w, w.x, w.y, 60 * T, true);
        if (best) this.cmd({ type: 'gather', ids: [w.id], target: best.id });
      }
      // Amber: unfinished buildings need hands
      if (p.faction === 'amber') {
        for (const b of this.blds) {
          if (b.built) continue;
          const has = this.workers.some((w) => w.order && w.order.type === 'build' && w.order.bid === b.id);
          if (!has) {
            const w = this.pickWorker(b.x, b.y);
            if (w) this.cmd({ type: 'construct', ids: [w.id], target: b.id });
          }
        }
        // repair damaged buildings when no enemies near
        if (this.state !== 'defend') {
          for (const b of this.blds) {
            if (!b.built || b.hp > b.maxHp * 0.6) continue;
            if (this.g.time - b.lastHitT < 8) continue;
            const has = this.workers.some((w) => w.order && w.order.type === 'repair' && w.order.target === b.id);
            if (!has) { const w = this.pickWorker(b.x, b.y); if (w) this.cmd({ type: 'repair', ids: [w.id], target: b.id }); }
          }
        }
      }
    }
    pickWorker(x, y) {
      let best = null, bd = 1e18;
      for (const w of this.workers) {
        if (w.order && (w.order.type === 'build' || w.order.type === 'repair')) continue;
        let d = U.dist2(w.x, w.y, x, y);
        if (w.carry > 0) d *= 1.3;
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    }

    // ------------------------------------------------------------ building
    building() {
      const g = this.g, p = this.p;
      if (!this.mainHq) return this.rebuildHq();
      g.recomputeSupply();
      // in-flight build orders
      const pending = {};
      for (const w of this.workers) {
        const orders = [w.order, ...w.queue];
        for (const o of orders) if (o && o.type === 'build' && !o.placed) pending[o.def] = (pending[o.def] || 0) + 1;
      }
      const have = (id) => (this.count[id] || 0) + (pending[id] || 0);
      this.reserve = { d: 0, p: 0 };
      // no place left to bring diamonds: raise a new seat before anything else
      if (!this.hqs.length && this.workers.length) {
        if (pending[p.F.hq] || pending[p.F.expansion]) return;
        const seats = [p.F.hq, p.F.expansion].filter((id) => g.canBuildType(id) && g.meetsReq(this.pid, AC.BUILDINGS[id]));
        if (!seats.length) return;
        // with no dropoff there is no income to wait for: take the first seat we can pay for now,
        // otherwise save for the cheapest
        const id = seats.find((k) => g.canAfford(p, AC.BUILDINGS[k].cost)) ||
          seats.reduce((a, b) => (AC.BUILDINGS[b].cost.d < AC.BUILDINGS[a].cost.d ? b : a));
        if (!this.tryBuild(id)) this.reserve = AC.BUILDINGS[id].cost;
        return;
      }
      // supply first
      const supplyId = p.F.supplyBldg;
      const supplyBuilding = this.blds.some((b) => b.def.id === supplyId && !b.built) || pending[supplyId];
      const prodCap = this.blds.filter((b) => b.built && b.def.trains).length * 2 + 2;
      if (!supplyBuilding && p.supplyCap < AC.MAX_SUPPLY && p.supplyCap - p.supplyUsed <= prodCap + 2 && g.time > 20) {
        if (this.tryBuild(supplyId)) return;
        this.reserve = AC.BUILDINGS[supplyId].cost;
        return;
      }
      if (this.workers.length < 8 && g.time < 600) return;
      // floating diamonds: add cheap production
      if (p.res.d > 700 && g.time > 200) {
        const cheap = p.faction === 'amber' ? ['barracks', 'lodge'] : ['pit', 'hendrake'];
        for (const id of cheap) {
          if (have(id) >= 4 || !g.meetsReq(this.pid, AC.BUILDINGS[id])) continue;
          const busy = this.blds.filter((b) => b.def.id === id).every((b) => !b.built || b.trainQ.length > 0);
          if (busy && this.tryBuild(id)) return;
        }
      }
      const plan = this.opts.plan || PLANS[p.faction];
      const speed = p.difficulty === 'hard' ? 0.8 : p.difficulty === 'easy' ? 1.35 : 1;
      for (const [id, n, at] of plan) {
        if (have(id) >= n) continue;
        if (g.time < (at || 0) * speed) return;
        const def = AC.BUILDINGS[id];
        if (!g.meetsReq(this.pid, def) || !g.canBuildType(id)) continue;
        if (def.hq && !def.id.match(/castle|spire/)) {
          // expansion: only when the main is mining out or late enough
          if (g.time < 360 && this.mainRemaining() > 0.45) continue;
          if (this.opts.noExpand) continue;
        }
        if (this.tryBuild(id)) return;
        this.reserve = def.cost;
        return;
      }
    }
    mainRemaining() {
      const h = this.mainHq;
      let a = 0, m = 0;
      for (const r of this.g.resources) {
        if (U.dist2(r.x, r.y, h.x, h.y) > (12 * T) ** 2) continue;
        a += r.amount; m += r.maxAmount;
      }
      return m ? a / m : 0;
    }
    rebuildHq() {
      const p = this.p;
      if (!this.workers.length) return;
      if (this.g.canAfford(p, AC.BUILDINGS[p.F.hq].cost)) this.tryBuild(p.F.hq);
    }
    tryBuild(id) {
      const g = this.g, p = this.p;
      const def = AC.BUILDINGS[id];
      if (!g.canAfford(p, def.cost)) return false;
      const spot = def.hq && id !== p.F.hq && this.hqs.length ? this.findExpansion(id) : this.findSpot(id);
      if (!spot) {
        // chaos: extend the road with an obelisk
        if (p.faction === 'chaos' && id !== 'obelisk' && g.canAfford(p, AC.BUILDINGS.obelisk.cost) &&
            g.time - (this.lastObelisk || -99) > 25 && (this.count.obelisk || 0) < 6) {
          this.lastObelisk = g.time;
          const os = this.findSpot('obelisk', true);
          if (os) { const w = this.pickWorker(os[0] * T, os[1] * T); if (w) this.cmd({ type: 'build', ids: [w.id], def: 'obelisk', tx: os[0], ty: os[1] }); }
        }
        return false;
      }
      const w = this.pickWorker(spot[0] * T, spot[1] * T);
      if (!w) return false;
      return this.cmd({ type: 'build', ids: [w.id], def: id, tx: spot[0], ty: spot[1] });
    }
    findSpot(id, outward) {
      const g = this.g, m = g.map;
      const def = AC.BUILDINGS[id];
      const s = def.size;
      const h = this.mainHq || this.homeAnchor();
      if (!h) return null;
      const hx = h.tx + Math.floor(h.size / 2), hy = h.ty + Math.floor(h.size / 2);
      // resource direction to keep mining lanes clear
      let rx = 0, ry = 0, rn = 0;
      for (const r of g.resources) if (!r.dead && U.dist2(r.x, r.y, h.x, h.y) < (11 * T) ** 2) { rx += r.tx; ry += r.ty; rn++; }
      const hasRes = rn > 0;
      if (hasRes) { rx /= rn; ry /= rn; }
      const sp = this._spiral || (this._spiral = U.spiral(16));
      const start = outward ? 5 : 0;
      for (let i = 0; i < sp.length; i++) {
        const [ox, oy] = sp[i];
        const r = Math.max(Math.abs(ox), Math.abs(oy));
        if (r < start) continue;
        const tx = hx + ox - Math.floor(s / 2), ty = hy + oy - Math.floor(s / 2);
        const cx = tx + s / 2, cy = ty + s / 2;
        const dh = Math.hypot(cx - hx, cy - hy);
        if (dh < h.size / 2 + s / 2 + 1) continue;
        if (hasRes) {
          // avoid the band between HQ and its diamonds
          const vx = rx - hx, vy = ry - hy, L = Math.hypot(vx, vy) || 1;
          const along = ((cx - hx) * vx + (cy - hy) * vy) / L;
          const perp = Math.abs(((cx - hx) * vy - (cy - hy) * vx) / L);
          if (along > -1 && along < L + 2.5 && perp < 4.5 + s / 2) continue;
        }
        if (outward && def.anywhere) {
          // obelisk: at the rim of existing road, on open ground
          if (m.isRoad(tx, ty)) continue;
          let near = false;
          for (let k = -2; k <= 2 && !near; k++) for (let j = -2; j <= 2; j++) if (m.isRoad(tx + k, ty + j)) { near = true; break; }
          if (!near) continue;
        }
        if (!g.canPlace(this.pid, id, tx, ty).ok) continue;
        if (this.overlapsPending(tx, ty, s)) continue;
        // leave a walkway around
        if (!this.ringClear(tx, ty, s)) continue;
        return [tx, ty];
      }
      return null;
    }
    // with no buildings left, build around the workers instead
    homeAnchor() {
      const w = this.workers[0];
      if (!w) return null;
      return { x: w.x, y: w.y, tx: Math.floor(w.x / T), ty: Math.floor(w.y / T), size: 1 };
    }
    overlapsPending(tx, ty, s) {
      for (const w of this.workers) {
        for (const o of [w.order, ...w.queue]) {
          if (!o || o.type !== 'build' || o.placed) continue;
          const ps = AC.BUILDINGS[o.def].size;
          if (tx - 1 < o.tx + ps && tx + s + 1 > o.tx && ty - 1 < o.ty + ps && ty + s + 1 > o.ty) return true;
        }
      }
      return false;
    }
    // a walkway all round, and never a plug in a pass: the open ground around the
    // footprint must be one unbroken stretch, or the building would join two obstacles
    ringClear(tx, ty, s) {
      const m = this.g.map;
      const ring = [];
      for (let x = tx - 1; x <= tx + s; x++) ring.push([x, ty - 1]);
      for (let y = ty; y <= ty + s; y++) ring.push([tx + s, y]);
      for (let x = tx + s - 1; x >= tx - 1; x--) ring.push([x, ty + s]);
      for (let y = ty + s - 1; y >= ty; y--) ring.push([tx - 1, y]);
      const open = [];
      for (const [x, y] of ring) {
        if (!m.inb(x, y)) return false;
        const i = y * m.w + x;
        const o = m.occ[i];
        if (o) { const e = this.g.get(o); if (e && e.kind === 'building') return false; }
        open.push((AC.PASS[m.terrain[i]] & 1) !== 0);
      }
      let runs = 0;
      for (let i = 0; i < open.length; i++) if (open[i] && !open[(i + open.length - 1) % open.length]) runs++;
      if (runs === 1 || (runs === 0 && open[0])) return true;
      if (runs === 0) return false;
      // several open stretches: a plug only if they do not join up again just outside
      return this.onePiece(tx, ty, s);
    }
    // the open ground round a footprint, searched a few tiles out (but not through it), is one
    // piece; dead-end pockets that lead nowhere do not count, unless they are large or hold
    // diamonds that would be walled off
    onePiece(tx, ty, s) {
      const m = this.g.map, R = 5;
      const inF = (x, y) => x >= tx && x < tx + s && y >= ty && y < ty + s;
      const pass = (j) => (AC.PASS[m.terrain[j]] & 1) !== 0;
      const seen = new Set();
      let pieces = 0;
      for (let y = ty - 1; y <= ty + s; y++)
        for (let x = tx - 1; x <= tx + s; x++) {
          const i0 = y * m.w + x;
          if (inF(x, y) || !m.inb(x, y) || seen.has(i0) || !pass(i0)) continue;
          let n = 0, out = false, res = false;
          const q = [i0];
          seen.add(i0);
          while (q.length) {
            const i = q.pop(), cx = i % m.w, cy = (i / m.w) | 0;
            n++;
            if (m.occ[i]) { const e = this.g.get(m.occ[i]); if (e && e.kind === 'resource') res = true; }
            for (let k = 0; k < 4; k++) {
              const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0), j = ny * m.w + nx;
              if (!m.inb(nx, ny) || inF(nx, ny) || seen.has(j) || !pass(j)) continue;
              if (nx < tx - R || nx >= tx + s + R || ny < ty - R || ny >= ty + s + R) { out = true; continue; }
              seen.add(j); q.push(j);
            }
          }
          if (out || res || n >= 30) pieces++;
        }
      return pieces === 1;
    }
    findExpansion(id) {
      const g = this.g;
      const def = AC.BUILDINGS[id];
      // cluster resources
      const clusters = [];
      for (const r of g.resources) {
        if (r.dead || r.amount < 200) continue;
        let c = clusters.find((c) => U.dist2(c.x, c.y, r.x, r.y) < (6 * T) ** 2);
        if (!c) { c = { x: r.x, y: r.y, n: 0, sx: 0, sy: 0, amt: 0 }; clusters.push(c); }
        c.n++; c.sx += r.x; c.sy += r.y; c.amt += r.amount;
        c.x = c.sx / c.n; c.y = c.sy / c.n;
      }
      const h = this.mainHq;
      let best = null, bd = 1e18;
      for (const c of clusters) {
        if (c.n < 3) continue;
        // skip clusters that already have a dropoff near
        if (g.buildings.some((b) => !b.dead && b.def.dropoff && U.dist2(b.x, b.y, c.x, c.y) < (10 * T) ** 2)) continue;
        // skip clusters with enemy buildings near
        if (g.buildings.some((b) => !b.dead && g.areEnemies(this.pid, b.owner) && U.dist2(b.x, b.y, c.x, c.y) < (14 * T) ** 2)) continue;
        const d = U.dist2(c.x, c.y, h.x, h.y);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return null;
      // HQ spot: offset from cluster toward the map centre
      const a = Math.atan2(g.worldH / 2 - best.y, g.worldW / 2 - best.x);
      const cx = Math.floor((best.x + Math.cos(a) * 5 * T) / T), cy = Math.floor((best.y + Math.sin(a) * 5 * T) / T);
      const sp = U.spiral(6);
      for (const [ox, oy] of sp) {
        const tx = cx + ox - 1, ty = cy + oy - 1;
        if (g.canPlace(this.pid, id, tx, ty).ok) return [tx, ty];
      }
      return null;
    }

    // ------------------------------------------------------------ research & production
    research() {
      const g = this.g, p = this.p;
      if (g.time < 240) return;
      if (p.res.d < 350 || p.res.p < 150) return;
      for (const id of RESEARCH[p.faction]) {
        if (p.upgrades[id] || p.researching[id]) continue;
        const b = this.blds.find((b) => b.built && !b.research && b.def.researches && b.def.researches.indexOf(id) >= 0);
        if (!b) continue;
        if (this.cmd({ type: 'research', ids: [b.id], up: id })) return;
      }
    }
    production() {
      const g = this.g, p = this.p;
      const reserve = this.reserve || { d: 0, p: 0 };
      const mix = this.opts.mix || MIX[p.faction];
      // current composition
      const have = {};
      for (const u of this.army) have[u.def.id] = (have[u.def.id] || 0) + 1;
      let total = 0;
      for (const k in mix) total += mix[k];
      for (const b of this.blds) {
        if (!b.built || !b.def.trains || b.def.hq) continue;
        if (b.trainQ.length >= 2) continue;
        const opts = g.trainsOf(b).filter((id) => mix[id] && g.meetsReq(this.pid, AC.UNITS[id]));
        if (!opts.length) continue;
        // most under-represented first, falling back to whatever is affordable
        const armyN = Math.max(1, this.army.length);
        const ranked = opts.filter((id) => (have[id] || 0) < 2 || (have[id] || 0) / armyN <= (mix[id] / total) * 1.4 + 0.02).map((id) => {
          const want = mix[id] / total;
          const cur = (have[id] || 0) / armyN;
          return [id, want - cur + this.rng() * 0.08];
        }).sort((a, b) => b[1] - a[1]);
        let pick = null;
        for (const [id] of ranked) {
          const d = AC.UNITS[id];
          if (p.supplyUsed + d.supply > p.supplyCap - (this.heroRoom || 0)) continue;
          if (!g.canAfford(p, d.cost)) continue;
          if ((p.res.d - d.cost.d < reserve.d || p.res.p - d.cost.p < reserve.p) && p.res.d < reserve.d + d.cost.d + 150) continue;
          pick = id;
          break;
        }
        if (!pick) continue;
        this.cmd({ type: 'train', ids: [b.id], def: pick });
        have[pick] = (have[pick] || 0) + 1;
        if (b.rally == null && this.rally) b.rally = { x: this.rally.x, y: this.rally.y };
      }
    }
    heroes() {
      const g = this.g, p = this.p;
      this.heroRoom = 0;
      if (this.opts.noHeroes) return;
      const hall = this.blds.find((b) => b.built && b.def.heroes);
      if (!hall || hall.trainQ.length) return;
      const want = g.time > 900 ? 3 : g.time > 480 ? 2 : 1;
      g.recomputeSupply();
      if ((p.heroCount || 0) >= AC.MAX_HEROES) return;
      const ok = (id) => hall.def.heroes.indexOf(id) >= 0 && !(g.bannedHeroes && g.bannedHeroes.has(id)) &&
        g.heroStatus(this.pid, id) !== 'alive' && g.heroStatus(this.pid, id) !== 'queued';
      // revive the fallen first
      const dead = Object.keys(p.deadHeroes).filter(ok);
      const list = dead.length ? dead : this.heroPrefs.filter(ok);
      if (!list.length) return;
      const nextHero = AC.UNITS[list[0]];
      // keep supply free for the next hero, so a full army cannot lock heroes out
      const due = (p.heroCount || 0) < want;
      if (due || p.supplyCap >= AC.MAX_SUPPLY) this.heroRoom = nextHero.supply || 0;
      if (!due) return;
      // hold back resources for the hero
      if (!g.canAfford(p, g.trainCost(this.pid, list[0]).cost)) this.reserve = { d: Math.max(this.reserve ? this.reserve.d : 0, nextHero.cost.d * 0.5), p: nextHero.cost.p };
      for (const id of list) {
        const tc = g.trainCost(this.pid, id);
        if (!g.canAfford(p, tc.cost)) return;
        this.cmd({ type: 'train', ids: [hall.id], def: id });
        if (this.rally) hall.rally = { x: this.rally.x, y: this.rally.y };
        return;
      }
    }

    // ------------------------------------------------------------ military
    threats() {
      const g = this.g;
      let tx = 0, ty = 0, n = 0, sup = 0;
      for (const e of g.units) {
        if (e.dead || !g.areEnemies(this.pid, e.owner) || g.players[e.owner].isNeutral) continue;
        if (g.isStealthed(e) && !g.visibleTo(this.pid, e)) continue;
        for (const b of this.blds) {
          if (U.dist2(e.x, e.y, b.x, b.y) < (13 * T) ** 2) { tx += e.x; ty += e.y; n++; sup += e.def.supply || 1; break; }
        }
      }
      return n ? { x: tx / n, y: ty / n, n, sup } : null;
    }
    enemyTarget() {
      const g = this.g;
      if (this.opts.attackTarget) {
        const t = this.opts.attackTarget(g, this);
        if (t) return t;
      }
      let best = null, bd = 1e18;
      const h = this.mainHq || { x: g.worldW / 2, y: g.worldH / 2 };
      for (const b of g.buildings) {
        if (b.dead || !g.areEnemies(this.pid, b.owner) || g.players[b.owner].isNeutral) continue;
        let d = U.dist2(b.x, b.y, h.x, h.y);
        if (b.def.attack) d *= 1.2;
        if (d < bd) { bd = d; best = b; }
      }
      if (!best) {
        for (const u of g.units) {
          if (u.dead || !g.areEnemies(this.pid, u.owner) || g.players[u.owner].isNeutral) continue;
          const d = U.dist2(u.x, u.y, h.x, h.y);
          if (d < bd) { bd = d; best = u; }
        }
      }
      return best ? { x: best.x, y: best.y, id: best.id } : null;
    }
    creepTarget() {
      const g = this.g;
      const h = this.mainHq;
      if (!h) return null;
      let best = null, bd = (36 * T) ** 2;
      for (const u of g.units) {
        if (u.dead || !g.players[u.owner] || !g.players[u.owner].isNeutral) continue;
        if (u.def.boss && this.armySupply < 30) continue;
        const d = U.dist2(u.x, u.y, h.x, h.y);
        if (d < bd) { bd = d; best = u; }
      }
      return best;
    }
    military() {
      const g = this.g;
      const fighters = this.army.filter((u) => !this.siteSquad.has(u.id) && !(u.order && u.order.retreat));
      // site capture squad
      this.manageSites();
      const threat = this.threats();
      if (threat && (threat.sup >= 2 || this.state !== 'attack')) {
        if (this.state !== 'defend') this.prevState = this.state;
        this.state = 'defend';
        const def = fighters.filter((u) => !u.order || u.order.type !== 'attack' || (u.order.auto));
        // in attack mode far away, only send back if base is really threatened
        const near = def.filter((u) => this.prevState !== 'attack' || threat.sup > 8 || U.dist2(u.x, u.y, threat.x, threat.y) < (30 * T) ** 2);
        if (near.length && g.time - (this.lastDefendCmd || 0) > 2) {
          this.lastDefendCmd = g.time;
          this.cmd({ type: 'attackMove', ids: near.map((u) => u.id), x: threat.x, y: threat.y });
        }
        // a stronghold's garrison never joins the waves, but it does answer an attack on the base
        const guards = this.garrison.filter((u) => !u.order || u.order.type !== 'attack' || u.order.auto);
        if (guards.length && g.time - (this.lastGuardCmd || 0) > 2) {
          this.lastGuardCmd = g.time;
          this.cmd({ type: 'attackMove', ids: guards.map((u) => u.id), x: threat.x, y: threat.y });
        }
        // workers fight back against small raids if no army
        if (!fighters.length && !this.garrison.length && threat.n <= 3) {
          const ws = this.workers.filter((w) => U.dist2(w.x, w.y, threat.x, threat.y) < (8 * T) ** 2).slice(0, 6);
          if (ws.length) this.cmd({ type: 'attackMove', ids: ws.map((w) => w.id), x: threat.x, y: threat.y });
          this.workerDefense = true;
        }
        return;
      }
      // the garrison walks back to its posts once the attack is over
      for (const u of this.garrison) {
        if ((!u.order || u.order.type === 'attackMove') && Math.hypot(u.x - u.homeX, u.y - u.homeY) > 3 * T) AC.issue(g, u, { type: 'move', x: u.homeX, y: u.homeY }, false);
      }
      if (this.workerDefense) {
        this.workerDefense = false;
        for (const w of this.workers) if (w.order && w.order.type === 'attackMove') { w.order = null; }
      }
      if (this.state === 'defend') { this.state = this.prevState === 'attack' ? 'attack' : 'build'; this.regroup(fighters); }

      if (this.state === 'build') {
        // early creeping with the first heroes
        if (g.time > this.creepT && this.armySupply >= 8 && !this.opts.noCreep) {
          const c = this.creepTarget();
          if (c && g.time - (this.lastCreepCmd || 0) > 6) {
            this.lastCreepCmd = g.time;
            this.creepT = g.time + 40;
            this.cmd({ type: 'attackMove', ids: fighters.map((u) => u.id), x: c.x, y: c.y, creeps: true });
            return;
          }
        }
        if (g.time - (this.lastRegroup || 0) > 10) { this.lastRegroup = g.time; this.regroup(fighters, true); }
        // the wave sets out at its planned size, or at the largest army the supply cap still
        // allows beside the workers and a stronghold's garrison
        const held = this.my.reduce((a, u) => a + (u.def.role === 'worker' || u.garrison ? u.def.supply || 0 : 0), 0);
        const room = AC.MAX_SUPPLY - held - (this.heroRoom || 0);
        if (g.time >= this.nextWaveT && this.armySupply >= Math.min(this.waveSize, room - 4)) {
          this.state = 'attack';
          this.waveN++;
          this.waveStart = this.armySupply;
          this.attackTarget = this.enemyTarget();
          this.lastReissue = 0;
          g.emit({ type: 'aiAttack', player: this.pid, wave: this.waveN });
        }
      }
      if (this.state === 'attack') {
        if (this.armySupply < Math.max(6, this.waveStart * 0.3)) {
          // retreat
          this.state = 'build';
          this.waveSize = Math.min(70, this.waveSize + this.d.waveInc);
          this.nextWaveT = g.time + 40;
          this.regroup(fighters);
          return;
        }
        const t = this.attackTarget && g.get(this.attackTarget.id);
        if (!t || t.dead) { this.attackTarget = this.enemyTarget(); this.lastReissue = 0; }
        if (!this.attackTarget) { this.state = 'build'; return; }
        if (g.time - this.lastReissue > 6) {
          this.lastReissue = g.time;
          const idle = fighters.filter((u) => !u.order || (u.order.type === 'move') || (u.order.type === 'attackMove' && Math.hypot(u.order.x - this.attackTarget.x, u.order.y - this.attackTarget.y) > 4 * T));
          if (idle.length) this.cmd({ type: 'attackMove', ids: idle.map((u) => u.id), x: this.attackTarget.x, y: this.attackTarget.y });
        }
      }
    }
    regroup(units, onlyIdle) {
      if (!this.rally) return;
      const list = units.filter((u) => !onlyIdle || !u.order || (u.order.type === 'move' && Math.hypot(u.order.x - this.rally.x, u.order.y - this.rally.y) > 6 * T));
      const far = list.filter((u) => Math.hypot(u.x - this.rally.x, u.y - this.rally.y) > 5 * T);
      if (far.length) this.cmd({ type: 'move', ids: far.map((u) => u.id), x: this.rally.x, y: this.rally.y });
    }
    manageSites() {
      const g = this.g;
      for (const id of [...this.siteSquad]) { const u = g.get(id); if (!u || u.dead) this.siteSquad.delete(id); }
      if (g.time < 90 || this.opts.noSites) return;
      // pick nearest site not ours
      const h = this.mainHq;
      if (!h) return;
      let best = null, bd = 1e18;
      for (const s of g.sites) {
        if (s.noCapture) continue;
        if (s.capOwner === this.pid || (s.capOwner >= 0 && g.areAllies(this.pid, s.capOwner))) continue;
        const d = U.dist2(s.x, s.y, h.x, h.y);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) {
        // return squad to army
        this.siteSquad.clear();
        return;
      }
      // guarded by creeps? skip unless strong
      const guarded = g.units.some((u) => !u.dead && g.players[u.owner] && g.players[u.owner].isNeutral && U.dist2(u.x, u.y, best.x, best.y) < (7 * T) ** 2);
      if (guarded && this.state === 'build') return;
      if (this.siteSquad.size < 2) {
        const cands = this.army.filter((u) => !this.siteSquad.has(u.id) && !u.def.hero && !u.def.air && (!u.order || u.order.type === 'move'));
        cands.sort((a, b) => (a.def.cost.d - b.def.cost.d));
        for (const u of cands) { if (this.siteSquad.size >= 2) break; this.siteSquad.add(u.id); }
      }
      const ids = [...this.siteSquad].filter((id) => { const u = g.get(id); return u && (!u.order || u.order.type === 'move') && Math.hypot(u.x - best.x, u.y - best.y) > 2 * T; });
      if (ids.length) this.cmd({ type: 'attackMove', ids, x: best.x, y: best.y });
    }

    // ------------------------------------------------------------ abilities
    micro() {
      const g = this.g;
      const A = AC.Abilities;
      const casters = (this.my || g.units.filter((u) => !u.dead && u.owner === this.pid)).filter((u) => u.def.abilities && !u.dead);
      for (const h of casters) {
        const casting = h.channel || (h.order && h.order.type === 'cast');
        const hpF = h.hp / h.maxHp;
        // healed on the way home: rejoin the army
        if (h.order && h.order.retreat && hpF > 0.5) h.order.retreat = false;
        // a nearly dead hero walks home, abandoning an approach to a cast; one already
        // channelling (or recalling) is left to finish
        if (h.def.hero && hpF < 0.22 && this.mainHq && !h.channel && !(casting && AC.ABILITIES[h.order.ab] && AC.ABILITIES[h.order.ab].ai === 'retreat')) {
          const foes = A.enemiesIn(g, h, h.x, h.y, 10 * T, { visible: true }).filter((u) => !g.players[u.owner].isNeutral || u.order && u.order.target === h.id);
          const far = Math.hypot(this.mainHq.x - h.x, this.mainHq.y - h.y);
          if (foes.length && far > 6 * T) {
            const recall = h.def.abilities.find((a) => AC.ABILITIES[a].ai === 'retreat');
            if (recall && far > 15 * T && A.canCast(g, h, recall).ok) { this.cmd({ type: 'cast', ids: [h.id], ab: recall }); continue; }
            if (!(h.order && h.order.retreat)) {
              this.cmd({ type: 'move', ids: [h.id], x: this.mainHq.x, y: this.mainHq.y + 3 * T });
              if (h.order && h.order.type === 'move') h.order.retreat = true;
            }
            continue;
          }
        }
        if (casting) continue;
        if (Math.random() > this.d.abil) continue;
        const enemies = A.enemiesIn(g, h, h.x, h.y, 10 * T, { visible: true }).filter((u) => !g.players[u.owner].isNeutral || (h.order && h.order.type === 'attack'));
        for (const abId of h.def.abilities) {
          const ab = AC.ABILITIES[abId];
          if (!A.canCast(g, h, abId).ok) continue;
          const c = this.decide(h, ab, enemies, hpF);
          if (c) { this.cmd(Object.assign({ type: 'cast', ids: [h.id], ab: abId }, c)); break; }
        }
      }
    }
    decide(h, ab, enemies, hpF) {
      const g = this.g;
      if (!this.mainHq) this.mainHq = g.hq(this.pid);
      const A = AC.Abilities;
      const near = (r) => enemies.filter((u) => Math.hypot(u.x - h.x, u.y - h.y) < r);
      switch (ab.ai) {
        case 'aoe': {
          const n = near(ab.radius || 4 * T);
          if (ab.id === 'pattern_image') {
            let road = 0;
            const tx = Math.floor(h.x / T), ty = Math.floor(h.y / T);
            for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (g.map.isRoad(tx + x, ty + y)) road++;
            const chaos = n.filter((u) => u.def.faction === 'chaos' || g.players[u.owner].faction === 'chaos').length;
            if (chaos >= 3 || road > 25) return {};
            return null;
          }
          if (n.length >= 3 || n.some((u) => u.def.hero)) return {};
          return null;
        }
        case 'aoePoint': {
          const inR = enemies.filter((u) => Math.hypot(u.x - h.x, u.y - h.y) < (ab.range || 8 * T) + 2 * T);
          let best = null, bn = 0;
          for (const u of inR) {
            let n = 0;
            for (const v of inR) if (Math.hypot(v.x - u.x, v.y - u.y) < ab.radius) n += v.def.hero ? 3 : 1;
            if (n > bn) { bn = n; best = u; }
          }
          if (best && bn >= 3) return { x: best.x, y: best.y };
          if (ab.id === 'chaos_wave' || ab.id === 'jewel_storm') {
            // also strike buildings during an assault
            const b = g.buildings.find((b) => !b.dead && g.areEnemies(h.owner, b.owner) && g.visibleTo(h.owner, b) && Math.hypot(b.x - h.x, b.y - h.y) < ab.range && b.def.attack);
            if (b && hpF > 0.5) return { x: b.x, y: b.y };
          }
          return null;
        }
        case 'target': {
          const inR = enemies.filter((u) => A.validTarget(g, h, ab, u) && AC.Behavior.gap(g, h, u) < (ab.range || 3 * T) + 3 * T);
          if (!inR.length) return null;
          inR.sort((a, b) => (b.def.hero ? 1000 : 0) + b.def.dmg * (b.def.supply || 1) - ((a.def.hero ? 1000 : 0) + a.def.dmg * (a.def.supply || 1)));
          return { target: inR[0].id };
        }
        case 'possess': {
          const inR = enemies.filter((u) => A.validTarget(g, h, ab, u) && Math.hypot(u.x - h.x, u.y - h.y) < ab.range + 2 * T);
          if (!inR.length) return null;
          inR.sort((a, b) => b.def.cost.d + b.def.cost.p - (a.def.cost.d + a.def.cost.p));
          if (inR[0].def.role === 'worker' && inR.length === 1) return null;
          return { target: inR[0].id };
        }
        case 'buff':
          if (near(6 * T).length >= 3) return {};
          return null;
        case 'engage':
          if (near(4 * T).length >= 2 || near(4 * T).some((u) => u.def.hero)) return {};
          return null;
        case 'summon':
          if (near(7 * T).length >= 2) return {};
          return null;
        case 'escape':
          if (hpF < 0.35 && near(6 * T).length) return {};
          return null;
        case 'retreat':
          if (hpF < 0.25 && near(6 * T).length && this.mainHq && Math.hypot(this.mainHq.x - h.x, this.mainHq.y - h.y) > 15 * T) return {};
          return null;
        case 'heal': {
          const al = A.alliesIn(g, h, h.x, h.y, ab.radius);
          let miss = 0;
          for (const u of al) miss += u.maxHp - u.hp;
          if (miss > 500) return {};
          return null;
        }
        case 'blink': {
          if (hpF < 0.3 && near(5 * T).length && this.mainHq) {
            const a = Math.atan2(this.mainHq.y - h.y, this.mainHq.x - h.x);
            return { x: h.x + Math.cos(a) * (ab.range - 10), y: h.y + Math.sin(a) * (ab.range - 10) };
          }
          if (ab.id === 'logrus_blink' && hpF > 0.6) {
            const t = enemies.find((u) => (u.def.hero || u.def.role === 'caster' || u.def.role === 'siege') && Math.hypot(u.x - h.x, u.y - h.y) < ab.range);
            if (t) return { x: t.x, y: t.y };
          }
          return null;
        }
        case 'reinforce': {
          const hq = this.mainHq;
          if (!hq || Math.hypot(hq.x - h.x, hq.y - h.y) < 20 * T || near(8 * T).length < 4) return null;
          const home = this.army.filter((u) => !u.def.hero && Math.hypot(u.x - hq.x, u.y - hq.y) < 14 * T);
          if (home.length >= 4) return {};
          return null;
        }
      }
      return null;
    }
    powers() {
      const g = this.g, p = this.p;
      for (const b of this.blds) {
        if (!b.built || !b.def.powers) continue;
        for (const pw of b.def.powers) {
          if (!AC.Abilities.canPower(g, this.pid, pw).ok) continue;
          if (pw === 'unicorn_blessing') {
            let miss = 0;
            for (const u of this.army) miss += (u.maxHp - u.hp);
            if (miss > 2500) this.cmd({ type: 'power', ids: [b.id], power: pw });
          } else if (pw === 'logrus_surge') {
            if (this.state === 'attack' || this.state === 'defend') {
              const fighting = this.army.filter((u) => u.order && u.order.type === 'attack').length;
              if (fighting >= 8) this.cmd({ type: 'power', ids: [b.id], power: pw });
            }
          }
        }
      }
    }
  }
  AC.AI = AI;
  AC.AI_PLANS = PLANS;
})();
