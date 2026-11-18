import { GameSim } from '../src/sim/game';
import { ARENAS, arenaById } from '../src/sim/arenas';
import type { ArenaDef } from '../src/sim/arena';
import { Bot } from '../src/sim/bot';
import type { SimEvent } from '../src/sim/events';
import { decodeInput, encodeSnapshot, toPlayerInput } from '../src/net/codec';
import type { MemberInfo, RoomInfo, RoomSettings, ServerMsg, SlotInfo } from '../src/net/protocol';
import { AUTO_START_SECONDS, MAX_ROOM, SNAPSHOT_EVERY } from '../src/net/protocol';
import type { Conn } from './conn';

const FIGHTER_COUNT = 6;
const DT = 1 / 60;
/** Seconds after the match-winner banner before everyone returns to the lobby. */
const RESULTS_TIME = 6;

interface Member {
  conn: Conn;
  ready: boolean;
  spectating: boolean;
  vote: string | null;
}

interface Slot {
  name: string;
  fighter: number;
  memberId: string | null;
  conn: Conn | null;
  bot: Bot | null;
  moveX: number;
  moveZ: number;
  held: number;
  latch: number;
}

/** A running match: the authoritative simulation plus who controls each fighter. */
class Match {
  sim: GameSim;
  epoch = 0;
  slots: Slot[];
  private acc = 0;
  private events: SimEvent[] = [];
  endAt: number | null = null;
  private rotation: ArenaDef[];

  constructor(
    private readonly room: Room,
    arena: ArenaDef,
    slots: Slot[],
    rotate: boolean,
  ) {
    this.slots = slots;
    const start = ARENAS.indexOf(arena);
    this.rotation = ARENAS.map((_, i) => ARENAS[(start + i) % ARENAS.length]);
    this.sim = this.makeSim(arena, rotate);
    this.events.push(...this.sim.drainEvents());
  }

  private makeSim(arena: ArenaDef, rotate: boolean, resume?: { round: number; scores: number[] }): GameSim {
    return new GameSim({
      arena,
      players: this.slots.length,
      seed: (Math.random() * 1e9) | 0,
      resume,
      nextArena: rotate ? (round) => this.rotation[(round - 1) % this.rotation.length] : undefined,
    });
  }

  slotInfo(): SlotInfo[] {
    return this.slots.map((s) => ({ name: s.name, fighter: s.fighter, memberId: s.memberId, bot: !!s.bot }));
  }

  input(conn: Conn, data: Uint8Array): void {
    const slot = this.slots.find((s) => s.conn === conn);
    const inp = decodeInput(data);
    if (!slot || !inp) return;
    slot.moveX = inp.moveX;
    slot.moveZ = inp.moveZ;
    slot.held = inp.held;
    slot.latch |= inp.pressed;
  }

  /** A player left mid-match: a bot takes over their fighter. */
  detach(conn: Conn): void {
    this.slots.forEach((s, i) => {
      if (s.conn !== conn) return;
      s.conn = null;
      s.bot = new Bot(i, (Math.random() * 1e9) | 0, 0.55);
      this.events.push({ type: 'warning', text: `${s.name} left — a bot takes over` });
    });
  }

  get humans(): number {
    return this.slots.filter((s) => s.conn).length;
  }

  update(dt: number, now: number): void {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 4) {
      this.acc -= DT;
      steps++;
      const sim = this.sim;
      const inputs = this.slots.map((s) => {
        if (s.bot) return s.bot.think(sim, DT);
        const inp = toPlayerInput(s.moveX, s.moveZ, s.held | s.latch);
        s.latch = 0;
        return inp;
      });
      sim.step(inputs);
      for (const ev of sim.drainEvents()) {
        this.events.push(ev);
        if (ev.type === 'matchEnd') this.endAt = now + RESULTS_TIME * 1000;
      }
      if (sim.pendingArena) {
        const { arena, resume } = sim.pendingArena;
        sim.dispose();
        this.epoch = (this.epoch + 1) & 0xff;
        this.sim = this.makeSim(arena, true, resume);
        this.slots.forEach((s, i) => {
          if (s.bot) s.bot = new Bot(i, (Math.random() * 1e9) | 0, 0.55);
        });
        this.room.broadcast({ t: 'arena', arena: arena.id, epoch: this.epoch });
        this.events.push(...this.sim.drainEvents());
      }
      if (this.sim.tick % SNAPSHOT_EVERY === 0) this.flush();
    }
    if (this.acc > DT * 8) this.acc = 0; // fell far behind: drop time
  }

  private flush(): void {
    if (this.events.length) {
      this.room.broadcast({ t: 'events', epoch: this.epoch, tick: this.sim.tick, events: this.events });
      this.events = [];
    }
    this.room.broadcastBinary(encodeSnapshot(this.sim, this.epoch));
  }

  dispose(): void {
    this.sim.dispose();
  }
}

/** A lobby (and, while playing, its match). Players stay in the room between matches. */
export class Room {
  readonly members: Member[] = [];
  settings: RoomSettings = { bots: 0, mapMode: 'vote' };
  state: 'lobby' | 'playing' = 'lobby';
  match: Match | null = null;
  private autoStartAt: number | null = null;
  private dirty = true;

  constructor(
    readonly code: string,
    readonly isPrivate: boolean,
  ) {
    if (!isPrivate) this.settings.bots = 2;
  }

  get hostId(): string | null {
    return this.members[0]?.conn.id ?? null;
  }

  get empty(): boolean {
    return this.members.length === 0;
  }

  get full(): boolean {
    return this.members.length >= MAX_ROOM;
  }

  has(conn: Conn): boolean {
    return this.members.some((m) => m.conn === conn);
  }

  add(conn: Conn): void {
    if (this.has(conn)) return;
    this.members.push({ conn, ready: false, spectating: this.state === 'playing', vote: null });
    conn.room = this;
    this.dirty = true;
    if (this.match) {
      conn.send({ t: 'matchStart', arena: this.match.sim.arena.id, epoch: this.match.epoch, slots: this.match.slotInfo(), you: -1 });
    }
  }

  remove(conn: Conn): void {
    const i = this.members.findIndex((m) => m.conn === conn);
    if (i < 0) return;
    this.members.splice(i, 1);
    conn.room = null;
    this.match?.detach(conn);
    this.dirty = true;
    if (this.match && this.match.humans === 0) this.endMatch();
  }

  info(): RoomInfo {
    const votes: Record<string, string[]> = {};
    for (const a of ARENAS) votes[a.id] = [];
    for (const m of this.members) if (m.vote && votes[m.vote]) votes[m.vote].push(m.conn.id);
    const members: MemberInfo[] = this.members.map((m, i) => ({
      id: m.conn.id,
      name: m.conn.name,
      fighter: m.conn.fighter,
      ready: m.ready,
      host: i === 0,
      spectating: m.spectating,
      friendCode: m.conn.friendCode,
    }));
    return {
      code: this.code,
      private: this.isPrivate,
      state: this.state,
      members,
      settings: { ...this.settings },
      votes,
      autoStartIn: this.autoStartAt ? Math.max(0, Math.ceil((this.autoStartAt - Date.now()) / 1000)) : null,
    };
  }

  broadcast(msg: ServerMsg): void {
    for (const m of this.members) m.conn.send(msg);
  }

  broadcastBinary(buf: ArrayBuffer): void {
    for (const m of this.members) m.conn.sendBinary(buf);
  }

  markDirty(): void {
    this.dirty = true;
  }

  // -------------------------------------------------------------- lobby actions
  setReady(conn: Conn, ready: boolean): void {
    const m = this.members.find((x) => x.conn === conn);
    if (!m || this.state !== 'lobby') return;
    m.ready = ready;
    this.dirty = true;
  }

  vote(conn: Conn, map: string): void {
    const m = this.members.find((x) => x.conn === conn);
    if (!m || !arenaById(map)) return;
    m.vote = m.vote === map ? null : map;
    this.dirty = true;
  }

  applySettings(conn: Conn, s: Partial<RoomSettings>): string | null {
    if (conn.id !== this.hostId) return 'Only the host can change settings.';
    if (typeof s.bots === 'number' && Number.isFinite(s.bots)) this.settings.bots = Math.max(0, Math.min(MAX_ROOM - 1, Math.round(s.bots)));
    if (s.mapMode === 'vote' || s.mapMode === 'rotate') this.settings.mapMode = s.mapMode;
    this.dirty = true;
    return null;
  }

  kick(conn: Conn, id: string): Conn | null {
    if (conn.id !== this.hostId || id === conn.id) return null;
    const m = this.members.find((x) => x.conn.id === id);
    if (!m) return null;
    this.remove(m.conn);
    return m.conn;
  }

  /** Fighters a match would have right now: players (not spectating) plus bots. */
  fighterCount(): number {
    const humans = this.members.length;
    return humans + Math.min(this.settings.bots, MAX_ROOM - humans);
  }

  start(conn: Conn | null): string | null {
    if (this.state !== 'lobby') return 'A match is already running.';
    if (conn && conn.id !== this.hostId) return 'Only the host can start the match.';
    if (this.fighterCount() < 2) return 'You need at least two fighters — invite a friend or add a bot.';
    // Map: most votes wins, ties (or no votes) are broken randomly.
    const counts = new Map<string, number>();
    for (const m of this.members) if (m.vote) counts.set(m.vote, (counts.get(m.vote) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    let pool = ARENAS.filter((a) => (counts.get(a.id) ?? 0) === best);
    if (best === 0) pool = ARENAS;
    const arena = pool[Math.floor(Math.random() * pool.length)];

    const used = new Set<number>();
    const slots: Slot[] = this.members.map((m) => {
      // Two players on the same fighter would be indistinguishable: give the later one the next free look.
      let f = m.conn.fighter;
      while (used.has(f) && used.size < FIGHTER_COUNT) f = (f + 1) % FIGHTER_COUNT;
      used.add(f);
      m.spectating = false;
      return { name: m.conn.name, fighter: f, memberId: m.conn.id, conn: m.conn, bot: null, moveX: 0, moveZ: 0, held: 0, latch: 0 };
    });
    const bots = Math.min(this.settings.bots, MAX_ROOM - slots.length);
    const botNames = ['Bot Bonk', 'Bot Wobble', 'Bot Splat', 'Bot Squish', 'Bot Thud', 'Bot Plop', 'Bot Boing'];
    for (let b = 0; b < bots; b++) {
      let f = 0;
      while (used.has(f) && f < FIGHTER_COUNT - 1) f++;
      used.add(f);
      const index = slots.length;
      slots.push({ name: botNames[b % botNames.length], fighter: f, memberId: null, conn: null, bot: new Bot(index, (Math.random() * 1e9) | 0, 0.45 + Math.random() * 0.3), moveX: 0, moveZ: 0, held: 0, latch: 0 });
    }
    this.match = new Match(this, arena, slots, this.settings.mapMode === 'rotate');
    this.state = 'playing';
    this.autoStartAt = null;
    this.match.slots.forEach((s, i) => {
      s.conn?.send({ t: 'matchStart', arena: arena.id, epoch: 0, slots: this.match!.slotInfo(), you: i });
    });
    this.dirty = true;
    return null;
  }

  endMatch(): void {
    if (!this.match) return;
    this.match.dispose();
    this.match = null;
    this.state = 'lobby';
    for (const m of this.members) {
      m.ready = false;
      m.spectating = false;
    }
    this.broadcast({ t: 'matchOver' });
    this.dirty = true;
  }

  input(conn: Conn, data: Uint8Array): void {
    this.match?.input(conn, data);
  }

  // --------------------------------------------------------------------- tick
  update(dt: number, now: number): void {
    if (this.match) {
      this.match.update(dt, now);
      if (this.match.endAt !== null && now >= this.match.endAt) this.endMatch();
    } else if (!this.isPrivate) {
      // Public rooms start themselves once 2+ players are all ready.
      const allReady = this.members.length >= 2 && this.members.every((m) => m.ready);
      if (allReady && this.autoStartAt === null) {
        this.autoStartAt = now + AUTO_START_SECONDS * 1000;
        this.dirty = true;
      } else if (!allReady && this.autoStartAt !== null) {
        this.autoStartAt = null;
        this.dirty = true;
      } else if (this.autoStartAt !== null) {
        if (now >= this.autoStartAt) this.start(null);
        else if (Math.ceil((this.autoStartAt - now) / 1000) !== Math.ceil((this.autoStartAt - now - dt * 1000) / 1000)) this.dirty = true;
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.broadcast({ t: 'room', room: this.info() });
    }
  }
}
