import type { Vec3 } from './math';
import type { EliminationCause } from './arena';

export type AttackKind = 'punch' | 'kick' | 'headbutt' | 'dive' | 'prop';

/** Gameplay events emitted by the sim. Plain data so they can be sent over the network. */
export type SimEvent =
  | { type: 'punch'; char: number }
  | { type: 'kick'; char: number }
  | { type: 'headbutt'; char: number }
  | { type: 'dive'; char: number }
  | { type: 'climb'; char: number }
  | { type: 'exhausted'; char: number }
  | { type: 'getup'; char: number }
  | { type: 'hit'; attacker: number; victim: number; pos: Vec3; strength: number; head: boolean; kind: AttackKind }
  | { type: 'propHit'; prop: number; pos: Vec3; strength: number }
  | { type: 'ko'; char: number }
  | { type: 'recover'; char: number }
  | { type: 'grab'; char: number; pos: Vec3; target: 'char' | 'prop' | 'env' }
  | { type: 'throw'; char: number; victim: number; prop?: number }
  | { type: 'jump'; char: number }
  | { type: 'land'; char: number; pos: Vec3; strength: number }
  | { type: 'impact'; char: number; pos: Vec3; strength: number }
  | { type: 'topple'; char: number }
  | { type: 'escape'; char: number }
  | { type: 'eliminated'; char: number; cause: EliminationCause; pos: Vec3 }
  | { type: 'warning'; text: string }
  | { type: 'swerve'; dir: number }
  | { type: 'gust'; dir: Vec3 }
  | { type: 'sweepWarning'; mover: string }
  | { type: 'drop'; pos: Vec3 }
  | { type: 'creak'; pos: Vec3 }
  | { type: 'shatter'; pos: Vec3; half: Vec3 }
  | { type: 'break'; pos: Vec3 }
  | { type: 'bounce'; char: number; pos: Vec3 }
  | { type: 'crush'; char: number; pos: Vec3 }
  | { type: 'timeUp' }
  | { type: 'respawn'; char: number }
  | { type: 'emote'; char: number; kind: string }
  | { type: 'hillMove'; index: number }
  | { type: 'goal'; team: number; pos: Vec3 }
  | { type: 'potatoPass'; from: number; to: number }
  | { type: 'explode'; char: number; pos: Vec3 }
  | { type: 'arenaChange'; arena: string }
  | { type: 'roundStart'; round: number }
  | { type: 'fight' }
  | { type: 'roundEnd'; winner: number }
  | { type: 'matchEnd'; winner: number };
