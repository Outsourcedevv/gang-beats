import type { PlayerInput } from '../../sim/input';
import { emptyInput } from '../../sim/input';

export type DeviceId = 'kbA' | 'kbB' | 'pad0' | 'pad1' | 'pad2' | 'pad3' | 'bot' | 'off';

export const DEVICE_LABELS: Record<DeviceId, string> = {
  kbA: 'Keyboard — WASD',
  kbB: 'Keyboard — Arrows',
  pad0: 'Gamepad 1',
  pad1: 'Gamepad 2',
  pad2: 'Gamepad 3',
  pad3: 'Gamepad 4',
  bot: 'Bot',
  off: 'Empty',
};

export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'punch' | 'grab' | 'lift' | 'kick' | 'headbutt' | 'dive' | 'sprint' | 'emote';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'jump', 'punch', 'grab', 'lift', 'kick', 'headbutt', 'dive', 'sprint', 'emote'];
export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
  punch: 'Punch',
  grab: 'Grab (hold)',
  lift: 'Lift / raise arms (hold)',
  kick: 'Kick',
  headbutt: 'Headbutt',
  dive: 'Dive / tackle',
  sprint: 'Sprint',
  emote: 'Emote',
};

/** Keyboard bindings: each action maps to one or more `KeyboardEvent.code`s. */
export type KeyBindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Record<'kbA' | 'kbB', KeyBindings> = {
  kbA: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    jump: ['Space'],
    punch: ['KeyJ', 'KeyF'],
    grab: ['KeyK', 'KeyG'],
    lift: ['KeyL', 'KeyR'],
    kick: ['KeyI', 'KeyE'],
    headbutt: ['KeyO', 'KeyQ'],
    dive: ['KeyU', 'KeyC'],
    sprint: ['ShiftLeft'],
    emote: ['KeyT'],
  },
  kbB: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['Numpad0', 'ShiftRight'],
    punch: ['Numpad1', 'Period'],
    grab: ['Numpad2', 'Slash'],
    lift: ['Numpad3', 'Quote'],
    kick: ['Numpad4', 'Comma'],
    headbutt: ['Numpad5', 'KeyM'],
    dive: ['Numpad6', 'KeyN'],
    sprint: ['NumpadDecimal', 'ControlRight'],
    emote: ['Numpad7', 'Backslash'],
  },
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlRight: 'R-Ctrl',
    ControlLeft: 'L-Ctrl',
    Period: '.',
    Slash: '/',
    Quote: "'",
    Comma: ',',
    KeyM: 'M',
    Semicolon: ';',
    NumpadDecimal: 'Num .',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

// Standard mapping: A jump, X punch, B kick, Y headbutt, RT grab, LT lift, RB dive, LB / L3 sprint.
const GAMEPAD = { jump: [0], punch: [2], kick: [1], headbutt: [3], grab: [7], lift: [6], dive: [5], sprint: [4, 10], emote: [8] };
const DEADZONE = 0.22;

/**
 * Collects keyboard, mouse and gamepad state and turns it into per-device
 * PlayerInputs. Short taps between two physics steps are latched so they are
 * never lost.
 */
export class InputManager {
  private down = new Set<string>();
  private latched = new Set<string>();
  private mouse = new Set<number>();
  private mouseLatched = new Set<number>();
  bindings: Record<'kbA' | 'kbB', KeyBindings> = structuredClone(DEFAULT_BINDINGS);
  /** When set, the next key press is delivered here instead (for rebinding). */
  captureNext: ((code: string) => void) | null = null;
  onPause: (() => void) | null = null;
  mouseEnabled = true;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      if (e.code === 'Escape') {
        this.onPause?.();
        return;
      }
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || (e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      if (this.isBound(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.latched.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.clear();
    });
    target.addEventListener('mousedown', (e) => {
      if (!this.mouseEnabled) return;
      this.mouse.add(e.button);
      this.mouseLatched.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isBound(code: string): boolean {
    for (const b of Object.values(this.bindings)) for (const codes of Object.values(b)) if (codes.includes(code)) return true;
    return false;
  }

  private key(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c) || this.latched.has(c)) return true;
    return false;
  }

  /** Read the current input for one device. */
  read(device: DeviceId): PlayerInput {
    const inp = emptyInput();
    if (device === 'kbA' || device === 'kbB') {
      const b = this.bindings[device];
      const x = (this.key(b.right) ? 1 : 0) - (this.key(b.left) ? 1 : 0);
      const z = (this.key(b.down) ? 1 : 0) - (this.key(b.up) ? 1 : 0);
      inp.moveX = x;
      inp.moveZ = z;
      inp.jump = this.key(b.jump);
      inp.punch = this.key(b.punch);
      inp.grab = this.key(b.grab);
      inp.lift = this.key(b.lift);
      inp.sprint = this.key(b.sprint);
      inp.kick = this.key(b.kick);
      inp.headbutt = this.key(b.headbutt);
      inp.dive = this.key(b.dive);
      inp.emote = this.key(b.emote);
      if (device === 'kbA' && this.mouseEnabled) {
        inp.punch ||= this.mouse.has(0) || this.mouseLatched.has(0);
        inp.grab ||= this.mouse.has(2);
        inp.lift ||= this.mouse.has(1);
      }
    } else if (device.startsWith('pad')) {
      const pad = navigator.getGamepads?.()[Number(device.slice(3))];
      if (pad && pad.connected) {
        let x = pad.axes[0] ?? 0;
        let z = pad.axes[1] ?? 0;
        const l = Math.hypot(x, z);
        if (l < DEADZONE) {
          x = 0;
          z = 0;
        } else {
          const s = (l - DEADZONE) / (1 - DEADZONE) / l;
          x *= s;
          z *= s;
        }
        // D-pad as a fallback.
        if (pad.buttons[12]?.pressed) z = -1;
        if (pad.buttons[13]?.pressed) z = 1;
        if (pad.buttons[14]?.pressed) x = -1;
        if (pad.buttons[15]?.pressed) x = 1;
        const btn = (ids: number[]) => ids.some((i) => (pad.buttons[i]?.value ?? 0) > 0.4 || pad.buttons[i]?.pressed);
        inp.moveX = x;
        inp.moveZ = z;
        inp.jump = btn(GAMEPAD.jump);
        inp.punch = btn(GAMEPAD.punch);
        inp.grab = btn(GAMEPAD.grab);
        inp.lift = btn(GAMEPAD.lift);
        inp.sprint = btn(GAMEPAD.sprint);
        inp.kick = btn(GAMEPAD.kick);
        inp.headbutt = btn(GAMEPAD.headbutt);
        inp.dive = btn(GAMEPAD.dive);
        inp.emote = btn(GAMEPAD.emote);
        if (pad.buttons[9]?.pressed) this.padPause(Number(device.slice(3)));
      }
    }
    return inp;
  }

  private padPauseHeld = new Set<number>();
  private padPause(i: number): void {
    if (this.padPauseHeld.has(i)) return;
    this.padPauseHeld.add(i);
    this.onPause?.();
    setTimeout(() => this.padPauseHeld.delete(i), 400);
  }

  /** Clear latched taps once a physics step has consumed them. */
  consume(): void {
    this.latched.clear();
    this.mouseLatched.clear();
  }

  connectedPads(): number[] {
    const pads = navigator.getGamepads?.() ?? [];
    const out: number[] = [];
    for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) out.push(i);
    return out;
  }
}
