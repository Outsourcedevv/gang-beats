import type { WebSocket, RawData } from 'ws';
import type { ClientMsg, FriendStatus } from '../src/net/protocol';
import { PROTOCOL_VERSION, MAX_ROOM, MSG_INPUT } from '../src/net/protocol';
import { Conn } from './conn';
import { Room } from './room';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function sanitizeName(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[^\p{L}\p{N} _\-.!?']/gu, '')
    .trim()
    .slice(0, 16);
  return s || 'Player';
}

/** Stable short friend code derived from a player id (two FNV-1a hashes → 6 base-32 chars). */
export function friendCodeFor(playerId: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < playerId.length; i++) {
      h ^= playerId.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  let a = fnv(0x811c9dc5);
  let b = fnv(0x01234567);
  let out = '';
  for (let i = 0; i < 6; i++) {
    const src = i < 3 ? a : b;
    out += CODE_CHARS[src & 31];
    if (i < 3) a >>>= 5;
    else b >>>= 5;
  }
  return out;
}

/** All connections, rooms, matchmaking, presence and invites. */
export class Hub {
  readonly conns = new Set<Conn>();
  readonly rooms = new Map<string, Room>();
  private byFriend = new Map<string, Conn>();
  private last = performance.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.timer = setInterval(() => this.tick(), 1000 / 60);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    for (const r of this.rooms.values()) r.match?.dispose();
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    for (const [code, room] of this.rooms) {
      if (room.empty) {
        room.endMatch();
        this.rooms.delete(code);
        continue;
      }
      room.update(dt, Date.now());
    }
  }

  connect(ws: WebSocket): Conn {
    const conn = new Conn(ws);
    this.conns.add(conn);
    ws.on('message', (data: RawData, isBinary: boolean) => this.onMessage(conn, data, isBinary));
    ws.on('close', () => this.disconnect(conn));
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => (conn.alive = true));
    return conn;
  }

  private disconnect(conn: Conn): void {
    conn.room?.remove(conn);
    this.conns.delete(conn);
    if (this.byFriend.get(conn.friendCode) === conn) this.byFriend.delete(conn.friendCode);
  }

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    if (!conn.rateOk(Date.now())) {
      conn.ws.close(1008, 'Too many messages');
      return;
    }
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    if (isBinary) {
      if (conn.helloed && buf[0] === MSG_INPUT) conn.room?.input(conn, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
    if (msg.t !== 'hello' && !conn.helloed) return;
    this.handle(conn, msg);
  }

  private leaveRoom(conn: Conn): void {
    const r = conn.room;
    if (!r) return;
    r.remove(conn);
    conn.send({ t: 'room', room: null });
  }

  private enter(conn: Conn, room: Room): void {
    if (conn.room === room) return;
    this.leaveRoom(conn);
    room.add(conn);
  }

  handle(conn: Conn, msg: ClientMsg): void {
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) {
          conn.send({ t: 'error', message: 'Your game is out of date — please refresh the page.' });
          return;
        }
        const id = String(msg.playerId ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || Math.random().toString(36).slice(2);
        conn.id = id;
        conn.name = sanitizeName(msg.name);
        conn.fighter = Number.isInteger(msg.fighter) ? Math.max(0, Math.min(5, msg.fighter)) : 0;
        conn.friendCode = friendCodeFor(id);
        // Same player connecting twice (another tab): the older connection is dropped.
        const old = this.byFriend.get(conn.friendCode);
        if (old && old !== conn) {
          old.send({ t: 'error', message: 'You connected from another tab.' });
          old.ws.close(1000, 'Replaced');
          this.disconnect(old);
        }
        this.byFriend.set(conn.friendCode, conn);
        conn.helloed = true;
        conn.send({ t: 'welcome', playerId: id, friendCode: conn.friendCode });
        return;
      }
      case 'profile':
        conn.name = sanitizeName(msg.name);
        conn.fighter = Number.isInteger(msg.fighter) ? Math.max(0, Math.min(5, msg.fighter)) : conn.fighter;
        conn.room?.markDirty();
        return;
      case 'quickPlay': {
        // Join the fullest public lobby with room to spare, or open a new one.
        let best: Room | null = null;
        for (const r of this.rooms.values()) {
          if (r.isPrivate || r.state !== 'lobby' || r.full || r === conn.room) continue;
          if (!best || r.members.length > best.members.length) best = r;
        }
        if (!best) {
          best = new Room(this.newCode(), false);
          this.rooms.set(best.code, best);
        }
        this.enter(conn, best);
        return;
      }
      case 'create': {
        const r = new Room(this.newCode(), !!msg.private);
        this.rooms.set(r.code, r);
        this.enter(conn, r);
        return;
      }
      case 'join': {
        const code = String(msg.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const r = this.rooms.get(code);
        if (!r) return conn.send({ t: 'error', message: `No room with code ${code || '—'}.` });
        if (r.full && !r.has(conn)) return conn.send({ t: 'error', message: `Room ${code} is full (${MAX_ROOM} players).` });
        this.enter(conn, r);
        return;
      }
      case 'leave':
        this.leaveRoom(conn);
        return;
      case 'ready':
        conn.room?.setReady(conn, !!msg.ready);
        return;
      case 'vote':
        conn.room?.vote(conn, String(msg.map));
        return;
      case 'settings': {
        const err = conn.room?.applySettings(conn, msg.settings ?? {});
        if (err) conn.send({ t: 'error', message: err });
        return;
      }
      case 'kick': {
        const kicked = conn.room?.kick(conn, String(msg.id));
        if (kicked) {
          kicked.send({ t: 'kicked' });
          kicked.send({ t: 'room', room: null });
        }
        return;
      }
      case 'start': {
        const err = conn.room?.start(conn);
        if (err) conn.send({ t: 'error', message: err });
        return;
      }
      case 'friends': {
        const codes = Array.isArray(msg.codes) ? msg.codes.slice(0, 100).map((c) => String(c).toUpperCase()) : [];
        const statuses: FriendStatus[] = codes.map((code) => {
          const f = this.byFriend.get(code);
          return { code, name: f ? f.name : null, online: !!f, roomCode: f?.room ? f.room.code : null };
        });
        conn.send({ t: 'friends', statuses });
        return;
      }
      case 'invite': {
        const target = this.byFriend.get(String(msg.code).toUpperCase());
        if (!conn.room) return conn.send({ t: 'error', message: 'Join or create a room first, then invite friends.' });
        if (!target) return conn.send({ t: 'error', message: 'That friend is not online right now.' });
        target.send({ t: 'invited', from: conn.name, code: conn.room.code });
        return;
      }
      case 'ping':
        conn.send({ t: 'pong', at: msg.at });
        return;
    }
  }
}
