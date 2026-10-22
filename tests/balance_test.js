// Pits equal-cost armies against each other on open ground to sanity-check unit balance.
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();
const T = AC.TILE;

function battle(armyA, armyB, seed) {
  const g = new AC.Game({ seed: seed || 1, headless: true, fog: false });
  const map = new AC.GameMap(60, 40, 1, 'garnath');
  map.fillRect(0, 0, 59, 39, AC.TER.GRASS);
  g.setMap(map);
  g.addPlayer({ faction: 'amber' });
  g.addPlayer({ faction: 'chaos' });
  // keep both alive: give each a building far away
  g.spawnBuilding('castle', 0, 1, 1, true);
  g.spawnBuilding('spire', 1, 55, 35, true);
  map.road.fill(0);
  const spawn = (list, pid, x0) => {
    let k = 0;
    for (const [id, n] of list) for (let i = 0; i < n; i++) {
      const u = g.spawnUnit(id, pid, x0 + (k % 3) * 26 * (pid ? 1 : -1), 20 * T + (Math.floor(k / 3) - 4) * 26);
      k++;
    }
  };
  spawn(armyA, 0, 22 * T);
  spawn(armyB, 1, 38 * T);
  g.updateVision();
  g.ais.push(new AC.AI(g, 0, { passive: true }), new AC.AI(g, 1, { passive: true }));
  for (const u of g.units) u.order = { type: 'attackMove', x: u.owner === 0 ? 50 * T : 10 * T, y: 20 * T };
  let t = 0;
  while (t < 120) {
    g.tick(AC.TICK); t += AC.TICK; g.events.length = 0;
    const a = g.units.filter((u) => !u.dead && u.owner === 0).length, b = g.units.filter((u) => !u.dead && u.owner === 1).length;
    if (!a || !b) break;
  }
  const val = (pid) => g.units.filter((u) => !u.dead && u.owner === pid).reduce((s, u) => s + (u.def.cost.d + u.def.cost.p * 1.5) * (u.hp / u.maxHp), 0);
  return { t: t.toFixed(1), amberLeft: val(0) | 0, chaosLeft: val(1) | 0 };
}
const cost = (list) => list.reduce((s, [id, n]) => s + (AC.UNITS[id].cost.d + AC.UNITS[id].cost.p * 1.5) * n, 0);
const tests = process.argv[2] === 'mixed' ? [
  [[['guard', 4], ['ranger', 4], ['tidecaller', 2]], [['demon', 4], ['crossbow', 4], ['tyiga', 2]]],
  [[['guard', 4], ['ranger', 4], ['tidecaller', 2]], [['demon', 5], ['crossbow', 5], ['hellmaid', 1]]],
  [[['guard', 4], ['rifleman', 4], ['lancer', 2]], [['demon', 4], ['crossbow', 4], ['hellmaid', 2], ['stalker', 1]]],
  [[['guard', 6], ['ranger', 4], ['tidecaller', 3]], [['demon', 6], ['crossbow', 4], ['manticore', 2]]],
  [[['corwin', 1], ['guard', 6], ['ranger', 6]], [['dara', 1], ['demon', 6], ['crossbow', 6]]],
  [[['benedict', 1], ['guard', 6], ['ranger', 6]], [['brand', 1], ['demon', 6], ['crossbow', 6]]],
  [[['fiona', 1], ['guard', 6], ['ranger', 6]], [['borel', 1], ['demon', 6], ['crossbow', 6]]],
  [[['tidecaller', 6]], [['tyiga', 6]]],
  [[['bombard', 3]], [['spitter', 3]]],
] : [
  [[['guard', 8]], [['demon', 8]]],
  [[['ranger', 8]], [['crossbow', 8]]],
  [[['lancer', 5]], [['hellmaid', 5]]],
  [[['rifleman', 6]], [['crossbow', 8]]],
  [[['guard', 6], ['ranger', 6]], [['demon', 6], ['crossbow', 6]]],
  [[['guard', 4], ['ranger', 4], ['rifleman', 4]], [['demon', 4], ['crossbow', 4], ['manticore', 2]]],
  [[['hellhound', 6]], [['stalker', 6]]],
  [[['gryphon', 4]], [['wyvern', 4]]],
  [[['corwin', 1]], [['dara', 1]]],
  [[['benedict', 1]], [['borel', 1]]],
  [[['gerard', 1]], [['jurt', 1]]],
  [[['fiona', 1]], [['brand', 1]]],
  [[['caine', 1]], [['mandor', 1]]],
  [[['julian', 1]], [['suhuy', 1]]],
  [[['random', 1]], [['dara', 1]]],
];
for (const [a, b] of tests) {
  const r = battle(a, b);
  console.log(JSON.stringify(a), 'cost', cost(a), 'vs', JSON.stringify(b), 'cost', cost(b), '=>', JSON.stringify(r));
}
