import { RAPIER, characterGroups } from './physics';
import type { Vec3, Quat } from './math';
import { add, rotate, sub, rotateInv } from './math';
import type RAPIER_NS from '@dimforge/rapier3d-compat';

type World = RAPIER_NS.World;
type RigidBody = RAPIER_NS.RigidBody;
type Collider = RAPIER_NS.Collider;

export const PART_NAMES = [
  'pelvis',
  'torso',
  'head',
  'upperArmL',
  'handL',
  'upperArmR',
  'handR',
  'thighL',
  'shinL',
  'thighR',
  'shinR',
] as const;
export type PartName = (typeof PART_NAMES)[number];
export const PART_COUNT = PART_NAMES.length;

export interface PartDef {
  name: PartName;
  shape: 'ball' | 'capsule';
  radius: number;
  halfHeight: number; // capsule only (along local Y)
  /** Rest-pose centre relative to the character origin (ground under pelvis), facing +Z. */
  pos: Vec3;
  mass: number;
  friction: number;
  parent: PartName | null;
  /** Joint position (rest pose, character space) connecting to the parent. */
  joint?: Vec3;
}

// Left side of the character is +X when it faces +Z.
const SHOULDER_Y = 1.32;
const SHOULDER_X = 0.37;
const HIP_Y = 0.62;
const HIP_X = 0.145;
const UPPER_ARM = 0.29;
const FORE_ARM = 0.27;
const THIGH = 0.24;
const SHIN = 0.2;

function limb(
  name: PartName,
  parent: PartName,
  top: Vec3,
  length: number,
  radius: number,
  mass: number,
  friction = 0.6,
): PartDef {
  return {
    name,
    shape: 'capsule',
    radius,
    halfHeight: length / 2,
    pos: { x: top.x, y: top.y - length / 2, z: top.z },
    mass,
    friction,
    parent,
    joint: top,
  };
}

export const PART_DEFS: PartDef[] = [
  { name: 'pelvis', shape: 'ball', radius: 0.27, halfHeight: 0, pos: { x: 0, y: 0.7, z: 0 }, mass: 7, friction: 0.5, parent: null },
  {
    name: 'torso',
    shape: 'capsule',
    radius: 0.31,
    halfHeight: 0.14,
    pos: { x: 0, y: 1.1, z: 0 },
    mass: 10,
    friction: 0.5,
    parent: 'pelvis',
    joint: { x: 0, y: 0.86, z: 0 },
  },
  {
    name: 'head',
    shape: 'ball',
    radius: 0.29,
    halfHeight: 0,
    pos: { x: 0, y: 1.68, z: 0 },
    mass: 3.4,
    friction: 0.5,
    parent: 'torso',
    joint: { x: 0, y: 1.46, z: 0 },
  },
  limb('upperArmL', 'torso', { x: SHOULDER_X, y: SHOULDER_Y, z: 0 }, UPPER_ARM, 0.088, 1.2),
  limb('handL', 'upperArmL', { x: SHOULDER_X, y: SHOULDER_Y - UPPER_ARM, z: 0 }, FORE_ARM, 0.105, 1.0, 1.0),
  limb('upperArmR', 'torso', { x: -SHOULDER_X, y: SHOULDER_Y, z: 0 }, UPPER_ARM, 0.088, 1.2),
  limb('handR', 'upperArmR', { x: -SHOULDER_X, y: SHOULDER_Y - UPPER_ARM, z: 0 }, FORE_ARM, 0.105, 1.0, 1.0),
  limb('thighL', 'pelvis', { x: HIP_X, y: HIP_Y, z: 0 }, THIGH, 0.115, 2.0),
  limb('shinL', 'thighL', { x: HIP_X, y: HIP_Y - THIGH, z: 0 }, SHIN, 0.125, 1.6, 0.9),
  limb('thighR', 'pelvis', { x: -HIP_X, y: HIP_Y, z: 0 }, THIGH, 0.115, 2.0),
  limb('shinR', 'thighR', { x: -HIP_X, y: HIP_Y - THIGH, z: 0 }, SHIN, 0.125, 1.6, 0.9),
];

export const PART_INDEX: Record<PartName, number> = Object.fromEntries(
  PART_NAMES.map((n, i) => [n, i]),
) as Record<PartName, number>;

export const TOTAL_MASS = PART_DEFS.reduce((s, p) => s + p.mass, 0);
const LOWER: PartName[] = ['pelvis', 'thighL', 'shinL', 'thighR', 'shinR'];
export const LOWER_MASS = PART_DEFS.filter((p) => LOWER.includes(p.name)).reduce((s, p) => s + p.mass, 0);

/** Hand tip (grab point) in the hand body's local frame. */
export const HAND_TIP_LOCAL: Vec3 = { x: 0, y: -(FORE_ARM / 2 + 0.05), z: 0 };
/** Foot sole point in the shin body's local frame. */
export const FOOT_LOCAL: Vec3 = { x: 0, y: -(SHIN / 2 + 0.08), z: 0.04 };

export interface RagdollPart {
  def: PartDef;
  body: RigidBody;
  collider: Collider;
  /** Approximate rotational inertia about the parent joint (swing), used to scale PD torques. */
  driveInertia: number;
  /** Inertia about the part's own long (local Y) axis, for twist torques. */
  axialInertia: number;
}

export interface Ragdoll {
  parts: RagdollPart[];
  joints: RAPIER_NS.ImpulseJoint[];
}

function driveInertiaFor(def: PartDef, body: RigidBody): number {
  const pi = body.principalInertia();
  const ic = Math.max(pi.x, pi.y, pi.z);
  // Parallel-axis term about the joint plus the load of what hangs below it.
  let lever = 0;
  if (def.joint) lever = Math.abs(def.pos.y - def.joint.y);
  if (def.name === 'pelvis' || def.name === 'torso') {
    let child = 0;
    for (const d of PART_DEFS) if (d.parent === def.name) child += d.mass * (lever * 2 + d.halfHeight) ** 2;
    return ic + child * 0.25;
  }
  // Limbs: own inertia about the joint only. Their weight is held by explicit
  // gravity compensation, so the muscles don't need to fight the whole chain.
  return ic + def.mass * lever * lever;
}

/** Build a ragdoll in `world` with its origin at `origin`, facing `rot` (yaw). */
export function createRagdoll(world: World, index: number, origin: Vec3, rot: Quat): Ragdoll {
  const parts: RagdollPart[] = [];
  const groups = characterGroups(index);
  for (const def of PART_DEFS) {
    const p = add(origin, rotate(rot, def.pos));
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation(rot)
      .setLinearDamping(0.05)
      .setAngularDamping(def.name === 'pelvis' || def.name === 'torso' ? 0.6 : 1.2)
      .setCanSleep(false);
    const body = world.createRigidBody(bodyDesc);
    if (def.name === 'handL' || def.name === 'handR' || def.name === 'head') body.enableCcd(true);
    const colDesc =
      def.shape === 'ball'
        ? RAPIER.ColliderDesc.ball(def.radius)
        : RAPIER.ColliderDesc.capsule(def.halfHeight, def.radius);
    colDesc
      .setMass(def.mass)
      .setFriction(def.friction)
      .setRestitution(0.05)
      .setCollisionGroups(groups)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = world.createCollider(colDesc, body);
    parts.push({ def, body, collider, driveInertia: driveInertiaFor(def, body), axialInertia: body.principalInertia().y * 1.3 });
  }

  const joints: RAPIER_NS.ImpulseJoint[] = [];
  for (const part of parts) {
    const def = part.def;
    if (!def.parent || !def.joint) continue;
    const parent = parts[PART_INDEX[def.parent]];
    const a1 = sub(def.joint, parent.def.pos);
    const a2 = sub(def.joint, def.pos);
    const data = RAPIER.JointData.spherical(a1, a2);
    const j = world.createImpulseJoint(data, parent.body, part.body, true);
    j.setContactsEnabled(false);
    joints.push(j);
  }
  return { parts, joints };
}

/** Teleport a ragdoll back into its rest pose (used on round reset). */
export function resetRagdoll(rag: Ragdoll, origin: Vec3, rot: Quat): void {
  for (const part of rag.parts) {
    const p = add(origin, rotate(rot, part.def.pos));
    part.body.setEnabled(true);
    part.body.setTranslation(p, true);
    part.body.setRotation(rot, true);
    part.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    part.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    part.body.resetForces(true);
    part.body.resetTorques(true);
  }
}

/** World-space point from a body-local point. */
export function bodyPoint(body: RigidBody, local: Vec3): Vec3 {
  return add(body.translation(), rotate(body.rotation(), local));
}

/** Body-local point from a world-space point. */
export function bodyLocal(body: RigidBody, world: Vec3): Vec3 {
  return rotateInv(body.rotation(), sub(world, body.translation()));
}
