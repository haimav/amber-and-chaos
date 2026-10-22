// Validates procedural skirmish maps: open ground under bases, and every diamond field and
// Broken Pattern reachable on foot from every start.
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();
const T = AC.TILE;
let bad = 0, n = 0;
const themes = Object.keys(AC.MAP_THEMES);
for (let seed = 1; seed <= 20; seed++) {
  for (const theme of themes) {
    for (const [size, players] of [[80, 2], [96, 2], [120, 4], [96, 3]]) {
      n++;
      const pl = [];
      for (let i = 0; i < players; i++) pl.push({ faction: i % 2 ? 'chaos' : 'amber', isAI: true });
      const g = AC.createSkirmish({ players: pl, theme, size, seed: seed * 101, headless: true });
      const problems = [];
      for (const b of g.buildings) {
        for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) if (!(AC.PASS[g.map.get(x, y)] & 1)) problems.push('base on impassable ' + b.def.id);
      }
      const reach = AC.floodGround(g.map, g.players[0].startTile.tx + 3, g.players[0].startTile.ty + 3);
      const adjReach = (tx, ty) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = tx + dx, y = ty + dy; if (g.map.inb(x, y) && reach[y * g.map.w + x] && !g.map.occ[y * g.map.w + x]) return true; } return false; };
      for (const r of g.resources) if (!adjReach(r.tx, r.ty)) problems.push('unreachable diamonds at ' + r.tx + ',' + r.ty);
      for (const s of g.sites) if (!adjReach(s.tx, s.ty)) problems.push('unreachable site ' + s.tx + ',' + s.ty);
      for (const p of g.players) if (p.startTile && !reach[(p.startTile.ty + 3) * g.map.w + p.startTile.tx + 3]) problems.push('start ' + p.id + ' cut off');
      for (const u of g.units) if (!u.def.air && !g.map.passableWorld(u.x, u.y, g.moveBits(u))) problems.push('unit stuck ' + u.def.id);
      if (problems.length) { bad++; console.log(theme, size, players, 'seed', seed * 101, [...new Set(problems)].slice(0, 6).join('; ')); }
    }
  }
}
console.log(n, 'maps checked,', bad, 'with problems');
process.exitCode = bad ? 1 : 0;
