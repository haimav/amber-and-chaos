// Amber and Chaos — procedural art for units, heroes, buildings, resources and Pattern sites.
// Units are drawn top-down, facing +x, centred on (0,0). Buildings are drawn in 3/4 view in a
// box from (0,0) to (S,S) where S = size * TILE.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const T = AC.TILE;
  const Art = (AC.Art = {});
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ helpers
  function shade(hex, f) {
    // f > 0 lighten, f < 0 darken
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  Art.shade = shade;
  function rgba(hex, a) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return 'rgba(' + parseInt(c.slice(0, 2), 16) + ',' + parseInt(c.slice(2, 4), 16) + ',' + parseInt(c.slice(4, 6), 16) + ',' + a + ')';
  }
  Art.rgba = rgba;
  function ell(ctx, x, y, rx, ry, fill, stroke, lw) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function circ(ctx, x, y, r, fill, stroke, lw) { ell(ctx, x, y, r, r, fill, stroke, lw); }
  function line(ctx, x0, y0, x1, y1, color, lw, cap) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1; ctx.lineCap = cap || 'round'; ctx.stroke();
  }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function rect(ctx, x, y, w, h, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.strokeRect(x, y, w, h); }
  }
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function rgrad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  Art.helpers = { ell, circ, line, poly, rect, grad, rgrad };

  // ------------------------------------------------------------------ humanoid
  // o: { r, body, armor, cape, skin, hair, helmet, weapon, shield, walk, atk, robe, horns, crown, glow, big }
  function humanoid(ctx, o) {
    const r = o.r;
    const walk = o.walk || 0;
    const sw = Math.sin(walk * 2.2) * r * 0.35;
    // legs
    if (!o.robe) {
      ell(ctx, sw, r * 0.38, r * 0.32, r * 0.2, o.legs || '#2a2420');
      ell(ctx, -sw, -r * 0.38, r * 0.32, r * 0.2, o.legs || '#2a2420');
    }
    // cape
    if (o.cape) {
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.78);
      ctx.quadraticCurveTo(-r * 1.15 - Math.abs(sw) * 0.3, -r * 0.95, -r * 1.25, 0);
      ctx.quadraticCurveTo(-r * 1.15 - Math.abs(sw) * 0.3, r * 0.95, r * 0.1, r * 0.78);
      ctx.closePath();
      ctx.fillStyle = o.cape; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      if (o.cape2) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.6); ctx.quadraticCurveTo(-r * 1.05, 0, -r * 0.4, r * 0.6);
        ctx.strokeStyle = o.cape2; ctx.lineWidth = r * 0.18; ctx.stroke();
      }
    }
    if (o.robe) {
      ell(ctx, -r * 0.1, 0, r * 0.95, r * 0.95, o.robe, 'rgba(0,0,0,0.5)');
      ell(ctx, -r * 0.1, 0, r * 0.6, r * 0.6, shade(o.robe.charAt(0) === '#' ? o.robe : '#555555', 0.15));
    }
    // weapon behind (bow/staff) or in hand
    const atk = o.atk || 0; // 0..1 swing phase
    const swing = Math.sin(atk * Math.PI) * 1.4;
    // shoulders/body
    ell(ctx, 0, 0, r * 0.52, r * 0.88, o.body, 'rgba(0,0,0,0.55)', 1);
    if (o.armor) ell(ctx, r * 0.05, 0, r * 0.36, r * 0.62, o.armor);
    // shield (left = -y)
    if (o.shield) {
      ell(ctx, r * 0.35, -r * 0.92, r * 0.42, r * 0.28, o.shield, 'rgba(0,0,0,0.6)', 1);
      circ(ctx, r * 0.4, -r * 0.92, r * 0.1, o.shieldBoss || '#d8c890');
    }
    // weapon arm (right = +y)
    ctx.save();
    ctx.translate(r * 0.15, r * 0.72);
    const wkind = o.weapon;
    if (wkind === 'sword' || wkind === 'greatsword' || wkind === 'rapier' || wkind === 'axe' || wkind === 'dagger' || wkind === 'lance' || wkind === 'claws' || wkind === 'mace') {
      ctx.rotate(-0.9 + swing);
    }
    ell(ctx, r * 0.2, 0, r * 0.26, r * 0.18, o.skinArm || o.skin || '#e0b090');
    switch (wkind) {
      case 'sword':
        line(ctx, r * 0.3, 0, r * 1.75, 0, o.blade || '#d8dde6', r * 0.16, 'butt');
        line(ctx, r * 0.3, -r * 0.22, r * 0.3, r * 0.22, '#806020', r * 0.12);
        if (o.bladeGlow) { ctx.globalAlpha = 0.45; line(ctx, r * 0.35, 0, r * 1.75, 0, o.bladeGlow, r * 0.4); ctx.globalAlpha = 1; }
        break;
      case 'greatsword':
        line(ctx, r * 0.3, 0, r * 2.2, 0, o.blade || '#c8ccd6', r * 0.26, 'butt');
        line(ctx, r * 0.3, -r * 0.3, r * 0.3, r * 0.3, '#5a4020', r * 0.16);
        break;
      case 'rapier':
        line(ctx, r * 0.3, 0, r * 1.9, 0, o.blade || '#e8e8f0', r * 0.09, 'butt');
        circ(ctx, r * 0.3, 0, r * 0.16, null, '#c0a040', 1.4);
        break;
      case 'dagger':
        line(ctx, r * 0.3, 0, r * 1.1, 0, '#e0e0e8', r * 0.14, 'butt');
        break;
      case 'axe':
        line(ctx, r * 0.1, 0, r * 1.7, 0, '#6a4a28', r * 0.14);
        poly(ctx, [r * 1.35, -r * 0.1, r * 1.75, -r * 0.6, r * 1.95, -r * 0.1, r * 1.75, r * 0.15], o.blade || '#c0c4cc', '#333', 1);
        break;
      case 'mace':
        line(ctx, r * 0.1, 0, r * 1.4, 0, '#5a4028', r * 0.14);
        circ(ctx, r * 1.45, 0, r * 0.28, '#8a8a90', '#333', 1);
        break;
      case 'lance':
        line(ctx, -r * 0.6, 0, r * 2.8, 0, '#8a6a40', r * 0.14);
        poly(ctx, [r * 2.8, -r * 0.12, r * 3.3, 0, r * 2.8, r * 0.12], '#d0d4dc');
        break;
      case 'claws':
        for (let k = -1; k <= 1; k++) line(ctx, r * 0.35, k * r * 0.1, r * 0.75, k * r * 0.18, '#f0e0d0', r * 0.07);
        break;
      case 'bow':
        ctx.beginPath(); ctx.arc(r * 0.45, 0, r * 0.9, -1.2, 1.2);
        ctx.strokeStyle = o.bowColor || '#7a5028'; ctx.lineWidth = r * 0.14; ctx.stroke();
        line(ctx, r * 0.45 + Math.cos(-1.2) * r * 0.9, Math.sin(-1.2) * r * 0.9, r * 0.45 + Math.cos(1.2) * r * 0.9, Math.sin(1.2) * r * 0.9, 'rgba(240,240,220,0.8)', 0.8);
        if (atk > 0) line(ctx, r * 0.2, 0, r * 1.4, 0, '#ddd', 1);
        break;
      case 'crossbow':
        line(ctx, -r * 0.1, -r * 0.1, r * 1.2, -r * 0.1, '#4a3420', r * 0.2);
        ctx.beginPath(); ctx.arc(r * 1.0, -r * 0.1, r * 0.6, -1.3, 1.3); ctx.strokeStyle = '#6a6a70'; ctx.lineWidth = r * 0.12; ctx.stroke();
        break;
      case 'rifle':
        line(ctx, -r * 0.3, -r * 0.15, r * 1.7, -r * 0.15, '#3a2a1a', r * 0.2, 'butt');
        line(ctx, r * 0.8, -r * 0.15, r * 1.85, -r * 0.15, '#505058', r * 0.12, 'butt');
        break;
      case 'staff':
        line(ctx, -r * 0.4, 0, r * 1.5, 0, o.staffColor || '#6a5030', r * 0.12);
        circ(ctx, r * 1.55, 0, r * 0.22, o.orb || '#80e0ff');
        if (o.orb) { ctx.globalAlpha = 0.35; circ(ctx, r * 1.55, 0, r * 0.45, o.orb); ctx.globalAlpha = 1; }
        break;
      case 'pick':
        line(ctx, 0, 0, r * 1.2, 0, '#6a4a28', r * 0.12);
        ctx.beginPath(); ctx.arc(r * 1.2, 0, r * 0.45, -1.4, 1.4); ctx.strokeStyle = '#9098a0'; ctx.lineWidth = r * 0.14; ctx.stroke();
        break;
      case 'fire':
        ctx.globalAlpha = 0.85;
        circ(ctx, r * 0.55, 0, r * 0.32, '#ffb040');
        circ(ctx, r * 0.55, 0, r * 0.18, '#fff0a0');
        ctx.globalAlpha = 1;
        break;
      case 'orb':
        circ(ctx, r * 0.6, 0, r * 0.26, o.orb || '#e070ff');
        ctx.globalAlpha = 0.35; circ(ctx, r * 0.6, 0, r * 0.5, o.orb || '#e070ff'); ctx.globalAlpha = 1;
        break;
    }
    ctx.restore();
    // off hand
    if (!o.shield && !o.noOffhand) ell(ctx, r * 0.35, -r * 0.7, r * 0.24, r * 0.17, o.skinArm || o.skin || '#e0b090');
    if (o.mechArm) {
      // Benedict's arm
      line(ctx, r * 0.1, -r * 0.7, r * 0.75, -r * 0.85, '#b8c0cc', r * 0.22);
      circ(ctx, r * 0.78, -r * 0.86, r * 0.14, '#d0d8e0');
    }
    // head
    const hr = r * (o.headR || 0.42);
    circ(ctx, r * 0.08, 0, hr, o.skin || '#e0b090', 'rgba(0,0,0,0.5)', 0.8);
    if (o.hair) {
      ctx.beginPath();
      ctx.arc(r * 0.02, 0, hr * 1.02, Math.PI * 0.45, Math.PI * 1.55);
      ctx.closePath();
      ctx.fillStyle = o.hair; ctx.fill();
      if (o.longHair) { ell(ctx, -r * 0.35, 0, hr * 0.8, hr * 0.85, o.hair); }
    }
    if (o.helmet) {
      circ(ctx, r * 0.05, 0, hr * 1.05, o.helmet, 'rgba(0,0,0,0.6)', 0.8);
      line(ctx, r * 0.05 - hr, 0, r * 0.05 + hr * 1.1, 0, shade(o.helmet.charAt(0) === '#' ? o.helmet : '#888888', 0.3), 1.2);
      if (o.plume) line(ctx, -hr * 0.2, 0, -hr * 1.6, 0, o.plume, hr * 0.5);
    }
    if (o.hood) circ(ctx, r * 0.0, 0, hr * 1.1, o.hood, 'rgba(0,0,0,0.5)', 0.8);
    if (o.horns) {
      ctx.strokeStyle = o.hornColor || '#e8dcc0'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.1, -hr * 0.6); ctx.quadraticCurveTo(-r * 0.3, -hr * 1.8, -r * 0.6, -hr * 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.1, hr * 0.6); ctx.quadraticCurveTo(-r * 0.3, hr * 1.8, -r * 0.6, hr * 1.1); ctx.stroke();
    }
    if (o.crown) {
      for (let k = -2; k <= 2; k++) circ(ctx, r * 0.05 + Math.abs(k) * -r * 0.05, k * hr * 0.4, r * 0.07, o.crown);
    }
    if (o.eyes) {
      circ(ctx, r * 0.08 + hr * 0.55, -hr * 0.35, r * 0.07, o.eyes);
      circ(ctx, r * 0.08 + hr * 0.55, hr * 0.35, r * 0.07, o.eyes);
    }
  }
  Art.humanoid = humanoid;

  // quadruped (dog, wolf, lion, horse)
  function quad(ctx, o) {
    const r = o.r, walk = o.walk || 0;
    const L = r * (o.len || 1.15), W = r * (o.wid || 0.5);
    const sw = Math.sin(walk * 2.4) * r * 0.3;
    const legC = o.leg || shade(o.body, -0.35);
    // legs
    ell(ctx, L * 0.55 + sw, W * 0.95, r * 0.22, r * 0.13, legC);
    ell(ctx, L * 0.55 - sw, -W * 0.95, r * 0.22, r * 0.13, legC);
    ell(ctx, -L * 0.55 - sw, W * 0.95, r * 0.22, r * 0.13, legC);
    ell(ctx, -L * 0.55 + sw, -W * 0.95, r * 0.22, r * 0.13, legC);
    // tail
    if (o.tail !== false) {
      ctx.beginPath(); ctx.moveTo(-L * 0.9, 0);
      ctx.quadraticCurveTo(-L * 1.3, Math.sin(walk * 1.3) * r * 0.4, -L * 1.55, Math.sin(walk * 1.3 + 1) * r * 0.5);
      ctx.strokeStyle = o.tailColor || shade(o.body, -0.2); ctx.lineWidth = r * (o.tailW || 0.16); ctx.lineCap = 'round'; ctx.stroke();
    }
    // body
    ell(ctx, 0, 0, L, W, o.body, 'rgba(0,0,0,0.55)', 1);
    if (o.back) ell(ctx, -L * 0.1, 0, L * 0.7, W * 0.45, o.back);
    // neck/head
    const hx = L * 0.95, hr = r * (o.headR || 0.36);
    if (o.mane) circ(ctx, hx - r * 0.1, 0, hr * 1.55, o.mane, 'rgba(0,0,0,0.4)', 0.8);
    ell(ctx, hx, 0, hr * 1.1, hr * 0.85, o.head || o.body, 'rgba(0,0,0,0.5)', 0.8);
    if (o.snout) ell(ctx, hx + hr * 0.95, 0, hr * 0.6, hr * 0.42, o.snout);
    if (o.ears) {
      poly(ctx, [hx - hr * 0.3, -hr * 0.5, hx - hr * 0.9, -hr * 1.1, hx + hr * 0.1, -hr * 0.75], o.ears);
      poly(ctx, [hx - hr * 0.3, hr * 0.5, hx - hr * 0.9, hr * 1.1, hx + hr * 0.1, hr * 0.75], o.ears);
    }
    if (o.eyes) {
      circ(ctx, hx + hr * 0.45, -hr * 0.42, r * 0.07, o.eyes);
      circ(ctx, hx + hr * 0.45, hr * 0.42, r * 0.07, o.eyes);
    }
    if (o.face) circ(ctx, hx + hr * 0.15, 0, hr * 0.6, o.face);
  }
  Art.quad = quad;

  function wings(ctx, r, flap, color, edge, span, feather) {
    const f = 0.55 + 0.45 * Math.sin(flap);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.4, s * r * 0.3);
      ctx.quadraticCurveTo(r * 0.3, s * r * span * f * 0.9, -r * 0.2, s * r * span * f);
      ctx.lineTo(-r * 0.6, s * r * span * f * 0.7);
      if (feather) {
        for (let k = 0; k < 4; k++) ctx.lineTo(-r * (0.7 + k * 0.12), s * r * span * f * (0.55 - k * 0.12));
      } else {
        ctx.quadraticCurveTo(-r * 0.6, s * r * span * f * 0.4, -r * 0.8, s * r * span * f * 0.35);
      }
      ctx.lineTo(-r * 0.4, s * r * 0.3);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
      // bones
      ctx.beginPath(); ctx.moveTo(r * 0.3, s * r * 0.3); ctx.lineTo(-r * 0.2, s * r * span * f);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ unit art table
  const UNIT_ART = {};
  Art.UNIT_ART = UNIT_ART;

  UNIT_ART.steward = (ctx, r, c, a) => humanoid(ctx, { r, body: '#7a5a38', armor: '#8a6a44', cape: c.main, skin: '#e2b48c', hair: '#5a3a20', weapon: a.carry ? 'none' : 'pick', walk: a.walk, atk: a.atk });
  UNIT_ART.thrall = (ctx, r, c, a) => humanoid(ctx, { r: r * 0.95, body: '#4a3a52', armor: '#5a4a62', cape: c.main, skin: '#8a7a92', horns: true, hornColor: '#2a2030', weapon: a.carry ? 'none' : 'claws', walk: a.walk, atk: a.atk, eyes: '#ff5050', headR: 0.46 });
  UNIT_ART.guard = (ctx, r, c, a) => humanoid(ctx, { r, body: '#5a5e68', armor: '#9aa0aa', cape: c.main, skin: '#e0b08a', helmet: '#a8adb6', plume: c.main, weapon: 'sword', shield: c.main, shieldBoss: '#f0e0a0', walk: a.walk, atk: a.atk });
  UNIT_ART.militia = (ctx, r, c, a) => humanoid(ctx, { r, body: '#6a5a40', armor: '#7a6a50', cape: c.main, skin: '#e0b08a', hair: '#4a3020', weapon: 'mace', shield: '#7a5a30', walk: a.walk, atk: a.atk });
  UNIT_ART.ranger = (ctx, r, c, a) => humanoid(ctx, { r, body: '#3a5a2a', armor: '#4a6a32', cape: c.main, skin: '#d8a882', hood: '#2e4a22', weapon: 'bow', walk: a.walk, atk: a.atk });
  UNIT_ART.rifleman = (ctx, r, c, a) => humanoid(ctx, { r, body: '#3a3a44', armor: '#4a4a56', cape: c.main, skin: '#6a5040', hair: '#1a1a1a', weapon: 'rifle', walk: a.walk, atk: a.atk, eyes: '#ffd060' });
  UNIT_ART.crossbow = (ctx, r, c, a) => humanoid(ctx, { r, body: '#2a2230', armor: '#4a3a50', cape: c.main, skin: '#b0a0b8', helmet: '#3a3040', weapon: 'crossbow', walk: a.walk, atk: a.atk });
  UNIT_ART.tidecaller = (ctx, r, c, a) => humanoid(ctx, { r, robe: '#2a8a8a', body: '#3aa0a0', skin: '#c8e0e0', hair: '#1a4a5a', longHair: true, cape: c.main, weapon: 'staff', orb: '#9ff8ff', staffColor: '#c0d8d0', walk: a.walk, atk: a.atk });
  UNIT_ART.demon = (ctx, r, c, a) => humanoid(ctx, { r, body: '#7a2a24', armor: '#8a3a2a', cape: c.main, skin: '#9a3a30', skinArm: '#8a3028', horns: true, hornColor: '#e0d0b0', weapon: 'claws', walk: a.walk, atk: a.atk, eyes: '#ffe040', headR: 0.46 });
  UNIT_ART.stalker = (ctx, r, c, a) => {
    humanoid(ctx, { r, body: '#1e1a22', armor: '#2e2a34', skin: '#3a3040', skinArm: '#2a2430', weapon: 'claws', walk: a.walk, atk: a.atk, eyes: '#ff2020' });
    ctx.strokeStyle = '#6a5a70'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 9; k++) {
      const an = (k / 9) * TAU;
      line(ctx, Math.cos(an) * r * 0.5, Math.sin(an) * r * 0.75, Math.cos(an) * r * 1.05, Math.sin(an) * r * 1.2, '#7a6a80', 1.2);
    }
    circ(ctx, -r * 0.5, 0, r * 0.18, c.main);
  };
  UNIT_ART.tyiga = (ctx, r, c, a, t) => {
    const ph = t * 3;
    for (let k = 0; k < 5; k++) {
      const an = ph + k * 1.26;
      ctx.globalAlpha = 0.25;
      circ(ctx, Math.cos(an) * r * 0.5 - r * 0.3, Math.sin(an) * r * 0.5, r * 0.6, k % 2 ? '#ff60ff' : '#a040ff');
    }
    ctx.globalAlpha = 0.85;
    circ(ctx, 0, 0, r * 0.7, rgrad(ctx, 0, 0, 1, r * 0.8, [[0, '#ffe0ff'], [0.5, '#e070ff'], [1, 'rgba(120,20,160,0)']]));
    ctx.globalAlpha = 1;
    circ(ctx, r * 0.25, -r * 0.2, r * 0.09, '#fff');
    circ(ctx, r * 0.25, r * 0.2, r * 0.09, '#fff');
    circ(ctx, -r * 0.6, 0, r * 0.15, c.main);
  };
  UNIT_ART.hellhound = (ctx, r, c, a) => {
    quad(ctx, { r, body: '#2a2220', back: '#3a2e2a', head: '#2e2420', snout: '#1a1412', ears: '#1a1412', eyes: '#ff3010', walk: a.walk, len: 1.1, wid: 0.48 });
    // collar
    circ(ctx, r * 0.85, 0, r * 0.32, null, c.main, 2);
  };
  UNIT_ART.wolf = (ctx, r, c, a) => quad(ctx, { r, body: '#6a6a70', back: '#8a8a90', head: '#707078', snout: '#5a5a60', ears: '#4a4a50', eyes: '#e0e060', walk: a.walk, len: 1.1, wid: 0.45 });
  UNIT_ART.manticore = (ctx, r, c, a, t) => {
    wings(ctx, r, 0.4, 'rgba(70,30,30,0.9)', '#2a1010', 1.0, false);
    quad(ctx, { r, body: '#b07a3a', back: '#c08a48', mane: '#7a3a14', head: '#d0a080', face: '#e0b090', eyes: '#200', walk: a.walk, len: 1.05, wid: 0.55, tail: false, headR: 0.33 });
    // scorpion tail arching over back
    ctx.strokeStyle = '#5a2a1a'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 1.0, 0);
    ctx.quadraticCurveTo(-r * 1.6, r * 0.2, -r * 0.9, r * 0.1 + Math.sin(t * 3) * 2);
    ctx.quadraticCurveTo(-r * 0.3, 0, -r * 0.1, -r * 0.1);
    ctx.stroke();
    poly(ctx, [-r * 0.1, -r * 0.25, r * 0.15, -r * 0.05, -r * 0.1, r * 0.05], '#e0d8b0');
    circ(ctx, -r * 0.35, r * 0.45, r * 0.13, c.main);
  };
  UNIT_ART.sphinx = (ctx, r, c, a) => {
    wings(ctx, r, 0.3, '#c8a050', '#7a5a20', 0.9, true);
    quad(ctx, { r, body: '#d0a858', back: '#e0b868', head: '#e8c090', face: '#f0d0a8', mane: '#3a2a1a', eyes: '#203060', walk: a.walk, len: 1.05, wid: 0.55, headR: 0.32 });
  };
  UNIT_ART.goatlord = (ctx, r, c, a) => humanoid(ctx, { r, body: '#3a0e0e', armor: '#5a1a1a', cape: '#200808', skin: '#6a1a14', horns: true, hornColor: '#f0e8d0', weapon: 'greatsword', blade: '#3a3a3a', walk: a.walk, atk: a.atk, eyes: '#ffee00', headR: 0.5 });
  UNIT_ART.hendrake = (ctx, r, c, a) => humanoid(ctx, { r, body: '#4a1a1a', armor: '#6a2a2a', cape: c.main, skin: '#c0a0a0', helmet: '#3a2a2a', plume: '#c03030', weapon: 'sword', shield: '#5a1a1a', walk: a.walk, atk: a.atk });
  UNIT_ART.lancer = (ctx, r, c, a) => {
    quad(ctx, { r: r * 0.95, body: '#d8d0c0', back: c.main, head: '#d0c8b8', snout: '#b8b0a0', ears: '#a8a090', walk: a.walk, len: 1.25, wid: 0.42, tailColor: '#e8e0d0' });
    humanoid(ctx, { r: r * 0.62, body: '#6a6e78', armor: '#b0b6c0', cape: c.main, skin: '#e0b08a', helmet: '#c0c6d0', plume: c.main, weapon: 'lance', shield: c.main, atk: a.atk, noOffhand: true });
  };
  UNIT_ART.hellmaid = (ctx, r, c, a) => {
    quad(ctx, { r: r * 0.95, body: '#1e1418', back: '#3a1a28', head: '#24181c', snout: '#140c10', ears: '#140c10', eyes: '#ff2050', walk: a.walk, len: 1.25, wid: 0.42, tailColor: '#5a1030' });
    humanoid(ctx, { r: r * 0.62, body: '#3a1028', armor: '#5a1a3a', cape: c.main, skin: '#d0a0b0', hair: '#c01040', longHair: true, weapon: 'sword', blade: '#e0a0c0', atk: a.atk });
  };
  UNIT_ART.gryphon = (ctx, r, c, a, t) => {
    wings(ctx, r, t * 7 + (a.seed || 0), '#e8e0d0', '#806040', 1.6, true);
    quad(ctx, { r: r * 0.8, body: '#b08850', back: '#c09860', head: '#f0f0f0', snout: '#e0b020', eyes: '#202020', walk: 0, len: 1.0, wid: 0.45, headR: 0.42 });
    circ(ctx, -r * 0.2, 0, r * 0.18, c.main);
  };
  UNIT_ART.wyvern = (ctx, r, c, a, t) => {
    wings(ctx, r, t * 6 + (a.seed || 0), 'rgba(60,40,70,0.95)', '#1a1020', 1.8, false);
    ctx.beginPath(); ctx.moveTo(-r * 0.6, 0);
    ctx.quadraticCurveTo(-r * 1.4, Math.sin(t * 3) * r * 0.4, -r * 2.0, Math.sin(t * 3 + 1) * r * 0.3);
    ctx.strokeStyle = '#3a2a40'; ctx.lineWidth = r * 0.2; ctx.lineCap = 'round'; ctx.stroke();
    ell(ctx, 0, 0, r * 0.85, r * 0.35, '#4a3450', 'rgba(0,0,0,0.6)');
    ell(ctx, r * 1.0, 0, r * 0.38, r * 0.22, '#5a4060', 'rgba(0,0,0,0.6)');
    circ(ctx, r * 1.1, -r * 0.1, r * 0.05, '#ff4020'); circ(ctx, r * 1.1, r * 0.1, r * 0.05, '#ff4020');
    humanoid(ctx, { r: r * 0.42, body: '#2a2030', armor: '#4a3a50', cape: c.main, skin: '#b0a0b8', helmet: '#3a3040', weapon: 'lance', noOffhand: true });
  };
  UNIT_ART.bombard = (ctx, r, c, a) => {
    rect(ctx, -r * 0.9, -r * 0.6, r * 1.4, r * 1.2, '#6a4a2a', '#2a1a0a');
    circ(ctx, -r * 0.3, -r * 0.75, r * 0.35, '#4a3420', '#1a1008', 1.5);
    circ(ctx, -r * 0.3, r * 0.75, r * 0.35, '#4a3420', '#1a1008', 1.5);
    const recoil = (a.atk || 0) * r * 0.4;
    rect(ctx, -r * 0.4 - recoil, -r * 0.24, r * 1.9, r * 0.48, grad(ctx, 0, -r * 0.24, 0, r * 0.24, [[0, '#7a7a82'], [0.5, '#4a4a52'], [1, '#2a2a30']]));
    circ(ctx, r * 1.5 - recoil, 0, r * 0.26, '#3a3a40', '#111', 1);
    circ(ctx, r * 1.5 - recoil, 0, r * 0.12, '#000');
    rect(ctx, -r * 0.9, -r * 0.15, r * 0.3, r * 0.3, c.main);
  };
  UNIT_ART.spitter = (ctx, r, c, a, t) => {
    const p = 1 + Math.sin(t * 2) * 0.04;
    const w = Math.sin((a.walk || 0) * 2) * r * 0.2;
    for (const s of [-1, 1]) { ell(ctx, r * 0.4 + w * s, s * r * 0.8, r * 0.2, r * 0.14, '#2a3a1a'); ell(ctx, -r * 0.4 - w * s, s * r * 0.8, r * 0.2, r * 0.14, '#2a3a1a'); }
    ell(ctx, 0, 0, r * 0.95 * p, r * 0.8 * p, rgrad(ctx, -r * 0.2, -r * 0.2, 1, r, [[0, '#9ac050'], [0.6, '#5a7a30'], [1, '#3a2a40']]), 'rgba(0,0,0,0.6)');
    for (let k = 0; k < 5; k++) circ(ctx, -r * 0.3 + k * 0.15 * r, (k % 2 ? 1 : -1) * r * 0.35, r * 0.12, '#c0e070');
    ell(ctx, r * 0.85, 0, r * 0.3, r * 0.4, '#3a1a2a');
    ell(ctx, r * 0.95, 0, r * 0.12, r * 0.25, '#e0ff60');
    circ(ctx, -r * 0.6, 0, r * 0.16, c.main);
  };
  UNIT_ART.glassdragon = (ctx, r, c, a, t) => {
    ctx.globalAlpha = 0.55;
    wings(ctx, r, t * 2, grad(ctx, -r, -r, r, r, [[0, '#a0f0ff'], [0.33, '#ffa0f0'], [0.66, '#fff0a0'], [1, '#a0ffb0']]), 'rgba(255,255,255,0.8)', 1.6, false);
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.quadraticCurveTo(-r * 1.4, Math.sin(t * 2) * r * 0.4, -r * 2.1, 0);
    ctx.strokeStyle = 'rgba(200,240,255,0.8)'; ctx.lineWidth = r * 0.25; ctx.stroke();
    ell(ctx, 0, 0, r * 0.9, r * 0.42, grad(ctx, -r, 0, r, 0, [[0, '#c0f8ff'], [0.5, '#ffd0f8'], [1, '#e0ffe0']]), 'rgba(255,255,255,0.9)', 1.5);
    ell(ctx, r * 1.05, 0, r * 0.4, r * 0.25, '#e8ffff', '#fff', 1);
    ctx.globalAlpha = 1;
    circ(ctx, r * 1.15, -r * 0.1, r * 0.06, '#40a0ff'); circ(ctx, r * 1.15, r * 0.1, r * 0.06, '#40a0ff');
  };

  // heroes
  UNIT_ART.hero_corwin = (ctx, r, c, a) => humanoid(ctx, { r, body: '#1a1a20', armor: '#2a2a32', cape: '#c8ccd6', cape2: '#16161c', skin: '#e0b48e', hair: '#141418', weapon: 'sword', blade: '#e8ecf4', bladeGlow: '#a0c0ff', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_benedict = (ctx, r, c, a) => humanoid(ctx, { r, body: '#6b4a22', armor: '#c07a20', cape: '#e07a1c', cape2: '#f0d040', skin: '#d8a880', hair: '#3a2410', weapon: 'sword', blade: '#e0e0e0', mechArm: true, noOffhand: true, walk: a.walk, atk: a.atk });
  UNIT_ART.hero_gerard = (ctx, r, c, a) => humanoid(ctx, { r: r * 1.05, body: '#3a5aa0', armor: '#8a94a3', cape: '#3a6fd0', cape2: '#8a94a3', skin: '#e0b090', hair: '#b07a3a', weapon: 'greatsword', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_julian = (ctx, r, c, a) => {
    quad(ctx, { r: r * 0.95, body: '#1a1a1a', back: '#f0f0f0', head: '#202020', snout: '#101010', ears: '#101010', eyes: '#c02020', walk: a.walk, len: 1.3, wid: 0.44, tailColor: '#000' });
    humanoid(ctx, { r: r * 0.66, body: '#e8e8e8', armor: '#ffffff', cape: '#f0f0f0', cape2: '#1a1a1a', skin: '#e8c0a0', hair: '#101010', weapon: 'lance', atk: a.atk, noOffhand: true });
  };
  UNIT_ART.hero_fiona = (ctx, r, c, a) => humanoid(ctx, { r, robe: '#5a1a40', body: '#7a2a50', cape: '#d23c2a', skin: '#f0d0c0', hair: '#e04020', longHair: true, weapon: 'orb', orb: '#ff80ff', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_caine = (ctx, r, c, a) => humanoid(ctx, { r, body: '#141414', armor: '#2f8a4a', cape: '#1a1a1a', cape2: '#2f8a4a', skin: '#d8a880', hair: '#0a0a0a', weapon: 'bow', bowColor: '#c8c8d8', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_random = (ctx, r, c, a) => {
    humanoid(ctx, { r, body: '#7a3a18', armor: '#e0601c', cape: '#e0601c', cape2: '#c02010', skin: '#e0b08a', hair: '#c06020', weapon: 'sword', walk: a.walk, atk: a.atk });
    // drum on his back
    circ(ctx, -r * 0.65, -r * 0.35, r * 0.32, '#b08040', '#4a2a10', 1.2);
  };
  UNIT_ART.hero_ganelon = (ctx, r, c, a) => humanoid(ctx, { r, body: '#4a3a24', armor: '#7a5a2a', cape: '#3a2a1a', cape2: '#7a5a2a', skin: '#d8a882', hair: '#a07a50', weapon: 'sword', shield: '#5a4020', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_dara = (ctx, r, c, a, t, u) => {
    if (u && u.buffs && u.buffs.some((b) => b.id === 'chaosShape')) {
      humanoid(ctx, { r: r * 1.25, body: '#2a0a3a', armor: '#5a1a7a', cape: '#3a1050', skin: '#6a2a8a', skinArm: '#5a1a7a', horns: true, hornColor: '#e0c0ff', weapon: 'claws', walk: a.walk, atk: a.atk, eyes: '#ff40ff', headR: 0.5 });
      return;
    }
    humanoid(ctx, { r, body: '#3a1050', armor: '#5a2070', cape: '#3a1050', cape2: '#c8b8d8', skin: '#f0d8d0', hair: '#1a0a10', longHair: true, weapon: 'rapier', walk: a.walk, atk: a.atk });
  };
  UNIT_ART.hero_brand = (ctx, r, c, a) => humanoid(ctx, { r, robe: '#1e5a2a', body: '#2fa84a', cape: '#163a1e', skin: '#e8c0a0', hair: '#c04010', weapon: 'fire', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_borel = (ctx, r, c, a) => humanoid(ctx, { r, body: '#202020', armor: '#8a1a1a', cape: '#8a1a1a', cape2: '#202020', skin: '#d0b0a0', helmet: '#3a3a3a', plume: '#c02020', weapon: 'rapier', blade: '#ffd0d0', walk: a.walk, atk: a.atk });
  UNIT_ART.hero_mandor = (ctx, r, c, a, t) => {
    humanoid(ctx, { r, body: '#151515', armor: '#e8e8f0', cape: '#151515', cape2: '#b0b0b8', skin: '#e8d0c0', hair: '#f0f0f0', weapon: 'orb', orb: '#d0d0e0', walk: a.walk, atk: a.atk });
    for (let k = 0; k < 3; k++) {
      const an = t * 2 + (k * TAU) / 3;
      circ(ctx, Math.cos(an) * r * 1.3, Math.sin(an) * r * 1.3, r * 0.18, grad(ctx, -2, -2, 2, 2, [[0, '#ffffff'], [1, '#6a6a7a']]), '#222', 0.6);
    }
  };
  UNIT_ART.hero_jurt = (ctx, r, c, a) => humanoid(ctx, { r, body: '#3a1a5a', armor: '#5a2a7a', cape: '#5a2a7a', cape2: '#e0c040', skin: '#e0c0b0', hair: '#2a1a0a', weapon: 'dagger', walk: a.walk, atk: a.atk, eyes: '#ffe040' });
  UNIT_ART.hero_suhuy = (ctx, r, c, a, t) => {
    humanoid(ctx, { r, robe: '#3b1a6a', body: '#4b2a7a', cape: '#2a1050', cape2: '#d0c060', skin: '#e0c8b8', hair: '#e8e8e8', weapon: 'staff', orb: '#c080ff', staffColor: '#d0c060', walk: a.walk, atk: a.atk });
  };

  // Draw a unit at (x,y). u is the entity (may be a stub {def, angle,...})
  Art.drawUnit = function (ctx, u, x, y, t, col, opts) {
    const def = u.def;
    const fn = UNIT_ART[def.art] || UNIT_ART.guard;
    const r = (u.radius || def.radius || 10) * (opts && opts.scale ? opts.scale : 1) * 1.15;
    const air = def.air;
    const lift = air ? 22 + Math.sin(t * 2 + (u.id || 0)) * 3 : 0;
    // shadow
    ctx.save();
    ell(ctx, x + (air ? 8 : 2), y + (air ? 10 : 3), r * (air ? 0.9 : 1.0), r * (air ? 0.55 : 0.75), 'rgba(0,0,0,' + (air ? 0.22 : 0.3) + ')');
    ctx.translate(x, y - lift);
    ctx.rotate(u.angle || 0);
    const anim = { walk: u.anim || 0, atk: u.atkAnim > 0 ? 1 - u.atkAnim / 0.3 : 0, carry: u.carry > 0, seed: (u.id || 0) * 0.37 };
    fn(ctx, r, col, anim, t, u);
    if (u.carry > 0) {
      // a glint of diamonds carried
      ctx.fillStyle = '#cff8ff';
      poly(ctx, [r * 0.4, -r * 0.2, r * 0.75, 0, r * 0.4, r * 0.2, r * 0.25, 0], '#d8fcff', '#7ac8e0', 1);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ buildings
  // 3/4 view box: top face at y - h
  function box(ctx, x, y, w, d, h, top, front, outline) {
    rect(ctx, x, y + d - h, w, h, front);
    rect(ctx, x, y - h, w, d, top);
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.strokeRect(x, y - h, w, d + h); }
  }
  function tower(ctx, cx, cy, r, h, wall, roof, roofH, banner) {
    ell(ctx, cx, cy, r, r * 0.5, 'rgba(0,0,0,0.25)');
    rect(ctx, cx - r, cy - h, r * 2, h, grad(ctx, cx - r, 0, cx + r, 0, [[0, shade(wall, -0.25)], [0.4, shade(wall, 0.15)], [1, shade(wall, -0.45)]]));
    ell(ctx, cx, cy, r, r * 0.45, shade(wall, -0.35));
    ell(ctx, cx, cy - h, r, r * 0.45, shade(wall, 0.05), 'rgba(0,0,0,0.4)');
    // crenels
    for (let k = 0; k < 6; k++) {
      const an = (k / 6) * TAU;
      rect(ctx, cx + Math.cos(an) * r * 0.8 - 2, cy - h + Math.sin(an) * r * 0.36 - 4, 4, 4, shade(wall, -0.1));
    }
    if (roof) {
      poly(ctx, [cx - r * 1.1, cy - h, cx + r * 1.1, cy - h, cx, cy - h - roofH], grad(ctx, cx - r, 0, cx + r, 0, [[0, shade(roof, -0.2)], [0.45, shade(roof, 0.25)], [1, shade(roof, -0.4)]]), 'rgba(0,0,0,0.5)');
      if (banner) {
        line(ctx, cx, cy - h - roofH, cx, cy - h - roofH - 12, '#3a2a1a', 1.2);
        poly(ctx, [cx, cy - h - roofH - 12, cx + 10, cy - h - roofH - 9, cx, cy - h - roofH - 6], banner);
      }
    }
  }
  function gable(ctx, x, y, w, d, h, roofH, wall, roof) {
    // walls
    rect(ctx, x, y + d * 0.35, w, d * 0.65, shade(wall, -0.2));
    rect(ctx, x, y + d * 0.35 - h, w, h, wall);
    // roof (ridge along x)
    poly(ctx, [x - 3, y + d * 0.35 - h + 2, x + w + 3, y + d * 0.35 - h + 2, x + w + 3, y - roofH * 0.2, x - 3, y - roofH * 0.2], shade(roof, -0.15), 'rgba(0,0,0,0.4)');
    poly(ctx, [x - 3, y - roofH * 0.2, x + w + 3, y - roofH * 0.2, x + w, y - roofH, x, y - roofH], shade(roof, 0.12), 'rgba(0,0,0,0.4)');
    line(ctx, x, y - roofH, x + w, y - roofH, shade(roof, 0.35), 1.5);
  }
  function banner(ctx, x, y, color, h) {
    h = h || 18;
    line(ctx, x, y, x, y - h, '#3a2a1a', 1.5);
    poly(ctx, [x, y - h, x + 9, y - h + 2, x + 9, y - h + 13, x + 4.5, y - h + 10, x, y - h + 13], color, 'rgba(0,0,0,0.4)');
  }
  function plaza(ctx, S, color) {
    rect(ctx, 2, 2, S - 4, S - 4, color || '#8a8478');
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let i = 8; i < S - 4; i += 12) { line(ctx, 2, i, S - 2, i, 'rgba(0,0,0,0.15)', 1); }
    for (let j = 0; j < S; j += 16) for (let i = 8; i < S - 4; i += 24) line(ctx, j + (i % 24 ? 8 : 0), i, j + (i % 24 ? 8 : 0), i + 12, 'rgba(0,0,0,0.12)', 1);
  }
  function unicornEmblem(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    poly(ctx, [-4, 4, -3, -1, 0, -3, 3, -2, 4, 0, 2, 1, 1, 4], color || '#fff');
    line(ctx, 2, -3, 6, -8, color || '#fff', 0.8);
    ctx.restore();
  }

  const BLD_ART = {};
  Art.BLD_ART = BLD_ART;

  BLD_ART.castle = (ctx, S, c) => {
    plaza(ctx, S, '#9a9284');
    // curtain walls
    const wall = '#b8b0a0';
    box(ctx, 10, 18, S - 20, 10, 14, shade(wall, 0.1), shade(wall, -0.25));
    box(ctx, 10, S - 22, S - 20, 10, 14, shade(wall, 0.1), shade(wall, -0.25));
    box(ctx, 10, 18, 10, S - 32, 14, shade(wall, 0.05), shade(wall, -0.3));
    box(ctx, S - 20, 18, 10, S - 32, 14, shade(wall, 0.05), shade(wall, -0.3));
    // keep
    box(ctx, S * 0.3, S * 0.32, S * 0.4, S * 0.38, 44, '#d0c8b8', '#8a8270', 'rgba(0,0,0,0.4)');
    poly(ctx, [S * 0.28, S * 0.32 - 44, S * 0.72, S * 0.32 - 44, S * 0.62, S * 0.32 - 70, S * 0.38, S * 0.32 - 70], '#c88a20', 'rgba(0,0,0,0.5)');
    poly(ctx, [S * 0.38, S * 0.32 - 70, S * 0.62, S * 0.32 - 70, S * 0.5, S * 0.32 - 92], '#e0a030', 'rgba(0,0,0,0.5)');
    // gate
    rect(ctx, S * 0.44, S * 0.7 - 22, S * 0.12, 22, '#3a2a1a');
    ctx.beginPath(); ctx.arc(S * 0.5, S * 0.7 - 22, S * 0.06, Math.PI, 0); ctx.fillStyle = '#3a2a1a'; ctx.fill();
    // windows
    for (let k = 0; k < 3; k++) rect(ctx, S * 0.36 + k * S * 0.1, S * 0.32 - 30, 5, 9, '#ffd070');
    // corner towers
    tower(ctx, 16, 24, 11, 34, '#c8c0b0', '#c87a18', 22, c.main);
    tower(ctx, S - 16, 24, 11, 34, '#c8c0b0', '#c87a18', 22, c.main);
    tower(ctx, 16, S - 14, 11, 30, '#c8c0b0', '#c87a18', 20, c.main);
    tower(ctx, S - 16, S - 14, 11, 30, '#c8c0b0', '#c87a18', 20, c.main);
    banner(ctx, S * 0.5, S * 0.32 - 92, c.main, 20);
    unicornEmblem(ctx, S * 0.5 + 4.5, S * 0.32 - 104, 0.7, '#fff');
  };
  BLD_ART.keep = (ctx, S, c) => {
    plaza(ctx, S, '#8a8478');
    box(ctx, S * 0.22, S * 0.3, S * 0.56, S * 0.45, 32, '#c0b8a8', '#7a7262', 'rgba(0,0,0,0.4)');
    poly(ctx, [S * 0.2, S * 0.3 - 32, S * 0.8, S * 0.3 - 32, S * 0.5, S * 0.3 - 56], '#b87a20', 'rgba(0,0,0,0.5)');
    rect(ctx, S * 0.44, S * 0.75 - 18, S * 0.12, 18, '#3a2a1a');
    tower(ctx, 14, S - 14, 9, 26, '#c0b8a8', '#b87a20', 16, c.main);
    tower(ctx, S - 14, S - 14, 9, 26, '#c0b8a8', '#b87a20', 16, c.main);
    banner(ctx, S * 0.5, S * 0.3 - 56, c.main);
  };
  BLD_ART.house = (ctx, S, c) => {
    rect(ctx, 4, 6, S - 8, S - 8, '#6a7a3a');
    gable(ctx, 8, 18, S - 16, S - 24, 18, 30, '#c8a878', '#8a3a22');
    rect(ctx, S * 0.45, S - 22, 8, 12, '#3a2414');
    rect(ctx, 14, S - 26, 6, 6, '#ffd890');
    rect(ctx, S - 20, 0, 6, 14, '#6a5a50');
    banner(ctx, S - 10, S - 8, c.main, 14);
  };
  BLD_ART.village = (ctx, S, c) => {
    rect(ctx, 2, 6, S - 4, S - 6, '#7a8a40');
    gable(ctx, 6, 22, S * 0.5, S * 0.5, 12, 22, '#c8a878', '#7a5a22');
    gable(ctx, S * 0.45, 10, S * 0.48, S * 0.45, 12, 20, '#b89868', '#6a4a1a');
    for (let k = 0; k < 6; k++) circ(ctx, 6 + k * 9, S - 6, 2.5, '#c0e060');
  };
  BLD_ART.barracks = (ctx, S, c) => {
    rect(ctx, 3, 3, S - 6, S - 6, '#8a7a5a');
    // training yard
    for (let k = 0; k < 3; k++) { line(ctx, 14 + k * 12, S - 10, 14 + k * 12, S - 24, '#5a3a1a', 3); line(ctx, 9 + k * 12, S - 20, 19 + k * 12, S - 20, '#5a3a1a', 2); }
    gable(ctx, 8, 14, S - 16, S * 0.55, 22, 38, '#a89880', '#5a6a8a');
    rect(ctx, S * 0.46, S * 0.35 + S * 0.55 - 30, 10, 16, '#2a1a10');
    banner(ctx, 12, 20, c.main, 22);
    banner(ctx, S - 12, 20, c.main, 22);
    // weapon rack
    for (let k = 0; k < 4; k++) line(ctx, S - 38 + k * 6, S - 8, S - 36 + k * 6, S - 22, '#c0c8d0', 1.5);
  };
  BLD_ART.lodge = (ctx, S, c) => {
    rect(ctx, 3, 3, S - 6, S - 6, '#3a5a2a');
    for (let k = 0; k < 5; k++) circ(ctx, 8 + k * 20, 8 + (k % 2) * 6, 7, '#2a4a1e');
    gable(ctx, 10, 16, S - 20, S * 0.55, 20, 34, '#7a5a34', '#2e5a2a');
    // log ends
    for (let k = 0; k < 4; k++) circ(ctx, 12, S * 0.4 + k * 6, 2.4, '#a07a48', '#5a3a1a', 0.6);
    // antlers
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.4); ctx.lineTo(S / 2 - 10, S * 0.4 - 12); ctx.moveTo(S / 2, S * 0.4); ctx.lineTo(S / 2 + 10, S * 0.4 - 12); ctx.stroke();
    // kennel
    box(ctx, S - 34, S - 22, 26, 14, 10, '#6a4a2a', '#4a3018');
    banner(ctx, 10, S - 6, c.main, 20);
  };
  BLD_ART.shrine = (ctx, S, c, t) => {
    // marble disc with pattern
    ell(ctx, S / 2, S / 2 + 4, S * 0.48, S * 0.42, '#d8d8e0', 'rgba(0,0,0,0.3)', 1);
    ell(ctx, S / 2, S / 2 + 4, S * 0.4, S * 0.35, '#e8e8f0');
    Art.drawPattern(ctx, S / 2, S / 2 + 4, S * 0.36, S * 0.31, 'rgba(90,150,230,0.85)', 1.3, 5);
    // pillars
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * TAU;
      const px = S / 2 + Math.cos(an) * S * 0.42, py = S / 2 + 4 + Math.sin(an) * S * 0.36;
      rect(ctx, px - 3, py - 26, 6, 26, grad(ctx, px - 3, 0, px + 3, 0, [[0, '#c0c0c8'], [0.5, '#ffffff'], [1, '#9a9aa4']]));
      rect(ctx, px - 4, py - 28, 8, 3, '#f0f0f4');
    }
    // unicorn statue
    ctx.save(); ctx.translate(S / 2, S / 2 - 6);
    rect(ctx, -8, 0, 16, 10, '#c0c0c8');
    poly(ctx, [-9, -2, -7, -14, -2, -18, 4, -20, 8, -16, 6, -12, 2, -10, 3, -2], '#ffffff', '#a0a0b0', 0.8);
    line(ctx, 5, -19, 11, -30, '#ffe8a0', 1.6);
    ctx.restore();
  };
  BLD_ART.armory = (ctx, S, c) => {
    rect(ctx, 3, 3, S - 6, S - 6, '#7a7068');
    box(ctx, 10, 20, S - 20, S * 0.5, 26, '#8a7a6a', '#5a4a3a', 'rgba(0,0,0,0.5)');
    rect(ctx, S - 30, 0, 12, 26, '#5a4a40');
    // forge glow
    rect(ctx, 20, 20 + S * 0.5 - 22, 18, 14, '#2a1008');
    rect(ctx, 23, 20 + S * 0.5 - 18, 12, 9, '#ff7020');
    // crates & barrels of rouge
    for (let k = 0; k < 3; k++) box(ctx, 14 + k * 16, S - 22, 12, 10, 8, '#a07a48', '#6a4a24');
    for (let k = 0; k < 2; k++) { circ(ctx, S - 26 + k * 12, S - 14, 6, '#8a2a2a', '#3a0a0a', 1); circ(ctx, S - 26 + k * 12, S - 14, 3, '#d04040'); }
    banner(ctx, S * 0.5, 20 - 26 + 4, c.main, 22);
  };
  BLD_ART.aerie = (ctx, S, c) => {
    // rocky crag
    poly(ctx, [6, S - 6, 14, S * 0.4, 30, S * 0.15, S * 0.5, 4, S * 0.72, S * 0.18, S - 10, S * 0.42, S - 4, S - 6], '#7a7268', 'rgba(0,0,0,0.5)', 1.2);
    poly(ctx, [30, S * 0.15, S * 0.5, 4, S * 0.55, S * 0.5, 26, S * 0.6], '#958d82');
    // nests
    for (const [nx, ny] of [[S * 0.35, S * 0.3], [S * 0.62, S * 0.36], [S * 0.5, S * 0.62]]) {
      ell(ctx, nx, ny, 12, 7, '#6a4a24', '#3a2410', 1);
      ell(ctx, nx, ny - 1, 7, 4, '#3a2a14');
      circ(ctx, nx - 2, ny - 2, 2.4, '#f0e8d8');
    }
    banner(ctx, S * 0.5, 6, c.main, 18);
  };
  BLD_ART.hall_trumps = (ctx, S, c) => {
    plaza(ctx, S, '#8a8070');
    box(ctx, 8, 24, S - 16, S * 0.5, 34, '#d8d0c0', '#9a9080', 'rgba(0,0,0,0.5)');
    poly(ctx, [4, 24 - 34, S - 4, 24 - 34, S - 18, 24 - 56, 18, 24 - 56], '#d0a030', 'rgba(0,0,0,0.5)');
    // trump cards on the facade
    const cols = ['#c8ccd6', '#e07a1c', '#3a6fd0', '#f0f0f0', '#d23c2a', '#2f8a4a', '#e0601c'];
    for (let k = 0; k < 7; k++) {
      const x = 14 + k * ((S - 28) / 7), y = 24 + S * 0.5 - 34 + 4;
      rect(ctx, x, y, (S - 28) / 7 - 3, 22, '#f8f0d8', '#6a5020', 1);
      rect(ctx, x + 2, y + 3, (S - 28) / 7 - 7, 15, cols[k]);
    }
    banner(ctx, S / 2, 24 - 56, c.main, 20);
  };
  BLD_ART.lighthouse = (ctx, S, c, t) => {
    rect(ctx, 4, 6, S - 8, S - 8, '#8a8478');
    const cx = S / 2, cy = S - 12;
    const h = 60;
    rect(ctx, cx - 9, cy - h, 18, h, grad(ctx, cx - 9, 0, cx + 9, 0, [[0, '#c8c0b8'], [0.45, '#ffffff'], [1, '#9a9288']]));
    for (let k = 0; k < 3; k++) rect(ctx, cx - 9, cy - h + 12 + k * 16, 18, 6, '#b03020');
    ell(ctx, cx, cy - h, 11, 5, '#5a5a60');
    rect(ctx, cx - 7, cy - h - 12, 14, 12, 'rgba(255,240,180,0.9)', '#3a3a40', 1);
    poly(ctx, [cx - 9, cy - h - 12, cx + 9, cy - h - 12, cx, cy - h - 22], '#3a3a40');
    banner(ctx, cx + 10, cy, c.main, 16);
  };

  // Chaos
  function shard(ctx, x, y, w, h, base, glow) {
    poly(ctx, [x - w, y, x - w * 0.4, y - h * 0.6, x, y - h, x + w * 0.5, y - h * 0.55, x + w, y], grad(ctx, x - w, 0, x + w, 0, [[0, shade(base, -0.3)], [0.4, shade(base, 0.25)], [1, shade(base, -0.5)]]), 'rgba(0,0,0,0.6)', 1);
    if (glow) line(ctx, x, y - h * 0.9, x - w * 0.1, y - h * 0.2, glow, 1.4);
  }
  BLD_ART.spire = (ctx, S, c) => {
    ell(ctx, S / 2, S / 2 + 8, S * 0.48, S * 0.4, '#1a1020', 'rgba(160,60,220,0.5)', 2);
    ell(ctx, S / 2, S / 2 + 8, S * 0.32, S * 0.26, '#2a1630');
    shard(ctx, S * 0.24, S * 0.72, 12, 52, '#2a2232', '#c060ff');
    shard(ctx, S * 0.78, S * 0.74, 12, 56, '#2a2232', '#c060ff');
    shard(ctx, S * 0.34, S * 0.52, 14, 74, '#30283a', '#d070ff');
    shard(ctx, S * 0.66, S * 0.54, 14, 80, '#30283a', '#d070ff');
    shard(ctx, S * 0.5, S * 0.62, 20, 116, '#382e44', '#ff80ff');
    banner(ctx, S * 0.5 + 6, S * 0.62 - 116 + 8, c.main, 16);
  };
  BLD_ART.bastion = (ctx, S, c) => {
    ell(ctx, S / 2, S / 2 + 6, S * 0.46, S * 0.38, '#1a1020', 'rgba(160,60,220,0.5)', 2);
    shard(ctx, S * 0.3, S * 0.72, 12, 46, '#2a2232', '#c060ff');
    shard(ctx, S * 0.7, S * 0.74, 12, 50, '#2a2232', '#c060ff');
    shard(ctx, S * 0.5, S * 0.62, 18, 82, '#382e44', '#ff80ff');
    banner(ctx, S * 0.5 + 6, S * 0.62 - 74, c.main, 14);
  };
  BLD_ART.hollow = (ctx, S, c) => {
    ell(ctx, S / 2, S / 2 + 6, S * 0.46, S * 0.38, '#3a2a30', 'rgba(0,0,0,0.6)', 1);
    ell(ctx, S / 2, S / 2 + 2, S * 0.36, S * 0.28, '#4a3640');
    ell(ctx, S / 2, S / 2 + 8, S * 0.18, S * 0.12, '#0a0408');
    circ(ctx, S / 2 - 5, S / 2 + 6, 1.6, '#ff3030'); circ(ctx, S / 2 + 4, S / 2 + 7, 1.6, '#ff3030');
    for (let k = 0; k < 6; k++) { const an = (k / 6) * TAU; line(ctx, S / 2 + Math.cos(an) * S * 0.3, S / 2 + 4 + Math.sin(an) * S * 0.22, S / 2 + Math.cos(an) * S * 0.42, S / 2 + 4 + Math.sin(an) * S * 0.3 - 8, '#6a5060', 2); }
    banner(ctx, S - 10, S - 8, c.main, 14);
  };
  BLD_ART.obelisk = (ctx, S, c) => {
    ell(ctx, S / 2, S - 6, S * 0.42, S * 0.2, 'rgba(0,0,0,0.4)');
    poly(ctx, [S * 0.3, S - 6, S * 0.38, S * 0.0 - 6, S * 0.5, -14, S * 0.62, -6, S * 0.7, S - 6], grad(ctx, S * 0.3, 0, S * 0.7, 0, [[0, '#14101a'], [0.5, '#3a3044'], [1, '#0a080e']]), 'rgba(0,0,0,0.8)');
    line(ctx, S * 0.5, 0, S * 0.5, S * 0.6, '#c060ff', 1.5);
    circ(ctx, S * 0.5, S * 0.3, 2.5, c.main);
  };
  BLD_ART.pit = (ctx, S, c) => {
    ell(ctx, S / 2, S / 2 + 4, S * 0.47, S * 0.42, '#2a1a1a', 'rgba(0,0,0,0.6)', 1);
    ell(ctx, S / 2, S / 2 + 4, S * 0.3, S * 0.25, rgrad(ctx, S / 2, S / 2 + 4, 2, S * 0.3, [[0, '#ff8020'], [0.4, '#a02010'], [1, '#100404']]));
    for (let k = 0; k < 10; k++) {
      const an = (k / 10) * TAU;
      const px = S / 2 + Math.cos(an) * S * 0.38, py = S / 2 + 4 + Math.sin(an) * S * 0.33;
      poly(ctx, [px - 5, py, px, py - 18 - (k % 3) * 5, px + 5, py], '#3a2a2a', 'rgba(0,0,0,0.6)');
    }
    banner(ctx, 12, S - 8, c.main, 20);
  };
  BLD_ART.hendrake = (ctx, S, c) => {
    rect(ctx, 3, 3, S - 6, S - 6, '#2a2026');
    box(ctx, 12, 22, S - 24, S * 0.5, 30, '#4a3438', '#2a1a1e', 'rgba(0,0,0,0.6)');
    for (let k = 0; k < 5; k++) poly(ctx, [12 + k * ((S - 24) / 5), 22 - 30, 12 + (k + 0.5) * ((S - 24) / 5), 22 - 48 - (k % 2) * 8, 12 + (k + 1) * ((S - 24) / 5), 22 - 30], '#3a2228', 'rgba(0,0,0,0.6)');
    rect(ctx, S * 0.44, 22 + S * 0.5 - 30 + 8, S * 0.12, 18, '#100608');
    banner(ctx, 14, 22, '#8a1a1a', 26); banner(ctx, S - 14, 22, c.main, 26);
  };
  BLD_ART.logrus_shrine = (ctx, S, c, t) => {
    ell(ctx, S / 2, S / 2 + 10, S * 0.46, S * 0.36, '#20142a', 'rgba(180,80,255,0.5)', 1.5);
    ell(ctx, S / 2, S / 2 + 10, S * 0.32, S * 0.24, '#2a1a36');
    // ever-shifting tendrils (animated at draw time)
    Art.drawLogrus(ctx, S / 2, S / 2 - 12, S * 0.34, t || 0, 'rgba(200,110,255,0.9)');
  };
  BLD_ART.den = (ctx, S, c) => {
    poly(ctx, [4, S - 4, 12, S * 0.35, S * 0.4, 8, S * 0.75, 14, S - 6, S * 0.4, S - 4, S - 4], '#4a3a30', 'rgba(0,0,0,0.6)', 1);
    poly(ctx, [S * 0.3, S - 6, S * 0.35, S * 0.5, S * 0.5, S * 0.4, S * 0.65, S * 0.5, S * 0.7, S - 6], '#0a0604');
    for (let k = 0; k < 4; k++) { line(ctx, 10 + k * 8, S - 10, 16 + k * 8, S - 14, '#e8e0c8', 2); }
    circ(ctx, S - 18, S - 14, 4, '#e0d8c0');
    banner(ctx, S * 0.75, 16, c.main, 18);
  };
  BLD_ART.roost = (ctx, S, c) => {
    ell(ctx, S / 2, S / 2 + 10, S * 0.46, S * 0.36, '#2a2026');
    shard(ctx, S * 0.25, S * 0.8, 10, 60, '#2a2232');
    shard(ctx, S * 0.75, S * 0.82, 10, 66, '#2a2232');
    shard(ctx, S * 0.5, S * 0.6, 12, 84, '#30283a');
    line(ctx, S * 0.25, S * 0.8 - 50, S * 0.5, S * 0.6 - 70, '#4a3a50', 3);
    line(ctx, S * 0.75, S * 0.82 - 54, S * 0.5, S * 0.6 - 70, '#4a3a50', 3);
    banner(ctx, S * 0.5 + 4, S * 0.6 - 84, c.main, 14);
  };
  BLD_ART.hall_houses = (ctx, S, c) => {
    rect(ctx, 3, 3, S - 6, S - 6, '#241a28');
    box(ctx, 10, 26, S - 20, S * 0.5, 34, '#3a2a44', '#20162a', 'rgba(0,0,0,0.6)');
    shard(ctx, S * 0.2, 26 - 30, 9, 30, '#30283a', '#c060ff');
    shard(ctx, S * 0.8, 26 - 30, 9, 30, '#30283a', '#c060ff');
    shard(ctx, S * 0.5, 26 - 30, 12, 46, '#382e44', '#ff80ff');
    const hc = ['#151515', '#8a1a1a', '#3a1050', '#2fa84a', '#5a2a7a', c.main];
    for (let k = 0; k < 6; k++) banner(ctx, 16 + k * ((S - 32) / 5), 26 + S * 0.5 - 2, hc[k], 18);
  };
  BLD_ART.serpent_eye = (ctx, S, c, t) => {
    ell(ctx, S / 2, S - 10, S * 0.4, S * 0.18, '#1a1020');
    poly(ctx, [S * 0.3, S - 10, S * 0.38, S * 0.1, S * 0.62, S * 0.1, S * 0.7, S - 10], grad(ctx, S * 0.3, 0, S * 0.7, 0, [[0, '#1a1420'], [0.5, '#3a3044'], [1, '#0e0a12']]), 'rgba(0,0,0,0.7)');
    ell(ctx, S / 2, S * 0.1 - 6, 15, 11, '#2a2030', 'rgba(0,0,0,0.6)');
    ell(ctx, S / 2, S * 0.1 - 6, 12, 8, '#f0e0c0');
    banner(ctx, S * 0.72, S - 10, c.main, 14);
  };
  BLD_ART.circle = (ctx, S, c, t) => {
    ell(ctx, S / 2, S / 2, S * 0.5, S * 0.46, '#0a0410', 'rgba(120,20,160,0.8)', 3);
    ell(ctx, S / 2, S / 2, S * 0.38, S * 0.34, rgrad(ctx, S / 2, S / 2, 2, S * 0.38, [[0, '#ff40ff'], [0.3, '#5a1080'], [1, '#08020c']]));
    Art.drawLogrus(ctx, S / 2, S / 2, S * 0.36, t || 0, 'rgba(255,90,200,0.7)');
  };
  BLD_ART.brand_tower = (ctx, S, c, t) => {
    rect(ctx, 4, 6, S - 8, S - 8, '#3a3a40');
    const cx = S / 2, cy = S - 16;
    rect(ctx, cx - 16, cy - 120, 32, 120, grad(ctx, cx - 16, 0, cx + 16, 0, [[0, '#4a4a52'], [0.45, '#8a8a92'], [1, '#2a2a30']]));
    for (let k = 0; k < 8; k++) rect(ctx, cx - 16, cy - 120 + k * 15, 32, 1, 'rgba(0,0,0,0.3)');
    rect(ctx, cx - 4, cy - 100, 8, 14, '#ffd070');
    poly(ctx, [cx - 20, cy - 120, cx + 20, cy - 120, cx, cy - 150], '#2a2a30');
  };

  BLD_ART.ygg = (ctx, S, c, t) => {
    ell(ctx, S / 2, S - 8, S * 0.6, S * 0.25, 'rgba(0,0,0,0.35)');
    // roots and trunk
    for (let k = -2; k <= 2; k++) line(ctx, S / 2, S - 14, S / 2 + k * 12, S - 4, '#3a2a1a', 4);
    rect(ctx, S / 2 - 8, S - 70, 16, 60, grad(ctx, S / 2 - 8, 0, S / 2 + 8, 0, [[0, '#2a1e12'], [0.5, '#5a4428'], [1, '#1e140a']]));
    for (const [x, y, r, col] of [[S / 2, S - 92, 34, '#24401c'], [S / 2 - 22, S - 78, 22, '#2e5024'], [S / 2 + 24, S - 80, 22, '#2e5024'], [S / 2 - 8, S - 104, 18, '#3e6a2e'], [S / 2 + 12, S - 98, 14, '#4a7a34']]) circ(ctx, x, y, r, col, 'rgba(0,0,0,0.35)', 1);
    // half the crown withered toward Chaos
    for (let k = 0; k < 5; k++) line(ctx, S / 2 + 10, S - 86 + k * 4, S / 2 + 40, S - 100 + k * 8, '#3a2a30', 1.5);
  };

  // generic fallback
  BLD_ART.default = (ctx, S, c) => { box(ctx, 6, 10, S - 12, S - 18, 20, '#8a8a8a', '#5a5a5a'); banner(ctx, S / 2, 10 - 20, c.main); };

  // ------------------------------------------------------------------ Pattern & Logrus motifs
  // Draw a stylised Pattern (one continuous meander through concentric rings) in an ellipse
  Art.patternPath = function (rings, gapAngle) {
    // returns array of segments: {type:'arc', r, a0, a1} or {type:'line'}
    const segs = [];
    const gap = gapAngle || 0.35;
    let dir = 1;
    let a = -Math.PI / 2 + gap / 2;
    for (let i = 0; i < rings; i++) {
      const r = 1 - i / rings;
      const a0 = a, a1 = a + dir * (TAU - gap);
      segs.push({ r, a0, a1, dir });
      a = a1;
      dir = -dir;
    }
    return segs;
  };
  Art.drawPattern = function (ctx, cx, cy, rx, ry, color, lw, rings, progress) {
    const segs = Art.patternPath(rings || 7, 0.42);
    const total = segs.length;
    const prog = progress == null ? 1 : progress;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1.4; ctx.lineCap = 'round';
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < total; i++) {
      const s = segs[i];
      const f = Math.max(0, Math.min(1, prog * total - i));
      if (f <= 0) break;
      const a1 = s.a0 + (s.a1 - s.a0) * f;
      const R = s.r * rx;
      if (first) { ctx.moveTo(Math.cos(s.a0) * R, Math.sin(s.a0) * R); first = false; }
      ctx.arc(0, 0, R, s.a0, a1, s.dir < 0);
      // turn into the next ring
      if (f >= 1 && i < total - 1) {
        const n = segs[i + 1];
        ctx.lineTo(Math.cos(n.a0) * n.r * rx, Math.sin(n.a0) * n.r * rx);
      }
    }
    ctx.stroke();
    if (prog >= 1) {
      // star at the centre
      for (let k = 0; k < 8; k++) {
        const an = (k / 8) * TAU;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * rx * 0.08, Math.sin(an) * rx * 0.08); ctx.stroke();
      }
    }
    ctx.restore();
  };
  Art.drawLogrus = function (ctx, cx, cy, r, t, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      ctx.lineWidth = 1.2 + (k % 3) * 0.5;
      ctx.beginPath();
      for (let s = 0; s <= 24; s++) {
        const u = s / 24;
        const an = k * 0.9 + u * 5 + Math.sin(t * 0.8 + k + u * 4) * 1.2;
        const rr = r * (0.15 + u * 0.85) * (0.8 + 0.2 * Math.sin(t * 1.3 + k * 2 + u * 7));
        const x = Math.cos(an) * rr, y = Math.sin(an) * rr * 0.75;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ caches
  const bldCache = new Map();
  Art.buildingSprite = function (defId, color, scale) {
    const key = defId + '|' + color.main + '|' + scale;
    let c = bldCache.get(key);
    if (c) return c;
    const def = AC.BUILDINGS[defId];
    const S = def.size * T;
    const pad = 160; // room above for towers
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(S * scale); cv.height = Math.ceil((S + pad) * scale);
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(0, pad);
    const fn = BLD_ART[def.art] || BLD_ART.default;
    fn(ctx, S, color, 0);
    c = { canvas: cv, pad, S };
    bldCache.set(key, c);
    return c;
  };
  Art.ANIMATED_BLD = { logrus_shrine: true, circle: true, serpent_eye: true, lighthouse: true, shrine: true, spire: true, bastion: true, pit: true, armory: true, brand_tower: true };

  // portrait (icon) of a unit or building
  const iconCache = new Map();
  Art.icon = function (defId, color, size, dpr) {
    const key = defId + '|' + (color ? color.main : '') + '|' + size + '|' + dpr;
    let c = iconCache.get(key);
    if (c) return c;
    const cv = document.createElement('canvas');
    cv.width = size * dpr; cv.height = size * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const def = AC.def(defId);
    const col = color || AC.PLAYER_COLORS[0];
    if (def.kind === 'building') {
      const S = def.size * T;
      const fit = size / (S * 1.35);
      ctx.translate(size / 2 - (S * fit) / 2, size - 4 - S * fit * 0.95);
      ctx.scale(fit, fit);
      (BLD_ART[def.art] || BLD_ART.default)(ctx, S, col, 0);
    } else {
      const r = def.radius || 10;
      const fit = (size * 0.33) / (r * (def.air ? 1.6 : 1.2));
      ctx.translate(size / 2, size / 2);
      ctx.scale(fit, fit);
      ctx.rotate(-Math.PI / 2);
      const fn = UNIT_ART[def.art] || UNIT_ART.guard;
      fn(ctx, r, col, { walk: 0, atk: 0 }, 0.5, { def, buffs: [] });
    }
    iconCache.set(key, cv);
    return cv;
  };
  Art.clearCaches = function () { bldCache.clear(); iconCache.clear(); };
})();
