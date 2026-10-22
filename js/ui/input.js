// Amber and Chaos — mouse, trackpad and keyboard input.
// macOS notes: two-finger click / Control-click = right click; two-finger scroll pans; pinch zooms.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;

  const ui = (AC.ui = {
    selected: [], hover: 0, mode: 'normal', submenu: null, placeDef: null, targetAb: null, targetCaster: 0,
    groups: {}, mouse: { x: 0, y: 0, inside: false }, mouseWorld: null, drag: null, pings: [], bottomH: 180,
    lastAlert: null, activeType: 0, shiftHeld: false,
  });

  const Input = (AC.input = {
    keys: {},
    attach(game, renderer, hud) {
      this.g = game; this.r = renderer; this.hud = hud;
      ui.selected = []; ui.mode = 'normal'; ui.submenu = null; ui.groups = {}; ui.pings = []; ui.lastAlert = null; ui.hover = 0;
      if (this.bound) return;
      this.bound = true;
      const cv = document.getElementById('game');
      this.cv = cv;
      cv.addEventListener('mousedown', (e) => this.onDown(e));
      window.addEventListener('mouseup', (e) => this.onUp(e));
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('dblclick', (e) => this.onDbl(e));
      cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      document.documentElement.addEventListener('mouseleave', () => { ui.mouse.inside = false; });
      // Safari pinch gestures
      cv.addEventListener('gesturestart', (e) => { e.preventDefault(); this.gz = this.r.cam.zoom; });
      cv.addEventListener('gesturechange', (e) => { e.preventDefault(); if (this.gz) this.zoomAt(ui.mouse.x, ui.mouse.y, this.gz * e.scale, true); });
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      window.addEventListener('blur', () => { this.keys = {}; ui.shiftHeld = false; });
      const mm = document.getElementById('minimap');
      mm.addEventListener('mousedown', (e) => this.onMini(e, true));
      mm.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    active() { return AC.state === 'playing' && this.g && !AC.paused; },
    me() { return this.g.localPlayer; },

    // ------------------------------------------------------------ selection
    setSelection(ids, silent) {
      const g = this.g;
      ui.selected = ids.filter((id) => { const e = g.get(id); return e && !e.dead; });
      ui.submenu = null;
      ui.activeType = 0;
      if (ui.mode !== 'normal') this.cancelMode();
      if (!silent && ui.selected.length) {
        const e = g.get(ui.selected[0]);
        AC.audio.play(e && e.owner === g.localPlayer ? 'select' : 'uiClick', 0.8);
      }
      if (this.hud) { this.hud.slowT = 1; this.hud.lastSelSig = ''; }
    },
    selectIdleWorker() {
      const g = this.g;
      const idle = g.units.filter((u) => !u.dead && u.owner === g.localPlayer && u.def.role === 'worker' && !u.order);
      if (!idle.length) return;
      this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length;
      const u = idle[this.idleIdx];
      this.setSelection([u.id]);
      this.r.centerOn(u.x, u.y);
    },
    selectArmy() {
      const g = this.g;
      this.setSelection(g.units.filter((u) => !u.dead && u.owner === g.localPlayer && u.def.role !== 'worker').map((u) => u.id));
    },
    pickAt(sx, sy) {
      const [wx, wy] = this.r.toWorld(sx, sy);
      return this.g.entityAt(wx, wy, this.me());
    },
    boxSelect(x0, y0, x1, y1, add) {
      const g = this.g, r = this.r;
      const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
      const inBox = (e) => {
        const [sx, sy] = r.toScreen(e.x, e.y - (e.def.air ? 22 : 0));
        const rad = e.radius * r.cam.zoom * 0.7;
        return sx + rad >= ax && sx - rad <= bx && sy + rad >= ay && sy - rad <= by;
      };
      let units = g.units.filter((u) => !u.dead && u.owner === g.localPlayer && inBox(u));
      // prefer combat units over workers when both are boxed
      if (units.some((u) => u.def.role !== 'worker') && units.some((u) => u.def.role === 'worker') && !add) units = units.filter((u) => u.def.role !== 'worker');
      let ids = units.map((u) => u.id);
      if (!ids.length) ids = g.buildings.filter((b) => !b.dead && b.owner === g.localPlayer && inBox(b)).map((b) => b.id);
      if (add) ids = [...new Set([...ui.selected, ...ids])];
      if (ids.length || !add) this.setSelection(ids);
    },

    // ------------------------------------------------------------ modes
    setMode(m) {
      const { units } = this.hud.selectionContext();
      if (!units.length) return;
      ui.mode = m;
      document.body.dataset.cursor = m;
    },
    cancelMode() {
      ui.mode = 'normal'; ui.placeDef = null; ui.targetAb = null;
      document.body.dataset.cursor = '';
      if (this.hud) this.hud.slowT = 1;
    },
    beginPlace(defId) {
      ui.mode = 'place'; ui.placeDef = defId;
      document.body.dataset.cursor = 'place';
    },
    useAbility(abId) {
      const g = this.g;
      const ab = AC.ABILITIES[abId];
      const { units } = this.hud.selectionContext();
      const casters = units.filter((u) => u.def.abilities && u.def.abilities.indexOf(abId) >= 0);
      if (!casters.length) return;
      if (ab.target === 'none') {
        g.command(g.localPlayer, { type: 'cast', ids: casters.map((u) => u.id), ab: abId, queue: ui.shiftHeld });
        return;
      }
      const ready = casters.find((u) => AC.Abilities.canCast(g, u, abId).ok);
      if (!ready) { const chk = AC.Abilities.canCast(g, casters[0], abId); g.emit({ type: 'error', player: g.localPlayer, text: chk.why }); return; }
      ui.mode = 'target'; ui.targetAb = abId; ui.targetCaster = ready.id;
      document.body.dataset.cursor = 'target';
    },

    // ------------------------------------------------------------ mouse
    onDown(e) {
      if (!this.active()) return;
      AC.audio.init();
      const sx = e.clientX, sy = e.clientY;
      const right = e.button === 2 || (e.button === 0 && e.ctrlKey);
      const g = this.g;
      if (e.button === 1) { this.pan = { x: sx, y: sy, cx: this.r.cam.x, cy: this.r.cam.y }; e.preventDefault(); return; }
      const [wx, wy] = this.r.toWorld(sx, sy);
      if (right) {
        if (ui.mode !== 'normal') { this.cancelMode(); return; }
        this.smart(wx, wy, e.shiftKey);
        return;
      }
      if (ui.mode === 'place') {
        if (ui.placeOk) {
          const ok = g.command(g.localPlayer, { type: 'build', ids: ui.selected, def: ui.placeDef, tx: ui.placeTx, ty: ui.placeTy, queue: e.shiftKey });
          if (ok && !e.shiftKey) { this.cancelMode(); ui.submenu = null; }
          if (ok) AC.audio.play('ack');
        } else {
          g.emit({ type: 'error', player: g.localPlayer, text: ui.placeWhy || 'Cannot build there.' });
        }
        return;
      }
      if (ui.mode === 'target') {
        const ab = AC.ABILITIES[ui.targetAb];
        const t = this.pickAt(sx, sy);
        const c = { type: 'cast', ids: ui.selected, ab: ui.targetAb, x: wx, y: wy, target: t && t.kind === 'unit' ? t.id : 0, queue: e.shiftKey };
        if (ab.target === 'unit' && !c.target) { g.emit({ type: 'error', player: g.localPlayer, text: 'Choose a unit.' }); return; }
        if (g.command(g.localPlayer, c)) AC.audio.play('ack');
        if (!e.shiftKey) this.cancelMode();
        return;
      }
      if (ui.mode === 'attackMove' || ui.mode === 'patrol' || ui.mode === 'move') {
        const t = this.pickAt(sx, sy);
        const ids = ui.selected;
        if (ui.mode === 'attackMove' && t && (t.kind === 'unit' || t.kind === 'building') && g.areEnemies(g.localPlayer, t.owner)) g.command(g.localPlayer, { type: 'attack', ids, target: t.id, queue: e.shiftKey });
        else g.command(g.localPlayer, { type: ui.mode, ids, x: wx, y: wy, queue: e.shiftKey, human: true });
        AC.audio.play('ack');
        if (!e.shiftKey) this.cancelMode();
        return;
      }
      ui.drag = { x0: sx, y0: sy, x1: sx, y1: sy, active: false, shift: e.shiftKey, meta: e.metaKey || e.altKey };
    },
    onMove(e) {
      ui.mouse.x = e.clientX; ui.mouse.y = e.clientY;
      ui.mouse.inside = true;
      if (!this.g || !this.r) return;
      ui.mouseWorld = this.r.toWorld(e.clientX, e.clientY);
      if (this.pan) {
        this.r.cam.x = this.pan.cx - (e.clientX - this.pan.x) / this.r.cam.zoom;
        this.r.cam.y = this.pan.cy - (e.clientY - this.pan.y) / this.r.cam.zoom;
        this.r.clampCam();
        return;
      }
      if (this.miniDrag) { this.miniTo(e); return; }
      if (ui.drag) {
        ui.drag.x1 = e.clientX; ui.drag.y1 = e.clientY;
        if (Math.abs(ui.drag.x1 - ui.drag.x0) + Math.abs(ui.drag.y1 - ui.drag.y0) > 6) ui.drag.active = true;
      }
      if (e.target === this.cv) {
        const now = performance.now();
        if (!this.lastHover || now - this.lastHover > 50) {
          this.lastHover = now;
          const h = this.active() ? this.pickAt(e.clientX, e.clientY) : null;
          ui.hover = h ? h.id : 0;
          const enemy = h && (h.kind === 'unit' || h.kind === 'building') && this.g.areEnemies(this.g.localPlayer, h.owner);
          document.body.dataset.hover = enemy ? 'enemy' : h && h.kind === 'resource' ? 'resource' : h && h.owner === this.g.localPlayer ? 'friend' : '';
        }
      } else ui.hover = 0;
    },
    onUp(e) {
      if (this.pan && e.button === 1) { this.pan = null; return; }
      this.pan = null;
      this.miniDrag = false;
      if (!ui.drag || !this.active()) { ui.drag = null; return; }
      const d = ui.drag;
      ui.drag = null;
      if (d.active) { this.boxSelect(d.x0, d.y0, d.x1, d.y1, d.shift); return; }
      const t = this.pickAt(d.x0, d.y0);
      const g = this.g;
      if (!t) { if (!d.shift) this.setSelection([]); return; }
      if (d.meta && t.kind === 'unit' && t.owner === g.localPlayer) { this.selectSameType(t); return; }
      if (d.shift && t.owner === g.localPlayer && (t.kind === 'unit' || t.kind === 'building')) {
        const s = ui.selected.slice();
        const i = s.indexOf(t.id);
        if (i >= 0) s.splice(i, 1); else if (s.every((id) => { const x = g.get(id); return x && x.owner === g.localPlayer; })) s.push(t.id);
        this.setSelection(s);
        return;
      }
      this.setSelection([t.id]);
    },
    onDbl(e) {
      if (!this.active()) return;
      const t = this.pickAt(e.clientX, e.clientY);
      if (t && (t.kind === 'unit' || t.kind === 'building') && t.owner === this.g.localPlayer) this.selectSameType(t);
    },
    selectSameType(t) {
      const g = this.g, r = this.r;
      const list = (t.kind === 'unit' ? g.units : g.buildings).filter((u) => {
        if (u.dead || u.owner !== g.localPlayer || u.def.id !== t.def.id) return false;
        const [sx, sy] = r.toScreen(u.x, u.y);
        return sx > 0 && sy > 0 && sx < r.vw && sy < r.vh;
      });
      this.setSelection(list.map((u) => u.id));
    },
    smart(wx, wy, shift) {
      const g = this.g;
      const t = g.entityAt(wx, wy, g.localPlayer);
      const ok = g.command(g.localPlayer, { type: 'smart', ids: ui.selected, x: wx, y: wy, target: t ? t.id : 0, queue: shift });
      if (ok) {
        const sel = ui.selected.map((id) => g.get(id)).find((e) => e && e.owner === g.localPlayer && e.kind === 'unit');
        if (sel) AC.audio.play('ack', 0.8);
      }
    },
    onWheel(e) {
      if (!this.active()) return;
      e.preventDefault();
      const mode = (AC.settings && AC.settings.wheel) || 'auto';
      const pinch = e.ctrlKey;
      let zoom = pinch || mode === 'zoom' || e.altKey;
      if (mode === 'auto' && !pinch && !e.altKey) {
        // trackpads deliver small pixel deltas (and horizontal motion); mouse wheels deliver large line steps
        const mouseLike = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
        zoom = mouseLike;
      }
      if (zoom) {
        const f = Math.exp(-e.deltaY * (pinch ? 0.012 : 0.0015));
        this.zoomAt(e.clientX, e.clientY, this.r.cam.zoom * f);
      } else {
        const sp = (AC.settings && AC.settings.scrollSpeed) || 1;
        this.r.cam.x += (e.deltaX * sp) / this.r.cam.zoom;
        this.r.cam.y += (e.deltaY * sp) / this.r.cam.zoom;
        this.r.clampCam();
      }
    },
    zoomAt(sx, sy, z) {
      const r = this.r;
      const [wx, wy] = r.toWorld(sx, sy);
      r.cam.zoom = U.clamp(z, 0.45, 1.8);
      const [wx2, wy2] = r.toWorld(sx, sy);
      r.cam.x += wx - wx2; r.cam.y += wy - wy2;
      r.clampCam();
    },
    onMini(e, down) {
      if (!this.active()) return;
      e.preventDefault(); e.stopPropagation();
      const right = e.button === 2 || (e.button === 0 && e.ctrlKey);
      const rect = e.currentTarget.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      const wx = fx * this.g.map.w * T, wy = fy * this.g.map.h * T;
      if (right) {
        this.g.command(this.g.localPlayer, { type: 'smart', ids: ui.selected, x: wx, y: wy, queue: e.shiftKey });
        return;
      }
      if (ui.mode === 'attackMove' || ui.mode === 'move' || ui.mode === 'patrol') {
        this.g.command(this.g.localPlayer, { type: ui.mode, ids: ui.selected, x: wx, y: wy, queue: e.shiftKey, human: true });
        this.cancelMode();
        return;
      }
      this.miniRect = rect;
      this.miniDrag = true;
      this.miniTo(e);
    },
    miniTo(e) {
      const rect = this.miniRect;
      const fx = U.clamp((e.clientX - rect.left) / rect.width, 0, 1), fy = U.clamp((e.clientY - rect.top) / rect.height, 0, 1);
      this.r.centerOn(fx * this.g.map.w * T, fy * this.g.map.h * T);
    },

    // ------------------------------------------------------------ keyboard
    onKey(e, down) {
      const k = e.key;
      ui.shiftHeld = e.shiftKey;
      if (!down) { this.keys[e.code] = false; return; }
      if (AC.state === 'playing' && (k === 'Escape' || k === 'F10')) {
        if (AC.paused) { AC.menus.resume(); e.preventDefault(); return; }
        if (ui.mode !== 'normal') { this.cancelMode(); e.preventDefault(); return; }
        if (ui.submenu) { ui.submenu = null; this.hud.slowT = 1; e.preventDefault(); return; }
        // cancel queue for selected building
        const { blds } = this.hud.selectionContext();
        if (k === 'Escape' && blds.length && (blds[0].trainQ.length || !blds[0].built)) { if (this.hud.pressKey('Esc')) { e.preventDefault(); return; } }
        AC.menus.pause();
        e.preventDefault();
        return;
      }
      if (!this.active()) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys[e.code] = true;
      const code = e.code;
      // control groups
      const m = code.match(/^Digit(\d)$/);
      if (m) {
        const n = m[1];
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || e.altKey) {
          ui.groups[n] = ui.selected.filter((id) => { const x = this.g.get(id); return x && x.owner === this.g.localPlayer; });
          this.hud.message('Group ' + n + ' set.', 'info', 1.5);
          return;
        }
        if (e.shiftKey) { ui.groups[n] = [...new Set([...(ui.groups[n] || []), ...ui.selected])]; return; }
        const grp = (ui.groups[n] || []).filter((id) => { const x = this.g.get(id); return x && !x.dead; });
        if (!grp.length) return;
        const now = performance.now();
        if (this.lastGroup === n && now - this.lastGroupT < 400) {
          const xs = grp.map((id) => this.g.get(id));
          this.r.centerOn(xs.reduce((a, u) => a + u.x, 0) / xs.length, xs.reduce((a, u) => a + u.y, 0) / xs.length);
        }
        this.lastGroup = n; this.lastGroupT = now;
        this.setSelection(grp);
        return;
      }
      if (k === 'Tab') { e.preventDefault(); ui.activeType = (ui.activeType || 0) + 1; this.hud.slowT = 1; for (const el of this.hud.cmd.children) el._sig = null; return; }
      if (k === ' ') {
        e.preventDefault();
        if (ui.lastAlert) this.r.centerOn(ui.lastAlert.x, ui.lastAlert.y);
        return;
      }
      if (k === 'F1' || k === '.') { e.preventDefault(); this.selectIdleWorker(); return; }
      if (k === 'F2' || k === ',') { e.preventDefault(); this.selectArmy(); return; }
      if (k === 'Home' || k === 'Backspace' || k === 'F3') {
        e.preventDefault();
        const hq = this.g.hq(this.g.localPlayer);
        if (hq) this.r.centerOn(hq.x, hq.y);
        return;
      }
      if (k === '+' || k === '=') { this.zoomAt(this.r.vw / 2, this.r.vh / 2, this.r.cam.zoom * 1.15); return; }
      if (k === '-' || k === '_') { this.zoomAt(this.r.vw / 2, this.r.vh / 2, this.r.cam.zoom / 1.15); return; }
      if (code.startsWith('Arrow')) { e.preventDefault(); return; }
      if (k === 'F10') { e.preventDefault(); return; }
      if (e.metaKey || e.ctrlKey) return; // leave browser shortcuts alone
      if (k.length === 1) {
        if (this.hud.pressKey(k)) e.preventDefault();
      }
    },
    // track the pointer from page load, so edge scrolling never acts on a stale position
    trackPointer() {
      window.addEventListener('mousemove', (e) => this.onMove(e));
      window.addEventListener('blur', () => { ui.mouse.inside = false; });
    },
    // per-frame camera movement (arrows + edge scroll)
    update(dt) {
      if (!this.active()) return;
      const r = this.r;
      const sp = 900 * ((AC.settings && AC.settings.scrollSpeed) || 1) * dt / r.cam.zoom;
      let dx = 0, dy = 0;
      if (this.keys.ArrowLeft) dx -= sp;
      if (this.keys.ArrowRight) dx += sp;
      if (this.keys.ArrowUp) dy -= sp;
      if (this.keys.ArrowDown) dy += sp;
      if (AC.settings && AC.settings.edgeScroll && ui.mouse.inside && document.hasFocus() && !ui.drag) {
        const m = 6;
        if (ui.mouse.x <= m) dx -= sp;
        if (ui.mouse.x >= r.vw - m) dx += sp;
        if (ui.mouse.y <= m) dy -= sp;
        if (ui.mouse.y >= r.vh - m) dy += sp;
      }
      if (dx || dy) { r.cam.x += dx; r.cam.y += dy; r.clampCam(); if (ui.mouse) ui.mouseWorld = r.toWorld(ui.mouse.x, ui.mouse.y); }
      // prune pings
      ui.pings = ui.pings.filter((p) => r.time - p.t0 < 3);
    },
  });
  Input.trackPointer();
})();
