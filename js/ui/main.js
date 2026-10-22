// Amber and Chaos — boot, game lifecycle and main loop.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const U = AC.util;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = { masterVol: 0.8, musicVol: 0.5, sfxVol: 0.7, gameSpeed: 1, scrollSpeed: 1, wheel: 'auto', edgeScroll: true, alwaysBars: true, quality: 'high', tips: true };
  AC.settings = Object.assign({}, DEFAULTS, U.storage.get('settings', {}));
  AC.state = 'menu';
  AC.paused = false;

  let game = null, renderer = null, hud = null, meta = null, makeGame = null;
  let acc = 0, last = performance.now();

  // tear down the current battle (HUD, renderer caches, input references)
  function teardown() {
    if (hud) hud.destroy();
    if (renderer) renderer.destroy();
    hud = null; renderer = null; game = null;
    AC.hud = null; AC.renderer = null; AC.game = null;
    AC.input.detach();
  }
  AC.startGame = function (factory, m) {
    teardown();
    AC.menus.hide();
    $('loading').classList.remove('hidden');
    // give the browser a frame to show the loading veil
    setTimeout(() => {
      try {
        makeGame = factory;
        meta = m;
        game = factory();
        AC.game = game;
        renderer = new AC.Renderer($('game'), game);
        AC.renderer = renderer;
        hud = new AC.HUD(game, renderer);
        AC.hud = hud;
        AC.input.attach(game, renderer, hud);
        hud.resizeMinimap();
        // camera on our seat of power or heroes
        const me = game.localPlayer;
        const hq = game.hq(me);
        const hero = game.units.find((u) => u.owner === me && u.def.hero);
        const focus = (m.kind === 'campaign' && hero) ? hero : hq || hero || game.units.find((u) => u.owner === me);
        if (focus) renderer.centerOn(focus.x, focus.y);
        const tp = performance.now();
        renderer.prewarm(true);
        AC.prewarmMs = performance.now() - tp;
        AC.state = 'playing';
        AC.paused = false;
        acc = 0;
        last = performance.now();
        $('titleCanvas').classList.add('hidden');
        AC.audio.init();
        AC.audio.setTheme(game.players[me].faction === 'chaos' ? 'chaos' : 'amber');
        if (m.kind === 'skirmish') hud.message('The war for the Shadows begins. Gather diamonds, raise your works, and destroy every enemy building.', 'info', 8);
      } catch (e) {
        console.error(e);
        alert('Could not start the battle: ' + e.message);
        AC.menus.title();
      }
      $('loading').classList.add('hidden');
    }, 30);
  };
  AC.restart = function () { if (makeGame) AC.startGame(makeGame, meta); };
  AC.quitToTitle = function () {
    AC.state = 'menu';
    AC.paused = false;
    teardown();
    const ctx = $('game').getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, $('game').width, $('game').height);
    AC.menus.title();
  };

  function onEvents() {
    if (!game) return;
    const evs = game.events;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      hud.onEvent(ev);
      if (ev.type === 'gameOver') {
        const me = game.players[game.localPlayer];
        const won = ev.winnerTeam === me.team;
        AC.audio.play(won ? 'victory' : 'defeat');
        setTimeout(() => { if (game && game.over) AC.menus.results(won, game, meta); }, 2200);
      }
    }
    evs.length = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!game || !renderer) return;
    if ((AC.state === 'playing' || AC.state === 'results') && !AC.paused) {
      const speed = AC.settings.gameSpeed || 1;
      acc += dt * speed;
      let steps = 0;
      while (acc >= AC.TICK && steps < 8) {
        game.tick(AC.TICK);
        acc -= AC.TICK;
        steps++;
      }
      if (steps >= 8) acc = 0;
      onEvents();
    }
    if (AC.state === 'playing') AC.input.update(dt);
    renderer.render(Math.min(1, acc / AC.TICK), AC.paused ? 0 : dt);
    if (hud) hud.update(dt, AC.paused ? 0 : dt);
  }

  function onResize() {
    if (renderer) renderer.resize();
    if (hud) hud.resizeMinimap();
  }
  window.addEventListener('resize', onResize);
  // moving the window between a Retina and an external display changes the pixel density
  // without necessarily firing 'resize'
  (function watchDensity() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    const on = () => { onResize(); watchDensity(); };
    if (mq.addEventListener) mq.addEventListener('change', on, { once: true });
    else if (mq.addListener) mq.addListener(function h() { mq.removeListener(h); on(); });
  })();
  // keep the window from scrolling or zooming as a page: pinch (Safari gestures, Chrome ctrl+wheel)
  // anywhere, and wheel/swipe over the HUD during play (which would otherwise risk Back navigation)
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) { e.preventDefault(); return; }
    if (AC.state === 'playing' && !AC.paused && e.target && e.target.id !== 'game') {
      e.preventDefault();
      AC.input.onWheel(e, true);
    }
  }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  window.addEventListener('beforeunload', (e) => {
    if (AC.state === 'playing' && game && !game.over) { e.preventDefault(); e.returnValue = ''; return ''; }
  });
  // Esc leaves fullscreen without reaching the page: treat leaving fullscreen during play as a pause
  const onFs = () => {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fs && AC.state === 'playing' && !AC.paused && game && !game.over) AC.menus.pause();
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
  document.addEventListener('visibilitychange', () => { if (document.hidden && AC.state === 'playing' && !AC.paused && game && !game.over) AC.menus.pause(); });

  window.addEventListener('DOMContentLoaded', () => {
    $('fsBtn').addEventListener('click', () => {
      const d = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    });
    AC.menus.title();
    requestAnimationFrame(frame);
  });
})();
