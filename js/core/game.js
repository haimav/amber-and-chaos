// Amber and Chaos — game state, players, entities, systems and commands.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;

  let NEXT_ID = 1;

  class Player {
    constructor(id, o) {
      this.id = id;
      this.name = o.name || 'Player ' + (id + 1);
      this.faction = o.faction || 'amber';
      this.team = o.team != null ? o.team : id;
      this.color = o.color || AC.PLAYER_COLORS[id % AC.PLAYER_COLORS.length];
      this.isAI = !!o.isAI;
      this.isNeutral = !!o.isNeutral;
      this.difficulty = o.difficulty || 'normal';
      this.res = { d: o.startD != null ? o.startD : 400, p: o.startP != null ? o.startP : 100 };
      this.gatherMult = o.gatherMult || 1;
      this.supplyUsed = 0;
      this.supplyCap = 0;
      this.upgrades = {};
      this.researching = {};
      this.alive = true;
      this.stats = { trained: 0, lost: 0, kills: 0, built: 0, bLost: 0, gathered: 0, power: 0, razed: 0 };
      this.sharedCd = {};
      this.powerCd = {};
      this.deadHeroes = {};
      this.ghosts = new Map();
      this.lastAttackAlert = -99;
      this.lastSupplyAlert = -99;
      this.vis = null; this.explored = null; this.detect = null;
      this.startTile = null;
    }
    get F() { return AC.FACTIONS[this.faction] || AC.FACTIONS.amber; }
  }
  AC.Player = Player;

  class Entity {
    constructor(def, owner) {
      this.id = NEXT_ID++;
      this.def = def;
      this.kind = def.kind;
      this.owner = owner;
      this.x = 0; this.y = 0; this.prevX = 0; this.prevY = 0;
      this.radius = def.radius || 10;
      this.maxHp = def.hp || 1; this.hp = this.maxHp;
      this.maxMana = def.mana || 0; this.mana = this.maxMana ? this.maxMana * 0.5 : 0;
      this.angle = Math.PI / 2;
      this.dead = false;
      this.order = null; this.queue = [];
      this.path = null; this.pathI = 0; this.pathGoalX = 0; this.pathGoalY = 0;
      this.atkCd = 0;
      this.targetId = 0;
      this.buffs = [];
      this.cds = {};
      this.level = 1; this.xp = 0;
      this.carry = 0;
      this.lastHitT = -99;
      this.lastAtkT = -99;
      this.anim = 0;      // animation phase
      this.atkAnim = 0;   // attack swing timer
      this.moving = false;
      this.stuckT = 0; this.repaths = 0;
      this.mods = { dmg: 1, atkSpeed: 1, speed: 1, armor: 0, dmgTaken: 1, regen: 0, stunned: false, rooted: false, riposte: false, lifesteal: 0, range: 0, manaRegen: 1 };
      this.summonT = 0;
    }
    get isUnit() { return this.kind === 'unit'; }
    get isBuilding() { return this.kind === 'building'; }
  }
  AC.Entity = Entity;

  class Game {
    constructor(opts) {
      this.opts = opts || {};
      this.time = 0;
      this.tickN = 0;
      this.headless = !!this.opts.headless;
      this.players = [];
      this.entities = new Map();
      this.units = [];
      this.buildings = [];
      this.resources = [];
      this.sites = [];
      this.projectiles = [];
      this.zones = [];
      this.events = [];
      this.fxq = [];
      this.over = false;
      this.winnerTeam = null;
      this.localPlayer = 0;
      this.scenario = null;
      this.ais = [];
      this.covDirty = true;
      this.fog = this.opts.fog !== false;
      this.rng = U.rng((this.opts.seed || 1) * 7 + 3);
      this.neutralId = -1;
      this._q = [];
      this.objectives = [];
      this.messages = [];
    }

    // ------------------------------------------------------------ setup
    setMap(map) {
      this.map = map;
      this.pf = new AC.PathFinder(map);
      this.worldW = map.w * T; this.worldH = map.h * T;
      this.hash = new AC.SpatialHash(this.worldW, this.worldH, 64);
      this.bhash = new AC.SpatialHash(this.worldW, this.worldH, 128);
      for (const p of this.players) this.initVision(p);
    }
    addPlayer(o) {
      const p = new Player(this.players.length, o);
      this.players.push(p);
      if (p.isNeutral) this.neutralId = p.id;
      if (this.map) this.initVision(p);
      return p;
    }
    initVision(p) {
      const n = this.map.w * this.map.h;
      p.vis = new Uint8Array(n);
      p.explored = new Uint8Array(n);
      p.detect = new Uint8Array(n);
    }
    get(id) { return this.entities.get(id); }
    player(id) { return this.players[id]; }

    areEnemies(a, b) {
      if (a === b) return false;
      if (a < 0 || b < 0) return false; // resources / sites
      const pa = this.players[a], pb = this.players[b];
      if (!pa || !pb) return false;
      if (pa.isNeutral || pb.isNeutral) return true;
      return pa.team !== pb.team;
    }
    areAllies(a, b) {
      if (a === b) return true;
      const pa = this.players[a], pb = this.players[b];
      if (!pa || !pb || pa.isNeutral || pb.isNeutral) return false;
      return pa.team === pb.team;
    }

    spawnUnit(defId, owner, x, y, opts) {
      const def = AC.UNITS[defId];
      if (!def) throw new Error('Unknown unit ' + defId);
      const e = new Entity(def, owner);
      e.x = e.prevX = x; e.y = e.prevY = y;
      e.angle = this.rng() * Math.PI * 2;
      e.homeX = x; e.homeY = y;
      if (def.hero) {
        const dh = this.players[owner] && this.players[owner].deadHeroes[defId];
        if (dh) { e.level = dh.level; e.xp = dh.xp; delete this.players[owner].deadHeroes[defId]; }
        this.applyLevel(e);
        e.mana = e.maxMana;
      }
      if (def.mana) e.mana = def.hero || (def.abilities && def.abilities.length) ? e.maxMana : def.mana * 0.6;
      if (opts && opts.summonT) e.summonT = opts.summonT;
      this.entities.set(e.id, e);
      this.units.push(e);
      if (owner >= 0 && this.players[owner]) this.players[owner].supplyUsed += 0; // supply accounted at queue time
      if (!def.air) {
        // nudge onto passable ground
        const tx = Math.floor(x / T), ty = Math.floor(y / T);
        if (!this.map.passable(tx, ty, this.moveBits(e))) {
          const np = this.pf.nearestPassable(tx, ty, this.moveBits(e), 10);
          if (np) { e.x = e.prevX = np[0] * T + T / 2; e.y = e.prevY = np[1] * T + T / 2; }
        }
      }
      return e;
    }
    applyLevel(e) {
      const lv = e.level - 1;
      const hpFrac = e.hp / e.maxHp;
      e.maxHp = Math.round(e.def.hp * (1 + 0.09 * lv));
      e.hp = Math.max(1, e.maxHp * (isFinite(hpFrac) ? hpFrac : 1));
      e.maxMana = Math.round((e.def.mana || 0) * (1 + 0.06 * lv));
      e.lvlDmg = 1 + 0.08 * lv;
    }
    spawnBuilding(defId, owner, tx, ty, built) {
      const def = AC.BUILDINGS[defId];
      if (!def) throw new Error('Unknown building ' + defId);
      const e = new Entity(def, owner);
      e.tx = tx; e.ty = ty; e.size = def.size;
      e.x = e.prevX = (tx + def.size / 2) * T;
      e.y = e.prevY = (ty + def.size / 2) * T;
      e.radius = def.size * T * 0.5;
      e.built = !!built;
      e.progress = built ? 1 : 0;
      e.hp = built ? e.maxHp : Math.max(1, e.maxHp * 0.1);
      e.trainQ = [];
      e.research = null;
      e.rally = null;
      e.builders = 0;
      e.atkCd = 0;
      this.entities.set(e.id, e);
      this.buildings.push(e);
      for (let y = ty; y < ty + def.size; y++)
        for (let x = tx; x < tx + def.size; x++) if (this.map.inb(x, y)) this.map.occ[y * this.map.w + x] = e.id;
      if (built) this.onBuildingComplete(e, true);
      this.covDirty = true;
      // instantly lay road under chaos footprint
      if (def.spread || def.faction === 'chaos') {
        for (let y = ty - 1; y <= ty + def.size; y++) for (let x = tx - 1; x <= tx + def.size; x++) this.map.setRoad(x, y, 1);
        if (built && def.hq) {
          const r = def.spread || 4;
          const cx = tx + def.size / 2, cy = ty + def.size / 2;
          for (let y = Math.floor(cy - r); y <= cy + r; y++)
            for (let x = Math.floor(cx - r); x <= cx + r; x++)
              if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.map.setRoad(x, y, 1);
        }
      }
      this.pushOutUnits(e);
      return e;
    }
    spawnResource(tx, ty, amount) {
      const def = { id: 'diamonds', name: 'Diamond-strewn Sand', kind: 'resource', hp: 1, radius: 14 };
      const e = new Entity(def, -1);
      e.tx = tx; e.ty = ty;
      e.x = e.prevX = tx * T + T / 2; e.y = e.prevY = ty * T + T / 2;
      e.amount = amount; e.maxAmount = amount;
      e.miner = 0;
      this.entities.set(e.id, e);
      this.resources.push(e);
      this.map.occ[ty * this.map.w + tx] = e.id;
      return e;
    }
    spawnSite(tx, ty, name) {
      const def = { id: 'site', name: name || 'Broken Pattern', kind: 'site', hp: 1, radius: 40 };
      const e = new Entity(def, -1);
      e.tx = tx; e.ty = ty;
      e.x = e.prevX = tx * T + T / 2; e.y = e.prevY = ty * T + T / 2;
      e.capOwner = -1; e.capProgress = 0; e.capBy = -1;
      this.entities.set(e.id, e);
      this.sites.push(e);
      return e;
    }
    pushOutUnits(b) {
      for (const u of this.units) {
        if (u.dead || u.def.air) continue;
        const tx = Math.floor(u.x / T), ty = Math.floor(u.y / T);
        if (tx >= b.tx && ty >= b.ty && tx < b.tx + b.size && ty < b.ty + b.size) {
          const bits = this.moveBits(u);
          let np = this.pf.nearestPassable(tx, ty, bits, 8);
          // never into a pocket the new building has just sealed
          if (np && !AC.Behavior.leadsOut(this, b, np[0], np[1], bits)) np = AC.Behavior.exitTile(this, b, u.x, u.y, bits, false) || np;
          if (np) { u.x = u.prevX = np[0] * T + T / 2; u.y = u.prevY = np[1] * T + T / 2; }
        }
      }
    }

    moveBits(e) {
      const m = e.def.move;
      if (m === 'air') return 4;
      if (m === 'woods') return 1 | 2;
      return 1;
    }

    // ------------------------------------------------------------ events/fx
    emit(ev) {
      if (this.events.length > 400) this.events.shift();
      this.events.push(ev);
    }
    fx(type, data) {
      if (this.headless) return;
      if (this.fxq.length > 1500) this.fxq.shift();
      data.type = type;
      this.fxq.push(data);
    }
    sfx(name, x, y) {
      if (this.headless) return;
      this.fx('sfx', { name, x, y });
    }
    message(text, opts) {
      this.emit(Object.assign({ type: 'message', text }, opts || {}));
    }

    // ------------------------------------------------------------ supply / costs
    recomputeSupply() {
      for (const p of this.players) { p.supplyCap = 0; p.supplyUsed = 0; p.heroCount = 0; }
      for (const b of this.buildings) {
        if (b.dead) continue;
        const p = this.players[b.owner];
        if (!p) continue;
        if (b.built && b.def.supply) p.supplyCap += b.def.supply;
        for (const q of b.trainQ) {
          const d = AC.UNITS[q.id];
          p.supplyUsed += d.supply;
          if (d.hero) p.heroCount++;
        }
      }
      for (const u of this.units) {
        if (u.dead) continue;
        const p = this.players[u.owner];
        if (!p) continue;
        p.supplyUsed += u.def.supply || 0;
        if (u.def.hero) p.heroCount++;
      }
      for (const p of this.players) p.supplyCap = Math.min(AC.MAX_SUPPLY, p.supplyCap + (p.supplyBonus || 0));
    }
    canAfford(p, cost) { return p.res.d >= (cost.d || 0) && p.res.p >= (cost.p || 0); }
    pay(p, cost) { p.res.d -= cost.d || 0; p.res.p -= cost.p || 0; }
    refund(p, cost, frac) { p.res.d += (cost.d || 0) * (frac || 1); p.res.p += (cost.p || 0) * (frac || 1); }
    trainsOf(b) {
      return (this.trainOverride && this.trainOverride[b.def.id]) || b.def.trains || [];
    }
    canBuildType(id) {
      return !this.allowedBuilds || this.allowedBuilds.has(id);
    }
    hasBuilding(pid, id, builtOnly) {
      for (const b of this.buildings) if (!b.dead && b.owner === pid && b.def.id === id && (!builtOnly || b.built)) return true;
      return false;
    }
    meetsReq(pid, def) {
      if (!def.requires) return true;
      for (const r of def.requires) if (!this.hasBuilding(pid, r, true)) return false;
      return true;
    }
    missingReq(pid, def) {
      if (!def.requires) return [];
      return def.requires.filter((r) => !this.hasBuilding(pid, r, true)).map((r) => AC.BUILDINGS[r].name);
    }

    // ------------------------------------------------------------ placement
    canPlace(pid, defId, tx, ty, ignoreUnitId) {
      const def = AC.BUILDINGS[defId];
      const m = this.map;
      const p = this.players[pid];
      const s = def.size;
      if (tx < 1 || ty < 1 || tx + s > m.w - 1 || ty + s > m.h - 1) return { ok: false, why: 'Too close to the edge of the world.' };
      const chaos = def.faction === 'chaos';
      let roadTiles = 0;
      for (let y = ty; y < ty + s; y++)
        for (let x = tx; x < tx + s; x++) {
          const i = y * m.w + x;
          if (!(AC.PASS[m.terrain[i]] & 1)) return { ok: false, why: 'The ground there cannot bear a building.' };
          if (m.occ[i]) return { ok: false, why: 'Something is already there.' };
          if (m.road[i]) roadTiles++;
        }
      if (chaos && !def.anywhere && roadTiles < s * s) return { ok: false, why: 'The works of Chaos must stand upon the Black Road.' };
      // keep clear of resources (they occupy tiles, so scan the surrounding rectangle)
      const clr = def.hq ? 3 : 1;
      for (let y = ty - clr; y < ty + s + clr; y++)
        for (let x = tx - clr; x < tx + s + clr; x++) {
          if (!m.inb(x, y)) continue;
          const o = m.occ[y * m.w + x];
          if (o) { const e = this.entities.get(o); if (e && e.kind === 'resource') return { ok: false, why: 'Too close to the diamond sands.' }; }
        }
      for (const st of this.sites) {
        if (Math.abs(st.tx - (tx + s / 2)) < 2 + s / 2 && Math.abs(st.ty - (ty + s / 2)) < 2 + s / 2) return { ok: false, why: 'A Broken Pattern cannot be built over.' };
      }
      // must be in explored territory for the player
      if (p && p.explored && this.fog) {
        let seen = 0;
        for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) if (p.explored[y * m.w + x]) seen++;
        if (seen === 0) return { ok: false, why: 'You cannot build in unexplored Shadow.' };
      }
      // no enemy units standing there
      const near = this.hash ? this.hash.query((tx + s / 2) * T, (ty + s / 2) * T, s * T, this._pq || (this._pq = [])) : this.units;
      for (const u of near) {
        if (u.dead || u.def.air || u.id === ignoreUnitId) continue;
        if (u.x > tx * T - 4 && u.x < (tx + s) * T + 4 && u.y > ty * T - 4 && u.y < (ty + s) * T + 4) {
          if (this.areEnemies(pid, u.owner)) return { ok: false, why: 'Enemies are in the way.' };
        }
      }
      return { ok: true };
    }

    // ------------------------------------------------------------ the main tick
    tick(dt) {
      if (this.over && !this.opts.continueAfterOver) { this.time += dt; return; }
      this.time += dt;
      this.tickN++;
      this.pathBudget = 5000; // A* nodes per tick
      for (const e of this.units) { e.prevX = e.x; e.prevY = e.y; }
      for (const p of this.projectiles) { p.prevX = p.x; p.prevY = p.y; }
      if (this.tickN === 1 || this.tickN % 15 === 0) this.recomputeSupply();
      if (this.tickN % 10 === 1) {
        for (const r of this.resources) r.claims = 0;
        for (const u of this.units) {
          if (u.dead || !u.order || u.order.type !== 'gather') continue;
          const r = this.entities.get(u.order.target);
          if (r && r.kind === 'resource') r.claims++;
        }
      }
      // spatial hash
      this.hash.clear();
      for (const e of this.units) if (!e.dead) this.hash.insert(e);
      if (this.tickN === 1 || this.tickN % 10 === 0) {
        this.bhash.clear();
        for (const b of this.buildings) if (!b.dead) this.bhash.insert(b);
      }
      AC.Abilities.computeMods(this, dt);
      for (let i = 0; i < this.units.length; i++) {
        const e = this.units[i];
        if (!e.dead) AC.Behavior.updateUnit(this, e, dt);
      }
      AC.Behavior.separate(this, dt);
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (!b.dead) AC.Behavior.updateBuilding(this, b, dt);
      }
      AC.Behavior.updateProjectiles(this, dt);
      AC.Abilities.updateZones(this, dt);
      if (this.tickN % 15 === 0) this.updateRoad(0.5);
      if (this.tickN % 15 === 7) this.updateSites(0.5);
      if (this.tickN % 4 === 0) this.updateVision();
      this.updateIncome(dt);
      this.cleanup();
      if (this.scenario && this.scenario.onTick) this.scenario.onTick(this, dt);
      for (const ai of this.ais) ai.update(dt);
      if (this.tickN % 30 === 0) this.checkVictory();
    }

    updateIncome(dt) {
      if (!this._incomeCache || this.tickN % 15 === 0) {
        const inc = new Float32Array(this.players.length);
        const shrines = new Uint8Array(this.players.length);
        for (const b of this.buildings) {
          if (b.dead || !b.built || !b.def.power) continue;
          if (b.def.hq) { inc[b.owner] += b.def.power; continue; }
          if (shrines[b.owner] < 3) { shrines[b.owner]++; inc[b.owner] += b.def.power; }
        }
        for (const s of this.sites) if (s.capOwner >= 0 && s.capProgress >= 1) inc[s.capOwner] += 2;
        this._incomeCache = inc;
      }
      const inc = this._incomeCache;
      for (const p of this.players) {
        if (!p.alive || p.isNeutral) continue;
        const v = inc[p.id] * dt * (p.gatherMult || 1);
        p.res.p += v;
        p.stats.power += v;
      }
    }

    // ------------------------------------------------------------ vision
    updateVision() {
      const m = this.map, W = m.w, H = m.h;
      for (const p of this.players) {
        if (p.isNeutral) continue;
        p.vis.fill(0);
        p.detect.fill(0);
      }
      const stamp = (arr, tx, ty, r) => {
        const d = U.disc(r);
        for (let i = 0; i < d.length; i += 2) {
          const x = tx + d[i], y = ty + d[i + 1];
          if (x >= 0 && y >= 0 && x < W && y < H) arr[y * W + x] = 1;
        }
      };
      for (const e of this.units) {
        if (e.dead) continue;
        const p = this.players[e.owner];
        if (!p || p.isNeutral) continue;
        const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
        stamp(p.vis, tx, ty, e.def.sight || 8);
        stamp(p.detect, tx, ty, e.def.hero ? 4.5 : 3.2);
      }
      for (const b of this.buildings) {
        if (b.dead) continue;
        const p = this.players[b.owner];
        if (!p || p.isNeutral) continue;
        const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
        const sight = b.built ? b.def.sight || 7 : 4;
        stamp(p.vis, tx, ty, sight);
        if (b.def.detector && b.built) stamp(p.detect, tx, ty, sight);
        else stamp(p.detect, tx, ty, b.def.size / 2 + 2);
      }
      // hunt marks reveal
      for (const e of this.units) {
        if (e.dead) continue;
        for (const bf of e.buffs) if (bf.id === 'hunted' && this.players[bf.src]) {
          const p = this.players[bf.src];
          stamp(p.vis, Math.floor(e.x / T), Math.floor(e.y / T), 2);
          stamp(p.detect, Math.floor(e.x / T), Math.floor(e.y / T), 2);
        }
      }
      for (const z of this.zones) {
        if (z.reveal && this.players[z.owner] && !this.players[z.owner].isNeutral) {
          stamp(this.players[z.owner].vis, Math.floor(z.x / T), Math.floor(z.y / T), z.reveal);
        }
      }
      // share vision across teams
      const teams = {};
      for (const p of this.players) {
        if (p.isNeutral) continue;
        (teams[p.team] = teams[p.team] || []).push(p);
      }
      for (const k in teams) {
        const list = teams[k];
        if (list.length > 1) {
          const v = list[0].vis, d = list[0].detect;
          for (let j = 1; j < list.length; j++) {
            const vv = list[j].vis, dd = list[j].detect;
            for (let i = 0; i < v.length; i++) { v[i] |= vv[i]; d[i] |= dd[i]; }
          }
          for (let j = 1; j < list.length; j++) { list[j].vis.set(v); list[j].detect.set(d); }
        }
      }
      for (const p of this.players) {
        if (p.isNeutral) continue;
        if (!this.fog) { p.vis.fill(1); p.explored.fill(1); continue; }
        const v = p.vis, ex = p.explored;
        for (let i = 0; i < v.length; i++) if (v[i]) ex[i] = 1;
      }
      // building ghosts (remember enemy buildings seen)
      for (const p of this.players) {
        if (p.isNeutral || p.isAI) continue;
        for (const b of this.buildings) {
          if (b.dead || this.areAllies(p.id, b.owner)) continue;
          if (this.tileVisible(p, b.x, b.y)) p.ghosts.set(b.id, { def: b.def, x: b.x, y: b.y, owner: b.owner, built: b.built, progress: b.progress, tx: b.tx, ty: b.ty });
        }
        for (const [id, g] of p.ghosts) {
          const b = this.entities.get(id);
          if ((!b || b.dead) && this.tileVisible(p, g.x, g.y)) p.ghosts.delete(id);
        }
      }
    }
    tileVisible(p, x, y) {
      if (!this.fog) return true;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return false;
      return p.vis[ty * this.map.w + tx] === 1;
    }
    // Is entity e visible to player pid (respecting fog and stealth)?
    visibleTo(pid, e) {
      if (e.owner === pid) return true;
      const p = this.players[pid];
      if (!p || p.isNeutral) {
        // neutral creeps see what is near them
        return !this.isStealthed(e);
      }
      if (this.areAllies(pid, e.owner)) return true;
      if (e.kind === 'building') {
        if (!this.fog) return true;
        // a building is visible if any of its tiles is visible
        const s = e.size;
        for (let y = e.ty; y < e.ty + s; y++) for (let x = e.tx; x < e.tx + s; x++) if (p.vis[y * this.map.w + x]) return true;
        return false;
      }
      const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
      if (!this.map.inb(tx, ty)) return false;
      const i = ty * this.map.w + tx;
      if (this.fog && !p.vis[i]) return false;
      if (this.isStealthed(e) && !p.detect[i]) return false;
      return true;
    }
    isStealthed(e) {
      if (e.kind !== 'unit') return false;
      if (e.def.stealth && this.time - e.lastAtkT > 2.5 && this.time - e.lastHitT > 1.5) return true;
      for (const b of e.buffs) if (b.id === 'feign') return true;
      return false;
    }

    // ------------------------------------------------------------ black road
    recomputeCoverage() {
      const m = this.map, W = m.w;
      m.roadCov.fill(0);
      m.orderCov.fill(0);
      for (const b of this.buildings) {
        if (b.dead) continue;
        const d = b.def;
        const p = this.players[b.owner];
        let r = 0, arr = null;
        if (d.spread && d.faction === 'chaos') {
          r = d.spread * (p && p.upgrades.road_spread ? 1.5 : 1);
          if (!b.built) r = Math.min(r, d.size / 2 + 1.5);
          arr = m.roadCov;
        } else if (d.order && d.faction === 'amber' && b.built) {
          r = d.order; arr = m.orderCov;
        }
        if (!arr) continue;
        const cx = b.tx + d.size / 2, cy = b.ty + d.size / 2;
        const R = Math.ceil(r + d.size / 2);
        for (let y = Math.floor(cy - R); y <= cy + R; y++)
          for (let x = Math.floor(cx - R); x <= cx + R; x++) {
            if (!m.inb(x, y)) continue;
            const dx = Math.max(0, Math.abs(x + 0.5 - cx) - d.size / 2), dy = Math.max(0, Math.abs(y + 0.5 - cy) - d.size / 2);
            if (dx * dx + dy * dy <= r * r) arr[y * W + x]++;
          }
      }
      this.covDirty = false;
    }
    updateRoad(dt) {
      const m = this.map, W = m.w;
      if (this.covDirty) this.recomputeCoverage();
      // growth
      for (const b of this.buildings) {
        if (b.dead || !b.def.spread || b.def.faction !== 'chaos') continue;
        const p = this.players[b.owner];
        const upg = p && p.upgrades.road_spread ? 1.5 : 1;
        const r = b.def.spread * upg;
        const tries = Math.round(10 * upg * (b.built ? 1 : 0.3));
        const cx = b.tx + b.def.size / 2, cy = b.ty + b.def.size / 2;
        for (let k = 0; k < tries; k++) {
          const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * (r + b.def.size / 2);
          const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d);
          if (!m.inb(x, y)) continue;
          const i = y * W + x;
          if (m.road[i] || !m.roadCov[i] || m.orderCov[i] || !m.roadable(x, y)) continue;
          if (m.road[i - 1] || m.road[i + 1] || m.road[i - W] || m.road[i + W]) m.setRoad(x, y, 1);
        }
      }
      // decay (every other call)
      this._roadDecay = (this._roadDecay || 0) + 1;
      if (this._roadDecay % 2 === 0) {
        for (let i = 0; i < m.road.length; i++) {
          if (!m.road[i]) continue;
          if (m.orderCov[i] && this.rng() < 0.25) m.setRoad(i % W, (i / W) | 0, 0);
          else if (!m.roadCov[i] && !m.occ[i] && this.rng() < 0.05) m.setRoad(i % W, (i / W) | 0, 0);
        }
      }
      // effects on units
      for (const e of this.units) {
        if (e.dead || e.def.air) continue;
        const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
        if (!m.inb(tx, ty)) continue;
        const i = ty * W + tx;
        const p = this.players[e.owner];
        const fac = e.def.faction === 'neutral' ? 'neutral' : p ? p.faction : e.def.faction;
        if (m.road[i]) {
          if (fac === 'chaos') {
            const mult = p && p.upgrades.road_spread ? 2 : 1;
            e.hp = Math.min(e.maxHp, e.hp + 3 * mult * dt);
          } else if (fac !== 'neutral') {
            // the black grass drains life
            this.damage(null, e, 2.2 * dt, 'true', { silent: true, road: true });
            e.roadDrainT = this.time;
          }
        } else if (m.orderCov[i] && fac === 'amber') {
          e.hp = Math.min(e.maxHp, e.hp + 1.6 * dt);
        }
      }
      // chaos buildings regenerate on the road
      for (const b of this.buildings) {
        if (b.dead || !b.built || b.def.faction !== 'chaos') continue;
        if (m.isRoad(b.tx, b.ty) && b.hp < b.maxHp && this.time - b.lastHitT > 6) b.hp = Math.min(b.maxHp, b.hp + 3 * dt);
      }
    }

    // ------------------------------------------------------------ broken pattern sites
    updateSites(dt) {
      for (const s of this.sites) {
        if (s.noCapture) continue;
        const teams = {};
        let anyone = false;
        let byTeamPlayer = {};
        const near = this.hash.query(s.x, s.y, 2.6 * T, this._q);
        for (const u of near) {
          if (u.dead || u.def.air) continue;
          const p = this.players[u.owner];
          if (!p || p.isNeutral) continue;
          if (U.dist2(u.x, u.y, s.x, s.y) > (2.6 * T) ** 2) continue;
          teams[p.team] = (teams[p.team] || 0) + 1;
          byTeamPlayer[p.team] = byTeamPlayer[p.team] != null ? byTeamPlayer[p.team] : p.id;
          anyone = true;
        }
        const tk = Object.keys(teams);
        const ownerTeam = s.capOwner >= 0 ? this.players[s.capOwner].team : null;
        if (tk.length === 1) {
          const team = +tk[0];
          const pid = byTeamPlayer[team];
          if (ownerTeam === team) {
            s.capProgress = Math.min(1, s.capProgress + dt / 8);
          } else if (s.capOwner >= 0) {
            s.capProgress -= dt / 6;
            if (s.capProgress <= 0) {
              const old = s.capOwner;
              s.capOwner = -1; s.capProgress = 0;
              this.emit({ type: 'siteLost', site: s.id, player: old });
            }
          } else {
            // a fresh claim starts over only when a different team takes up the capture
            if (s.capBy < 0 || !this.players[s.capBy] || this.players[s.capBy].team !== team) { s.capBy = pid; s.capProgress = 0; }
            s.capProgress += dt / 8;
            if (s.capProgress >= 1) {
              s.capProgress = 1; s.capOwner = pid; s.capBy = -1;
              this.emit({ type: 'siteCaptured', site: s.id, player: pid });
              this.sfx('capture', s.x, s.y);
              this.fx('ring', { x: s.x, y: s.y, r: 70, color: this.players[pid].color.light, t: 1.2 });
            }
          }
          this._incomeCache = null;
        } else if (!anyone && s.capOwner < 0 && s.capProgress > 0) {
          s.capProgress = Math.max(0, s.capProgress - dt / 16);
        }
      }
    }

    // ------------------------------------------------------------ damage & death
    damage(src, target, amount, type, opts) {
      if (target.dead || target.def.invulnerable) return 0;
      opts = opts || {};
      let a = amount;
      if (type !== 'true') {
        const tbl = AC.DAMAGE_TABLE[type] || AC.DAMAGE_TABLE.normal;
        a *= tbl[target.def.armorType] != null ? tbl[target.def.armorType] : 1;
        const armor = (target.def.armor || 0) + (target.mods ? target.mods.armor : 0) + (target.kind === 'building' && !target.built ? -2 : 0);
        const red = armor >= 0 ? (armor * 0.06) / (1 + armor * 0.06) : -(1 - Math.pow(0.94, -armor));
        a *= 1 - red;
      }
      if (target.mods) a *= target.mods.dmgTaken;
      // riposte reflects melee
      if (src && src.kind === 'unit' && target.mods && target.mods.riposte && opts.melee) {
        a *= 0.4;
        if (!opts.reflected) this.damage(target, src, amount * 0.4, 'normal', { reflected: true });
        this.fx('spark', { x: target.x, y: target.y - 8, color: '#ffd0d0' });
      }
      a = Math.max(type === 'true' ? 0 : 0.5, a);
      target.hp -= a;
      target.lastHitT = this.time;
      if (src && (src.kind === 'unit' || src.kind === 'building')) target.lastAttacker = src.id;
      if (src && src.kind === 'unit') {
        if (src.mods && src.mods.lifesteal) src.hp = Math.min(src.maxHp, src.hp + a * src.mods.lifesteal);
      }
      // alerts
      const tp = this.players[target.owner];
      if (tp && !tp.isNeutral && !opts.road && !opts.silent && this.time - tp.lastAttackAlert > 18) {
        tp.lastAttackAlert = this.time;
        this.emit({ type: 'underAttack', player: tp.id, x: target.x, y: target.y, building: target.kind === 'building', hero: !!target.def.hero });
      }
      if (target.hp <= 0) this.kill(target, src);
      return a;
    }
    kill(e, src) {
      if (e.dead) return;
      e.dead = true;
      e.hp = 0;
      const p = this.players[e.owner];
      const sp = src ? this.players[src.owner] : null;
      if (e.kind === 'unit') {
        if (p) p.stats.lost++;
        if (sp && sp !== p) sp.stats.kills++;
        this.sfx(e.def.hero ? 'heroDeath' : e.def.role === 'beast' || e.def.art === 'hellhound' || e.def.art === 'wolf' ? 'beastDeath' : 'death', e.x, e.y);
        this.fx('death', { x: e.x, y: e.y, art: e.def.art, owner: e.owner, angle: e.angle, r: e.radius, air: !!e.def.air });
        // bounty for neutral creeps
        if (e.def.bounty && sp && !sp.isNeutral) {
          sp.res.d += e.def.bounty;
          this.fx('float', { x: e.x, y: e.y - 20, text: '+' + e.def.bounty, color: '#bfe8ff' });
        }
        // hero xp
        if (sp && !sp.isNeutral && this.areEnemies(sp.id, e.owner)) {
          const xp = e.def.hero ? 120 + 40 * e.level : (e.def.supply || 1) * 16 + (e.def.boss ? 300 : e.def.bounty ? 20 : 0);
          const hs = [];
          for (const u of this.units) if (!u.dead && u.def.hero && u.owner === sp.id && U.dist2(u.x, u.y, e.x, e.y) < (13 * T) ** 2) hs.push(u);
          for (const h of hs) this.giveXp(h, xp / hs.length);
        }
        if (e.def.hero && p) {
          p.deadHeroes[e.def.id] = { level: e.level, xp: e.xp };
          this.emit({ type: 'heroDied', player: p.id, hero: e.def.id, x: e.x, y: e.y });
        }
        if (e.order && e.order.type === 'gather') this.releaseMiner(e);
        if (p) for (const o of [e.order, ...e.queue]) if (o && o.type === 'build' && o.paid && !o.placed) this.refund(p, AC.BUILDINGS[o.def].cost);
      } else if (e.kind === 'building') {
        if (p) p.stats.bLost++;
        if (sp && sp !== p) sp.stats.razed++;
        this.sfx('collapse', e.x, e.y);
        this.fx('collapse', { x: e.x, y: e.y, size: e.size, faction: e.def.faction });
        const m = this.map;
        for (let y = e.ty; y < e.ty + e.size; y++)
          for (let x = e.tx; x < e.tx + e.size; x++) if (m.inb(x, y) && m.occ[y * m.w + x] === e.id) m.occ[y * m.w + x] = 0;
        // refund queued production
        if (p) for (const q of e.trainQ) this.refund(p, q.cost || AC.UNITS[q.id].cost);
        if (e.research && p) { this.refund(p, AC.UPGRADES[e.research.id].cost); delete p.researching[e.research.id]; }
        this.covDirty = true;
        this._incomeCache = null;
        this.emit({ type: 'buildingLost', player: e.owner, def: e.def.id, x: e.x, y: e.y });
      }
      this.recomputeSupplySoon = true;
      if (this.scenario && this.scenario.onDeath) this.scenario.onDeath(this, e, src);
    }
    giveXp(h, xp) {
      if (h.level >= AC.HERO_LEVELS.length) return;
      h.xp += xp;
      while (h.level < AC.HERO_LEVELS.length && h.xp >= AC.HERO_LEVELS[h.level]) {
        h.level++;
        this.applyLevel(h);
        h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.25);
        this.emit({ type: 'heroLevel', player: h.owner, id: h.id, level: h.level });
        this.fx('levelup', { x: h.x, y: h.y });
        this.fx('float', { x: h.x, y: h.y - 30, text: 'Level ' + h.level, color: '#ffe08a' });
        this.sfx('levelup', h.x, h.y);
      }
    }
    releaseMiner(e) {
      const r = e.order && e.order.target && this.entities.get(e.order.target);
      if (r && r.miner === e.id) r.miner = 0;
    }
    cleanup() {
      let removed = false;
      if (this.tickN % 6 === 0 || this.recomputeSupplySoon) {
        this.units = this.units.filter((e) => {
          if (e.dead) { this.entities.delete(e.id); removed = true; return false; }
          return true;
        });
        this.buildings = this.buildings.filter((e) => {
          if (e.dead) { this.entities.delete(e.id); removed = true; return false; }
          return true;
        });
        this.resources = this.resources.filter((e) => {
          if (e.dead) {
            this.entities.delete(e.id);
            const m = this.map;
            if (m.occ[e.ty * m.w + e.tx] === e.id) m.occ[e.ty * m.w + e.tx] = 0;
            m.markDirty(e.tx, e.ty);
            return false;
          }
          return true;
        });
        if (removed || this.recomputeSupplySoon) { this.recomputeSupply(); this.recomputeSupplySoon = false; }
      }
    }

    onBuildingComplete(b, silent) {
      b.built = true; b.progress = 1;
      const p = this.players[b.owner];
      this.covDirty = true;
      this._incomeCache = null;
      this.recomputeSupplySoon = true;
      if (!silent) {
        if (p) p.stats.built++;
        this.emit({ type: 'buildingComplete', player: b.owner, id: b.id, def: b.def.id, x: b.x, y: b.y });
        this.sfx('complete', b.x, b.y);
        this.fx('ring', { x: b.x, y: b.y, r: b.radius * 1.4, color: p ? p.color.light : '#fff', t: 0.8 });
      }
      if (this.scenario && this.scenario.onBuilt) this.scenario.onBuilt(this, b);
    }

    // ------------------------------------------------------------ victory
    checkVictory() {
      if (this.over) return;
      if (this.scenario && this.scenario.checkVictory) {
        const r = this.scenario.checkVictory(this);
        if (r != null) { this.endGame(r); return; }
        if (this.scenario.customVictoryOnly) return;
      }
      for (const p of this.players) {
        if (!p.alive || p.isNeutral) continue;
        let has = false;
        for (const b of this.buildings) if (!b.dead && b.owner === p.id) { has = true; break; }
        if (!has) {
          p.alive = false;
          this.emit({ type: 'eliminated', player: p.id });
          // their remaining units fall
          for (const u of this.units) if (!u.dead && u.owner === p.id) this.kill(u, null);
        }
      }
      const teams = new Set();
      for (const p of this.players) if (p.alive && !p.isNeutral) teams.add(p.team);
      if (teams.size <= 1) this.endGame(teams.size ? [...teams][0] : -1);
    }
    endGame(winnerTeam) {
      if (this.over) return;
      this.over = true;
      this.winnerTeam = winnerTeam;
      this.emit({ type: 'gameOver', winnerTeam });
    }

    // ------------------------------------------------------------ queries
    nearestDropoff(pid, x, y) {
      let best = null, bd = 1e18;
      for (const b of this.buildings) {
        if (b.dead || !b.built || b.owner !== pid || !b.def.dropoff) continue;
        const d = U.dist2(b.x, b.y, x, y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    }
    hq(pid) {
      let best = null;
      for (const b of this.buildings) {
        if (b.dead || b.owner !== pid) continue;
        if (b.def.hq && (!best || (b.built && !best.built) || b.def.size > best.def.size)) best = b;
      }
      return best;
    }
    // distance from point to building edge
    edgeDist(b, x, y) {
      if (b.kind !== 'building') return Math.hypot(b.x - x, b.y - y) - (b.radius || 0);
      const x0 = b.tx * T, y0 = b.ty * T, x1 = x0 + b.size * T, y1 = y0 + b.size * T;
      const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      return Math.hypot(dx, dy);
    }
    entityAt(x, y, pid) {
      // units first (topmost), then buildings, resources, sites
      let best = null, bd = 1e9;
      for (const e of this.units) {
        if (e.dead) continue;
        if (pid != null && !this.visibleTo(pid, e)) continue;
        const ey = e.def.air ? e.y - 22 : e.y;
        const d = Math.hypot(e.x - x, ey - y);
        if (d < e.radius + 6 && d < bd) { bd = d; best = e; }
      }
      if (best) return best;
      for (const b of this.buildings) {
        if (b.dead) continue;
        if (x >= b.tx * T && x < (b.tx + b.size) * T && y >= b.ty * T - 10 && y < (b.ty + b.size) * T) {
          if (pid != null && !this.visibleTo(pid, b)) continue;
          return b;
        }
      }
      for (const r of this.resources) {
        if (r.dead) continue;
        if (Math.abs(r.x - x) < 18 && Math.abs(r.y - y) < 18) return r;
      }
      for (const s of this.sites) if (Math.hypot(s.x - x, s.y - y) < 44) return s;
      return null;
    }
  }
  AC.Game = Game;
})();
