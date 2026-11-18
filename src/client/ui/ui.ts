import type { Game } from '../game';
import type { SimEvent } from '../../sim/events';
import { ROUND_TIME_LIMIT, WINS_TO_WIN_MATCH } from '../../sim/rules';
import { ARENAS } from '../../sim/arenas';
import type { EliminationCause } from '../../sim/arena';
import { COMBAT, STAMINA } from '../../sim/config';
import { FIGHTERS } from '../render/fighters';
import type { InputManager, DeviceId, Action } from '../input/devices';
import { ACTIONS, ACTION_LABELS, DEFAULT_BINDINGS, DEVICE_LABELS, keyLabel } from '../input/devices';
import type { Settings } from '../storage';
import { saveSettings } from '../storage';
import type { Sfx } from '../audio/sfx';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
    } else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null) el.append(c);
  return el;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

const OUT_LINES: Record<EliminationCause, string> = {
  fall: 'took the long way down!',
  water: 'is sleeping with the fishes!',
  road: 'hit the road!',
  grinder: 'went through the grinder!',
  molten: 'took a lava bath!',
  building: 'fell through the skylight!',
};

const DEVICE_ORDER: DeviceId[] = ['kbA', 'kbB', 'pad0', 'pad1', 'pad2', 'pad3', 'bot', 'off'];

export const GAME_TITLE = 'Wobble Weights';

/**
 * All DOM UI: the fighter setup screen, controls/rebinding, pause menu and the
 * in-match HUD (scores, banners, per-player status, name tags).
 */
export class UI {
  private root: HTMLElement;
  private setupEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private hudEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private cardsEl!: HTMLElement;
  private tagsEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private bannerTimer = 0;
  private controlsReturn: 'setup' | 'pause' = 'setup';
  private showStats = false;
  private scoreKey = '';

  constructor(
    private readonly game: Game,
    private readonly input: InputManager,
    private readonly sfx: Sfx,
    private readonly settings: Settings,
  ) {
    this.root = document.getElementById('ui')!;
    this.buildHud();
    this.buildSetup();
    this.buildControls();
    this.buildPause();
    this.buildHelp();
    game.listener = { onEvent: (ev) => this.onEvent(ev) };
    input.onPause = () => this.togglePause();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && this.game.running && !this.input.captureNext) this.helpEl.classList.toggle('hidden');
      if (e.code === 'F3') {
        e.preventDefault();
        this.showStats = !this.showStats;
        this.statsEl.classList.toggle('hidden', !this.showStats);
      }
    });
    this.game.preview(settings.map ?? 'rotate');
    this.show('setup');
    requestAnimationFrame(this.tick);
    window.addEventListener('gamepadconnected', () => this.renderSetup());
    window.addEventListener('gamepaddisconnected', () => this.renderSetup());
  }

  // ---------------------------------------------------------------------------
  private show(screen: 'setup' | 'controls' | 'pause' | 'hud'): void {
    this.setupEl.classList.toggle('hidden', screen !== 'setup');
    this.controlsEl.classList.toggle('hidden', screen !== 'controls');
    this.pauseEl.classList.toggle('hidden', screen !== 'pause');
    this.hudEl.classList.toggle('hidden', screen === 'setup');
    if (screen === 'setup') this.renderSetup();
    if (screen === 'controls') this.renderControls();
  }

  // --------------------------------------------------------------- setup screen
  private buildSetup(): void {
    this.setupEl = h('div', { class: 'screen setup' });
    this.root.append(this.setupEl);
  }

  private renderSetup(): void {
    const s = this.settings;
    const pads = this.input.connectedPads();
    const active = s.slots.filter((x) => x.device !== 'off').length;
    const slots = s.slots.map((slot, i) => {
      const look = FIGHTERS[slot.fighter];
      const off = slot.device === 'off';
      const select = h(
        'select',
        {
          'aria-label': `Player ${i + 1} controller`,
          onchange: (e: Event) => {
            slot.device = (e.target as HTMLSelectElement).value as DeviceId;
            const taken = new Set(s.slots.filter((o, j) => j !== i && o.device !== 'off').map((o) => o.fighter));
            if (slot.device !== 'off' && taken.has(slot.fighter)) {
              const free = FIGHTERS.findIndex((_, k) => !taken.has(k));
              if (free >= 0) slot.fighter = free;
            }
            this.persist();
            this.renderSetup();
          },
        },
        ...DEVICE_ORDER.map((d) => {
          const isPad = d.startsWith('pad');
          const connected = !isPad || pads.includes(Number(d.slice(3)));
          const o = h('option', { value: d }, DEVICE_LABELS[d] + (isPad && !connected ? ' (press a button)' : ''));
          if (d === slot.device) o.selected = true;
          return o;
        }),
      );
      const cycle = (dir: number) => () => {
        // Skip fighters already picked by another active slot.
        const taken = new Set(s.slots.filter((o, j) => j !== i && o.device !== 'off').map((o) => o.fighter));
        let f = slot.fighter;
        for (let n = 0; n < FIGHTERS.length; n++) {
          f = (f + dir + FIGHTERS.length) % FIGHTERS.length;
          if (!taken.has(f)) break;
        }
        slot.fighter = f;
        this.sfx.click();
        this.persist();
        this.renderSetup();
      };
      return h(
        'div',
        { class: `slot ${off ? 'off' : ''}`, style: `--c:${hex(look.body)};--p:${hex(look.pants)}` },
        h('div', { class: 'slot-num' }, `P${i + 1}`),
        h(
          'div',
          { class: 'avatar' },
          h('div', { class: 'av-hat', 'data-hat': look.hat, style: `--h:${hex(look.hatColor)}` }),
          h('div', { class: 'av-head' }, h('i'), h('i')),
          h('div', { class: 'av-body' }),
        ),
        h(
          'div',
          { class: 'fighter-pick' },
          h('button', { class: 'arrow', onclick: cycle(-1), 'aria-label': 'Previous fighter' }, '◀'),
          h('span', { class: 'fighter-name' }, look.name),
          h('button', { class: 'arrow', onclick: cycle(1), 'aria-label': 'Next fighter' }, '▶'),
        ),
        select,
      );
    });

    const startLabel = active === 0 ? 'Add a fighter' : active === 1 ? 'Practice' : 'Brawl!';
    this.setupEl.replaceChildren(
      h(
        'div',
        { class: 'panel setup-panel' },
        h('h1', { class: 'title' }, GAME_TITLE),
        h('p', { class: 'subtitle' }, 'Wobbly physics brawling on the rooftops. Last one standing wins the round — first to three rounds takes the match.'),
        h('div', { class: 'slots' }, ...slots),
        this.mapPicker(),
        h(
          'div',
          { class: 'options' },
          h(
            'label',
            {},
            h('input', {
              type: 'checkbox',
              ...(s.holdToPunch ? { checked: true } : {}),
              onchange: (e: Event) => {
                s.holdToPunch = (e.target as HTMLInputElement).checked;
                this.game.setHoldToPunch(s.holdToPunch);
                this.persist();
              },
            }),
            ' Hold to keep punching',
          ),
          h(
            'label',
            {},
            h('input', {
              type: 'checkbox',
              ...(s.mouseControls ? { checked: true } : {}),
              onchange: (e: Event) => {
                s.mouseControls = (e.target as HTMLInputElement).checked;
                this.input.mouseEnabled = s.mouseControls;
                this.persist();
              },
            }),
            ' Mouse buttons for WASD player',
          ),
          h(
            'label',
            {},
            'Volume ',
            h('input', {
              type: 'range',
              min: 0,
              max: 1,
              step: 0.05,
              value: s.volume,
              oninput: (e: Event) => {
                s.volume = Number((e.target as HTMLInputElement).value);
                this.sfx.setVolume(s.volume);
                this.persist();
              },
            }),
          ),
        ),
        h(
          'div',
          { class: 'buttons' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.controlsReturn = 'setup';
                this.show('controls');
              },
            },
            'Controls',
          ),
          h('button', { class: 'btn primary', id: 'start-btn', ...(active === 0 ? { disabled: true } : {}), onclick: () => this.startMatch() }, startLabel),
        ),
        h('p', { class: 'note' }, 'Online play, more maps and modes, customisation and progression arrive in later stages — see docs/CHECKLIST.md.'),
      ),
    );
  }

  private mapPicker(): HTMLElement {
    const s = this.settings;
    const current = s.map ?? 'rotate';
    const themeColors: Record<string, string> = {
      'sunset-rooftop': 'linear-gradient(135deg,#3a4a9a,#f59a8a,#ffc47e)',
      factory: 'linear-gradient(135deg,#2a1d18,#ff5a00)',
      highway: 'linear-gradient(135deg,#2f6fd0,#f3e3c0)',
      funfair: 'linear-gradient(135deg,#070a24,#ff4fa3)',
    };
    const card = (id: string, name: string, blurb: string, bg: string) =>
      h(
        'button',
        {
          class: `map ${current === id ? 'picked' : ''}`,
          style: `--bg:${bg}`,
          'aria-pressed': current === id ? 'true' : 'false',
          title: blurb,
          onclick: () => {
            s.map = id;
            this.persist();
            this.sfx.click();
            this.game.preview(id);
            this.renderSetup();
          },
        },
        h('span', { class: 'map-swatch' }),
        h('span', { class: 'map-name' }, name),
        h('span', { class: 'map-blurb' }, blurb),
      );
    const picked = ARENAS.find((a) => a.id === current);
    return h(
      'div',
      { class: 'maps' },
      h('div', { class: 'maps-title' }, 'Map'),
      h(
        'div',
        { class: 'map-row' },
        card('rotate', 'Rotation', 'A different map every round.', 'repeating-linear-gradient(90deg,#3a4a9a 0 25%,#ff5a00 25% 50%,#2f6fd0 50% 75%,#ff4fa3 75%)'),
        card('random', 'Random', 'One random map for the whole match.', 'repeating-linear-gradient(45deg,#ddd 0 8px,#bbb 8px 16px)'),
        ...ARENAS.map((a) => card(a.id, a.name, a.blurb, themeColors[a.theme])),
      ),
      picked ? h('div', { class: 'map-desc' }, picked.blurb) : null,
    );
  }

  private persist(): void {
    saveSettings(this.settings);
  }

  private startMatch(): void {
    this.sfx.unlock();
    this.sfx.startAmbience();
    const fighters = this.settings.slots
      .filter((s) => s.device !== 'off')
      .map((s) => ({ device: s.device, look: FIGHTERS[s.fighter] }));
    if (!fighters.length) return;
    this.game.setHoldToPunch(this.settings.holdToPunch);
    this.game.start(fighters, this.settings.map ?? 'rotate');
    this.buildCards();
    this.scoreKey = '';
    this.helpEl.classList.toggle('hidden', false);
    setTimeout(() => this.helpEl.classList.add('hidden'), 7000);
    this.show('hud');
  }

  // ------------------------------------------------------------------ controls
  private buildControls(): void {
    this.controlsEl = h('div', { class: 'screen controls hidden' });
    this.root.append(this.controlsEl);
  }

  private renderControls(): void {
    const b = this.input.bindings;
    const row = (a: Action) =>
      h(
        'tr',
        {},
        h('td', {}, ACTION_LABELS[a]),
        ...(['kbA', 'kbB'] as const).map((dev) =>
          h(
            'td',
            {},
            h(
              'button',
              {
                class: 'key',
                onclick: (e: Event) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.textContent = 'press a key…';
                  btn.classList.add('listening');
                  this.input.captureNext = (code) => {
                    if (code !== 'Escape') {
                      // A key may only do one thing per scheme: remove it elsewhere.
                      for (const other of ACTIONS) b[dev][other] = b[dev][other].filter((c) => c !== code);
                      b[dev][a] = [code];
                      this.settings.bindings = b;
                      this.persist();
                    }
                    this.renderControls();
                  };
                },
              },
              b[dev][a].map(keyLabel).join(' / ') || '—',
            ),
          ),
        ),
      );
    this.controlsEl.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Controls'),
        h('p', { class: 'note' }, 'Click a key to rebind it. Mouse (WASD player): left = punch, right = grab, middle = lift. Gamepad: stick move, A jump, X punch, B kick, Y headbutt, RT grab, LT lift, RB dive, LB/L3 sprint, Start pause.'),
        h('table', { class: 'bindings' }, h('tr', {}, h('th', {}, 'Action'), h('th', {}, 'Keyboard — WASD'), h('th', {}, 'Keyboard — Arrows')), ...ACTIONS.map(row)),
        h(
          'div',
          { class: 'buttons' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.input.bindings = structuredClone(DEFAULT_BINDINGS);
                this.settings.bindings = null;
                this.persist();
                this.renderControls();
              },
            },
            'Reset defaults',
          ),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                this.renderHelp();
                this.show(this.controlsReturn);
              },
            },
            'Done',
          ),
        ),
        h(
          'div',
          { class: 'howto' },
          h('h3', {}, 'How to brawl'),
          h('ul', {},
            h('li', {}, 'Punch to daze. Enough hits (or one big one to the head) knocks a fighter out cold.'),
            h('li', {}, 'Hold Grab to reach with both hands — they stick to whatever they touch: fighters, crates, railings.'),
            h('li', {}, 'While grabbing, hold Lift to hoist them overhead, then let go of Grab to throw.'),
            h('li', {}, 'Kicks shove hardest, headbutts daze the most (and sting you a little). Sprint then Dive for a flying tackle — even out of a jump.'),
            h('li', {}, 'Hanging from a ledge or railing? Press Jump to climb up and over. Jump while gripping a railing to vault it.'),
            h('li', {}, 'Watch your stamina: sprinting, specials, hanging and lifting drain it. Run dry and your grip slips — stand still to recover.'),
            h('li', {}, 'Knocked-out fighters can be dragged and tossed. Mash buttons to wake up faster.'),
            h('li', {}, 'Fall off the roof and you are out for the round.'),
          ),
        ),
      ),
    );
  }

  // --------------------------------------------------------------------- pause
  private buildPause(): void {
    this.pauseEl = h(
      'div',
      { class: 'screen pause hidden' },
      h(
        'div',
        { class: 'panel small' },
        h('h2', {}, 'Paused'),
        h('button', { class: 'btn primary', onclick: () => this.togglePause() }, 'Resume'),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              this.game.sim?.rules.restartMatch();
              this.togglePause();
            },
          },
          'Restart match',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              this.controlsReturn = 'pause';
              this.show('controls');
            },
          },
          'Controls',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              this.game.stop();
              this.game.paused = false;
              this.show('setup');
            },
          },
          'Change fighters',
        ),
      ),
    );
    this.root.append(this.pauseEl);
  }

  private togglePause(): void {
    if (!this.game.running) return;
    if (!this.controlsEl.classList.contains('hidden')) return;
    this.game.paused = !this.game.paused;
    this.show(this.game.paused ? 'pause' : 'hud');
  }

  // ---------------------------------------------------------------------- help
  private buildHelp(): void {
    this.helpEl = h('div', { class: 'help hidden' });
    this.root.append(this.helpEl);
    this.renderHelp();
  }

  private renderHelp(): void {
    const line = (scheme: 'kbA' | 'kbB') => {
      const b = this.input.bindings[scheme];
      const k = (a: Action) => b[a].map(keyLabel).join('/');
      return `move ${k('up')}${k('left')}${k('down')}${k('right')} · jump ${k('jump')} · punch ${k('punch')} · kick ${k('kick')} · headbutt ${k('headbutt')} · grab ${k('grab')} · lift ${k('lift')} · dive ${k('dive')} · sprint ${k('sprint')}`;
    };
    this.helpEl.replaceChildren(
      h('b', {}, 'WASD player '),
      line('kbA') + ' · mouse L punch / R grab / M lift',
      h('br'),
      h('b', {}, 'Arrows player '),
      line('kbB'),
      h('br'),
      h('span', { class: 'dim' }, 'Grab + Lift then release Grab = throw · Jump while hanging = climb · H toggles this help · Esc pauses · F3 stats'),
    );
  }

  // ----------------------------------------------------------------------- HUD
  private buildHud(): void {
    this.scoreEl = h('div', { class: 'scoreboard' });
    this.bannerEl = h('div', { class: 'banner hidden' });
    this.cardsEl = h('div', { class: 'cards' });
    this.tagsEl = h('div', { class: 'tags' });
    this.statsEl = h('div', { class: 'stats hidden' });
    this.warnEl = h('div', { class: 'warning hidden' });
    this.hudEl = h('div', { class: 'hud hidden' }, this.tagsEl, this.scoreEl, this.warnEl, this.bannerEl, this.cardsEl, this.statsEl);
    this.root.append(this.hudEl);
  }

  private buildCards(): void {
    this.cardsEl.replaceChildren(
      ...this.game.fighters.map((f, i) =>
        h(
          'div',
          { class: 'card', 'data-i': i, style: `--c:${hex(f.look.body)}` },
          h('div', { class: 'card-name' }, `P${i + 1} ${f.look.name}`),
          h('div', { class: 'card-dev' }, DEVICE_LABELS[f.device]),
          h('div', { class: 'bar-label' }, 'daze'),
          h('div', { class: 'daze' }, h('div', { class: 'daze-fill' })),
          h('div', { class: 'bar-label' }, 'stamina'),
          h('div', { class: 'stam' }, h('div', { class: 'stam-fill' })),
          h('div', { class: 'card-state' }),
        ),
      ),
    );
    this.tagsEl.replaceChildren(
      ...this.game.fighters.map((f, i) => h('div', { class: 'tag', style: `--c:${hex(f.look.body)}` }, `P${i + 1}`, h('div', { class: 'tag-stam' }, h('i')))),
    );
  }

  private warnEl!: HTMLElement;
  private warnTimer = 0;

  /** Hazard warning strip under the scoreboard. */
  private warn(text: string): void {
    this.warnEl.textContent = '⚠ ' + text;
    this.warnEl.classList.remove('hidden', 'flash');
    void this.warnEl.offsetWidth;
    this.warnEl.classList.add('flash');
    this.warnTimer = 2.6;
  }

  private banner(text: string, sub = '', seconds = 2): void {
    this.bannerEl.replaceChildren(h('div', { class: 'banner-main' }, text), sub ? h('div', { class: 'banner-sub' }, sub) : '');
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.remove('pop');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('pop');
    this.bannerTimer = seconds;
  }

  private name(i: number): string {
    const f = this.game.fighters[i];
    return f ? f.look.name : '???';
  }

  private onEvent(ev: SimEvent): void {
    switch (ev.type) {
      case 'roundStart':
        this.banner(`Round ${ev.round}`, 'Get ready…', 2);
        break;
      case 'fight':
        this.banner('BRAWL!', '', 1);
        break;
      case 'eliminated':
        if (this.game.sim?.rules.phase === 'fight' || this.game.sim?.rules.phase === 'sandbox') this.banner(`${this.name(ev.char)} ${OUT_LINES[ev.cause]}`, '', 1.4);
        if (this.game.sim?.rules.phase === 'sandbox') {
          // Practice mode: respawn after a moment.
          setTimeout(() => this.game.sim?.resetRound(), 1500);
        }
        break;
      case 'warning':
        this.warn(ev.text);
        break;
      case 'timeUp':
        this.warn("Time's up!");
        break;
      case 'arenaChange': {
        const a = ARENAS.find((x) => x.id === ev.arena);
        if (a) this.banner(a.name, a.blurb, 2.4);
        break;
      }
      case 'roundEnd':
        if (ev.winner >= 0) this.banner(`${this.name(ev.winner)} wins the round!`, this.scoreLine(), 3.4);
        else this.banner('Draw!', 'Nobody survived that one.', 3.4);
        break;
      case 'matchEnd':
        this.banner(`${this.name(ev.winner)} wins the match!`, `First to ${WINS_TO_WIN_MATCH} — new match starting soon`, 6.2);
        break;
      case 'ko':
        break;
      default:
        break;
    }
  }

  private scoreLine(): string {
    const sim = this.game.sim;
    if (!sim) return '';
    return this.game.fighters.map((f, i) => `${f.look.name} ${sim.rules.scores[i]}`).join('  ·  ');
  }

  private lastTick = 0;

  private tick = (now: number): void => {
    requestAnimationFrame(this.tick);
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 1 / 60;
    this.lastTick = now;
    const sim = this.game.sim;
    if (!sim) return;
    if (this.bannerTimer > 0 && !this.game.paused) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.add('hidden');
    }
    if (this.warnTimer > 0 && !this.game.paused) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0) this.warnEl.classList.add('hidden');
    }
    // Scoreboard.
    const rules = sim.rules;
    const left = Math.max(0, ROUND_TIME_LIMIT - rules.roundTime);
    const clock = rules.phase === 'fight' ? `${Math.floor(rules.roundTime / 60)}:${String(Math.floor(rules.roundTime % 60)).padStart(2, '0')}` : '';
    const timeText = rules.phase === 'fight' && left < 30 ? ` · ${Math.ceil(left)}s left!` : clock ? ` · ${clock}` : '';
    const key = `${rules.phase}|${rules.round}|${rules.scores.join(',')}|${sim.characters.map((c) => (c.alive ? 1 : 0)).join('')}|${timeText}|${sim.arena.id}`;
    if (key === this.scoreKey) {
      // unchanged
    } else if (rules.phase !== 'sandbox') {
      this.scoreKey = key;
      this.scoreEl.replaceChildren(
        h('div', { class: `round ${left < 30 && rules.phase === 'fight' ? 'urgent' : ''}` }, `${sim.arena.name} · Round ${rules.round}${timeText}`),
        ...this.game.fighters.map((f, i) =>
          h(
            'div',
            { class: `score ${sim.characters[i].alive ? '' : 'out'}`, style: `--c:${hex(f.look.body)}` },
            h('span', { class: 'dot' }),
            f.look.name,
            h('span', { class: 'pips' }, ...Array.from({ length: WINS_TO_WIN_MATCH }, (_, k) => h('i', { class: k < rules.scores[i] ? 'on' : '' }))),
          ),
        ),
      );
    } else {
      this.scoreKey = key;
      this.scoreEl.replaceChildren(h('div', { class: 'round' }, 'Practice — add a second fighter for rounds'));
    }
    // Player cards.
    const cards = this.cardsEl.children;
    sim.characters.forEach((c, i) => {
      const card = cards[i] as HTMLElement | undefined;
      if (!card) return;
      const fill = card.querySelector('.daze-fill') as HTMLElement;
      fill.style.width = `${Math.min(100, (c.daze / COMBAT.koThreshold) * 100)}%`;
      const stam = card.querySelector('.stam-fill') as HTMLElement;
      stam.style.width = `${(c.stamina / STAMINA.max) * 100}%`;
      stam.classList.toggle('empty', c.exhausted);
      const state = card.querySelector('.card-state') as HTMLElement;
      const label =
        c.state === 'eliminated'
          ? 'OUT — spectating'
          : c.state === 'ko'
            ? `KO'd! ${Math.max(0, c.koTimer).toFixed(1)}s`
            : c.exhausted
              ? 'Exhausted!'
              : c.envGrips() > 0 && !c.grounded
                ? 'Hanging on — Jump to climb'
                : c.daze > 60
                  ? 'Dazed'
                  : '';
      if (state.textContent !== label) state.textContent = label;
      card.classList.toggle('out', c.state === 'eliminated');
      card.classList.toggle('ko', c.state === 'ko');
    });
    // Name tags above heads.
    const tags = this.tagsEl.children;
    sim.characters.forEach((c, i) => {
      const tag = tags[i] as HTMLElement | undefined;
      if (!tag) return;
      const p = this.game.headScreen(i);
      const show = c.alive && p && p.visible;
      tag.style.display = show ? 'block' : 'none';
      if (show && p) tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      const bar = tag.querySelector('.tag-stam i') as HTMLElement | null;
      if (bar) {
        bar.style.width = `${(c.stamina / STAMINA.max) * 100}%`;
        bar.classList.toggle('empty', c.exhausted);
      }
      (tag.querySelector('.tag-stam') as HTMLElement | null)?.classList.toggle('full', c.stamina >= STAMINA.max - 0.5);
    });
    if (this.showStats) {
      this.statsEl.textContent = `${this.game.fps.toFixed(0)} fps · physics ${this.game.stepMs.toFixed(2)} ms/step · ${sim.characters.length} fighters`;
    }
  };
}
