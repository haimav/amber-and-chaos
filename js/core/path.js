// Amber and Chaos — grid pathfinding (A*), line of sight and path smoothing.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const T = AC.TILE;
  const SQ2 = Math.SQRT2;

  class PathFinder {
    constructor(map) {
      this.map = map;
      const n = map.w * map.h;
      this.g = new Float32Array(n);
      this.f = new Float32Array(n);
      this.from = new Int32Array(n);
      this.stamp = new Uint32Array(n);
      this.closed = new Uint32Array(n);
      this.cur = 1;
      this.heapI = new Int32Array(n * 2 + 16);
      this.heapF = new Float32Array(n * 2 + 16);
      this.count = 0; // statistics
    }

    // Nearest passable tile to (tx,ty) by spiral search
    nearestPassable(tx, ty, bits, maxR) {
      const m = this.map;
      if (m.passable(tx, ty, bits)) return [tx, ty];
      maxR = maxR || 12;
      for (let r = 1; r <= maxR; r++) {
        let best = null, bd = 1e9;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = tx + dx, y = ty + dy;
            if (m.passable(x, y, bits)) {
              const d = dx * dx + dy * dy;
              if (d < bd) { bd = d; best = [x, y]; }
            }
          }
        if (best) return best;
      }
      return null;
    }

    // Line of sight across passable tiles (thick line using unit radius)
    los(x0, y0, x1, y1, bits, rad) {
      const m = this.map;
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1) return true;
      const step = 8;
      const n = Math.ceil(len / step);
      const r = Math.max(0, (rad || 0) - 2);
      const nx = -dy / len * r, ny = dx / len * r;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const px = x0 + dx * t, py = y0 + dy * t;
        if (!m.passable(Math.floor(px / T), Math.floor(py / T), bits)) return false;
        if (r > 0) {
          if (!m.passable(Math.floor((px + nx) / T), Math.floor((py + ny) / T), bits)) return false;
          if (!m.passable(Math.floor((px - nx) / T), Math.floor((py - ny) / T), bits)) return false;
        }
      }
      return true;
    }

    // A* from world (sx,sy) to world (gx,gy). Returns array of world points or null.
    find(sx, sy, gx, gy, bits, opts) {
      const m = this.map;
      const W = m.w;
      const maxNodes = (opts && opts.maxNodes) || 9000;
      const rad = (opts && opts.radius) || 8;
      let stx = Math.floor(sx / T), sty = Math.floor(sy / T);
      let gtx = Math.floor(gx / T), gty = Math.floor(gy / T);
      if (bits & 4) return [[gx, gy]];
      const s0 = this.nearestPassable(stx, sty, bits, 4);
      if (!s0) return null;
      [stx, sty] = s0;
      const g0 = this.nearestPassable(gtx, gty, bits, 14);
      if (!g0) return null;
      const exactGoal = g0[0] === gtx && g0[1] === gty;
      [gtx, gty] = g0;
      this.count++;
      this.lastExpanded = 1;
      if (stx === gtx && sty === gty) return [[exactGoal ? gx : gtx * T + T / 2, exactGoal ? gy : gty * T + T / 2]];

      const cur = ++this.cur;
      const g = this.g, f = this.f, from = this.from, stamp = this.stamp, closed = this.closed;
      const hI = this.heapI, hF = this.heapF;
      let hn = 0;
      const push = (i, pf) => {
        let k = hn++;
        hI[k] = i; hF[k] = pf;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (hF[p] <= hF[k]) break;
          const ti = hI[p]; hI[p] = hI[k]; hI[k] = ti;
          const tf = hF[p]; hF[p] = hF[k]; hF[k] = tf;
          k = p;
        }
      };
      const pop = () => {
        const top = hI[0];
        hn--;
        if (hn > 0) {
          hI[0] = hI[hn]; hF[0] = hF[hn];
          let k = 0;
          for (;;) {
            const l = 2 * k + 1, r = l + 1;
            let mm = k;
            if (l < hn && hF[l] < hF[mm]) mm = l;
            if (r < hn && hF[r] < hF[mm]) mm = r;
            if (mm === k) break;
            const ti = hI[mm]; hI[mm] = hI[k]; hI[k] = ti;
            const tf = hF[mm]; hF[mm] = hF[k]; hF[k] = tf;
            k = mm;
          }
        }
        return top;
      };
      const H = (x, y) => {
        const dx = Math.abs(x - gtx), dy = Math.abs(y - gty);
        return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy);
      };
      const si = sty * W + stx, gi = gty * W + gtx;
      stamp[si] = cur; g[si] = 0; from[si] = -1;
      push(si, H(stx, sty));
      let best = si, bestH = H(stx, sty);
      let expanded = 0;
      let found = false;
      const DX = [1, -1, 0, 0, 1, 1, -1, -1];
      const DY = [0, 0, 1, -1, 1, -1, 1, -1];
      while (hn > 0) {
        const i = pop();
        if (closed[i] === cur) continue;
        closed[i] = cur;
        if (i === gi) { found = true; break; }
        if (++expanded > maxNodes) break;
        const x = i % W, y = (i / W) | 0;
        const gi0 = g[i];
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!m.passable(nx, ny, bits)) continue;
          if (k >= 4) {
            // no corner cutting
            if (!m.passable(x + DX[k], y, bits) || !m.passable(x, y + DY[k], bits)) continue;
          }
          const j = ny * W + nx;
          if (closed[j] === cur) continue;
          const ng = gi0 + (k >= 4 ? SQ2 : 1);
          if (stamp[j] !== cur || ng < g[j]) {
            stamp[j] = cur; g[j] = ng; from[j] = i;
            const h = H(nx, ny);
            f[j] = ng + h;
            push(j, ng + h * 1.2);
            if (h < bestH) { bestH = h; best = j; }
          }
        }
      }
      this.lastExpanded = expanded;
      const end = found ? gi : best;
      // reconstruct
      const tiles = [];
      let c = end, guard = 0;
      while (c !== -1 && guard++ < 100000) {
        tiles.push(c);
        if (c === si) break;
        c = from[c];
      }
      tiles.reverse();
      const pts = tiles.map((i) => [(i % W) * T + T / 2, ((i / W) | 0) * T + T / 2]);
      if (found && exactGoal) pts[pts.length - 1] = [gx, gy];
      // smooth: greedy string pulling
      const out = [];
      let ax = sx, ay = sy;
      for (let i = 0; i < pts.length; i++) {
        if (i === pts.length - 1) { out.push(pts[i]); break; }
        const nxt = pts[i + 1];
        // keep sight-lines short so smoothing stays linear in path length
        if (Math.abs(nxt[0] - ax) + Math.abs(nxt[1] - ay) > 12 * T || !this.los(ax, ay, nxt[0], nxt[1], bits, rad)) {
          out.push(pts[i]);
          ax = pts[i][0]; ay = pts[i][1];
        }
      }
      out.partial = !found;
      return out;
    }
  }
  AC.PathFinder = PathFinder;

  // Spatial hash for fast neighbour queries
  class SpatialHash {
    constructor(w, h, cell) {
      this.cell = cell;
      this.cw = Math.ceil(w / cell) + 1;
      this.ch = Math.ceil(h / cell) + 1;
      this.cells = new Array(this.cw * this.ch);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    }
    clear() { for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0; }
    insert(e) {
      const cx = Math.max(0, Math.min(this.cw - 1, Math.floor(e.x / this.cell)));
      const cy = Math.max(0, Math.min(this.ch - 1, Math.floor(e.y / this.cell)));
      this.cells[cy * this.cw + cx].push(e);
    }
    // calls fn(e) for every entity within r of (x,y) (coarse: cell-level, caller filters)
    query(x, y, r, out) {
      out = out || [];
      out.length = 0;
      const c = this.cell;
      const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cw - 1, Math.floor((x + r) / c));
      const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(this.ch - 1, Math.floor((y + r) / c));
      for (let cy = y0; cy <= y1; cy++)
        for (let cx = x0; cx <= x1; cx++) {
          const cell = this.cells[cy * this.cw + cx];
          for (let i = 0; i < cell.length; i++) out.push(cell[i]);
        }
      return out;
    }
  }
  AC.SpatialHash = SpatialHash;
})();
