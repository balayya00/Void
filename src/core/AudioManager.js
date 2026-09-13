/**
 * AudioManager — procedural Web Audio only.
 *
 * No audio files, no CDN, nothing to download: every sound is synthesised from
 * oscillators, so the game stays a few hundred kilobytes and works offline.
 * Audio is *never* required to solve a puzzle: if the context cannot start
 * (private mode, restricted autoplay, missing support) every method becomes a
 * silent no-op and the game keeps working.
 */

const NOTES = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5
};

export class AudioManager {
  constructor(settings = {}) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
    this.failed = false;
  }

  get musicEnabled() { return !!this.settings.music; }
  get sfxEnabled() { return !!this.settings.sfx; }

  /** Lazily create the context — must be called from a user gesture. */
  unlock() {
    if (this.ctx || this.failed) return this.ctx;
    try {
      const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!Ctor) { this.failed = true; return null; }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      this.started = true;
      if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume().catch(() => {});
      if (this.musicEnabled) this.startMusic();
      return this.ctx;
    } catch (err) {
      this.failed = true;
      return null;
    }
  }

  /** Play a short synthesised tone. */
  tone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.5, delay = 0, glide = null, bus = 'sfx' } = {}) {
    if (!this.sfxEnabled && bus === 'sfx') return;
    if (!this.musicEnabled && bus === 'music') return;
    const ctx = this.ctx || this.unlock();
    if (!ctx) return;
    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, glide), now + duration);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(0.03, duration / 3));
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(env);
      env.connect(bus === 'music' ? this.musicGain : this.sfxGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (err) {
      /* audio must never break gameplay */
    }
  }

  chord(freqs, opts = {}) {
    freqs.forEach((freq, i) => this.tone({ freq, duration: opts.duration || 0.3, type: opts.type || 'triangle', gain: opts.gain || 0.28, delay: i * (opts.stagger || 0.06) }));
  }

  // ── semantic sounds ──────────────────────────────────────────────────────
  ui() { this.tone({ freq: NOTES.E5, duration: 0.06, type: 'square', gain: 0.14 }); }
  correct() { this.chord([NOTES.E5, NOTES.G5, NOTES.C6], { duration: 0.28, type: 'sine', gain: 0.3, stagger: 0.05 }); }
  wrong() { this.tone({ freq: 180, glide: 90, duration: 0.26, type: 'sawtooth', gain: 0.22 }); }
  fail() { this.chord([NOTES.A4, NOTES.F4], { duration: 0.4, type: 'triangle', gain: 0.24, stagger: 0.09 }); }
  complete() { this.chord([NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6], { duration: 0.5, type: 'triangle', gain: 0.3, stagger: 0.09 }); }
  secret() { this.chord([NOTES.G4, NOTES.B4, NOTES.D5, NOTES.A5], { duration: 0.7, type: 'sine', gain: 0.26, stagger: 0.12 }); }
  levelStart() { this.tone({ freq: NOTES.C5, glide: NOTES.A5, duration: 0.24, type: 'sine', gain: 0.22 }); }
  story() { this.chord([NOTES.D4, NOTES.A4, NOTES.F4, NOTES.C5], { duration: 0.9, type: 'sine', gain: 0.2, stagger: 0.18 }); }

  // ── ambience ────────────────────────────────────────────────────────────
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const pattern = [NOTES.C4, NOTES.G4, NOTES.A4, NOTES.E4, NOTES.F4, NOTES.C5, NOTES.G4, NOTES.D5];
    const bass = [NOTES.C4 / 2, NOTES.A4 / 4, NOTES.F4 / 2, NOTES.G4 / 2];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (!this.musicEnabled) return;
      const i = this.musicStep++;
      this.tone({ freq: pattern[i % pattern.length], duration: 0.9, type: 'sine', gain: 0.12, bus: 'music' });
      if (i % 4 === 0) this.tone({ freq: bass[(i / 4) % bass.length], duration: 1.6, type: 'triangle', gain: 0.16, bus: 'music' });
    }, 1100);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  applySettings(settings) {
    this.settings = settings;
    if (this.musicEnabled && this.ctx && !this.musicTimer) this.startMusic();
    if (!this.musicEnabled) this.stopMusic();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running' && this.ctx.suspend) this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.resume) this.ctx.resume().catch(() => {});
  }

  destroy() {
    this.stopMusic();
    if (this.ctx && this.ctx.close) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
