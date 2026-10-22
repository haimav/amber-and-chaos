// Headless AI-vs-AI simulation test.
// Usage: node tests/sim_test.js [minutes] [theme] [seed] [factionA] [factionB] [difficulty]
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();

const minutes = +(process.argv[2] || 25);
const theme = process.argv[3] || 'garnath';
const seed = +(process.argv[4] || 12345);
const fa = process.argv[5] || 'amber';
const fb = process.argv[6] || 'chaos';
const diff = process.argv[7] || 'normal';

const g = AC.createSkirmish({
  players: [
    { faction: fa, isAI: true, difficulty: diff },
    { faction: fb, isAI: true, difficulty: diff },
  ],
  theme, size: 96, seed, headless: true,
});

const dt = AC.TICK;
const ticks = Math.round((minutes * 60) / dt);
const t0 = Date.now();
let lastReport = 0;
const counts = {};
for (let i = 0; i < ticks; i++) {
  g.tick(dt);
  for (const ev of g.events) counts[ev.type] = (counts[ev.type] || 0) + 1;
  g.events.length = 0;
  if (g.time - lastReport >= 120) {
    lastReport = g.time;
    const line = g.players.filter((p) => !p.isNeutral).map((p) => {
      const units = g.units.filter((u) => !u.dead && u.owner === p.id);
      const army = units.filter((u) => u.def.role !== 'worker');
      const bl = g.buildings.filter((b) => !b.dead && b.owner === p.id);
      const heroes = units.filter((u) => u.def.hero).map((h) => h.def.id + 'L' + h.level);
      return `${p.faction}: d=${p.res.d | 0} p=${p.res.p | 0} sup=${p.supplyUsed}/${p.supplyCap} w=${units.length - army.length} army=${army.length} bld=${bl.length} heroes=[${heroes}] ups=${Object.keys(p.upgrades).length} gathered=${p.stats.gathered | 0}`;
    });
    console.log(AC.util.formatTime(g.time), line.join(' | '));
  }
  if (g.over) break;
}
const ms = Date.now() - t0;
console.log('---');
console.log('Simulated', AC.util.formatTime(g.time), 'in', ms, 'ms', `(${((g.time * 1000) / ms).toFixed(1)}x realtime)`);
console.log('Over:', g.over, 'winner team:', g.winnerTeam);
console.log('Events:', JSON.stringify(counts));
for (const p of g.players) if (!p.isNeutral) console.log(p.faction, JSON.stringify(p.stats));
console.log('Pathfinder calls:', g.pf.count);
const roads = g.map.road.reduce((a, b) => a + b, 0);
console.log('Road tiles:', roads);
