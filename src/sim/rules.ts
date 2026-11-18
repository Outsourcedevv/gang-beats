import type { GameSim } from './game';
import type { SimEvent } from './events';
import type { ModeId } from './modes';
import { KOTH_MOVE_EVERY, KOTH_TARGET, LIVES, POTATO_FUSE, RESPAWN_DELAY, TROPHY_TARGET, modeDef } from './modes';
import { inBox } from './arenaRuntime';

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
/** Rounds that drag on past this end (on points where the mode has them, else a draw). */
export const ROUND_TIME_LIMIT = 240;

/**
 * Round-based match rules for every game mode. Scores, round wins and match
 * wins belong to *sides*: each fighter in free-for-all modes, or a team.
 */
export class RoundRules {
  phase: RoundPhase;
  timer = 0;
  round = 1;
  /** Round wins per side. */
  scores: number[];
  /** Winner of the last finished round: side index, or -1 for a draw. */
  roundWinner = -1;
  matchWinner = -1;
  roundTime = 0;
  readonly mode: ModeId;
  /** Side of each fighter. */
  readonly sides: number[];
  readonly sideCount: number;
  readonly teamMode: boolean;
  /** Lives left per fighter (Last player standing). */
  lives: number[];
  /** In-round points per side (hill seconds, trophy goals). */
  points: number[];
  hillIndex = 0;
  potatoHolder = -1;
  potatoTimer = 0;
  private respawnAt: number[];
  private graceTimer = 0;
  private hillTimer = 0;
  private potatoGap = 0;

  constructor(
    private readonly sim: GameSim,
    sandbox: boolean,
    resume: RulesResume | undefined,
    mode: ModeId,
    sides: number[],
  ) {
    this.mode = mode;
    this.sides = sides;
    this.sideCount = Math.max(...sides, 0) + 1;
    this.teamMode = sides.some((s, i) => s !== i);
    this.scores = Array.from({ length: this.sideCount }, (_, i) => resume?.scores[i] ?? 0);
    if (resume) this.round = resume.round;
    this.lives = sides.map(() => LIVES);
    this.points = new Array(this.sideCount).fill(0);
    this.respawnAt = sides.map(() => -1);
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

  /** Sim events relevant to the rules (Hot Potato passes on hits). */
  onEvent(ev: SimEvent): void {
    if (this.mode !== 'potato' || this.phase !== 'fight') return;
    if (ev.type === 'hit' && ev.attacker === this.potatoHolder && ev.victim !== ev.attacker && this.sim.characters[ev.victim]?.alive) {
      this.potatoHolder = ev.victim;
      this.potatoTimer = Math.max(this.potatoTimer, 3);
      this.sim.emit({ type: 'potatoPass', from: ev.attacker, to: ev.victim });
    }
  }

  private sidesIn(): Set<number> {
    // A side is still in the round if anyone on it is alive or about to respawn.
    const s = new Set<number>();
    this.sim.characters.forEach((c, i) => {
      if (c.alive || this.respawnAt[i] >= 0) s.add(this.sides[i]);
    });
    return s;
  }

  private endRound(winner: number): void {
    this.roundWinner = winner;
    if (winner >= 0) this.scores[winner]++;
    this.sim.emit({ type: 'roundEnd', winner });
    this.phase = 'roundOver';
    this.timer = ROUND_OVER_TIME;
  }

  /** Side with strictly the most points, or -1. */
  private pointsLeader(): number {
    let best = -1;
    let bestPts = 0;
    let tie = false;
    this.points.forEach((p, i) => {
      if (p > bestPts) {
        best = i;
        bestPts = p;
        tie = false;
      } else if (p === bestPts && p > 0) tie = true;
    });
    return tie ? -1 : best;
  }

  private updateRespawns(): void {
    const respawns = modeDef(this.mode).respawn;
    const sim = this.sim;
    sim.characters.forEach((c, i) => {
      if (!c.alive && this.respawnAt[i] < 0 && respawns) {
        if (this.mode === 'lives') {
          this.lives[i] = Math.max(0, this.lives[i] - 1);
          if (this.lives[i] <= 0) return;
        }
        this.respawnAt[i] = this.roundTime + RESPAWN_DELAY;
        this.respawnAt[i] = Math.max(this.respawnAt[i], this.roundTime + 0.01);
      }
      if (this.respawnAt[i] >= 0 && this.roundTime >= this.respawnAt[i]) {
        this.respawnAt[i] = -1;
        sim.respawn(i);
      }
    });
  }

  private updateHill(dt: number): void {
    const hills = this.sim.arena.hills ?? [];
    if (!hills.length) return;
    this.hillTimer += dt;
    if (this.hillTimer >= KOTH_MOVE_EVERY && hills.length > 1) {
      this.hillTimer = 0;
      this.hillIndex = (this.hillIndex + 1) % hills.length;
      this.sim.emit({ type: 'hillMove', index: this.hillIndex });
    }
    const hill = hills[this.hillIndex];
    const present = new Set<number>();
    this.sim.characters.forEach((c, i) => {
      if (c.state !== 'active') return;
      const p = c.part('pelvis').body.translation();
      if (Math.hypot(p.x - hill.pos.x, p.z - hill.pos.z) <= hill.radius && Math.abs(p.y - (hill.pos.y + 0.7)) < 1.2) present.add(this.sides[i]);
    });
    if (present.size === 1) {
      const side = [...present][0];
      this.points[side] += dt;
      if (this.points[side] >= KOTH_TARGET) this.endRound(side);
    }
  }

  private updateTrophy(): void {
    const sim = this.sim;
    const goals = sim.arena.goals;
    const t = sim.trophyIndex;
    if (!goals || t < 0) return;
    const pos = sim.props[t].body.translation();
    for (let team = 0; team < 2; team++) {
      if (!inBox(pos, goals[team])) continue;
      this.points[team]++;
      sim.emit({ type: 'goal', team, pos: { x: pos.x, y: pos.y, z: pos.z } });
      sim.recycleProp(t);
      if (this.points[team] >= TROPHY_TARGET) this.endRound(team);
      return;
    }
  }

  private updatePotato(dt: number): void {
    const sim = this.sim;
    const holder = sim.characters[this.potatoHolder];
    if (!holder || !holder.alive) {
      // Hand it to someone new after a short breather.
      this.potatoGap -= dt;
      if (this.potatoGap > 0) return;
      const alive = sim.characters.filter((c) => c.alive);
      if (alive.length < 2) return;
      this.potatoHolder = alive[Math.floor(sim.rng() * alive.length)].index;
      this.potatoTimer = POTATO_FUSE[0] + sim.rng() * (POTATO_FUSE[1] - POTATO_FUSE[0]);
      sim.emit({ type: 'potatoPass', from: -1, to: this.potatoHolder });
      return;
    }
    this.potatoTimer -= dt;
    if (this.potatoTimer <= 0) {
      sim.explode(this.potatoHolder);
      this.potatoHolder = -1;
      this.potatoGap = 2;
    }
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
          this.hillTimer = 0;
          this.hillIndex = 0;
          this.points = this.points.map(() => 0);
          this.lives = this.lives.map(() => LIVES);
          this.respawnAt = this.respawnAt.map(() => -1);
          this.potatoHolder = -1;
          this.potatoGap = 0.5;
          sim.emit({ type: 'fight' });
        }
        return;
      case 'fight': {
        this.roundTime += dt;
        if (sim.characters.length < 2) return;
        this.updateRespawns();
        if (this.mode === 'koth') this.updateHill(dt);
        if (this.mode === 'trophy') this.updateTrophy();
        if (this.mode === 'potato') this.updatePotato(dt);
        if (this.phase !== 'fight') return;
        if (this.roundTime >= ROUND_TIME_LIMIT) {
          sim.emit({ type: 'timeUp' });
          this.endRound(this.mode === 'koth' || this.mode === 'trophy' ? this.pointsLeader() : -1);
          return;
        }
        const sides = this.sidesIn();
        if (sides.size <= 1) {
          this.graceTimer += dt;
          if (this.graceTimer >= LAST_STANDING_GRACE) {
            const still = this.sidesIn();
            this.endRound(still.size === 1 ? [...still][0] : -1);
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
