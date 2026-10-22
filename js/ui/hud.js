// Amber and Chaos — HUD: resources, selection panel, command card, hero bar, messages, tooltips.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;
  const $ = (id) => document.getElementById(id);

  const iconURL = new Map();
  function iconSrc(defId, color) {
    const key = defId + '|' + (color ? color.main : '');
    let u = iconURL.get(key);
    if (!u) {
      u = AC.Art.icon(defId, color, 64, 2).toDataURL();
      iconURL.set(key, u);
    }
    return u;
  }
  AC.iconSrc = iconSrc;
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function costHtml(cost, p, supply, time) {
    let h = '';
    if (cost.d) h += `<span class="c-d${p && p.res.d < cost.d ? ' short' : ''}"><i class="ico diamond"></i>${cost.d}</span>`;
    if (cost.p) h += `<span class="c-p${p && p.res.p < cost.p ? ' short' : ''}"><i class="ico power ${p ? p.faction : ''}"></i>${cost.p}</span>`;
    if (supply) h += `<span class="c-s"><i class="ico supply"></i>${supply}</span>`;
    if (time) h += `<span class="c-t">⏱ ${Math.round(time)}s</span>`;
    return h;
  }
  const ORDER_NAMES = { move: 'Moving', attackMove: 'Advancing', patrol: 'Patrolling', attack: 'Attacking', hold: 'Holding position', follow: 'Following', gather: 'Gathering diamonds', returnCargo: 'Returning with diamonds', build: 'Building', repair: 'Repairing', cast: 'Casting' };
  const BUFF_NAMES = {
    stun: ['Stunned', '#ffe060'], root: ['Rooted', '#b060ff'], slow: ['Slowed', '#80c0ff'], haste: ['Inspired', '#ffd060'], hunted: ['Hunted', '#ff5050'],
    holdLine: ['Holding the line', '#a0b8ff'], riposte: ['Riposte', '#ff6060'], fury: ['Fury', '#ff3030'], chaosShape: ['Shape of Chaos', '#c040ff'],
    drum: ['Riding Drum', '#e0e8ff'], feign: ['Hidden', '#40a060'], weaken: ['Doubting', '#9090b0'], aura_damage: ['Master of Arms', '#f0a040'],
    aura_armor: ['Hendrake discipline', '#c03030'], surge: ['Surge of the Logrus', '#e070ff'], taunt: ['Taunted', '#ff8080'], poison: ['Poisoned', '#80ff40'],
  };

  class HUD {
    constructor(game, renderer) {
      this.g = game;
      this.r = renderer;
      this.root = $('hud');
      this.cmd = $('cmdCard');
      this.sel = $('selPanel');
      this.mini = $('minimap');
      this.tip = $('tooltip');
      this.msgs = $('messages');
      this.heroBar = $('heroBar');
      this.buttons = [];
      this.lastSig = '';
      this.lastSelSig = '';
      this.t = 0;
      this.dialogQ = [];
      this.root.classList.remove('hidden');
      document.body.classList.toggle('faction-chaos', game.players[game.localPlayer].faction === 'chaos');
      this.cmd.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const b = document.createElement('button');
        b.className = 'cmd empty';
        b.dataset.slot = i;
        b.innerHTML = '<span class="glyph"></span><span class="hk"></span><span class="cd"></span><span class="cnt"></span>';
        b.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        b.addEventListener('click', (e) => { e.stopPropagation(); this.press(i, e.shiftKey); });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.pressRight(i); });
        b.addEventListener('mouseenter', () => { this.hoverSlot = i; this.showTip(i, b); });
        b.addEventListener('mouseleave', () => { this.hoverSlot = -1; this.hideTip(); });
        this.cmd.appendChild(b);
      }
      $('menuBtn').onclick = () => AC.menus.pause();
      $('idleBtn').onclick = () => AC.input.selectIdleWorker();
      this.resizeMinimap();
      this.objectives = $('objectives');
      this.objectives.innerHTML = '';
      this.msgs.innerHTML = '';
      $('dialog').classList.add('hidden');
      this.sel.addEventListener('click', (e) => this.onSelClick(e));
      this.sel.addEventListener('mousedown', (e) => e.stopPropagation());
      this.heroBar.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    resizeMinimap() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = this.mini.getBoundingClientRect();
      this.mini.width = Math.round((r.width || 180) * dpr);
      this.mini.height = Math.round((r.height || 180) * dpr);
      AC.ui.bottomH = $('bottom').getBoundingClientRect().height || 180;
    }
    get me() { return this.g.players[this.g.localPlayer]; }

    // ------------------------------------------------------------ per-frame
    update(dt) {
      const g = this.g, p = this.me;
      this.t += dt;
      this.setText('resDv', Math.floor(p.res.d));
      this.setText('resPv', Math.floor(p.res.p));
      this.setText('resPl', p.F.power);
      this.setText('resSv', p.supplyUsed + '/' + p.supplyCap);
      $('resS').classList.toggle('blocked', p.supplyUsed >= p.supplyCap);
      this.setText('clock', U.formatTime(g.time));
      const idle = g.units.filter((u) => !u.dead && u.owner === p.id && u.def.role === 'worker' && !u.order).length;
      this.setText('idleBtn', idle ? 'Idle workers: ' + idle : 'No idle workers');
      $('idleBtn').classList.toggle('alert', idle > 0);
      this.mmT = (this.mmT || 0) + dt;
      if (this.mmT > 0.1) { this.mmT = 0; this.r.renderMinimap(this.mini); }
      this.slowT = (this.slowT || 0) + dt;
      if (this.slowT > 0.12) {
        this.slowT = 0;
        this.updateCommandCard();
        this.updateSelPanel();
        this.updateHeroBar();
        this.updateObjectives();
        if (this.hoverSlot >= 0 && this.buttons[this.hoverSlot]) this.showTip(this.hoverSlot, this.cmd.children[this.hoverSlot]);
      }
      this.updateDialog(dt);
      // fade messages
      for (const m of [...this.msgs.children]) {
        m._t = (m._t || 0) + dt;
        if (m._t > (m._life || 5)) m.remove();
        else if (m._t > (m._life || 5) - 1) m.style.opacity = String((m._life || 5) - m._t);
      }
    }
    setText(id, v) {
      const el = this['_' + id] || (this['_' + id] = $(id));
      if (el && el._v !== v) { el._v = v; el.textContent = v; }
    }

    // ------------------------------------------------------------ messages & events
    message(text, kind, life) {
      const d = document.createElement('div');
      d.className = 'msg ' + (kind || '');
      d.textContent = text;
      d._life = life || (kind === 'error' ? 2.5 : 5);
      this.msgs.appendChild(d);
      while (this.msgs.children.length > 6) this.msgs.firstChild.remove();
    }
    onEvent(ev) {
      const g = this.g, me = g.localPlayer;
      const A = AC.audio;
      switch (ev.type) {
        case 'error':
          if (ev.player === me) { this.message(ev.text, 'error'); A.play('error'); }
          break;
        case 'message':
          this.message(ev.text, ev.kind || 'info', ev.life);
          break;
        case 'underAttack':
          if (ev.player === me) {
            this.message(ev.hero ? 'A hero of yours is under attack!' : ev.building ? 'Your works are under attack!' : 'Your forces are under attack!', 'warn');
            A.play('alert');
            AC.ui.pings.push({ x: ev.x, y: ev.y, t0: this.r.time });
            AC.ui.lastAlert = { x: ev.x, y: ev.y };
          }
          break;
        case 'unitReady':
          if (ev.player === me) {
            A.play('unitReady', 0.7);
            const d = AC.UNITS[ev.def];
            if (d.hero) { this.message(d.name + ' answers your call.', 'good'); A.play('levelup', 0.5); }
          }
          break;
        case 'buildingComplete':
          if (ev.player === me) { this.message(AC.BUILDINGS[ev.def].name + ' is complete.', 'good'); AC.ui.lastAlert = { x: ev.x, y: ev.y }; }
          break;
        case 'researchComplete':
          if (ev.player === me) this.message('Research complete: ' + AC.UPGRADES[ev.id].name + '.', 'good');
          break;
        case 'heroDied':
          if (ev.player === me) this.message(AC.UNITS[ev.hero].name + ' has fallen. Revive them at your hero hall.', 'warn');
          else if (g.areEnemies(me, ev.player)) this.message('The enemy ' + AC.UNITS[ev.hero].name + ' has fallen!', 'good');
          break;
        case 'heroLevel':
          if (ev.player === me) { const h = g.get(ev.id); if (h) this.message(h.def.name + ' reaches level ' + ev.level + '.', 'good'); }
          break;
        case 'siteCaptured':
          if (ev.player === me) this.message('You hold a Broken Pattern. It yields ' + this.me.F.power + '.', 'good');
          else if (g.areEnemies(me, ev.player)) this.message('The enemy has seized a Broken Pattern.', 'warn');
          break;
        case 'siteLost':
          if (ev.player === me) this.message('A Broken Pattern has been wrested from you.', 'warn');
          break;
        case 'depleted':
          if (ev.player === me) this.message('A field of diamonds is exhausted.', 'info');
          break;
        case 'supply':
          if (ev.player === me) A.play('error');
          break;
        case 'possessed':
          if (ev.from === me) this.message("A ty'iga has possessed one of your soldiers!", 'warn');
          else if (ev.player === me) this.message("Your ty'iga takes a new body.", 'good');
          break;
        case 'eliminated':
          if (ev.player !== me) this.message(g.players[ev.player].name + ' has been destroyed.', 'good', 7);
          break;
        case 'aiAttack':
          break;
        case 'power':
          this.message(ev.player === me ? AC.POWERS[ev.power].name + '!' : 'The enemy invokes the ' + AC.POWERS[ev.power].name + '!', ev.player === me ? 'good' : 'warn');
          break;
        case 'jewelUsed':
          if (ev.player !== me && g.areEnemies(me, ev.player)) this.message('The Jewel of Judgment calls down a storm!', 'warn');
          break;
        case 'waveUsed':
          if (ev.player !== me && g.areEnemies(me, ev.player)) this.message('A Wave of Chaos breaks over the land!', 'warn');
          break;
        case 'dialog':
          this.queueDialog(ev);
          break;
        case 'objectives':
          this.lastObjSig = '';
          break;
      }
    }

    // ------------------------------------------------------------ dialog (scenario speech)
    queueDialog(d) { this.dialogQ.push(d); }
    updateDialog(dt) {
      const el = $('dialog');
      if (this.curDialog) {
        this.curDialog._t += dt;
        if (this.curDialog._t > (this.curDialog.life || Math.max(5, this.curDialog.text.length / 14))) { this.curDialog = null; el.classList.add('hidden'); }
        return;
      }
      if (!this.dialogQ.length) return;
      const d = (this.curDialog = this.dialogQ.shift());
      d._t = 0;
      const icon = d.portrait ? `<img src="${iconSrc(d.portrait, d.color ? AC.PLAYER_COLORS[d.color] : AC.PLAYER_COLORS[0])}">` : '';
      el.innerHTML = `${icon}<div><div class="who">${esc(d.who || '')}</div><div class="what">${esc(d.text)}</div></div>`;
      el.classList.remove('hidden');
      el.onclick = () => { this.curDialog = null; el.classList.add('hidden'); };
    }

    // ------------------------------------------------------------ objectives
    updateObjectives() {
      const g = this.g;
      const list = g.objectives || [];
      const sig = list.map((o) => o.text + o.done + o.failed + (o.progress || '')).join('|');
      if (sig === this.lastObjSig) return;
      this.lastObjSig = sig;
      if (!list.length) { this.objectives.classList.add('hidden'); return; }
      this.objectives.classList.remove('hidden');
      this.objectives.innerHTML = '<div class="ot">Objectives</div>' + list.filter((o) => !o.hidden).map((o) =>
        `<div class="obj ${o.done ? 'done' : ''} ${o.failed ? 'failed' : ''} ${o.optional ? 'opt' : ''}">${o.done ? '✔' : o.failed ? '✘' : '◇'} ${esc(o.text)}${o.progress ? ' <span class="prog">' + esc(o.progress) + '</span>' : ''}</div>`).join('');
    }

    // ------------------------------------------------------------ hero bar
    updateHeroBar() {
      const g = this.g, p = this.me;
      const heroes = g.units.filter((u) => !u.dead && u.owner === p.id && u.def.hero);
      const dead = Object.keys(p.deadHeroes);
      const sig = heroes.map((h) => h.id + ':' + Math.round((h.hp / h.maxHp) * 20) + ':' + h.level + ':' + Math.round((h.mana / Math.max(1, h.maxMana)) * 10) + (AC.ui.selected.indexOf(h.id) >= 0 ? 's' : '')).join(',') + '|' + dead.join(',');
      if (sig === this.heroSig) return;
      this.heroSig = sig;
      let h = '';
      for (const u of heroes) {
        h += `<div class="hero ${AC.ui.selected.indexOf(u.id) >= 0 ? 'sel' : ''}" data-id="${u.id}" title="${esc(u.def.name)} — ${esc(u.def.title)}"><img src="${iconSrc(u.def.id, p.color)}"><span class="lv">${u.level}</span><div class="hb"><div style="width:${(u.hp / u.maxHp) * 100}%"></div></div><div class="mb"><div style="width:${(u.mana / Math.max(1, u.maxMana)) * 100}%"></div></div></div>`;
      }
      for (const id of dead) h += `<div class="hero dead" title="${esc(AC.UNITS[id].name)} has fallen"><img src="${iconSrc(id, p.color)}"><span class="lv">✝</span></div>`;
      this.heroBar.innerHTML = h;
      for (const el of this.heroBar.querySelectorAll('.hero[data-id]')) {
        el.onclick = (e) => {
          const id = +el.dataset.id;
          const now = performance.now();
          if (this._lastHeroClick === id && now - this._lastHeroT < 350) { const u = g.get(id); if (u) this.r.centerOn(u.x, u.y); }
          this._lastHeroClick = id; this._lastHeroT = now;
          AC.input.setSelection(e.shiftKey ? [...new Set([...AC.ui.selected, id])] : [id]);
        };
      }
    }

    // ------------------------------------------------------------ selection panel
    onSelClick(e) {
      const el = e.target.closest('[data-pick]');
      if (el) {
        const id = +el.dataset.pick;
        if (e.shiftKey) AC.input.setSelection(AC.ui.selected.filter((x) => x !== id));
        else AC.input.setSelection([id]);
        return;
      }
      const q = e.target.closest('[data-q]');
      if (q) {
        const b = this.g.get(+q.dataset.b);
        if (b) this.g.command(this.g.localPlayer, { type: 'cancelTrain', ids: [b.id], index: +q.dataset.q });
        return;
      }
      const rs = e.target.closest('[data-cancelres]');
      if (rs) this.g.command(this.g.localPlayer, { type: 'cancelResearch', ids: [+rs.dataset.cancelres] });
    }
    updateSelPanel() {
      const g = this.g;
      const sel = AC.ui.selected.map((id) => g.get(id)).filter((e) => e && !e.dead);
      if (sel.length !== AC.ui.selected.length) AC.ui.selected = sel.map((e) => e.id);
      if (!sel.length) {
        const sig = 'none';
        if (this.lastSelSig !== sig) {
          this.lastSelSig = sig;
          const p = this.me;
          this.sel.innerHTML = `<div class="empty-sel"><div class="ftitle">${esc(p.F.title)}</div><div class="hint">Select units with a click or drag. Right-click (or two-finger click) to command.</div><div class="hint">${esc(g.mapName || '')}</div></div>`;
        }
        return;
      }
      if (sel.length === 1) return this.singlePanel(sel[0]);
      // multi
      const sig = 'multi:' + sel.map((e) => e.id + ':' + Math.round((e.hp / e.maxHp) * 10)).join(',');
      if (sig === this.lastSelSig) return;
      this.lastSelSig = sig;
      let h = '<div class="multi">';
      for (const e of sel.slice(0, 36)) {
        const p = g.players[e.owner];
        h += `<div class="mi" data-pick="${e.id}" title="${esc(e.def.name)}"><img src="${iconSrc(e.def.id, p ? p.color : AC.NEUTRAL_COLOR)}"><div class="hb"><div style="width:${(e.hp / e.maxHp) * 100}%;background:${e.hp / e.maxHp > 0.6 ? '#4ee060' : e.hp / e.maxHp > 0.3 ? '#e0d040' : '#e05030'}"></div></div></div>`;
      }
      if (sel.length > 36) h += `<div class="more">+${sel.length - 36}</div>`;
      h += '</div>';
      this.sel.innerHTML = h;
    }
    singlePanel(e) {
      const g = this.g;
      const p = g.players[e.owner];
      const def = e.def;
      let h = '';
      if (e.kind === 'resource') {
        const sig = 'res:' + e.id + ':' + e.amount;
        if (sig === this.lastSelSig) return;
        this.lastSelSig = sig;
        this.sel.innerHTML = `<div class="single"><div class="portrait diamonds"></div><div class="info"><div class="nm">Diamond-strewn Sand</div><div class="sub">${e.amount} diamonds remain</div><div class="lore">Out of a Shadow where the stones lie loose upon the sand. Corwin paid for his rifles with such diamonds.</div></div></div>`;
        return;
      }
      if (e.kind === 'site') {
        if (e.isPattern) {
          if (this.lastSelSig === 'pattern') return;
          this.lastSelSig = 'pattern';
          this.sel.innerHTML = `<div class="single"><div class="portrait site"></div><div class="info"><div class="nm">The Pattern</div><div class="sub">Beneath Castle Amber, in a cavern deep inside Kolvir</div><div class="lore">A single intertwined curve through three veils. Walking it is like wading in lead boots, and to stop or stray is death. Whoever of the blood reaches its centre may walk in Shadow.</div></div></div>`;
          return;
        }
        const own = e.capOwner >= 0 ? g.players[e.capOwner] : null;
        const sig = 'site:' + e.id + ':' + e.capOwner + ':' + Math.round(e.capProgress * 20);
        if (sig === this.lastSelSig) return;
        this.lastSelSig = sig;
        this.sel.innerHTML = `<div class="single"><div class="portrait site"></div><div class="info"><div class="nm">${esc(def.name)}</div><div class="sub">${own ? 'Held by ' + esc(own.name) : 'Unclaimed'} ${e.capProgress > 0 && e.capProgress < 1 ? '— ' + Math.round(e.capProgress * 100) + '%' : ''}</div><div class="lore">An imperfect copy of the Pattern. Sorcerers draw power from its break. Stand units beside it, with no enemies near, to claim it. It yields 2 Order (Amber) or Flux (Chaos) per second.</div></div></div>`;
        return;
      }
      const sig = 'one:' + e.id + ':' + Math.round(e.hp) + ':' + Math.round(e.mana) + ':' + (e.order ? e.order.type + (e.order.stage || '') : '') + ':' + e.level + ':' + e.buffs.map((b) => b.id).join('') + ':' + (e.trainQ ? e.trainQ.map((q) => q.id + Math.round((q.t / q.time) * 30)).join('') : '') + ':' + (e.research ? Math.round((e.research.t / e.research.time) * 30) : '') + ':' + (e.progress != null ? Math.round(e.progress * 50) : '') + (e.carry || '') + (e.owner);
      if (sig === this.lastSelSig) return;
      this.lastSelSig = sig;
      const col = p ? p.color : AC.NEUTRAL_COLOR;
      const owner = p ? (p.id === g.localPlayer ? '' : p.isNeutral ? 'Wild' : esc(p.name)) : '';
      h += `<div class="single"><div class="portrait"><img src="${iconSrc(def.id, col)}">${def.hero ? '<span class="lv">' + e.level + '</span>' : ''}</div><div class="info">`;
      h += `<div class="nm">${esc(def.name)}${def.title ? ' <span class="ttl">' + esc(def.title) + '</span>' : ''}${owner ? ' <span class="own">(' + owner + ')</span>' : ''}</div>`;
      h += `<div class="bars"><div class="bar hp"><div style="width:${(e.hp / e.maxHp) * 100}%"></div><span>${Math.ceil(e.hp)} / ${e.maxHp}</span></div>`;
      if (e.maxMana) h += `<div class="bar mp"><div style="width:${(e.mana / e.maxMana) * 100}%"></div><span>${Math.floor(e.mana)} / ${e.maxMana}</span></div>`;
      if (def.hero && e.level < AC.HERO_LEVELS.length) {
        const a = AC.HERO_LEVELS[e.level - 1], b = AC.HERO_LEVELS[e.level];
        h += `<div class="bar xp"><div style="width:${((e.xp - a) / (b - a)) * 100}%"></div><span>Level ${e.level} — ${Math.floor(e.xp)} / ${b} xp</span></div>`;
      }
      h += '</div>';
      if (e.kind === 'unit') {
        const m = e.mods;
        const dmg = Math.round(def.dmg * (m ? m.dmg : 1) * (e.lvlDmg || 1));
        const rng = def.projectile ? Math.round((AC.Behavior.range(e)) / T * 10) / 10 + ' tiles' : 'melee';
        h += `<div class="stats"><span title="Damage">⚔ ${dmg} <em>${def.dmgType}</em></span><span title="Armour">⛨ ${def.armor + (m ? m.armor : 0)} <em>${def.armorType}</em></span><span title="Range">➶ ${rng}</span><span title="Speed">➤ ${Math.round(def.speed * (m ? m.speed : 1))}</span>${def.air ? '<span>✈ flying</span>' : ''}</div>`;
        const st = [];
        if (e.channel) st.push('Concentrating on a Trump…');
        else if (e.order) st.push(ORDER_NAMES[e.order.type] || '');
        if (e.carry) st.push('carrying ' + e.carry + ' diamonds');
        if (def.passive) st.push('<b>' + esc(def.passive.name) + ':</b> ' + esc(def.passive.desc));
        if (e.summonT) st.push('Summoned — fades in ' + Math.ceil(e.summonT) + 's');
        h += `<div class="status">${st.join(' · ')}</div>`;
        if (e.buffs.length) {
          const seen = new Set();
          h += '<div class="buffs">' + e.buffs.filter((b) => BUFF_NAMES[b.id] && !seen.has(b.id) && seen.add(b.id)).map((b) => `<span style="border-color:${BUFF_NAMES[b.id][1]}">${BUFF_NAMES[b.id][0]}</span>`).join('') + '</div>';
        }
        h += `<div class="lore">${esc(def.desc || '')}</div>`;
      } else if (e.kind === 'building') {
        if (!e.built) {
          h += `<div class="status">${def.faction === 'chaos' ? 'Being summoned' : 'Under construction'}: ${Math.floor(e.progress * 100)}%${def.faction === 'amber' && !def.scenarioOnly ? (e.builders === 0 ? '' : '') : ''}</div>`;
        } else {
          const parts = [];
          if (def.supply) parts.push('+' + def.supply + ' supply');
          if (def.power) parts.push('+' + def.power + ' ' + (p ? p.F.power : 'power') + '/s');
          if (def.dropoff) parts.push('diamonds are brought here');
          if (def.spread) parts.push('spreads the Black Road');
          if (def.order) parts.push('holds back the Black Road');
          if (def.attack) parts.push('attacks: ' + def.attack.dmg + ' ' + def.attack.dmgType);
          h += `<div class="status">${parts.join(' · ')}</div>`;
          if (e.owner === g.localPlayer && e.trainQ.length) {
            h += '<div class="queue">';
            e.trainQ.forEach((q, i) => {
              h += `<div class="qi" data-q="${i}" data-b="${e.id}" title="Click to cancel"><img src="${iconSrc(q.id, col)}">${i === 0 ? `<div class="qp"><div style="width:${(q.t / q.time) * 100}%"></div></div>` : ''}</div>`;
            });
            h += '</div>';
          }
          if (e.owner === g.localPlayer && e.research) {
            const up = AC.UPGRADES[e.research.id];
            h += `<div class="queue"><div class="qi res" data-cancelres="${e.id}" title="Click to cancel"><span class="glyph" style="color:${up.color}">${up.icon}</span><div class="qp"><div style="width:${(e.research.t / e.research.time) * 100}%"></div></div></div><span class="rn">Researching ${esc(up.name)}</span></div>`;
          }
        }
        h += `<div class="lore">${esc(def.desc || '')}</div>`;
      }
      h += '</div></div>';
      this.sel.innerHTML = h;
    }

    // ------------------------------------------------------------ command card
    selectionContext() {
      const g = this.g;
      const sel = AC.ui.selected.map((id) => g.get(id)).filter((e) => e && !e.dead && e.owner === g.localPlayer);
      return { units: sel.filter((e) => e.kind === 'unit'), blds: sel.filter((e) => e.kind === 'building') };
    }
    computeButtons() {
      const g = this.g, p = this.me, ui = AC.ui;
      const B = new Array(12).fill(null);
      const { units, blds } = this.selectionContext();
      if (ui.mode === 'place' || ui.mode === 'target' || ui.mode === 'attackMove' || ui.mode === 'patrol' || ui.mode === 'move') {
        B[11] = { glyph: '✕', hk: 'Esc', name: 'Cancel', desc: 'Cancel the current order.', act: () => AC.input.cancelMode() };
        if (ui.mode === 'place') B[0] = { icon: ui.placeDef, name: AC.BUILDINGS[ui.placeDef].name, desc: 'Choose where to build. Hold Shift to place several.', active: true };
        if (ui.mode === 'target') { const ab = AC.ABILITIES[ui.targetAb]; B[0] = { glyph: ab.icon, color: ab.color, name: ab.name, desc: ab.target === 'unit' ? 'Choose a target.' : 'Choose a place.', active: true }; }
        return B;
      }
      if (units.length) {
        if (ui.submenu === 'build') {
          const list = AC.BUILD_MENU[p.faction].filter((id) => g.canBuildType(id));
          list.forEach((id, i) => {
            const def = AC.BUILDINGS[id];
            const req = g.missingReq(p.id, def);
            const unique = (id === 'castle' || id === 'spire') && g.hasBuilding(p.id, id);
            B[i] = {
              icon: id, hk: AC.BUILD_KEYS[id], name: def.name, cost: def.cost, time: def.time, desc: def.desc + (def.faction === 'chaos' && !def.anywhere ? ' Must stand on the Black Road.' : ''),
              req: unique ? 'There can be only one.' : req.length ? 'Requires ' + req.join(', ') : '',
              disabled: !!req.length || unique, short: !g.canAfford(p, def.cost),
              act: () => AC.input.beginPlace(id),
            };
          });
          B[11] = { glyph: '↩', hk: 'Esc', name: 'Back', desc: 'Return to the main commands.', act: () => { ui.submenu = null; this.lastSig = ''; } };
          return B;
        }
        // abilities of the active caster type
        const casters = units.filter((u) => u.def.abilities && u.def.abilities.length);
        const types = [...new Set(casters.map((u) => u.def.id))];
        const activeType = types.length ? types[(ui.activeType || 0) % types.length] : null;
        if (activeType) {
          const u = casters.find((c) => c.def.id === activeType);
          u.def.abilities.forEach((abId, i) => {
            const ab = AC.ABILITIES[abId];
            const chk = AC.Abilities.canCast(g, u, abId);
            const cdEnd = Math.max(u.cds[abId] || 0, ab.shared ? p.sharedCd[abId] || 0 : 0);
            const slot = { Q: 0, W: 1, E: 2, R: 3 }[ab.key];
            const reqMissing = ab.requires && !p.upgrades[ab.requires];
            B[slot != null ? slot : i] = {
              glyph: ab.icon, color: ab.color, hk: ab.key, name: ab.name, desc: ab.desc, mana: ab.mana,
              cd: cdEnd > g.time ? (cdEnd - g.time) / ab.cd : 0, cdText: cdEnd > g.time ? Math.ceil(cdEnd - g.time) : '',
              req: reqMissing ? 'Requires ' + AC.UPGRADES[ab.requires].name + ' (research)' : '',
              disabled: reqMissing, short: !chk.ok && !reqMissing && cdEnd <= g.time, extra: ab.powerCost ? { p: ab.powerCost } : null,
              act: () => AC.input.useAbility(abId),
            };
          });
        }
        const workers = units.filter((u) => u.def.role === 'worker');
        const fighters = units.filter((u) => u.def.dmg);
        B[4] = { glyph: '➤', hk: 'M', name: 'Move', desc: 'Move to a place, ignoring enemies on the way.', act: () => AC.input.setMode('move') };
        B[5] = { glyph: '■', hk: 'S', name: 'Stop', desc: 'Stop what you are doing.', act: () => g.command(p.id, { type: 'stop', ids: units.map((u) => u.id) }) };
        B[6] = { glyph: '⛨', hk: 'H', name: 'Hold Position', desc: 'Stand fast; attack only what comes within reach.', act: () => g.command(p.id, { type: 'hold', ids: units.map((u) => u.id) }) };
        if (fighters.length) B[7] = { glyph: '⚔', hk: 'A', name: 'Attack', desc: 'Attack a target, or advance to a place and fight everything on the way.', act: () => AC.input.setMode('attackMove') };
        if (fighters.length) B[8] = { glyph: '⟲', hk: 'P', name: 'Patrol', desc: 'Patrol between here and a chosen place.', act: () => AC.input.setMode('patrol') };
        if (workers.length) {
          B[9] = { glyph: '⚒', hk: 'B', name: 'Build', desc: p.faction === 'chaos' ? 'Summon a work of Chaos. Most must stand upon the Black Road. Once begun, a summoning needs no tending.' : 'Raise a work of Amber. The Steward must stay until it is finished.', act: () => { ui.submenu = 'build'; this.lastSig = ''; } };
          if (workers.some((w) => w.carry > 0)) B[10] = { glyph: '⤶', hk: 'R', name: 'Return Cargo', desc: 'Bring the diamonds back.', act: () => g.command(p.id, { type: 'returnCargo', ids: workers.map((u) => u.id) }) };
        }
        if (types.length > 1) B[11] = { glyph: '⇆', hk: 'Tab', name: 'Next group', desc: 'Show the abilities of the next kind of unit in your selection.', act: () => { ui.activeType = (ui.activeType || 0) + 1; this.lastSig = ''; } };
        return B;
      }
      if (blds.length) {
        const b = blds[0];
        const same = blds.filter((x) => x.def.id === b.def.id);
        const def = b.def;
        if (!b.built) {
          B[11] = { glyph: '✕', hk: 'Esc', name: 'Cancel construction', desc: 'Abandon the work. 75% of its cost is returned.', act: () => g.command(p.id, { type: 'cancelBuild', ids: same.map((x) => x.id) }) };
          return B;
        }
        let i = 0;
        for (const id of g.trainsOf(b)) {
          const d = AC.UNITS[id];
          B[i++] = { icon: id, hk: AC.TRAIN_KEYS[id], name: d.name, cost: d.cost, supply: d.supply, time: d.time, desc: d.desc, short: !g.canAfford(p, d.cost), cnt: same.reduce((a, x) => a + x.trainQ.filter((q) => q.id === id).length, 0), act: () => g.command(p.id, { type: 'train', ids: same.map((x) => x.id), def: id }) };
        }
        for (const id of def.heroes || []) {
          const d = AC.UNITS[id];
          const st = g.heroStatus(p.id, id);
          const tc = g.trainCost(p.id, id);
          B[i++] = {
            icon: id, hk: AC.TRAIN_KEYS[id], name: (tc.revive ? 'Revive ' : '') + d.name + ' — ' + d.title, cost: tc.cost, supply: d.supply, time: tc.time,
            desc: d.desc + ' Abilities: ' + d.abilities.slice(0, 2).map((a) => AC.ABILITIES[a].name).join(', ') + '. ' + d.passive.name + ': ' + d.passive.desc,
            req: st === 'alive' ? 'Already in the field' : st === 'queued' ? 'Already answering your call' : (p.heroCount || 0) >= AC.MAX_HEROES ? 'At most ' + AC.MAX_HEROES + ' heroes' : '',
            disabled: st === 'alive' || st === 'queued', short: !g.canAfford(p, tc.cost),
            act: () => g.command(p.id, { type: 'train', ids: same.map((x) => x.id), def: id }),
          };
        }
        let r = Math.max(i, 4);
        if (def.heroes) r = 8;
        for (const id of def.researches || []) {
          const up = AC.UPGRADES[id];
          const done = p.upgrades[id], doing = p.researching[id];
          B[r++] = {
            glyph: up.icon, color: up.color, hk: up.key, name: up.name, cost: up.cost, time: up.time, desc: up.desc,
            req: done ? 'Already known' : doing ? 'Being researched' : '', disabled: done || doing, short: !g.canAfford(p, up.cost),
            act: () => g.command(p.id, { type: 'research', ids: same.map((x) => x.id), up: id }),
          };
        }
        for (const id of def.powers || []) {
          const pw = AC.POWERS[id];
          const cdEnd = p.powerCd[id] || 0;
          B[10] = {
            glyph: pw.icon, color: pw.color, hk: pw.key, name: pw.name, cost: pw.cost, desc: pw.desc,
            cd: cdEnd > g.time ? (cdEnd - g.time) / pw.cd : 0, cdText: cdEnd > g.time ? Math.ceil(cdEnd - g.time) : '', short: !g.canAfford(p, pw.cost),
            act: () => g.command(p.id, { type: 'power', ids: [b.id], power: id }),
          };
        }
        if (b.trainQ.length) B[11] = { glyph: '✕', hk: 'Esc', name: 'Cancel last', desc: 'Cancel the last unit in the queue and get its cost back.', act: () => g.command(p.id, { type: 'cancelTrain', ids: [same.find((x) => x.trainQ.length).id] }) };
        return B;
      }
      return B;
    }
    updateCommandCard() {
      const B = this.computeButtons();
      this.buttons = B;
      const p = this.me;
      for (let i = 0; i < 12; i++) {
        const el = this.cmd.children[i];
        const b = B[i];
        const sig = b ? [b.icon, b.glyph, b.hk, b.name, b.disabled, b.short, b.active, Math.round((b.cd || 0) * 40), b.cnt].join('|') : 'x';
        if (el._sig === sig) continue;
        el._sig = sig;
        if (!b) { el.className = 'cmd empty'; el.querySelector('.glyph').innerHTML = ''; el.querySelector('.hk').textContent = ''; el.querySelector('.cd').style.height = '0'; el.querySelector('.cnt').textContent = ''; continue; }
        el.className = 'cmd' + (b.disabled ? ' disabled' : '') + (b.short ? ' short' : '') + (b.active ? ' active' : '');
        const gl = el.querySelector('.glyph');
        if (b.icon) gl.innerHTML = `<img src="${iconSrc(b.icon, p.color)}">`;
        else { gl.textContent = b.glyph || ''; gl.style.color = b.color || ''; }
        el.querySelector('.hk').textContent = b.hk || '';
        el.querySelector('.cd').style.height = (b.cd ? b.cd * 100 : 0) + '%';
        el.querySelector('.cd').textContent = b.cdText || '';
        el.querySelector('.cnt').textContent = b.cnt ? b.cnt : '';
      }
    }
    press(i, shift) {
      const b = this.buttons[i];
      if (!b || !b.act) return;
      if (b.disabled) { AC.audio.play('error'); if (b.req) this.message(b.req, 'error'); return; }
      AC.audio.play('uiClick');
      AC.ui.shiftHeld = !!shift;
      b.act();
      this.slowT = 1;
      this.lastSig = '';
      for (const el of this.cmd.children) el._sig = null;
    }
    pressRight(i) {
      // right-click a training button: cancel one
      const b = this.buttons[i];
      if (!b || !b.icon) return;
      const { blds } = this.selectionContext();
      const bb = blds.find((x) => x.trainQ.some((q) => q.id === b.icon));
      if (bb) {
        let idx = -1;
        bb.trainQ.forEach((q, k) => { if (q.id === b.icon) idx = k; });
        this.g.command(this.g.localPlayer, { type: 'cancelTrain', ids: [bb.id], index: idx });
      }
    }
    pressKey(key) {
      // returns true if consumed
      const B = this.computeButtons();
      this.buttons = B;
      for (let i = 0; i < 12; i++) {
        const b = B[i];
        if (b && b.hk && b.hk.toUpperCase() === key.toUpperCase() && b.act) { this.press(i, AC.ui.shiftHeld); return true; }
      }
      return false;
    }
    showTip(i, el) {
      const b = this.buttons[i];
      if (!b) { this.hideTip(); return; }
      const p = this.me;
      let h = `<div class="tt-n">${esc(b.name)}${b.hk ? ' <span class="tt-k">[' + esc(b.hk) + ']</span>' : ''}</div>`;
      if (b.cost || b.supply || b.time) h += `<div class="tt-c">${costHtml(b.cost || {}, p, b.supply, b.time)}</div>`;
      if (b.mana || b.extra) h += `<div class="tt-c">${b.mana ? '<span class="c-m">✦ ' + b.mana + ' mana</span>' : ''}${b.extra ? costHtml(b.extra, p) : ''}</div>`;
      if (b.req) h += `<div class="tt-r">${esc(b.req)}</div>`;
      if (b.desc) h += `<div class="tt-d">${esc(b.desc)}</div>`;
      this.tip.innerHTML = h;
      this.tip.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      this.tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
      this.tip.style.top = Math.max(8, r.top - th - 8) + 'px';
    }
    hideTip() { this.tip.classList.add('hidden'); }
    destroy() {
      this.root.classList.add('hidden');
      this.hideTip();
    }
  }
  AC.HUD = HUD;
})();
