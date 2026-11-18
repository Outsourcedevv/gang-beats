import type { ArenaDef, BreakableDef, PropDef, StaticPiece } from '../arena';
import { post, railing, slab } from './build';

// "Grinder Works" — a factory floor over a vat of molten metal. The most
// dangerous map: a conveyor feeding a grinder, a hydraulic press, a crane that
// drops crates, a collapsing catwalk and a flimsy wooden barricade.

const pieces: StaticPiece[] = [
  // Floor: main area + strip under the conveyor (stops short of the grinder pit).
  slab(-7, 7, -0.5, 0, -2.6, 1.6, 'concrete', { friction: 0.9 }),
  slab(-7, 5.6, -0.5, 0, -4.4, -2.6, 'concrete'),
  // Hazard-striped edges along the front and left drops.
  slab(-7, -6.7, -0.02, 0.02, -4.4, 3.5, 'hazard', { visualOnly: true }),
  // Back wall.
  slab(-7.5, 7.5, 0, 6, -4.8, -4.4, 'brick'),
  // Conveyor belt carrying everything right, into the grinder.
  slab(-5, 5.6, 0, 0.3, -4.3, -2.7, 'belt', { surfaceVel: { x: 2.0, y: 0, z: 0 } }),
  slab(-5.3, -5, 0, 0.45, -4.35, -2.65, 'metal'),
  // Grinder housing: side wall and a trip curb at the front.
  slab(7, 7.3, 0, 1.4, -4.4, -2.5, 'hazard'),
  slab(5.6, 7, 0, 0.15, -2.6, -2.45, 'hazard'),
  slab(5.5, 7.3, 1.4, 1.6, -4.4, -2.5, 'metal', { visualOnly: true }),
  // Press frame: four columns and a crossbeam.
  post(-0.6, -0.2, 0, 3.8, 'metal', 0.12),
  post(1.6, -0.2, 0, 3.8, 'metal', 0.12),
  post(-0.6, 2.0, 0, 3.8, 'metal', 0.12),
  post(1.6, 2.0, 0, 3.8, 'metal', 0.12),
  slab(-0.75, 1.75, 3.8, 4.1, -0.35, 2.15, 'metal', { visualOnly: true }),
  // Catwalk legs, back rail, and stairs up to it.
  post(-6.9, -1.3, 0, 1.6),
  post(-4.5, -1.3, 0, 1.6),
  post(-6.9, 1.1, 0, 1.6),
  post(-4.5, 1.1, 0, 1.6),
  ...railing(-7, -1.35, -4.4, -1.35, 'railing', 1.7),
  slab(-4.25, -3.4, 0, 0.55, 0.4, 1.2, 'metal'),
  slab(-4.25, -3.4, 0, 1.1, -0.4, 0.4, 'metal'),
  // Crane gantry rails (visual).
  slab(-7, 7, 4.55, 4.7, -1.15, -1.0, 'metal', { visualOnly: true }),
  slab(-7, 7, 4.55, 4.7, -0.8, -0.65, 'metal', { visualOnly: true }),
  // Machinery against the back wall (cover / climbable).
  slab(-7, -5.3, 0, 1.0, -4.4, -3.5, 'metal'),
];

const catwalk: BreakableDef[] = [0, 1, 2].map((i) => ({
  id: `catwalk${i}`,
  piece: slab(-7 + i * 0.867, -7 + (i + 1) * 0.867, 1.6, 1.7, -1.4, 1.2, 'grating'),
  trigger: 'stand' as const,
  threshold: 1.1,
  mode: 'fall' as const,
  mass: 25,
}));

const barricade: BreakableDef[] = [0, 1, 2].map((i) => ({
  id: `plank${i}`,
  piece: slab(6.88, 7.0, 0, 1.3, -0.3 + i * 1.12, 0.8 + i * 1.12, 'plank'),
  trigger: 'impact' as const,
  threshold: 6.5,
  mode: 'fall' as const,
  mass: 8,
}));

// Front floor panels: fall away into the vat late in the round.
const panels: BreakableDef[] = [0, 1, 2, 3].map((i) => ({
  id: `panel${i}`,
  piece: slab(-7 + i * 3.5, -7 + (i + 1) * 3.5, -0.3, 0, 1.6, 3.5, 'grating'),
  trigger: 'manual' as const,
  threshold: 0,
  mode: 'fall' as const,
  mass: 60,
}));

const dropCrate = (i: number): PropDef => ({
  id: `drop${i}`,
  shape: 'crate',
  pos: { x: 0, y: -50 - i * 3, z: 0 },
  half: { x: 0.33, y: 0.33, z: 0.33 },
  mass: 9,
  color: 0x8b9aa6,
});

export const FACTORY: ArenaDef = {
  id: 'grinder-works',
  name: 'Grinder Works',
  blurb: 'Factory floor over a molten vat. Conveyor to the grinder, a hydraulic press and a crane that drops crates.',
  theme: 'factory',
  pieces,
  props: [
    { id: 'crate1', shape: 'crate', pos: { x: -2.2, y: 0.35, z: 2.4 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 7, color: 0xc98a4b },
    { id: 'crate2', shape: 'crate', pos: { x: 3.4, y: 0.35, z: 2.5 }, half: { x: 0.35, y: 0.35, z: 0.35 }, mass: 7, color: 0xc98a4b },
    { id: 'barrel1', shape: 'barrel', pos: { x: 4.4, y: 0.45, z: -1.6 }, half: { x: 0.3, y: 0.45, z: 0.3 }, mass: 9, color: 0xd9472b },
  ],
  dropPool: [0, 1, 2, 3, 4].map(dropCrate),
  breakables: [...catwalk, ...barricade, ...panels],
  movers: [
    {
      id: 'press',
      origin: { x: 0.5, y: 3.0, z: 0.9 },
      parts: [
        slab(-0.85, 0.85, -0.2, 0.2, -0.85, 0.85, 'hazard'),
        { kind: 'cylinder', pos: { x: 0, y: 1.2, z: 0 }, radius: 0.22, halfHeight: 1.0, style: 'metal', visualOnly: true },
      ],
      motion: { type: 'piston', offset: { x: 0, y: -2.2, z: 0 }, period: 5.5, slam: 0.28, hold: 0.7, rise: 1.4, phase: 2.5 },
      crush: { min: { x: -0.85, y: -3.4, z: -0.85 }, max: { x: 0.85, y: -0.2, z: 0.85 } },
    },
    {
      id: 'crane',
      origin: { x: 0, y: 3.45, z: -0.9 },
      parts: [
        slab(-0.45, 0.45, 0.9, 1.3, -0.35, 0.35, 'hazard', { visualOnly: true }),
        slab(-0.03, 0.03, -0.8, 0.9, -0.03, 0.03, 'pipe', { visualOnly: true }),
        // Grab bar you can jump to and ride.
        slab(-0.6, 0.6, -0.9, -0.8, -0.05, 0.05, 'metal'),
      ],
      motion: {
        type: 'path',
        points: [
          { x: -5, y: 0, z: 0 },
          { x: 5, y: 0, z: 0 },
        ],
        speed: 1.4,
        pause: 1.5,
        mode: 'pingpong',
      },
    },
    {
      // Grinder rollers (visual): spin fast.
      id: 'rollers',
      origin: { x: 6.3, y: -0.35, z: -3.5 },
      parts: [
        { kind: 'cylinder', pos: { x: -0.35, y: 0, z: 0 }, radius: 0.32, halfHeight: 0.85, style: 'metal', axis: 'z', visualOnly: true },
        { kind: 'cylinder', pos: { x: 0.35, y: 0, z: 0 }, radius: 0.32, halfHeight: 0.85, style: 'metal', axis: 'z', visualOnly: true },
        slab(-0.7, -0.6, -0.05, 0.4, -0.85, 0.85, 'hazard', { visualOnly: true }),
      ],
      motion: { type: 'spin', axis: 'z', speed: -9 },
    },
  ],
  hazards: [
    { kind: 'kill', box: { min: { x: 5.6, y: -4, z: -4.4 }, max: { x: 7.0, y: 0.2, z: -2.6 } }, cause: 'grinder' },
    { kind: 'belt', box: { min: { x: -5, y: 0.2, z: -4.3 }, max: { x: 5.6, y: 0.75, z: -2.7 } }, velocity: { x: 2.0, y: 0, z: 0 } },
  ],
  events: [
    { kind: 'drop', start: 14, every: [8, 13], fromMover: 'crane', height: 2.4 },
    { kind: 'collapse', start: 110, breakables: ['catwalk0', 'catwalk1', 'catwalk2', 'plank0', 'plank1', 'plank2'], interval: 1.2, warn: 'The factory is falling apart!' },
    { kind: 'intensify', start: 110, target: 0, scale: 0.45 },
    { kind: 'collapse', start: 150, breakables: ['panel0', 'panel3', 'panel1', 'panel2'], interval: 4, warn: 'The floor is giving way!' },
  ],
  hills: [
    { pos: { x: 0.5, y: 0, z: 0.9 }, radius: 1.3 },
    { pos: { x: -5.7, y: 1.7, z: -0.1 }, radius: 1.1 },
    { pos: { x: 3.4, y: 0, z: -1.4 }, radius: 1.4 },
    { pos: { x: -2.8, y: 0, z: 0.9 }, radius: 1.5 },
  ],
  goals: [
    { min: { x: -6.8, y: -0.2, z: 1.7 }, max: { x: -4.4, y: 2.5, z: 3.4 } },
    { min: { x: 4.4, y: -0.2, z: 1.7 }, max: { x: 6.8, y: 2.5, z: 3.4 } },
  ],
  trophySpawn: { x: -1.4, y: 1.2, z: -1.4 },
  spawns: [
    { x: -2.4, y: 0, z: 0.8 },
    { x: 3.4, y: 0, z: 0.6 },
    { x: -1.4, y: 0, z: -1.8 },
    { x: 3.0, y: 0, z: 1.0 },
  ],
  bounds: { minX: -7, maxX: 7, minZ: -4.4, maxZ: 3.5, floorY: 0 },
  killY: -2.2,
  killCause: 'molten',
  throwTargets: [
    { x: 6.3, y: 0, z: -3.0 },
    { x: 0, y: 0, z: 3.5 },
    { x: -7, y: 0, z: 1.0 },
  ],
};
