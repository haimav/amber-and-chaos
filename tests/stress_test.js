// 4-player free-for-all on a large map: stability and per-tick cost over a long game.
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();
const minutes = +(process.argv[2] || 30);
const g = AC.createSkirmish({
  players: [
    { faction: 'amber', isAI: true, difficulty: 'hard' }, { faction: 'chaos', isAI: true, difficulty: 'hard' },
    { faction: 'amber', isAI: true, difficulty: 'normal' }, { faction: 'chaos', isAI: true, difficulty: 'normal' },
  ],
  theme: process.argv[3] || 'kolvir', size: 120, seed: 2024, headless: true,
});
let worst = 0, total = 0, n = 0, maxUnits = 0;
const t0 = Date.now();
while (g.time < minutes * 60 && !g.over) {
  const s = process.hrtime.bigint();
  g.tick(AC.TICK);
  const ms = Number(process.hrtime.bigint() - s) / 1e6;
  worst = Math.max(worst, ms); total += ms; n++;
  maxUnits = Math.max(maxUnits, g.units.length);
  g.events.length = 0;
  if (n % (30 * 300) === 0) console.log(AC.util.formatTime(g.time), 'units', g.units.length, 'buildings', g.buildings.length, 'alive', g.players.filter((p) => p.alive && !p.isNeutral).length, 'avg tick ms', (total / n).toFixed(2));
}
console.log('done', AC.util.formatTime(g.time), 'over', g.over, 'winner', g.winnerTeam, 'avg tick', (total / n).toFixed(2), 'ms, worst', worst.toFixed(1), 'ms, max units', maxUnits, 'wall', Date.now() - t0, 'ms');
