import type { ArenaDef, BreakableDef, MoverDef, StaticPiece } from '../arena';
import { railing, slab } from './build';

// "Wobbleland" — a seaside funfair pier at night. A carousel spins in the
// middle (and goes haywire later), rotten planks give way underfoot, bounce
// pads launch you sky-high and a little wheel lifts riders out over the sea.

const Y0 = -0.3;
const pieces: StaticPiece[] = [
  // Back strip (rotten plank in the middle).
  slab(-7.5, -1, Y0, 0, -5, -3.6, 'plank'),
  slab(1, 7.5, Y0, 0, -5, -3.6, 'plank'),
  // Front strip (two rotten planks).
  slab(-7.5, -4, Y0, 0, 2.6, 4, 'plank'),
  slab(-2.6, 2.6, Y0, 0, 2.6, 4, 'plank'),
  slab(4, 7.5, Y0, 0, 2.6, 4, 'plank'),
  // Left strip around its rotten patch.
  slab(-7.5, -3.2, Y0, 0, -3.6, -1.4, 'plank'),
  slab(-7.5, -3.2, Y0, 0, 0.2, 2.6, 'plank'),
  slab(-7.5, -6.2, Y0, 0, -1.4, 0.2, 'plank'),
  slab(-4.6, -3.2, Y0, 0, -1.4, 0.2, 'plank'),
  // Right strip around its rotten patch.
  slab(3.2, 7.5, Y0, 0, -3.6, -1.4, 'plank'),
  slab(3.2, 7.5, Y0, 0, 0.2, 2.6, 'plank'),
  slab(6.2, 7.5, Y0, 0, -1.4, 0.2, 'plank'),
  slab(3.2, 4.6, Y0, 0, -1.4, 0.2, 'plank'),
  // Pier pilings (visual).
  ...[-7, -3.5, 0, 3.5, 7].flatMap((x) =>
    [-4.7, 3.7].map((z) => ({ kind: 'cylinder' as const, pos: { x, y: -1.5, z }, radius: 0.18, halfHeight: 1.3, style: 'wood' as const, visualOnly: true })),
  ),
  // Railings on the sides only — the front and back are open to the sea.
  ...railing(-7.4, -3.4, -7.4, 2.4, 'paint'),
  ...railing(7.4, -3.4, 7.4, 2.4, 'paint'),
  // Bounce pads.
  { kind: 'cylinder', pos: { x: -6.3, y: 0.06, z: -4.3 }, radius: 0.6, halfHeight: 0.06, style: 'rubber' },
  { kind: 'cylinder', pos: { x: 6.3, y: 0.06, z: 3.3 }, radius: 0.6, halfHeight: 0.06, style: 'rubber' },
  // Ticket booth (cover).
  slab(-7.3, -6.1, 0, 1.6, 2.7, 3.9, 'paint', { color: 0xff7eb6 }),
  // Wheel hub (visual).
  { kind: 'cylinder', pos: { x: 5.0, y: 2.1, z: -6.45 }, radius: 0.25, halfHeight: 0.15, axis: 'z', style: 'paint', color: 0xffd23f, visualOnly: true },
  slab(4.9, 5.1, -2, 2.1, -6.7, -6.55, 'paint', { color: 0xffd23f, visualOnly: true }),
];

const rotten = (id: string, x0: number, x1: number, z0: number, z1: number, t = 1.3): BreakableDef => ({
  id,
  piece: slab(x0, x1, Y0, 0, z0, z1, 'rotten'),
  trigger: 'stand',
  threshold: t,
  mode: 'fall',
  mass: 15,
});

const POLE_R = 2.2;
const poles: StaticPiece[] = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2;
  return { kind: 'cylinder', pos: { x: Math.cos(a) * POLE_R, y: 1.3, z: Math.sin(a) * POLE_R }, radius: 0.06, halfHeight: 1.3, style: 'paint', color: 0xffd23f };
});
const horses: StaticPiece[] = [0, 2, 4].map((i) => {
  const a = (i / 6) * Math.PI * 2;
  return slab(Math.cos(a) * POLE_R - 0.15, Math.cos(a) * POLE_R + 0.15, 0.6, 1.0, Math.sin(a) * POLE_R - 0.4, Math.sin(a) * POLE_R + 0.4, 'paint', {
    color: [0xffffff, 0x8fd6ff, 0xffb3d1][i / 2],
    yaw: a,
  });
});

const gondola = (id: string, phase: number): MoverDef => ({
  id,
  origin: { x: 5.0, y: 2.1, z: -5.95 },
  parts: [
    slab(-0.6, 0.6, -0.06, 0.06, -0.45, 0.45, 'paint', { color: 0x2ec4b6 }),
    slab(-0.6, 0.6, 0.9, 0.96, -0.45, -0.39, 'railing'),
    slab(-0.6, -0.54, 0.06, 0.9, -0.45, -0.39, 'railing'),
    slab(0.54, 0.6, 0.06, 0.9, -0.45, -0.39, 'railing'),
  ],
  motion: { type: 'orbit', axis: 'z', radius: 2.0, period: 12, phase },
});

export const FUNFAIR: ArenaDef = {
  id: 'wobbleland',
  name: 'Wobbleland',
  blurb: 'Night-time funfair pier. Spinning carousel, rotten planks, bounce pads and the sea all around.',
  theme: 'funfair',
  pieces,
  props: [
    { id: 'ball1', shape: 'ball', pos: { x: -5, y: 0.32, z: -2.4 }, half: { x: 0.3, y: 0.3, z: 0.3 }, mass: 1.2, color: 0xff4f6d },
    { id: 'ball2', shape: 'ball', pos: { x: 5, y: 0.32, z: 1.6 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 1.4, color: 0x4fb3ff },
    { id: 'barrel1', shape: 'barrel', pos: { x: 6.6, y: 0.45, z: -2.6 }, half: { x: 0.3, y: 0.45, z: 0.3 }, mass: 9, color: 0x9b5de5 },
    { id: 'cone1', shape: 'cone', pos: { x: 0, y: 0.3, z: 3.4 }, half: { x: 0.22, y: 0.3, z: 0.22 }, mass: 1.5, color: 0xff6a1a },
  ],
  breakables: [
    rotten('rotBack', -1, 1, -5, -3.6),
    rotten('rotFrontL', -4, -2.6, 2.6, 4),
    rotten('rotFrontR', 2.6, 4, 2.6, 4),
    rotten('rotLeft', -6.2, -4.6, -1.4, 0.2),
    rotten('rotRight', 4.6, 6.2, -1.4, 0.2),
  ],
  movers: [
    {
      id: 'carousel',
      origin: { x: 0, y: 0, z: -0.5 },
      parts: [
        { kind: 'cylinder', pos: { x: 0, y: -0.12, z: 0 }, radius: 3.0, halfHeight: 0.12, style: 'paint', color: 0xff7eb6 },
        { kind: 'cylinder', pos: { x: 0, y: 1.4, z: 0 }, radius: 0.3, halfHeight: 1.4, style: 'paint', color: 0xffd23f },
        // Small crown on the centre pole (a full canopy would hide the riders from the camera).
        { kind: 'cylinder', pos: { x: 0, y: 2.9, z: 0 }, radius: 0.7, halfHeight: 0.12, style: 'paint', color: 0xff4f6d, visualOnly: true },
        { kind: 'cylinder', pos: { x: 0, y: 3.1, z: 0 }, radius: 0.25, halfHeight: 0.12, style: 'glow', color: 0xffd23f, visualOnly: true },
        ...poles,
        ...horses,
      ],
      motion: { type: 'spin', axis: 'y', speed: 0.55 },
    },
    gondola('gondolaA', 0),
    gondola('gondolaB', 0.5),
    {
      id: 'wheel',
      origin: { x: 5.0, y: 2.1, z: -6.5 },
      parts: [0, 1, 2, 3].map((i) => ({
        kind: 'box' as const,
        pos: { x: 0, y: 0, z: 0 },
        half: { x: 2.0, y: 0.04, z: 0.04 },
        roll: (i * Math.PI) / 4,
        style: 'paint' as const,
        color: 0xffd23f,
        visualOnly: true,
      })),
      motion: { type: 'spin', axis: 'z', speed: (Math.PI * 2) / 12 },
    },
  ],
  hazards: [
    { kind: 'bounce', box: { min: { x: -6.9, y: -0.1, z: -4.9 }, max: { x: -5.7, y: 0.6, z: -3.7 } }, speed: 11 },
    { kind: 'bounce', box: { min: { x: 5.7, y: -0.1, z: 2.7 }, max: { x: 6.9, y: 0.6, z: 3.9 } }, speed: 11 },
  ],
  events: [
    { kind: 'speed', start: 90, mover: 'carousel', scale: 2.6, warn: 'The carousel has gone haywire!' },
    { kind: 'collapse', start: 120, breakables: ['rotBack', 'rotFrontL', 'rotFrontR', 'rotLeft', 'rotRight'], interval: 1.5, warn: 'The pier is rotting away!' },
  ],
  hills: [
    { pos: { x: 0, y: 0, z: -0.5 }, radius: 1.7 },
    { pos: { x: -5.3, y: 0, z: 1.6 }, radius: 1.3 },
    { pos: { x: 5.3, y: 0, z: -2.6 }, radius: 1.3 },
    { pos: { x: 0, y: 0, z: 3.3 }, radius: 1.2 },
  ],
  goals: [
    { min: { x: -7.4, y: -0.2, z: -3.5 }, max: { x: -6.0, y: 2.5, z: -1.6 } },
    { min: { x: 6.0, y: -0.2, z: 0.4 }, max: { x: 7.4, y: 2.5, z: 2.4 } },
  ],
  trophySpawn: { x: 0, y: 1.0, z: 3.3 },
  spawns: [
    { x: -5.4, y: 0, z: 1.2 },
    { x: 5.4, y: 0, z: -2.6 },
    { x: -1.8, y: 0, z: 3.3 },
    { x: 1.8, y: 0, z: -4.3 },
  ],
  bounds: { minX: -7.5, maxX: 7.5, minZ: -5, maxZ: 4, floorY: 0 },
  killY: -0.9,
  killCause: 'water',
};
