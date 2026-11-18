import type { ArenaDef } from '../../sim/arena';
import { arenaById, ARENAS } from '../../sim/arenas';
import type { BreakState } from '../../sim/arenaRuntime';
import { PHYSICS } from '../../sim/config';
import type { SimEvent } from '../../sim/events';
import type { PlayerInput } from '../../sim/input';
import type { Vec3 } from '../../sim/math';
import { PART_COUNT } from '../../sim/ragdoll';
import type { RoundPhase } from '../../sim/rules';
import type { FighterView, RulesView, WorldView } from '../../sim/view';
import { buttonMask, decodeSnapshot, encodeInput } from '../../net/codec';
import type { CharSnap, Snapshot } from '../../net/codec';
import type { SlotInfo } from '../../net/protocol';
import { SNAPSHOT_EVERY } from '../../net/protocol';
import type { NetClient } from './netClient';

/** Render this far behind the newest server state, so there's always a pair to interpolate. */
const INTERP_TICKS = 7; // ≈ 117 ms at 60 Hz
const SERVER_HZ = 60;

class NetFighter implements FighterView {
  state: FighterView['state'] = 'active';
  daze = 0;
  stamina = 100;
  exhausted = false;
  koTimer = 0;
  hurtTimer = 0;
  effort = 0;
  airTime = 0;
  liftedBy = -1;
  hanging = false;
  torsoPos: Vec3 = { x: 0, y: 1, z: 0 };
  get alive(): boolean {
    return this.state !== 'eliminated';
  }
  apply(c: CharSnap): void {
    this.state = c.state;
    this.daze = c.daze;
    this.stamina = c.stamina;
    this.exhausted = c.exhausted;
    this.koTimer = c.koTimer;
    this.hurtTimer = c.hurt ? 0.3 : 0;
    this.effort = c.effort ? 1 : 0;
    this.airTime = c.scared ? 1 : 0;
    this.hanging = c.hanging;
  }
}

/** Client-side replica of the server's world, rebuilt from interpolated snapshots. */
export class NetWorld implements WorldView {
  readonly characters: NetFighter[];
  readonly killY: number;
  rules: RulesView = { phase: 'countdown' as RoundPhase, round: 1, scores: [], roundTime: 0 };
  prevSnap: Float32Array;
  currSnap: Float32Array;
  private propsActive: boolean[] = [];
  private breaks: BreakState[] = [];
  private nChars: number;
  private nProps: number;
  private nMovers: number;

  constructor(
    readonly arena: ArenaDef,
    players: number,
  ) {
    this.killY = arena.killY ?? PHYSICS.killY;
    this.nChars = players;
    this.nProps = arena.props.length + (arena.dropPool?.length ?? 0);
    this.nMovers = arena.movers?.length ?? 0;
    const nb = players * PART_COUNT + this.nProps + this.nMovers + (arena.breakables?.length ?? 0);
    this.prevSnap = new Float32Array(nb * 7);
    this.currSnap = new Float32Array(nb * 7);
    this.characters = Array.from({ length: players }, () => new NetFighter());
    this.propsActive = [...arena.props.map(() => true), ...(arena.dropPool ?? []).map(() => false)];
  }

  get bodyCount(): number {
    return this.currSnap.length / 7;
  }

  partOffset(c: number, p: number): number {
    return (c * PART_COUNT + p) * 7;
  }
  propOffset(i: number): number {
    return (this.nChars * PART_COUNT + i) * 7;
  }
  moverOffset(i: number): number {
    return (this.nChars * PART_COUNT + this.nProps + i) * 7;
  }
  breakableOffset(i: number): number {
    return (this.nChars * PART_COUNT + this.nProps + this.nMovers + i) * 7;
  }
  propActive(i: number): boolean {
    return this.propsActive[i] ?? false;
  }
  breakState(i: number): BreakState {
    return this.breaks[i] ?? 'intact';
  }

  /** Show the state between snapshots a and b. */
  apply(a: Snapshot, b: Snapshot, alpha: number): void {
    this.prevSnap.set(a.bodies.subarray(0, this.prevSnap.length));
    this.currSnap.set(b.bodies.subarray(0, this.currSnap.length));
    const latest = alpha > 0.5 ? b : a;
    b.chars.forEach((c, i) => this.characters[i]?.apply(c));
    this.rules = { phase: latest.phase, round: latest.round, scores: latest.scores, roundTime: latest.roundTime };
    this.propsActive = latest.propActive;
    this.breaks = latest.breakStates;
    // Torso positions for the camera / name tags (torso is part 1).
    this.characters.forEach((f, i) => {
      const o = this.partOffset(i, 1);
      const p = this.prevSnap;
      const q = this.currSnap;
      f.torsoPos = { x: p[o] + (q[o] - p[o]) * alpha, y: p[o + 1] + (q[o + 1] - p[o + 1]) * alpha, z: p[o + 2] + (q[o + 2] - p[o + 2]) * alpha };
    });
  }
}

/**
 * An online match as seen by this client: buffers snapshots, keeps a smoothed
 * estimate of the server clock, interpolates, releases events in sync and
 * sends our inputs.
 */
export class NetMatch {
  world: NetWorld;
  epoch: number;
  alpha = 0;
  private buffer: Snapshot[] = [];
  private eventQueue: { tick: number; events: SimEvent[] }[] = [];
  /** serverTick ≈ now(ms) * 0.06 + offset */
  private offset: number | null = null;
  private seq = 0;
  private lastMask = 0;
  private lastMove = '';
  private lastSend = 0;
  private pendingPress = 0;

  constructor(
    private readonly net: NetClient,
    arenaId: string,
    epoch: number,
    readonly slots: SlotInfo[],
    /** Our fighter index, or -1 when spectating. */
    readonly you: number,
  ) {
    this.epoch = epoch;
    this.world = new NetWorld(arenaById(arenaId) ?? ARENAS[0], slots.length);
  }

  /** The server moved the match to another map. */
  changeArena(arenaId: string, epoch: number): void {
    this.epoch = epoch;
    this.world = new NetWorld(arenaById(arenaId) ?? ARENAS[0], this.slots.length);
    this.buffer = [];
    this.eventQueue = [];
  }

  onSnapshot(buf: ArrayBuffer): void {
    const s = decodeSnapshot(buf);
    if (!s || s.epoch !== this.epoch || s.bodies.length !== this.world.currSnap.length) return;
    const last = this.buffer[this.buffer.length - 1];
    if (last && s.tick <= last.tick) return;
    this.buffer.push(s);
    if (this.buffer.length > 40) this.buffer.splice(0, this.buffer.length - 40);
    const target = s.tick - performance.now() * (SERVER_HZ / 1000);
    if (this.offset === null || Math.abs(target - this.offset) > 30) this.offset = target;
    // Only ever drift slowly towards the newest estimate (jitter-tolerant).
    else this.offset += (target - this.offset) * 0.05;
  }

  onEvents(epoch: number, tick: number, events: SimEvent[]): void {
    if (epoch !== this.epoch) return;
    this.eventQueue.push({ tick, events });
  }

  /** Advance interpolation; returns events that are now due. */
  update(): SimEvent[] {
    if (this.offset === null || this.buffer.length === 0) return [];
    const renderTick = performance.now() * (SERVER_HZ / 1000) + this.offset - INTERP_TICKS;
    let a = this.buffer[0];
    let b = this.buffer[0];
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].tick <= renderTick) a = this.buffer[i];
      if (this.buffer[i].tick >= renderTick) {
        b = this.buffer[i];
        break;
      }
      b = this.buffer[i];
    }
    const span = b.tick - a.tick;
    this.alpha = span > 0 ? Math.max(0, Math.min(1, (renderTick - a.tick) / span)) : 1;
    this.world.apply(a, b, this.alpha);
    // Drop snapshots we'll never need again.
    while (this.buffer.length > 2 && this.buffer[1].tick < renderTick - SNAPSHOT_EVERY * 2) this.buffer.shift();
    const due: SimEvent[] = [];
    while (this.eventQueue.length && this.eventQueue[0].tick <= renderTick) due.push(...this.eventQueue.shift()!.events);
    return due;
  }

  /** Send our input if it changed (or as a 10 Hz keep-alive). */
  sendInput(inp: PlayerInput): void {
    if (this.you < 0) return;
    const mask = buttonMask(inp);
    this.pendingPress |= mask & ~this.lastMask;
    const move = `${Math.round(inp.moveX * 127)},${Math.round(inp.moveZ * 127)}`;
    const now = performance.now();
    if (mask === this.lastMask && move === this.lastMove && now - this.lastSend < 100) return;
    this.net.sendBinary(encodeInput(this.seq++, inp, this.pendingPress));
    this.pendingPress = 0;
    this.lastMask = mask;
    this.lastMove = move;
    this.lastSend = now;
  }

  /** How far behind real time we're rendering (ms), for the stats readout. */
  get delayMs(): number {
    return (INTERP_TICKS / SERVER_HZ) * 1000;
  }
}
