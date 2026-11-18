import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../server/index';
import type { ClientMsg, ServerMsg, RoomInfo } from '../src/net/protocol';
import { PROTOCOL_VERSION, WS_PATH } from '../src/net/protocol';
import { decodeSnapshot, encodeInput } from '../src/net/codec';
import type { Snapshot } from '../src/net/codec';
import { emptyInput } from '../src/sim/input';

let server: Awaited<ReturnType<typeof startServer>>;
let url = '';

beforeAll(async () => {
  server = await startServer(0, '/nonexistent');
  url = `ws://127.0.0.1:${server.port}${WS_PATH}`;
});
afterAll(async () => {
  await server.close();
});

/** A scripted test client. */
class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  snaps: Snapshot[] = [];
  room: RoomInfo | null = null;
  friendCode = '';
  private waiters: (() => void)[] = [];

  constructor(readonly name: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data, binary) => {
      if (binary) {
        const s = decodeSnapshot(new Uint8Array(data as Buffer));
        if (s) this.snaps.push(s);
      } else {
        const m = JSON.parse(String(data)) as ServerMsg;
        this.msgs.push(m);
        if (m.t === 'room') this.room = m.room;
        if (m.t === 'welcome') this.friendCode = m.friendCode;
      }
      this.waiters.forEach((w) => w());
    });
  }

  async open(): Promise<this> {
    await new Promise<void>((ok) => this.ws.once('open', () => ok()));
    this.send({ t: 'hello', v: PROTOCOL_VERSION, playerId: `test-${this.name}-${Math.random()}`, name: this.name, fighter: 0 });
    await this.until(() => this.friendCode !== '');
    return this;
  }

  send(m: ClientMsg): void {
    this.ws.send(JSON.stringify(m));
  }

  until(pred: () => boolean, ms = 5000): Promise<void> {
    return new Promise((ok, fail) => {
      if (pred()) return ok();
      const t = setTimeout(() => fail(new Error(`timeout waiting (${this.name})`)), ms);
      const w = () => {
        if (pred()) {
          clearTimeout(t);
          this.waiters = this.waiters.filter((x) => x !== w);
          ok();
        }
      };
      this.waiters.push(w);
    });
  }

  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i] as Extract<ServerMsg, { t: T }>;
    return undefined;
  }

  close(): void {
    this.ws.close();
  }
}

const pelvisX = (s: Snapshot, char: number) => s.bodies[char * 11 * 7];

describe('multiplayer server', () => {
  it('private room: create, join by code, host-only start, inputs move fighters', async () => {
    const a = await new Client('Alice').open();
    const b = await new Client('Bob').open();
    a.send({ t: 'create', private: true });
    await a.until(() => !!a.room);
    const code = a.room!.code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    b.send({ t: 'join', code: code.toLowerCase() });
    await a.until(() => a.room?.members.length === 2);
    await b.until(() => b.room?.members.length === 2);
    expect(a.room!.members[0].host).toBe(true);
    expect(b.room!.members.find((m) => m.name === 'Bob')!.host).toBe(false);

    // Only the host can start.
    b.send({ t: 'start' });
    await b.until(() => !!b.last('error'));
    expect(b.last('error')!.message).toMatch(/host/i);

    a.send({ t: 'vote', map: 'rush-hour' });
    b.send({ t: 'vote', map: 'rush-hour' });
    await a.until(() => a.room!.votes['rush-hour'].length === 2);
    a.send({ t: 'start' });
    await a.until(() => !!a.last('matchStart'));
    await b.until(() => !!b.last('matchStart'));
    const ms = a.last('matchStart')!;
    expect(ms.arena).toBe('rush-hour');
    expect(ms.slots.length).toBe(2);
    expect(a.last('matchStart')!.you).toBe(0);
    expect(b.last('matchStart')!.you).toBe(1);

    // Snapshots stream to both clients; wait for the countdown to end.
    await b.until(() => b.snaps.some((s) => s.phase === 'fight'), 6000);
    const before = pelvisX(b.snaps[b.snaps.length - 1], 0);
    // Alice holds "right" for a second; Bob should see her move.
    const inp = { ...emptyInput(), moveX: 1 };
    const timer = setInterval(() => a.ws.send(encodeInput(1, inp, 0)), 50);
    await new Promise((r) => setTimeout(r, 1200));
    clearInterval(timer);
    const after = pelvisX(b.snaps[b.snaps.length - 1], 0);
    expect(after - before).toBeGreaterThan(1.5);
    expect(b.snaps.at(-1)!.chars.length).toBe(2);
    a.close();
    b.close();
  }, 20000);

  it('quick play puts players into the same public room', async () => {
    const c = await new Client('Cara').open();
    const d = await new Client('Dan').open();
    c.send({ t: 'quickPlay' });
    await c.until(() => !!c.room);
    d.send({ t: 'quickPlay' });
    await d.until(() => !!d.room);
    expect(d.room!.code).toBe(c.room!.code);
    expect(d.room!.private).toBe(false);
    // Public rooms auto-start when everyone is ready.
    c.send({ t: 'ready', ready: true });
    d.send({ t: 'ready', ready: true });
    await c.until(() => c.room?.autoStartIn !== null);
    await c.until(() => !!c.last('matchStart'), 9000);
    c.close();
    d.close();
  }, 20000);

  it('friends: presence, invites, kicking and host migration', async () => {
    const e = await new Client('Eve').open();
    const f = await new Client('Finn').open();
    const g = await new Client('Gus').open();
    e.send({ t: 'friends', codes: [f.friendCode, 'ZZZZZZ'] });
    await e.until(() => !!e.last('friends'));
    const st = e.last('friends')!.statuses;
    expect(st[0]).toMatchObject({ code: f.friendCode, name: 'Finn', online: true });
    expect(st[1].online).toBe(false);

    e.send({ t: 'create', private: true });
    await e.until(() => !!e.room);
    e.send({ t: 'invite', code: f.friendCode });
    await f.until(() => !!f.last('invited'));
    expect(f.last('invited')).toMatchObject({ from: 'Eve', code: e.room!.code });
    f.send({ t: 'join', code: f.last('invited')!.code });
    g.send({ t: 'join', code: e.room!.code });
    await e.until(() => e.room?.members.length === 3);

    // Kick Gus.
    const gid = e.room!.members.find((m) => m.name === 'Gus')!.id;
    e.send({ t: 'kick', id: gid });
    await g.until(() => !!g.last('kicked'));
    await e.until(() => e.room?.members.length === 2);

    // Host leaves: Finn takes over.
    e.send({ t: 'leave' });
    await f.until(() => f.room?.members.length === 1);
    expect(f.room!.members[0]).toMatchObject({ name: 'Finn', host: true });
    e.close();
    f.close();
    g.close();
  }, 20000);

  it('a leaver is replaced by a bot; the match ends back in the lobby', async () => {
    const h = await new Client('Hana').open();
    const i = await new Client('Ivo').open();
    const j = await new Client('Jo').open();
    h.send({ t: 'create', private: true });
    await h.until(() => !!h.room);
    i.send({ t: 'join', code: h.room!.code });
    j.send({ t: 'join', code: h.room!.code });
    await h.until(() => h.room?.members.length === 3);
    h.send({ t: 'vote', map: 'tar-top' });
    h.send({ t: 'start' });
    await h.until(() => !!h.last('matchStart'));
    j.close();
    await h.until(() => h.msgs.some((m) => m.t === 'events' && m.events.some((e) => e.type === 'warning' && e.text.includes('bot takes over'))));

    // Drive the match to its end: keep throwing fighter 1 off the roof each round.
    const room = server.hub.rooms.get(h.room!.code)!;
    const kicker = setInterval(() => {
      const sim = room.match?.sim;
      if (sim && sim.rules.phase === 'fight') {
        for (const c of sim.characters) if (c.index !== 0 && c.alive) c.eliminate(sim, 'fall');
      }
    }, 100);
    await h.until(() => !!h.last('matchOver'), 45000);
    clearInterval(kicker);
    await h.until(() => h.room?.state === 'lobby');
    expect(h.msgs.some((m) => m.t === 'events' && m.events.some((e) => e.type === 'matchEnd' && e.winner === 0))).toBe(true);
    expect(h.room!.members.length).toBe(2);
    h.close();
    i.close();
  }, 60000);

  it('rejects bad input gracefully', async () => {
    const k = await new Client('Kim').open();
    k.send({ t: 'join', code: 'NOPE1' });
    await k.until(() => !!k.last('error'));
    expect(k.last('error')!.message).toMatch(/No room/);
    k.ws.send('not json');
    k.ws.send(Buffer.from([1, 2, 3]));
    k.send({ t: 'ping', at: 42 });
    await k.until(() => !!k.last('pong'));
    k.close();
  });
});

describe('multiplayer modes', () => {
  it('host picks a team mode, players pick teams, the match starts with those sides', async () => {
    const a = await new Client('Ann').open();
    const b = await new Client('Ben').open();
    a.send({ t: 'create', private: true });
    await a.until(() => !!a.room);
    b.send({ t: 'join', code: a.room!.code });
    await a.until(() => a.room?.members.length === 2);
    a.send({ t: 'settings', settings: { mode: 'teams', teamCount: 2 } });
    await a.until(() => a.room?.settings.mode === 'teams');
    // Both on the same team: refused.
    const annTeam = a.room!.members[0].team;
    const benTeam = a.room!.members[1].team;
    if (annTeam !== benTeam) b.send({ t: 'team', team: annTeam });
    await a.until(() => a.room!.members[1].team === annTeam);
    a.send({ t: 'start' });
    await a.until(() => !!a.last('error'));
    expect(a.last('error')!.message).toMatch(/two teams/);
    // Random teams always gives two teams of one.
    a.send({ t: 'randomTeams' });
    await a.until(() => a.room!.members[0].team !== a.room!.members[1].team);
    a.send({ t: 'settings', settings: { bots: 2 } });
    a.send({ t: 'start' });
    await a.until(() => !!a.last('matchStart'));
    const ms = a.last('matchStart')!;
    expect(ms.mode).toBe('teams');
    expect(ms.sides.length).toBe(4);
    expect(new Set(ms.sides).size).toBe(2);
    expect(ms.sides.filter((x) => x === ms.sides[0]).length).toBe(2); // bots balanced the teams
    await a.until(() => a.snaps.length > 2);
    expect(a.snaps.at(-1)!.scores.length).toBe(2);
    a.close();
    b.close();
  }, 20000);
});
