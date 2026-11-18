import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../src/sim/physics';
import { GameSim } from '../src/sim/game';
import { FACTORY } from '../src/sim/arenas';
import { emptyInput } from '../src/sim/input';
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, toPlayerInput } from '../src/net/codec';

beforeAll(async () => {
  await initPhysics();
});

describe('network codec', () => {
  it('round-trips inputs, including latched taps', () => {
    const inp = { ...emptyInput(), moveX: 0.5, moveZ: -1, grab: true, dive: true };
    const d = decodeInput(encodeInput(7, inp, 0b10))!; // punch tapped since last packet
    expect(d.seq).toBe(7);
    expect(d.moveX).toBeCloseTo(0.5, 1);
    expect(d.moveZ).toBeCloseTo(-1, 2);
    const out = toPlayerInput(d.moveX, d.moveZ, d.held | d.pressed);
    expect(out).toMatchObject({ grab: true, dive: true, punch: true, jump: false });
  });

  it('round-trips a snapshot within quantisation error, and stays small', () => {
    const sim = new GameSim({ arena: FACTORY, players: 8, sandbox: true });
    for (let i = 0; i < 90; i++) sim.step(sim.characters.map(() => ({ ...emptyInput(), moveX: 1 })));
    sim.characters[3].knockOut(sim);
    const buf = encodeSnapshot(sim, 5);
    const s = decodeSnapshot(buf)!;
    expect(s.epoch).toBe(5);
    expect(s.tick).toBe(sim.tick);
    expect(s.chars.length).toBe(8);
    expect(s.chars[3].state).toBe('ko');
    expect(s.bodies.length).toBe(sim.currSnap.length);
    let maxPos = 0;
    for (let b = 0; b < s.bodies.length / 7; b++) for (let k = 0; k < 3; k++) maxPos = Math.max(maxPos, Math.abs(s.bodies[b * 7 + k] - sim.currSnap[b * 7 + k]));
    expect(maxPos).toBeLessThan(0.002);
    expect(s.propActive).toEqual(sim.props.map((_, i) => sim.propActive(i)));
    expect(s.breakStates.length).toBe(sim.runtime.breakables.length);
    // 8 fighters on the busiest map: well under 2 KB per snapshot.
    expect(buf.byteLength).toBeLessThan(2048);
    sim.dispose();
  });
});
