import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/sim/physics';
import { GameSim } from '../src/sim/game';
import { ARENAS, FACTORY, FUNFAIR, HIGHWAY, TAR_TOP } from '../src/sim/arenas';
import type { ArenaDef } from '../src/sim/arena';
import type { PlayerInput } from '../src/sim/input';
import { emptyInput as E } from '../src/sim/input';
import { rotate } from '../src/sim/math';
import type { SimEvent } from '../src/sim/events';
import { Bot } from '../src/sim/bot';

beforeAll(async () => {
  await initPhysics();
});

const seconds = (s: number) => Math.round(s * 60);
const upright = (sim: GameSim, i: number) => rotate(sim.characters[i].part('torso').body.rotation(), { x: 0, y: 1, z: 0 }).y;

function run(sim: GameSim, steps: number, inputs: (t: number) => (PlayerInput | undefined)[] = () => [], events?: SimEvent[]) {
  for (let i = 0; i < steps; i++) {
    sim.step(inputs(i));
    const ev = sim.drainEvents();
    if (events) events.push(...ev);
  }
}

function solo(arena: ArenaDef, x: number, y: number, z: number, yaw = 0): GameSim {
  const sim = new GameSim({ arena, players: 1, sandbox: true });
  sim.characters[0].reset(sim.world, { x, y, z }, yaw);
  return sim;
}

describe.each(ARENAS.map((a) => [a.name, a] as const))('%s', (_name, arena) => {
  it('spawns four fighters who stand steady', () => {
    const sim = new GameSim({ arena, players: 4, sandbox: true });
    run(sim, seconds(3), () => [E(), E(), E(), E()]);
    for (let i = 0; i < 4; i++) {
      expect(sim.characters[i].state).toBe('active');
      expect(upright(sim, i)).toBeGreaterThan(0.8);
    }
    sim.dispose();
  });

  it('bots can finish a round', () => {
    const sim = new GameSim({ arena, players: 4, seed: 11 });
    const bots = sim.characters.map((c) => new Bot(c.index, c.index * 7 + 3, 0.8));
    let ended = false;
    for (let i = 0; i < seconds(250) && !ended; i++) {
      sim.step(bots.map((b) => b.think(sim, sim.dt)));
      ended = sim.drainEvents().some((e) => e.type === 'roundEnd');
    }
    expect(ended).toBe(true);
    sim.dispose();
  });
});

describe('Tar Top', () => {
  it('crashing onto the skylight shatters it and drops you into the building', () => {
    const sim = solo(TAR_TOP, 0.6, 2.2, 0.4);
    const events: SimEvent[] = [];
    run(sim, seconds(3), () => [E()], events);
    expect(events.some((e) => e.type === 'shatter')).toBe(true);
    const out = events.find((e) => e.type === 'eliminated');
    expect(out && out.type === 'eliminated' && out.cause).toBe('building');
    sim.dispose();
  });

  it('walking across the skylight does not break it', () => {
    const sim = solo(TAR_TOP, -1.2, 0.02, 0.4, Math.PI / 2);
    const events: SimEvent[] = [];
    run(sim, seconds(1.5), () => [{ ...E(), moveX: 1 }], events);
    expect(events.some((e) => e.type === 'shatter')).toBe(false);
    sim.dispose();
  });
});

describe('Grinder Works', () => {
  it('the conveyor carries a knocked-out fighter into the grinder', () => {
    const sim = solo(FACTORY, -2, 0.35, -3.5);
    sim.characters[0].knockOut(sim);
    const events: SimEvent[] = [];
    run(sim, seconds(9), () => [E()], events);
    const out = events.find((e) => e.type === 'eliminated');
    expect(out && out.type === 'eliminated' && out.cause).toBe('grinder');
    sim.dispose();
  });

  it('the hydraulic press flattens whoever stands under it', () => {
    const sim = solo(FACTORY, 0.5, 0.02, 0.9);
    const events: SimEvent[] = [];
    run(sim, seconds(6.5), () => [E()], events);
    expect(events.some((e) => e.type === 'crush')).toBe(true);
    expect(events.some((e) => e.type === 'ko')).toBe(true);
    sim.dispose();
  });

  it('the catwalk gives way under you', () => {
    const sim = solo(FACTORY, -5.7, 1.72, -0.1);
    const events: SimEvent[] = [];
    run(sim, seconds(3), () => [E()], events);
    expect(events.some((e) => e.type === 'creak')).toBe(true);
    expect(events.some((e) => e.type === 'break')).toBe(true);
    expect(sim.characters[0].part('pelvis').body.translation().y).toBeLessThan(1.2);
    sim.dispose();
  });

  it('falling off the front ends in the molten vat', () => {
    const sim = solo(FACTORY, 0, 1, 5);
    const events: SimEvent[] = [];
    run(sim, seconds(2), () => [E()], events);
    const out = events.find((e) => e.type === 'eliminated');
    expect(out && out.type === 'eliminated' && out.cause).toBe('molten');
    sim.dispose();
  });
});

describe('Rush Hour', () => {
  it('you can ride the truck in the next lane', () => {
    const sim = solo(HIGHWAY, 0.5, -0.2, -4.4);
    run(sim, seconds(8), () => [E()]);
    const c = sim.characters[0];
    expect(c.state).toBe('active');
    const n = sim.runtime.mover('neighbour')!;
    const p = c.part('pelvis').body.translation();
    expect(Math.abs(p.z - n.pos.z)).toBeLessThan(1.2);
    expect(Math.abs(p.x - n.pos.x)).toBeLessThan(4);
    sim.dispose();
  });

  it('a low bridge sweeps standing fighters off the deck', () => {
    const sim = solo(HIGHWAY, 0, 0.02, 0, Math.PI / 2);
    const events: SimEvent[] = [];
    run(sim, seconds(34), () => [E()], events);
    expect(events.some((e) => e.type === 'warning' && e.text.includes('LOW BRIDGE'))).toBe(true);
    const c = sim.characters[0];
    // Smacked: knocked out, or swept off onto the road.
    expect(c.state === 'eliminated' || events.some((e) => e.type === 'ko' || e.type === 'impact')).toBe(true);
    sim.dispose();
  });

  it('hitting the road is out', () => {
    const sim = solo(HIGHWAY, 0, 0.5, 3.2);
    const events: SimEvent[] = [];
    run(sim, seconds(2), () => [E()], events);
    const out = events.find((e) => e.type === 'eliminated');
    expect(out && out.type === 'eliminated' && out.cause).toBe('road');
    sim.dispose();
  });
});

describe('Wobbleland', () => {
  it('the carousel carries riders round', () => {
    const sim = solo(FUNFAIR, 1.5, 0.02, -0.5);
    const a0 = Math.atan2(-0.5 - -0.5, 1.5);
    run(sim, seconds(4), () => [E()]);
    const p = sim.characters[0].part('pelvis').body.translation();
    const a1 = Math.atan2(p.z + 0.5, p.x);
    expect(Math.abs(a1 - a0)).toBeGreaterThan(0.8);
    expect(sim.characters[0].state).toBe('active');
    sim.dispose();
  });

  it('rotten planks give way and you fall in the sea', () => {
    const sim = solo(FUNFAIR, -5.4, 0.02, -0.6);
    const events: SimEvent[] = [];
    run(sim, seconds(4), () => [E()], events);
    expect(events.some((e) => e.type === 'break')).toBe(true);
    const out = events.find((e) => e.type === 'eliminated');
    expect(out && out.type === 'eliminated' && out.cause).toBe('water');
    sim.dispose();
  });

  it('bounce pads launch you into the air', () => {
    const sim = solo(FUNFAIR, -6.3, 0.6, -4.3);
    let maxY = 0;
    const events: SimEvent[] = [];
    for (let i = 0; i < seconds(1.5); i++) {
      sim.step([E()]);
      events.push(...sim.drainEvents());
      maxY = Math.max(maxY, sim.characters[0].part('pelvis').body.translation().y);
    }
    expect(events.some((e) => e.type === 'bounce')).toBe(true);
    expect(maxY).toBeGreaterThan(2.5);
    sim.dispose();
  });
});

describe('map rotation', () => {
  it('switches arena between rounds and keeps the score', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, nextArena: () => FACTORY });
    run(sim, seconds(2.5), () => [E(), E()]);
    sim.characters[1].reset(sim.world, { x: 0, y: 2, z: 9 }, 0);
    run(sim, seconds(6), () => [E(), E()]);
    expect(sim.rules.scores[0]).toBe(1);
    expect(sim.pendingArena?.arena.id).toBe(FACTORY.id);
    expect(sim.pendingArena?.resume).toEqual({ round: 2, scores: [1, 0] });
    const next = new GameSim({ arena: sim.pendingArena!.arena, players: 2, resume: sim.pendingArena!.resume });
    expect(next.rules.round).toBe(2);
    expect(next.rules.scores).toEqual([1, 0]);
    sim.dispose();
    next.dispose();
  });
});

describe('Tar Top skylight', () => {
  it('a jump onto the skylight breaks it', () => {
    const sim = solo(TAR_TOP, 0.6, 0.12, 0.4);
    const events: SimEvent[] = [];
    run(sim, seconds(0.6), () => [E()], events);
    run(sim, seconds(2), (t) => [{ ...E(), jump: t < 2 }], events);
    expect(events.some((e) => e.type === 'shatter')).toBe(true);
    sim.dispose();
  });
});
