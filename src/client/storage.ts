// Browser-local persistence for settings and fighter selections.
// This is local to this browser only; it is not synced anywhere.
// Kept behind a tiny interface so cloud saves can replace it later.

import type { DeviceId, KeyBindings } from './input/devices';

export interface SlotSetup {
  device: DeviceId;
  fighter: number; // index into FIGHTERS
}

export interface Settings {
  version: 1;
  volume: number;
  holdToPunch: boolean;
  mouseControls: boolean;
  bindings: Record<'kbA' | 'kbB', KeyBindings> | null;
  slots: SlotSetup[];
}

const KEY = 'wobbleweights.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  volume: 0.7,
  holdToPunch: false,
  mouseControls: true,
  bindings: null,
  slots: [
    { device: 'kbA', fighter: 0 },
    { device: 'bot', fighter: 1 },
    { device: 'off', fighter: 2 },
    { device: 'off', fighter: 3 },
  ],
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const s = JSON.parse(raw) as Partial<Settings>;
    if (s.version !== 1) return structuredClone(DEFAULT_SETTINGS);
    return { ...structuredClone(DEFAULT_SETTINGS), ...s } as Settings;
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode); settings just won't persist.
  }
}
