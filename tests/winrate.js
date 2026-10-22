// Runs several AI-vs-AI games and reports outcomes.
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();
const N = +(process.argv[2] || 6);
const fa = process.argv[3] || 'amber', fb = process.argv[4] || 'chaos';
const themes = Object.keys(AC.MAP_THEMES);
const res = {};
for (let i = 0; i < N; i++) {
  const theme = themes[i % themes.length];
  const g = AC.createSkirmish({ players: [{ faction: fa, isAI: true }, { faction: fb, isAI: true }], theme, size: 96, seed: 1000 + i * 37, headless: true });
  let t = 0;
  try {
    while (!g.over && g.time < 40 * 60) { g.tick(AC.TICK); g.events.length = 0; }
  } catch (e) { console.log('CRASH', theme, e.stack); process.exitCode = 1; break; }
  const w = g.winnerTeam == null ? 'none' : g.players[g.winnerTeam].faction + g.winnerTeam;
  res[w] = (res[w] || 0) + 1;
  const heroes = (pid) => Object.keys(g.players[pid].deadHeroes).length + g.units.filter((u) => !u.dead && u.owner === pid && u.def.hero).length;
  console.log(theme, 'seed', 1000 + i * 37, 'winner', w, 'at', AC.util.formatTime(g.time), 'kills', g.players[0].stats.kills, g.players[1].stats.kills, 'heroes', heroes(0), heroes(1), 'gathered', g.players[0].stats.gathered | 0, g.players[1].stats.gathered | 0);
}
console.log(res);
