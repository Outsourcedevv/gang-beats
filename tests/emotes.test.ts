import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/sim/physics';
import { GameSim } from '../src/sim/game';
import { TAR_TOP } from '../src/sim/arenas';
import { emptyInput as E } from '../src/sim/input';
import type { SimEvent } from '../src/sim/events';
import { decodeInput, encodeInput, toPlayerInput } from '../src/net/codec';
import { rotate } from '../src/sim/math';

beforeAll(async () => {
  await initPhysics();
});

describe('emotes and victory animations', () => {
  it('pressing emote plays your emote; moving cancels it', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 1, sandbox: true, looks: [{ emote: 'flex', victory: 'spin' }] });
    for (let i = 0; i < 40; i++) sim.step([E()]);
    const events: SimEvent[] = [];
    sim.step([{ ...E(), emote: true }]);
    events.push(...sim.drainEvents());
    expect(events.some((e) => e.type === 'emote' && e.kind === 'flex')).toBe(true);
    expect(sim.characters[0].pose?.kind).toBe('flex');
    for (let i = 0; i < 30; i++) sim.step([E()]);
    // Flexing: upper arms stick out sideways.
    const up = rotate(sim.characters[0].part('upperArmL').body.rotation(), { x: 0, y: -1, z: 0 });
    expect(Math.abs(up.y)).toBeLessThan(0.6);
    sim.step([{ ...E(), moveX: 1 }]);
    expect(sim.characters[0].pose).toBeNull();
    sim.dispose();
  });

  it('round winners celebrate with their victory animation', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, looks: [{ emote: 'wave', victory: 'backflip' }, { emote: 'wave', victory: 'cheer' }] });
    for (let i = 0; i < 150; i++) sim.step([E(), E()]);
    sim.characters[1].eliminate(sim);
    for (let i = 0; i < 90; i++) sim.step([E(), E()]);
    expect(sim.rules.phase).toBe('roundOver');
    expect(sim.characters[0].pose).toMatchObject({ kind: 'backflip', victory: true });
    sim.dispose();
  });

  it('no auto-restart: the match waits on the results screen', () => {
    const sim = new GameSim({ arena: TAR_TOP, players: 2, autoRestart: false });
    sim.rules.scores = [2, 0];
    for (let i = 0; i < 150; i++) sim.step([E(), E()]);
    sim.characters[1].eliminate(sim);
    for (let i = 0; i < 60 * 20; i++) sim.step([E(), E()]);
    expect(sim.rules.phase).toBe('matchOver');
    sim.rules.restartMatch();
    expect(sim.rules.scores).toEqual([0, 0]);
    sim.dispose();
  });

  it('the emote button survives the network codec', () => {
    const d = decodeInput(encodeInput(1, { ...E(), emote: true, jump: true }, 1 << 8))!;
    expect(toPlayerInput(0, 0, d.held).emote).toBe(true);
    expect((d.pressed >> 8) & 1).toBe(1);
  });
});
