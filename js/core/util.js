// Amber and Chaos — shared namespace and utilities.
// Classic scripts (no ES modules) so the game runs straight from file:// on macOS.
(function () {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : window;
  const AC = (G.AC = G.AC || {});

  AC.TILE = 32;
  AC.TICK = 1 / 30; // fixed simulation step (seconds)

  const U = (AC.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };
  U.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.angleDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  U.turnToward = (a, b, maxStep) => {
    const d = U.angleDiff(a, b);
    if (Math.abs(d) <= maxStep) return b;
    return a + Math.sign(d) * maxStep;
  };

  // Mulberry32 seeded RNG
  U.rng = function (seed) {
    let s = seed >>> 0;
    const r = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (a, b) => a + r() * (b - a);
    r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  };

  // Hash for deterministic per-tile randomness
  U.hash2 = function (x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + (seed | 0) * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Smooth value noise + fractal brownian motion
  U.makeNoise = function (seed) {
    const perm = new Uint8Array(512);
    const r = U.rng(seed);
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) vals[i] = r();
    const fade = (t) => t * t * (3 - 2 * t);
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const a = vals[perm[perm[X] + Y]];
      const b = vals[perm[perm[X + 1] + Y]];
      const c = vals[perm[perm[X] + Y + 1]];
      const d = vals[perm[perm[X + 1] + Y + 1]];
      const u = fade(xf), v = fade(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, oct) {
      let amp = 0.5, f = 1, sum = 0, norm = 0;
      for (let i = 0; i < (oct || 4); i++) {
        sum += amp * noise(x * f, y * f);
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      return sum / norm;
    }
    return { noise, fbm };
  };

  // Binary min-heap keyed by numeric priority
  U.Heap = class {
    constructor() { this.items = []; this.pri = []; }
    get size() { return this.items.length; }
    push(item, p) {
      const it = this.items, pr = this.pri;
      it.push(item); pr.push(p);
      let i = it.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (pr[par] <= pr[i]) break;
        [it[par], it[i]] = [it[i], it[par]];
        [pr[par], pr[i]] = [pr[i], pr[par]];
        i = par;
      }
    }
    pop() {
      const it = this.items, pr = this.pri;
      const top = it[0];
      const lastI = it.pop(), lastP = pr.pop();
      if (it.length > 0) {
        it[0] = lastI; pr[0] = lastP;
        let i = 0;
        const n = it.length;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < n && pr[l] < pr[m]) m = l;
          if (r < n && pr[r] < pr[m]) m = r;
          if (m === i) break;
          [it[m], it[i]] = [it[i], it[m]];
          [pr[m], pr[i]] = [pr[i], pr[m]];
          i = m;
        }
      }
      return top;
    }
  };

  U.formatTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  // Precomputed disc offsets for vision stamping
  const discCache = {};
  U.disc = function (r) {
    const key = Math.round(r * 2);
    if (discCache[key]) return discCache[key];
    const out = [];
    const R = Math.ceil(r);
    const rr = r * r;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++)
        if (dx * dx + dy * dy <= rr) out.push(dx, dy);
    return (discCache[key] = out);
  };

  // Spiral of tile offsets (for placement searches and formations)
  U.spiral = function (maxR) {
    const out = [[0, 0]];
    for (let r = 1; r <= maxR; r++) {
      for (let x = -r; x <= r; x++) { out.push([x, -r]); out.push([x, r]); }
      for (let y = -r + 1; y <= r - 1; y++) { out.push([-r, y]); out.push([r, y]); }
    }
    return out;
  };

  U.shuffle = function (arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor((r ? r() : Math.random()) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  U.storage = {
    get(key, def) {
      try {
        const v = G.localStorage && G.localStorage.getItem('amber-chaos:' + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { G.localStorage && G.localStorage.setItem('amber-chaos:' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    },
  };
})();
