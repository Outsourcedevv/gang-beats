import type { ArenaDef } from './arena';
import type { BreakState } from './arenaRuntime';
import type { CharState } from './character';
import type { Vec3 } from './math';
import type { RoundPhase } from './rules';
import type { ModeId } from './modes';

// What the renderer and HUD need to draw a match. Implemented by the local
// GameSim and by the online client's snapshot-fed NetWorld, so the same views
// work for local and online play.

export interface FighterView {
  readonly state: CharState;
  readonly alive: boolean;
  readonly daze: number;
  readonly stamina: number;
  readonly exhausted: boolean;
  readonly koTimer: number;
  readonly hurtTimer: number;
  readonly effort: number;
  readonly airTime: number;
  readonly liftedBy: number;
  /** Gripping scenery while off the ground. */
  readonly hanging: boolean;
  readonly torsoPos: Vec3;
}

export interface RulesView {
  readonly phase: RoundPhase;
  readonly round: number;
  /** Round wins per side (fighter, or team in team modes). */
  readonly scores: readonly number[];
  readonly roundTime: number;
  readonly mode: ModeId;
  /** Side of each fighter. */
  readonly sides: readonly number[];
  readonly teamMode: boolean;
  readonly lives: readonly number[];
  /** In-round points per side (hill seconds, trophy goals). */
  readonly points: readonly number[];
  readonly hillIndex: number;
  readonly potatoHolder: number;
  readonly potatoTimer: number;
}

export interface WorldView {
  readonly arena: ArenaDef;
  readonly killY: number;
  readonly characters: readonly FighterView[];
  readonly rules: RulesView;
  readonly prevSnap: Float32Array;
  readonly currSnap: Float32Array;
  partOffset(charIndex: number, partIndex: number): number;
  propOffset(i: number): number;
  moverOffset(i: number): number;
  breakableOffset(i: number): number;
  propActive(i: number): boolean;
  breakState(i: number): BreakState;
}
