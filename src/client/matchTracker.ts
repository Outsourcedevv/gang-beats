import type { SimEvent } from '../sim/events';
import type { MatchReport } from '../meta/progression';

/**
 * Watches one fighter ("me") through a match and builds the report that
 * progression turns into XP, coins and statistics.
 */
export class MatchTracker {
  private lastHitBy = new Map<number, { by: number; at: number }>();
  private maps = new Set<string>();
  private time = 0;
  readonly r: MatchReport;

  constructor(
    readonly me: number,
    private readonly sides: readonly number[],
    mode: string,
    online: boolean,
    arena: string,
  ) {
    this.r = { mode, maps: [], rounds: 0, roundWins: 0, won: false, kos: 0, ringOuts: 0, falls: 0, punches: 0, kicks: 0, headbutts: 0, dives: 0, throws: 0, climbs: 0, seconds: 0, online };
    this.maps.add(arena);
  }

  /** Time spent fighting (seconds). */
  tick(dt: number, fighting: boolean): void {
    this.time += dt;
    if (fighting) this.r.seconds += dt;
  }

  arena(id: string): void {
    this.maps.add(id);
  }

  private credited(victim: number, within: number): boolean {
    const h = this.lastHitBy.get(victim);
    return !!h && h.by === this.me && this.time - h.at <= within;
  }

  feed(ev: SimEvent): void {
    const me = this.me;
    const r = this.r;
    switch (ev.type) {
      case 'punch':
        if (ev.char === me) r.punches++;
        break;
      case 'kick':
        if (ev.char === me) r.kicks++;
        break;
      case 'headbutt':
        if (ev.char === me) r.headbutts++;
        break;
      case 'dive':
        if (ev.char === me) r.dives++;
        break;
      case 'climb':
        if (ev.char === me) r.climbs++;
        break;
      case 'throw':
        if (ev.char === me) r.throws++;
        if (ev.victim >= 0) this.lastHitBy.set(ev.victim, { by: ev.char, at: this.time });
        break;
      case 'hit':
        if (ev.attacker >= 0) this.lastHitBy.set(ev.victim, { by: ev.attacker, at: this.time });
        break;
      case 'ko':
        if (ev.char !== me && this.credited(ev.char, 2.5)) r.kos++;
        break;
      case 'eliminated':
        if (ev.char === me) r.falls++;
        else if (this.credited(ev.char, 5)) r.ringOuts++;
        break;
      case 'roundEnd':
        r.rounds++;
        if (ev.winner >= 0 && ev.winner === this.sides[me]) r.roundWins++;
        break;
      case 'matchEnd':
        r.won = ev.winner === this.sides[me];
        break;
      case 'arenaChange':
        this.maps.add(ev.arena);
        break;
    }
  }

  report(): MatchReport {
    return { ...this.r, maps: [...this.maps] };
  }
}
