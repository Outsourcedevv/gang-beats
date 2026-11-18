import type { ArenaDef, StaticPiece } from '../arena';
import { post, railing, slab } from './build';

// "Tar Top" — a city rooftop at sunset. Low destruction: a fragile skylight
// you can crash through, a window-cleaner's cradle riding up and down the
// front of the building, and gusts of wind later in the round.

const W = 8; // half width (X)
const D = 5.5; // half depth (Z)
// Skylight hole in the roof slab.
const SX0 = -0.4;
const SX1 = 1.6;
const SZ0 = -0.3;
const SZ1 = 1.1;

const pieces: StaticPiece[] = [
  // Roof slab, split around the skylight hole.
  slab(-W, SX0, -0.5, 0, -D, D, 'roof', { friction: 0.9 }),
  slab(SX1, W, -0.5, 0, -D, D, 'roof', { friction: 0.9 }),
  slab(SX0, SX1, -0.5, 0, -D, SZ0, 'roof', { friction: 0.9 }),
  slab(SX0, SX1, -0.5, 0, SZ1, D, 'roof', { friction: 0.9 }),
  // Skylight frame (a little lip around the glass).
  slab(SX0 - 0.1, SX0, 0, 0.14, SZ0 - 0.1, SZ1 + 0.1, 'trim'),
  slab(SX1, SX1 + 0.1, 0, 0.14, SZ0 - 0.1, SZ1 + 0.1, 'trim'),
  slab(SX0, SX1, 0, 0.14, SZ0 - 0.1, SZ0, 'trim'),
  slab(SX0, SX1, 0, 0.14, SZ1, SZ1 + 0.1, 'trim'),
  // Building walls below (visual), hollow so you can see into it through the skylight.
  slab(-W + 0.05, W - 0.05, -18, -0.5, D - 0.35, D - 0.05, 'brick', { visualOnly: true }),
  slab(-W + 0.05, W - 0.05, -18, -0.5, -D + 0.05, -D + 0.35, 'brick', { visualOnly: true }),
  slab(-W + 0.05, -W + 0.35, -18, -0.5, -D + 0.05, D - 0.05, 'brick', { visualOnly: true }),
  slab(W - 0.35, W - 0.05, -18, -0.5, -D + 0.05, D - 0.05, 'brick', { visualOnly: true }),
  slab(-W + 0.3, W - 0.3, -6.2, -6, -D + 0.3, D - 0.3, 'paint', { visualOnly: true, color: 0x3a2f45 }),
  // Low parapet lips along the edges (trip hazard, not a wall).
  slab(-W, W, 0, 0.16, -D, -D + 0.24, 'trim'),
  slab(-W, W, 0, 0.16, D - 0.24, D, 'trim'),
  slab(-W, -W + 0.24, 0, 0.16, -D, D, 'trim'),
  slab(W - 0.24, W, 0, 0.16, -D, D, 'trim'),
  // Partial railings: gaps are where the fun happens.
  ...railing(-W + 0.15, -D + 0.15, -1.2, -D + 0.15),
  ...railing(2.2, -D + 0.15, W - 0.15, -D + 0.15),
  ...railing(-W + 0.15, D - 0.15, -3.5, D - 0.15),
  ...railing(3.5, D - 0.15, W - 0.15, D - 0.15),
  ...railing(W - 0.15, -D + 0.15, W - 0.15, -1.5),
  // AC unit: climbable block with a vent on top.
  { kind: 'box', pos: { x: -4.2, y: 0.6, z: -2.6 }, half: { x: 1.1, y: 0.6, z: 0.8 }, style: 'metal' },
  { kind: 'cylinder', pos: { x: -4.2, y: 1.25, z: -2.6 }, radius: 0.55, halfHeight: 0.05, style: 'vent' },
  // Roof access hut (its roof is high ground).
  { kind: 'box', pos: { x: 5.2, y: 0.8, z: 2.6 }, half: { x: 1.3, y: 0.8, z: 1.2 }, style: 'concrete' },
  { kind: 'box', pos: { x: 5.2, y: 1.64, z: 2.6 }, half: { x: 1.4, y: 0.04, z: 1.3 }, style: 'trim' },
  { kind: 'box', pos: { x: 3.55, y: 0.3, z: 2.0 }, half: { x: 0.35, y: 0.3, z: 0.5 }, style: 'wood' },
  { kind: 'box', pos: { x: 3.55, y: 0.85, z: 3.0 }, half: { x: 0.35, y: 0.25, z: 0.5 }, style: 'wood' },
  // Water tank on legs at the back.
  { kind: 'cylinder', pos: { x: 5.4, y: 3.4, z: -3.6 }, radius: 1.0, halfHeight: 1.0, style: 'wood' },
  post(4.75, -4.25, 0, 2.4),
  post(6.05, -4.25, 0, 2.4),
  post(4.75, -2.95, 0, 2.4),
  post(6.05, -2.95, 0, 2.4),
  slab(4.7, 6.1, 1.45, 1.55, -3.0, -2.9, 'pipe'),
];

export const TAR_TOP: ArenaDef = {
  id: 'tar-top',
  name: 'Tar Top',
  blurb: 'Sunset rooftop. Mind the skylight, the gaps in the railing and the wind.',
  theme: 'sunset-rooftop',
  pieces,
  props: [
    { id: 'crate1', shape: 'crate', pos: { x: -1.8, y: 0.35, z: 2.8 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 7, color: 0xc98a4b },
    { id: 'crate2', shape: 'crate', pos: { x: -1.7, y: 1.05, z: 2.85 }, half: { x: 0.3, y: 0.3, z: 0.3 }, mass: 5, color: 0xd9a066 },
    { id: 'crate3', shape: 'crate', pos: { x: 2.6, y: 0.35, z: -3.4 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 7, color: 0xc98a4b },
    { id: 'barrel1', shape: 'barrel', pos: { x: -6.4, y: 0.45, z: 3.6 }, half: { x: 0.3, y: 0.45, z: 0.3 }, mass: 9, color: 0x2f7fd1 },
    { id: 'ball1', shape: 'ball', pos: { x: 2.6, y: 0.32, z: 2.4 }, half: { x: 0.3, y: 0.3, z: 0.3 }, mass: 1.2, color: 0xff4f6d },
    { id: 'cone1', shape: 'cone', pos: { x: -0.4, y: 0.3, z: -3.6 }, half: { x: 0.22, y: 0.3, z: 0.22 }, mass: 1.5, color: 0xff6a1a },
  ],
  breakables: [
    {
      id: 'skylight',
      piece: slab(SX0, SX1, 0.02, 0.1, SZ0, SZ1, 'glass'),
      trigger: 'impact',
      threshold: 4,
      mode: 'shatter',
    },
  ],
  movers: [
    {
      // Window cleaner's cradle riding along and up/down the front of the building.
      id: 'cradle',
      origin: { x: 0, y: -0.2, z: 6.15 },
      parts: [
        slab(-1.2, 1.2, -0.06, 0.06, -0.4, 0.4, 'metal'),
        slab(-1.2, 1.2, 0.85, 0.93, 0.34, 0.42, 'railing'),
        slab(-1.2, -1.12, 0.06, 0.9, 0.34, 0.42, 'railing'),
        slab(1.12, 1.2, 0.06, 0.9, 0.34, 0.42, 'railing'),
        slab(-1.0, -0.96, 0.9, 12, 0.0, 0.04, 'pipe', { visualOnly: true }),
        slab(0.96, 1.0, 0.9, 12, 0.0, 0.04, 'pipe', { visualOnly: true }),
      ],
      motion: {
        type: 'path',
        points: [
          { x: -2.8, y: -2.6, z: 0 },
          { x: 2.8, y: -2.6, z: 0 },
          { x: 2.8, y: 0, z: 0 },
          { x: -2.8, y: 0, z: 0 },
        ],
        speed: 0.9,
        pause: 1.5,
        mode: 'loop',
      },
    },
  ],
  hazards: [
    // Through the skylight and into the building.
    { kind: 'kill', box: { min: { x: SX0, y: -8, z: SZ0 }, max: { x: SX1, y: -1.2, z: SZ1 } }, cause: 'building' },
  ],
  events: [
    { kind: 'gust', start: 45, every: [14, 22], accel: 7, duration: 1.4, warn: 'Gust of wind!' },
    { kind: 'intensify', start: 120, target: 0, scale: 0.5, warn: 'The wind is picking up!' },
  ],
  spawns: [
    { x: -2.8, y: 0, z: 0.6 },
    { x: 2.8, y: 0, z: 0.6 },
    { x: -1.2, y: 0, z: -2.0 },
    { x: 1.4, y: 0, z: 2.6 },
  ],
  bounds: { minX: -W, maxX: W, minZ: -D, maxZ: D, floorY: 0 },
};
