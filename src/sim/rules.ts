import type { GameSim } from './game';

export type RoundPhase = 'countdown' | 'fight' | 'roundOver' | 'matchOver' | 'sandbox' | 'switching';

/** Carried over when the match moves to a new arena between rounds. */
export interface RulesResume {
  round: number;
  scores: number[];
}

export const WINS_TO_WIN_MATCH = 3;
const COUNTDOWN = 2.2;
const LAST_STANDING_GRACE = 1.2; // simultaneous falls count as a draw
const ROUND_OVER_TIME = 3.6;
const MATCH_OVER_TIME = 6.5;
/** Rounds that drag on past this end in a draw (arenas also escalate well before). */
export const ROUND_TIME_LIMIT = 240;

/**
 * Last-player-standing rounds, first to three round wins.
 * (Stage 5 will generalise this into pluggable game modes.)
 */
export class RoundRules {
  phase: RoundPhase;
  timer = 0;
  round = 1;
  scores: number[];
  /** Winner of the last finished round: character index, or -1 for a draw. */
  roundWinner = -1;
  matchWinner = -1;
  roundTime = 0;
  private graceTimer = 0;

  constructor(
    private readonly sim: GameSim,
    sandbox: boolean,
    resume?: RulesResume,
  ) {
    this.scores = sim.characters.map((_, i) => resume?.scores[i] ?? 0);
    if (resume) this.round = resume.round;
    this.phase = sandbox ? 'sandbox' : 'countdown';
    this.timer = COUNTDOWN;
    if (!sandbox) sim.emit({ type: 'roundStart', round: this.round });
  }

  inputsEnabled(): boolean {
    return this.phase !== 'countdown' && this.phase !== 'switching';
  }

  aliveCount(): number {
    return this.sim.characters.filter((c) => c.alive).length;
  }

  update(dt: number): void {
    const sim = this.sim;
    switch (this.phase) {
      case 'sandbox':
      case 'switching':
        return;
      case 'countdown':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'fight';
          this.roundTime = 0;
          this.graceTimer = 0;
          sim.emit({ type: 'fight' });
        }
        return;
      case 'fight': {
        this.roundTime += dt;
        if (sim.characters.length < 2) return;
        if (this.roundTime >= ROUND_TIME_LIMIT) {
          sim.emit({ type: 'timeUp' });
          this.roundWinner = -1;
          sim.emit({ type: 'roundEnd', winner: -1 });
          this.phase = 'roundOver';
          this.timer = ROUND_OVER_TIME;
          return;
        }
        const alive = sim.characters.filter((c) => c.alive);
        if (alive.length <= 1) {
          this.graceTimer += dt;
          if (this.graceTimer >= LAST_STANDING_GRACE) {
            const still = sim.characters.filter((c) => c.alive);
            this.roundWinner = still.length === 1 ? still[0].index : -1;
            if (this.roundWinner >= 0) this.scores[this.roundWinner]++;
            sim.emit({ type: 'roundEnd', winner: this.roundWinner });
            this.phase = 'roundOver';
            this.timer = ROUND_OVER_TIME;
          }
        } else {
          this.graceTimer = 0;
        }
        return;
      }
      case 'roundOver':
        this.timer -= dt;
        if (this.timer <= 0) {
          const champ = this.scores.findIndex((s) => s >= WINS_TO_WIN_MATCH);
          if (champ >= 0) {
            this.matchWinner = champ;
            this.phase = 'matchOver';
            this.timer = MATCH_OVER_TIME;
            sim.emit({ type: 'matchEnd', winner: champ });
          } else {
            this.startRound(this.round + 1);
          }
        }
        return;
      case 'matchOver':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.scores = this.scores.map(() => 0);
          this.matchWinner = -1;
          this.startRound(1);
        }
        return;
    }
  }

  startRound(n: number): void {
    this.round = n;
    const next = this.sim.nextArena?.(n);
    if (next && next.id !== this.sim.arena.id) {
      // The host builds a fresh simulation on the new arena and resumes from here.
      this.phase = 'switching';
      this.sim.pendingArena = { arena: next, resume: { round: n, scores: [...this.scores] } };
      this.sim.emit({ type: 'arenaChange', arena: next.id });
      return;
    }
    this.sim.resetRound();
    this.phase = 'countdown';
    this.timer = COUNTDOWN;
    this.roundWinner = -1;
    this.sim.emit({ type: 'roundStart', round: n });
  }

  /** Restart the whole match immediately. */
  restartMatch(): void {
    this.scores = this.scores.map(() => 0);
    this.matchWinner = -1;
    this.startRound(1);
  }
}
