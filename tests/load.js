// Loads the game's core (DOM-free) scripts into Node for headless tests.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CORE = ['util', 'data', 'map', 'path', 'game', 'behavior', 'abilities', 'commands', 'ai', 'setup', 'scenarios'];

function loadCore() {
  for (const f of CORE) {
    const file = path.join(ROOT, 'js', 'core', f + '.js');
    if (!fs.existsSync(file)) continue;
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
  return globalThis.AC;
}
module.exports = { loadCore, ROOT };
