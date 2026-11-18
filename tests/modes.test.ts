import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/sim/physics';
import { GameSim } from '../src/sim/game';
import { TAR_TOP, ARENAS } from '../src/sim/arenas';
import type { PlayerInput } from '../src/sim/input';
import { emptyInput as E } from '../src/sim/input';
import type { SimEvent } from '../src/sim/events';
import type { ModeId } from '../src/sim/modes';
import { KOTH_TARGET, randomTeams, sidesFor } from '../src/sim/modes';
import { Bot } from '../src/sim/bot';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';

beforeAll(async () => {
  await initPhysics();
});

const seconds = (s: number) => Math.round(s * 60);

function run(sim: GameSim, steps: number, events?: SimEvent[], inputs?: (t: number) => (PlayerInput | undefined)[]) {
  for (let i = 0; i < steps; i++) {
    sim.step(inputs ? inputs(i) : sim.characters.map(() => E()));
    const ev = sim.drainEvents();
    if (events) events.push(...ev);
  }
}

/** Skip the countdown. */
function fight(sim: GameSim, events?: SimEvent[]) {
  run(sim, seconds(2.4), events);
  expect(sim.rules.phase).toBe('fight');
}

describe('mode helpers', () => {
  it('assigns sides', () => {
    expect(sidesFor('ffa', 4)).toEqual([0, 1, 2, 3]);
    expect(sidesFor('teams', 4, [1, 0, 1, 0])).toEqual([1, 0, 1, 0]);
    expect(sidesFor('teams', 4)).toEqual([0, 1, 0, 1]);
    expect(sidesFor('koth', 3)).toEqual([0, 1, 2]); // teams optional, none given
    expect(sidesFor('koth', 4, [0, 0, 1, 1])).toEqual([0, 0, 1, 1]);
    const t = randomTeams(6, 3);
    expect([0, 1, 2].map((k) => t.filter((x) => x === k).length)).toEqual([2, 2, 2]);
  });
});

describe('modes', () => {
  it('Team battle: last team standing wins, scores are per team', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 4, mode: 'teams', teams: [0, 0, 1, 1] });
    const events: SimEvent[] = [];
    fight(sim, events);
    expect(sim.rules.scores.length).toBe(2);
    sim.characters[2].eliminate(sim);
    run(sim, seconds(1.5), events);
    expect(events.some((e) => e.type === 'roundEnd')).toBe(false); // teammate 3 still in
    sim.characters[3].eliminate(sim);
    run(sim, seconds(1.5), events);
    const end = events.find((e) => e.type === 'roundEnd');
    expect(end && end.type === 'roundEnd' && end.winner).toBe(0);
    expect(sim.rules.scores).toEqual([1, 0]);
    sim.dispose();
  });

  it('Last player standing: three lives, respawns in between', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, mode: 'lives' });
    const events: SimEvent[] = [];
    fight(sim, events);
    for (let life = 0; life < 2; life++) {
      sim.characters[1].eliminate(sim);
      run(sim, seconds(3.2), events);
      expect(sim.characters[1].alive).toBe(true);
    }
    expect(events.filter((e) => e.type === 'respawn').length).toBe(2);
    expect(sim.rules.lives[1]).toBe(1);
    sim.characters[1].eliminate(sim);
    run(sim, seconds(3.2), events);
    expect(sim.characters[1].alive).toBe(false);
    const end = events.find((e) => e.type === 'roundEnd');
    expect(end && end.type === 'roundEnd' && end.winner).toBe(0);
    sim.dispose();
  });

  it('King of the hill: holding the hill alone scores; contesting does not', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, mode: 'koth' });
    const events: SimEvent[] = [];
    fight(sim, events);
    const hill = TAR_TOP.hills![0];
    sim.characters[0].reset(sim.world, { x: hill.pos.x - 0.4, y: hill.pos.y + 0.02, z: hill.pos.z }, 0);
    sim.characters[1].reset(sim.world, { x: hill.pos.x + 0.4, y: hill.pos.y + 0.02, z: hill.pos.z }, 0);
    run(sim, seconds(3), events);
    // Contested: (almost) nothing scored while both stand on it.
    expect(sim.rules.points[0] + sim.rules.points[1]).toBeLessThan(0.5);
    sim.characters[1].reset(sim.world, { x: 5, y: 0.02, z: -1 }, 0);
    run(sim, seconds(KOTH_TARGET + 1), events);
    const end = events.find((e) => e.type === 'roundEnd');
    expect(end && end.type === 'roundEnd' && end.winner).toBe(0);
    sim.dispose();
  });

  it('Grab the Goods: the trophy in a goal scores for that team', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, mode: 'trophy', teams: [0, 1] });
    const events: SimEvent[] = [];
    fight(sim, events);
    expect(sim.trophyIndex).toBeGreaterThanOrEqual(0);
    const goal = TAR_TOP.goals![1];
    const centre = { x: (goal.min.x + goal.max.x) / 2, y: 0.5, z: (goal.min.z + goal.max.z) / 2 };
    for (let g = 0; g < 3; g++) {
      sim.activateProp(sim.trophyIndex, centre, { x: 0, y: 0, z: 0 });
      run(sim, 3, events);
    }
    expect(events.filter((e) => e.type === 'goal' && e.team === 1).length).toBe(3);
    const end = events.find((e) => e.type === 'roundEnd');
    expect(end && end.type === 'roundEnd' && end.winner).toBe(1);
    // The trophy went back to its spawn.
    const p = sim.props[sim.trophyIndex].body.translation();
    expect(Math.hypot(p.x - TAR_TOP.trophySpawn!.x, p.z - TAR_TOP.trophySpawn!.z)).toBeLessThan(0.5);
    sim.dispose();
  });

  it('Hot Potato: hits pass the bomb; when it goes off the holder is out', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 3, mode: 'potato' });
    const events: SimEvent[] = [];
    fight(sim, events);
    run(sim, seconds(1), events);
    const first = sim.rules.potatoHolder;
    expect(first).toBeGreaterThanOrEqual(0);
    const other = (first + 1) % 3;
    sim.emit({ type: 'hit', attacker: first, victim: other, pos: { x: 0, y: 0, z: 0 }, strength: 5, head: false, kind: 'punch' });
    expect(sim.rules.potatoHolder).toBe(other);
    run(sim, seconds(18), events);
    expect(events.some((e) => e.type === 'explode' && e.char === other)).toBe(true);
    expect(sim.characters[other].alive).toBe(false);
    sim.dispose();
  });

  it('time limit decides King of the hill on points', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, mode: 'koth' });
    fight(sim);
    sim.rules.points = [5, 3];
    sim.rules.roundTime = 239.99;
    const events: SimEvent[] = [];
    run(sim, 2, events);
    const end = events.find((e) => e.type === 'roundEnd');
    expect(end && end.type === 'roundEnd' && end.winner).toBe(0);
    sim.dispose();
  });

  it('snapshots carry mode state', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 4, mode: 'lives', teams: [0, 1, 0, 1] });
    fight(sim);
    sim.characters[1].eliminate(sim);
    run(sim, 2);
    const s = decodeSnapshot(encodeSnapshot(sim, 0))!;
    expect(s.scores.length).toBe(2);
    expect(s.lives).toEqual([3, 2, 3, 3]);
    sim.dispose();
  });
});

describe.each(['teams', 'lives', 'koth', 'trophy', 'potato'] as ModeId[])('bots play %s', (mode) => {
  it('to the end of a round', () => {
    const arena = ARENAS[0];
    const sim = new GameSim({ arena, players: 4, mode, teams: [0, 1, 0, 1], seed: 3 });
    const bots = sim.characters.map((c) => new Bot(c.index, c.index * 17 + 1, 0.8));
    let ended = false;
    for (let i = 0; i < seconds(250) && !ended; i++) {
      sim.step(bots.map((b) => b.think(sim, sim.dt)));
      ended = sim.drainEvents().some((e) => e.type === 'roundEnd');
    }
    expect(ended).toBe(true);
    sim.dispose();
  });
});
