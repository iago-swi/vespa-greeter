(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.running = false;
      this.master = null;

      // 2-stroke engine nodes
      this.osc1 = null;
      this.osc2 = null;
      this.oscSub = null;
      this.lfo = null;
      this.lfoGain = null;
      this.engineFilter = null;
      this.engineGain = null;

      // Wind & shared noise buffer
      this.noiseBuf = null;
      this.windGain = null;
      this.windFilter = null;

      // Engine dynamics state
      this.prevSpeedRatio = 0.4;
      this.smoothAccel = 0;
      this.popCooldown = 0;

      // Horn state
      this.hornCooldown = 0;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;

      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.36;
      this.master.connect(this.ctx.destination);

      // Shared white-noise buffer for wind & exhaust pops
      const bufSize = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      // --- 2-STROKE VESPA ENGINE ---
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 340;
      this.engineFilter.Q.value = 2.8;

      // Warm nasal resonance peak typical of a small 2-stroke muffler
      const bodyPeak = this.ctx.createBiquadFilter();
      bodyPeak.type = 'peaking';
      bodyPeak.frequency.value = 185;
      bodyPeak.Q.value = 1.6;
      bodyPeak.gain.value = 4.5;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      // Fundamental raspy sawtooth
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.value = 64;
      const g1 = this.ctx.createGain();
      g1.gain.value = 0.62;

      // 2nd harmonic reed buzz
      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.value = 128;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.42;

      // Sub-chug pulse for low-RPM putt-putt character
      this.oscSub = this.ctx.createOscillator();
      this.oscSub.type = 'square';
      this.oscSub.frequency.value = 32;
      const gSub = this.ctx.createGain();
      gSub.gain.value = 0.18;

      // Subtle firing-cycle LFO modulating engine gain
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.value = 16;
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 0.025;
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.engineGain.gain);

      this.osc1.connect(g1);
      this.osc2.connect(g2);
      this.oscSub.connect(gSub);
      g1.connect(this.engineFilter);
      g2.connect(this.engineFilter);
      gSub.connect(this.engineFilter);

      this.engineFilter.connect(bodyPeak);
      bodyPeak.connect(this.engineGain);
      this.engineGain.connect(this.master);

      this.osc1.start();
      this.osc2.start();
      this.oscSub.start();
      this.lfo.start();

      // --- ALPINE WIND NOISE ---
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuf;
      noise.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 460;
      this.windFilter.Q.value = 0.85;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;

      noise.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      noise.start();

      this.running = true;
    }

    updateEngine(speedRatio, active, dt, throttleInput) {
      if (!this.running || !this.ctx) return;

      const clampedSpeed = Math.max(0, Math.min(1, speedRatio));
      const stepDt = Math.max(0.008, dt || 0.016);
      const rawAccel = (clampedSpeed - this.prevSpeedRatio) / stepDt;
      this.prevSpeedRatio = clampedSpeed;
      this.smoothAccel += (rawAccel - this.smoothAccel) * Math.min(1, stepDt * 7.5);

      if (this.popCooldown > 0) this.popCooldown = Math.max(0, this.popCooldown - stepDt);
      if (this.hornCooldown > 0) this.hornCooldown = Math.max(0, this.hornCooldown - stepDt);

      const now = this.ctx.currentTime;
      const accelBoost = Math.max(-0.45, Math.min(0.6, this.smoothAccel * 0.55 + (throttleInput || 0) * 0.22));

      // Responsive 2-stroke pitch (idles around 48 Hz, sings around 112 Hz under throttle)
      const jitter = Math.sin(now * 31) * 1.1 + Math.sin(now * 19.3) * 0.7;
      const baseFreq = 48 + clampedSpeed * 54 + accelBoost * 13 + jitter;

      // Filter opens throatily on acceleration, closes warmly on decel
      const cutoff = 235 + clampedSpeed * 320 + Math.max(0, accelBoost) * 260;
      const targetVol = active
        ? Math.max(0.07, 0.125 + clampedSpeed * 0.075 + Math.max(0, accelBoost) * 0.04)
        : 0.022;

      this.engineGain.gain.setTargetAtTime(targetVol, now, 0.07);
      this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.06);
      this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.045);
      this.osc2.frequency.setTargetAtTime(baseFreq * 2.015, now, 0.045);
      this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);
      this.lfo.frequency.setTargetAtTime(11 + clampedSpeed * 18, now, 0.08);
      this.lfoGain.gain.setTargetAtTime(active ? 0.022 + (1 - clampedSpeed) * 0.014 : 0.005, now, 0.08);

      // Wind scales smoothly with cruising speed
      this.windGain.gain.setTargetAtTime(active ? 0.02 + clampedSpeed * 0.055 : 0.0, now, 0.12);
      this.windFilter.frequency.setTargetAtTime(340 + clampedSpeed * 380, now, 0.12);

      // Authentic 2-stroke deceleration exhaust burble / pop when lifting off or braking
      const decelerating = active && (this.smoothAccel < -0.22 || (throttleInput < 0 && clampedSpeed > 0.12));
      if (decelerating && this.popCooldown <= 0 && !this.muted) {
        this._playExhaustPop(clampedSpeed);
        this.popCooldown = 0.14 + Math.random() * 0.22;
      }
    }

    _playExhaustPop(speedRatio) {
      if (!this.ctx || !this.noiseBuf || this.muted) return;
      const now = this.ctx.currentTime;

      // Soft low thump
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const startF = 105 + speedRatio * 45 + Math.random() * 25;
      osc.frequency.setValueAtTime(startF, now);
      osc.frequency.exponentialRampToValueAtTime(44, now + 0.075);

      const amp = 0.065 + Math.random() * 0.045;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.095);

      // Short filtered crackle puff
      const puff = this.ctx.createBufferSource();
      puff.buffer = this.noiseBuf;
      const pf = this.ctx.createBiquadFilter();
      pf.type = 'bandpass';
      pf.frequency.value = 420 + Math.random() * 260;
      pf.Q.value = 1.8;

      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(0.001, now);
      pg.gain.linearRampToValueAtTime(amp * 0.8, now + 0.006);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      puff.connect(pf);
      pf.connect(pg);
      pg.connect(this.master);
      puff.start(now, Math.random() * 1.5, 0.07);
    }

    playHorn() {
      this.init();
      if (!this.ctx || this.muted || this.hornCooldown > 0) return false;
      this.hornCooldown = 0.24;

      const now = this.ctx.currentTime;
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1080;
      bandpass.Q.value = 1.9;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.22, now + 0.018);
      env.gain.setValueAtTime(0.20, now + 0.14);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

      // Classic Italian Vespa dual-reed beep (slightly detuned major third)
      const freqs = [445, 558];
      freqs.forEach(freq => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 0.985, now + 0.2);
        osc.connect(bandpass);
        osc.start(now);
        osc.stop(now + 0.23);
      });

      bandpass.connect(env);
      env.connect(this.master);
      return true;
    }

    playGood(perfect) {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const notes = perfect ? [587.33, 739.99, 880, 1174.66] : [523.25, 659.25, 783.99];
      notes.forEach((f, idx) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, now + idx * 0.055);
        g.gain.setValueAtTime(0.001, now + idx * 0.055);
        g.gain.exponentialRampToValueAtTime(0.24, now + idx * 0.055 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.24);
        o.connect(g);
        g.connect(this.master);
        o.start(now + idx * 0.055);
        o.stop(now + idx * 0.055 + 0.26);
      });
    }

    playBad() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(190, now);
      o.frequency.linearRampToValueAtTime(125, now + 0.28);
      g.gain.setValueAtTime(0.22, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      o.connect(g);
      g.connect(this.master);
      o.start(now);
      o.stop(now + 0.32);
    }

    playWhoosh() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(185, now);
      o.frequency.exponentialRampToValueAtTime(72, now + 0.36);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.11, now + 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      o.connect(g);
      g.connect(this.master);
      o.start(now);
      o.stop(now + 0.4);
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.36, this.ctx.currentTime, 0.05);
      }
      return this.muted;
    }
  }

  VespaGame.SoundEngine = SoundEngine;
})(window);
