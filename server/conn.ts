import type { WebSocket } from 'ws';
import type { ServerMsg } from '../src/net/protocol';
import type { Room } from './room';
import type { Loadout } from '../src/meta/cosmetics';
import { defaultLoadout } from '../src/meta/cosmetics';

/** One connected player. */
export class Conn {
  id = '';
  name = 'Player';
  loadout: Loadout = defaultLoadout();
  friendCode = '';
  room: Room | null = null;
  helloed = false;
  alive = true;
  /** Simple flood protection: messages in the current second. */
  private window = 0;
  private count = 0;

  constructor(readonly ws: WebSocket) {}

  send(msg: ServerMsg): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(buf: ArrayBuffer): void {
    // Skip snapshots for clients that can't keep up; the next one supersedes it.
    if (this.ws.readyState === this.ws.OPEN && this.ws.bufferedAmount < 256 * 1024) this.ws.send(buf);
  }

  /** Returns false if the client is flooding us. */
  rateOk(now: number): boolean {
    const w = Math.floor(now / 1000);
    if (w !== this.window) {
      this.window = w;
      this.count = 0;
    }
    return ++this.count <= 300;
  }
}
