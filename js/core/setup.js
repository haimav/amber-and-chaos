// Amber and Chaos — skirmish setup.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const T = AC.TILE;

  // opts: { players:[{faction,isAI,difficulty,team,name}], theme, size, seed, fog, startD, startP, headless }
  AC.createSkirmish = function (opts) {
    const n = opts.players.length;
    const seed = opts.seed || ((Math.random() * 1e9) | 0);
    const gen = AC.generateMap({ size: opts.size || 96, players: n, seed, theme: opts.theme || 'garnath' });
    const g = new AC.Game({ seed, fog: opts.fog !== false, headless: !!opts.headless, buildSpeed: opts.buildSpeed || 1 });
    g.setMap(gen.map);
    g.mode = 'skirmish';
    g.mapName = AC.MAP_THEMES[opts.theme || 'garnath'].name;
    const rng = U.rng(seed + 99);
    // start assignment: for 2 players on a 2-start map randomise sides
    let starts = gen.starts.slice();
    if (n === 2 && starts.length === 2 && rng() < 0.5) starts.reverse();
    if (n === 3) starts = [starts[0], starts[1], starts[2]];
    if (n === 2 && starts.length === 4) starts = [starts[0], starts[2]];
    // colours follow the faction where possible: gold for Amber, violet for Chaos
    const taken = new Set();
    const colorFor = (po) => {
      if (po.color != null) return po.color;
      const pref = po.faction === 'chaos' ? [1, 3, 2, 0] : [0, 2, 3, 1];
      const c = pref.find((k) => !taken.has(k));
      taken.add(c);
      return c;
    };
    opts.players.forEach((po, i) => {
      const ci = colorFor(po);
      g.addPlayer({
        name: po.name || (po.isAI ? AC.FACTIONS[po.faction].title : 'You'),
        faction: po.faction, isAI: po.isAI, difficulty: po.difficulty || 'normal',
        team: po.team != null ? po.team : i, color: AC.PLAYER_COLORS[ci],
        startD: opts.startD != null ? opts.startD : 400, startP: opts.startP != null ? opts.startP : 100,
      });
    });
    g.addPlayer({ name: 'Wild things of Shadow', isNeutral: true, faction: 'neutral', team: -99, color: AC.NEUTRAL_COLOR });
    for (const r of gen.resources) g.spawnResource(r.tx, r.ty, r.amount);
    for (const s of gen.sites) g.spawnSite(s.tx, s.ty, s.name);
    for (let i = 0; i < n; i++) {
      const p = g.players[i];
      const s = starts[i];
      p.startTile = s;
      AC.placeStartingBase(g, p, s.tx, s.ty);
    }
    for (const c of gen.creeps) {
      const u = g.spawnUnit(c.type, g.neutralId, c.tx * T + T / 2, c.ty * T + T / 2);
      u.homeX = u.x; u.homeY = u.y;
      u.angle = rng() * Math.PI * 2;
    }
    for (let i = 0; i < n; i++) if (g.players[i].isAI) g.ais.push(new AC.AI(g, i));
    g.localPlayer = opts.players.findIndex((p) => !p.isAI);
    if (g.localPlayer < 0) g.localPlayer = 0;
    g.updateVision();
    g.recomputeSupply();
    return g;
  };

  AC.placeStartingBase = function (g, p, stx, sty, opts) {
    opts = opts || {};
    const F = p.F;
    const hq = g.spawnBuilding(opts.hq || F.hq, p.id, stx - 2, sty - 2, true);
    const nw = opts.workers != null ? opts.workers : 5;
    for (let k = 0; k < nw; k++) {
      const a = (k / nw) * Math.PI * 2 + 0.3;
      const w = g.spawnUnit(F.worker, p.id, hq.x + Math.cos(a) * (hq.radius + 22), hq.y + Math.sin(a) * (hq.radius + 22));
      const r = AC.Behavior.findResource(g, w, hq.x, hq.y, 12 * T, true);
      if (r) w.order = { type: 'gather', target: r.id };
    }
    return hq;
  };
})();
