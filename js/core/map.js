// Amber and Chaos — terrain grid, procedural maps, the Black Road.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;

  const TER = (AC.TER = {
    GRASS: 0, DIRT: 1, FOREST: 2, ROCK: 3, WATER: 4, SAND: 5, ABYSS: 6, ASH: 7, STONE: 8, SHALLOW: 9,
  });
  AC.TER_NAMES = ['Grass', 'Road', 'Forest', 'Mountain', 'Deep Water', 'Sand', 'The Abyss', 'Ash', 'Flagstones', 'Shallows'];

  // Passability bit flags per terrain: 1 = ground, 2 = woods-walkers, 4 = air
  const PASS = new Uint8Array(16);
  PASS[TER.GRASS] = 7; PASS[TER.DIRT] = 7; PASS[TER.SAND] = 7; PASS[TER.ASH] = 7; PASS[TER.STONE] = 7; PASS[TER.SHALLOW] = 7;
  PASS[TER.FOREST] = 6; PASS[TER.ROCK] = 4; PASS[TER.WATER] = 4; PASS[TER.ABYSS] = 4;
  AC.PASS = PASS;
  const MOVE_BITS = { ground: 1, woods: 2, air: 4 };
  AC.MOVE_BITS = MOVE_BITS;

  // Can the black road grow on this terrain?
  const ROADABLE = new Uint8Array(16);
  ROADABLE[TER.GRASS] = 1; ROADABLE[TER.DIRT] = 1; ROADABLE[TER.SAND] = 1; ROADABLE[TER.ASH] = 1; ROADABLE[TER.STONE] = 1; ROADABLE[TER.SHALLOW] = 0;

  class GameMap {
    constructor(w, h, seed, theme) {
      this.w = w; this.h = h; this.seed = seed | 0; this.theme = theme || 'garnath';
      const n = w * h;
      this.terrain = new Uint8Array(n);
      this.road = new Uint8Array(n);      // black road present
      this.roadCov = new Uint16Array(n);  // number of Chaos spreaders covering
      this.orderCov = new Uint16Array(n); // number of Amber order sources covering
      this.occ = new Int32Array(n);       // entity id blocking the tile (buildings, resources)
      this.version = 0;       // bumps when terrain changes (renderer cache)
      this.roadVersion = 0;   // bumps when road changes
      this.dirtyChunks = new Set();
    }
    idx(tx, ty) { return ty * this.w + tx; }
    inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
    get(tx, ty) { return this.inb(tx, ty) ? this.terrain[ty * this.w + tx] : TER.ROCK; }
    set(tx, ty, t) {
      if (!this.inb(tx, ty)) return;
      this.terrain[ty * this.w + tx] = t;
      this.markDirty(tx, ty);
    }
    markDirty(tx, ty) {
      this.version++;
      this.dirtyChunks.add(((ty >> 3) << 16) | (tx >> 3));
    }
    terrainPass(tx, ty, bits) {
      if (!this.inb(tx, ty)) return false;
      return (PASS[this.terrain[ty * this.w + tx]] & bits) !== 0;
    }
    passable(tx, ty, bits) {
      if (!this.inb(tx, ty)) return false;
      const i = ty * this.w + tx;
      if (bits & 4) return true; // air
      return (PASS[this.terrain[i]] & bits) !== 0 && this.occ[i] === 0;
    }
    passableWorld(x, y, bits) {
      return this.passable(Math.floor(x / AC.TILE), Math.floor(y / AC.TILE), bits);
    }
    isRoad(tx, ty) { return this.inb(tx, ty) && this.road[ty * this.w + tx] === 1; }
    setRoad(tx, ty, v) {
      if (!this.inb(tx, ty)) return;
      const i = ty * this.w + tx;
      if (v && !ROADABLE[this.terrain[i]]) return;
      if (this.road[i] !== (v ? 1 : 0)) {
        this.road[i] = v ? 1 : 0;
        this.roadVersion++;
      }
    }
    roadable(tx, ty) { return this.inb(tx, ty) && ROADABLE[this.terrain[ty * this.w + tx]] === 1; }

    fillRect(x0, y0, x1, y1, t) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
    }
    disc(cx, cy, r, t, rough, rng) {
      const R = Math.ceil(r + 2);
      for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
          let rr = r;
          if (rough && rng) rr += (U.hash2(cx + x, cy + y, this.seed) - 0.5) * rough * 2;
          if (x * x + y * y <= rr * rr) this.set(cx + x, cy + y, t);
        }
    }
    line(x0, y0, x1, y1, w, t) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(U.lerp(x0, x1, i / Math.max(1, n)));
        const y = Math.round(U.lerp(y0, y1, i / Math.max(1, n)));
        for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (dx * dx + dy * dy <= w * w + 0.5) this.set(x + dx, y + dy, t);
      }
    }
  }
  AC.GameMap = GameMap;

  // ------------------------------------------------------------------ generation
  const THEMES = (AC.MAP_THEMES = {
    garnath: { name: 'Vale of Garnath', forest: 0.67, rock: 0.73, water: 0.83, ash: 0.62, base: TER.GRASS,
      desc: 'A once-fair valley poisoned by a curse. Mixed woods and ridges, scarred with ash.' },
    arden: { name: 'Forest of Arden', forest: 0.55, rock: 0.8, water: 0.85, ash: 2, base: TER.GRASS,
      desc: "Julian's forest. Dense woods with narrow clearings. Rangers and hounds move freely here." },
    kolvir: { name: 'Heights of Kolvir', forest: 0.72, rock: 0.6, water: 0.9, ash: 2, base: TER.GRASS,
      desc: 'The mountain slopes beneath Castle Amber. Many ridges and hard chokepoints.' },
    rebma: { name: 'Shores of Rebma', forest: 0.7, rock: 0.8, water: 0.57, ash: 2, base: TER.GRASS,
      desc: 'Coastlands above the drowned mirror-city. Lakes and inlets divide the land.' },
    abyss: { name: 'Edge of the Abyss', forest: 0.78, rock: 0.72, water: 2, abyss: 0.64, ash: -1, base: TER.ASH,
      desc: 'Wasteland at the rim of the world, near the Courts of Chaos, cut by chasms of the Abyss.' },
  });

  // Generate a symmetric skirmish map.
  // opts: { size, players (2..4), seed, theme }
  AC.generateMap = function (opts) {
    const size = opts.size || 96;
    const W = size, H = size;
    const seed = (opts.seed | 0) || 1;
    const th = THEMES[opts.theme] || THEMES.garnath;
    const rng = U.rng(seed);
    const nz = U.makeNoise(seed);
    const map = new GameMap(W, H, seed, opts.theme || 'garnath');
    const sym = (opts.players || 2) > 2 ? 4 : 2;

    // base terrain from noise
    const sc = 0.085;
    const raw = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const f = nz.fbm(x * sc + 11, y * sc + 7, 4);
        const r = nz.fbm(x * sc * 0.9 + 101, y * sc * 0.9 + 57, 4);
        const w = nz.fbm(x * sc * 0.55 + 301, y * sc * 0.55 + 211, 4);
        const a = nz.fbm(x * sc * 1.2 + 501, y * sc * 1.2 + 401, 3);
        let t = th.base;
        if (th.ash >= 0 && a > th.ash) t = TER.ASH;
        if (th.ash < 0 && a > 0.62) t = TER.GRASS; // abyss theme: rare patches of grass
        if (f > th.forest) t = TER.FOREST;
        if (r > th.rock) t = TER.ROCK;
        if (w > th.water) t = w > th.water + 0.04 ? TER.WATER : TER.SHALLOW;
        if (th.abyss && w > th.abyss) t = TER.ABYSS;
        raw[y * W + x] = t;
      }
    // apply rotational symmetry
    const rot = (x, y, k) => {
      // k quarter turns (sym 4) or half turn (sym 2)
      if (k === 0) return [x, y];
      if (k === 1) return [W - 1 - y, x];
      if (k === 2) return [W - 1 - x, H - 1 - y];
      return [y, H - 1 - x];
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let src;
        if (sym === 2) {
          src = y < H / 2 ? [x, y] : [W - 1 - x, H - 1 - y];
        } else {
          if (x < W / 2 && y < H / 2) src = [x, y];
          else if (x >= W / 2 && y < H / 2) src = rot(x, y, 3); // inverse of k=1
          else if (x >= W / 2 && y >= H / 2) src = rot(x, y, 2);
          else src = rot(x, y, 1);
        }
        map.terrain[y * W + x] = raw[src[1] * W + src[0]];
      }

    // border of mountains/abyss to frame the world
    for (let i = 0; i < W; i++) {
      for (let b = 0; b < 1; b++) {
        map.terrain[b * W + i] = TER.ROCK;
        map.terrain[(H - 1 - b) * W + i] = TER.ROCK;
        map.terrain[i * W + b] = TER.ROCK;
        map.terrain[i * W + (W - 1 - b)] = TER.ROCK;
      }
    }

    // symmetric placement helpers
    const copies = (x, y) => {
      if (sym === 2) return [[x, y], [W - 1 - x, H - 1 - y]];
      return [rot(x, y, 0), rot(x, y, 1), rot(x, y, 2), rot(x, y, 3)];
    };
    const clearAll = (x, y, r, t) => copies(x, y).forEach(([cx, cy]) => map.disc(cx, cy, r, t, 1.2, rng));

    const starts = [];
    const resources = [];
    const sites = [];
    const creeps = [];
    const sx = Math.round(W * 0.13), sy = Math.round(H * 0.13);
    // base clearings
    clearAll(sx, sy, 10, th.base === TER.ASH ? TER.ASH : TER.GRASS);
    const baseStone = (x, y) => copies(x, y).forEach(([cx, cy]) => map.disc(cx, cy, 3.2, TER.STONE, 0.6, rng));
    baseStone(sx, sy);

    // resource field placement: arc of nodes around a centre, facing direction ang
    function field(cx, cy, ang, n, dist, amount) {
      const pts = [];
      const spread = 1.4;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * (spread / (n - 1 || 1));
        const d = dist + (i % 2) * 0.9;
        pts.push([Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d)]);
      }
      return pts.map((p) => ({ tx: p[0], ty: p[1], amount }));
    }

    const corner = Math.atan2(-1, -1);
    const mainField = field(sx, sy, corner, 7, 7.2, 1500);
    // natural expansions along two edges (for 2p) or one edge (4p)
    const exps = [];
    const n1 = [Math.round(W * 0.12), Math.round(H * 0.42)];
    exps.push(n1);
    if (sym === 2) exps.push([Math.round(W * 0.42), Math.round(H * 0.12)]);
    const mid = [Math.round(W * 0.31), Math.round(H * 0.31)];
    exps.push(mid);

    const placeField = (list) => {
      for (const r of list) {
        copies(r.tx, r.ty).forEach(([x, y]) => {
          map.disc(x, y, 1.6, TER.SAND, 0.4, rng);
          resources.push({ tx: x, ty: y, amount: r.amount });
        });
      }
    };
    placeField(mainField);
    for (const e of exps) {
      clearAll(e[0], e[1], 8, th.base === TER.ASH ? TER.ASH : TER.GRASS);
      // face away from map centre
      const ang = Math.atan2(e[1] - H / 2, e[0] - W / 2);
      const f = field(e[0], e[1], ang, 6, 6, 1200);
      placeField(f);
    }

    // start positions
    copies(sx, sy).forEach(([x, y]) => starts.push({ tx: x, ty: y }));

    // Broken Pattern sites: centre + symmetric extras
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    map.disc(cx, cy, 6, TER.STONE, 1.0, rng);
    map.disc(cx, cy, 8.5, th.base === TER.ASH ? TER.ASH : TER.GRASS, 1.0, rng);
    map.disc(cx, cy, 4.5, TER.STONE, 0.8, rng);
    sites.push({ tx: cx, ty: cy, name: 'Broken Pattern of Ygg' });
    const extra = [Math.round(W * 0.2), Math.round(H * 0.66)];
    clearAll(extra[0], extra[1], 4.5, TER.STONE);
    copies(extra[0], extra[1]).forEach(([x, y], i) => sites.push({ tx: x, ty: y, name: 'Broken Pattern' }));

    // creeps
    creeps.push({ type: 'sphinx', tx: cx + 3, ty: cy - 3 });
    for (const e of exps) {
      copies(e[0], e[1]).forEach(([x, y]) => {
        const dx = Math.sign(W / 2 - x) * 2, dy = Math.sign(H / 2 - y) * 2;
        if (e === mid) {
          creeps.push({ type: 'wild_manticore', tx: x + dx, ty: y + dy });
          creeps.push({ type: 'shadow_wolf', tx: x + dx + 1, ty: y + dy - 1 });
        } else {
          creeps.push({ type: 'shadow_wolf', tx: x + dx, ty: y + dy });
          creeps.push({ type: 'shadow_wolf', tx: x + dx + 1, ty: y + dy + 1 });
        }
      });
    }
    copies(extra[0], extra[1]).forEach(([x, y]) => {
      creeps.push({ type: 'shadow_wolf', tx: x + 2, ty: y });
      creeps.push({ type: 'shadow_wolf', tx: x - 2, ty: y + 1 });
    });

    // Trails: dirt road from each start toward the centre (symmetric)
    const trail = (x0, y0, x1, y1) => {
      const path = carvePath(map, x0, y0, x1, y1, false);
      for (const [x, y] of path) {
        copies(x, y).forEach(([qx, qy]) => {
          const t = map.get(qx, qy);
          if (t === TER.GRASS || t === TER.ASH || t === TER.SAND) map.terrain[qy * W + qx] = TER.DIRT;
        });
      }
    };
    trail(sx + 3, sy + 3, cx - 4, cy - 4);
    trail(sx, sy + 4, n1[0], n1[1] - 3);

    // Connectivity: carve so all key points are reachable from start 0 (by ground)
    const keyPoints = [];
    starts.forEach((s) => keyPoints.push([s.tx, s.ty]));
    sites.forEach((s) => keyPoints.push([s.tx, s.ty]));
    exps.forEach((e) => copies(e[0], e[1]).forEach((p) => keyPoints.push(p)));
    for (let iter = 0; iter < 3; iter++) {
      const reach = flood(map, starts[0].tx, starts[0].ty);
      let ok = true;
      for (const [kx, ky] of keyPoints) {
        if (!reach[ky * W + kx]) {
          ok = false;
          const path = carvePath(map, starts[0].tx, starts[0].ty, kx, ky, true);
          for (const [x, y] of path) {
            copies(x, y).forEach(([qx, qy]) => {
              for (let dy = 0; dy <= 1; dy++)
                for (let dx = 0; dx <= 1; dx++) {
                  const t = map.get(qx + dx, qy + dy);
                  if (!(PASS[t] & 1) && map.inb(qx + dx, qy + dy) && qx + dx > 0 && qy + dy > 0 && qx + dx < W - 1 && qy + dy < H - 1)
                    map.terrain[(qy + dy) * W + qx + dx] = th.base === TER.ASH ? TER.ASH : TER.GRASS;
                }
            });
          }
        }
      }
      if (ok) break;
    }
    // Make sure resource nodes have walkable neighbours
    for (const r of resources) {
      if (!(PASS[map.get(r.tx, r.ty)] & 1)) map.terrain[r.ty * W + r.tx] = TER.SAND;
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) if (PASS[map.get(r.tx + dx, r.ty + dy)] & 1) free++;
      if (free < 3) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.inb(r.tx + dx, r.ty + dy) && map.get(r.tx + dx, r.ty + dy) !== TER.SAND) map.terrain[(r.ty + dy) * W + r.tx + dx] = TER.SAND;
    }
    map.version++;
    return { map, starts, resources, sites, creeps };
  };

  // BFS flood fill over ground-passable terrain (ignores occupancy)
  function flood(map, sx, sy) {
    const W = map.w, H = map.h;
    const seen = new Uint8Array(W * H);
    const q = [sx + sy * W];
    seen[sx + sy * W] = 1;
    while (q.length) {
      const i = q.pop();
      const x = i % W, y = (i / W) | 0;
      const nb = [i - 1, i + 1, i - W, i + W];
      const nx = [x - 1, x + 1, x, x];
      const ny = [y, y, y - 1, y + 1];
      for (let k = 0; k < 4; k++) {
        if (nx[k] < 0 || ny[k] < 0 || nx[k] >= W || ny[k] >= H) continue;
        const j = nb[k];
        if (!seen[j] && PASS[map.terrain[j]] & 1) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  }
  AC.floodGround = flood;

  // Dijkstra/A* path that may cross impassable terrain at high cost
  function carvePath(map, x0, y0, x1, y1, allowBlocked) {
    const W = map.w, H = map.h;
    const N = W * H;
    const g = new Float32Array(N).fill(1e9);
    const from = new Int32Array(N).fill(-1);
    const heap = new U.Heap();
    const s = y0 * W + x0, goal = y1 * W + x1;
    g[s] = 0;
    heap.push(s, 0);
    while (heap.size) {
      const i = heap.pop();
      if (i === goal) break;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const j = ny * W + nx;
        const t = map.terrain[j];
        let c = PASS[t] & 1 ? 1 : allowBlocked ? 9 : 40;
        if (t === TER.DIRT) c = 0.6;
        c += U.hash2(nx, ny, 77) * 0.4;
        const ng = g[i] + c;
        if (ng < g[j]) {
          g[j] = ng; from[j] = i;
          heap.push(j, ng + (Math.abs(nx - x1) + Math.abs(ny - y1)) * 0.6);
        }
      }
    }
    const out = [];
    let c = goal;
    let guard = 0;
    while (c !== -1 && c !== s && guard++ < N) {
      out.push([c % W, (c / W) | 0]);
      c = from[c];
    }
    return out;
  }
  AC.carvePath = carvePath;
})();
