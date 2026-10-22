// Amber and Chaos — synthesised sound effects and generative music (Web Audio, no asset files).
(function () {
  'use strict';
  const AC = globalThis.AC;

  const MIN_GAP = {
    sword: 0.045, claw: 0.05, arrow: 0.05, crossbow: 0.06, rifle: 0.05, magicShot: 0.06, hitBuilding: 0.07, death: 0.08,
    beastDeath: 0.1, mine: 0.09, hammer: 0.08, zap: 0.05, thunder: 0.25, boom: 0.08, cannon: 0.1, spit: 0.1, splat: 0.1, heal: 0.1,
  };

  class AudioSys {
    constructor() {
      this.ctx = null;
      this.last = {};
      this.musicOn = true;
      this.intensity = 0;
      this.theme = null;
    }
    init() {
      if (this.ctx) { if (this.ctx.state !== 'running' && this.ctx.resume) this.ctx.resume().catch(() => {}); return; }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -16; this.comp.ratio.value = 4;
      this.comp.connect(this.master);
      this.sfxGain = c.createGain(); this.sfxGain.connect(this.comp);
      this.musicGain = c.createGain(); this.musicGain.connect(this.comp);
      // reverb
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.impulse(2.6, 2.2);
      this.revGain = c.createGain(); this.revGain.gain.value = 0.35;
      this.reverb.connect(this.revGain); this.revGain.connect(this.comp);
      // delay for harp
      this.delay = c.createDelay(1.0); this.delay.delayTime.value = 0.42;
      this.fb = c.createGain(); this.fb.gain.value = 0.32;
      this.delay.connect(this.fb); this.fb.connect(this.delay);
      this.delayOut = c.createGain(); this.delayOut.gain.value = 0.35;
      this.delay.connect(this.delayOut); this.delayOut.connect(this.musicGain);
      // noise
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.scheduler = setInterval(() => this.scheduleMusic(), 90);
    }
    applyVolumes() {
      if (!this.ctx) return;
      const s = AC.settings || {};
      this.master.gain.value = s.masterVol != null ? s.masterVol : 0.8;
      this.sfxGain.gain.value = s.sfxVol != null ? s.sfxVol : 0.7;
      this.musicGain.gain.value = s.musicVol != null ? s.musicVol * 0.6 : 0.3;
    }
    impulse(sec, decay) {
      const c = this.ctx, n = c.sampleRate * sec;
      const b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
      return b;
    }

    // ------------------------------------------------------------ primitives
    out(vol, pan, rev) {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = vol;
      let node = g;
      if (c.createStereoPanner && pan) {
        const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
        g.connect(p); node = p;
      }
      node.connect(this.sfxGain);
      if (rev) { const r = c.createGain(); r.gain.value = rev; node.connect(r); r.connect(this.reverb); }
      return g;
    }
    tone(dest, type, f0, f1, t0, dur, vol, attack) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return o;
    }
    noiseBurst(dest, ftype, f0, f1, q, t0, dur, vol, attack) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noise;
      s.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = ftype; f.Q.value = q || 1;
      f.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.003));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
    }

    // ------------------------------------------------------------ sfx
    playAt(name, x, y, r) {
      if (!this.ctx || !r) return;
      const dx = x - r.cam.x, dy = y - r.cam.y;
      const range = 900 / r.cam.zoom;
      const d = Math.hypot(dx, dy);
      if (d > range) return;
      const vol = Math.pow(1 - d / range, 1.4);
      const pan = dx / (r.vw / r.cam.zoom / 2) * 0.7;
      this.play(name, vol, pan);
    }
    play(name, vol, pan) {
      if (!this.ctx) return;
      vol = vol == null ? 1 : vol;
      const c = this.ctx, now = c.currentTime;
      const gap = MIN_GAP[name] || 0.03;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      if ('sword claw arrow crossbow rifle magicShot boom cannon death zap'.indexOf(name) >= 0) this.intensity = Math.min(1, this.intensity + 0.02);
      const t = now + 0.01;
      const j = 0.92 + Math.random() * 0.16; // pitch jitter
      switch (name) {
        case 'sword': {
          const o = this.out(0.18 * vol, pan, 0.15);
          this.tone(o, 'triangle', 1900 * j, 1600 * j, t, 0.16, 0.5);
          this.tone(o, 'sine', 2750 * j, 2600 * j, t, 0.12, 0.3);
          this.noiseBurst(o, 'bandpass', 3600, 2400, 2, t, 0.07, 0.6);
          break;
        }
        case 'claw': {
          const o = this.out(0.22 * vol, pan, 0.1);
          this.noiseBurst(o, 'bandpass', 1300 * j, 700, 1.5, t, 0.12, 0.7);
          this.tone(o, 'sine', 140, 70, t, 0.12, 0.6);
          break;
        }
        case 'hitBuilding': {
          const o = this.out(0.22 * vol, pan, 0.1);
          this.noiseBurst(o, 'lowpass', 600, 200, 1, t, 0.2, 0.8);
          this.tone(o, 'sine', 90 * j, 60, t, 0.18, 0.5);
          break;
        }
        case 'arrow': {
          const o = this.out(0.13 * vol, pan, 0.05);
          this.noiseBurst(o, 'highpass', 1800, 6000, 0.7, t, 0.16, 0.6);
          this.tone(o, 'triangle', 320 * j, 220, t, 0.07, 0.25);
          break;
        }
        case 'crossbow': {
          const o = this.out(0.15 * vol, pan, 0.05);
          this.tone(o, 'triangle', 190 * j, 120, t, 0.12, 0.6);
          this.noiseBurst(o, 'bandpass', 2500, 2500, 3, t, 0.03, 0.6);
          break;
        }
        case 'rifle': {
          const o = this.out(0.2 * vol, pan, 0.25);
          this.noiseBurst(o, 'lowpass', 3500, 600, 0.8, t, 0.16, 1.0, 0.001);
          this.tone(o, 'sine', 120, 50, t, 0.16, 0.7);
          break;
        }
        case 'cannon':
        case 'boom': {
          const o = this.out(0.3 * vol, pan, 0.35);
          this.noiseBurst(o, 'lowpass', 1100, 120, 0.7, t, 0.7, 1.0, 0.002);
          this.tone(o, 'sine', 70 * j, 30, t, 0.6, 0.9);
          break;
        }
        case 'spit':
        case 'splat': {
          const o = this.out(0.2 * vol, pan, 0.1);
          this.noiseBurst(o, 'bandpass', 700 * j, 250, 2, t, 0.25, 0.8);
          this.tone(o, 'sawtooth', 180, 60, t, 0.2, 0.15);
          break;
        }
        case 'magicShot': {
          const o = this.out(0.1 * vol, pan, 0.3);
          this.tone(o, 'sine', 620 * j, 1300 * j, t, 0.18, 0.5);
          this.tone(o, 'triangle', 930 * j, 1950 * j, t, 0.14, 0.2);
          break;
        }
        case 'death': {
          const o = this.out(0.1 * vol, pan, 0.2);
          this.tone(o, 'sawtooth', 240 * j, 90, t, 0.35, 0.25, 0.02);
          this.noiseBurst(o, 'lowpass', 500, 200, 1, t, 0.25, 0.4);
          break;
        }
        case 'beastDeath': {
          const o = this.out(0.14 * vol, pan, 0.2);
          this.tone(o, 'sawtooth', 170 * j, 55, t, 0.5, 0.35, 0.02);
          this.noiseBurst(o, 'bandpass', 400, 150, 1, t, 0.4, 0.5);
          break;
        }
        case 'heroDeath': {
          const o = this.out(0.3 * vol, pan, 0.6);
          [392, 311, 261, 196].forEach((f, i) => this.tone(o, 'sine', f, f * 0.98, t + i * 0.18, 1.6, 0.3, 0.02));
          break;
        }
        case 'collapse': {
          const o = this.out(0.35 * vol, pan, 0.4);
          this.noiseBurst(o, 'lowpass', 500, 80, 0.7, t, 1.6, 1.0, 0.01);
          for (let k = 0; k < 6; k++) this.noiseBurst(o, 'bandpass', 1500 + Math.random() * 1500, 800, 3, t + 0.1 + Math.random() * 0.8, 0.08, 0.4);
          break;
        }
        case 'build':
        case 'hammer': {
          const o = this.out(0.1 * vol, pan, 0.1);
          this.noiseBurst(o, 'bandpass', 2200 * j, 1800, 4, t, 0.05, 0.8);
          this.tone(o, 'sine', 420 * j, 380, t, 0.06, 0.4);
          break;
        }
        case 'place': {
          const o = this.out(0.14 * vol, pan);
          this.tone(o, 'sine', 300, 200, t, 0.1, 0.5);
          this.noiseBurst(o, 'lowpass', 800, 300, 1, t, 0.1, 0.4);
          break;
        }
        case 'summon': {
          const o = this.out(0.16 * vol, pan, 0.5);
          this.tone(o, 'sine', 900, 180, t, 0.9, 0.4, 0.1);
          this.tone(o, 'sine', 947, 190, t, 0.9, 0.3, 0.1);
          this.noiseBurst(o, 'bandpass', 400, 200, 2, t, 0.9, 0.3, 0.2);
          break;
        }
        case 'complete':
        case 'research': {
          const o = this.out(0.18 * vol, pan, 0.5);
          const base = name === 'complete' ? [523, 659, 784] : [587, 740, 880, 1175];
          base.forEach((f, i) => { this.tone(o, 'sine', f, f, t + i * 0.09, 0.9, 0.35, 0.005); this.tone(o, 'sine', f * 2, f * 2, t + i * 0.09, 0.5, 0.08); });
          break;
        }
        case 'mine': {
          const o = this.out(0.05 * vol, pan, 0.2);
          this.tone(o, 'sine', 3100 * j, 3000, t, 0.06, 0.5);
          this.tone(o, 'sine', 4300 * j, 4200, t, 0.05, 0.3);
          break;
        }
        case 'capture': {
          const o = this.out(0.22 * vol, pan, 0.6);
          [440, 554, 659, 880].forEach((f, i) => this.tone(o, 'triangle', f, f, t + i * 0.12, 1.2, 0.3, 0.01));
          break;
        }
        case 'levelup': {
          const o = this.out(0.22 * vol, pan, 0.5);
          [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(o, 'triangle', f, f, t + i * 0.07, 0.6, 0.3));
          break;
        }
        case 'teleport': {
          const o = this.out(0.15 * vol, pan, 0.6);
          for (let k = 0; k < 6; k++) { const f = 800 + Math.random() * 1600; this.tone(o, 'sine', f, f * 1.5, t + k * 0.04, 0.45, 0.2, 0.05); }
          break;
        }
        case 'channel': {
          const o = this.out(0.12 * vol, pan, 0.5);
          this.tone(o, 'sine', 330, 660, t, 1.8, 0.3, 0.4);
          this.tone(o, 'sine', 495, 990, t, 1.8, 0.15, 0.4);
          break;
        }
        case 'pattern': {
          const o = this.out(0.3 * vol, pan, 0.8);
          [294, 370, 440, 587, 740].forEach((f, i) => this.tone(o, 'sine', f, f, t + i * 0.05, 2.2, 0.25, 0.08));
          this.noiseBurst(o, 'highpass', 5000, 8000, 0.5, t, 1.5, 0.15, 0.3);
          break;
        }
        case 'thunder': {
          const o = this.out(0.35 * vol, pan, 0.6);
          this.noiseBurst(o, 'highpass', 2000, 1000, 0.7, t, 0.1, 0.8, 0.001);
          this.noiseBurst(o, 'lowpass', 600, 60, 0.5, t + 0.05, 1.8, 1.0, 0.05);
          break;
        }
        case 'zap': {
          const o = this.out(0.15 * vol, pan, 0.2);
          this.noiseBurst(o, 'highpass', 3000, 5000, 1, t, 0.09, 0.8, 0.001);
          this.tone(o, 'square', 1400, 300, t, 0.08, 0.15);
          break;
        }
        case 'fireCast': {
          const o = this.out(0.22 * vol, pan, 0.4);
          this.noiseBurst(o, 'bandpass', 500, 1500, 1.2, t, 0.6, 0.8, 0.15);
          this.tone(o, 'sawtooth', 110, 220, t, 0.5, 0.1, 0.1);
          break;
        }
        case 'horn': {
          const o = this.out(0.18 * vol, pan, 0.6);
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.connect(o);
          this.tone(f, 'sawtooth', 220, 220, t, 0.9, 0.35, 0.06);
          this.tone(f, 'sawtooth', 330, 330, t + 0.02, 0.9, 0.25, 0.06);
          break;
        }
        case 'howl': {
          const o = this.out(0.12 * vol, pan, 0.7);
          const osc = c.createOscillator(); osc.type = 'sine';
          osc.frequency.setValueAtTime(380, t); osc.frequency.linearRampToValueAtTime(720, t + 0.4); osc.frequency.linearRampToValueAtTime(520, t + 1.2);
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
          osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + 1.4);
          break;
        }
        case 'drums': {
          const o = this.out(0.3 * vol, pan, 0.3);
          [0, 0.18, 0.36, 0.45, 0.6].forEach((dt) => { this.tone(o, 'sine', 110, 50, t + dt, 0.2, 0.8); this.noiseBurst(o, 'lowpass', 800, 300, 1, t + dt, 0.08, 0.4); });
          break;
        }
        case 'gallop': {
          const o = this.out(0.14 * vol, pan, 0.1);
          [0, 0.1, 0.25, 0.35, 0.5, 0.6].forEach((dt) => this.noiseBurst(o, 'bandpass', 900, 600, 2, t + dt, 0.05, 0.8));
          break;
        }
        case 'whirl': {
          const o = this.out(0.18 * vol, pan, 0.2);
          this.noiseBurst(o, 'bandpass', 500, 2500, 2, t, 0.45, 0.8, 0.1);
          this.tone(o, 'triangle', 1800, 1500, t + 0.1, 0.2, 0.2);
          break;
        }
        case 'heave': {
          const o = this.out(0.25 * vol, pan, 0.3);
          this.tone(o, 'sine', 90, 40, t, 0.3, 0.9);
          this.noiseBurst(o, 'bandpass', 400, 1600, 1, t, 0.3, 0.5, 0.05);
          break;
        }
        case 'shield': {
          const o = this.out(0.16 * vol, pan, 0.5);
          this.tone(o, 'sine', 900, 900, t, 0.8, 0.4);
          this.tone(o, 'sine', 1350, 1350, t, 0.6, 0.2);
          break;
        }
        case 'bind': {
          const o = this.out(0.16 * vol, pan, 0.6);
          this.tone(o, 'sine', 300, 280, t, 1.2, 0.4, 0.1);
          this.tone(o, 'sine', 317, 296, t, 1.2, 0.4, 0.1);
          break;
        }
        case 'silverArrow': {
          const o = this.out(0.22 * vol, pan, 0.4);
          this.noiseBurst(o, 'highpass', 2500, 8000, 0.7, t, 0.3, 0.7);
          this.tone(o, 'sine', 2600, 3200, t, 0.5, 0.25);
          break;
        }
        case 'vanish': {
          const o = this.out(0.15 * vol, pan, 0.5);
          this.noiseBurst(o, 'bandpass', 3000, 400, 1, t, 0.5, 0.6, 0.35);
          break;
        }
        case 'roar': {
          const o = this.out(0.22 * vol, pan, 0.4);
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 0.3); f.frequency.linearRampToValueAtTime(400, t + 0.9); f.connect(o);
          this.tone(f, 'sawtooth', 110, 80, t, 0.9, 0.6, 0.05);
          this.tone(f, 'sawtooth', 116, 84, t, 0.9, 0.5, 0.05);
          this.noiseBurst(f, 'bandpass', 600, 300, 1, t, 0.8, 0.5, 0.05);
          break;
        }
        case 'spheres': {
          const o = this.out(0.15 * vol, pan, 0.5);
          [0, 0.12, 0.24, 0.36].forEach((dt, i) => this.tone(o, 'sine', 1400 + i * 120, 1400 + i * 120, t + dt, 0.25, 0.4));
          break;
        }
        case 'whisper': {
          const o = this.out(0.18 * vol, pan, 0.7);
          for (let k = 0; k < 4; k++) this.noiseBurst(o, 'bandpass', 1800 + Math.random() * 2000, 1500, 6, t + k * 0.15, 0.3, 0.5, 0.1);
          break;
        }
        case 'tendrils': {
          const o = this.out(0.22 * vol, pan, 0.4);
          this.noiseBurst(o, 'bandpass', 250, 500, 3, t, 0.8, 0.8, 0.1);
          this.tone(o, 'sawtooth', 70, 90, t, 0.8, 0.2, 0.1);
          break;
        }
        case 'heal': {
          const o = this.out(0.09 * vol, pan, 0.5);
          this.tone(o, 'sine', 880, 1320, t, 0.4, 0.4, 0.03);
          break;
        }
        case 'chaosWave': {
          const o = this.out(0.3 * vol, pan, 0.7);
          this.noiseBurst(o, 'lowpass', 400, 100, 0.7, t, 2.0, 0.9, 0.3);
          [233, 247, 349].forEach((f) => this.tone(o, 'sawtooth', f, f * 0.7, t, 1.8, 0.08, 0.2));
          break;
        }
        case 'possess': {
          const o = this.out(0.2 * vol, pan, 0.7);
          this.tone(o, 'sine', 1300, 260, t, 1.0, 0.4, 0.05);
          this.tone(o, 'sine', 1340, 250, t, 1.0, 0.3, 0.05);
          break;
        }
        case 'unicorn': {
          const o = this.out(0.3 * vol, 0, 0.9);
          [587, 659, 740, 880, 988, 1175, 1480, 1760].forEach((f, i) => this.tone(o, 'triangle', f, f, t + i * 0.06, 1.6, 0.25, 0.005));
          break;
        }
        case 'select': {
          const o = this.out(0.08 * vol, 0);
          this.tone(o, 'sine', 700, 760, t, 0.05, 0.5);
          break;
        }
        case 'ack': {
          const o = this.out(0.08 * vol, 0);
          this.tone(o, 'triangle', 520, 520, t, 0.05, 0.5);
          this.tone(o, 'triangle', 780, 780, t + 0.05, 0.06, 0.5);
          break;
        }
        case 'uiClick': {
          const o = this.out(0.08 * vol, 0);
          this.tone(o, 'sine', 900, 600, t, 0.04, 0.5);
          break;
        }
        case 'error': {
          const o = this.out(0.08 * vol, 0);
          this.tone(o, 'square', 150, 140, t, 0.14, 0.35);
          break;
        }
        case 'alert': {
          const o = this.out(0.22 * vol, 0, 0.4);
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(o);
          this.tone(f, 'sawtooth', 294, 294, t, 0.4, 0.4, 0.03);
          this.tone(f, 'sawtooth', 220, 220, t + 0.42, 0.6, 0.4, 0.03);
          break;
        }
        case 'unitReady': {
          const o = this.out(0.1 * vol, 0, 0.3);
          this.tone(o, 'triangle', 660, 660, t, 0.12, 0.4);
          this.tone(o, 'triangle', 880, 880, t + 0.1, 0.18, 0.4);
          break;
        }
        case 'victory': {
          const o = this.out(0.35, 0, 0.8);
          [[523, 0], [659, 0.2], [784, 0.4], [1046, 0.6], [784, 0.9], [1046, 1.1]].forEach(([f, dt]) => { this.tone(o, 'triangle', f, f, t + dt, 0.9, 0.35); this.tone(o, 'sine', f / 2, f / 2, t + dt, 0.9, 0.2); });
          break;
        }
        case 'defeat': {
          const o = this.out(0.35, 0, 0.8);
          [[440, 0], [415, 0.4], [349, 0.8], [293, 1.3]].forEach(([f, dt]) => this.tone(o, 'sine', f, f * 0.99, t + dt, 1.4, 0.35, 0.05));
          break;
        }
      }
    }

    // ------------------------------------------------------------ music
    setTheme(theme) {
      if (this.theme === theme) return;
      this.theme = theme;
      this.nextNote = this.ctx ? this.ctx.currentTime + 0.3 : 0;
      this.step = 0;
      this.bar = 0;
    }
    scheduleMusic() {
      const c = this.ctx;
      if (!c || !this.theme || !this.musicOn || (AC.settings && AC.settings.musicVol === 0)) return;
      this.intensity *= 0.985;
      const look = 0.35;
      if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.05;
      while (this.nextNote < c.currentTime + look) {
        this.playStep(this.nextNote);
        const bpm = this.theme === 'chaos' ? 58 : this.theme === 'menu' ? 64 : 72;
        this.nextNote += 60 / bpm / 2; // eighth notes
        this.step++;
      }
    }
    playStep(t) {
      const c = this.ctx;
      const th = this.theme;
      const s = this.step % 16;
      const barN = Math.floor(this.step / 16);
      const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
      if (th === 'amber' || th === 'menu') {
        // D dorian: i - VII - IV - i  (Dm, C, G, Dm)
        const prog = [[50, 53, 57, 62], [48, 52, 55, 60], [43, 50, 55, 59], [50, 53, 57, 62]];
        const chord = prog[barN % 4];
        if (s === 0) this.pad(t, chord, 60 / 72 * 8, th === 'menu' ? 0.06 : 0.05);
        // harp arpeggio
        const arp = [0, 1, 2, 3, 2, 1, 2, 3];
        if (s % 2 === 0 || th === 'menu') {
          const n = chord[arp[(s >> (th === 'menu' ? 0 : 1)) % 8]] + 12 + (s >= 8 && th === 'menu' ? 12 : 0);
          this.pluck(t, midi(n), 0.09);
        }
        // melody: occasional flute line
        if (th === 'amber' && s % 4 === 0 && Math.random() < 0.35) {
          const scale = [62, 64, 65, 67, 69, 71, 72, 74];
          this.melIdx = Math.max(0, Math.min(scale.length - 1, (this.melIdx || 3) + Math.floor(Math.random() * 3) - 1));
          this.flute(t, midi(scale[this.melIdx] + 12), 0.9, 0.035);
        }
        if (th === 'amber' && this.intensity > 0.25 && (s === 0 || s === 6 || s === 8 || s === 12)) this.drum(t, 0.12 + this.intensity * 0.15);
      } else if (th === 'chaos') {
        // C phrygian drone with dissonance
        if (s === 0 && barN % 2 === 0) this.drone(t, [36, 43, 37], 60 / 58 * 16, 0.06);
        if (s === 0 || s === 3) this.heartbeat(t, 0.15 + this.intensity * 0.15);
        if (s % 4 === 2 && Math.random() < 0.45) {
          const notes = [60, 61, 63, 66, 67, 68, 70];
          this.bell(t, midi(notes[Math.floor(Math.random() * notes.length)] + 12), 0.04);
        }
        if (s === 8 && Math.random() < 0.3) this.whisperPad(t);
        if (this.intensity > 0.25 && (s === 4 || s === 12)) this.drum(t, 0.14 + this.intensity * 0.15);
      }
    }
    pad(t, notes, dur, vol) {
      const c = this.ctx;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      f.connect(g); g.connect(this.musicGain);
      const r = c.createGain(); r.gain.value = 0.5; g.connect(r); r.connect(this.reverb);
      for (const n of notes) {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(); o.type = 'sawtooth';
          o.frequency.value = 440 * Math.pow(2, (n - 69) / 12); o.detune.value = det;
          o.connect(f); o.start(t); o.stop(t + dur + 0.1);
        }
      }
    }
    pluck(t, f, vol) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      const g2 = c.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(this.musicGain); g.connect(this.delay);
      const r = c.createGain(); r.gain.value = 0.4; g.connect(r); r.connect(this.reverb);
      o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
    }
    flute(t, f, dur, vol) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = c.createOscillator(); lfo.frequency.value = 5; const lg = c.createGain(); lg.gain.value = f * 0.008;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.12); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      const r = c.createGain(); r.gain.value = 0.6; g.connect(r); r.connect(this.reverb);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    }
    drone(t, notes, dur, vol) {
      const c = this.ctx;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
      f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(700, t + dur * 0.5); f.frequency.linearRampToValueAtTime(200, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      f.connect(g); g.connect(this.musicGain);
      const r = c.createGain(); r.gain.value = 0.5; g.connect(r); r.connect(this.reverb);
      for (const n of notes) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = 440 * Math.pow(2, (n - 69) / 12); o.detune.value = Math.random() * 10 - 5;
        o.connect(f); o.start(t); o.stop(t + dur + 0.1);
      }
    }
    heartbeat(t, vol) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.35);
    }
    drum(t, vol) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(this.musicGain);
      const r = c.createGain(); r.gain.value = 0.3; g.connect(r); r.connect(this.reverb);
      o.start(t); o.stop(t + 0.4);
      this.noiseBurstTo(this.musicGain, t, vol * 0.4);
    }
    noiseBurstTo(dest, t, vol) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + 0.15);
    }
    bell(t, f, vol) {
      const c = this.ctx;
      for (const [m, v] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        o.connect(g); g.connect(this.musicGain);
        const r = c.createGain(); r.gain.value = 0.8; g.connect(r); r.connect(this.reverb);
        o.start(t); o.stop(t + 2.6);
      }
    }
    whisperPad(t) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 8;
      f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(2400, t + 2); f.frequency.linearRampToValueAtTime(900, t + 4);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      s.connect(f); f.connect(g); g.connect(this.musicGain);
      const r = c.createGain(); r.gain.value = 0.8; g.connect(r); r.connect(this.reverb);
      s.start(t); s.stop(t + 4.1);
    }
  }
  AC.audio = new AudioSys();
})();
