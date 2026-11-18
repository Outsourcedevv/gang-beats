import { initPhysics } from '../sim/physics';
import { Game } from './game';
import { ACTIONS, InputManager } from './input/devices';
import { Sfx } from './audio/sfx';
import { UI } from './ui/ui';
import { loadSettings } from './storage';
import { ProfileService } from './profile';

async function boot(): Promise<void> {
  await initPhysics();
  const settings = loadSettings();
  const app = document.getElementById('app')!;
  const input = new InputManager(app);
  if (settings.bindings) {
    // Merge saved bindings with defaults so newly added actions get keys.
    for (const scheme of ['kbA', 'kbB'] as const) {
      const saved = settings.bindings[scheme] ?? {};
      const used = new Set(Object.values(saved).flat());
      for (const action of ACTIONS) {
        const keys = saved[action];
        // New actions get their default keys, minus any the player already uses elsewhere.
        input.bindings[scheme][action] = keys ?? input.bindings[scheme][action].filter((k) => !used.has(k));
      }
    }
  }
  input.mouseEnabled = settings.mouseControls;
  const sfx = new Sfx();
  sfx.setVolume(settings.volume);
  // Audio can only start after a user gesture.
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  const game = new Game(app, input, sfx);
  const profiles = new ProfileService();
  new UI(game, input, sfx, settings, profiles);
  const loading = document.getElementById('loading');
  loading?.classList.add('done');
  setTimeout(() => loading?.remove(), 500);
  // Exposed for automated browser tests / debugging only.
  (window as unknown as { __game: Game }).__game = game;
}

boot().catch((err) => {
  console.error(err);
  const el = document.querySelector('#loading .load-msg');
  if (el) {
    el.className = 'load-error';
    el.textContent = 'Failed to start: ' + (err instanceof Error ? err.message : String(err)) + ' — this game needs WebGL and WebAssembly.';
  }
});
