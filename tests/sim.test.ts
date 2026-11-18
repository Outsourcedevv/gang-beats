import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/sim/physics';
import { GameSim } from '../src/sim/game';
import { TEST_ARENA } from '../src/sim/arena';
import type { PlayerInput } from '../src/sim/input';
import { emptyInput } from '../src/sim/input';
import { rotate } from '../src/sim/math';
import type { SimEvent } from '../src/sim/events';

beforeAll(async () => {
  await initPhysics();
});

const seconds = (s: number) => Math.round(s * 60);

function run(sim: GameSim, steps: number, inputs: (t: number) => (PlayerInput | undefined)[], events?: SimEvent[]) {
  for (let i = 0; i < steps; i++) {
    sim.step(inputs(i));
    const ev = sim.drainEvents();
    if (events) events.push(...ev);
  }
}

function uprightness(sim: GameSim, i: number): number {
  const q = sim.characters[i].part('torso').body.rotation();
  return rotate(q, { x: 0, y: 1, z: 0 }).y;
}

/** Place two characters facing each other `gap` metres apart (pelvis to pelvis). */
// An open patch of roof with nothing in the way.
const CX = -2.6;
const CZ = -0.9;
function faceOff(sim: GameSim, gap: number) {
  sim.characters[0].reset(sim.world, { x: CX - gap / 2, y: 0.02, z: CZ }, Math.PI / 2);
  sim.characters[1].reset(sim.world, { x: CX + gap / 2, y: 0.02, z: CZ }, -Math.PI / 2);
}

describe('character physics', () => {
  it('stands upright on its own', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    run(sim, seconds(4), () => [emptyInput()]);
    const c = sim.characters[0];
    const y = c.part('pelvis').body.translation().y;
    expect(c.state).toBe('active');
    expect(uprightness(sim, 0)).toBeGreaterThan(0.9);
    expect(y).toBeGreaterThan(0.5);
    expect(y).toBeLessThan(0.9);
    expect(c.grounded).toBe(true);
    sim.dispose();
  });

  it('walks in the commanded direction and stays upright', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    sim.characters[0].reset(sim.world, { x: -5.5, y: 0.02, z: -0.9 }, Math.PI / 2);
    run(sim, seconds(0.5), () => [emptyInput()]);
    const x0 = sim.characters[0].part('pelvis').body.translation().x;
    let minUp = 1;
    for (let i = 0; i < seconds(1.5); i++) {
      sim.step([{ ...emptyInput(), moveX: 1 }]);
      minUp = Math.min(minUp, uprightness(sim, 0));
    }
    const p = sim.characters[0].part('pelvis').body.translation();
    expect(p.x - x0).toBeGreaterThan(3);
    expect(Math.abs(p.z + 0.9)).toBeLessThan(0.6);
    expect(minUp).toBeGreaterThan(0.75);
    sim.dispose();
  });

  it('jumps off the ground', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    run(sim, seconds(1), () => [emptyInput()]);
    let maxY = 0;
    for (let i = 0; i < seconds(1.2); i++) {
      sim.step([{ ...emptyInput(), jump: i < 3 }]);
      maxY = Math.max(maxY, sim.characters[0].part('pelvis').body.translation().y);
    }
    expect(maxY).toBeGreaterThan(1.3);
    expect(uprightness(sim, 0)).toBeGreaterThan(0.8);
    sim.dispose();
  });

  it('punches register hits, add daze and knock back', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 2, sandbox: true });
    faceOff(sim, 0.95);
    run(sim, seconds(0.5), () => [emptyInput(), emptyInput()]);
    const x1 = sim.characters[1].part('torso').body.translation().x;
    const events: SimEvent[] = [];
    run(sim, seconds(0.5), (t) => [{ ...emptyInput(), punch: t < 3 }, emptyInput()], events);
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits.length).toBe(1);
    expect(sim.characters[1].daze).toBeGreaterThan(5);
    expect(sim.characters[1].part('torso').body.translation().x).toBeGreaterThan(x1 + 0.05);
    sim.dispose();
  });

  it('repeated punches knock an opponent out, who later recovers', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 2, sandbox: true });
    faceOff(sim, 1.15);
    const events: SimEvent[] = [];
    // Keep walking into the victim while jabbing.
    let koAt = -1;
    for (let i = 0; i < seconds(12) && koAt < 0; i++) {
      const v = sim.characters[1].torsoPos;
      const a = sim.characters[0].torsoPos;
      const dx = v.x - a.x;
      const dz = v.z - a.z;
      const d = Math.hypot(dx, dz);
      const inp = { ...emptyInput(), moveX: d > 1.0 ? dx / d : 0, moveZ: d > 1.0 ? dz / d : 0, punch: i % 24 < 2 };
      sim.step([inp, emptyInput()]);
      events.push(...sim.drainEvents());
      if (sim.characters[1].state === 'ko') koAt = i;
    }
    expect(koAt).toBeGreaterThan(0);
    // Victim stays physically present and helpless, then gets up again.
    run(sim, seconds(6), () => [emptyInput(), emptyInput()], events);
    expect(events.some((e) => e.type === 'recover' && e.char === 1)).toBe(true);
    run(sim, seconds(2.5), () => [emptyInput(), emptyInput()]);
    expect(sim.characters[1].state).toBe('active');
    expect(uprightness(sim, 1)).toBeGreaterThan(0.8);
    sim.dispose();
  });

  it('grabs with physical joints, lifts and throws an opponent', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 2, sandbox: true });
    faceOff(sim, 1.0);
    run(sim, seconds(0.4), () => [emptyInput(), emptyInput()]);
    sim.characters[1].knockOut(sim);
    const events: SimEvent[] = [];
    run(sim, seconds(0.8), () => [{ ...emptyInput(), grab: true }, emptyInput()], events);
    const held = sim.characters[0].arms.filter((a) => a.joint && a.grabOwner?.kind === 'char').length;
    expect(held).toBeGreaterThan(0);
    run(sim, seconds(1.2), () => [{ ...emptyInput(), grab: true, lift: true }, emptyInput()], events);
    const liftedY = sim.characters[1].torsoPos.y;
    expect(liftedY).toBeGreaterThan(1.7);
    const x0 = sim.characters[1].torsoPos.x;
    run(sim, seconds(1.0), () => [{ ...emptyInput(), grab: false, lift: true }, emptyInput()], events);
    expect(events.some((e) => e.type === 'throw')).toBe(true);
    expect(sim.characters[1].torsoPos.x).toBeGreaterThan(x0 + 2);
    expect(sim.characters[0].arms.every((a) => a.joint === null)).toBe(true);
    sim.dispose();
  });

  it('can hang from the railing by grabbing it', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    // Back railing top bar is at z = -5.35, y = 0.95. Stand just in front of it, facing it.
    sim.characters[0].reset(sim.world, { x: -5, y: 0.02, z: -4.75 }, Math.PI);
    run(sim, seconds(1.2), () => [{ ...emptyInput(), grab: true }]);
    const c = sim.characters[0];
    expect(c.arms.some((a) => a.joint && a.grabOwner?.kind === 'env')).toBe(true);
    sim.dispose();
  });

  it('falling off the roof eliminates the character and ends the round', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 2 });
    const events: SimEvent[] = [];
    run(sim, seconds(2.5), () => [emptyInput(), emptyInput()], events); // countdown
    sim.characters[1].reset(sim.world, { x: 0, y: 2, z: 9 }, 0); // in mid-air beyond the edge
    run(sim, seconds(4), () => [emptyInput(), emptyInput()], events);
    expect(sim.characters[1].state).toBe('eliminated');
    expect(events.some((e) => e.type === 'roundEnd' && e.winner === 0)).toBe(true);
    expect(sim.rules.scores[0]).toBe(1);
    sim.dispose();
  });

  it('stays numerically stable in a long chaotic brawl', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 4, sandbox: true, seed: 7 });
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const inputs: PlayerInput[] = sim.characters.map(() => emptyInput());
    for (let i = 0; i < seconds(30); i++) {
      if (i % 20 === 0) {
        for (const inp of inputs) {
          inp.moveX = rnd() * 2 - 1;
          inp.moveZ = rnd() * 2 - 1;
          inp.jump = rnd() < 0.2;
          inp.punch = rnd() < 0.5;
          inp.grab = rnd() < 0.3;
          inp.lift = rnd() < 0.2;
          inp.kick = rnd() < 0.2;
          inp.headbutt = rnd() < 0.1;
          inp.dive = rnd() < 0.08;
          inp.sprint = rnd() < 0.4;
        }
      }
      sim.step(inputs);
      sim.drainEvents();
    }
    for (const c of sim.characters) {
      if (!c.alive) continue;
      for (const p of c.rag.parts) {
        const t = p.body.translation();
        expect(Number.isFinite(t.x + t.y + t.z)).toBe(true);
        expect(Math.abs(t.x) + Math.abs(t.z)).toBeLessThan(80);
      }
    }
    sim.dispose();
  });
});

describe('bots and match flow', () => {
  it('bots fight each other until rounds are decided', async () => {
    const { Bot } = await import('../src/sim/bot');
    const sim = new GameSim({ arena: TEST_ARENA, players: 4, seed: 99 });
    const bots = sim.characters.map((c) => new Bot(c.index, c.index * 31 + 5, 0.9));
    const events: SimEvent[] = [];
    // Up to 6 simulated minutes.
    for (let i = 0; i < seconds(360); i++) {
      sim.step(bots.map((b) => b.think(sim, sim.dt)));
      events.push(...sim.drainEvents());
      if (events.filter((e) => e.type === 'roundEnd').length >= 2) break;
    }
    const counts = (t: SimEvent['type']) => events.filter((e) => e.type === t).length;
    expect(counts('hit')).toBeGreaterThan(20);
    expect(counts('eliminated')).toBeGreaterThan(2);
    expect(counts('roundEnd')).toBeGreaterThanOrEqual(2);
    sim.dispose();
  });
});
