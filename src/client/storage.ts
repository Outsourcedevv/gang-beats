// Browser-local persistence for settings and fighter selections.
// This is local to this browser only; it is not synced anywhere.
// Kept behind a tiny interface so cloud saves can replace it later.

import type { DeviceId, KeyBindings } from './input/devices';
import type { ModeId } from '../sim/modes';

export interface SlotSetup {
  device: DeviceId;
  fighter: number; // index into FIGHTERS
  team?: number;
}

export interface Settings {
  version: 1;
  volume: number;
  holdToPunch: boolean;
  mouseControls: boolean;
  bindings: Record<'kbA' | 'kbB', KeyBindings> | null;
  slots: SlotSetup[];
  /** Arena id, 'random', or 'rotate' (new map every round). */
  map?: string;
  /** Local match mode and teams. */
  mode?: ModeId;
  teamsOn?: boolean;
  teamCount?: number;
  sfxVolume?: number;
  musicVolume?: number;
  cameraShake?: boolean;
  quality?: 'auto' | 'high' | 'medium' | 'low';
  /** The first-run "How to play" guide has been shown. */
  tutorialSeen?: boolean;
  /** Online identity (random, local to this browser). */
  playerId?: string;
  playerName?: string;
  onlineFighter?: number;
  /** Friend codes added by this player (names learned when they're online). */
  friends?: { code: string; name: string | null }[];
}

const KEY = 'wobbleweights.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  volume: 0.7,
  holdToPunch: false,
  mouseControls: true,
  bindings: null,
  map: 'rotate',
  slots: [
    { device: 'kbA', fighter: 0 },
    { device: 'bot', fighter: 1 },
    { device: 'off', fighter: 2 },
    { device: 'off', fighter: 3 },
  ],
};

function withIdentity(s: Settings): Settings {
  if (!s.playerId) {
    s.playerId = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '');
    saveSettings(s);
  }
  return s;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return withIdentity(structuredClone(DEFAULT_SETTINGS));
    const s = JSON.parse(raw) as Partial<Settings>;
    if (s.version !== 1) return withIdentity(structuredClone(DEFAULT_SETTINGS));
    return withIdentity({ ...structuredClone(DEFAULT_SETTINGS), ...s } as Settings);
  } catch {
    return withIdentity(structuredClone(DEFAULT_SETTINGS));
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode); settings just won't persist.
  }
}
