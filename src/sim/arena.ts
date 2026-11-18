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
  | 'trim';

export interface StaticBox {
  kind: 'box';
  pos: Vec3;
  half: Vec3;
  yaw?: number;
  style: SurfaceStyle;
  color?: number;
  friction?: number;
  /** Visual-only pieces are rendered but have no collider. */
  visualOnly?: boolean;
}

export interface StaticCylinder {
  kind: 'cylinder';
  pos: Vec3;
  radius: number;
  halfHeight: number;
  style: SurfaceStyle;
  color?: number;
  visualOnly?: boolean;
}

export type StaticPiece = StaticBox | StaticCylinder;

export interface PropDef {
  id: string;
  shape: 'crate' | 'barrel' | 'cone';
  pos: Vec3;
  half: Vec3; // crate half extents; barrel: x=radius, y=halfHeight
  mass: number;
  color: number;
}

export interface ArenaDef {
  id: string;
  name: string;
  /** Lighting / sky theme hint for the renderer. */
  theme: 'sunset-rooftop';
  pieces: StaticPiece[];
  props: PropDef[];
  spawns: Vec3[];
  /** Rough playable floor bounds (used by bots and the camera). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; floorY: number };
}

// ---------------------------------------------------------------------------
// Test arena: "Tar Top" — a small city rooftop with railings that only cover
// part of the edge, an AC unit to climb, a water tank and loose crates.
// ---------------------------------------------------------------------------

const W = 8; // half width (X)
const D = 5.5; // half depth (Z)

function railing(x0: number, z0: number, x1: number, z1: number): StaticPiece[] {
  const out: StaticPiece[] = [];
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // Top rail (grabbable) and a lower rail.
  out.push({ kind: 'box', pos: { x: cx, y: 0.95, z: cz }, half: { x: 0.05, y: 0.05, z: length / 2 }, yaw, style: 'railing' });
  out.push({ kind: 'box', pos: { x: cx, y: 0.5, z: cz }, half: { x: 0.035, y: 0.035, z: length / 2 }, yaw, style: 'railing' });
  // Posts every ~1.4m.
  const posts = Math.max(2, Math.round(length / 1.4) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    out.push({
      kind: 'box',
      pos: { x: x0 + dx * t, y: 0.48, z: z0 + dz * t },
      half: { x: 0.05, y: 0.48, z: 0.05 },
      style: 'railing',
    });
  }
  return out;
}

const pieces: StaticPiece[] = [
  // Roof slab.
  { kind: 'box', pos: { x: 0, y: -0.25, z: 0 }, half: { x: W, y: 0.25, z: D }, style: 'roof', friction: 0.9 },
  // Building body below (visual only, gives the drop some depth).
  { kind: 'box', pos: { x: 0, y: -9, z: 0 }, half: { x: W - 0.05, y: 8.5, z: D - 0.05 }, style: 'brick', visualOnly: true },
  // Low parapet lips along the edges (trip hazard, not a wall).
  { kind: 'box', pos: { x: 0, y: 0.08, z: -D + 0.12 }, half: { x: W, y: 0.08, z: 0.12 }, style: 'trim' },
  { kind: 'box', pos: { x: 0, y: 0.08, z: D - 0.12 }, half: { x: W, y: 0.08, z: 0.12 }, style: 'trim' },
  { kind: 'box', pos: { x: -W + 0.12, y: 0.08, z: 0 }, half: { x: 0.12, y: 0.08, z: D }, style: 'trim' },
  { kind: 'box', pos: { x: W - 0.12, y: 0.08, z: 0 }, half: { x: 0.12, y: 0.08, z: D }, style: 'trim' },
  // Partial railings: back edge fully covered on the left, gaps elsewhere.
  ...railing(-W + 0.15, -D + 0.15, -1.2, -D + 0.15),
  ...railing(2.2, -D + 0.15, W - 0.15, -D + 0.15),
  ...railing(-W + 0.15, D - 0.15, -3.5, D - 0.15),
  ...railing(3.5, D - 0.15, W - 0.15, D - 0.15),
  ...railing(W - 0.15, -D + 0.15, W - 0.15, -1.5),
  // AC unit: climbable block with a vent on top.
  { kind: 'box', pos: { x: -4.2, y: 0.6, z: -2.6 }, half: { x: 1.1, y: 0.6, z: 0.8 }, style: 'metal' },
  { kind: 'cylinder', pos: { x: -4.2, y: 1.25, z: -2.6 }, radius: 0.55, halfHeight: 0.05, style: 'vent' },
  // Roof access hut (taller, its roof is a high ground spot).
  { kind: 'box', pos: { x: 5.2, y: 0.8, z: 2.6 }, half: { x: 1.3, y: 0.8, z: 1.2 }, style: 'concrete' },
  { kind: 'box', pos: { x: 5.2, y: 1.64, z: 2.6 }, half: { x: 1.4, y: 0.04, z: 1.3 }, style: 'trim' },
  // Step to get onto the hut.
  { kind: 'box', pos: { x: 3.55, y: 0.3, z: 2.0 }, half: { x: 0.35, y: 0.3, z: 0.5 }, style: 'wood' },
  { kind: 'box', pos: { x: 3.55, y: 0.85, z: 3.0 }, half: { x: 0.35, y: 0.25, z: 0.5 }, style: 'wood' },
  // Water tank on legs at the back (visual landmark + grabbable legs and brace).
  { kind: 'cylinder', pos: { x: 5.4, y: 3.4, z: -3.6 }, radius: 1.0, halfHeight: 1.0, style: 'wood' },
  { kind: 'box', pos: { x: 4.75, y: 1.2, z: -4.25 }, half: { x: 0.08, y: 1.2, z: 0.08 }, style: 'pipe' },
  { kind: 'box', pos: { x: 6.05, y: 1.2, z: -4.25 }, half: { x: 0.08, y: 1.2, z: 0.08 }, style: 'pipe' },
  { kind: 'box', pos: { x: 4.75, y: 1.2, z: -2.95 }, half: { x: 0.08, y: 1.2, z: 0.08 }, style: 'pipe' },
  { kind: 'box', pos: { x: 6.05, y: 1.2, z: -2.95 }, half: { x: 0.08, y: 1.2, z: 0.08 }, style: 'pipe' },
  { kind: 'box', pos: { x: 5.4, y: 1.5, z: -2.95 }, half: { x: 0.7, y: 0.05, z: 0.05 }, style: 'pipe' },
  // Skylight in the middle (slightly raised glass).
  { kind: 'box', pos: { x: 0.6, y: 0.12, z: 0.4 }, half: { x: 1.0, y: 0.12, z: 0.7 }, style: 'glass' },
];

export const TEST_ARENA: ArenaDef = {
  id: 'tar-top',
  name: 'Tar Top',
  theme: 'sunset-rooftop',
  pieces,
  props: [
    { id: 'crate1', shape: 'crate', pos: { x: -1.8, y: 0.35, z: 2.8 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 7, color: 0xc98a4b },
    { id: 'crate2', shape: 'crate', pos: { x: -1.7, y: 1.05, z: 2.85 }, half: { x: 0.3, y: 0.3, z: 0.3 }, mass: 5, color: 0xd9a066 },
    { id: 'crate3', shape: 'crate', pos: { x: 2.6, y: 0.35, z: -3.4 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 7, color: 0xc98a4b },
    { id: 'barrel1', shape: 'barrel', pos: { x: -6.4, y: 0.45, z: 3.6 }, half: { x: 0.3, y: 0.45, z: 0.3 }, mass: 9, color: 0x2f7fd1 },
    { id: 'cone1', shape: 'cone', pos: { x: -0.4, y: 0.3, z: -3.6 }, half: { x: 0.22, y: 0.3, z: 0.22 }, mass: 1.5, color: 0xff6a1a },
  ],
  spawns: [
    { x: -2.8, y: 0, z: 0.6 },
    { x: 2.8, y: 0, z: 0.6 },
    { x: -1.2, y: 0, z: -2.0 },
    { x: 1.4, y: 0, z: 2.6 },
  ],
  bounds: { minX: -W, maxX: W, minZ: -D, maxZ: D, floorY: 0 },
};
