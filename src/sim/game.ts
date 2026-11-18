import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { RAPIER, envGroups, propGroups, MAX_CHARACTERS } from './physics';
import { COMBAT, DIVE, HEADBUTT, KICK, PHYSICS, PROPS } from './config';
import type { ArenaDef, PropDef } from './arena';
import { Character } from './character';
import type { Owner, SimContext } from './character';
import type { AttackKind, SimEvent } from './events';
import type { PlayerInput } from './input';
import { emptyInput } from './input';
import { clamp, makeRng, normalize, quatYaw, sub, len } from './math';
import type { Vec3 } from './math';
import { PART_COUNT, PART_INDEX } from './ragdoll';
import { RoundRules } from './rules';

type World = RAPIER_NS.World;
type RigidBody = RAPIER_NS.RigidBody;

export interface Prop {
  index: number;
  def: PropDef;
  body: RigidBody;
  /** Who last threw / kicked / punched it, and when (for hit credit). */
  lastThrower: number;
  thrownAt: number;
  velPre: Vec3;
  /** Per-victim time of the last hit this prop dealt (debounce). */
  lastHitAt: Map<number, number>;
}

interface StrikeParams {
  minHit: number;
  kbBase: number;
  kbPerSpeed: number;
  /** Fraction of the knockback applied to the struck part (rest goes to the torso). */
  partShare: number;
}

const STRIKES: Record<Exclude<AttackKind, 'prop'>, StrikeParams> = {
  punch: { minHit: COMBAT.minHitSpeed, kbBase: COMBAT.knockbackBase, kbPerSpeed: COMBAT.knockbackPerSpeed, partShare: 0.45 },
  kick: { minHit: KICK.minHitSpeed, kbBase: KICK.knockbackBase, kbPerSpeed: KICK.knockbackPerSpeed, partShare: 0.35 },
  headbutt: { minHit: HEADBUTT.minHitSpeed, kbBase: HEADBUTT.knockbackBase, kbPerSpeed: HEADBUTT.knockbackPerSpeed, partShare: 0.5 },
  dive: { minHit: DIVE.minHitSpeed, kbBase: DIVE.knockbackBase, kbPerSpeed: DIVE.knockbackPerSpeed, partShare: 0.3 },
};

export interface SimOptions {
  arena: ArenaDef;
  players: number;
  seed?: number;
  /** Disable round rules (sandbox / tests). */
  sandbox?: boolean;
}

/** Floats stored per body in a transform snapshot: position (3) + quaternion (4). */
export const SNAP_STRIDE = 7;

/**
 * Authoritative game simulation: physics world, characters, props, hit
 * resolution and round rules. Contains no rendering code so it can run in
 * Node for tests and (later) on the multiplayer server.
 */
export class GameSim implements SimContext {
  readonly world: World;
  readonly arena: ArenaDef;
  readonly characters: Character[] = [];
  readonly props: Prop[] = [];
  readonly propBodies: RigidBody[] = [];
  readonly rules: RoundRules;
  readonly dt = 1 / PHYSICS.rate;
  time = 0;
  tick = 0;
  rng: () => number;
  /** Events produced since the last `drainEvents` call. */
  private events: SimEvent[] = [];
  private eventQueue: RAPIER_NS.EventQueue;
  private colliderOwner = new Map<number, Owner>();
  private bodyOwner = new Map<number, Owner>();
  /** Interpolation snapshots: characters' parts first, then props. */
  prevSnap: Float32Array;
  currSnap: Float32Array;

  constructor(opts: SimOptions) {
    if (opts.players > MAX_CHARACTERS) throw new Error(`At most ${MAX_CHARACTERS} players`);
    this.arena = opts.arena;
    this.rng = makeRng(opts.seed ?? 1234);
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = this.dt;
    this.world.numSolverIterations = PHYSICS.solverIterations;
    this.eventQueue = new RAPIER.EventQueue(true);

    this.buildArena();
    for (let i = 0; i < opts.players; i++) {
      const sp = this.spawnFor(i);
      const c = new Character(this.world, i, sp.pos, sp.yaw);
      this.characters.push(c);
      for (const p of c.rag.parts) {
        const o: Owner = { kind: 'char', index: i, part: p.def.name };
        this.colliderOwner.set(p.collider.handle, o);
        this.bodyOwner.set(p.body.handle, o);
      }
    }
    const n = this.characters.length * PART_COUNT + this.props.length;
    this.prevSnap = new Float32Array(n * SNAP_STRIDE);
    this.currSnap = new Float32Array(n * SNAP_STRIDE);
    this.writeSnapshot(this.currSnap);
    this.prevSnap.set(this.currSnap);
    this.rules = new RoundRules(this, !!opts.sandbox);
  }

  private buildArena(): void {
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const piece of this.arena.pieces) {
      if (piece.visualOnly) continue;
      let desc: RAPIER_NS.ColliderDesc;
      if (piece.kind === 'box') {
        desc = RAPIER.ColliderDesc.cuboid(piece.half.x, piece.half.y, piece.half.z);
        if (piece.yaw) desc.setRotation(quatYaw(piece.yaw));
        desc.setFriction(piece.friction ?? 0.8);
      } else {
        desc = RAPIER.ColliderDesc.cylinder(piece.halfHeight, piece.radius).setFriction(0.8);
      }
      desc.setTranslation(piece.pos.x, piece.pos.y, piece.pos.z).setCollisionGroups(envGroups());
      const c = this.world.createCollider(desc, fixed);
      this.colliderOwner.set(c.handle, { kind: 'env' });
    }
    this.bodyOwner.set(fixed.handle, { kind: 'env' });

    this.arena.props.forEach((def, index) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(def.pos.x, def.pos.y, def.pos.z)
          .setLinearDamping(0.1)
          .setAngularDamping(0.4),
      );
      let desc: RAPIER_NS.ColliderDesc;
      if (def.shape === 'crate') desc = RAPIER.ColliderDesc.roundCuboid(def.half.x - 0.03, def.half.y - 0.03, def.half.z - 0.03, 0.03);
      else if (def.shape === 'barrel') desc = RAPIER.ColliderDesc.cylinder(def.half.y, def.half.x);
      else if (def.shape === 'ball') desc = RAPIER.ColliderDesc.ball(def.half.x);
      else desc = RAPIER.ColliderDesc.cone(def.half.y, def.half.x);
      const bouncy = def.shape === 'ball';
      desc.setMass(def.mass).setFriction(bouncy ? 0.5 : 0.7).setRestitution(bouncy ? 0.65 : 0.15).setCollisionGroups(propGroups());
      const c = this.world.createCollider(desc, body);
      const o: Owner = { kind: 'prop', index };
      this.colliderOwner.set(c.handle, o);
      this.bodyOwner.set(body.handle, o);
      this.props.push({ index, def, body, lastThrower: -1, thrownAt: -99, velPre: { x: 0, y: 0, z: 0 }, lastHitAt: new Map() });
      this.propBodies.push(body);
    });
  }

  spawnFor(i: number): { pos: Vec3; yaw: number } {
    const s = this.arena.spawns[i % this.arena.spawns.length];
    // Face the arena centre.
    const yaw = Math.atan2(-s.x, -s.z);
    return { pos: { x: s.x, y: s.y + 0.02, z: s.z }, yaw };
  }

  ownerOfBody(body: RigidBody): Owner | null {
    return this.bodyOwner.get(body.handle) ?? null;
  }

  emit(ev: SimEvent): void {
    if (ev.type === 'throw' && ev.prop !== undefined) this.creditProp(ev.prop, ev.char);
    this.events.push(ev);
  }

  private creditProp(index: number, char: number): void {
    const p = this.props[index];
    if (!p) return;
    p.lastThrower = char;
    p.thrownAt = this.time;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Advance the simulation by one fixed step using the given per-player inputs. */
  step(inputs: ReadonlyArray<PlayerInput | undefined>): void {
    this.prevSnap.set(this.currSnap);
    const canAct = this.rules.inputsEnabled();
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      const inp = inputs[i];
      if (inp && canAct) c.setInput(inp);
      else c.setInput(emptyInput());
    }
    for (const c of this.characters) c.preStep(this, this.dt);
    for (const c of this.characters) c.capturePreStep();
    for (const p of this.props) {
      const v = p.body.linvel();
      p.velPre.x = v.x;
      p.velPre.y = v.y;
      p.velPre.z = v.z;
    }

    this.world.step(this.eventQueue);
    this.time += this.dt;
    this.tick++;

    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      this.checkStrike(h1, h2);
      this.checkStrike(h2, h1);
      this.checkPropHit(h1, h2);
      this.checkPropHit(h2, h1);
    });
    for (const c of this.characters) c.postStep(this);
    this.recycleFallenProps();
    this.rules.update(this.dt);
    this.writeSnapshot(this.currSnap);
  }

  /**
   * If collider `a` is a body part currently delivering an attack (fist, foot,
   * head, diving body) and `b` is another fighter or a prop, resolve the hit.
   */
  private checkStrike(a: number, b: number): void {
    const oa = this.colliderOwner.get(a);
    const ob = this.colliderOwner.get(b);
    if (!oa || !ob || oa.kind !== 'char') return;
    const attacker = this.characters[oa.index];
    const strike = attacker.strikeFor(oa.part);
    if (!strike || strike.kind === 'prop') return;
    const P = STRIKES[strike.kind];
    const av = attacker.partVelPre[PART_INDEX[oa.part]];
    const hitPos = attacker.part(oa.part).body.translation();

    if (ob.kind === 'prop') {
      const key = 100 + ob.index;
      if (strike.hits.includes(key)) return;
      const prop = this.props[ob.index];
      const strength = len(sub(av, prop.body.linvel()));
      if (strength < P.minHit) return;
      strike.hits.push(key);
      const dir = normalize({ x: strike.dir.x, y: Math.max(0.15, strike.dir.y), z: strike.dir.z });
      const mag = (P.kbBase + P.kbPerSpeed * strength) * 0.5;
      prop.body.applyImpulse({ x: dir.x * mag, y: dir.y * mag, z: dir.z * mag }, true);
      this.creditProp(ob.index, attacker.index);
      this.emit({ type: 'propHit', prop: ob.index, pos: hitPos, strength });
      return;
    }
    if (ob.kind !== 'char' || ob.index === oa.index) return;
    const victim = this.characters[ob.index];
    if (!victim.alive || strike.hits.includes(victim.index)) return;
    const vPart = victim.part(ob.part);
    const rel = sub(av, vPart.body.linvel());
    const strength = len(rel);
    if (strength < P.minHit) return;
    strike.hits.push(victim.index);
    const isHead = ob.part === 'head';
    // Knock back mostly along the attack line, a bit along the actual impact, with some lift.
    const rn = normalize(rel);
    const sd = strike.dir;
    const dir = normalize({ x: sd.x + rn.x * 0.4, y: Math.max(0, sd.y) * 0.5 + 0.28, z: sd.z + rn.z * 0.4 });
    const mag = P.kbBase + P.kbPerSpeed * strength;
    const ps = P.partShare;
    vPart.body.applyImpulse({ x: dir.x * mag * ps, y: dir.y * mag * ps, z: dir.z * mag * ps }, true);
    const vt = victim.part('torso').body;
    const ts = 1.2 - ps;
    vt.applyImpulse({ x: dir.x * mag * ts, y: dir.y * mag * 0.4, z: dir.z * mag * ts }, true);
    victim.receiveHit(this, attacker.index, strength, isHead, strike.kind);
    if (strike.kind === 'headbutt') attacker.addDaze(this, HEADBUTT.selfDaze, false);
    this.emit({ type: 'hit', attacker: attacker.index, victim: victim.index, pos: hitPos, strength, head: isHead, kind: strike.kind });
  }

  /** A fast-moving prop (thrown crate, kicked barrel…) slamming into a fighter. */
  private checkPropHit(a: number, b: number): void {
    const oa = this.colliderOwner.get(a);
    const ob = this.colliderOwner.get(b);
    if (!oa || !ob || oa.kind !== 'prop' || ob.kind !== 'char') return;
    const prop = this.props[oa.index];
    const victim = this.characters[ob.index];
    if (!victim.alive) return;
    // Being carried by this very fighter doesn't count.
    if (victim.arms.some((arm) => arm.grabBody === prop.body)) return;
    const vPart = victim.part(ob.part);
    const rel = len(sub(prop.velPre, vPart.body.linvel()));
    if (rel < PROPS.hitMinSpeed) return;
    if ((prop.lastHitAt.get(victim.index) ?? -99) > this.time - 0.5) return;
    prop.lastHitAt.set(victim.index, this.time);
    const credited = this.time - prop.thrownAt < PROPS.thrownCredit ? prop.lastThrower : -1;
    if (credited === victim.index) return;
    const strength = clamp(rel * prop.body.mass() * PROPS.hitScale, 0, 16);
    const isHead = ob.part === 'head';
    victim.receiveHit(this, credited, strength, isHead, 'prop');
    this.emit({ type: 'hit', attacker: credited, victim: victim.index, pos: vPart.body.translation(), strength, head: isHead, kind: 'prop' });
  }

  /** Props that fall off the map respawn at their original spot. */
  private recycleFallenProps(): void {
    for (const p of this.props) {
      if (p.body.translation().y < PHYSICS.killY) this.resetProp(p);
    }
  }

  private resetProp(p: Prop): void {
    for (const c of this.characters) for (const a of c.arms) if (a.grabBody === p.body) c.release(this, a);
    p.body.setTranslation(p.def.pos, true);
    p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Put every character and prop back at the start positions. */
  resetRound(): void {
    for (const c of this.characters) c.releaseAll(this);
    this.characters.forEach((c, i) => {
      const sp = this.spawnFor(i);
      c.reset(this.world, sp.pos, sp.yaw);
    });
    for (const p of this.props) this.resetProp(p);
    this.writeSnapshot(this.currSnap);
    this.prevSnap.set(this.currSnap);
  }

  private writeSnapshot(out: Float32Array): void {
    let o = 0;
    const put = (b: RigidBody) => {
      const t = b.translation();
      const r = b.rotation();
      out[o] = t.x;
      out[o + 1] = t.y;
      out[o + 2] = t.z;
      out[o + 3] = r.x;
      out[o + 4] = r.y;
      out[o + 5] = r.z;
      out[o + 6] = r.w;
      o += SNAP_STRIDE;
    };
    for (const c of this.characters) for (const p of c.rag.parts) put(p.body);
    for (const p of this.props) put(p.body);
  }

  /** Offset (in floats) of a character part within the snapshot buffers. */
  partOffset(charIndex: number, partIndex: number): number {
    return (charIndex * PART_COUNT + partIndex) * SNAP_STRIDE;
  }

  propOffset(propIndex: number): number {
    return (this.characters.length * PART_COUNT + propIndex) * SNAP_STRIDE;
  }

  dispose(): void {
    this.eventQueue.free();
    this.world.free();
  }
}
