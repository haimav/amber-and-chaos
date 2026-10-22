// Amber and Chaos — menus: title, campaign, skirmish, how to play, codex, settings, pause, results.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const $ = (id) => document.getElementById(id);
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const M = (AC.menus = {});
  let screen = null;

  function show(html, cls) {
    const el = $('screens');
    el.innerHTML = `<div class="screen ${cls || ''}">${html}</div>`;
    el.classList.remove('hidden');
    screen = el.firstChild;
    for (const b of el.querySelectorAll('button')) b.addEventListener('click', () => AC.audio.play('uiClick'));
    return screen;
  }
  function hide() { $('screens').classList.add('hidden'); $('screens').innerHTML = ''; screen = null; }
  M.hide = hide;
  function bind(id, fn) { const el = $(id); if (el) el.addEventListener('click', fn); }

  // ------------------------------------------------------------------ title
  M.title = function () {
    if (AC.game) return AC.quitToTitle();
    AC.state = 'menu';
    document.body.classList.remove('faction-chaos');
    $('titleCanvas').classList.remove('hidden');
    $('hud').classList.add('hidden');
    M.startTitleAnim();
    if (AC.audio.ctx) AC.audio.setTheme('menu');
    show(`
      <div class="title-wrap">
        <div class="title"><span class="t-amber">Amber</span><span class="t-and">and</span><span class="t-chaos">Chaos</span></div>
        <div class="subtitle">A war of Order and Chaos across the Shadows</div>
        <div class="menu-col">
          <button class="big" id="mCampaign">The Chronicles <small>Campaign</small></button>
          <button class="big" id="mSkirmish">Skirmish <small>Against the computer</small></button>
          <button id="mHow">How to Play</button>
          <button id="mCodex">Codex of Amber</button>
          <button id="mSettings">Settings</button>
        </div>
        <div class="foot">A fan-made strategy game inspired by Roger Zelazny's <i>The Chronicles of Amber</i>. All art and music are generated in your browser.</div>
      </div>`, 'title-screen');
    bind('mCampaign', () => { AC.audio.init(); M.campaign(); });
    bind('mSkirmish', () => { AC.audio.init(); M.skirmish(); });
    bind('mHow', () => { AC.audio.init(); M.how(M.title); });
    bind('mCodex', () => { AC.audio.init(); M.codex(M.title); });
    bind('mSettings', () => { AC.audio.init(); M.settings(M.title); });
    // first gesture starts audio
    const start = () => { AC.audio.init(); AC.audio.setTheme('menu'); window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  };

  M.startTitleAnim = function () {
    const cv = $('titleCanvas');
    cv.classList.remove('hidden');
    if (M._titleLoop) return;
    M._titleLoop = true;
    const ctx = cv.getContext('2d');
    const stars = [];
    for (let i = 0; i < 160; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.2, p: Math.random() * 6 });
    const t0 = performance.now();
    const loop = (now) => {
      if (AC.state !== 'menu') { cv.classList.add('hidden'); M._titleLoop = false; return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (now - t0) / 1000;
      const g = ctx.createRadialGradient(w * 0.35, h * 0.55, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#141a30'); g.addColorStop(0.5, '#0a0c18'); g.addColorStop(1, '#030308');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // chaos side glow
      const g2 = ctx.createRadialGradient(w * 0.85, h * 0.5, 10, w * 0.85, h * 0.5, h * 0.7);
      g2.addColorStop(0, 'rgba(120,30,160,0.35)'); g2.addColorStop(1, 'rgba(40,0,60,0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 0.7 + s.p));
        ctx.fillStyle = s.x > 0.6 ? '#e0b0ff' : '#cfe0ff';
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // the Pattern being walked
      const R = Math.min(w, h) * 0.34;
      const cx = w * 0.3, cy = h * 0.56;
      const prog = Math.min(1, (t % 40) / 26);
      ctx.save();
      ctx.shadowColor = '#7fb0ff'; ctx.shadowBlur = 16;
      AC.Art.drawPattern(ctx, cx, cy, R, R * 0.62, 'rgba(120,170,255,0.25)', 6, 11, 1);
      AC.Art.drawPattern(ctx, cx, cy, R, R * 0.62, 'rgba(200,225,255,0.9)', 1.6, 11, prog);
      ctx.restore();
      // the Logrus
      ctx.save();
      ctx.shadowColor = '#c060ff'; ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.55;
      AC.Art.drawLogrus(ctx, w * 0.84, h * 0.52, Math.min(w, h) * 0.26, t * 0.6, 'rgba(210,120,255,0.7)');
      ctx.restore();
      requestAnimationFrame(loop);
    };
    cv.classList.remove('hidden');
    requestAnimationFrame(loop);
  };

  // ------------------------------------------------------------------ campaign
  M.campaign = function () {
    const done = U.storage.get('campaignDone', {});
    const list = AC.SCENARIOS.map((s) => `
      <div class="mission ${done[s.id] ? 'won' : ''} f-${s.faction}" data-id="${s.id}">
        <div class="mnum">${s.num}</div>
        <div class="mtxt"><div class="mtitle">${esc(s.title)} ${done[s.id] ? '<span class="tick">✔</span>' : ''}</div><div class="mbook">${esc(s.book)} · play as ${s.faction === 'amber' ? 'Amber' : 'Chaos'}</div><div class="mblurb">${esc(s.blurb)}</div></div>
      </div>`).join('');
    show(`<div class="panel wide"><h1>The Chronicles</h1><div class="lead">Battles from the war of succession, the Black Road and Patternfall. Each mission may be played in any order.</div><div class="missions">${list}</div><div class="row"><button id="back">Back</button></div></div>`);
    bind('back', M.title);
    for (const el of screen.querySelectorAll('.mission')) el.addEventListener('click', () => { AC.audio.play('uiClick'); M.briefing(el.dataset.id); });
  };
  M.briefing = function (id) {
    const s = AC.SCENARIOS.find((x) => x.id === id);
    const diff = U.storage.get('campaignDiff', 'normal');
    show(`<div class="panel brief f-${s.faction}">
      <div class="bnum">Chapter ${s.num} · ${esc(s.book)}</div>
      <h1>${esc(s.title)}</h1>
      ${s.intro.map((p) => `<p>${esc(p)}</p>`).join('')}
      <div class="tips"><div class="tt">Counsel</div>${s.tips.map((t) => `<div>• ${esc(t)}</div>`).join('')}</div>
      <div class="row"><label>Difficulty <select id="bDiff"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label></div>
      <div class="row"><button id="back">Back</button><button class="primary" id="go">Begin</button></div>
    </div>`);
    $('bDiff').value = diff;
    bind('back', M.campaign);
    bind('go', () => {
      const d = $('bDiff').value;
      U.storage.set('campaignDiff', d);
      AC.startGame(() => s.create({ difficulty: d, seed: 1 + s.num }), { kind: 'campaign', id: s.id, difficulty: d });
    });
  };

  // ------------------------------------------------------------------ skirmish
  M.skirmish = function () {
    const prev = U.storage.get('skirmish', { faction: 'amber', opp: 1, oppFaction: 'chaos', diff: 'normal', theme: 'garnath', size: 96, rich: false, fog: true, team: false });
    const themes = Object.keys(AC.MAP_THEMES).map((k) => `<option value="${k}">${esc(AC.MAP_THEMES[k].name)}</option>`).join('');
    show(`<div class="panel wide skirm">
      <h1>Skirmish</h1>
      <div class="cols">
        <div class="col">
          <div class="lbl">Your side</div>
          <div class="facpick">
            <div class="fac f-amber" data-f="amber"><div class="fn">Amber</div><div class="fd">${esc(AC.FACTIONS.amber.desc)}</div></div>
            <div class="fac f-chaos" data-f="chaos"><div class="fn">Chaos</div><div class="fd">${esc(AC.FACTIONS.chaos.desc)}</div></div>
          </div>
          <div class="lbl">Opponents</div>
          <div class="row"><label>Number <select id="sOpp"><option value="1">One</option><option value="2">Two</option><option value="3">Three</option></select></label>
          <label>Their side <select id="sOppF"><option value="chaos">Chaos</option><option value="amber">Amber</option><option value="random">Random</option></select></label></div>
          <div class="row"><label>Difficulty <select id="sDiff"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
          <label class="chk"><input type="checkbox" id="sTeam"> 2 vs 2 (with three opponents: one fights beside you)</label></div>
        </div>
        <div class="col">
          <div class="lbl">The Shadow</div>
          <div class="row"><label>Map <select id="sTheme">${themes}</select></label><label>Size <select id="sSize"><option value="80">Small</option><option value="96">Medium</option><option value="120">Large</option></select></label></div>
          <div class="mapdesc" id="sMapDesc"></div>
          <div class="row"><label class="chk"><input type="checkbox" id="sRich"> Rich start (more diamonds and power)</label></div>
          <div class="row"><label class="chk"><input type="checkbox" id="sFog"> Fog of war</label></div>
          <div class="row"><label>Seed <input id="sSeed" type="text" placeholder="random" size="10"></label></div>
        </div>
      </div>
      <div class="row"><button id="back">Back</button><button class="primary" id="go">Begin</button></div>
    </div>`);
    let fac = prev.faction;
    const setFac = (f) => { fac = f; for (const el of screen.querySelectorAll('.fac')) el.classList.toggle('sel', el.dataset.f === f); };
    setFac(fac);
    for (const el of screen.querySelectorAll('.fac')) el.addEventListener('click', () => { AC.audio.play('uiClick'); setFac(el.dataset.f); });
    $('sOpp').value = prev.opp; $('sOppF').value = prev.oppFaction; $('sDiff').value = prev.diff; $('sTheme').value = prev.theme;
    $('sSize').value = prev.size; $('sRich').checked = prev.rich; $('sFog').checked = prev.fog !== false; $('sTeam').checked = !!prev.team;
    const desc = () => { $('sMapDesc').textContent = AC.MAP_THEMES[$('sTheme').value].desc; };
    $('sTheme').addEventListener('change', desc); desc();
    bind('back', M.title);
    bind('go', () => {
      const o = { faction: fac, opp: +$('sOpp').value, oppFaction: $('sOppF').value, diff: $('sDiff').value, theme: $('sTheme').value, size: +$('sSize').value, rich: $('sRich').checked, fog: $('sFog').checked, team: $('sTeam').checked };
      U.storage.set('skirmish', o);
      const seedTxt = $('sSeed').value.trim();
      const seed = seedTxt ? (parseInt(seedTxt, 10) || [...seedTxt].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) : (Math.random() * 1e9) | 0;
      const players = [{ faction: o.faction, isAI: false, name: 'You', team: 0 }];
      for (let i = 0; i < o.opp; i++) {
        const f = o.oppFaction === 'random' ? (Math.random() < 0.5 ? 'amber' : 'chaos') : o.oppFaction;
        const team = o.team && o.opp === 3 ? (i === 0 ? 0 : 1) : i + 1;
        players.push({ faction: f, isAI: true, difficulty: o.diff, team, name: (team === 0 ? 'Ally — ' : '') + AC.FACTIONS[f].title + (o.opp > 1 ? ' ' + (i + 1) : '') });
      }
      AC.startGame(() => AC.createSkirmish({ players, theme: o.theme, size: o.size, seed, fog: o.fog, startD: o.rich ? 1500 : 400, startP: o.rich ? 500 : 100 }), { kind: 'skirmish', opts: o, seed });
    });
  };

  // ------------------------------------------------------------------ how to play
  M.how = function (back) {
    show(`<div class="panel wide how">
      <h1>How to Play</h1>
      <div class="cols">
        <div class="col">
          <h2>On a MacBook</h2>
          <table class="keys">
            <tr><td>Click / drag</td><td>Select units (drag a box). Shift adds. Double-click selects all of a kind.</td></tr>
            <tr><td>Two-finger click<br>or Control-click</td><td>Smart command: move, attack, gather, build, follow, set rally point. Shift queues orders.</td></tr>
            <tr><td>Two-finger scroll</td><td>Pan the view (also arrow keys, screen edges, or the minimap).</td></tr>
            <tr><td>Pinch</td><td>Zoom (also + and −, or Option-scroll).</td></tr>
            <tr><td>A, then click</td><td>Attack-move: advance and fight everything on the way.</td></tr>
            <tr><td>M · S · H · P</td><td>Move · Stop · Hold position · Patrol.</td></tr>
            <tr><td>Q W E R</td><td>Hero abilities. R is always the hero's way home: a Trump, or the Ways of Chaos.</td></tr>
            <tr><td>B</td><td>Build menu (workers). Then the building's letter.</td></tr>
            <tr><td>⌥/⌃/⌘ + 1–9</td><td>Make a control group. 1–9 selects it; press twice to jump there. Shift + number adds to it.</td></tr>
            <tr><td>Tab</td><td>Show the abilities of the next kind of unit in your selection.</td></tr>
            <tr><td>Space</td><td>Jump to the latest alert.</td></tr>
            <tr><td>. or F1 · , or F2</td><td>Next idle worker · select your whole army.</td></tr>
            <tr><td>Home / ⌫</td><td>Jump to your seat of power.</td></tr>
            <tr><td>Esc · \` · F10</td><td>Cancel the current order, or pause. (In full screen, Esc leaves full screen and pauses.)</td></tr>
          </table>
        </div>
        <div class="col">
          <h2>The war</h2>
          <p><b>Diamonds</b> lie loose on the sands of a far Shadow. Workers carry them to your Castle, Keep, Spire or Bastion. <b>Order</b> (for Amber) and <b>Flux</b> (for Chaos) pay for heroes, sorcery and the finer troops. They flow from your seat of power, from Shrines, and above all from <b>Broken Patterns</b>: imperfect copies of the Pattern, which you claim by standing beside them.</p>
          <p><b>Amber</b> builds anywhere, and its Stewards stay to finish every building. Its works hold back the Black Road, and its soldiers heal slowly near them. Heroes come through the <b>Hall of Trumps</b>. Research the <b>Jewel of Judgment</b> there and any hero can call down its storm, paying with their own life.</p>
          <p><b>Chaos</b> must build upon the <b>Black Road</b>, which spreads from its works. Its summonings need no tending once begun. Enemies standing on the Road lose life; Chaos soldiers heal on it. The <b>Ty'iga</b> can steal an enemy's body, and a <b>Wave of Chaos</b> lays new Road wherever it breaks.</p>
          <p><b>Heroes</b> grow stronger with experience, up to level 6. At most three may take the field. The fallen can be revived at their hall.</p>
          <p>You win a skirmish by destroying every enemy building.</p>
        </div>
      </div>
      <div class="row"><button id="back">Back</button></div>
    </div>`);
    bind('back', back || M.title);
  };

  // ------------------------------------------------------------------ codex
  const CODEX = {
    'Princes of Amber': () => ['corwin', 'benedict', 'gerard', 'julian', 'fiona', 'caine', 'random'].map((id) => ({ id, name: AC.HEROES[id].name + ' — ' + AC.HEROES[id].title, text: AC.HEROES[id].desc })).concat([
      { name: 'Oberon', text: 'King of Amber and son of Dworkin. His disappearance began the war of succession among his children. He walked among them disguised as Ganelon, and died repairing the Primal Pattern.' },
      { name: 'Eric', text: 'Black, red and silver. Corwin\'s elder full brother, reputed the greatest swordsman after Benedict. He held Amber with the Jewel\'s storms, and died fighting the creatures of the Black Road. He left Corwin the Jewel.' },
      { name: 'Bleys', text: 'Red and orange. A dashing and charming swordsman who joined Corwin\'s assault on Amber, and fell from the side of Kolvir.' },
      { name: 'Brand', text: 'Green. A brilliant and mad sorcerer who bargained with Chaos and damaged the Primal Pattern with the blood of Random\'s son Martin. He was killed by Caine\'s silver arrows at the edge of the Abyss.' },
      { name: 'Deirdre, Flora, Llewella', text: 'Deirdre (silver and black) fought in black plate with an axe, and fell into the Abyss with Brand. Flora kept watch over Corwin on Shadow Earth. Llewella lives in Rebma beneath the sea.' },
      { name: 'Dworkin Barimen', text: 'A lord of Chaos, father of Oberon and maker of the Primal Pattern. He went mad when the Pattern was damaged, for its flaw was mirrored in his mind.' },
      { name: 'Merlin', text: 'Purple and grey. Son of Corwin and Dara. He walked both the Pattern and the Logrus, and built the Ghostwheel.' },
    ]),
    'Lords of Chaos': () => ['dara', 'brand', 'borel', 'mandor', 'jurt', 'suhuy'].map((id) => ({ id, name: AC.HEROES[id].name + ' — ' + AC.HEROES[id].title, text: AC.HEROES[id].desc })).concat([
      { name: 'Swayvill', text: 'King of Chaos in the days of Merlin. His death opened a deadly struggle for the throne.' },
      { name: 'The Houses', text: 'Sawall (Gramble, Mandor, Jurt and Despil), Hendrake (Borel and the warrior-maiden Gilva) and Barimen (Dworkin\'s house) are among the great Houses of the Courts.' },
    ]),
    'Places & Powers': () => [
      { name: 'Amber', text: 'The one true world of Order, high on Kolvir. Every other world is one of its Shadows.' },
      { name: 'Shadow', text: 'The worlds between Amber and Chaos, born of the tension between them. Those of the blood can walk through Shadow, shifting what they see until they find the world they seek. Physics and time differ from Shadow to Shadow.' },
      { name: 'The Pattern', text: 'Inscribed in a cavern beneath Castle Amber. Walking it is like wading in lead boots through three veils. Whoever reaches the centre may walk in Shadow.' },
      { name: 'The Logrus', text: 'The Pattern\'s ever-shifting, three-dimensional opposite: a tangle of tentacles. Those who master it can pull things out of Shadow. Its keeper is Suhuy.' },
      { name: 'Broken Patterns', text: 'Imperfect copies of the Pattern. Sorcerers draw power from the break, much as they would draw it from Chaos.' },
      { name: 'Trumps', text: 'Hand-painted cards. Concentrating on one opens a link to the person or place it shows, and with it talk, travel, or attack.' },
      { name: 'The Jewel of Judgment', text: 'A great red stone that commands the weather and draws on its bearer\'s life. It was the left eye of the Serpent of Chaos, and the true source of the Pattern.' },
      { name: 'The Black Road', text: 'It ran from the Courts of Chaos to the foot of Kolvir along the stain on the Primal Pattern, shaped like the Vale of Garnath. Its tentacular grass drains the life from living things.' },
      { name: 'Rebma, Tir-na Nog\'th, Arden, Avalon', text: 'Rebma is Amber mirrored beneath the sea. Tir-na Nog\'th is the moonlit Amber in the sky. Arden is Julian\'s forest. Avalon is the Shadow Benedict protects, and the home of jeweler\'s rouge.' },
      { name: 'The Courts of Chaos', text: 'A castle at the edge of the Abyss, under a sky half striped and half swirling black. Ygg, the talking tree Oberon planted, marks the border between Order and Chaos.' },
    ],
    'Creatures': () => ['hellhound', 'gryphon', 'demon', 'hellmaid', 'stalker', 'manticore', 'wyvern', 'tyiga', 'spitter', 'sphinx', 'glass_dragon'].map((id) => ({ id, name: AC.UNITS[id].name, text: AC.UNITS[id].desc })),
  };
  const SOURCES = [
    ['List of The Chronicles of Amber characters (Wikipedia)', 'https://en.wikipedia.org/wiki/List_of_The_Chronicles_of_Amber_characters'],
    ['The Pattern and the Logrus (Wikipedia)', 'https://en.wikipedia.org/wiki/The_Pattern_and_the_Logrus'],
    ['The Chronicles of Amber (Wikipedia)', 'https://en.wikipedia.org/wiki/The_Chronicles_of_Amber'],
    ['The Guns of Avalon (Wikipedia)', 'https://en.wikipedia.org/wiki/The_Guns_of_Avalon'],
    ['Sign of the Unicorn (Wikipedia)', 'https://en.wikipedia.org/wiki/Sign_of_the_Unicorn'],
    ['The Hand of Oberon (Wikipedia)', 'https://en.wikipedia.org/wiki/The_Hand_of_Oberon'],
    ['The Courts of Chaos (Wikipedia)', 'https://en.wikipedia.org/wiki/The_Courts_of_Chaos'],
    ['Reactor: The Chronicles of Amber reread', 'https://reactormag.com/the-chronicles-of-amber-reread-the-guns-of-avalon/'],
  ];
  M.codex = function (back) {
    const tabs = Object.keys(CODEX);
    show(`<div class="panel wide codex"><h1>Codex of Amber</h1><div class="tabs">${tabs.map((t, i) => `<button class="tab ${i ? '' : 'sel'}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}<button class="tab" data-t="Sources">Sources</button></div><div class="entries" id="cx"></div><div class="row"><button id="back">Back</button></div></div>`);
    const render = (t) => {
      for (const b of screen.querySelectorAll('.tab')) b.classList.toggle('sel', b.dataset.t === t);
      if (t === 'Sources') {
        $('cx').innerHTML = '<p class="lead">The lore in this game was gathered from these pages. The ability kits, unit rosters and campaign events are inventions inspired by the novels.</p>' + SOURCES.map(([n, u]) => `<div class="entry"><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a></div>`).join('');
        return;
      }
      const col = t === 'Lords of Chaos' || t === 'Creatures' ? AC.PLAYER_COLORS[1] : AC.PLAYER_COLORS[0];
      $('cx').innerHTML = CODEX[t]().map((e) => `<div class="entry">${e.id ? `<img src="${AC.iconSrc(e.id, col)}">` : '<div class="noimg">✦</div>'}<div><div class="en">${esc(e.name)}</div><div class="et">${esc(e.text)}</div></div></div>`).join('');
    };
    for (const b of screen.querySelectorAll('.tab')) b.addEventListener('click', () => render(b.dataset.t));
    render(tabs[0]);
    bind('back', back || M.title);
  };

  // ------------------------------------------------------------------ settings
  M.settings = function (back) {
    const s = AC.settings;
    show(`<div class="panel settings"><h1>Settings</h1>
      <div class="row"><label>Master volume <input type="range" id="vM" min="0" max="1" step="0.05"></label></div>
      <div class="row"><label>Music <input type="range" id="vMu" min="0" max="1" step="0.05"></label></div>
      <div class="row"><label>Sound effects <input type="range" id="vS" min="0" max="1" step="0.05"></label></div>
      <div class="row"><label>Game speed <select id="sSpeed"><option value="0.75">Slow</option><option value="1">Normal</option><option value="1.25">Fast</option><option value="1.5">Faster</option><option value="2">Fastest</option></select></label></div>
      <div class="row"><label>Scroll speed <input type="range" id="sScroll" min="0.4" max="2.5" step="0.1"></label></div>
      <div class="row"><label>Scroll gesture <select id="sWheel"><option value="auto">Automatic (two-finger scroll pans; line-scrolling mouse wheels zoom)</option><option value="pan">Always pan</option><option value="zoom">Always zoom</option></select></label></div>
      <div class="row"><label class="chk"><input type="checkbox" id="sEdge"> Scroll at the screen edges</label></div>
      <div class="row"><label class="chk"><input type="checkbox" id="sBars"> Always show health bars of damaged units and heroes</label></div>
      <div class="row"><label class="chk"><input type="checkbox" id="sTips"> Show tips in skirmish</label></div>
      <div class="row"><label>Graphics <select id="sQ"><option value="high">High (Retina)</option><option value="low">Low</option></select></label></div>
      <div class="row"><button id="back">Done</button></div></div>`);
    $('vM').value = s.masterVol; $('vMu').value = s.musicVol; $('vS').value = s.sfxVol; $('sSpeed').value = String(s.gameSpeed);
    $('sScroll').value = s.scrollSpeed; $('sWheel').value = s.wheel; $('sEdge').checked = s.edgeScroll; $('sBars').checked = s.alwaysBars; $('sQ').value = s.quality; $('sTips').checked = s.tips !== false;
    const save = () => {
      s.masterVol = +$('vM').value; s.musicVol = +$('vMu').value; s.sfxVol = +$('vS').value; s.gameSpeed = +$('sSpeed').value;
      s.scrollSpeed = +$('sScroll').value; s.wheel = $('sWheel').value; s.edgeScroll = $('sEdge').checked; s.alwaysBars = $('sBars').checked; s.tips = $('sTips').checked;
      const q = $('sQ').value;
      if (q !== s.quality) { s.quality = q; if (AC.renderer) { AC.renderer.chunks.clear(); AC.renderer.resize(); } }
      U.storage.set('settings', s);
      AC.audio.applyVolumes();
    };
    for (const el of screen.querySelectorAll('input,select')) el.addEventListener('input', save);
    bind('back', () => { save(); (back || M.title)(); });
  };

  // ------------------------------------------------------------------ pause & results
  M.pause = function () {
    if (AC.state !== 'playing') return;
    AC.paused = true;
    show(`<div class="panel pause"><h1>Paused</h1>
      <div class="menu-col">
        <button id="pResume" class="primary">Resume</button>
        <button id="pHow">How to Play</button>
        <button id="pSettings">Settings</button>
        <button id="pRestart">Restart</button>
        <button id="pQuit">Quit to Title</button>
      </div></div>`, 'dim');
    bind('pResume', M.resume);
    bind('pHow', () => M.how(M.pause));
    bind('pSettings', () => M.settings(M.pause));
    bind('pRestart', () => { if (confirm('Restart this battle?')) AC.restart(); });
    bind('pQuit', () => { if (confirm('Abandon this battle?')) AC.quitToTitle(); });
  };
  M.resume = function () { AC.paused = false; hide(); };

  M.results = function (won, game, meta) {
    AC.state = 'results';
    AC.paused = false;
    const sc = meta.kind === 'campaign' ? AC.SCENARIOS.find((s) => s.id === meta.id) : null;
    if (won && sc) { const d = U.storage.get('campaignDone', {}); d[sc.id] = true; U.storage.set('campaignDone', d); }
    const rows = game.players.filter((p) => !p.isNeutral).map((p) => `<tr style="color:${p.color.light}"><td>${esc(p.name)}</td><td>${p.stats.trained}</td><td>${p.stats.kills}</td><td>${p.stats.lost}</td><td>${p.stats.built}</td><td>${p.stats.razed}</td><td>${Math.floor(p.stats.gathered)}</td><td>${Math.floor(p.stats.power)}</td></tr>`).join('');
    const next = sc ? AC.SCENARIOS[AC.SCENARIOS.indexOf(sc) + 1] : null;
    show(`<div class="panel results ${won ? 'won' : 'lost'}">
      <h1>${won ? 'Victory' : 'Defeat'}</h1>
      <div class="lead">${won ? (sc ? esc(sc.epilogue) : 'The field is yours. The Shadows remember.') : 'The battle is lost. In Shadow there is always another road back.'}</div>
      <div class="time">Battle lasted ${U.formatTime(game.time)}</div>
      <table class="stats"><tr><th></th><th>Trained</th><th>Kills</th><th>Lost</th><th>Built</th><th>Razed</th><th>Diamonds</th><th>Power</th></tr>${rows}</table>
      <div class="row"><button id="rTitle">Title</button><button id="rRestart">Play again</button>${won && next ? '<button class="primary" id="rNext">Next: ' + esc(next.title) + '</button>' : ''}${!won || !next ? '<button id="rWatch">Look at the field</button>' : ''}</div>
    </div>`, 'dim');
    bind('rTitle', AC.quitToTitle);
    bind('rRestart', AC.restart);
    bind('rNext', () => M.briefing(next.id));
    bind('rWatch', () => { hide(); AC.state = 'playing'; });
  };
})();
