import type { SimEvent } from '../sim/events';
import type { ModeId } from '../sim/modes';
import type { Loadout } from '../meta/cosmetics';

// Wire protocol shared by the browser client and the Node server.
// Lobby/control traffic is JSON text frames; inputs and snapshots are binary.

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;
export const WS_PATH = '/ws';
export const MAX_ROOM = 8;
/** Server sends a snapshot every N simulation ticks (60 Hz / 2 = 30 Hz). */
export const SNAPSHOT_EVERY = 2;
/** Public rooms auto-start this long after everyone (2+) is ready. */
export const AUTO_START_SECONDS = 5;

export type MapMode = 'vote' | 'rotate';

export interface MemberInfo {
  id: string;
  name: string;
  loadout: Loadout;
  ready: boolean;
  host: boolean;
  /** Joined while a match was running: watching until the next one. */
  spectating: boolean;
  friendCode: string;
  /** Chosen team (team modes). */
  team: number;
}

export interface RoomSettings {
  bots: number;
  mapMode: MapMode;
  mode: ModeId;
  /** Number of teams for team modes (2–4). */
  teamCount: number;
  /** For modes where teams are optional (lives, king of the hill). */
  teamsOn: boolean;
}

export interface RoomInfo {
  code: string;
  private: boolean;
  state: 'lobby' | 'playing';
  members: MemberInfo[];
  settings: RoomSettings;
  /** Map id → member ids voting for it. */
  votes: Record<string, string[]>;
  /** Seconds until an automatic start (public rooms), or null. */
  autoStartIn: number | null;
}

export interface SlotInfo {
  name: string;
  loadout: Loadout;
  memberId: string | null;
  bot: boolean;
}

export interface FriendStatus {
  code: string;
  name: string | null;
  online: boolean;
  roomCode: string | null;
}

// ------------------------------------------------------------ client → server
export type ClientMsg =
  | { t: 'hello'; v: number; playerId: string; name: string; loadout: Loadout }
  | { t: 'profile'; name: string; loadout: Loadout }
  | { t: 'quickPlay' }
  | { t: 'create'; private: boolean }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'team'; team: number }
  | { t: 'randomTeams' }
  | { t: 'vote'; map: string }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'kick'; id: string }
  | { t: 'start' }
  | { t: 'friends'; codes: string[] }
  | { t: 'invite'; code: string }
  | { t: 'ping'; at: number };

// ------------------------------------------------------------ server → client
export type ServerMsg =
  | { t: 'welcome'; playerId: string; friendCode: string }
  | { t: 'room'; room: RoomInfo | null }
  | { t: 'error'; message: string }
  | { t: 'matchStart'; arena: string; epoch: number; slots: SlotInfo[]; you: number; mode: ModeId; sides: number[] }
  | { t: 'arena'; arena: string; epoch: number }
  | { t: 'events'; epoch: number; tick: number; events: SimEvent[] }
  | { t: 'matchOver' }
  | { t: 'friends'; statuses: FriendStatus[] }
  | { t: 'invited'; from: string; code: string }
  | { t: 'kicked' }
  | { t: 'pong'; at: number };

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;
