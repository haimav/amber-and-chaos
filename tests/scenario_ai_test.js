// Lets the computer play the human side of selected scenarios, as a rough winnability check.
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();
const ids = (process.argv[2] || 'lorraine,kolvir,patternfall').split(',');
const diff = process.argv[3] || 'normal';
for (const id of ids) {
  const s = AC.SCENARIOS.find((x) => x.id === id);
  const g = s.create({ headless: true, difficulty: diff });
  const me = g.localPlayer;
  g.players[me].isAI = true;
  const ai = new AC.AI(g, me, { firstWave: 120 });
  g.ais.push(ai);
  const t0 = Date.now();
  while (g.time < 35 * 60 && !g.over) { g.tick(AC.TICK); g.events.length = 0; }
  console.log(id, 'over', g.over, 'winner', g.winnerTeam, 'mine', g.players[me].team, 'time', AC.util.formatTime(g.time), 'objectives', g.objectives.map((o) => o.id + (o.done ? '✔' : o.failed ? '✘' : '')).join(','), 'ms', Date.now() - t0);
}
