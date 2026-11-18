// Procedural Web Audio sound effects — no audio files needed.
// Every sound is synthesised from oscillators and filtered noise.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
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
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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
    src.connect(filt).connect(g).connect(this.master!);
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
    o.connect(g).connect(this.master!);
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
    g.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
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

  /** Rooftop wind + distant city hum, looping quietly. */
  startAmbience(): void {
    if (!this.ctx || this.ambience.length) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    lfo.start();
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 55;
    const hg = ctx.createGain();
    hg.gain.value = 0.015;
    hum.connect(hg).connect(this.master!);
    hum.start();
    this.ambience.push(src, lfo, hum);
  }
}
