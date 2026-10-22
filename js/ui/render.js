// Amber and Chaos — renderer: camera, terrain chunks, Black Road, entities, effects, fog, minimap.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;
  const TER = AC.TER;
  const TAU = Math.PI * 2;
  const H = () => AC.Art.helpers;

  const CHUNK = 8; // tiles per chunk
  const CPX = CHUNK * T;

  const BASE_COL = {
    [TER.GRASS]: [72, 106, 46], [TER.DIRT]: [118, 98, 66], [TER.FOREST]: [36, 60, 28], [TER.ROCK]: [96, 90, 84],
    [TER.WATER]: [24, 54, 86], [TER.SAND]: [196, 176, 120], [TER.ABYSS]: [8, 4, 14], [TER.ASH]: [88, 82, 78],
    [TER.STONE]: [132, 126, 114], [TER.SHALLOW]: [48, 104, 120],
  };
  const THEME_TINT = {
    garnath: { [TER.GRASS]: [82, 104, 44], [TER.ASH]: [84, 76, 72] },
    arden: { [TER.GRASS]: [62, 104, 44], [TER.FOREST]: [30, 56, 26] },
    kolvir: { [TER.GRASS]: [86, 112, 58], [TER.ROCK]: [112, 108, 102] },
    rebma: { [TER.GRASS]: [74, 112, 58], [TER.SAND]: [210, 192, 140] },
    abyss: { [TER.ASH]: [66, 58, 66], [TER.GRASS]: [70, 86, 50], [TER.ROCK]: [70, 62, 72] },
    lorraine: { [TER.GRASS]: [88, 110, 50] },
    shadow: { [TER.GRASS]: [60, 70, 80], [TER.ROCK]: [80, 82, 96], [TER.ASH]: [60, 62, 72] },
    courts: { [TER.ASH]: [58, 46, 62], [TER.GRASS]: [62, 70, 50], [TER.ROCK]: [56, 48, 62] },
  };
  AC.TERRAIN_COLORS = BASE_COL;

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.map = game.map;
      this.cam = { x: 0, y: 0, zoom: 1 };
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.quality = AC.settings ? AC.settings.quality : 'high';
      this.chunks = new Map(); // key -> {canvas, scale, ver, used}
      this.chunkBudget = 0;
      this.fx = [];
      this.decals = [];
      this.corpses = [];
      this.time = 0;
      this.noise = U.makeNoise(game.map.seed + 5);
      this.tileCol = this.computeTileColors();
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = this.map.w; this.fogCanvas.height = this.map.h;
      this.fogCtx = this.fogCanvas.getContext('2d');
      this.fogImg = this.fogCtx.createImageData(this.map.w, this.map.h);
      this.fogDirty = true;
      this.roadSprites = this.makeRoadSprites();
      this.mini = null;
      this.screenShake = 0;
      this.resize();
    }
    // free every cached canvas so a finished game releases its memory (Safari caps canvas memory)
    destroy() {
      const free = (c) => { if (c) { c.width = 0; c.height = 0; } };
      for (const ch of this.chunks.values()) free(ch.canvas);
      this.chunks.clear();
      free(this.miniBase); free(this.roadCanvas); free(this.fogCanvas); free(this._base);
      for (const s of this.roadSprites || []) free(s.canvas);
      this.miniBase = this.roadCanvas = this.fogCanvas = this._base = null;
      this.fx = []; this.decals = []; this.corpses = [];
      this.game = null; this.map = null;
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
      this.dpr = Math.min(AC.settings && AC.settings.quality === 'low' ? 1 : 2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.vw * this.dpr);
      this.canvas.height = Math.round(this.vh * this.dpr);
      this.clampCam();
    }
    // world <-> screen (CSS pixels)
    toScreen(x, y) { return [(x - this.cam.x) * this.cam.zoom + this.vw / 2, (y - this.cam.y) * this.cam.zoom + this.vh / 2]; }
    toWorld(sx, sy) { return [(sx - this.vw / 2) / this.cam.zoom + this.cam.x, (sy - this.vh / 2) / this.cam.zoom + this.cam.y]; }
    clampCam() {
      const g = this.game;
      if (!g.map) return;
      const W = g.map.w * T, Hh = g.map.h * T;
      const hw = this.vw / 2 / this.cam.zoom, hh = this.vh / 2 / this.cam.zoom;
      const bottomPad = (AC.ui && AC.ui.bottomH ? AC.ui.bottomH : 180) / this.cam.zoom;
      this.cam.x = U.clamp(this.cam.x, Math.min(hw, W / 2) - 64, Math.max(W - hw, W / 2) + 64);
      this.cam.y = U.clamp(this.cam.y, Math.min(hh, Hh / 2) - 64, Math.max(Hh - hh + bottomPad, Hh / 2) + 64);
    }
    centerOn(x, y) { this.cam.x = x; this.cam.y = y; this.clampCam(); }

    // ------------------------------------------------------------------ terrain colours
    computeTileColors() {
      const m = this.map;
      const tint = THEME_TINT[m.theme] || {};
      const out = new Float32Array(m.w * m.h * 3);
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const t = m.terrain[y * m.w + x];
          const c = tint[t] || BASE_COL[t] || [255, 0, 255];
          const v = (U.hash2(x, y, m.seed) - 0.5) * 0.12;
          const i = (y * m.w + x) * 3;
          out[i] = c[0] * (1 + v); out[i + 1] = c[1] * (1 + v); out[i + 2] = c[2] * (1 + v);
          // forest and rock floors blend toward neighbours a little
        }
      return out;
    }
    makeRoadSprites() {
      // tendrils and veins only; the body of the road is a smoothed mask (see drawRoad)
      const out = [];
      const s = 2;
      for (let v = 0; v < 4; v++) {
        const cv = document.createElement('canvas');
        const P = 40;
        cv.width = P * s; cv.height = P * s;
        const c = cv.getContext('2d');
        c.scale(s, s);
        const rng = U.rng(91 + v * 17);
        for (let k = 0; k < 4; k++) {
          const x = 6 + rng() * (P - 12), y = 8 + rng() * (P - 12);
          c.strokeStyle = rng() < 0.3 ? 'rgba(150,60,200,0.45)' : 'rgba(60,22,74,0.8)';
          c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, y);
          c.quadraticCurveTo(x + (rng() - 0.5) * 10, y - 6, x + (rng() - 0.5) * 8, y - 10);
          c.stroke();
        }
        c.strokeStyle = 'rgba(170,70,230,0.32)'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(P / 2 + (rng() - 0.5) * 16, P / 2 + (rng() - 0.5) * 16);
        for (let k = 0; k < 3; k++) c.lineTo(P / 2 + (rng() - 0.5) * 30, P / 2 + (rng() - 0.5) * 30);
        c.stroke();
        out.push({ canvas: cv, P });
      }
      return out;
    }
    updateRoadMask() {
      // soft discs stamped at 4 px per tile give organic, rounded edges when scaled up
      const m = this.map, K = 4;
      if (!this.roadCanvas) {
        this.roadCanvas = document.createElement('canvas');
        this.roadCanvas.width = m.w * K; this.roadCanvas.height = m.h * K;
        this.roadCtx = this.roadCanvas.getContext('2d');
        const d = (this.roadDisc = document.createElement('canvas'));
        d.width = d.height = 14;
        const c = d.getContext('2d');
        const gr = c.createRadialGradient(7, 7, 1, 7, 7, 7);
        gr.addColorStop(0, 'rgba(18,7,26,1)'); gr.addColorStop(0.55, 'rgba(18,7,26,0.95)'); gr.addColorStop(1, 'rgba(18,7,26,0)');
        c.fillStyle = gr; c.fillRect(0, 0, 14, 14);
      }
      const c = this.roadCtx;
      c.clearRect(0, 0, this.roadCanvas.width, this.roadCanvas.height);
      for (let i = 0; i < m.road.length; i++) {
        if (!m.road[i]) continue;
        const x = i % m.w, y = (i / m.w) | 0;
        const h = U.hash2(x, y, 29);
        const r = 6 + h * 2.5;
        c.drawImage(this.roadDisc, x * K + K / 2 - r + (h - 0.5) * 1.5, y * K + K / 2 - r + (U.hash2(x, y, 31) - 0.5) * 1.5, r * 2, r * 2);
      }
      this.roadVer = m.roadVersion;
      this.roadT = this.time;
    }
    // ------------------------------------------------------------------ chunk rendering
    chunkKey(cx, cy) { return (cy << 16) | cx; }
    renderChunk(cx, cy, scale) {
      const m = this.map;
      const W = m.w;
      const HALF = CPX / 2; // ground colour is computed at half resolution, then smoothed up
      const base = this._base || (this._base = document.createElement('canvas'));
      if (base.width !== HALF) { base.width = HALF; base.height = HALF; }
      const bctx = base.getContext('2d');
      const img = this._baseImg || (this._baseImg = bctx.createImageData(HALF, HALF));
      const d = img.data;
      const tc = this.tileCol;
      const nz = this.noise;
      const ox = cx * CPX, oy = cy * CPX;
      for (let py = 0; py < HALF; py++) {
        const wy = oy + py * 2 + 1;
        for (let px = 0; px < HALF; px++) {
          const wx = ox + px * 2 + 1;
          const j = nz.noise(wx * 0.06, wy * 0.06) - 0.5;
          let fx = wx / T - 0.5 + j * 0.7, fy = wy / T - 0.5 + (nz.noise(wx * 0.06 + 50, wy * 0.06 + 50) - 0.5) * 0.7;
          let x0 = Math.floor(fx), y0 = Math.floor(fy);
          let ax = fx - x0, ay = fy - y0;
          // sharpen the blend
          ax = ax < 0.3 ? 0 : ax > 0.7 ? 1 : (ax - 0.3) / 0.4;
          ay = ay < 0.3 ? 0 : ay > 0.7 ? 1 : (ay - 0.3) / 0.4;
          const x1 = Math.min(W - 1, Math.max(0, x0 + 1)), y1 = Math.min(m.h - 1, Math.max(0, y0 + 1));
          x0 = Math.min(W - 1, Math.max(0, x0)); y0 = Math.min(m.h - 1, Math.max(0, y0));
          const i00 = (y0 * W + x0) * 3, i10 = (y0 * W + x1) * 3, i01 = (y1 * W + x0) * 3, i11 = (y1 * W + x1) * 3;
          const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
          const tex = 0.86 + nz.noise(wx * 0.11, wy * 0.11) * 0.2 + (U.hash2(wx, wy, 3) - 0.5) * 0.08;
          const o = (py * HALF + px) * 4;
          d[o] = (tc[i00] * w00 + tc[i10] * w10 + tc[i01] * w01 + tc[i11] * w11) * tex;
          d[o + 1] = (tc[i00 + 1] * w00 + tc[i10 + 1] * w10 + tc[i01 + 1] * w01 + tc[i11 + 1] * w11) * tex;
          d[o + 2] = (tc[i00 + 2] * w00 + tc[i10 + 2] * w10 + tc[i01 + 2] * w01 + tc[i11 + 2] * w11) * tex;
          d[o + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);
      const ent = this.chunks.get(this.chunkKey(cx, cy)) || {};
      let cv = ent.canvas;
      const size = Math.round(CPX * scale);
      if (!cv || cv.width !== size) { cv = document.createElement('canvas'); cv.width = size; cv.height = size; }
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, 0, 0, size, size);
      ctx.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale);
      this.drawDecorations(ctx, cx, cy);
      ent.canvas = cv; ent.scale = scale; ent.ver = m.version; ent.used = this.frameN;
      this.chunks.set(this.chunkKey(cx, cy), ent);
      return ent;
    }
    drawDecorations(ctx, cx, cy) {
      const m = this.map;
      const { ell, circ, poly, line } = H();
      const tx0 = cx * CHUNK - 1, ty0 = cy * CHUNK - 1, tx1 = cx * CHUNK + CHUNK, ty1 = cy * CHUNK + CHUNK + 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(cx * CPX, cy * CPX, CPX, CPX); ctx.clip();
      const theme = m.theme;
      // ground details
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!m.inb(tx, ty)) continue;
          const t = m.terrain[ty * m.w + tx];
          const h = U.hash2(tx, ty, m.seed + 1);
          const wx = tx * T, wy = ty * T;
          if (t === TER.GRASS) {
            for (let k = 0; k < 3; k++) {
              const x = wx + U.hash2(tx, ty, k + 10) * T, y = wy + U.hash2(tx, ty, k + 20) * T;
              line(ctx, x, y, x - 1.5, y - 4, 'rgba(120,160,70,0.5)', 1);
              line(ctx, x + 1.5, y, x + 2.5, y - 3.5, 'rgba(40,70,20,0.5)', 1);
            }
            if (h < 0.06) { circ(ctx, wx + 10, wy + 12, 1.6, theme === 'garnath' ? '#c8b060' : '#e8e0a0'); circ(ctx, wx + 14, wy + 16, 1.4, '#d0a0d0'); }
          } else if (t === TER.ASH) {
            if (h < 0.15) ell(ctx, wx + h * 200 % T, wy + 16, 3, 2, 'rgba(40,36,34,0.5)');
            if (h > 0.9) line(ctx, wx + 6, wy + 20, wx + 16, wy + 18, 'rgba(30,26,24,0.5)', 1.5);
          } else if (t === TER.SAND) {
            if (h < 0.3) circ(ctx, wx + U.hash2(tx, ty, 4) * T, wy + U.hash2(tx, ty, 5) * T, 1.4, 'rgba(120,100,60,0.5)');
            if (h > 0.85) circ(ctx, wx + 18, wy + 10, 1.2, 'rgba(230,250,255,0.9)');
          } else if (t === TER.STONE) {
            ctx.strokeStyle = 'rgba(60,56,50,0.35)'; ctx.lineWidth = 1;
            ctx.strokeRect(wx + 0.5, wy + 0.5, T / 2, T / 2);
            ctx.strokeRect(wx + T / 2 + 0.5, wy + 0.5, T / 2 - 1, T / 2);
            ctx.strokeRect(wx + 0.5, wy + T / 2 + 0.5, T * 0.7, T / 2 - 1);
          } else if (t === TER.DIRT) {
            if (h < 0.4) circ(ctx, wx + U.hash2(tx, ty, 6) * T, wy + U.hash2(tx, ty, 7) * T, 1.3, 'rgba(70,56,36,0.6)');
          } else if (t === TER.ABYSS) {
            for (let k = 0; k < 2; k++) if (U.hash2(tx, ty, k + 30) < 0.4) circ(ctx, wx + U.hash2(tx, ty, k + 31) * T, wy + U.hash2(tx, ty, k + 32) * T, 0.7, k ? 'rgba(200,120,255,0.6)' : 'rgba(255,255,255,0.5)');
            // glowing rim
            const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.inb(tx + dx, ty + dy) && m.terrain[(ty + dy) * m.w + tx + dx] !== TER.ABYSS);
            if (rim) {
              const g = ctx.createRadialGradient(wx + T / 2, wy + T / 2, 2, wx + T / 2, wy + T / 2, T * 0.9);
              g.addColorStop(0, 'rgba(160,40,200,0.0)'); g.addColorStop(1, 'rgba(160,40,200,0.25)');
              ctx.fillStyle = g; ctx.fillRect(wx, wy, T, T);
            }
          } else if (t === TER.WATER || t === TER.SHALLOW) {
            if (h < 0.2) line(ctx, wx + 6, wy + 14, wx + 16, wy + 13, 'rgba(160,210,240,0.18)', 1);
          }
        }
      // rocks (mountains)
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!m.inb(tx, ty) || m.terrain[ty * m.w + tx] !== TER.ROCK) continue;
          const wx = tx * T, wy = ty * T;
          const n = 2;
          for (let k = 0; k < n; k++) {
            const bx = wx + 6 + U.hash2(tx, ty, 40 + k) * 20, by = wy + 6 + U.hash2(tx, ty, 50 + k) * 20;
            const r = 9 + U.hash2(tx, ty, 60 + k) * 8;
            const pts = [];
            for (let s = 0; s < 7; s++) {
              const a = (s / 7) * TAU + U.hash2(tx, ty, 70 + s) * 0.5;
              const rr = r * (0.7 + U.hash2(tx + s, ty, 80 + k) * 0.45);
              pts.push(bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.85);
            }
            const base = theme === 'abyss' || theme === 'courts' ? [70, 60, 76] : theme === 'kolvir' ? [124, 118, 110] : [108, 102, 94];
            const g = ctx.createLinearGradient(bx - r, by - r, bx + r, by + r);
            g.addColorStop(0, `rgb(${base[0] + 40},${base[1] + 40},${base[2] + 40})`);
            g.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
            g.addColorStop(1, `rgb(${base[0] - 45},${base[1] - 45},${base[2] - 45})`);
            ell(ctx, bx + 3, by + 4, r, r * 0.7, 'rgba(0,0,0,0.25)');
            poly(ctx, pts, g, 'rgba(20,18,16,0.6)', 1);
            line(ctx, bx - r * 0.4, by - r * 0.3, bx + r * 0.1, by - r * 0.5, 'rgba(255,255,255,0.22)', 1.2);
            if (theme === 'kolvir' && U.hash2(tx, ty, 99) < 0.3) poly(ctx, [bx - r * 0.3, by - r * 0.5, bx, by - r * 0.85, bx + r * 0.3, by - r * 0.5], 'rgba(240,244,250,0.85)');
          }
        }
      // trees
      const trees = [];
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!m.inb(tx, ty) || m.terrain[ty * m.w + tx] !== TER.FOREST) continue;
          for (let k = 0; k < 2; k++) {
            trees.push({ x: tx * T + 4 + U.hash2(tx, ty, 100 + k) * 24, y: ty * T + 4 + U.hash2(tx, ty, 110 + k) * 24, r: 10 + U.hash2(tx, ty, 120 + k) * 6, h: U.hash2(tx, ty, 130 + k) });
          }
        }
      trees.sort((a, b) => a.y - b.y);
      for (const tr of trees) this.drawTree(ctx, tr, theme);
      ctx.restore();
    }
    drawTree(ctx, tr, theme) {
      const { ell, circ, poly, line } = H();
      const { x, y, r, h } = tr;
      ell(ctx, x + 4, y + 5, r * 1.05, r * 0.7, 'rgba(0,0,0,0.3)');
      if (theme === 'abyss' || theme === 'courts') {
        // twisted black trees
        line(ctx, x, y + 4, x, y - r, '#1a1018', 2.2);
        for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.6; line(ctx, x, y - r * 0.5, x + Math.cos(a) * r, y - r * 0.5 + Math.sin(a) * r, '#24142a', 1.4); }
        circ(ctx, x, y - r * 0.9, r * 0.25, 'rgba(160,60,200,0.35)');
        return;
      }
      if (theme === 'kolvir' || (theme === 'garnath' && h > 0.75)) {
        // conifer
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, '#3e6a34'); g.addColorStop(1, '#1a3218');
        for (let k = 0; k < 3; k++) {
          const s = r * (1 - k * 0.25);
          poly(ctx, [x - s, y - k * r * 0.35 + 2, x, y - s * 1.3 - k * r * 0.35, x + s, y - k * r * 0.35 + 2], g, 'rgba(10,20,8,0.6)');
        }
        return;
      }
      if (theme === 'garnath' && h < 0.12) {
        // dead tree of the cursed vale
        line(ctx, x, y + 4, x, y - r, '#4a3a2e', 2.4);
        line(ctx, x, y - r * 0.4, x - r * 0.7, y - r, '#4a3a2e', 1.4);
        line(ctx, x, y - r * 0.6, x + r * 0.6, y - r * 1.1, '#4a3a2e', 1.4);
        return;
      }
      const dark = theme === 'arden' ? '#1c3816' : '#24401c';
      const mid = theme === 'arden' ? '#2e5a24' : '#3a6028';
      const lit = theme === 'arden' ? '#4c8034' : '#5a8a3a';
      circ(ctx, x, y - 2, r, dark);
      circ(ctx, x - r * 0.35, y - r * 0.35, r * 0.65, mid);
      circ(ctx, x + r * 0.3, y - r * 0.15, r * 0.6, mid);
      circ(ctx, x - r * 0.35, y - r * 0.55, r * 0.35, lit);
      if (h > 0.9) circ(ctx, x + r * 0.2, y - r * 0.3, 1.6, '#c03030');
    }
    getChunk(cx, cy) {
      const want = this.cam.zoom >= 0.7 ? Math.min(2, this.dpr * Math.min(1.5, Math.max(1, this.cam.zoom))) : 1;
      const scale = Math.round(want * 2) / 2;
      const key = this.chunkKey(cx, cy);
      let ent = this.chunks.get(key);
      const dirty = this.map.dirtyChunks.has(key);
      if (ent && ent.canvas && !dirty && ent.scale >= scale - 0.01) { ent.used = this.frameN; return ent; }
      if (ent && ent.canvas && this.chunkBudget <= 0) { ent.used = this.frameN; return ent; }
      if (this.chunkBudget <= 0) return null;
      this.chunkBudget--;
      if (dirty) this.map.dirtyChunks.delete(key);
      return this.renderChunk(cx, cy, scale);
    }
    evictChunks() {
      const max = 260;
      if (this.chunks.size <= max) return;
      const arr = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < arr.length - max; i++) this.chunks.delete(arr[i][0]);
    }
    prewarm(all) {
      // render terrain chunks before play starts (the whole map when `all`), so scrolling never stalls
      this.frameN = (this.frameN || 0) + 1;
      this.chunkBudget = 1e9;
      const nx = Math.ceil(this.map.w / CHUNK), ny = Math.ceil(this.map.h / CHUNK);
      if (all) {
        for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) this.getChunk(cx, cy);
      } else {
        const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.vw, this.vh);
        for (let cy = Math.max(0, Math.floor(y0 / CPX)); cy <= Math.min(ny - 1, Math.floor(y1 / CPX)); cy++)
          for (let cx = Math.max(0, Math.floor(x0 / CPX)); cx <= Math.min(nx - 1, Math.floor(x1 / CPX)); cx++) this.getChunk(cx, cy);
      }
      this.chunkBudget = 0;
    }
    // ------------------------------------------------------------------ fog
    updateFog() {
      const g = this.game, p = g.players[g.localPlayer];
      if (!p || !p.vis) return;
      const d = this.fogImg.data;
      const v = p.vis, ex = p.explored;
      const n = v.length;
      const fogOn = g.fog;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        d[o] = 6; d[o + 1] = 7; d[o + 2] = 12;
        d[o + 3] = !fogOn || v[i] ? 0 : ex[i] ? 140 : 255;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
    }

    // ------------------------------------------------------------------ main render
    render(alpha, dt) {
      const g = this.game, ctx = this.ctx;
      this.time += dt || 0;
      this.frameN = (this.frameN || 0) + 1;
      this.chunkBudget = this.frameN < 3 ? 60 : 2;
      const z = this.cam.zoom, dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      let shx = 0, shy = 0;
      if (this.screenShake > 0) { this.screenShake -= dt || 0.016; shx = (Math.random() - 0.5) * 6 * this.screenShake; shy = (Math.random() - 0.5) * 6 * this.screenShake; }
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.vw / 2 - this.cam.x * z + shx), dpr * (this.vh / 2 - this.cam.y * z + shy));
      const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.vw, this.vh);
      this.view = { x0: x0 - 64, y0: y0 - 64, x1: x1 + 64, y1: y1 + 160 };
      // terrain chunks
      ctx.imageSmoothingEnabled = true;
      const cx0 = Math.max(0, Math.floor(x0 / CPX)), cy0 = Math.max(0, Math.floor(y0 / CPX));
      const cx1 = Math.min(Math.ceil(this.map.w / CHUNK) - 1, Math.floor(x1 / CPX)), cy1 = Math.min(Math.ceil(this.map.h / CHUNK) - 1, Math.floor(y1 / CPX));
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const ch = this.getChunk(cx, cy);
          if (ch) ctx.drawImage(ch.canvas, cx * CPX, cy * CPX, CPX, CPX);
          else { ctx.fillStyle = '#2a3020'; ctx.fillRect(cx * CPX, cy * CPX, CPX, CPX); }
        }
      if (this.frameN % 60 === 0) this.evictChunks();
      this.drawWater(ctx);
      this.drawRoad(ctx);
      this.drawDecals(ctx, dt);
      this.drawSites(ctx);
      this.drawResources(ctx);
      this.drawCorpses(ctx, dt);
      this.drawSelectionUnder(ctx, alpha);
      this.drawBuildings(ctx);
      this.drawUnits(ctx, alpha, false);
      this.drawProjectiles(ctx, alpha);
      this.drawUnits(ctx, alpha, true);
      this.updateAndDrawFx(ctx, dt || 0);
      // fog
      if (g.fog) {
        if (g.tickN !== this.lastFogTick) { this.updateFog(); this.lastFogTick = g.tickN; }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.fogCanvas, 0, 0, this.map.w * T, this.map.h * T);
      }
      // world edge
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6 / z;
      ctx.strokeRect(0, 0, this.map.w * T, this.map.h * T);
      this.drawOverlays(ctx, alpha);
    }

    drawWater(ctx) {
      const m = this.map, v = this.view;
      const tx0 = Math.max(0, Math.floor(v.x0 / T)), ty0 = Math.max(0, Math.floor(v.y0 / T));
      const tx1 = Math.min(m.w - 1, Math.floor(v.x1 / T)), ty1 = Math.min(m.h - 1, Math.floor(v.y1 / T));
      if (this.cam.zoom < 0.5) return;
      const t = this.time;
      ctx.lineWidth = 1;
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) {
          const tt = m.terrain[ty * m.w + tx];
          if (tt !== TER.WATER && tt !== TER.SHALLOW && tt !== TER.ABYSS) continue;
          const h = U.hash2(tx, ty, 7);
          if (tt === TER.ABYSS) {
            if (h < 0.25) {
              const a = 0.3 + 0.3 * Math.sin(t * 1.5 + h * 30);
              ctx.fillStyle = 'rgba(220,150,255,' + a.toFixed(3) + ')';
              ctx.fillRect(tx * T + h * 120 % 30, ty * T + (h * 77) % 30, 1.2, 1.2);
            }
            continue;
          }
          const ph = t * 1.2 + h * 10;
          const x = tx * T + 4 + h * 10, y = ty * T + 10 + Math.sin(ph) * 4;
          ctx.strokeStyle = 'rgba(190,225,255,' + (0.1 + 0.08 * Math.sin(ph * 1.3)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 2, x + 12, y); ctx.stroke();
        }
    }
    drawRoad(ctx) {
      const m = this.map, v = this.view;
      if (!m.roadVersion) return;
      if (!this.roadCanvas || (this.roadVer !== m.roadVersion && this.time - (this.roadT || 0) > 0.25)) this.updateRoadMask();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.roadCanvas, 0, 0, m.w * T, m.h * T);
      const tx0 = Math.max(0, Math.floor(v.x0 / T)), ty0 = Math.max(0, Math.floor(v.y0 / T));
      const tx1 = Math.min(m.w - 1, Math.floor(v.x1 / T)), ty1 = Math.min(m.h - 1, Math.floor(v.y1 / T));
      if (this.cam.zoom < 0.55) return;
      const sp = this.roadSprites;
      const t = this.time;
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!m.road[ty * m.w + tx]) continue;
          const h = U.hash2(tx, ty, 13);
          if (h > 0.45) continue;
          const s = sp[((h / 0.45) * 4) | 0];
          ctx.drawImage(s.canvas, tx * T + T / 2 - s.P / 2, ty * T + T / 2 - s.P / 2, s.P, s.P);
        }
      // waving tendrils and a slow violet pulse
      ctx.lineWidth = 1.2;
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!m.road[ty * m.w + tx]) continue;
          const h = U.hash2(tx, ty, 17);
          if (h > 0.3) continue;
          const x = tx * T + h * 80 % T, y = ty * T + (h * 53) % T;
          const sw = Math.sin(t * 2 + h * 40) * 4;
          ctx.strokeStyle = 'rgba(150,60,200,' + (0.4 + 0.25 * Math.sin(t * 1.3 + h * 20)).toFixed(2) + ')';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw, y - 6, x + sw * 1.5, y - 11); ctx.stroke();
        }
    }
    drawDecals(ctx, dt) {
      const out = [];
      for (const d of this.decals) {
        d.t -= dt || 0;
        if (d.t <= 0) continue;
        out.push(d);
        const a = Math.min(1, d.t / 5) * d.a;
        ctx.globalAlpha = a;
        if (d.kind === 'rubble') {
          const { ell, circ } = H();
          ell(ctx, d.x, d.y, d.r, d.r * 0.7, 'rgba(30,26,22,0.7)');
          for (let k = 0; k < 10; k++) circ(ctx, d.x + Math.cos(k * 2.4) * d.r * 0.6 * ((k * 37) % 10) / 10, d.y + Math.sin(k * 2.4) * d.r * 0.45 * ((k * 53) % 10) / 10, 3 + (k % 3), d.chaos ? '#2a2030' : '#7a7266');
        } else if (d.kind === 'scorch') {
          H().ell(ctx, d.x, d.y, d.r, d.r * 0.75, 'rgba(10,8,6,0.55)');
        } else if (d.kind === 'blood') {
          H().ell(ctx, d.x, d.y, d.r, d.r * 0.7, d.color || 'rgba(90,10,10,0.6)');
        }
        ctx.globalAlpha = 1;
      }
      this.decals = out;
    }
    inView(x, y, r) {
      const v = this.view;
      return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
    }
    drawSites(ctx) {
      const g = this.game;
      const { ell, circ } = H();
      for (const s of g.sites) {
        if (!this.inView(s.x, s.y, 80)) continue;
        if (s.isPattern) {
          ell(ctx, s.x, s.y, 58, 44, 'rgba(10,14,30,0.85)', 'rgba(140,190,255,0.6)', 2);
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 1.5);
          AC.Art.drawPattern(ctx, s.x, s.y, 52, 39, '#bfe0ff', 2, 9);
          AC.Art.drawPattern(ctx, s.x, s.y, 52, 39, 'rgba(90,150,255,0.35)', 6, 9);
          ctx.globalAlpha = 1;
          continue;
        }
        const own = s.capOwner >= 0 ? g.players[s.capOwner].color : null;
        ell(ctx, s.x, s.y, 46, 36, 'rgba(0,0,0,0.25)');
        ell(ctx, s.x, s.y, 42, 32, '#b8b2a6', 'rgba(0,0,0,0.5)', 1.5);
        ell(ctx, s.x, s.y, 36, 27, '#cfc9bc');
        const col = own ? own.light : 'rgba(110,140,190,0.8)';
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 2 + s.id);
        ctx.globalAlpha = own ? pulse : 0.75;
        AC.Art.drawPattern(ctx, s.x, s.y, 33, 25, col, 1.5, 6);
        ctx.globalAlpha = 1;
        // the break
        ctx.strokeStyle = 'rgba(30,10,40,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(s.x + 6, s.y - 26); ctx.lineTo(s.x + 12, s.y - 10); ctx.lineTo(s.x + 4, s.y + 2); ctx.lineTo(s.x + 14, s.y + 20); ctx.stroke();
        ctx.strokeStyle = 'rgba(200,80,255,' + (0.4 + 0.3 * pulse) + ')'; ctx.lineWidth = 1; ctx.stroke();
        if (s.capProgress > 0 && s.capProgress < 1) {
          const by = s.capBy >= 0 ? g.players[s.capBy] : own ? g.players[s.capOwner] : null;
          ctx.strokeStyle = by ? by.color.main : '#fff'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.ellipse(s.x, s.y, 48, 38, 0, -Math.PI / 2, -Math.PI / 2 + TAU * s.capProgress); ctx.stroke();
        }
        if (own) { ctx.strokeStyle = own.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(s.x, s.y, 44, 34, 0, 0, TAU); ctx.stroke(); }
      }
    }
    drawResources(ctx) {
      const g = this.game;
      const { ell, poly } = H();
      const p = g.players[g.localPlayer];
      for (const r of g.resources) {
        if (r.dead || !this.inView(r.x, r.y, 30)) continue;
        if (g.fog && p && !p.explored[r.ty * g.map.w + r.tx]) continue;
        const f = 0.45 + 0.55 * (r.amount / r.maxAmount);
        const n = 5;
        ell(ctx, r.x + 2, r.y + 6, 15 * f + 4, 7, 'rgba(0,0,0,0.25)');
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + r.id;
          const dx = Math.cos(a) * 8 * f, dy = Math.sin(a) * 5 * f;
          const h = (9 + (k % 3) * 4) * f;
          const x = r.x + dx, y = r.y + dy + 4;
          poly(ctx, [x - 4, y, x, y - h, x + 4, y, x, y + 3], k % 2 ? '#c8f0ff' : '#e8fcff', 'rgba(60,120,160,0.8)', 0.8);
          poly(ctx, [x, y - h, x + 4, y, x, y + 3], 'rgba(120,190,230,0.55)');
        }
        const tw = Math.sin(this.time * 3 + r.id * 1.7);
        if (tw > 0.85) {
          ctx.fillStyle = 'rgba(255,255,255,' + ((tw - 0.85) * 6).toFixed(2) + ')';
          ctx.fillRect(r.x - 6, r.y - 10, 12, 1); ctx.fillRect(r.x - 0.5, r.y - 16, 1, 12);
        }
      }
    }
    drawCorpses(ctx, dt) {
      const out = [];
      for (const c of this.corpses) {
        c.t -= dt || 0;
        if (c.t <= 0) continue;
        out.push(c);
        if (!this.inView(c.x, c.y, 40)) continue;
        ctx.globalAlpha = Math.min(1, c.t / 1.5) * 0.85;
        const stub = { def: { art: c.art, radius: c.r, air: false }, angle: c.angle, anim: 0, atkAnim: 0, radius: c.r * 0.95, buffs: [] };
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(1, 0.75);
        ctx.filter = 'none';
        AC.Art.drawUnit(ctx, stub, 0, 0, 0, c.color);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      this.corpses = out;
    }
    drawSelectionUnder(ctx, alpha) {
      const ui = AC.ui;
      if (!ui) return;
      const g = this.game;
      ctx.lineWidth = 1.6 / Math.max(0.6, this.cam.zoom);
      for (const id of ui.selected) {
        const e = g.get(id);
        if (!e || e.dead) continue;
        const col = e.owner === g.localPlayer ? '#5dff7a' : g.areAllies(e.owner, g.localPlayer) ? '#7ad0ff' : g.players[e.owner] && g.players[e.owner].isNeutral ? '#ffe060' : '#ff5050';
        let x = e.x, y = e.y;
        if (e.kind === 'unit') { x = e.prevX + (e.x - e.prevX) * alpha; y = e.prevY + (e.y - e.prevY) * alpha; }
        ctx.strokeStyle = col;
        ctx.beginPath();
        if (e.kind === 'building') ctx.ellipse(x, y + e.radius * 0.15, e.radius * 1.05, e.radius * 0.8, 0, 0, TAU);
        else ctx.ellipse(x, y + 2, e.radius * 1.15, e.radius * 0.85, 0, 0, TAU);
        ctx.stroke();
      }
      // hover ring
      const h = ui.hover && g.get(ui.hover);
      if (h && !h.dead && ui.selected.indexOf(h.id) < 0 && (h.kind === 'unit' || h.kind === 'building')) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(h.x, h.y + 2, h.radius * 1.15, h.radius * 0.85, 0, 0, TAU); ctx.stroke();
      }
    }
    drawBuildings(ctx) {
      const g = this.game;
      const p = g.players[g.localPlayer];
      const scale = this.dpr * Math.max(1, Math.min(1.5, this.cam.zoom));
      const list = [];
      for (const b of g.buildings) {
        if (b.dead || !this.inView(b.x, b.y, b.radius + 140)) continue;
        if (g.fog && !g.visibleTo(g.localPlayer, b)) continue;
        list.push(b);
      }
      // ghosts of remembered enemy buildings
      if (p && g.fog) {
        for (const [id, gh] of p.ghosts) {
          const b = g.get(id);
          if (b && !b.dead && g.visibleTo(g.localPlayer, b)) continue;
          if (!this.inView(gh.x, gh.y, 200)) continue;
          list.push({ ghost: true, def: gh.def, x: gh.x, y: gh.y, tx: gh.tx, ty: gh.ty, size: gh.def.size, owner: gh.owner, built: gh.built, progress: gh.progress, radius: gh.def.size * T / 2 });
        }
      }
      list.sort((a, b) => a.y - b.y);
      for (const b of list) this.drawBuilding(ctx, b, scale);
    }
    drawBuilding(ctx, b, scale) {
      const g = this.game;
      const col = g.players[b.owner] ? g.players[b.owner].color : AC.NEUTRAL_COLOR;
      const sp = AC.Art.buildingSprite(b.def.id, col, Math.round(scale * 2) / 2);
      const S = sp.S;
      const x = b.tx * T, y = b.ty * T;
      ctx.save();
      // shadow
      H().ell(ctx, b.x + 6, b.y + S * 0.25, S * 0.55, S * 0.32, 'rgba(0,0,0,0.25)');
      if (!b.built) {
        const p = Math.max(0.05, b.progress);
        if (b.def.faction === 'chaos') {
          ctx.globalAlpha = 0.35 + 0.6 * p;
          ctx.translate(b.x, y + S);
          ctx.scale(0.6 + 0.4 * p, 0.3 + 0.7 * p);
          ctx.translate(-b.x, -(y + S));
          ctx.drawImage(sp.canvas, x, y - sp.pad, S, S + sp.pad);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = 0.4 * (1 - p) + 0.15;
          H().ell(ctx, b.x, b.y, S * 0.5, S * 0.4, 'rgba(180,60,255,0.5)');
        } else {
          // foundation and scaffold
          ctx.fillStyle = 'rgba(120,100,70,0.7)';
          ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
          const hh = (S + sp.pad) * p;
          ctx.beginPath(); ctx.rect(x - 20, y + S - hh, S + 40, hh + 20); ctx.clip();
          ctx.globalAlpha = 0.9;
          ctx.drawImage(sp.canvas, x, y - sp.pad, S, S + sp.pad);
          ctx.restore();
          ctx.save();
          ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2;
          for (let k = 0; k <= 3; k++) { const xx = x + 4 + k * (S - 8) / 3; ctx.beginPath(); ctx.moveTo(xx, y + S - 2); ctx.lineTo(xx, y + S - 10 - S * 0.6); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(x + 4, y + S * 0.6); ctx.lineTo(x + S - 4, y + S * 0.6); ctx.stroke();
        }
        ctx.restore();
        return;
      }
      if (b.ghost) ctx.globalAlpha = 0.55;
      ctx.drawImage(sp.canvas, x, y - sp.pad, S, S + sp.pad);
      ctx.globalAlpha = 1;
      if (!b.ghost) this.drawBuildingAnim(ctx, b, S);
      ctx.restore();
    }
    drawBuildingAnim(ctx, b, S) {
      const t = this.time;
      const x = b.tx * T, y = b.ty * T;
      const { circ, ell } = H();
      switch (b.def.art) {
        case 'logrus_shrine':
          AC.Art.drawLogrus(ctx, b.x, y + S / 2 - 12, S * 0.34, t, 'rgba(230,150,255,0.55)');
          break;
        case 'circle':
          AC.Art.drawLogrus(ctx, b.x, b.y, S * 0.4, t * 1.5, 'rgba(255,90,220,0.5)');
          break;
        case 'serpent_eye': {
          const tg = b.targetId ? this.game.get(b.targetId) : null;
          const a = tg ? Math.atan2(tg.y - b.y, tg.x - b.x) : Math.sin(t * 0.5) * 2;
          circ(ctx, b.x + Math.cos(a) * 4, y + S * 0.1 - 6 + Math.sin(a) * 2.5, 5, '#c01010');
          ell(ctx, b.x + Math.cos(a) * 4, y + S * 0.1 - 6 + Math.sin(a) * 2.5, 1.5, 4, '#000');
          break;
        }
        case 'lighthouse': {
          const a = t * 1.5;
          ctx.save();
          ctx.globalAlpha = 0.18;
          ctx.translate(b.x, y + S - 12 - 66);
          ctx.rotate(a);
          ctx.fillStyle = '#fff6c0';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(160, -26); ctx.lineTo(160, 26); ctx.closePath(); ctx.fill();
          ctx.restore();
          circ(ctx, b.x, y + S - 12 - 66, 6 + Math.sin(t * 6), 'rgba(255,250,200,0.9)');
          break;
        }
        case 'shrine': {
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 1.5);
          AC.Art.drawPattern(ctx, b.x, y + S / 2 + 4, S * 0.36, S * 0.31, '#bfe0ff', 3, 5);
          ctx.globalAlpha = 1;
          break;
        }
        case 'spire':
        case 'bastion': {
          ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 2);
          ell(ctx, b.x, y + S * 0.62 - S * 0.6, 10, 10, 'rgba(255,120,255,0.6)');
          ctx.globalAlpha = 1;
          break;
        }
        case 'pit':
          ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 4 + b.id);
          ell(ctx, b.x, y + S / 2 + 4, S * 0.18, S * 0.14, '#ffb040');
          ctx.globalAlpha = 1;
          break;
        case 'armory':
          if (Math.random() < 0.1) this.fx.push({ type: 'smoke', x: x + S - 24, y: y - 4, t: 2, max: 2, vx: 6, vy: -18, r: 5 });
          break;
        case 'brand_tower':
          for (let k = 0; k < 4; k++) {
            const a = t * (0.4 + k * 0.15) + k * 1.6;
            circ(ctx, b.x + Math.cos(a) * 60, y + S - 80 + Math.sin(a) * 26, 6 + k * 2, '#5a5a62', '#222', 1);
          }
          break;
      }
      // damage fire/smoke
      if (b.hp < b.maxHp * 0.5) {
        const n = b.hp < b.maxHp * 0.25 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const fx = x + S * (0.3 + 0.4 * ((b.id * (k + 3)) % 7) / 7), fy = y + S * 0.4;
          const f = 0.7 + 0.3 * Math.sin(t * 12 + k * 3);
          ctx.globalAlpha = 0.85;
          ell(ctx, fx, fy - 4 * f, 4 * f, 7 * f, b.def.faction === 'chaos' ? '#c040ff' : '#ff8020');
          ell(ctx, fx, fy - 3 * f, 2 * f, 4 * f, '#ffe080');
          ctx.globalAlpha = 1;
          if (Math.random() < 0.08) this.fx.push({ type: 'smoke', x: fx, y: fy - 10, t: 2.2, max: 2.2, vx: 4, vy: -20, r: 6 });
        }
      }
    }
    drawUnits(ctx, alpha, air) {
      const g = this.game;
      const list = [];
      for (const u of g.units) {
        if (u.dead || !!u.def.air !== air) continue;
        const x = u.prevX + (u.x - u.prevX) * alpha, y = u.prevY + (u.y - u.prevY) * alpha;
        if (!this.inView(x, y, 60)) continue;
        const vis = g.visibleTo(g.localPlayer, u);
        const ownStealth = u.owner === g.localPlayer && g.isStealthed(u);
        if (!vis) continue;
        list.push([u, x, y, ownStealth]);
      }
      list.sort((a, b) => a[2] - b[2]);
      const t = this.time;
      for (const [u, x, y, st] of list) {
        const p = g.players[u.owner];
        const col = p ? p.color : AC.NEUTRAL_COLOR;
        if (st || (g.isStealthed(u) && u.owner !== g.localPlayer)) ctx.globalAlpha = 0.45;
        // buff visuals under unit
        if (u.def.hero) {
          ctx.globalAlpha *= 0.5;
          H().ell(ctx, x, y + 2, u.radius * 1.4, u.radius * 1.0, null, col.light, 1.5);
          ctx.globalAlpha = st ? 0.45 : 1;
        }
        let sc = 1;
        for (const bf of u.buffs) if (bf.id === 'chaosShape') sc = 1;
        AC.Art.drawUnit(ctx, u, x, y, t, col, { scale: sc });
        ctx.globalAlpha = 1;
        this.drawBuffFx(ctx, u, x, y - (u.def.air ? 22 : 0));
      }
    }
    drawBuffFx(ctx, u, x, y) {
      if (!u.buffs.length && !u.channel) return;
      const t = this.time;
      const { circ, ell, line } = H();
      for (const b of u.buffs) {
        switch (b.id) {
          case 'stun':
            for (let k = 0; k < 3; k++) { const a = t * 4 + (k * TAU) / 3; circ(ctx, x + Math.cos(a) * 9, y - u.radius - 8 + Math.sin(a) * 3, 2, '#ffe060'); }
            break;
          case 'root':
            ctx.strokeStyle = 'rgba(180,90,255,0.8)'; ctx.lineWidth = 1.5;
            for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * u.radius, y + Math.sin(a) * u.radius * 0.7); ctx.quadraticCurveTo(x + Math.cos(a) * 4, y - 6, x, y - 2); ctx.stroke(); }
            break;
          case 'hunted':
            ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(x, y - u.radius - 12, 5, 0, TAU); ctx.stroke();
            line(ctx, x - 8, y - u.radius - 12, x + 8, y - u.radius - 12, 'rgba(255,60,60,0.9)', 1);
            line(ctx, x, y - u.radius - 20, x, y - u.radius - 4, 'rgba(255,60,60,0.9)', 1);
            break;
          case 'holdLine':
          case 'riposte':
            ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
            ell(ctx, x, y, u.radius * 1.5, u.radius * 1.3, null, b.id === 'riposte' ? '#ff6060' : '#a0b8ff', 2.5);
            ctx.globalAlpha = 1;
            break;
          case 'haste':
          case 'surge':
          case 'drum':
            if (Math.random() < 0.15) this.fx.push({ type: 'mote', x: x + (Math.random() - 0.5) * 14, y: y + 6, vy: -20, t: 0.6, max: 0.6, color: b.id === 'surge' ? '#e070ff' : b.id === 'drum' ? '#e0e8ff' : '#ffd060' });
            break;
          case 'fury':
          case 'chaosShape':
            ctx.globalAlpha = 0.3;
            circ(ctx, x, y, u.radius * 1.4, b.id === 'fury' ? '#ff2020' : '#a020ff');
            ctx.globalAlpha = 1;
            break;
          case 'poison':
            if (Math.random() < 0.1) this.fx.push({ type: 'mote', x, y: y - 4, vy: -14, t: 0.6, max: 0.6, color: '#80ff40' });
            break;
          case 'weaken':
            if (Math.random() < 0.08) this.fx.push({ type: 'mote', x, y: y - 8, vy: -10, t: 0.8, max: 0.8, color: '#9090b0' });
            break;
          case 'slow':
            ctx.globalAlpha = 0.4; ell(ctx, x, y + 3, u.radius, u.radius * 0.6, null, '#80c0ff', 1.5); ctx.globalAlpha = 1;
            break;
        }
      }
      if (u.channel) {
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 10);
        ell(ctx, x, y, u.radius * 1.6, u.radius * 1.2, null, '#ffe08a', 2);
        ctx.globalAlpha = 1;
      }
    }
    drawProjectiles(ctx, alpha) {
      const g = this.game;
      const { circ, line, poly } = H();
      for (const p of g.projectiles) {
        const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
        if (!this.inView(x, y, 30)) continue;
        if (g.fog && !g.tileVisible(g.players[g.localPlayer], x, y)) continue;
        const a = p.angle != null ? p.angle : Math.atan2(p.ty - p.sy, p.tx - p.sx);
        let lift = 0;
        if (p.arc) {
          const done = 1 - Math.hypot(p.tx - x, p.ty - y) / (p.dist0 || 1);
          lift = Math.sin(U.clamp(done, 0, 1) * Math.PI) * Math.min(90, p.dist0 * 0.3);
          H().ell(ctx, x, y, 4, 2.5, 'rgba(0,0,0,0.3)');
        }
        const dx = Math.cos(a), dy = Math.sin(a);
        const yy = y - lift - 8;
        switch (p.kind) {
          case 'arrow': case 'bolt': case 'javelin':
            line(ctx, x - dx * 10, yy - dy * 10, x, yy, p.kind === 'bolt' ? '#3a3040' : '#7a5a30', p.kind === 'javelin' ? 2.2 : 1.4);
            line(ctx, x - dx * 2, yy - dy * 2, x, yy, '#d0d0d8', 1.6);
            break;
          case 'silver':
            ctx.globalAlpha = 0.5; line(ctx, x - dx * 26, yy - dy * 26, x, yy, '#ffffff', 4); ctx.globalAlpha = 1;
            line(ctx, x - dx * 12, yy - dy * 12, x, yy, '#e8f0ff', 2);
            break;
          case 'bullet':
            line(ctx, x - dx * 16, yy - dy * 16, x, yy, 'rgba(255,230,160,0.9)', 1.5);
            break;
          case 'feather':
            line(ctx, x - dx * 8, yy - dy * 8, x, yy, '#f0e8d0', 2.5);
            break;
          case 'shell':
            circ(ctx, x, yy, 4, '#2a2a2a', '#000', 1);
            break;
          case 'glob':
            circ(ctx, x, yy, 5, '#a0e040', '#304010', 1);
            break;
          case 'prism':
            circ(ctx, x, yy, 5, 'rgba(200,250,255,0.9)');
            circ(ctx, x, yy, 9, 'rgba(255,180,250,0.35)');
            break;
          default: {
            const c = { magic: '#ff80ff', water: '#90f0ff', wisp: '#d080ff', fire: '#ff9030', sphere: '#e0e0f0', tendril: '#c060ff' }[p.kind] || '#fff';
            ctx.globalAlpha = 0.4; circ(ctx, x - dx * 5, yy - dy * 5, 6, c); ctx.globalAlpha = 1;
            circ(ctx, x, yy, 3.5, c);
            circ(ctx, x, yy, 1.6, '#fff');
          }
        }
      }
    }

    // ------------------------------------------------------------------ effects
    consumeFx() {
      const g = this.game;
      const q = g.fxq;
      for (let i = 0; i < q.length; i++) {
        const f = q[i];
        if (f.type === 'sfx') { if (AC.audio) AC.audio.playAt(f.name, f.x, f.y, this); continue; }
        this.spawnFx(f);
      }
      q.length = 0;
    }
    spawnFx(f) {
      const g = this.game;
      if (f.x != null && !this.inView(f.x, f.y, 300) && f.type !== 'storm' && f.type !== 'wave') return;
      // effects inside fog are hidden (except own)
      const p = g.players[g.localPlayer];
      if (g.fog && f.x != null && p && !g.tileVisible(p, f.x, f.y) && f.player !== g.localPlayer && f.type !== 'wave' && f.type !== 'storm') return;
      switch (f.type) {
        case 'spark':
          for (let k = 0; k < (f.big ? 10 : 4); k++) this.fx.push({ type: 'spark', x: f.x, y: f.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.8) * 120, t: 0.25, max: 0.25, color: f.color });
          break;
        case 'hit':
          this.fx.push({ type: 'flash', x: f.x, y: f.y - 8, r: f.kind === 'bullet' ? 5 : 8, t: 0.15, max: 0.15, color: { magic: '#ff80ff', water: '#90f0ff', wisp: '#d080ff', fire: '#ff9030', silver: '#ffffff', sphere: '#e0e0ff', tendril: '#c060ff', prism: '#c8faff' }[f.kind] || '#fff0c0' });
          break;
        case 'muzzle':
          this.fx.push({ type: 'flash', x: f.x, y: f.y - 8, r: 7, t: 0.08, max: 0.08, color: '#fff0a0' });
          this.fx.push({ type: 'smoke', x: f.x, y: f.y - 8, t: 0.9, max: 0.9, vx: Math.cos(f.angle) * 20, vy: Math.sin(f.angle) * 20 - 8, r: 4, light: true });
          break;
        case 'explosion':
          this.fx.push({ type: 'boom', x: f.x, y: f.y, r: f.r || 30, t: 0.45, max: 0.45, kind: f.kind });
          for (let k = 0; k < 6; k++) this.fx.push({ type: 'smoke', x: f.x + (Math.random() - 0.5) * f.r, y: f.y + (Math.random() - 0.5) * f.r * 0.6, t: 1.5, max: 1.5, vx: (Math.random() - 0.5) * 20, vy: -15 - Math.random() * 15, r: 7, color: f.kind === 'glob' ? 'rgba(90,140,40,' : null });
          this.decals.push({ kind: 'scorch', x: f.x, y: f.y, r: (f.r || 30) * 0.6, t: 12, a: 0.8 });
          if (f.kind === 'shell' || f.kind === 'fire') this.screenShake = Math.max(this.screenShake, 0.25);
          break;
        case 'death':
          this.corpses.push({ x: f.x, y: f.y, art: f.art, angle: f.angle, r: f.r, t: f.air ? 0.6 : 4, color: g.players[f.owner] ? g.players[f.owner].color : AC.NEUTRAL_COLOR });
          if (this.corpses.length > 80) this.corpses.shift();
          for (let k = 0; k < 5; k++) this.fx.push({ type: 'smoke', x: f.x, y: f.y, t: 0.7, max: 0.7, vx: (Math.random() - 0.5) * 30, vy: -10, r: 4, light: true });
          break;
        case 'collapse':
          for (let k = 0; k < 18; k++) this.fx.push({ type: 'debris', x: f.x + (Math.random() - 0.5) * f.size * T * 0.6, y: f.y, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 140, t: 1.0, max: 1.0, color: f.faction === 'chaos' ? '#2a2032' : '#8a8070' });
          for (let k = 0; k < 14; k++) this.fx.push({ type: 'smoke', x: f.x + (Math.random() - 0.5) * f.size * T * 0.7, y: f.y + (Math.random() - 0.5) * f.size * T * 0.5, t: 2.5, max: 2.5, vx: (Math.random() - 0.5) * 20, vy: -20, r: 10 });
          this.fx.push({ type: 'boom', x: f.x, y: f.y, r: f.size * T * 0.6, t: 0.6, max: 0.6, kind: 'fire' });
          this.decals.push({ kind: 'rubble', x: f.x, y: f.y, r: f.size * T * 0.45, t: 40, a: 1, chaos: f.faction === 'chaos' });
          this.screenShake = Math.max(this.screenShake, 0.4);
          break;
        case 'float':
          this.fx.push({ type: 'text', x: f.x, y: f.y, text: f.text, color: f.color, t: f.small ? 0.9 : 1.6, max: f.small ? 0.9 : 1.6, small: f.small });
          break;
        case 'ring':
          this.fx.push({ type: 'ring', x: f.x, y: f.y, r: f.r, t: f.t || 0.6, max: f.t || 0.6, color: f.color });
          break;
        case 'pattern':
          this.fx.push({ type: 'pattern', x: f.x, y: f.y, r: f.r, t: 1.6, max: 1.6 });
          break;
        case 'storm':
          this.fx.push({ type: 'storm', x: f.x, y: f.y, r: f.r, t: f.t, max: f.t });
          break;
        case 'wave':
          this.fx.push({ type: 'wave', x: f.x, y: f.y, r: f.r, t: f.t, max: f.t });
          break;
        case 'lightning':
          this.fx.push({ type: 'bolt', x: f.x, y: f.y, t: 0.25, max: 0.25, seed: Math.random() * 1000 });
          this.fx.push({ type: 'flash', x: f.x, y: f.y, r: 26, t: 0.2, max: 0.2, color: '#e0e8ff' });
          this.decals.push({ kind: 'scorch', x: f.x, y: f.y, r: 10, t: 8, a: 0.6 });
          this.screenShake = Math.max(this.screenShake, 0.15);
          break;
        case 'fireField':
          this.fx.push({ type: 'fire', x: f.x, y: f.y, r: f.r, t: f.t, max: f.t });
          break;
        case 'tendrils':
          this.fx.push({ type: 'tendrils', x: f.x, y: f.y, r: f.r, t: f.t, max: f.t });
          break;
        case 'trump':
          this.fx.push({ type: 'trump', x: f.x, y: f.y, t: 0.8, max: 0.8, color: f.color, big: f.big });
          break;
        case 'heal':
          for (let k = 0; k < 5; k++) this.fx.push({ type: 'mote', x: f.x + (Math.random() - 0.5) * 16, y: f.y + (Math.random() - 0.5) * 8, vy: -26, t: 0.8, max: 0.8, color: f.color, plus: true });
          if (f.from) this.fx.push({ type: 'beam', x0: f.from.x, y0: f.from.y - 10, x1: f.x, y1: f.y - 6, t: 0.3, max: 0.3, color: f.color });
          break;
        case 'beam':
          this.fx.push({ type: 'beam', x0: f.x0, y0: f.y0 - 8, x1: f.x1, y1: f.y1 - 8, t: f.t || 0.3, max: f.t || 0.3, color: f.color, delay: f.delay || 0, sphere: f.sphere });
          break;
        case 'dash':
          this.fx.push({ type: 'beam', x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, t: 0.3, max: 0.3, color: f.color, w: 6 });
          break;
        case 'heave':
          this.fx.push({ type: 'beam', x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, t: 0.4, max: 0.4, color: 'rgba(160,190,255,0.8)', w: 4 });
          this.fx.push({ type: 'ring', x: f.x1, y: f.y1, r: 26, t: 0.4, max: 0.4, color: '#c0d0ff' });
          this.screenShake = Math.max(this.screenShake, 0.2);
          break;
        case 'whirl':
          this.fx.push({ type: 'whirl', x: f.x, y: f.y, r: f.r, t: 0.5, max: 0.5 });
          break;
        case 'bind':
          this.fx.push({ type: 'bind', id: f.id, t: f.t, max: f.t });
          this.fx.push({ type: 'beam', x0: f.from.x, y0: f.from.y - 10, x1: f.x, y1: f.y - 10, t: 0.5, max: 0.5, color: '#e070ff', w: 3 });
          break;
        case 'mark':
          break;
        case 'shapeshift':
          for (let k = 0; k < 14; k++) this.fx.push({ type: 'smoke', x: f.x, y: f.y, t: 1.0, max: 1.0, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 60, r: 7, color: 'rgba(120,30,180,' });
          break;
        case 'possess':
          this.fx.push({ type: 'beam', x0: f.x0, y0: f.y0 - 8, x1: f.x1, y1: f.y1 - 8, t: 0.7, max: 0.7, color: '#ff80ff', w: 5 });
          this.fx.push({ type: 'ring', x: f.x1, y: f.y1, r: 30, t: 0.7, max: 0.7, color: '#ff80ff' });
          break;
        case 'spawn':
          this.fx.push({ type: 'ring', x: f.x, y: f.y, r: 22, t: 0.5, max: 0.5, color: f.color || '#fff' });
          break;
        case 'summon':
          this.fx.push({ type: 'swirl', x: f.x, y: f.y, r: f.r || 30, t: 1.0, max: 1.0, color: '#c040ff' });
          break;
        case 'dust':
          for (let k = 0; k < 10; k++) this.fx.push({ type: 'smoke', x: f.x + (Math.random() - 0.5) * f.r * 1.6, y: f.y + (Math.random() - 0.5) * f.r, t: 1.4, max: 1.4, vx: (Math.random() - 0.5) * 20, vy: -12, r: 8, color: 'rgba(170,150,110,' });
          break;
        case 'puff':
          for (let k = 0; k < 8; k++) this.fx.push({ type: 'smoke', x: f.x, y: f.y, t: 0.8, max: 0.8, vx: (Math.random() - 0.5) * 50, vy: -20, r: 6 });
          break;
        case 'sparkle':
          for (let k = 0; k < (f.n || 8); k++) this.fx.push({ type: 'mote', x: f.x + (Math.random() - 0.5) * 24, y: f.y + (Math.random() - 0.5) * 16, vy: -30, t: 1, max: 1, color: '#dffaff' });
          break;
        case 'unicorn':
          this.fx.push({ type: 'unicorn', x: f.x, y: f.y, t: 3, max: 3 });
          break;
        case 'serpent':
          this.fx.push({ type: 'serpent', x: f.x, y: f.y, t: 3, max: 3 });
          break;
        case 'drums':
          for (let k = 0; k < 6; k++) this.fx.push({ type: 'note', x: f.x + (Math.random() - 0.5) * 30, y: f.y - 10, vy: -30, vx: (Math.random() - 0.5) * 30, t: 1.2, max: 1.2 });
          break;
        case 'levelup':
          this.fx.push({ type: 'column', x: f.x, y: f.y, t: 1.2, max: 1.2, color: '#ffe08a' });
          break;
        case 'target':
          this.fx.push({ type: 'target', x: f.x, y: f.y, r: f.r, t: f.t, max: f.t, color: f.color });
          break;
        case 'channel':
          break;
        case 'jewelGlow':
          this.fx.push({ type: 'follow', id: f.id, t: f.t, max: f.t, color: '#ff2040' });
          break;
        case 'cmd':
          if (f.player === g.localPlayer) this.fx.push({ type: 'cmd', x: f.x, y: f.y, kind: f.kind, t: 0.6, max: 0.6 });
          break;
        case 'cmdTarget':
          if (f.player === g.localPlayer) this.fx.push({ type: 'cmdTarget', id: f.id, kind: f.kind, t: 0.6, max: 0.6 });
          break;
      }
      if (this.fx.length > 1400) this.fx.splice(0, this.fx.length - 1400);
    }
    updateAndDrawFx(ctx, dt) {
      this.consumeFx();
      const { circ, ell, line, poly } = H();
      const g = this.game;
      const out = [];
      const t = this.time;
      for (const f of this.fx) {
        f.t -= dt;
        if (f.t <= 0) continue;
        if (f.delay > 0) { f.delay -= dt; f.t += dt; out.push(f); continue; }
        out.push(f);
        const k = 1 - f.t / f.max; // 0..1 progress
        switch (f.type) {
          case 'spark':
            f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt;
            ctx.fillStyle = f.color || '#ffe0a0'; ctx.fillRect(f.x - 1, f.y - 1, 2, 2);
            break;
          case 'flash':
            ctx.globalAlpha = 1 - k; circ(ctx, f.x, f.y, f.r * (0.6 + k * 0.6), f.color); ctx.globalAlpha = 1;
            break;
          case 'smoke': {
            f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
            const a = (1 - k) * (f.light ? 0.35 : 0.45);
            ctx.fillStyle = (f.color || (f.light ? 'rgba(200,200,200,' : 'rgba(50,46,44,')) + a.toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k * 1.8), 0, TAU); ctx.fill();
            break;
          }
          case 'debris':
            f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 360 * dt;
            ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 3);
            break;
          case 'boom': {
            const r = f.r * (0.4 + k * 0.9);
            ctx.globalAlpha = (1 - k) * 0.9;
            const col = f.kind === 'glob' ? ['#e0ff80', '#70a020'] : f.kind === 'fire' ? ['#fff0a0', '#ff6010'] : ['#fff6c0', '#ff8020'];
            circ(ctx, f.x, f.y, r, H().rgrad(ctx, f.x, f.y, 1, r, [[0, col[0]], [0.5, col[1]], [1, 'rgba(60,20,0,0)']]));
            ctx.globalAlpha = 1;
            break;
          }
          case 'text': {
            ctx.globalAlpha = Math.min(1, (1 - k) * 2);
            ctx.font = (f.small ? '600 10px ' : 'bold 13px ') + 'Palatino, "Palatino Linotype", Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(f.text, f.x + 1, f.y - k * 24 + 1);
            ctx.fillStyle = f.color || '#fff'; ctx.fillText(f.text, f.x, f.y - k * 24);
            ctx.globalAlpha = 1;
            break;
          }
          case 'ring':
            ctx.globalAlpha = 1 - k;
            ell(ctx, f.x, f.y, f.r * (0.3 + 0.7 * k), f.r * (0.3 + 0.7 * k) * 0.75, null, f.color || '#fff', 2.5);
            ctx.globalAlpha = 1;
            break;
          case 'pattern':
            ctx.globalAlpha = Math.min(1, (1 - k) * 2);
            AC.Art.drawPattern(ctx, f.x, f.y, f.r * (0.5 + 0.5 * Math.min(1, k * 2)), f.r * 0.75 * (0.5 + 0.5 * Math.min(1, k * 2)), '#cfe8ff', 3, 7, Math.min(1, k * 1.6));
            AC.Art.drawPattern(ctx, f.x, f.y, f.r * (0.5 + 0.5 * Math.min(1, k * 2)), f.r * 0.75 * (0.5 + 0.5 * Math.min(1, k * 2)), 'rgba(110,170,255,0.5)', 8, 7, Math.min(1, k * 1.6));
            ctx.globalAlpha = 1;
            break;
          case 'storm': {
            const fade = Math.min(1, f.t / 0.8, (f.max - f.t) / 0.5);
            ctx.globalAlpha = 0.45 * fade;
            ell(ctx, f.x, f.y, f.r * 1.05, f.r * 0.8, H().rgrad(ctx, f.x, f.y, f.r * 0.2, f.r * 1.1, [[0, 'rgba(20,20,40,0.9)'], [1, 'rgba(20,20,40,0)']]));
            ctx.globalAlpha = 0.5 * fade;
            ctx.strokeStyle = 'rgba(170,190,255,0.6)'; ctx.lineWidth = 1;
            for (let i = 0; i < 40; i++) {
              const a = U.hash2(i, 1, 2) * TAU, d = Math.sqrt(U.hash2(i, 2, 3)) * f.r;
              const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d * 0.75 + ((t * 300 + i * 37) % 40) - 20;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            break;
          }
          case 'wave': {
            const fade = Math.min(1, f.t / 0.8, (f.max - f.t) / 0.5);
            ctx.globalAlpha = 0.5 * fade;
            ell(ctx, f.x, f.y, f.r, f.r * 0.8, H().rgrad(ctx, f.x, f.y, f.r * 0.1, f.r, [[0, 'rgba(255,60,200,0.6)'], [0.6, 'rgba(90,10,120,0.5)'], [1, 'rgba(40,0,60,0)']]));
            AC.Art.drawLogrus(ctx, f.x, f.y, f.r * 0.95, t * 2, 'rgba(255,120,230,0.6)');
            ctx.globalAlpha = 1;
            if (Math.random() < 0.4) this.fx.push({ type: 'smoke', x: f.x + (Math.random() - 0.5) * f.r * 1.6, y: f.y + (Math.random() - 0.5) * f.r, t: 1, max: 1, vx: 0, vy: -10, r: 8, color: 'rgba(140,30,180,' });
            break;
          }
          case 'bolt': {
            ctx.globalAlpha = 1 - k;
            const rng = U.rng(f.seed | 0);
            ctx.strokeStyle = '#eef2ff'; ctx.lineWidth = 2.4;
            ctx.beginPath();
            let x = f.x + (rng() - 0.5) * 40, y = f.y - 260;
            ctx.moveTo(x, y);
            while (y < f.y) { y += 20 + rng() * 20; x += (rng() - 0.5) * 26; if (y > f.y) { y = f.y; x = f.x; } ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(150,170,255,0.5)'; ctx.lineWidth = 7; ctx.stroke();
            ctx.globalAlpha = 1;
            break;
          }
          case 'fire': {
            const fade = Math.min(1, f.t / 0.6, (f.max - f.t) / 0.3);
            ctx.globalAlpha = 0.3 * fade;
            ell(ctx, f.x, f.y, f.r, f.r * 0.75, '#ff5010');
            ctx.globalAlpha = 1;
            for (let i = 0; i < 18; i++) {
              const a = U.hash2(i, 5, 6) * TAU, d = Math.sqrt(U.hash2(i, 6, 7)) * f.r * 0.9;
              const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d * 0.75;
              const fl = 0.6 + 0.4 * Math.sin(t * 14 + i * 2);
              ctx.globalAlpha = 0.8 * fade;
              ell(ctx, x, y - 6 * fl, 4 * fl, 9 * fl, '#ff7a20');
              ell(ctx, x, y - 4 * fl, 2 * fl, 5 * fl, '#ffe080');
            }
            ctx.globalAlpha = 1;
            break;
          }
          case 'tendrils': {
            const fade = Math.min(1, f.t / 0.5, (f.max - f.t) / 0.3);
            ctx.globalAlpha = fade;
            ctx.strokeStyle = '#a040e0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
            for (let i = 0; i < 14; i++) {
              const a = U.hash2(i, 8, 9) * TAU, d = Math.sqrt(U.hash2(i, 9, 10)) * f.r;
              const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d * 0.75;
              const h = 18 * Math.min(1, k * 4);
              const sw = Math.sin(t * 5 + i) * 6;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw, y - h * 0.6, x - sw * 0.5, y - h); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            break;
          }
          case 'trump': {
            const a = 1 - k;
            ctx.globalAlpha = a;
            const w = (f.big ? 30 : 18) * (0.6 + k), h = w * 1.5;
            ctx.save(); ctx.translate(f.x, f.y - 20); ctx.rotate(k * 1.2);
            ctx.fillStyle = 'rgba(255,250,230,0.85)'; ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.strokeStyle = f.color || '#ffe08a'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -h / 2, w, h);
            ctx.restore();
            ell(ctx, f.x, f.y, 30 * (0.5 + k), 22 * (0.5 + k), null, f.color || '#ffe08a', 2);
            ctx.globalAlpha = 1;
            break;
          }
          case 'mote':
            f.y += (f.vy || 0) * dt; f.x += (f.vx || 0) * dt;
            ctx.globalAlpha = 1 - k;
            if (f.plus) { ctx.fillStyle = f.color; ctx.fillRect(f.x - 3, f.y - 1, 6, 2); ctx.fillRect(f.x - 1, f.y - 3, 2, 6); }
            else circ(ctx, f.x, f.y, 1.8, f.color);
            ctx.globalAlpha = 1;
            break;
          case 'note':
            f.y += f.vy * dt; f.x += f.vx * dt;
            ctx.globalAlpha = 1 - k; ctx.font = '14px serif'; ctx.fillStyle = '#ffd080'; ctx.fillText('♪', f.x, f.y); ctx.globalAlpha = 1;
            break;
          case 'beam': {
            const a = 1 - k;
            ctx.globalAlpha = a;
            line(ctx, f.x0, f.y0, f.x1, f.y1, f.color, f.w || 2);
            if (f.sphere) circ(ctx, f.x1, f.y1, 6, '#e8e8f8', '#555', 1);
            ctx.globalAlpha = 1;
            break;
          }
          case 'whirl': {
            ctx.globalAlpha = 1 - k;
            for (let i = 0; i < 6; i++) {
              const a = k * 8 + (i * TAU) / 6;
              line(ctx, f.x + Math.cos(a) * f.r * 0.3, f.y + Math.sin(a) * f.r * 0.25, f.x + Math.cos(a + 0.4) * f.r, f.y + Math.sin(a + 0.4) * f.r * 0.75, '#fff4c0', 2);
            }
            ctx.globalAlpha = 1;
            break;
          }
          case 'bind': {
            const u = g.get(f.id);
            if (!u || u.dead) { f.t = 0; break; }
            ctx.strokeStyle = 'rgba(230,110,255,' + (0.5 + 0.4 * Math.sin(t * 8)).toFixed(2) + ')'; ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(u.x, u.y - 4 - i * 6, u.radius * 1.2, u.radius * 0.5, 0, 0, TAU); ctx.stroke(); }
            break;
          }
          case 'follow': {
            const u = g.get(f.id);
            if (!u || u.dead) { f.t = 0; break; }
            ctx.globalAlpha = (1 - k) * 0.7;
            circ(ctx, u.x, u.y - 8, u.radius * 1.6, H().rgrad(ctx, u.x, u.y - 8, 1, u.radius * 1.6, [[0, f.color], [1, 'rgba(255,0,0,0)']]));
            ctx.globalAlpha = 1;
            break;
          }
          case 'swirl':
            ctx.globalAlpha = 1 - k;
            AC.Art.drawLogrus(ctx, f.x, f.y, f.r * (0.5 + k * 0.6), t * 3, f.color);
            ctx.globalAlpha = 1;
            break;
          case 'column':
            ctx.globalAlpha = (1 - k) * 0.6;
            ctx.fillStyle = H().grad(ctx, 0, f.y - 80, 0, f.y, [[0, 'rgba(255,224,138,0)'], [1, f.color]]);
            ctx.fillRect(f.x - 12, f.y - 80, 24, 80);
            ctx.globalAlpha = 1;
            break;
          case 'target':
            ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 16);
            ell(ctx, f.x, f.y, f.r, f.r * 0.75, null, f.color, 2);
            ell(ctx, f.x, f.y, f.r * (1 - k), f.r * 0.75 * (1 - k), null, f.color, 1);
            ctx.globalAlpha = 1;
            break;
          case 'unicorn': {
            const a = Math.sin(k * Math.PI);
            ctx.globalAlpha = a * 0.9;
            ctx.save(); ctx.translate(f.x, f.y - 30 - k * 20); ctx.scale(3, 3);
            circ(ctx, 0, 0, 14, 'rgba(255,255,255,0.15)');
            poly(ctx, [-9, 6, -7, -6, -2, -10, 4, -12, 8, -8, 6, -4, 2, -2, 3, 6], '#ffffff', '#c0d0ff', 0.6);
            line(ctx, 5, -11, 12, -22, '#ffe8a0', 1.4);
            ctx.restore();
            ctx.globalAlpha = 1;
            break;
          }
          case 'serpent': {
            const a = Math.sin(k * Math.PI);
            ctx.globalAlpha = a * 0.8;
            ctx.strokeStyle = '#c040ff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
            ctx.beginPath();
            for (let i = 0; i <= 30; i++) {
              const u = i / 30;
              const x = f.x - 70 + u * 140, y = f.y - 40 - k * 20 + Math.sin(u * 9 + t * 3) * 18;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            circ(ctx, f.x + 72, f.y - 40 - k * 20 + Math.sin(9 + t * 3) * 18, 6, '#ff2040');
            ctx.globalAlpha = 1;
            break;
          }
          case 'cmd': {
            ctx.globalAlpha = 1 - k;
            const col = f.kind === 'attack' ? '#ff5040' : f.kind === 'rally' ? '#ffe060' : f.kind === 'cast' ? '#e080ff' : '#60ff80';
            ell(ctx, f.x, f.y, 10 * (1 - k * 0.5), 7 * (1 - k * 0.5), null, col, 2);
            line(ctx, f.x - 4, f.y, f.x + 4, f.y, col, 1.5);
            ctx.globalAlpha = 1;
            break;
          }
          case 'cmdTarget': {
            const u = g.get(f.id);
            if (!u || u.dead) { f.t = 0; break; }
            ctx.globalAlpha = (1 - k) * (Math.floor(k * 6) % 2 ? 0.3 : 1);
            const col = f.kind === 'attack' ? '#ff5040' : f.kind === 'gather' ? '#80e0ff' : '#60ff80';
            ell(ctx, u.x, u.y + 2, u.radius * 1.3, u.radius, null, col, 2.5);
            ctx.globalAlpha = 1;
            break;
          }
        }
      }
      this.fx = out;
    }

    // ------------------------------------------------------------------ overlays (health bars, placement, rally, targeting)
    drawOverlays(ctx, alpha) {
      const g = this.game, ui = AC.ui;
      const z = this.cam.zoom;
      const showAll = AC.settings && AC.settings.alwaysBars;
      const sel = new Set(ui ? ui.selected : []);
      // bars
      for (const u of g.units) {
        if (u.dead) continue;
        const x = u.prevX + (u.x - u.prevX) * alpha, y = u.prevY + (u.y - u.prevY) * alpha - (u.def.air ? 22 : 0);
        if (!this.inView(x, y, 40)) continue;
        const damaged = u.hp < u.maxHp - 0.5;
        if (!sel.has(u.id) && !(ui && ui.hover === u.id) && !(showAll && (damaged || u.def.hero)) && !(damaged && g.time - u.lastHitT < 3)) continue;
        if (!g.visibleTo(g.localPlayer, u)) continue;
        this.bar(ctx, x, y - u.radius - (u.def.hero ? 14 : 9), Math.max(18, u.radius * 2), u.hp / u.maxHp, u, z);
      }
      for (const b of g.buildings) {
        if (b.dead || !this.inView(b.x, b.y, b.radius + 40)) continue;
        if (!sel.has(b.id) && !(ui && ui.hover === b.id) && !(b.hp < b.maxHp && (showAll || g.time - b.lastHitT < 4)) && b.built) continue;
        if (!g.visibleTo(g.localPlayer, b)) continue;
        this.bar(ctx, b.x, b.ty * T - 6, b.size * T * 0.7, b.hp / b.maxHp, b, z);
        if (!b.built) this.bar(ctx, b.x, b.ty * T - 1, b.size * T * 0.7, b.progress, null, z, '#e0c060');
        else if (b.trainQ.length && b.owner === g.localPlayer) this.bar(ctx, b.x, b.ty * T - 1, b.size * T * 0.7, b.trainQ[0].t / b.trainQ[0].time, null, z, '#80c0ff');
      }
      if (!ui) return;
      // rally lines
      for (const id of ui.selected) {
        const b = g.get(id);
        if (!b || b.kind !== 'building' || !b.rally || b.owner !== g.localPlayer) continue;
        ctx.setLineDash([6, 6]);
        H().line(ctx, b.x, b.y, b.rally.x, b.rally.y, 'rgba(255,230,120,0.6)', 1.5 / z);
        ctx.setLineDash([]);
        H().line(ctx, b.rally.x, b.rally.y, b.rally.x, b.rally.y - 18, '#5a3a1a', 2);
        H().poly(ctx, [b.rally.x, b.rally.y - 18, b.rally.x + 10, b.rally.y - 15, b.rally.x, b.rally.y - 11], g.players[b.owner].color.main);
      }
      // waypoints for own selected units
      if (ui.shiftHeld && ui.selected.length && ui.selected.length < 40) {
        ctx.globalAlpha = 0.35;
        for (const id of ui.selected) {
          const u = g.get(id);
          if (!u || u.kind !== 'unit' || u.owner !== g.localPlayer) continue;
          let px = u.x, py = u.y;
          const pts = [];
          if (u.order && u.order.x != null && (u.order.type === 'move' || u.order.type === 'attackMove' || u.order.type === 'patrol')) pts.push([u.order.x, u.order.y, u.order.type]);
          for (const q of u.queue) if (q.x != null) pts.push([q.x, q.y, q.type]);
          for (const [qx, qy, ty] of pts) {
            H().line(ctx, px, py, qx, qy, ty === 'move' ? '#60ff80' : '#ff8060', 1 / z);
            px = qx; py = qy;
          }
        }
        ctx.globalAlpha = 1;
      }
      // placement ghost
      if (ui.mode === 'place' && ui.placeDef && ui.mouseWorld) {
        const def = AC.BUILDINGS[ui.placeDef];
        const s = def.size;
        const tx = Math.floor(ui.mouseWorld[0] / T - s / 2 + 0.5), ty = Math.floor(ui.mouseWorld[1] / T - s / 2 + 0.5);
        ui.placeTx = tx; ui.placeTy = ty;
        const chk = g.canPlace(g.localPlayer, def.id, tx, ty);
        ui.placeOk = chk.ok; ui.placeWhy = chk.why;
        const m = g.map;
        for (let y = ty; y < ty + s; y++)
          for (let x = tx; x < tx + s; x++) {
            let ok = m.inb(x, y) && (AC.PASS[m.terrain[y * m.w + x]] & 1) && !m.occ[y * m.w + x];
            if (ok && def.faction === 'chaos' && !def.anywhere && !m.road[y * m.w + x]) ok = false;
            ctx.fillStyle = ok && chk.ok ? 'rgba(80,255,120,0.28)' : 'rgba(255,60,60,0.35)';
            ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
          }
        const sp = AC.Art.buildingSprite(def.id, g.players[g.localPlayer].color, Math.round(this.dpr * 2) / 2);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(sp.canvas, tx * T, ty * T - sp.pad, s * T, s * T + sp.pad);
        ctx.globalAlpha = 1;
        // show road coverage radius for chaos spreaders / order radius
        const r = def.spread || def.order;
        if (r) { ctx.setLineDash([4, 6]); H().ell(ctx, (tx + s / 2) * T, (ty + s / 2) * T, (r + s / 2) * T, (r + s / 2) * T, null, def.spread ? 'rgba(200,90,255,0.5)' : 'rgba(150,200,255,0.5)', 1.5 / z); ctx.setLineDash([]); }
        if (def.attack) { H().ell(ctx, (tx + s / 2) * T, (ty + s / 2) * T, def.attack.range + s * T / 2, def.attack.range + s * T / 2, null, 'rgba(255,120,80,0.4)', 1.5 / z); }
      }
      // ability targeting
      if (ui.mode === 'target' && ui.targetAb && ui.mouseWorld) {
        const ab = AC.ABILITIES[ui.targetAb];
        const caster = ui.targetCaster && g.get(ui.targetCaster);
        if (caster && ab.range) { ctx.setLineDash([6, 6]); H().ell(ctx, caster.x, caster.y, ab.range, ab.range, null, 'rgba(255,255,255,0.35)', 1.5 / z); ctx.setLineDash([]); }
        if (ab.radius && ab.target === 'point') {
          H().ell(ctx, ui.mouseWorld[0], ui.mouseWorld[1], ab.radius, ab.radius * 0.8, 'rgba(255,120,200,0.12)', ab.color || '#fff', 2 / z);
        }
      }
      // drag box (screen space)
      if (ui.drag && ui.drag.active) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const d = ui.drag;
        const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
        ctx.fillStyle = 'rgba(90,255,130,0.08)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(120,255,150,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      }
    }
    bar(ctx, x, y, w, f, e, z, color) {
      const hgt = Math.max(3, 4 / Math.max(0.7, z));
      const ww = w;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - ww / 2 - 1, y - 1, ww + 2, hgt + 2);
      let col = color;
      if (!col) {
        const g = this.game;
        if (e && e.owner !== g.localPlayer && !g.areAllies(e.owner, g.localPlayer)) col = f > 0.5 ? '#e04a3a' : '#b02020';
        else col = f > 0.6 ? '#4ee060' : f > 0.3 ? '#e0d040' : '#e05030';
      }
      ctx.fillStyle = col;
      ctx.fillRect(x - ww / 2, y, ww * U.clamp(f, 0, 1), hgt);
      if (e && e.maxMana && e.owner === this.game.localPlayer) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - ww / 2 - 1, y + hgt + 1, ww + 2, 3);
        ctx.fillStyle = '#5a8aff'; ctx.fillRect(x - ww / 2, y + hgt + 1.5, ww * (e.mana / e.maxMana), 2);
      }
      if (e && e.def && e.def.hero) {
        ctx.font = 'bold 9px Palatino, Georgia, serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#000'; ctx.fillText(e.def.name + ' ' + e.level, x + 0.5, y - 2.5);
        ctx.fillStyle = '#ffe9a8'; ctx.fillText(e.def.name + ' ' + e.level, x, y - 3);
      }
    }

    // ------------------------------------------------------------------ minimap
    renderMinimap(cv) {
      const g = this.game, m = this.map;
      const ctx = cv.getContext('2d');
      const W = cv.width, Hh = cv.height;
      if (!this.miniBase || this.miniVer !== m.version) {
        this.miniBase = document.createElement('canvas');
        this.miniBase.width = m.w; this.miniBase.height = m.h;
        const bc = this.miniBase.getContext('2d');
        const img = bc.createImageData(m.w, m.h);
        for (let i = 0; i < m.w * m.h; i++) {
          const c = [this.tileCol[i * 3], this.tileCol[i * 3 + 1], this.tileCol[i * 3 + 2]];
          const t = m.terrain[i];
          const f = t === TER.FOREST ? 0.75 : t === TER.ROCK ? 1.15 : 1;
          img.data[i * 4] = c[0] * f; img.data[i * 4 + 1] = c[1] * f; img.data[i * 4 + 2] = c[2] * f; img.data[i * 4 + 3] = 255;
        }
        bc.putImageData(img, 0, 0);
        this.miniVer = m.version;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.miniBase, 0, 0, W, Hh);
      const sx = W / m.w, sy = Hh / m.h;
      // road
      ctx.fillStyle = 'rgba(40,10,50,0.85)';
      for (let i = 0; i < m.road.length; i++) if (m.road[i]) ctx.fillRect((i % m.w) * sx, ((i / m.w) | 0) * sy, sx + 0.5, sy + 0.5);
      // sites & resources
      for (const s of g.sites) {
        ctx.fillStyle = s.capOwner >= 0 ? g.players[s.capOwner].color.main : '#c8d8ff';
        ctx.beginPath(); ctx.arc(s.x / T * sx, s.y / T * sy, 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.fillStyle = '#cfefff';
      const lp = g.players[g.localPlayer];
      for (const r of g.resources) if (!r.dead && (!g.fog || lp.explored[r.ty * m.w + r.tx])) ctx.fillRect(r.tx * sx, r.ty * sy, Math.max(1.5, sx), Math.max(1.5, sy));
      // fog
      if (g.fog) {
        if (g.tickN !== this.lastFogTick) { this.updateFog(); this.lastFogTick = g.tickN; }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.fogCanvas, 0, 0, W, Hh);
      }
      // buildings
      for (const b of g.buildings) {
        if (b.dead || !g.visibleTo(g.localPlayer, b)) continue;
        const p = g.players[b.owner];
        ctx.fillStyle = b.owner === g.localPlayer ? '#5dff7a' : p ? p.color.main : '#aaa';
        ctx.fillRect(b.tx * sx, b.ty * sy, b.size * sx, b.size * sy);
      }
      if (g.fog && lp) for (const [id, gh] of lp.ghosts) {
        const b = g.get(id);
        if (b && !b.dead && g.visibleTo(g.localPlayer, b)) continue;
        ctx.fillStyle = g.players[gh.owner] ? g.players[gh.owner].color.dark : '#555';
        ctx.fillRect(gh.tx * sx, gh.ty * sy, gh.def.size * sx, gh.def.size * sy);
      }
      // units
      for (const u of g.units) {
        if (u.dead || !g.visibleTo(g.localPlayer, u)) continue;
        const p = g.players[u.owner];
        ctx.fillStyle = u.owner === g.localPlayer ? '#9dffaa' : p && p.isNeutral ? '#e8e070' : p ? p.color.light : '#fff';
        const s = u.def.hero ? 3.5 : 2;
        ctx.fillRect(u.x / T * sx - s / 2, u.y / T * sy - s / 2, s, s);
      }
      // pings
      if (AC.ui && AC.ui.pings) {
        for (const p of AC.ui.pings) {
          const k = (this.time - p.t0) / 3;
          if (k > 1) continue;
          ctx.strokeStyle = 'rgba(255,60,40,' + (1 - k) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x / T * sx, p.y / T * sy, 4 + k * 14, 0, TAU); ctx.stroke();
        }
      }
      // camera
      const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.vw, this.vh - (AC.ui ? AC.ui.bottomH : 0));
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(x0 / T * sx, y0 / T * sy, (x1 - x0) / T * sx, (y1 - y0) / T * sy);
    }
  }
  AC.Renderer = Renderer;
})();
