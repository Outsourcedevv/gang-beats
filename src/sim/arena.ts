import type { Vec3 } from './math';

// Data-only arena description shared by the physics sim (colliders) and the
// renderer (meshes). Keeping it as plain data means the server can build the
// same world without three.js.

export type SurfaceStyle =
  | 'roof' // main rooftop tar / concrete
  | 'concrete'
  | 'metal'
  | 'railing'
  | 'brick'
  | 'vent'
  | 'wood'
  | 'pipe'
  | 'glass'
  | 'trim'
  | 'belt' // conveyor belt (texture scrolls with surfaceVel)
  | 'grating'
  | 'hazard' // yellow/black stripes
  | 'rubber'
  | 'plank'
  | 'rotten'
  | 'paint' // plain painted surface, uses `color`
  | 'deck' // truck flatbed
  | 'glow'; // emissive (lava, neon)

export interface StaticBox {
  kind: 'box';
  pos: Vec3;
  half: Vec3;
  yaw?: number;
  /** Rotation about Z (applied after yaw). */
  roll?: number;
  style: SurfaceStyle;
  color?: number;
  friction?: number;
  /** Visual-only pieces are rendered but have no collider. */
  visualOnly?: boolean;
  /** Moving-surface velocity (conveyor belts): carries whatever stands on it. */
  surfaceVel?: Vec3;
}

export interface StaticCylinder {
  kind: 'cylinder';
  pos: Vec3;
  radius: number;
  halfHeight: number;
  style: SurfaceStyle;
  color?: number;
  visualOnly?: boolean;
  /** Long axis (default y). */
  axis?: 'x' | 'y' | 'z';
}

export type StaticPiece = StaticBox | StaticCylinder;

export interface PropDef {
  id: string;
  shape: 'crate' | 'barrel' | 'cone' | 'ball' | 'trophy';
  pos: Vec3;
  half: Vec3; // crate half extents; barrel/cone: x=radius, y=halfHeight; ball: x=radius
  mass: number;
  color: number;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** How a mover's pose changes over time. Offsets are relative to the mover's origin. */
export type MoverMotion =
  | { type: 'path'; points: Vec3[]; speed: number; pause?: number; mode: 'pingpong' | 'loop' }
  | { type: 'spin'; axis: 'x' | 'y' | 'z'; speed: number }
  | { type: 'swing'; axis: 'x' | 'z'; amplitude: number; period: number; phase?: number }
  | { type: 'orbit'; axis: 'x' | 'z'; radius: number; period: number; phase?: number }
  /** Slam to `offset`, hold, then rise back; repeats every `period`. */
  | { type: 'piston'; offset: Vec3; period: number; slam: number; hold: number; rise: number; phase?: number }
  /** One-way pass from `from` to `to`, triggered by an arena 'sweep' event. Parked at `from` otherwise. */
  | { type: 'sweep'; from: Vec3; to: Vec3; speed: number }
  | { type: 'sway'; amplitude: Vec3; period: number; phase?: number };

export interface MoverDef {
  id: string;
  origin: Vec3;
  /** Collision/visual pieces, positioned relative to the origin. */
  parts: StaticPiece[];
  motion: MoverMotion;
  /** Knocks out fighters caught under this box (relative to the origin) while moving down. */
  crush?: Box3;
}

export interface BreakableDef {
  id: string;
  piece: StaticBox;
  /** impact: breaks when hit faster than `threshold` m/s. stand: gives way after `threshold` seconds of being stood on. manual: only arena events. */
  trigger: 'impact' | 'stand' | 'manual';
  threshold: number;
  /** shatter: vanishes into shards. fall: comes loose and drops. */
  mode: 'shatter' | 'fall';
  mass?: number;
}

export type EliminationCause = 'fall' | 'water' | 'road' | 'grinder' | 'molten' | 'building' | 'potato';

export type HazardDef =
  | { kind: 'kill'; box: Box3; cause: EliminationCause }
  | { kind: 'wind'; box: Box3; accel: Vec3; id?: string }
  | { kind: 'bounce'; box: Box3; speed: number }
  /** Drags anything resting in the box (conveyor belts carry knocked-out fighters too). */
  | { kind: 'belt'; box: Box3; velocity: Vec3 };

export type ArenaEvent =
  /** Drop a prop from the drop pool: from a mover (crane) or above a random fighter. */
  | { kind: 'drop'; start: number; every: [number, number]; fromMover?: string; height: number; warn?: string }
  /** The ground lurches sideways (vehicle swerve). */
  | { kind: 'swerve'; start: number; every: [number, number]; accel: number; duration: number; warn?: string }
  /** Send a sweep mover across the arena (low bridges). */
  | { kind: 'sweep'; start: number; every: [number, number]; mover: string; warn?: string; warnTime: number }
  /** Temporary gust of wind across the arena. */
  | { kind: 'gust'; start: number; every: [number, number]; accel: number; duration: number; warn?: string }
  /** Breakables start giving way one by one. */
  | { kind: 'collapse'; start: number; breakables: string[]; interval: number; warn?: string }
  /** Change a mover's speed. */
  | { kind: 'speed'; start: number; mover: string; scale: number; warn?: string }
  /** Make another event fire more often from now on. */
  | { kind: 'intensify'; start: number; target: number; scale: number; warn?: string };

export type ArenaTheme = 'sunset-rooftop' | 'factory' | 'highway' | 'funfair';

export interface ArenaDef {
  id: string;
  name: string;
  /** One-line description for the map picker. */
  blurb: string;
  /** Lighting / sky / backdrop theme for the renderer. */
  theme: ArenaTheme;
  pieces: StaticPiece[];
  props: PropDef[];
  /** Extra props spawned by 'drop' events (inactive until dropped). */
  dropPool?: PropDef[];
  movers?: MoverDef[];
  breakables?: BreakableDef[];
  hazards?: HazardDef[];
  events?: ArenaEvent[];
  spawns: Vec3[];
  /** Rough playable floor bounds (used by bots and the camera). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; floorY: number };
  /** Falling below this eliminates (default PHYSICS.killY) and how it's described. */
  killY?: number;
  killCause?: EliminationCause;
  /** Good spots for bots to throw people (edges into hazards). */
  throwTargets?: Vec3[];
  /** Renderer hint: speed the world appears to scroll past (vehicle maps). */
  scrollSpeed?: number;
  /** King of the hill zones (cycled through during a round). */
  hills?: { pos: Vec3; radius: number }[];
  /** Grab the Goods: one goal per team (team 0, team 1) and where the trophy appears. */
  goals?: [Box3, Box3];
  trophySpawn?: Vec3;
}

export { TAR_TOP as TEST_ARENA } from './arenas/tarTop';

/** Local rotation of a piece as a quaternion (yaw about Y, then roll about Z; cylinders follow `axis`). */
export function pieceRotation(p: StaticPiece): { x: number; y: number; z: number; w: number } {
  if (p.kind === 'cylinder') {
    const h = Math.SQRT1_2;
    if (p.axis === 'x') return { x: 0, y: 0, z: h, w: h };
    if (p.axis === 'z') return { x: h, y: 0, z: 0, w: h };
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const y = (p.yaw ?? 0) / 2;
  const r = (p.roll ?? 0) / 2;
  // q = qYaw * qRoll
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  return { x: sy * sr, y: sy * cr, z: cy * sr, w: cy * cr };
}
