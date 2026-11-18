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
const E = emptyInput;
const CX = -2.6;
const CZ = -0.9;

function run(sim: GameSim, steps: number, inputs: (t: number) => (PlayerInput | undefined)[], events?: SimEvent[]) {
  for (let i = 0; i < steps; i++) {
    sim.step(inputs(i));
    const ev = sim.drainEvents();
    if (events) events.push(...ev);
  }
}

const upright = (sim: GameSim, i: number) => rotate(sim.characters[i].part('torso').body.rotation(), { x: 0, y: 1, z: 0 }).y;

function duel(gap: number, x = CX, z = CZ): GameSim {
  const sim = new GameSim({ arena: TEST_ARENA, players: 2, sandbox: true });
  sim.characters[0].reset(sim.world, { x: x - gap / 2, y: 0.02, z }, Math.PI / 2);
  sim.characters[1].reset(sim.world, { x: x + gap / 2, y: 0.02, z }, -Math.PI / 2);
  run(sim, seconds(0.4), () => [E(), E()]);
  return sim;
}

/** Victim torso X displacement half a second after one press of `action`. */
function shove(action: 'punch' | 'kick'): { hits: SimEvent[]; dx: number } {
  const sim = duel(0.95);
  const x0 = sim.characters[1].torsoPos.x;
  const events: SimEvent[] = [];
  run(sim, seconds(0.6), (t) => [{ ...E(), [action]: t < 2 }, E()], events);
  const dx = sim.characters[1].torsoPos.x - x0;
  sim.dispose();
  return { hits: events.filter((e) => e.type === 'hit'), dx };
}

describe('stage 2 combat', () => {
  it('kicks connect and shove harder than punches', () => {
    const punch = shove('punch');
    const kick = shove('kick');
    expect(kick.hits.length).toBe(1);
    expect(kick.hits[0].type === 'hit' && kick.hits[0].kind).toBe('kick');
    expect(kick.dx).toBeGreaterThan(punch.dx);
    expect(kick.dx).toBeGreaterThan(0.25);
  });

  it('headbutts daze the victim (and the attacker a little)', () => {
    const sim = duel(0.85);
    const events: SimEvent[] = [];
    run(sim, seconds(0.6), (t) => [{ ...E(), headbutt: t < 2 }, E()], events);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.kind).toBe('headbutt');
    expect(sim.characters[1].daze).toBeGreaterThan(15);
    expect(sim.characters[0].daze).toBeGreaterThan(0);
    sim.dispose();
  });

  it('a running dive tackle flattens the target; the diver gets back up', () => {
    const sim = duel(4.5, -3.2);
    const events: SimEvent[] = [];
    let diveAt = -1;
    for (let i = 0; i < seconds(2) && !events.some((e) => e.type === 'hit'); i++) {
      const gap = sim.characters[1].torsoPos.x - sim.characters[0].torsoPos.x;
      const dive = gap < 2.2 && diveAt < 0;
      if (dive) diveAt = i;
      sim.step([{ ...E(), moveX: 1, sprint: true, dive }, E()]);
      events.push(...sim.drainEvents());
    }
    const hit = events.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.kind).toBe('dive');
    // Victim is knocked off balance and toppled.
    let minUp = 1;
    for (let i = 0; i < seconds(1); i++) {
      sim.step([E(), E()]);
      minUp = Math.min(minUp, upright(sim, 1));
    }
    expect(minUp).toBeLessThan(0.5);
    // Both get up again.
    run(sim, seconds(3), () => [E(), E()]);
    expect(upright(sim, 0)).toBeGreaterThan(0.8);
    expect(upright(sim, 1)).toBeGreaterThan(0.8);
    sim.dispose();
  });

  it('can dive out of a jump (jumping tackle), once per jump', () => {
    const sim = duel(6);
    const events: SimEvent[] = [];
    run(sim, seconds(0.15), (t) => [{ ...E(), jump: t < 2 }, E()], events);
    run(sim, seconds(0.1), (t) => [{ ...E(), dive: t < 2 }, E()], events);
    run(sim, seconds(0.1), (t) => [{ ...E(), dive: t < 2 }, E()], events);
    expect(events.filter((e) => e.type === 'dive').length).toBe(1);
    sim.dispose();
  });

  it('sprinting burns stamina, exhaustion blocks special moves, resting refills', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    const c = sim.characters[0];
    c.reset(sim.world, { x: -6.5, y: 0.02, z: -0.9 }, Math.PI / 2);
    // Sprint back and forth across open roof.
    for (let i = 0; i < seconds(9) && !c.exhausted; i++) {
      const dir = Math.floor(i / 90) % 2 === 0 ? 1 : -1;
      sim.step([{ ...E(), moveX: dir, sprint: true }]);
      sim.drainEvents();
    }
    expect(c.exhausted).toBe(true);
    const events: SimEvent[] = [];
    run(sim, seconds(0.2), (t) => [{ ...E(), dive: t < 2 }], events);
    expect(events.some((e) => e.type === 'dive')).toBe(false);
    run(sim, seconds(4), () => [E()]);
    expect(c.exhausted).toBe(false);
    expect(c.stamina).toBeGreaterThan(80);
    sim.dispose();
  });

  it('climbs onto the AC unit: grab the edge, then jump', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    const c = sim.characters[0];
    // AC unit: top at y=1.2, front face at z=-1.8. Stand in front, facing it.
    c.reset(sim.world, { x: -4.2, y: 0.02, z: -1.15 }, Math.PI);
    run(sim, seconds(0.8), () => [{ ...E(), grab: true }]);
    expect(c.envGrips()).toBeGreaterThan(0);
    const events: SimEvent[] = [];
    run(sim, seconds(1.6), (t) => [{ ...E(), grab: t < 1 ? true : false, jump: t === 1 || t === 2, moveZ: t > 20 ? -0.4 : 0 }], events);
    expect(events.some((e) => e.type === 'climb')).toBe(true);
    const p = c.part('pelvis').body.translation();
    expect(p.y).toBeGreaterThan(1.5); // standing on top of the unit
    sim.dispose();
  });

  it('hanging off a railing drains stamina until the grip fails', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    const c = sim.characters[0];
    // Outside the back railing (top bar z=-5.35, y=0.95), facing it, hands level with it.
    c.reset(sim.world, { x: -5, y: -0.62, z: -5.85 }, 0);
    run(sim, seconds(0.6), () => [{ ...E(), grab: true }]);
    expect(c.envGrips()).toBeGreaterThan(0);
    const s0 = c.stamina;
    run(sim, seconds(2), () => [{ ...E(), grab: true }]);
    expect(c.envGrips()).toBeGreaterThan(0);
    expect(c.stamina).toBeLessThan(s0 - 8);
    c.stamina = 2;
    run(sim, seconds(3), () => [{ ...E(), grab: true }]);
    expect(c.envGrips()).toBe(0);
    expect(c.state).toBe('eliminated');
    sim.dispose();
  });

  it('can climb back onto the roof from a ledge hang', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    const c = sim.characters[0];
    // The gap in the back railing (x -1.2..2.2): hang off the roof lip.
    c.reset(sim.world, { x: 0.5, y: -0.62, z: -5.85 }, 0);
    run(sim, seconds(0.8), () => [{ ...E(), grab: true }]);
    expect(c.envGrips()).toBeGreaterThan(0);
    run(sim, seconds(2), (t) => [{ ...E(), grab: t < 2, jump: t === 2 || t === 3, moveZ: t > 10 ? 1 : 0 }]);
    const p = c.part('pelvis').body.translation();
    expect(c.state).toBe('active');
    expect(p.z).toBeGreaterThan(-5.3);
    expect(p.y).toBeGreaterThan(0.3);
    sim.dispose();
  });

  it('a thrown crate hurts whoever it hits', () => {
    const sim = new GameSim({ arena: TEST_ARENA, players: 1, sandbox: true });
    const c = sim.characters[0];
    c.reset(sim.world, { x: CX, y: 0.02, z: CZ }, Math.PI / 2);
    run(sim, seconds(0.4), () => [E()]);
    const crate = sim.props.find((p) => p.def.shape === 'crate')!;
    crate.body.setTranslation({ x: CX - 2.5, y: 1.5, z: CZ }, true);
    crate.body.setLinvel({ x: 10, y: 2, z: 0 }, true);
    const events: SimEvent[] = [];
    run(sim, seconds(0.6), () => [E()], events);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.kind).toBe('prop');
    expect(c.daze).toBeGreaterThan(5);
    sim.dispose();
  });

  it('gets back up after being flattened', () => {
    const sim = duel(3);
    const c = sim.characters[1];
    c.stun(1.0);
    c.part('torso').body.applyImpulse({ x: 0, y: 0, z: 60 }, true);
    run(sim, seconds(1.0), () => [E(), E()]);
    expect(upright(sim, 1)).toBeLessThan(0.6);
    let t = 0;
    while (upright(sim, 1) < 0.85 && t < seconds(4)) {
      sim.step([E(), E()]);
      sim.drainEvents();
      t++;
    }
    expect(t / 60).toBeLessThan(2.5);
    sim.dispose();
  });
});
