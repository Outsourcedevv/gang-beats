import type { Vec3 } from './math';

/** Gameplay events emitted by the sim. Plain data so they can be sent over the network. */
export type SimEvent =
  | { type: 'punch'; char: number }
  | { type: 'hit'; attacker: number; victim: number; pos: Vec3; strength: number; head: boolean }
  | { type: 'ko'; char: number }
  | { type: 'recover'; char: number }
  | { type: 'grab'; char: number; pos: Vec3; target: 'char' | 'prop' | 'env' }
  | { type: 'throw'; char: number; victim: number }
  | { type: 'jump'; char: number }
  | { type: 'land'; char: number; pos: Vec3; strength: number }
  | { type: 'impact'; char: number; pos: Vec3; strength: number }
  | { type: 'topple'; char: number }
  | { type: 'escape'; char: number }
  | { type: 'eliminated'; char: number }
  | { type: 'roundStart'; round: number }
  | { type: 'fight' }
  | { type: 'roundEnd'; winner: number }
  | { type: 'matchEnd'; winner: number };
