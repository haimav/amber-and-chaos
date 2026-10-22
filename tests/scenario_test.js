// Runs every campaign scenario headless for a while (no player input) to catch script errors.
'use strict';
const { loadCore } = require('./load');
const AC = loadCore();
const minutes = +(process.argv[2] || 6);
let failed = 0;
for (const s of AC.SCENARIOS) {
  const t0 = Date.now();
  try {
    const g = s.create({ headless: true, difficulty: 'normal' });
    const evs = {};
    while (g.time < minutes * 60 && !g.over) {
      g.tick(AC.TICK);
      for (const e of g.events) evs[e.type] = (evs[e.type] || 0) + 1;
      g.events.length = 0;
    }
    const me = g.players[g.localPlayer];
    console.log(`${s.id.padEnd(12)} t=${AC.util.formatTime(g.time)} over=${g.over} winner=${g.winnerTeam} myUnits=${g.units.filter((u) => u.owner === me.id).length} objectives=${g.objectives.map((o) => o.id + (o.done ? '✔' : o.failed ? '✘' : '')).join(',')} ms=${Date.now() - t0}`);
    console.log('   events', JSON.stringify(evs));
  } catch (e) {
    failed++;
    console.log('FAIL', s.id, e.stack);
  }
}
process.exitCode = failed ? 1 : 0;
