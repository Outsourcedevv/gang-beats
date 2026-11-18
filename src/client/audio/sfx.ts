// Procedural Web Audio sound effects — no audio files needed.
// Every sound is synthesised from oscillators and filtered noise.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Sound effects + ambience. */
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxVolume = 1;
  private musicVolume = 0.6;
  private noiseBuf: AudioBuffer | null = null;
  private ambience: AudioNode[] = [];
  private volume = 0.7;
  private lastPlay = new Map<string, number>();

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.5;
    this.musicBus.connect(this.master);
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Music requested before audio was allowed to start: start it now.
    if (this.musicTheme) {
      const t = this.musicTheme;
      this.musicTheme = null;
      this.setMusic(t);
    }
  }

  private suspended = false;

  /** Silence everything while the tab is hidden (the audio clock stops too, so music resumes in place). */
  setSuspended(hidden: boolean): void {
    this.suspended = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    if (this.sfxBus) this.sfxBus.gain.value = v;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.value = v * 0.5;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Avoid machine-gun stacking of identical sounds in the same instant. */
  private throttle(key: string, ms: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime * 1000;
    const last = this.lastPlay.get(key) ?? -1e9;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private noise(dur: number, filterType: BiquadFilterType, f0: number, f1: number, gain: number, q = 1, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0, attack = 0.005): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whoosh(): void {
    if (!this.ctx || !this.throttle('whoosh', 40)) return;
    this.noise(0.13, 'bandpass', 600, 2400, 0.18, 1.5);
  }

  hit(strength: number, head: boolean): void {
    if (!this.ctx || !this.throttle('hit', 30)) return;
    const s = Math.min(1, strength / 12);
    // Body thump + slap.
    this.tone('sine', 150 + s * 40, 45, 0.18, 0.6 + s * 0.3);
    this.noise(0.08, 'lowpass', 3500, 600, 0.35 + s * 0.3);
    if (head) {
      // Cartoon "bonk".
      this.tone('triangle', 520 + Math.random() * 80, 260, 0.16, 0.25, 0.005);
    }
  }

  grunt(voice: number, intensity = 1): void {
    if (!this.ctx || !this.throttle(`grunt${voice}`, 160)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.14 + Math.random() * 0.08;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = (140 + Math.random() * 40) * voice;
    o.frequency.setValueAtTime(f * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 700 * voice;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1200 * voice;
    f2.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * intensity, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f1).connect(g);
    o.connect(f2).connect(g);
    g.connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(): void {
    if (!this.ctx || !this.throttle('kick', 60)) return;
    this.noise(0.16, 'bandpass', 380, 1500, 0.24, 1.2);
  }

  headbutt(): void {
    if (!this.ctx || !this.throttle('headbutt', 60)) return;
    this.noise(0.1, 'bandpass', 500, 1200, 0.16, 1.5);
  }

  dive(): void {
    if (!this.ctx) return;
    this.noise(0.38, 'bandpass', 300, 1600, 0.3, 1);
  }

  /** Heavy breathing when a fighter runs out of stamina. */
  pant(voice: number): void {
    if (!this.ctx || !this.throttle(`pant${voice}`, 1200)) return;
    for (let i = 0; i < 3; i++) this.noise(0.16, 'bandpass', 900 * voice, 700 * voice, 0.12, 2, i * 0.3);
  }

  clunk(strength: number): void {
    if (!this.ctx || !this.throttle('clunk', 40)) return;
    const s = Math.min(1, strength / 12);
    this.tone('square', 180 + Math.random() * 60, 90, 0.12, 0.08 + s * 0.1);
    this.noise(0.08, 'bandpass', 1200, 400, 0.2 + s * 0.2, 1.4);
  }

  thud(strength: number): void {
    if (!this.ctx || !this.throttle('thud', 50)) return;
    const s = Math.min(1, strength / 12);
    this.tone('sine', 90, 35, 0.22, 0.35 + s * 0.4);
    this.noise(0.12, 'lowpass', 900, 200, 0.25 + s * 0.3);
  }

  grab(): void {
    if (!this.ctx || !this.throttle('grab', 60)) return;
    this.noise(0.05, 'bandpass', 1800, 900, 0.2, 2);
  }

  throw(): void {
    if (!this.ctx) return;
    this.noise(0.3, 'bandpass', 400, 2000, 0.28, 1.2);
  }

  jump(): void {
    if (!this.ctx || !this.throttle('jump', 80)) return;
    this.tone('sine', 300, 520, 0.1, 0.08);
  }

  ko(): void {
    if (!this.ctx) return;
    // Descending "wah-wah" plus tweety birdies.
    this.tone('triangle', 440, 220, 0.35, 0.25);
    this.tone('triangle', 330, 150, 0.45, 0.22, 0.3);
    for (let i = 0; i < 4; i++) this.tone('sine', 2400 + Math.random() * 600, 2000, 0.06, 0.06, 0.4 + i * 0.12);
  }

  fall(): void {
    if (!this.ctx) return;
    this.tone('sine', 1400, 260, 1.1, 0.12, 0, 0.05);
  }

  bell(): void {
    if (!this.ctx) return;
    this.tone('sine', 880, 870, 0.6, 0.25);
    this.tone('sine', 1320, 1300, 0.5, 0.1);
  }

  horn(): void {
    if (!this.ctx) return;
    this.tone('sawtooth', 220, 230, 0.45, 0.12, 0, 0.02);
    this.tone('sawtooth', 330, 340, 0.45, 0.09, 0, 0.02);
  }

  cheer(): void {
    if (!this.ctx) return;
    this.noise(1.6, 'bandpass', 1500, 900, 0.3, 0.6);
    [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.2, 0.06, i * 0.11));
  }

  click(): void {
    if (!this.ctx) return;
    this.tone('square', 900, 600, 0.05, 0.05);
  }

  // ------------------------------------------------------------- map sounds
  shatter(): void {
    if (!this.ctx) return;
    this.noise(0.5, 'highpass', 3000, 6000, 0.35, 0.7);
    for (let i = 0; i < 7; i++) this.tone('sine', 2500 + Math.random() * 3000, 2000 + Math.random() * 2000, 0.12, 0.05, 0.04 + i * 0.05);
  }

  crack(): void {
    if (!this.ctx || !this.throttle('crack', 60)) return;
    this.noise(0.09, 'bandpass', 1400, 500, 0.45, 1.4);
    this.tone('square', 140, 60, 0.12, 0.08);
  }

  creak(): void {
    if (!this.ctx || !this.throttle('creak', 200)) return;
    this.tone('sawtooth', 90, 130, 0.5, 0.05, 0, 0.1);
    this.noise(0.4, 'bandpass', 500, 700, 0.06, 8);
  }

  whistle(): void {
    if (!this.ctx || !this.throttle('whistle', 300)) return;
    this.tone('sine', 1800, 700, 0.7, 0.06, 0, 0.05);
  }

  boing(): void {
    if (!this.ctx || !this.throttle('boing', 120)) return;
    this.tone('sine', 180, 520, 0.35, 0.3);
    this.tone('triangle', 260, 700, 0.3, 0.12, 0.02);
  }

  crush(): void {
    if (!this.ctx) return;
    this.tone('sine', 70, 30, 0.4, 0.8);
    this.noise(0.6, 'lowpass', 2500, 200, 0.5);
    this.noise(0.7, 'highpass', 3000, 5000, 0.08, 0.5, 0.15);
  }

  grind(): void {
    if (!this.ctx) return;
    this.tone('sawtooth', 120, 90, 0.9, 0.12);
    this.noise(0.9, 'bandpass', 900, 2500, 0.35, 1.5);
  }

  splash(): void {
    if (!this.ctx) return;
    this.noise(0.7, 'lowpass', 2500, 300, 0.5);
    this.tone('sine', 400, 140, 0.25, 0.12);
  }

  sizzle(): void {
    if (!this.ctx) return;
    this.noise(1.2, 'highpass', 2500, 4000, 0.35, 0.5);
  }

  truckHorn(): void {
    if (!this.ctx || !this.throttle('horn', 800)) return;
    this.tone('sawtooth', 185, 180, 0.5, 0.12, 0, 0.03);
    this.tone('sawtooth', 233, 228, 0.5, 0.1, 0, 0.03);
  }

  gust(): void {
    if (!this.ctx) return;
    this.noise(1.4, 'bandpass', 300, 900, 0.25, 0.8);
  }

  boom(): void {
    if (!this.ctx) return;
    this.tone('sine', 120, 28, 0.9, 0.9);
    this.noise(1.0, 'lowpass', 3000, 120, 0.8);
  }

  goal(): void {
    if (!this.ctx) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.16, 0.07, i * 0.07));
    this.noise(1.2, 'bandpass', 1800, 900, 0.18, 0.7, 0.1);
  }

  tick(urgent: boolean): void {
    if (!this.ctx || !this.throttle('tick', urgent ? 120 : 300)) return;
    this.tone('square', urgent ? 1400 : 1000, urgent ? 1400 : 1000, 0.03, 0.05);
  }

  pop(): void {
    if (!this.ctx) return;
    this.tone('sine', 300, 900, 0.12, 0.12);
  }

  // -------------------------------------------------------------- ambience
  private ambienceTheme = 'sunset-rooftop';
  private ambienceTimer: ReturnType<typeof setInterval> | null = null;

  /** Choose the ambient bed for a map theme (restarts it if already playing). */
  setAmbience(theme: string): void {
    if (theme === this.ambienceTheme) return;
    this.ambienceTheme = theme;
    if (this.ambience.length) {
      this.stopAmbience();
      this.startAmbience();
    }
  }

  stopAmbience(): void {
    for (const n of this.ambience) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        // already stopped
      }
      n.disconnect();
    }
    this.ambience = [];
    if (this.ambienceTimer) clearInterval(this.ambienceTimer);
    this.ambienceTimer = null;
  }

  private loopNoise(type: BiquadFilterType, freq: number, gain: number, lfoRate = 0, lfoDepth = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start();
    this.ambience.push(src, g);
    if (lfoRate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const lg = ctx.createGain();
      lg.gain.value = lfoDepth;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      this.ambience.push(lfo, lg);
    }
  }

  private loopTone(type: OscillatorType, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(lp).connect(g).connect(this.sfxBus!);
    o.start();
    this.ambience.push(o, g);
  }

  /** Start the ambient bed for the current theme, quietly. */
  startAmbience(): void {
    if (!this.ctx || this.ambience.length) return;
    switch (this.ambienceTheme) {
      case 'factory': {
        this.loopTone('sawtooth', 48, 0.05);
        this.loopNoise('lowpass', 300, 0.03);
        this.ambienceTimer = setInterval(() => {
          if (this.suspended) return;
          if (Math.random() < 0.5) this.tone('square', 220 + Math.random() * 80, 120, 0.15, 0.03);
          else this.noise(0.12, 'bandpass', 2200, 1400, 0.05, 3);
        }, 1700);
        break;
      }
      case 'highway':
        this.loopNoise('lowpass', 160, 0.12);
        this.loopNoise('bandpass', 700, 0.04, 0.2, 0.02);
        break;
      case 'funfair': {
        this.loopNoise('lowpass', 500, 0.05, 0.11, 0.04);
        break;
      }
      default:
        this.loopNoise('lowpass', 420, 0.05, 0.12, 0.03);
        this.loopTone('sine', 55, 0.015);
    }
  }

  // ------------------------------------------------------------------ music
  private musicTheme: string | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private stepIdx = 0;

  /** Background music for a theme ('menu' or a map theme), or null for silence. */
  setMusic(theme: string | null): void {
    if (theme === this.musicTheme && (this.musicTimer || !this.ctx)) return;
    this.musicTheme = theme;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (!theme || !this.ctx) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.stepIdx = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 50);
  }

  private note(type: OscillatorType, midi: number, when: number, dur: number, gain: number, cutoff = 2400): void {
    const ctx = this.ctx!;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(lp).connect(g).connect(this.musicBus!);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  private drum(kind: 'kick' | 'snare' | 'hat' | 'clank', when: number, gain: number): void {
    const ctx = this.ctx!;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(40, when + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
      o.connect(g).connect(this.musicBus!);
      o.start(when);
      o.stop(when + 0.25);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : kind === 'clank' ? 2600 : 1800;
    f.Q.value = kind === 'clank' ? 8 : 0.8;
    const g = ctx.createGain();
    const dur = kind === 'hat' ? 0.04 : kind === 'clank' ? 0.12 : 0.14;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f).connect(g).connect(this.musicBus!);
    src.start(when, Math.random(), dur + 0.02);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicTheme) return;
    const T = MUSIC[this.musicTheme] ?? MUSIC.menu;
    const sixteenth = 60 / T.bpm / 4;
    while (this.nextNote < ctx.currentTime + 0.2) {
      const step = this.stepIdx % 16;
      const bar = Math.floor(this.stepIdx / 16);
      const chord = T.chords[bar % T.chords.length].map((n) => n + T.root);
      const t = this.nextNote;
      if (T.kick.includes(step)) this.drum('kick', t, 0.5);
      if (T.snare.includes(step)) this.drum(T.metal ? 'clank' : 'snare', t, 0.22);
      if (T.hats && step % 2 === 0) this.drum('hat', t, 0.05);
      if (T.bass.includes(step)) this.note(T.bassWave, chord[0] - 24, t, sixteenth * 3, 0.16, 700);
      if (step % T.arpEvery === 0) {
        const n = chord[(step / T.arpEvery) % chord.length] + 12 * T.arpOctave;
        this.note(T.leadWave, n, t, sixteenth * T.arpEvery * 0.9, 0.06);
      }
      if (step === 0) for (const n of chord) this.note('sine', n, t, sixteenth * 15, 0.025, 1200);
      this.nextNote += sixteenth;
      this.stepIdx++;
    }
  }
}

interface MusicTheme {
  bpm: number;
  root: number;
  chords: number[][];
  kick: number[];
  snare: number[];
  hats: boolean;
  bass: number[];
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  arpEvery: number;
  arpOctave: number;
  metal?: boolean;
}

const MIN7 = (r: number) => [r, r + 3, r + 7, r + 10];
const MAJ = (r: number) => [r, r + 4, r + 7];
const MIN = (r: number) => [r, r + 3, r + 7];

/** One original procedural groove per map theme (plus the menus). */
const MUSIC: Record<string, MusicTheme> = {
  menu: { bpm: 92, root: 60, chords: [MAJ(0), MIN(-3), MAJ(5), MAJ(7)], kick: [0, 8], snare: [], hats: false, bass: [0, 8], bassWave: 'triangle', leadWave: 'triangle', arpEvery: 2, arpOctave: 0 },
  'sunset-rooftop': { bpm: 100, root: 57, chords: [MIN7(0), MIN7(5), MAJ(10), MIN7(3)], kick: [0, 6, 8], snare: [4, 12], hats: true, bass: [0, 3, 8, 11], bassWave: 'triangle', leadWave: 'sine', arpEvery: 4, arpOctave: 1 },
  factory: { bpm: 118, root: 52, chords: [MIN(0), MIN(0), MAJ(-4), MAJ(-2)], kick: [0, 4, 8, 12], snare: [6, 14], hats: true, bass: [0, 2, 4, 6, 8, 10, 12, 14], bassWave: 'square', leadWave: 'square', arpEvery: 4, arpOctave: 0, metal: true },
  highway: { bpm: 128, root: 50, chords: [MAJ(0), MAJ(7), MIN(9), MAJ(5)], kick: [0, 8, 10], snare: [4, 12], hats: true, bass: [0, 2, 8, 10], bassWave: 'sawtooth', leadWave: 'square', arpEvery: 2, arpOctave: 1 },
  funfair: { bpm: 138, root: 60, chords: [MAJ(0), MAJ(7), MAJ(0), MAJ(5)], kick: [0, 8], snare: [4, 12], hats: false, bass: [0, 8], bassWave: 'triangle', leadWave: 'triangle', arpEvery: 2, arpOctave: 1 },
};
