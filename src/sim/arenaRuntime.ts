import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { RAPIER, envGroups } from './physics';
import type { ArenaDef, ArenaEvent, BreakableDef, Box3, MoverDef, MoverMotion, PropDef, StaticPiece } from './arena';
import { pieceRotation } from './arena';
import type { Owner, SimContext } from './character';
import type { Quat, Vec3 } from './math';
import { len, sub } from './math';

type RigidBody = RAPIER_NS.RigidBody;
type Collider = RAPIER_NS.Collider;

/** What the runtime needs from the game simulation. */
export interface ArenaHost extends SimContext {
  props: { index: number; def: PropDef; body: RigidBody; active: boolean; pool: boolean; velPre: Vec3 }[];
  recycleProp(index: number): void;
  registerCollider(c: Collider, owner: Owner): void;
  registerBody(b: RigidBody, owner: Owner): void;
  /** Seconds into the current fight (events are scheduled on this clock); null when the arena should be idle. */
  arenaClock(): number | null;
  activateProp(index: number, pos: Vec3, vel: Vec3): void;
}

export interface MoverRT {
  def: MoverDef;
  body: RigidBody;
  /** Scaled motion time. */
  t: number;
  speedScale: number;
  targetScale: number;
  pos: Vec3;
  rot: Quat;
  /** Velocity of the origin over the last step. */
  vel: Vec3;
  sweeping: boolean;
  sweepT: number;
}

export type BreakState = 'intact' | 'shaking' | 'falling' | 'gone';

export interface BreakableRT {
  def: BreakableDef;
  body: RigidBody;
  collider: Collider;
  state: BreakState;
  standTime: number;
  timer: number;
}

interface EventRT {
  def: ArenaEvent;
  next: number;
  scale: number;
  /** Pending warning for sweeps: fire the sweep at this time. */
  pendingAt: number;
  started: boolean;
}

const ID: Quat = { x: 0, y: 0, z: 0, w: 1 };

function axisQuat(axis: 'x' | 'y' | 'z', angle: number): Quat {
  const s = Math.sin(angle / 2);
  const c = Math.cos(angle / 2);
  return axis === 'x' ? { x: s, y: 0, z: 0, w: c } : axis === 'y' ? { x: 0, y: s, z: 0, w: c } : { x: 0, y: 0, z: s, w: c };
}

export function inBox(p: Vec3, b: Box3, pad = 0): boolean {
  return (
    p.x >= b.min.x - pad && p.x <= b.max.x + pad && p.y >= b.min.y - pad && p.y <= b.max.y + pad && p.z >= b.min.z - pad && p.z <= b.max.z + pad
  );
}

/** Build a collider description for a static piece (position relative to its body). */
export function pieceCollider(p: StaticPiece): RAPIER_NS.ColliderDesc {
  const desc =
    p.kind === 'box' ? RAPIER.ColliderDesc.cuboid(p.half.x, p.half.y, p.half.z) : RAPIER.ColliderDesc.cylinder(p.halfHeight, p.radius);
  desc.setTranslation(p.pos.x, p.pos.y, p.pos.z).setRotation(pieceRotation(p));
  desc.setFriction(p.kind === 'box' ? (p.friction ?? 0.8) : 0.8);
  desc.setCollisionGroups(envGroups());
  return desc;
}

/** Path timeline: legs between points plus pauses, for 'path' movers. */
interface Leg {
  from: Vec3;
  to: Vec3;
  t0: number;
  dur: number;
}

function buildPath(m: Extract<MoverMotion, { type: 'path' }>): { legs: Leg[]; cycle: number } {
  const pts = m.mode === 'pingpong' ? [...m.points, ...m.points.slice(0, -1).reverse()] : [...m.points, m.points[0]];
  const legs: Leg[] = [];
  let t = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = len(sub(pts[i + 1], pts[i]));
    const dur = d / m.speed;
    legs.push({ from: pts[i], to: pts[i + 1], t0: t, dur });
    t += dur + (m.pause ?? 0);
  }
  return { legs, cycle: t };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Everything that makes an arena more than static scenery: moving platforms and
 * machinery, breakable pieces, hazard zones and timed events.
 */
export class ArenaRuntime {
  readonly movers: MoverRT[] = [];
  readonly breakables: BreakableRT[] = [];
  private events: EventRT[] = [];
  private surfaceVel = new Map<number, Vec3>();
  private breakableByCollider = new Map<number, BreakableRT>();
  private paths = new Map<MoverRT, { legs: Leg[]; cycle: number }>();
  private lastBounce = new Map<number, number>();
  private lastCrush = new Map<number, number>();
  /** Temporary global accelerations (swerves, gusts). */
  private pushes: { accel: Vec3; until: number }[] = [];
  private clockPrev = 0;
  private nextDrop = 0;

  constructor(
    private readonly host: ArenaHost,
    readonly arena: ArenaDef,
  ) {
    const world = host.world;
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    host.registerBody(fixed, { kind: 'env' });
    for (const piece of arena.pieces) {
      if (piece.visualOnly) continue;
      const c = world.createCollider(pieceCollider(piece), fixed);
      host.registerCollider(c, { kind: 'env' });
      if (piece.kind === 'box' && piece.surfaceVel) this.surfaceVel.set(c.handle, piece.surfaceVel);
    }

    for (const def of arena.movers ?? []) {
      const pose = this.initialPose(def);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pose.pos.x, pose.pos.y, pose.pos.z).setRotation(pose.rot),
      );
      host.registerBody(body, { kind: 'env' });
      for (const piece of def.parts) {
        if (piece.visualOnly) continue;
        const c = world.createCollider(pieceCollider(piece), body);
        host.registerCollider(c, { kind: 'env' });
      }
      const rt: MoverRT = { def, body, t: 0, speedScale: 1, targetScale: 1, pos: pose.pos, rot: pose.rot, vel: { x: 0, y: 0, z: 0 }, sweeping: false, sweepT: 0 };
      if (def.motion.type === 'path') this.paths.set(rt, buildPath(def.motion));
      this.movers.push(rt);
    }

    for (const def of arena.breakables ?? []) {
      const p = def.piece;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.pos.x, p.pos.y, p.pos.z).setRotation(pieceRotation(p)));
      host.registerBody(body, { kind: 'env' });
      const desc = RAPIER.ColliderDesc.cuboid(p.half.x, p.half.y, p.half.z)
        .setFriction(p.friction ?? 0.8)
        .setMass(def.mass ?? 10)
        .setCollisionGroups(envGroups())
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const collider = world.createCollider(desc, body);
      host.registerCollider(collider, { kind: 'env' });
      const rt: BreakableRT = { def, body, collider, state: 'intact', standTime: 0, timer: 0 };
      this.breakables.push(rt);
      this.breakableByCollider.set(collider.handle, rt);
    }
    this.scheduleEvents();
  }

  // ------------------------------------------------------------------ queries
  surfaceVelocity(collider: Collider): Vec3 | null {
    return this.surfaceVel.get(collider.handle) ?? null;
  }

  mover(id: string): MoverRT | undefined {
    return this.movers.find((m) => m.def.id === id);
  }

  // ------------------------------------------------------------------- movers
  private initialPose(def: MoverDef): { pos: Vec3; rot: Quat } {
    if (def.motion.type === 'sweep') {
      const f = def.motion.from;
      return { pos: { x: def.origin.x + f.x, y: def.origin.y + f.y, z: def.origin.z + f.z }, rot: ID };
    }
    return this.pose(def, 0, null);
  }

  private pose(def: MoverDef, t: number, rt: MoverRT | null): { pos: Vec3; rot: Quat } {
    const o = def.origin;
    const m = def.motion;
    const at = (d: Vec3) => ({ x: o.x + d.x, y: o.y + d.y, z: o.z + d.z });
    switch (m.type) {
      case 'spin':
        return { pos: o, rot: axisQuat(m.axis, m.speed * t) };
      case 'swing':
        return { pos: o, rot: axisQuat(m.axis, m.amplitude * Math.sin(((t / m.period + (m.phase ?? 0)) * Math.PI * 2))) };
      case 'orbit': {
        const a = (t / m.period + (m.phase ?? 0)) * Math.PI * 2 - Math.PI / 2;
        const off = m.axis === 'z' ? { x: Math.cos(a) * m.radius, y: Math.sin(a) * m.radius, z: 0 } : { x: 0, y: Math.sin(a) * m.radius, z: Math.cos(a) * m.radius };
        return { pos: at(off), rot: ID };
      }
      case 'sway': {
        const w = ((t / m.period + (m.phase ?? 0)) * Math.PI * 2);
        return { pos: at({ x: m.amplitude.x * Math.sin(w), y: m.amplitude.y * Math.sin(w * 2), z: m.amplitude.z * Math.sin(w * 1.7 + 1) }), rot: ID };
      }
      case 'piston': {
        const u = ((((t / m.period + (m.phase ?? 0)) % 1) + 1) % 1) * m.period;
        const start = m.period - (m.slam + m.hold + m.rise);
        let f = 0;
        if (u >= start) {
          const v = u - start;
          if (v < m.slam) f = (v / m.slam) ** 2;
          else if (v < m.slam + m.hold) f = 1;
          else f = 1 - smooth((v - m.slam - m.hold) / m.rise);
        }
        return { pos: at({ x: m.offset.x * f, y: m.offset.y * f, z: m.offset.z * f }), rot: ID };
      }
      case 'path': {
        const p = rt ? this.paths.get(rt)! : buildPath(m);
        if (p.cycle <= 0) return { pos: o, rot: ID };
        const u = ((t % p.cycle) + p.cycle) % p.cycle;
        let leg = p.legs[p.legs.length - 1];
        for (const l of p.legs) if (u >= l.t0) leg = l;
        const k = smooth(Math.min(1, (u - leg.t0) / Math.max(leg.dur, 1e-6)));
        return { pos: at({ x: leg.from.x + (leg.to.x - leg.from.x) * k, y: leg.from.y + (leg.to.y - leg.from.y) * k, z: leg.from.z + (leg.to.z - leg.from.z) * k }), rot: ID };
      }
      case 'sweep': {
        const d = sub(m.to, m.from);
        const dist = len(d);
        const k = rt && rt.sweeping ? Math.min(1, (rt.sweepT * m.speed) / dist) : 0;
        return { pos: at({ x: m.from.x + d.x * k, y: m.from.y + d.y * k, z: m.from.z + d.z * k }), rot: ID };
      }
    }
  }

  private updateMovers(dt: number, running: boolean): void {
    for (const m of this.movers) {
      m.speedScale += (m.targetScale - m.speedScale) * Math.min(1, dt * 0.8);
      if (running || m.def.motion.type === 'spin') m.t += dt * m.speedScale;
      if (m.sweeping) {
        m.sweepT += dt;
        const mo = m.def.motion as Extract<MoverMotion, { type: 'sweep' }>;
        if (m.sweepT * mo.speed >= len(sub(mo.to, mo.from))) {
          m.sweeping = false;
          m.sweepT = 0;
        }
      }
      const pose = this.pose(m.def, m.t, m);
      m.vel = { x: (pose.pos.x - m.pos.x) / dt, y: (pose.pos.y - m.pos.y) / dt, z: (pose.pos.z - m.pos.z) / dt };
      // A parked sweep jumping back to the start is a teleport, not motion.
      if (len(m.vel) > 60) {
        m.body.setTranslation(pose.pos, true);
        m.vel = { x: 0, y: 0, z: 0 };
      }
      m.pos = pose.pos;
      m.rot = pose.rot;
      m.body.setNextKinematicTranslation(pose.pos);
      m.body.setNextKinematicRotation(pose.rot);
    }
  }

  // ------------------------------------------------------------------- events
  private scheduleEvents(): void {
    this.events = (this.arena.events ?? []).map((def) => ({ def, next: def.start, scale: 1, pendingAt: -1, started: false }));
    this.clockPrev = 0;
  }

  private interval(e: EventRT): number {
    const d = e.def;
    if (!('every' in d)) return Infinity;
    const [a, b] = d.every;
    return (a + (b - a) * this.host.rng()) * e.scale;
  }

  private runEvents(clock: number): void {
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      const d = e.def;
      if (d.kind === 'sweep' && e.pendingAt >= 0 && clock >= e.pendingAt) {
        const m = this.mover(d.mover);
        if (m) {
          m.sweeping = true;
          m.sweepT = 0;
        }
        e.pendingAt = -1;
      }
      if (clock < e.next) continue;
      switch (d.kind) {
        case 'drop':
          this.dropProp(d);
          e.next = clock + this.interval(e);
          break;
        case 'swerve': {
          const dir = this.host.rng() < 0.5 ? -1 : 1;
          this.pushes.push({ accel: { x: 0, y: 0, z: d.accel * dir }, until: clock + d.duration });
          if (d.warn) this.host.emit({ type: 'warning', text: d.warn });
          this.host.emit({ type: 'swerve', dir });
          e.next = clock + this.interval(e);
          break;
        }
        case 'gust': {
          const a = this.host.rng() * Math.PI * 2;
          const accel = { x: Math.cos(a) * d.accel, y: 0, z: Math.sin(a) * d.accel * 0.6 };
          this.pushes.push({ accel, until: clock + d.duration });
          if (d.warn) this.host.emit({ type: 'warning', text: d.warn });
          this.host.emit({ type: 'gust', dir: accel });
          e.next = clock + this.interval(e);
          break;
        }
        case 'sweep':
          if (d.warn) this.host.emit({ type: 'warning', text: d.warn });
          this.host.emit({ type: 'sweepWarning', mover: d.mover });
          e.pendingAt = clock + d.warnTime;
          e.next = clock + d.warnTime + this.interval(e);
          break;
        case 'collapse': {
          if (!e.started) {
            e.started = true;
            if (d.warn) this.host.emit({ type: 'warning', text: d.warn });
          }
          const target = this.breakables.find((b) => d.breakables.includes(b.def.id) && b.state === 'intact');
          if (target) this.startShaking(target);
          e.next = target ? clock + d.interval : Infinity;
          break;
        }
        case 'speed': {
          const m = this.mover(d.mover);
          if (m) m.targetScale = d.scale;
          if (d.warn) this.host.emit({ type: 'warning', text: d.warn });
          e.next = Infinity;
          break;
        }
        case 'intensify': {
          const t = this.events[d.target];
          if (t) t.scale *= d.scale;
          if (d.warn) this.host.emit({ type: 'warning', text: d.warn });
          e.next = Infinity;
          break;
        }
      }
    }
  }

  private dropProp(d: Extract<ArenaEvent, { kind: 'drop' }>): void {
    const pool = this.host.props.filter((p) => p.pool);
    if (!pool.length) return;
    const p = pool.find((q) => !q.active) ?? pool[this.nextDrop++ % pool.length];
    let x: number;
    let z: number;
    const m = d.fromMover ? this.mover(d.fromMover) : undefined;
    if (m) {
      x = m.pos.x;
      z = m.pos.z;
    } else {
      const alive = this.host.characters.filter((c) => c.alive);
      const target = alive[Math.floor(this.host.rng() * alive.length)];
      const tp = target ? target.torsoPos : { x: 0, y: 0, z: 0 };
      x = tp.x + (this.host.rng() - 0.5) * 2;
      z = tp.z + (this.host.rng() - 0.5) * 2;
    }
    this.host.activateProp(p.index, { x, y: d.height, z }, { x: 0, y: -1, z: 0 });
    this.host.emit({ type: 'drop', pos: { x, y: this.arena.bounds.floorY, z } });
  }

  // --------------------------------------------------------------- breakables
  private startShaking(b: BreakableRT): void {
    if (b.state !== 'intact') return;
    b.state = 'shaking';
    b.timer = 0.6;
    this.host.emit({ type: 'creak', pos: b.def.piece.pos });
  }

  private breakNow(b: BreakableRT): void {
    if (b.state === 'falling' || b.state === 'gone') return;
    const p = b.def.piece;
    if (b.def.mode === 'shatter') {
      b.state = 'gone';
      b.body.setEnabled(false);
      this.host.emit({ type: 'shatter', pos: p.pos, half: p.half });
    } else {
      b.state = 'falling';
      b.timer = 5;
      b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      b.body.applyTorqueImpulse({ x: (this.host.rng() - 0.5) * 6, y: 0, z: (this.host.rng() - 0.5) * 6 }, true);
      this.host.emit({ type: 'break', pos: p.pos });
    }
  }

  /** Collision callback: something hit collider `a`. */
  onCollision(a: number, otherVel: Vec3 | null): void {
    const b = this.breakableByCollider.get(a);
    if (!b || b.state !== 'intact' || b.def.trigger !== 'impact' || !otherVel) return;
    // Impact speed across the panel's thin axis.
    const h = b.def.piece.half;
    const speed = h.y <= h.x && h.y <= h.z ? Math.abs(otherVel.y) : h.x <= h.z ? Math.abs(otherVel.x) : Math.abs(otherVel.z);
    if (speed >= b.def.threshold) this.breakNow(b);
  }

  /** A fighter landed on `body` at `speed` m/s (jumping onto glass breaks it). */
  onLanding(body: RigidBody | null, speed: number): void {
    if (!body) return;
    const b = this.breakables.find((x) => x.body === body);
    if (b && b.state === 'intact' && b.def.trigger === 'impact' && speed >= b.def.threshold) this.breakNow(b);
  }

  breakableFor(collider: number): BreakableRT | undefined {
    return this.breakableByCollider.get(collider);
  }

  private updateBreakables(dt: number): void {
    for (const b of this.breakables) {
      if (b.state === 'intact' && b.def.trigger === 'stand') {
        const standing = this.host.characters.some((c) => c.alive && c.standingOn() === b.body);
        if (standing) {
          b.standTime += dt;
          if (b.standTime >= b.def.threshold) this.startShaking(b);
        }
      } else if (b.state === 'shaking') {
        b.timer -= dt;
        if (b.timer <= 0) this.breakNow(b);
      } else if (b.state === 'falling') {
        b.timer -= dt;
        if (b.timer <= 0 || b.body.translation().y < -30) {
          b.state = 'gone';
          b.body.setEnabled(false);
        }
      }
    }
  }

  // ------------------------------------------------------------------ hazards
  private applyAccel(accel: Vec3, dt: number, box?: Box3): void {
    for (const c of this.host.characters) {
      if (!c.alive) continue;
      if (box && !inBox(c.torsoPos, box)) continue;
      for (const p of c.rag.parts) p.body.applyImpulse({ x: accel.x * p.def.mass * dt, y: accel.y * p.def.mass * dt, z: accel.z * p.def.mass * dt }, true);
    }
    for (const p of this.host.props) {
      if (!p.active) continue;
      if (box && !inBox(p.body.translation(), box)) continue;
      const m = p.body.mass();
      p.body.applyImpulse({ x: accel.x * m * dt, y: accel.y * m * dt, z: accel.z * m * dt }, true);
    }
  }

  private updateHazards(dt: number, clock: number | null): void {
    void clock;
    for (const h of this.arena.hazards ?? []) {
      if (h.kind === 'wind') this.applyAccel(h.accel, dt, h.box);
      else if (h.kind === 'belt') {
        const k = Math.min(1, dt * 6);
        const drag = (b: RigidBody) => {
          const v = b.linvel();
          b.setLinvel({ x: v.x + (h.velocity.x - v.x) * k, y: v.y, z: v.z + (h.velocity.z - v.z) * k }, true);
        };
        for (const c of this.host.characters) {
          if (!c.alive) continue;
          for (const p of c.rag.parts) if (inBox(p.body.translation(), h.box)) drag(p.body);
        }
        for (const p of this.host.props) if (p.active && inBox(p.body.translation(), h.box)) drag(p.body);
      } else if (h.kind === 'bounce') {
        for (const c of this.host.characters) {
          if (!c.alive) continue;
          const feet = [c.part('shinL').body.translation(), c.part('shinR').body.translation(), c.part('pelvis').body.translation()];
          if (!feet.some((f) => inBox(f, h.box))) continue;
          const t = this.host.time;
          if ((this.lastBounce.get(c.index) ?? -9) > t - 0.4) continue;
          if (c.part('pelvis').body.linvel().y > 2) continue;
          this.lastBounce.set(c.index, t);
          for (const p of c.rag.parts) {
            const v = p.body.linvel();
            p.body.setLinvel({ x: v.x * 1.2, y: h.speed, z: v.z * 1.2 }, true);
          }
          c.hoverBreak(0.5);
          this.host.emit({ type: 'bounce', char: c.index, pos: c.part('pelvis').body.translation() });
        }
        for (const p of this.host.props) {
          if (!p.active || !inBox(p.body.translation(), h.box)) continue;
          const v = p.body.linvel();
          if (v.y < 1) p.body.setLinvel({ x: v.x, y: h.speed * 0.8, z: v.z }, true);
        }
      }
    }
    if (clock !== null) {
      this.pushes = this.pushes.filter((p) => p.until > clock);
      for (const p of this.pushes) this.applyAccel(p.accel, dt);
    }
  }

  /** Presses: knock out whoever is caught under a descending crusher. */
  private updateCrushers(clock: number): void {
    for (const m of this.movers) {
      const cr = m.def.crush;
      if (!cr || m.vel.y > -1.5) continue;
      const box: Box3 = {
        min: { x: m.pos.x + cr.min.x, y: m.pos.y + cr.min.y, z: m.pos.z + cr.min.z },
        max: { x: m.pos.x + cr.max.x, y: m.pos.y + cr.max.y, z: m.pos.z + cr.max.z },
      };
      for (const c of this.host.characters) {
        if (!c.alive) continue;
        const head = c.headPos;
        const torso = c.torsoPos;
        if (!inBox(head, box) && !inBox(torso, box)) continue;
        // Only when the press face is about to meet them.
        if (box.max.y - Math.max(head.y, torso.y) > 0.6) continue;
        if ((this.lastCrush.get(c.index) ?? -9) > clock - 1) continue;
        this.lastCrush.set(c.index, clock);
        c.crush(this.host);
        for (const p of c.rag.parts) p.body.applyImpulse({ x: 0, y: -p.def.mass * 4, z: 0 }, true);
        this.host.emit({ type: 'crush', char: c.index, pos: head });
      }
    }
  }

  /** Kill zones: grinders, water, roads, holes. */
  private updateKillZones(): void {
    for (const h of this.arena.hazards ?? []) {
      if (h.kind !== 'kill') continue;
      for (const c of this.host.characters) {
        if (!c.alive) continue;
        if (inBox(c.part('pelvis').body.translation(), h.box) || inBox(c.headPos, h.box)) c.eliminate(this.host, h.cause);
      }
      for (const p of this.host.props) {
        if (p.active && inBox(p.body.translation(), h.box)) this.host.recycleProp(p.index);
      }
    }
  }

  // ------------------------------------------------------------------ driving
  preStep(dt: number): void {
    const clock = this.host.arenaClock();
    const running = clock !== null;
    this.updateMovers(dt, running);
    if (running) {
      if (clock < this.clockPrev) this.scheduleEvents();
      this.clockPrev = clock;
      this.runEvents(clock);
      this.updateCrushers(clock);
    }
    this.updateHazards(dt, clock);
    this.updateBreakables(dt);
  }

  postStep(): void {
    this.updateKillZones();
  }

  /** Back to the start-of-round state. */
  reset(): void {
    for (const m of this.movers) {
      m.t = 0;
      m.speedScale = m.targetScale = 1;
      m.sweeping = false;
      m.sweepT = 0;
      const pose = this.initialPose(m.def);
      m.pos = pose.pos;
      m.rot = pose.rot;
      m.vel = { x: 0, y: 0, z: 0 };
      m.body.setTranslation(pose.pos, true);
      m.body.setRotation(pose.rot, true);
      m.body.setNextKinematicTranslation(pose.pos);
      m.body.setNextKinematicRotation(pose.rot);
    }
    for (const b of this.breakables) {
      const p = b.def.piece;
      b.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      b.body.setEnabled(true);
      b.body.setTranslation(p.pos, true);
      b.body.setRotation(pieceRotation(p), true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      b.state = 'intact';
      b.standTime = 0;
      b.timer = 0;
    }
    this.pushes = [];
    this.lastBounce.clear();
    this.lastCrush.clear();
    this.scheduleEvents();
  }

  /** Bodies whose transforms the renderer needs: movers then breakables. */
  snapshotBodies(): RigidBody[] {
    return [...this.movers.map((m) => m.body), ...this.breakables.map((b) => b.body)];
  }

  /** Is a world point inside a kill zone or under a crusher (for bot avoidance)? */
  isDeadly(p: Vec3, pad = 0): boolean {
    for (const h of this.arena.hazards ?? []) if (h.kind === 'kill' && inBox(p, h.box, pad)) return true;
    for (const m of this.movers) {
      const cr = m.def.crush;
      if (!cr) continue;
      const o = m.def.origin;
      const box: Box3 = { min: { x: o.x + cr.min.x, y: -50, z: o.z + cr.min.z }, max: { x: o.x + cr.max.x, y: 50, z: o.z + cr.max.z } };
      if (inBox(p, box, pad)) return true;
    }
    return false;
  }

  /** Is there floor under this point (within `depth` metres)? */
  hasFloor(p: Vec3, depth: number, groups: number): boolean {
    const ray = new RAPIER.Ray({ x: p.x, y: p.y + 0.3, z: p.z }, { x: 0, y: -1, z: 0 });
    return this.host.world.castRay(ray, depth + 0.3, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups) !== null;
  }
}
