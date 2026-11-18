import type { GameSim } from './game';

export type RoundPhase = 'countdown' | 'fight' | 'roundOver' | 'matchOver' | 'sandbox';

export const WINS_TO_WIN_MATCH = 3;
const COUNTDOWN = 2.2;
const LAST_STANDING_GRACE = 1.2; // simultaneous falls count as a draw
const ROUND_OVER_TIME = 3.6;
const MATCH_OVER_TIME = 6.5;

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
  ) {
    this.scores = sim.characters.map(() => 0);
    this.phase = sandbox ? 'sandbox' : 'countdown';
    this.timer = COUNTDOWN;
    if (!sandbox) sim.emit({ type: 'roundStart', round: this.round });
  }

  inputsEnabled(): boolean {
    return this.phase !== 'countdown';
  }

  aliveCount(): number {
    return this.sim.characters.filter((c) => c.alive).length;
  }

  update(dt: number): void {
    const sim = this.sim;
    switch (this.phase) {
      case 'sandbox':
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
