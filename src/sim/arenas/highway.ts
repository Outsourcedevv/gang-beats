import type { ArenaDef, StaticPiece } from '../arena';
import { post, slab } from './build';

// "Rush Hour" — a brawl on the back of a speeding flatbed truck. A second
// truck drifts alongside, low bridges sweep over the deck, the driver swerves,
// and the headwind pushes everyone towards the back. Touch the road and you're out.

const stakes: StaticPiece[] = [];
for (let x = -5; x <= 5; x += 2) {
  stakes.push(post(x, 2.12, 0, 0.7, 'paint', 0.05));
  stakes.push(post(x, -2.12, 0, 0.7, 'paint', 0.05));
}
// Low sideboards on parts of each side; the gaps between them are the danger.
for (const [x0, x1] of [
  [-4.6, -1.4],
  [1.4, 4.6],
]) {
  stakes.push(slab(x0, x1, 0, 0.38, 2.1, 2.2, 'paint', { color: 0xe0a030 }));
  stakes.push(slab(x0, x1, 0, 0.38, -2.2, -2.1, 'paint', { color: 0xe0a030 }));
}

const wheel = (x: number, z: number): StaticPiece => ({
  kind: 'cylinder',
  pos: { x, y: -1.05, z },
  radius: 0.48,
  halfHeight: 0.18,
  axis: 'z',
  style: 'rubber',
  visualOnly: true,
});

const pieces: StaticPiece[] = [
  // Flatbed trailer.
  slab(-6.1, 6.1, -0.3, 0, -2.2, 2.2, 'deck', { friction: 0.85 }),
  slab(-6.0, 6.0, -0.75, -0.3, -1.2, 1.2, 'metal', { visualOnly: true }),
  ...[-4.8, -3.6, 3.6, 4.8].flatMap((x) => [wheel(x, 1.8), wheel(x, -1.8)]),
  ...stakes,
  // Strapped-down cargo (cover, climbable).
  slab(1.0, 2.2, 0, 1.2, -1.5, -0.3, 'wood'),
  slab(-3.3, -1.9, 0, 1.0, 0.5, 1.5, 'wood'),
  // Toolbox step up to the cab roof.
  slab(-5.85, -5.15, 0, 0.7, -0.8, 0.8, 'metal'),
  // Cab.
  slab(-8.6, -6.5, -0.6, 1.4, -1.7, 1.7, 'paint', { color: 0xd94b3d }),
  slab(-9.5, -8.6, -0.6, 0.55, -1.4, 1.4, 'paint', { color: 0xd94b3d, visualOnly: true }),
  slab(-8.65, -8.55, 0.65, 1.25, -1.3, 1.3, 'glass', { visualOnly: true }),
  wheel(-8.6, 1.4),
  wheel(-8.6, -1.4),
  wheel(-6.9, 1.4),
  wheel(-6.9, -1.4),
];

export const HIGHWAY: ArenaDef = {
  id: 'rush-hour',
  name: 'Rush Hour',
  blurb: 'On the back of a speeding truck. Duck the low bridges, ride the swerves, keep off the road.',
  theme: 'highway',
  pieces,
  props: [
    { id: 'barrel1', shape: 'barrel', pos: { x: 3.6, y: 0.45, z: 0.9 }, half: { x: 0.3, y: 0.45, z: 0.3 }, mass: 9, color: 0x2f7fd1 },
    { id: 'barrel2', shape: 'barrel', pos: { x: -0.6, y: 0.45, z: -1.2 }, half: { x: 0.3, y: 0.45, z: 0.3 }, mass: 9, color: 0x2f7fd1 },
    { id: 'cone1', shape: 'cone', pos: { x: 5.2, y: 0.3, z: -1.0 }, half: { x: 0.22, y: 0.3, z: 0.22 }, mass: 1.5, color: 0xff6a1a },
    { id: 'cone2', shape: 'cone', pos: { x: 5.4, y: 0.3, z: 1.2 }, half: { x: 0.22, y: 0.3, z: 0.22 }, mass: 1.5, color: 0xff6a1a },
    { id: 'crate1', shape: 'crate', pos: { x: 1.6, y: 1.5, z: -0.9 }, half: { x: 0.3, y: 0.3, z: 0.3 }, mass: 5, color: 0xd9a066 },
  ],
  movers: [
    {
      // The other truck, drifting alongside in the next lane.
      id: 'neighbour',
      origin: { x: 0.5, y: -0.4, z: -4.75 },
      parts: [
        slab(-4.2, 4.2, -0.15, 0.15, -1.2, 1.2, 'deck', { friction: 0.85 }),
        slab(-6.0, -4.3, -0.4, 1.3, -1.1, 1.1, 'paint', { color: 0x3d7dd9 }),
        slab(-4.2, 4.2, 0.15, 0.6, -1.2, -1.1, 'paint', { color: 0x3d7dd9 }),
        ...[-5.2, -3.2, 3.2].flatMap((x) => [
          { ...wheel(x, 1.0), pos: { x, y: -0.6, z: 1.0 } },
          { ...wheel(x, -1.0), pos: { x, y: -0.6, z: -1.0 } },
        ]),
      ],
      motion: { type: 'sway', amplitude: { x: 2.5, y: 0, z: 0.6 }, period: 11 },
    },
    {
      // Low bridge: swept over both trucks by 'sweep' events.
      id: 'bridge',
      origin: { x: 0, y: 0, z: 0 },
      parts: [
        slab(-0.35, 0.35, 1.45, 2.1, -9, 9, 'concrete'),
        slab(-0.4, 0.4, 1.6, 2.6, -2.2, 2.2, 'paint', { color: 0x1f8a4c, visualOnly: true }),
        slab(-0.3, 0.3, -2, 2.1, 8.4, 9, 'concrete', { visualOnly: true }),
        slab(-0.3, 0.3, -2, 2.1, -9, -8.4, 'concrete', { visualOnly: true }),
      ],
      motion: { type: 'sweep', from: { x: -75, y: 0, z: 0 }, to: { x: 70, y: 0, z: 0 }, speed: 16 },
    },
  ],
  hazards: [
    // Headwind pushing everything towards the back of the truck.
    { kind: 'wind', box: { min: { x: -12, y: -1, z: -7 }, max: { x: 10, y: 6, z: 3 } }, accel: { x: 2.4, y: 0, z: 0 } },
  ],
  events: [
    { kind: 'swerve', start: 12, every: [9, 15], accel: 6, duration: 0.7, warn: 'Swerve!' },
    { kind: 'sweep', start: 22, every: [16, 24], mover: 'bridge', warnTime: 2.5, warn: 'LOW BRIDGE — get down!' },
    { kind: 'intensify', start: 100, target: 0, scale: 0.6, warn: 'The driver is losing it!' },
    { kind: 'intensify', start: 130, target: 1, scale: 0.6 },
  ],
  hills: [
    { pos: { x: 0, y: 0, z: 0.2 }, radius: 1.5 },
    { pos: { x: -7.55, y: 1.4, z: 0 }, radius: 1.0 },
    { pos: { x: 4.2, y: 0, z: 0 }, radius: 1.4 },
  ],
  goals: [
    { min: { x: -6.1, y: -0.2, z: -2.2 }, max: { x: -4.8, y: 2.5, z: 2.2 } },
    { min: { x: 4.8, y: -0.2, z: -2.2 }, max: { x: 6.1, y: 2.5, z: 2.2 } },
  ],
  trophySpawn: { x: 0, y: 1.2, z: 0 },
  spawns: [
    { x: -4.2, y: 0, z: -0.6 },
    { x: 4.2, y: 0, z: 0.6 },
    { x: -0.4, y: 0, z: -1.1 },
    { x: 0.2, y: 0, z: 1.1 },
  ],
  bounds: { minX: -6.1, maxX: 6.1, minZ: -2.2, maxZ: 2.2, floorY: 0 },
  killY: -1.0,
  killCause: 'road',
  scrollSpeed: 16,
};
