import type { PlayerInput } from '../sim/input';
import { emptyInput } from '../sim/input';
import type { BreakState } from '../sim/arenaRuntime';
import type { CharState } from '../sim/character';
import type { RoundPhase } from '../sim/rules';
import type { GameSim } from '../sim/game';
import { MSG_INPUT, MSG_SNAPSHOT } from './protocol';

// Compact binary encodings for the two high-frequency messages.

const BUTTONS = ['jump', 'punch', 'grab', 'lift', 'sprint', 'kick', 'headbutt', 'dive', 'emote'] as const;

export function buttonMask(inp: PlayerInput): number {
  let m = 0;
  BUTTONS.forEach((b, i) => {
    if (inp[b]) m |= 1 << i;
  });
  return m;
}

/** Input packet: type, seq, move x/z (int8), held buttons, buttons pressed since the last packet. */
export function encodeInput(seq: number, inp: PlayerInput, pressed: number): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint16(1, seq & 0xffff, true);
  v.setInt8(3, Math.round(Math.max(-1, Math.min(1, inp.moveX)) * 127));
  v.setInt8(4, Math.round(Math.max(-1, Math.min(1, inp.moveZ)) * 127));
  const held = buttonMask(inp);
  v.setUint8(5, held & 0xff);
  v.setUint8(6, pressed & 0xff);
  // Ninth button (emote): held in bit 0, pressed in bit 1.
  v.setUint8(7, ((held >> 8) & 1) | (((pressed >> 8) & 1) << 1));
  return buf;
}

export interface DecodedInput {
  seq: number;
  moveX: number;
  moveZ: number;
  held: number;
  pressed: number;
}

export function decodeInput(data: ArrayBufferLike | Uint8Array): DecodedInput | null {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength < 8 || u8[0] !== MSG_INPUT) return null;
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hi = v.getUint8(7);
  return {
    seq: v.getUint16(1, true),
    moveX: v.getInt8(3) / 127,
    moveZ: v.getInt8(4) / 127,
    held: v.getUint8(5) | ((hi & 1) << 8),
    pressed: v.getUint8(6) | (((hi >> 1) & 1) << 8),
  };
}

/** Turn held+latched buttons into a sim input. */
export function toPlayerInput(moveX: number, moveZ: number, mask: number): PlayerInput {
  const inp = emptyInput();
  inp.moveX = moveX;
  inp.moveZ = moveZ;
  BUTTONS.forEach((b, i) => {
    inp[b] = (mask & (1 << i)) !== 0;
  });
  return inp;
}

// ------------------------------------------------------------------ snapshots
export const PHASES: RoundPhase[] = ['countdown', 'fight', 'roundOver', 'matchOver', 'sandbox', 'switching'];
const STATES: CharState[] = ['active', 'ko', 'eliminated'];
const BREAKS: BreakState[] = ['intact', 'shaking', 'falling', 'gone'];
const POS_SCALE = 500; // 2 mm steps, ±65 m

export interface CharSnap {
  state: CharState;
  daze: number;
  stamina: number;
  koTimer: number;
  exhausted: boolean;
  hanging: boolean;
  hurt: boolean;
  effort: boolean;
  scared: boolean;
}

export interface Snapshot {
  epoch: number;
  tick: number;
  roundTime: number;
  phase: RoundPhase;
  round: number;
  /** Round wins and in-round points per side. */
  scores: number[];
  points: number[];
  lives: number[];
  hillIndex: number;
  potatoHolder: number;
  potatoTimer: number;
  chars: CharSnap[];
  /** Body transforms: 7 floats per body (pos + quat), in GameSim snapshot order. */
  bodies: Float32Array;
  propActive: boolean[];
  breakStates: BreakState[];
}

const clamp16 = (x: number) => Math.max(-32767, Math.min(32767, Math.round(x)));

export function encodeSnapshot(sim: GameSim, epoch: number): ArrayBuffer {
  const nc = sim.characters.length;
  const nb = sim.snapshotBodyCount;
  const np = sim.props.length;
  const nk = sim.runtime.breakables.length;
  const ns = sim.rules.sideCount;
  const size = 1 + 1 + 4 + 4 + 1 + 1 + 1 + ns * 3 + 1 + nc * 6 + 3 + 2 + nb * 14 + 1 + Math.ceil(np / 8) + 1 + nk;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, MSG_SNAPSHOT);
  v.setUint8(o++, epoch & 0xff);
  v.setUint32(o, sim.tick, true);
  o += 4;
  v.setFloat32(o, sim.rules.roundTime, true);
  o += 4;
  v.setUint8(o++, PHASES.indexOf(sim.rules.phase));
  v.setUint8(o++, sim.rules.round);
  v.setUint8(o++, ns);
  for (let i = 0; i < ns; i++) {
    v.setUint8(o++, sim.rules.scores[i] ?? 0);
    v.setUint16(o, Math.min(65535, Math.round((sim.rules.points[i] ?? 0) * 10)), true);
    o += 2;
  }
  v.setUint8(o++, nc);
  for (let i = 0; i < nc; i++) {
    const c = sim.characters[i];
    v.setUint8(o++, sim.rules.lives[i] ?? 0);
    v.setUint8(o++, STATES.indexOf(c.state));
    v.setUint8(o++, Math.max(0, Math.min(255, Math.round(c.daze * 2))));
    v.setUint8(o++, Math.max(0, Math.min(255, Math.round(c.stamina * 2))));
    v.setUint8(o++, Math.max(0, Math.min(255, Math.round(c.koTimer * 20))));
    const flags =
      (c.exhausted ? 1 : 0) | (c.hanging ? 2 : 0) | (c.hurtTimer > 0 ? 4 : 0) | (c.effort > 0.5 ? 8 : 0) | (c.airTime > 0.6 || c.liftedBy >= 0 ? 16 : 0);
    v.setUint8(o++, flags);
  }
  v.setUint8(o++, sim.rules.hillIndex);
  v.setInt8(o++, sim.rules.potatoHolder);
  v.setUint8(o++, Math.max(0, Math.min(255, Math.round(sim.rules.potatoTimer * 10))));
  v.setUint16(o, nb, true);
  o += 2;
  const s = sim.currSnap;
  for (let b = 0; b < nb; b++) {
    const k = b * 7;
    v.setInt16(o, clamp16(s[k] * POS_SCALE), true);
    v.setInt16(o + 2, clamp16(s[k + 1] * POS_SCALE), true);
    v.setInt16(o + 4, clamp16(s[k + 2] * POS_SCALE), true);
    v.setInt16(o + 6, clamp16(s[k + 3] * 32767), true);
    v.setInt16(o + 8, clamp16(s[k + 4] * 32767), true);
    v.setInt16(o + 10, clamp16(s[k + 5] * 32767), true);
    v.setInt16(o + 12, clamp16(s[k + 6] * 32767), true);
    o += 14;
  }
  v.setUint8(o++, np);
  for (let i = 0; i < np; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8 && i + j < np; j++) if (sim.propActive(i + j)) byte |= 1 << j;
    v.setUint8(o++, byte);
  }
  v.setUint8(o++, nk);
  for (let i = 0; i < nk; i++) v.setUint8(o++, BREAKS.indexOf(sim.breakState(i)));
  return buf;
}

export function decodeSnapshot(data: ArrayBuffer | Uint8Array): Snapshot | null {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength < 14 || u8[0] !== MSG_SNAPSHOT) return null;
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 1;
  const epoch = v.getUint8(o++);
  const tick = v.getUint32(o, true);
  o += 4;
  const roundTime = v.getFloat32(o, true);
  o += 4;
  const phase = PHASES[v.getUint8(o++)] ?? 'fight';
  const round = v.getUint8(o++);
  const ns = v.getUint8(o++);
  const scores: number[] = [];
  const points: number[] = [];
  for (let i = 0; i < ns; i++) {
    scores.push(v.getUint8(o++));
    points.push(v.getUint16(o, true) / 10);
    o += 2;
  }
  const nc = v.getUint8(o++);
  const chars: CharSnap[] = [];
  const lives: number[] = [];
  for (let i = 0; i < nc; i++) {
    lives.push(v.getUint8(o++));
    const state = STATES[v.getUint8(o++)] ?? 'active';
    const daze = v.getUint8(o++) / 2;
    const stamina = v.getUint8(o++) / 2;
    const koTimer = v.getUint8(o++) / 20;
    const f = v.getUint8(o++);
    chars.push({ state, daze, stamina, koTimer, exhausted: !!(f & 1), hanging: !!(f & 2), hurt: !!(f & 4), effort: !!(f & 8), scared: !!(f & 16) });
  }
  const hillIndex = v.getUint8(o++);
  const potatoHolder = v.getInt8(o++);
  const potatoTimer = v.getUint8(o++) / 10;
  const nb = v.getUint16(o, true);
  o += 2;
  const bodies = new Float32Array(nb * 7);
  for (let b = 0; b < nb; b++) {
    const k = b * 7;
    bodies[k] = v.getInt16(o, true) / POS_SCALE;
    bodies[k + 1] = v.getInt16(o + 2, true) / POS_SCALE;
    bodies[k + 2] = v.getInt16(o + 4, true) / POS_SCALE;
    let qx = v.getInt16(o + 6, true) / 32767;
    let qy = v.getInt16(o + 8, true) / 32767;
    let qz = v.getInt16(o + 10, true) / 32767;
    let qw = v.getInt16(o + 12, true) / 32767;
    const n = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= n;
    qy /= n;
    qz /= n;
    qw /= n;
    bodies[k + 3] = qx;
    bodies[k + 4] = qy;
    bodies[k + 5] = qz;
    bodies[k + 6] = qw;
    o += 14;
  }
  const np = v.getUint8(o++);
  const propActive: boolean[] = [];
  for (let i = 0; i < np; i += 8) {
    const byte = v.getUint8(o++);
    for (let j = 0; j < 8 && i + j < np; j++) propActive.push(!!(byte & (1 << j)));
  }
  const nk = v.getUint8(o++);
  const breakStates: BreakState[] = [];
  for (let i = 0; i < nk; i++) breakStates.push(BREAKS[v.getUint8(o++)] ?? 'intact');
  return { epoch, tick, roundTime, phase, round, scores, points, lives, hillIndex, potatoHolder, potatoTimer, chars, bodies, propActive, breakStates };
}
