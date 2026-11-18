import type { ClientMsg, FriendStatus, RoomInfo, ServerMsg } from '../../net/protocol';
import { PROTOCOL_VERSION, WS_PATH } from '../../net/protocol';
import type { Loadout } from '../../meta/cosmetics';
import { defaultLoadout } from '../../meta/cosmetics';

export type NetStatus = 'offline' | 'connecting' | 'online';

type Handler<T> = (v: T) => void;

/**
 * WebSocket connection to the game server: lobby state, friends presence,
 * invites and the raw match streams (handed to NetMatch).
 */
export class NetClient {
  status: NetStatus = 'offline';
  friendCode = '';
  room: RoomInfo | null = null;
  friends: FriendStatus[] = [];
  /** Round-trip time to the server in ms. */
  rtt = 0;
  lastError = '';
  private ws: WebSocket | null = null;
  private retry = 0;
  private wantOnline = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private profile: { name: string; loadout: Loadout } = { name: 'Player', loadout: defaultLoadout() };
  private queued: ClientMsg[] = [];

  onChange: Handler<void> | null = null;
  onMessage: Handler<ServerMsg> | null = null;
  onBinary: Handler<ArrayBuffer> | null = null;

  constructor(
    private readonly playerId: string,
    private readonly url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`,
  ) {}

  connect(name: string, loadout: Loadout): void {
    this.profile = { name, loadout };
    this.wantOnline = true;
    if (this.ws) return;
    this.status = 'connecting';
    this.changed();
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, playerId: this.playerId, name: this.profile.name, loadout: this.profile.loadout }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') {
        this.onBinary?.(e.data as ArrayBuffer);
        return;
      }
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onclose = () => {
      this.ws = null;
      this.status = 'offline';
      this.room = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.changed();
      this.onMessage?.({ t: 'room', room: null });
      if (this.wantOnline) {
        // Reconnect with backoff.
        const wait = Math.min(8000, 500 * 2 ** this.retry++);
        setTimeout(() => this.wantOnline && this.connect(this.profile.name, this.profile.loadout), wait);
      }
    };
    ws.onerror = () => {
      this.lastError = 'Could not reach the game server.';
    };
  }

  disconnect(): void {
    this.wantOnline = false;
    this.ws?.close();
  }

  private handle(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        this.friendCode = m.friendCode;
        this.status = 'online';
        this.lastError = '';
        for (const q of this.queued.splice(0)) this.send(q);
        this.pingTimer = setInterval(() => this.send({ t: 'ping', at: performance.now() }), 2000);
        break;
      case 'room':
        this.room = m.room;
        break;
      case 'friends':
        this.friends = m.statuses;
        break;
      case 'pong':
        this.rtt = this.rtt ? this.rtt * 0.8 + (performance.now() - m.at) * 0.2 : performance.now() - m.at;
        break;
      case 'error':
        this.lastError = m.message;
        break;
    }
    this.onMessage?.(m);
    if (m.t !== 'pong' && m.t !== 'events') this.changed();
  }

  /** Send a control message (queued until the server has welcomed us). */
  send(m: ClientMsg): void {
    if (this.ws && this.status === 'online') this.ws.send(JSON.stringify(m));
    else if (m.t !== 'ping') this.queued.push(m);
  }

  sendBinary(buf: ArrayBuffer): void {
    if (this.ws && this.status === 'online' && this.ws.bufferedAmount < 64 * 1024) this.ws.send(buf);
  }

  setProfile(name: string, loadout: Loadout): void {
    this.profile = { name, loadout };
    if (this.status === 'online') this.send({ t: 'profile', name, loadout });
  }

  private changed(): void {
    this.onChange?.();
  }
}
