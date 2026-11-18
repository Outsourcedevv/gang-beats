import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { RAPIER, characterGroups } from './physics';
import { BODY, COMBAT, GRAB, MOVE, PHYSICS } from './config';
import type { PlayerInput } from './input';
import { emptyInput, copyInput } from './input';
import type { Quat, Vec3 } from './math';
import {
  add,
  clamp,
  cross,
  dot,
  len,
  lenXZ,
  normalize,
  quatFromUnitVectors,
  quatYaw,
  rotate,
  rotationBetween,
  scale,
  sub,
  wrapAngle,
  yawDir,
} from './math';
import type { PartName, Ragdoll, RagdollPart } from './ragdoll';
import {
  HAND_TIP_LOCAL,
  LOWER_MASS,
  PART_INDEX,
  TOTAL_MASS,
  bodyLocal,
  bodyPoint,
  createRagdoll,
  resetRagdoll,
} from './ragdoll';
import type { SimEvent } from './events';

type World = RAPIER_NS.World;
type RigidBody = RAPIER_NS.RigidBody;
type ImpulseJoint = RAPIER_NS.ImpulseJoint;

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
const FWD: Vec3 = { x: 0, y: 0, z: 1 };
const G = -PHYSICS.gravity;

export type CharState = 'active' | 'ko' | 'eliminated';
export type Owner =
  | { kind: 'char'; index: number; part: PartName }
  | { kind: 'prop'; index: number }
  | { kind: 'env' };

/** What the character needs from the surrounding simulation. */
export interface SimContext {
  world: World;
  time: number;
  rng: () => number;
  characters: Character[];
  propBodies: RigidBody[];
  ownerOfBody(body: RigidBody): Owner | null;
  emit(ev: SimEvent): void;
}

type PunchPhase = 'idle' | 'windup' | 'strike' | 'recover';

export interface Arm {
  side: 'L' | 'R';
  sign: number; // +1 left (+X local), -1 right
  upper: RagdollPart;
  hand: RagdollPart;
  punch: PunchPhase;
  punchT: number;
  punchHit: boolean;
  aim: Vec3 | null;
  /** Direction of the current strike (world), fixed when the strike starts. */
  strikeDir: Vec3;
  joint: ImpulseJoint | null;
  grabBody: RigidBody | null;
  grabOwner: Owner | null;
  cooldown: number;
}

/**
 * Apply a desired angular acceleration to a part, splitting it into a swing
 * component (inertia about the joint) and a twist component about the part's
 * own long axis, which has a far smaller inertia. Returns the torque impulse.
 */
function applyAngularAccel(part: RagdollPart, axis: Vec3, alpha: Vec3, dt: number): Vec3 {
  const a = dot(alpha, axis);
  const ax = axis.x * a;
  const ay = axis.y * a;
  const az = axis.z * a;
  const si = part.driveInertia * dt;
  const ti = part.axialInertia * dt;
  const imp = {
    x: (alpha.x - ax) * si + ax * ti,
    y: (alpha.y - ay) * si + ay * ti,
    z: (alpha.z - az) * si + az * ti,
  };
  part.body.applyTorqueImpulse(imp, true);
  return imp;
}

export class Character {
  readonly index: number;
  readonly rag: Ragdoll;
  readonly arms: [Arm, Arm];
  readonly groups: number;

  state: CharState = 'active';
  /** 0..1 how much active balance/muscle control the character currently has. */
  balance = 1;
  stunTimer = 0;
  koTimer = 0;
  daze = 0;
  lastHitAt = -99;
  hurtTimer = 0;
  facing = 0;
  grounded = false;
  groundDist = 99;
  airTime = 0;
  walkPhase = 0;
  liftAmount = 0;
  throwTimer = 0;
  jumpCooldown = 0;
  hoverOff = 0;
  extraLoad = 0;
  liftedBy = -1;
  /** Set by a lifter during a step; becomes `liftedBy` on our next step. */
  liftedByNext = -1;
  holdToPunch = false;
  /** Struggle progress while being held by someone (0..1). */
  escape = 0;
  /** Effort flag for facial expressions (punching / lifting / straining). */
  effort = 0;
  readonly input: PlayerInput = emptyInput();
  private prev: PlayerInput = emptyInput();
  private nextPunch = 0;
  private prevHeadVel: Vec3 = { x: 0, y: 0, z: 0 };
  private prevTorsoVel: Vec3 = { x: 0, y: 0, z: 0 };
  private wasGrounded = true;
  private hitThisStep = false;
  /** Pre-step hand velocities, used to measure punch strength. */
  readonly handVelPre: [Vec3, Vec3] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];

  constructor(world: World, index: number, spawn: Vec3, yaw: number) {
    this.index = index;
    this.groups = characterGroups(index);
    this.facing = yaw;
    this.rag = createRagdoll(world, index, spawn, quatYaw(yaw));
    const arm = (side: 'L' | 'R'): Arm => ({
      side,
      sign: side === 'L' ? 1 : -1,
      upper: this.part(side === 'L' ? 'upperArmL' : 'upperArmR'),
      hand: this.part(side === 'L' ? 'handL' : 'handR'),
      punch: 'idle',
      punchT: 0,
      punchHit: false,
      aim: null,
      strikeDir: { x: 0, y: 0, z: 1 },
      joint: null,
      grabBody: null,
      grabOwner: null,
      cooldown: 0,
    });
    this.arms = [arm('L'), arm('R')];
  }

  part(name: PartName): RagdollPart {
    return this.rag.parts[PART_INDEX[name]];
  }

  get alive(): boolean {
    return this.state !== 'eliminated';
  }

  get torsoPos(): Vec3 {
    return this.part('torso').body.translation();
  }

  get headPos(): Vec3 {
    return this.part('head').body.translation();
  }

  setInput(inp: PlayerInput): void {
    copyInput(this.input, inp);
  }

  // ------------------------------------------------------------------------
  // Main control step (before physics integration)
  // ------------------------------------------------------------------------
  preStep(ctx: SimContext, dt: number): void {
    if (this.state === 'eliminated') return;
    this.hitThisStep = false;
    this.liftedBy = this.liftedByNext;
    this.liftedByNext = -1;
    const inp = this.input;
    const prev = this.prev;
    const active = this.state === 'active';
    const pressed = (k: 'jump' | 'punch' | 'grab' | 'lift') => inp[k] && !prev[k];

    this.updateBalance(ctx, dt, pressed);
    this.updateStruggle(ctx, dt, pressed);

    const pelvis = this.part('pelvis').body;
    const torso = this.part('torso').body;
    const pv = pelvis.linvel();

    // ---- facing ---------------------------------------------------------
    let mx = inp.moveX;
    let mz = inp.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const control = active ? this.balance : 0;
    if (active && ml > 0.15) {
      this.turnToward(Math.atan2(mx, mz), dt);
    }

    // ---- ground probe / hover ------------------------------------------
    this.probeGround(ctx);
    this.hoverOff = Math.max(0, this.hoverOff - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.grounded) this.airTime = 0;
    else this.airTime += dt;

    if (this.groundHit && this.hoverOff <= 0 && control > 0.02) {
      const err = BODY.hoverHeight - this.groundDist;
      const reachFade = clamp((BODY.hoverReach - this.groundDist) / (BODY.hoverReach - BODY.hoverHeight), 0, 1);
      let acc = err * BODY.hoverStiffness - pv.y * BODY.hoverDamping;
      acc += (G + this.extraLoad / TOTAL_MASS) * reachFade;
      acc = clamp(acc, 0, G * 3.2) * control;
      const f = TOTAL_MASS * acc * dt;
      pelvis.applyImpulse({ x: 0, y: f * (LOWER_MASS / TOTAL_MASS), z: 0 }, true);
      torso.applyImpulse({ x: 0, y: f * (1 - LOWER_MASS / TOTAL_MASS), z: 0 }, true);
      // Newton's third law: push down whatever we're standing on.
      const gb = this.groundBody;
      if (gb && gb.isDynamic()) gb.applyImpulse({ x: 0, y: -f * 0.6, z: 0 }, true);
    }
    this.extraLoad = 0;

    // ---- locomotion ----------------------------------------------------
    if (active) {
      const dazeSlow = 1 - clamp(this.daze / COMBAT.koThreshold, 0, 1) * 0.35;
      const sprint = inp.sprint && this.grounded ? MOVE.sprintMul : 1;
      const speed = MOVE.walkSpeed * dazeSlow * sprint * (this.liftAmount > 0.3 && this.holdingDynamic() ? 0.7 : 1);
      const want = { x: mx * speed, y: 0, z: mz * speed };
      const hasInput = ml > 0.1;
      let ax = (want.x - pv.x) * MOVE.accel;
      let az = (want.z - pv.z) * MOVE.accel;
      let maxA = MOVE.maxAccel * (hasInput ? 1 : 0.22);
      if (!this.grounded) maxA *= MOVE.airControl;
      const al = Math.hypot(ax, az);
      if (al > maxA) {
        ax *= maxA / al;
        az *= maxA / al;
      }
      const k = TOTAL_MASS * dt * control;
      pelvis.applyImpulse({ x: ax * k * (LOWER_MASS / TOTAL_MASS), y: 0, z: az * k * (LOWER_MASS / TOTAL_MASS) }, true);
      torso.applyImpulse({ x: ax * k * (1 - LOWER_MASS / TOTAL_MASS), y: 0, z: az * k * (1 - LOWER_MASS / TOTAL_MASS) }, true);

      // ---- jump --------------------------------------------------------
      if (pressed('jump') && this.grounded && this.jumpCooldown <= 0 && this.balance > 0.55) {
        const vy = MOVE.jumpSpeed - Math.max(0, pv.y);
        for (const p of this.rag.parts) p.body.applyImpulse({ x: 0, y: p.def.mass * vy, z: 0 }, true);
        this.jumpCooldown = MOVE.jumpCooldown;
        this.hoverOff = 0.22;
        ctx.emit({ type: 'jump', char: this.index });
      }
    }

    // ---- balance torques ------------------------------------------------
    const muscle = this.state === 'ko' ? BODY.koMuscle : BODY.koMuscle + (1 - BODY.koMuscle) * Math.max(this.balance, 0.3);
    const lean = { x: pv.x * 0.035, y: 1, z: pv.z * 0.035 };
    const targetUp = normalize(lean);
    const fwd = yawDir(this.facing);
    const up = control;
    this.driveUpright(this.part('pelvis'), targetUp, fwd, BODY.uprightStiffness * up, BODY.uprightDamping * up, BODY.yawStiffness * up, BODY.yawDamping * up, dt);
    this.driveUpright(this.part('torso'), targetUp, fwd, BODY.uprightStiffness * up, BODY.uprightDamping * up, BODY.yawStiffness * up, BODY.yawDamping * up, dt);
    const hm = this.state === 'ko' ? 0.05 : Math.max(muscle, 0.4);
    this.driveUpright(this.part('head'), UP, fwd, BODY.headStiffness * hm, BODY.headDamping * hm, BODY.headStiffness * 0.5 * hm, BODY.headDamping * 0.5 * hm, dt, torso.angvel());

    // ---- legs ------------------------------------------------------------
    this.driveLegs(pv, dt, muscle, ctx.time);

    // ---- arms: punching, grabbing, lifting ------------------------------
    for (const a of this.arms) a.cooldown = Math.max(0, a.cooldown - dt);
    this.throwTimer = Math.max(0, this.throwTimer - dt);
    this.updatePunches(ctx, dt, active, pressed('punch'));
    this.updateGrab(ctx, dt, active);
    this.driveArms(ctx, dt, muscle, pv);

    this.effort = Math.max(0, this.effort - dt * 3);
    if (this.arms.some((a) => a.punch === 'windup' || a.punch === 'strike') || (this.liftAmount > 0.2 && this.holdingDynamic())) this.effort = 1;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    copyInput(prev, inp);
  }

  /** Capture velocities right before the world steps (impulses already applied). */
  capturePreStep(): void {
    if (this.state === 'eliminated') return;
    const hv = this.part('head').body.linvel();
    this.prevHeadVel = { x: hv.x, y: hv.y, z: hv.z };
    const tv = this.part('torso').body.linvel();
    this.prevTorsoVel = { x: tv.x, y: tv.y, z: tv.z };
    for (let i = 0; i < 2; i++) {
      const v = this.arms[i].hand.body.linvel();
      this.handVelPre[i] = { x: v.x, y: v.y, z: v.z };
    }
  }

  // ------------------------------------------------------------------------
  // After physics integration
  // ------------------------------------------------------------------------
  postStep(ctx: SimContext): void {
    if (this.state === 'eliminated') return;
    const head = this.part('head').body;
    const torso = this.part('torso').body;

    // Slams: sudden head velocity changes (walls, floors, thrown crates).
    const hv = head.linvel();
    const dv = len(sub(hv, this.prevHeadVel));
    const tv = torso.linvel();
    const dvt = len(sub(tv, this.prevTorsoVel));
    if (!this.hitThisStep && (dv > COMBAT.impactHeadThreshold || dvt > COMBAT.impactHeadThreshold + 1.5)) {
      const s = Math.max(dv - COMBAT.impactHeadThreshold, dvt - COMBAT.impactHeadThreshold - 1.5);
      this.addDaze(ctx, s * COMBAT.impactDazePerSpeed, false);
      this.hurtTimer = Math.max(this.hurtTimer, 0.35);
      ctx.emit({ type: 'impact', char: this.index, pos: head.translation(), strength: Math.max(dv, dvt) });
    }

    // Landing.
    if (this.grounded && !this.wasGrounded && this.prevTorsoVel.y < -4) {
      ctx.emit({ type: 'land', char: this.index, pos: this.part('pelvis').body.translation(), strength: -this.prevTorsoVel.y });
    }
    this.wasGrounded = this.grounded;

    // Toppling: lost balance without being knocked out.
    if (this.state === 'active' && this.balance > 0.5 && this.stunTimer <= 0) {
      const tUp = rotate(torso.rotation(), UP);
      if (tUp.y < BODY.fallTiltDot) {
        this.stunTimer = 0.45;
        this.balance = 0.1;
        ctx.emit({ type: 'topple', char: this.index });
      }
    }

    // Out of the arena.
    if (this.part('pelvis').body.translation().y < PHYSICS.killY) this.eliminate(ctx);
  }

  // ------------------------------------------------------------------------
  // Combat reactions
  // ------------------------------------------------------------------------
  /** Called by the sim when a strike connects with this character. */
  receiveHit(ctx: SimContext, attacker: number, strength: number, head: boolean): void {
    this.hitThisStep = true;
    this.lastHitAt = ctx.time;
    this.hurtTimer = 0.45;
    const daze = head
      ? COMBAT.dazeHeadBase + strength * COMBAT.dazeHeadPerSpeed
      : COMBAT.dazeBodyBase + strength * COMBAT.dazeBodyPerSpeed;
    // Stagger: knock some balance out of them so hits visibly wobble.
    if (this.state === 'active') this.balance = Math.max(0.05, this.balance - (head ? 0.25 : 0.12) - strength * 0.025);
    let suddenKo = false;
    if (head && strength > COMBAT.suddenKoSpeed) {
      suddenKo = ctx.rng() < (strength - COMBAT.suddenKoSpeed) * COMBAT.suddenKoChancePerSpeed;
    }
    this.addDaze(ctx, daze, suddenKo);
    void attacker;
  }

  addDaze(ctx: SimContext, amount: number, forceKo: boolean): void {
    if (this.state !== 'active') {
      if (this.state === 'ko') this.koTimer = Math.min(COMBAT.koDuration * 1.5, this.koTimer + amount * 0.01);
      return;
    }
    this.daze += amount;
    this.lastHitAt = ctx.time;
    if (forceKo || this.daze >= COMBAT.koThreshold) this.knockOut(ctx);
  }

  knockOut(ctx: SimContext): void {
    if (this.state !== 'active') return;
    this.state = 'ko';
    this.koTimer = COMBAT.koDuration;
    this.balance = 0;
    this.daze = COMBAT.koThreshold;
    this.releaseAll(ctx);
    for (const a of this.arms) {
      a.punch = 'idle';
      a.punchT = 0;
    }
    ctx.emit({ type: 'ko', char: this.index });
  }

  stun(seconds: number): void {
    if (this.state !== 'active') return;
    this.stunTimer = Math.max(this.stunTimer, seconds);
    this.balance = Math.min(this.balance, 0.1);
  }

  eliminate(ctx: SimContext): void {
    if (this.state === 'eliminated') return;
    this.releaseAll(ctx);
    // Anyone holding us lets go.
    for (const c of ctx.characters) {
      for (const a of c.arms) if (a.grabOwner?.kind === 'char' && a.grabOwner.index === this.index) c.release(ctx, a);
    }
    this.state = 'eliminated';
    for (const p of this.rag.parts) p.body.setEnabled(false);
    ctx.emit({ type: 'eliminated', char: this.index });
  }

  reset(world: World, spawn: Vec3, yaw: number): void {
    for (const a of this.arms) this.dropJoint(world, a);
    resetRagdoll(this.rag, spawn, quatYaw(yaw));
    this.state = 'active';
    this.balance = 1;
    this.stunTimer = 0;
    this.koTimer = 0;
    this.daze = 0;
    this.hurtTimer = 0;
    this.facing = yaw;
    this.liftAmount = 0;
    this.throwTimer = 0;
    this.liftedBy = -1;
    this.liftedByNext = -1;
    this.escape = 0;
    this.extraLoad = 0;
    this.effort = 0;
    this.hoverOff = 0;
    this.prevHeadVel = { x: 0, y: 0, z: 0 };
    this.prevTorsoVel = { x: 0, y: 0, z: 0 };
    for (const a of this.arms) {
      a.punch = 'idle';
      a.punchT = 0;
      a.cooldown = 0;
    }
  }

  // ------------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------------
  private groundHit = false;
  private groundBody: RigidBody | null = null;

  private probeGround(ctx: SimContext): void {
    const p = this.part('pelvis').body.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, DOWN);
    const hit = ctx.world.castRay(ray, BODY.hoverReach, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.groups);
    if (hit) {
      this.groundHit = true;
      this.groundDist = hit.timeOfImpact;
      this.groundBody = hit.collider.parent();
      // Never stand on whoever is lifting us, nor on what we are holding.
      const owner = this.groundBody ? ctx.ownerOfBody(this.groundBody) : null;
      if (owner?.kind === 'char' && owner.index === this.liftedBy) this.groundHit = false;
      if (this.groundBody && this.arms.some((a) => a.grabBody === this.groundBody)) this.groundHit = false;
    } else {
      this.groundHit = false;
      this.groundDist = 99;
      this.groundBody = null;
    }
    this.grounded = this.groundHit && this.groundDist < BODY.hoverHeight + 0.22;
  }

  private updateBalance(ctx: SimContext, dt: number, pressed: (k: 'jump' | 'punch' | 'grab' | 'lift') => boolean): void {
    if (ctx.time - this.lastHitAt > COMBAT.dazeDecayDelay && this.state === 'active') {
      this.daze = Math.max(0, this.daze - COMBAT.dazeDecay * dt);
    }
    if (this.state === 'ko') {
      this.balance = 0;
      this.koTimer -= dt;
      // Button mashing helps you come round sooner.
      if (pressed('jump') || pressed('punch') || pressed('grab') || pressed('lift')) this.koTimer -= COMBAT.mashReduction;
      if (this.koTimer <= 0) {
        this.state = 'active';
        this.daze = COMBAT.koThreshold * 0.35;
        this.lastHitAt = ctx.time;
        this.stunTimer = 0;
        this.balance = 0;
        ctx.emit({ type: 'recover', char: this.index });
      }
      return;
    }
    const cap = 1 - clamp(this.daze / COMBAT.koThreshold, 0, 1) * 0.45;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.balance = Math.max(0, this.balance - dt * 3);
    } else {
      this.balance = Math.min(cap, this.balance + BODY.recoverRate * dt);
    }
    if (this.liftedBy >= 0) this.balance = Math.min(this.balance, 0.35);
  }

  /** Characters currently holding us with at least one hand. */
  heldBy(ctx: SimContext): Character[] {
    const out: Character[] = [];
    for (const c of ctx.characters) {
      if (c === this || !c.alive) continue;
      if (c.arms.some((a) => a.joint && a.grabOwner?.kind === 'char' && a.grabOwner.index === this.index)) out.push(c);
    }
    return out;
  }

  /** Conscious fighters can wriggle free by mashing buttons and pulling away. */
  private updateStruggle(ctx: SimContext, dt: number, pressed: (k: 'jump' | 'punch' | 'grab' | 'lift') => boolean): void {
    if (this.state !== 'active') {
      this.escape = 0;
      return;
    }
    const holders = this.heldBy(ctx);
    if (!holders.length) {
      this.escape = Math.max(0, this.escape - GRAB.escapeDecay * dt);
      return;
    }
    if (pressed('jump') || pressed('punch') || pressed('grab') || pressed('lift')) this.escape += GRAB.escapePerPress;
    if (Math.hypot(this.input.moveX, this.input.moveZ) > 0.5) this.escape += GRAB.escapePerSecondMoving * dt;
    this.escape = Math.max(0, this.escape - GRAB.escapeDecay * 0.3 * dt);
    if (this.escape >= 1) {
      this.escape = 0;
      const me = this.torsoPos;
      for (const c of holders) {
        for (const a of c.arms) {
          if (a.grabOwner?.kind === 'char' && a.grabOwner.index === this.index) {
            c.release(ctx, a);
            a.cooldown = 0.8;
          }
        }
        // Shove apart.
        const d = normalize(sub(me, c.torsoPos));
        this.part('torso').body.applyImpulse(scale({ x: d.x, y: 0.3, z: d.z }, 40), true);
        c.part('torso').body.applyImpulse(scale({ x: -d.x, y: 0, z: -d.z }, 30), true);
      }
      ctx.emit({ type: 'escape', char: this.index });
    }
  }

  private turnToward(target: number, dt: number): void {
    const d = wrapAngle(target - this.facing);
    const maxTurn = MOVE.turnRate * dt;
    this.facing = wrapAngle(this.facing + clamp(d, -maxTurn, maxTurn));
  }

  private frame(): Quat {
    return quatYaw(this.facing);
  }

  /** Direction given in the character's facing frame (+X left, +Y up, +Z forward) → world. */
  private dir(x: number, y: number, z: number): Vec3 {
    return rotate(this.frame(), normalize({ x, y, z }));
  }

  private driveUpright(
    part: RagdollPart,
    targetUp: Vec3,
    targetFwd: Vec3,
    kpUp: number,
    kdUp: number,
    kpYaw: number,
    kdYaw: number,
    dt: number,
    refAngVel?: Vec3,
  ): void {
    if (kpUp <= 0 && kdUp <= 0) return;
    const b = part.body;
    const q = b.rotation();
    const up = rotate(q, UP);
    const fw = rotate(q, FWD);
    const tilt = rotationBetween(up, targetUp);
    const fh = normalize({ x: fw.x, y: 0, z: fw.z });
    const yawErr = Math.atan2(cross(fh, targetFwd).y, dot(fh, targetFwd));
    let w = b.angvel();
    if (refAngVel) w = { x: w.x - refAngVel.x * 0.5, y: w.y - refAngVel.y * 0.5, z: w.z - refAngVel.z * 0.5 };
    const alpha = {
      x: tilt.x * kpUp - w.x * kdUp,
      y: tilt.y * kpUp + yawErr * kpYaw - w.y * kdYaw,
      z: tilt.z * kpUp - w.z * kdUp,
    };
    applyAngularAccel(part, up, alpha, dt);
  }

  /** PD-drive a limb segment so its local -Y axis points along `target`, twisting toward `twistFwd`. */
  private driveLimb(part: RagdollPart, parent: RigidBody, target: Vec3, kp: number, kd: number, dt: number): void {
    const b = part.body;
    const q = b.rotation();
    const cur = rotate(q, DOWN);
    const err = rotationBetween(cur, target);
    // Twist: the limb's local +Z should match the rest pose swung onto the target
    // direction (well-defined even when the limb points straight forward).
    const fwd = yawDir(this.facing);
    const swing = quatFromUnitVectors(DOWN, target, { x: fwd.z, y: 0, z: -fwd.x });
    const want = rotate(swing, fwd);
    const fw = rotate(q, FWD);
    const proj = (v: Vec3) => normalize(sub(v, scale(cur, dot(v, cur))));
    const tw = rotationBetween(proj(fw), proj(want));
    const twist = scale(cur, dot(tw, cur) * 0.5);
    const w = b.angvel();
    const pw = parent.angvel();
    const alpha = {
      x: (err.x + twist.x) * kp - (w.x - pw.x) * kd,
      y: (err.y + twist.y) * kp - (w.y - pw.y) * kd,
      z: (err.z + twist.z) * kp - (w.z - pw.z) * kd,
    };
    const imp = applyAngularAccel(part, cur, alpha, dt);
    // Small reaction on the parent keeps things feeling physical without destabilising.
    parent.applyTorqueImpulse({ x: -imp.x * 0.15, y: -imp.y * 0.15, z: -imp.z * 0.15 }, true);
  }

  /** Hold a limb segment's own weight (muscle tone), pushing the weight onto `root`. */
  private supportWeight(part: RagdollPart, root: RigidBody, factor: number, dt: number): void {
    if (factor <= 0) return;
    const j = part.def.mass * G * factor * dt;
    part.body.applyImpulse({ x: 0, y: j, z: 0 }, true);
    root.applyImpulse({ x: 0, y: -j, z: 0 }, true);
  }

  private driveLegs(pv: Vec3, dt: number, muscle: number, time: number): void {
    const speed = lenXZ(pv);
    const pelvis = this.part('pelvis').body;
    const kp = BODY.limbStiffness * muscle;
    const kd = BODY.limbDamping * Math.max(muscle, 0.15);
    let amp = 0;
    if (this.grounded && speed > 0.35) {
      this.walkPhase += dt * (5 + speed * 2.4);
      amp = clamp(speed / MOVE.walkSpeed, 0, 1.25) * 0.7;
    }
    const legs: Array<[PartName, PartName, number, number]> = [
      ['thighL', 'shinL', 0, 1],
      ['thighR', 'shinR', Math.PI, -1],
    ];
    for (const [thighN, shinN, offset, sign] of legs) {
      const ph = this.walkPhase + offset;
      let a: number;
      let bend: number;
      if (this.grounded || this.state !== 'active') {
        a = Math.sin(ph) * amp;
        bend = Math.max(0, Math.cos(ph)) * amp * 1.3 + 0.08;
      } else {
        // Airborne: tuck and flail a little.
        const flail = this.airTime > 0.5 ? Math.sin(time * 13 + offset) * 0.45 : 0;
        a = 0.45 + flail;
        bend = 0.8;
      }
      const thighDir = this.dir(0.06 * sign, -Math.cos(a), Math.sin(a));
      const shinA = a - bend;
      const shinDir = this.dir(0.03 * sign, -Math.cos(shinA), Math.sin(shinA));
      const thigh = this.part(thighN);
      const shin = this.part(shinN);
      this.driveLimb(thigh, pelvis, thighDir, kp, kd, dt);
      this.driveLimb(shin, thigh.body, shinDir, kp, kd, dt);
      if (!this.grounded) {
        this.supportWeight(thigh, pelvis, muscle * 0.9, dt);
        this.supportWeight(shin, pelvis, muscle * 0.9, dt);
      }
    }
  }

  private findTarget(ctx: SimContext, forGrab: boolean): Vec3 | null {
    const torso = this.torsoPos;
    const fwd = yawDir(this.facing);
    let best: Vec3 | null = null;
    let bestScore = Infinity;
    const consider = (p: Vec3, maxDist: number) => {
      const d = sub(p, torso);
      const h = Math.hypot(d.x, d.z);
      if (h > maxDist || Math.abs(d.y) > 1.4) return;
      const cosA = h > 1e-3 ? (d.x * fwd.x + d.z * fwd.z) / h : 1;
      if (cosA < 0.4) return;
      const score = h * (1.6 - cosA);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    };
    for (const c of ctx.characters) {
      if (c === this || !c.alive) continue;
      consider(forGrab ? c.torsoPos : c.headPos, 1.7);
      if (forGrab) consider(c.headPos, 1.5);
    }
    if (forGrab) for (const pb of ctx.propBodies) consider(pb.translation(), 1.4);
    return best;
  }

  private updatePunches(ctx: SimContext, dt: number, active: boolean, punchPressed: boolean): void {
    const wantPunch = active && this.balance > 0.25 && (punchPressed || (this.holdToPunch && this.input.punch));
    if (wantPunch) {
      const order = this.nextPunch === 0 ? [0, 1] : [1, 0];
      for (const i of order) {
        const a = this.arms[i];
        if (a.punch === 'idle' && !a.joint && this.liftAmount < 0.3) {
          a.punch = 'windup';
          a.punchT = 0;
          a.punchHit = false;
          a.aim = this.findTarget(ctx, false);
          this.nextPunch = 1 - i;
          // Auto-face whoever we're swinging at.
          if (a.aim) {
            const d = sub(a.aim, this.torsoPos);
            this.facing = wrapAngle(this.facing + clamp(wrapAngle(Math.atan2(d.x, d.z) - this.facing), -0.6, 0.6));
          }
          break;
        }
      }
    }
    for (const a of this.arms) {
      if (a.punch === 'idle') continue;
      if (!active) {
        a.punch = 'idle';
        continue;
      }
      a.punchT += dt;
      if (a.punch === 'windup' && a.punchT >= COMBAT.windup) {
        a.punch = 'strike';
        a.punchT = 0;
        const dir = this.punchDir(a);
        a.strikeDir = dir;
        // Snap the fist out along the aim line (relative to the body's own motion).
        const tv = this.part('torso').body.linvel();
        const sp = COMBAT.punchHandSpeed;
        a.hand.body.setLinvel({ x: tv.x + dir.x * sp, y: tv.y + dir.y * sp, z: tv.z + dir.z * sp }, true);
        a.upper.body.setLinvel({ x: tv.x + dir.x * sp * 0.5, y: tv.y + dir.y * sp * 0.5, z: tv.z + dir.z * sp * 0.5 }, true);
        const fwd = yawDir(this.facing);
        this.part('torso').body.applyImpulse(scale(fwd, 8), true);
        ctx.emit({ type: 'punch', char: this.index });
      } else if (a.punch === 'strike' && a.punchT >= COMBAT.strike) {
        a.punch = 'recover';
        a.punchT = 0;
      } else if (a.punch === 'recover' && a.punchT >= COMBAT.recover) {
        a.punch = 'idle';
        a.punchT = 0;
      }
    }
  }

  private shoulder(a: Arm): Vec3 {
    const def = a.upper.def;
    return bodyPoint(a.upper.body, { x: 0, y: def.halfHeight, z: 0 });
  }

  private punchDir(a: Arm): Vec3 {
    const sh = this.shoulder(a);
    if (a.aim) {
      const d = normalize(sub({ x: a.aim.x, y: a.aim.y - 0.12, z: a.aim.z }, sh));
      const fwd = yawDir(this.facing);
      if (d.x * fwd.x + d.z * fwd.z > 0.2) return d;
    }
    return this.dir(-a.sign * 0.12, 0.05, 1);
  }

  private updateGrab(ctx: SimContext, dt: number, active: boolean): void {
    const holding = active && this.input.grab;
    const wasHolding = this.prev.grab;
    // Throw: let go while lifting something.
    if (!holding && wasHolding && this.liftAmount > 0.55 && this.holdingDynamic()) {
      this.throwHeld(ctx);
    }
    for (const a of this.arms) {
      if (!holding) {
        if (a.joint) this.release(ctx, a);
        continue;
      }
      if (a.joint) {
        // Joints can be yanked loose when they stretch too far.
        if (!a.joint.isValid() || !a.grabBody || !a.grabBody.isEnabled()) {
          this.release(ctx, a);
          continue;
        }
        const p1 = bodyPoint(a.hand.body, HAND_TIP_LOCAL);
        const p2 = bodyPoint(a.grabBody, a.joint.anchor2());
        if (len(sub(p1, p2)) > GRAB.breakDistance) {
          this.release(ctx, a);
          a.cooldown = GRAB.regrabCooldown;
        }
        continue;
      }
      if (a.punch !== 'idle' || a.cooldown > 0) continue;
      this.tryAttach(ctx, a);
    }

    // Lifting.
    const lifting = active && this.input.lift;
    this.liftAmount = lifting ? Math.min(1, this.liftAmount + dt / GRAB.liftTime) : Math.max(0, this.liftAmount - dt * 3);
    if (this.liftAmount > 0.05) this.applyLiftAssist(ctx, dt);
  }

  private tryAttach(ctx: SimContext, a: Arm): void {
    const tip = bodyPoint(a.hand.body, HAND_TIP_LOCAL);
    const shape = new RAPIER.Ball(a.hand.def.radius + GRAB.probeExtra);
    let found: RAPIER_NS.Collider | null = null;
    ctx.world.intersectionsWithShape(
      tip,
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      (c) => {
        if (c.isSensor() || !c.parent()) return true;
        found = c;
        return false;
      },
      undefined,
      this.groups,
    );
    if (!found) return;
    const col = found as RAPIER_NS.Collider;
    const body = col.parent()!;
    const owner = ctx.ownerOfBody(body) ?? { kind: 'env' as const };
    const data = RAPIER.JointData.spherical(HAND_TIP_LOCAL, bodyLocal(body, tip));
    const joint = ctx.world.createImpulseJoint(data, a.hand.body, body, true);
    joint.setContactsEnabled(false);
    a.joint = joint;
    a.grabBody = body;
    a.grabOwner = owner;
    ctx.emit({ type: 'grab', char: this.index, pos: tip, target: owner.kind });
  }

  release(ctx: SimContext, a: Arm): void {
    this.dropJoint(ctx.world, a);
  }

  private dropJoint(world: World, a: Arm): void {
    if (a.joint && a.joint.isValid()) world.removeImpulseJoint(a.joint, true);
    a.joint = null;
    a.grabBody = null;
    a.grabOwner = null;
  }

  releaseAll(ctx: SimContext): void {
    for (const a of this.arms) this.release(ctx, a);
  }

  holdingDynamic(): boolean {
    return this.arms.some((a) => a.joint && a.grabBody && a.grabBody.isDynamic());
  }

  /** Characters / props currently held (deduplicated). */
  private heldThings(ctx: SimContext): { chars: Character[]; props: RigidBody[] } {
    const chars: Character[] = [];
    const props: RigidBody[] = [];
    for (const a of this.arms) {
      if (!a.joint || !a.grabOwner) continue;
      if (a.grabOwner.kind === 'char') {
        const c = ctx.characters[a.grabOwner.index];
        if (c && c.alive && !chars.includes(c)) chars.push(c);
      } else if (a.grabOwner.kind === 'prop' && a.grabBody && !props.includes(a.grabBody)) {
        props.push(a.grabBody);
      }
    }
    return { chars, props };
  }

  private holdPoint(): Vec3 {
    const t = this.torsoPos;
    const f = yawDir(this.facing);
    return { x: t.x + f.x * 0.15, y: t.y + 0.35 + GRAB.holdHeight * this.liftAmount, z: t.z + f.z * 0.15 };
  }

  private applyLiftAssist(ctx: SimContext, dt: number): void {
    const { chars, props } = this.heldThings(ctx);
    if (!chars.length && !props.length) return;
    const hp = this.holdPoint();
    let loadY = 0;
    const pull = (body: RigidBody, mass: number, centre: Vec3, vel: Vec3, resist: number, grav: number) => {
      const ax = clamp((hp.x - centre.x) * GRAB.liftAssist - vel.x * GRAB.liftAssistDamping, -60, 60) * resist;
      const ay = clamp((hp.y - centre.y) * GRAB.liftAssist - vel.y * GRAB.liftAssistDamping, -60, 60) * resist + G * grav;
      const az = clamp((hp.z - centre.z) * GRAB.liftAssist - vel.z * GRAB.liftAssistDamping, -60, 60) * resist;
      const k = mass * dt * this.liftAmount;
      body.applyImpulse({ x: ax * k, y: ay * k, z: az * k }, true);
      loadY += ay * mass * this.liftAmount;
    };
    for (const c of chars) {
      const limp = c.state === 'ko' || (c.stunTimer > 0 && c.balance < 0.3);
      const resist = limp ? 1 : GRAB.liftResistFactor;
      const grav = limp ? 1 : GRAB.liftConsciousGravity;
      const centre = c.torsoPos;
      const vel = c.part('torso').body.linvel();
      for (const p of c.rag.parts) pull(p.body, p.def.mass, centre, vel, resist, grav);
      c.liftedByNext = this.index;
    }
    for (const b of props) pull(b, b.mass(), b.translation(), b.linvel(), 1, 1);
    // Carry the weight ourselves.
    this.extraLoad += Math.max(0, loadY);
    const r = -Math.max(0, loadY) * dt;
    this.part('pelvis').body.applyImpulse({ x: 0, y: r * 0.5, z: 0 }, true);
    this.part('torso').body.applyImpulse({ x: 0, y: r * 0.5, z: 0 }, true);
  }

  private throwHeld(ctx: SimContext): void {
    const { chars, props } = this.heldThings(ctx);
    const f = yawDir(this.facing);
    const v = { x: f.x * GRAB.throwForward, y: GRAB.throwUp, z: f.z * GRAB.throwForward };
    for (const c of chars) {
      const k = c.state === 'ko' ? 1 : GRAB.throwConsciousFactor;
      for (const p of c.rag.parts) p.body.applyImpulse(scale(v, p.def.mass * k), true);
      c.stun(GRAB.throwStun);
      c.hitThisStep = true; // the throw itself is not a slam
      ctx.emit({ type: 'throw', char: this.index, victim: c.index });
    }
    for (const b of props) {
      b.applyImpulse(scale(v, b.mass() * 1.15), true);
      ctx.emit({ type: 'throw', char: this.index, victim: -1 });
    }
    this.throwTimer = 0.3;
    this.liftAmount = 0;
    for (const a of this.arms) {
      this.release(ctx, a);
      a.cooldown = GRAB.regrabCooldown;
    }
  }

  private driveArms(ctx: SimContext, dt: number, muscle: number, pv: Vec3): void {
    const torso = this.part('torso').body;
    const grabbing = this.state === 'active' && this.input.grab;
    const lifting = this.state === 'active' && this.liftAmount > 0.02;
    let grabAim: Vec3 | null = null;
    if (grabbing && !lifting && this.arms.some((a) => !a.joint)) grabAim = this.findTarget(ctx, true);
    const speed = lenXZ(pv);
    const swing = this.grounded ? clamp(speed / MOVE.walkSpeed, 0, 1) * 0.6 : 0;

    for (const a of this.arms) {
      let upperDir: Vec3;
      let handDir: Vec3;
      let strength = 1;
      const s = a.sign;
      if (this.state === 'ko') {
        upperDir = this.dir(s * 0.3, -1, 0);
        handDir = upperDir;
      } else if (a.punch === 'windup') {
        // Cock the elbow back at shoulder height, fist forward by the chin.
        upperDir = this.dir(s * 0.55, -0.2, -0.75);
        handDir = this.dir(-s * 0.15, 0.1, 1);
        strength = 1.8;
      } else if (a.punch === 'strike') {
        upperDir = a.strikeDir;
        handDir = upperDir;
        strength = 3;
      } else if (this.throwTimer > 0) {
        upperDir = this.dir(-s * 0.1, -0.1, 1);
        handDir = upperDir;
        strength = 3;
      } else if (lifting) {
        const t = this.liftAmount;
        upperDir = this.dir(-s * 0.12, -1 + 2.1 * t, 0.9 - 0.6 * t);
        handDir = upperDir;
        strength = a.joint ? 2.4 : 1.4;
      } else if (grabbing) {
        // Reach slightly low when standing (railings, bodies), high when airborne (ledges).
        let d = this.dir(-s * 0.18, this.grounded ? -0.28 : 0.6, 1);
        if (grabAim && !a.joint) {
          const toT = normalize(sub(grabAim, this.shoulder(a)));
          const fwd = yawDir(this.facing);
          if (toT.x * fwd.x + toT.z * fwd.z > 0.2) d = normalize(add(toT, scale(d, 0.3)));
        }
        upperDir = d;
        handDir = d;
        strength = a.joint ? 1.8 : 1.4;
      } else {
        // Relaxed: hang with a little walk swing opposite to the legs.
        const sw = Math.sin(this.walkPhase + (a.side === 'L' ? Math.PI : 0)) * swing;
        upperDir = this.dir(s * 0.32, -Math.cos(sw), Math.sin(sw) + 0.08);
        handDir = this.dir(s * 0.2, -Math.cos(sw + 0.45), Math.sin(sw + 0.45));
        strength = 0.7;
      }
      const kp = BODY.limbStiffness * muscle * strength;
      const kd = BODY.limbDamping * Math.max(muscle, 0.15) * Math.sqrt(strength);
      this.driveLimb(a.upper, torso, upperDir, kp, kd, dt);
      this.driveLimb(a.hand, a.upper.body, handDir, kp, kd, dt);
      const tone = this.state === 'ko' ? 0 : muscle * 0.95;
      this.supportWeight(a.upper, torso, tone, dt);
      this.supportWeight(a.hand, torso, tone, dt);
    }
  }
}
