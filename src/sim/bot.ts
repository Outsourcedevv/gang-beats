import type { GameSim } from './game';
import type { PlayerInput } from './input';
import { emptyInput } from './input';
import { makeRng } from './math';

type Mode = 'hunt' | 'carry' | 'retreat';

/**
 * Simple brawler AI. Produces the same PlayerInput a human would, so bots run
 * through exactly the same physics (and can run on the server later).
 */
export class Bot {
  private rng: () => number;
  private input: PlayerInput = emptyInput();
  private mode: Mode = 'hunt';
  private target = -1;
  private retarget = 0;
  private punchCd = 0;
  private grabTimer = 0;
  private carryTimer = 0;
  private retreatTimer = 0;
  private wobble = 0;
  private stuckTimer = 0;
  private mashTimer = 0;

  constructor(
    readonly index: number,
    seed = index * 977 + 13,
    /** 0 (sleepy) .. 1 (relentless) */
    readonly aggression = 0.6,
  ) {
    this.rng = makeRng(seed);
  }

  think(sim: GameSim, dt: number): PlayerInput {
    const inp = this.input;
    const me = sim.characters[this.index];
    inp.jump = false;
    inp.punch = false;
    inp.moveX = 0;
    inp.moveZ = 0;
    if (!me || !me.alive) return inp;

    // Knocked out: mash buttons to come round faster.
    if (me.state === 'ko') {
      this.mashTimer -= dt;
      if (this.mashTimer <= 0) {
        inp.punch = true;
        this.mashTimer = 0.18 + this.rng() * 0.3;
      }
      inp.grab = false;
      inp.lift = false;
      this.mode = 'hunt';
      return inp;
    }

    const pos = me.part('pelvis').body.translation();
    const b = sim.arena.bounds;
    const edgeDist = Math.min(pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z);
    this.punchCd -= dt;
    this.retarget -= dt;
    this.wobble += dt * (0.7 + this.rng() * 0.6);

    if (this.retarget <= 0 || !sim.characters[this.target]?.alive || this.target === this.index) {
      this.pickTarget(sim);
      this.retarget = 1.2 + this.rng() * 1.5;
    }
    const tgt = sim.characters[this.target];

    const holdingChar = me.arms.some((a) => a.joint && a.grabOwner?.kind === 'char');

    // Being held: wriggle and mash to break free.
    if (me.heldBy(sim).length) {
      this.mashTimer -= dt;
      if (this.mashTimer <= 0) {
        if (this.rng() < 0.5) inp.jump = true;
        else inp.punch = true;
        this.mashTimer = 0.15 + this.rng() * 0.35 / (0.5 + this.aggression);
      }
      const away = sim.characters[me.heldBy(sim)[0].index].torsoPos;
      const dx = pos.x - away.x;
      const dz = pos.z - away.z;
      const l = Math.hypot(dx, dz) || 1;
      inp.moveX = dx / l;
      inp.moveZ = dz / l;
      return inp;
    }

    if (this.mode === 'carry') {
      this.carryTimer += dt;
      if (!holdingChar) {
        this.mode = 'hunt';
        inp.grab = false;
        inp.lift = false;
      } else {
        inp.grab = true;
        inp.lift = true;
        // Walk toward the nearest edge, then throw.
        const out = this.nearestEdgeDir(sim, pos.x, pos.z);
        inp.moveX = out.x;
        inp.moveZ = out.z;
        if ((edgeDist < 1.6 && me.liftAmount > 0.8) || this.carryTimer > 4) {
          inp.grab = false; // release while lifting = throw
          this.mode = 'retreat';
          this.retreatTimer = 0.9;
        }
        return inp;
      }
    }

    if (this.mode === 'retreat' || (edgeDist < 1.0 && this.mode === 'hunt')) {
      if (this.mode !== 'retreat') {
        this.mode = 'retreat';
        this.retreatTimer = 0.6 + this.rng() * 0.4;
      }
      this.retreatTimer -= dt;
      const cx = (b.minX + b.maxX) / 2 - pos.x;
      const cz = (b.minZ + b.maxZ) / 2 - pos.z;
      const l = Math.hypot(cx, cz) || 1;
      inp.moveX = cx / l;
      inp.moveZ = cz / l;
      inp.grab = false;
      inp.lift = false;
      if (this.retreatTimer <= 0) this.mode = 'hunt';
      return inp;
    }

    if (!tgt) return inp;
    const tp = tgt.part('pelvis').body.translation();
    const dx = tp.x - pos.x;
    const dz = tp.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;

    if (d > 0.95) {
      // Approach with a bit of sideways wobble so bots don't look robotic.
      const side = Math.sin(this.wobble * 2) * 0.35;
      inp.moveX = nx - nz * side;
      inp.moveZ = nz + nx * side;
      inp.grab = false;
      inp.lift = false;
      this.grabTimer = 0;
      // Unstick: jump if we're not getting anywhere.
      const v = me.part('pelvis').body.linvel();
      if (Math.hypot(v.x, v.z) < 0.4) this.stuckTimer += dt;
      else this.stuckTimer = 0;
      if (this.stuckTimer > 0.8) {
        inp.jump = true;
        this.stuckTimer = 0;
      }
    } else {
      // In range.
      inp.moveX = nx * 0.3;
      inp.moveZ = nz * 0.3;
      if (tgt.state === 'ko' || this.grabTimer > 0) {
        this.grabTimer += dt;
        inp.grab = true;
        if (holdingChar) {
          inp.lift = true;
          // Only bother carrying someone who can't fight back.
          if (me.liftAmount > 0.6 && tgt.state === 'ko') {
            this.mode = 'carry';
            this.carryTimer = 0;
          }
        }
        if ((this.grabTimer > 2.2 && !holdingChar) || (this.grabTimer > 1.6 && tgt.state !== 'ko')) {
          this.grabTimer = 0;
          inp.grab = false;
          inp.lift = false;
        }
      } else if (this.punchCd <= 0) {
        inp.punch = true;
        this.punchCd = (0.4 + this.rng() * 0.6) / (0.5 + this.aggression);
        if (this.rng() < 0.08 * this.aggression) this.grabTimer = 0.01;
      }
      if (this.rng() < 0.004) inp.jump = true;
    }
    return inp;
  }

  private pickTarget(sim: GameSim): void {
    const me = sim.characters[this.index];
    const p = me.part('pelvis').body.translation();
    let best = -1;
    let bestD = Infinity;
    for (const c of sim.characters) {
      if (c.index === this.index || !c.alive) continue;
      const q = c.part('pelvis').body.translation();
      // Prefer the closest, with a little randomness.
      const d = Math.hypot(q.x - p.x, q.z - p.z) * (0.8 + this.rng() * 0.4);
      if (d < bestD) {
        bestD = d;
        best = c.index;
      }
    }
    this.target = best;
  }

  private nearestEdgeDir(sim: GameSim, x: number, z: number): { x: number; z: number } {
    const b = sim.arena.bounds;
    const options = [
      { d: x - b.minX, x: -1, z: 0 },
      { d: b.maxX - x, x: 1, z: 0 },
      { d: z - b.minZ, x: 0, z: -1 },
      { d: b.maxZ - z, x: 0, z: 1 },
    ];
    options.sort((a, c) => a.d - c.d);
    return options[0];
  }
}
