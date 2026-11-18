import type { Game } from '../game';
import type { ProfileService } from '../profile';
import type { Settings } from '../storage';
import { saveSettings } from '../storage';
import type { Sfx } from '../audio/sfx';
import { h, avatar } from './online';
import type { Item, ItemKind, Loadout } from '../../meta/cosmetics';
import { ITEMS, PALETTE, characterById, defaultLoadout, itemById } from '../../meta/cosmetics';
import type { ApplyResult } from '../../meta/progression';
import { buy, isUnlocked, levelInfo, rankFor } from '../../meta/progression';
import { lookFrom } from '../render/fighters';
import { ARENAS } from '../../sim/arenas';
import { MODES } from '../../sim/modes';
import { GAME_TITLE } from './title';

export type MetaScreen = 'menu' | 'customise' | 'settings' | 'stats' | 'friends' | 'results' | 'howto';

export interface MetaHooks {
  play(): void;
  controls(): void;
  friendsPanel(): HTMLElement;
  activateOnline(): void;
  show(screen: MetaScreen): void;
  /** Key labels for an action on the WASD keyboard scheme, e.g. "J/F". */
  keys(action: string): string;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const coin = '🪙';

type Tab = 'character' | 'colours' | 'hat' | 'outfit' | 'accessory' | 'emote' | 'victory';
const TABS: [Tab, string][] = [
  ['character', 'Character'],
  ['colours', 'Colours'],
  ['hat', 'Hat'],
  ['outfit', 'Outfit'],
  ['accessory', 'Extras'],
  ['emote', 'Emote'],
  ['victory', 'Victory'],
];

/** Main menu, customisation/shop, settings, statistics, friends and results. */
export class MetaUI {
  readonly screens: Record<MetaScreen, HTMLElement>;
  private tab: Tab = 'character';
  private colourTarget: 'body' | 'pants' | 'hatColor' = 'body';
  private message = '';

  constructor(
    root: HTMLElement,
    private readonly game: Game,
    private readonly profiles: ProfileService,
    private readonly settings: Settings,
    private readonly sfx: Sfx,
    private readonly hooks: MetaHooks,
  ) {
    const mk = (cls: string) => {
      const el = h('div', { class: `screen ${cls} hidden` });
      root.append(el);
      return el;
    };
    this.screens = {
      menu: mk('menu'),
      customise: mk('customise'),
      settings: mk('settings-screen'),
      stats: mk('stats-screen'),
      friends: mk('friends-screen'),
      results: mk('results'),
      howto: mk('howto-screen'),
    };
    profiles.onChange(() => {
      if (!this.screens.menu.classList.contains('hidden')) this.renderMenu();
    });
  }

  render(screen: MetaScreen): void {
    switch (screen) {
      case 'menu':
        return this.renderMenu();
      case 'customise':
        return this.renderCustomise();
      case 'settings':
        return this.renderSettings();
      case 'stats':
        return this.renderStats();
      case 'friends':
        return this.renderFriends();
      case 'howto':
        return this.renderHowTo();
      case 'results':
        return;
    }
  }

  private back(): HTMLElement {
    return h('button', { class: 'btn tiny back', onclick: () => this.hooks.show('menu') }, '← Menu');
  }

  /** Name, level, rank, XP bar and coins. */
  profileBar(): HTMLElement {
    const p = this.profiles.profile;
    const lv = levelInfo(p.xp);
    const pct = lv.need ? Math.round((lv.into / lv.need) * 100) : 100;
    return h(
      'div',
      { class: 'profile-bar' },
      avatar(p.loadout),
      h(
        'div',
        { class: 'pb-main' },
        h('div', { class: 'pb-name' }, this.settings.playerName ?? 'Player', h('span', { class: 'pb-rank' }, ` · Level ${lv.level} ${rankFor(lv.level)}`)),
        h('div', { class: 'xpbar', title: lv.need ? `${lv.into} / ${lv.need} XP` : 'Max level' }, h('i', { style: `width:${pct}%` })),
      ),
      h('div', { class: 'coins', id: 'coins' }, `${coin} ${p.coins}`),
    );
  }

  // --------------------------------------------------------------------- menu
  private renderMenu(): void {
    const item = (label: string, sub: string, run: () => void, id: string, primary = false) =>
      h(
        'button',
        {
          class: `menu-item ${primary ? 'primary' : ''}`,
          id,
          onclick: () => {
            this.sfx.click();
            run();
          },
        },
        h('span', { class: 'mi-label' }, label),
        h('span', { class: 'mi-sub' }, sub),
      );
    this.screens.menu.replaceChildren(
      h(
        'div',
        { class: 'panel menu-panel' },
        h('h1', { class: 'title' }, GAME_TITLE),
        this.profileBar(),
        h(
          'div',
          { class: 'menu-items' },
          item('Play', 'Local or online brawls', () => this.hooks.play(), 'menu-play', true),
          item('How to play', 'Moves, modes and maps', () => this.hooks.show('howto'), 'menu-howto'),
          item('Customise', 'Characters, outfits, emotes', () => this.hooks.show('customise'), 'menu-customise'),
          item('Settings', 'Audio, controls, graphics', () => this.hooks.show('settings'), 'menu-settings'),
          item('Statistics', 'Your record', () => this.hooks.show('stats'), 'menu-stats'),
          item('Friends', 'Friend codes and invites', () => this.hooks.show('friends'), 'menu-friends'),
        ),
        h('p', { class: 'note' }, 'Progress, coins and unlocks are saved in this browser only.'),
      ),
    );
  }

  // ------------------------------------------------------------------ how to
  private renderHowTo(): void {
    const k = (a: string) => h('kbd', {}, this.hooks.keys(a));
    const firstRun = !this.settings.tutorialSeen;
    const card = (icon: string, title: string, ...body: (string | HTMLElement)[]) =>
      h('div', { class: 'howto-card' }, h('div', { class: 'howto-icon' }, icon), h('div', {}, h('h3', {}, title), h('p', {}, ...body)));
    const done = () => {
      this.settings.tutorialSeen = true;
      saveSettings(this.settings);
    };
    this.screens.howto.replaceChildren(
      h(
        'div',
        { class: 'panel howto-panel' },
        firstRun ? null : this.back(),
        h('h2', {}, firstRun ? `Welcome to ${GAME_TITLE}!` : 'How to play'),
        h('p', { class: 'note' }, 'Wobbly fighters, real physics. Knock everyone else off the map — or out cold and then off the map.'),
        h(
          'div',
          { class: 'howto-grid' },
          card('🕹️', 'Move', 'Walk with ', k('up'), k('left'), k('down'), k('right'), ', hold ', k('sprint'), ' to sprint and ', k('jump'), ' to jump. Sprinting and specials use stamina — run dry and you get tired and slow.'),
          card('👊', 'Strike', 'Punch ', k('punch'), ' (or left mouse), kick ', k('kick'), ', headbutt ', k('headbutt'), ' and dive-tackle ', k('dive'), '. Hits to the head daze — enough of them and the target is knocked out for a few seconds.'),
          card('✋', 'Grab & throw', 'Hold ', k('grab'), ' (or right mouse) to grab whatever your hands touch. Hold ', k('lift'), ' to lift, then let go of grab to throw. Knocked-out fighters are much easier to carry.'),
          card('🧗', 'Hang & climb', 'Grab a ledge or railing to hang on. Press ', k('jump'), ' while hanging to climb back up. Mash your buttons when someone holds you to struggle free.'),
          card('🏆', 'Win', 'Rounds end when one fighter (or team) is left. First to win 3 rounds takes the match. Eliminated players spectate in grey until the next round.'),
          card('🎉', 'Show off', 'Press ', k('emote'), ' to emote. Matches earn XP and coins: level up to unlock and buy characters, outfits, hats, emotes and victory dances.'),
        ),
        h('h3', { class: 'howto-sub' }, 'Modes'),
        h('div', { class: 'howto-list' }, ...MODES.map((m) => h('div', {}, h('b', {}, m.name), ' — ', m.blurb))),
        h('h3', { class: 'howto-sub' }, 'Maps'),
        h('div', { class: 'howto-list' }, ...ARENAS.map((a) => h('div', {}, h('b', {}, a.name), ' — ', a.blurb))),
        h('p', { class: 'note' }, 'Gamepads work too: A jump, X punch, B kick, Y headbutt, RT grab, LT lift, RB dive, LB sprint, Back emote. Press H in a match for a key reminder, Esc to pause.'),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn primary',
              id: 'howto-play',
              onclick: () => {
                this.sfx.click();
                done();
                this.hooks.play();
              },
            },
            firstRun ? "Got it — let's play!" : 'Play',
          ),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.sfx.click();
                done();
                this.hooks.controls();
              },
            },
            'Change keys',
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- customise
  private equip(next: Loadout): void {
    const p = this.profiles.profile;
    p.loadout = next;
    this.profiles.save();
    this.game.previewLook(lookFrom(next, this.settings.playerName));
  }

  private tryItem(item: Item, apply: (l: Loadout) => Loadout): void {
    const p = this.profiles.profile;
    if (!isUnlocked(p, item)) {
      if (item.price === undefined) {
        this.message = `${item.name} unlocks at level ${item.level}.`;
        this.renderCustomise();
        return;
      }
      const err = buy(p, item);
      if (err) {
        this.message = err;
        this.renderCustomise();
        return;
      }
      this.sfx.goal();
      this.message = `Bought ${item.name}!`;
    } else this.message = '';
    this.sfx.click();
    this.equip(apply({ ...p.loadout }));
    this.renderCustomise();
  }

  private itemButton(item: Item, equipped: boolean, apply: (l: Loadout) => Loadout, swatch?: number): HTMLElement {
    const p = this.profiles.profile;
    const open = isUnlocked(p, item);
    const lock = open ? '' : item.price !== undefined ? `${coin} ${item.price}` : `🔒 Lv ${item.level}`;
    return h(
      'button',
      {
        class: `item ${equipped ? 'equipped' : ''} ${open ? '' : 'locked'} ${swatch !== undefined ? 'swatch' : ''}`,
        'data-item': item.id,
        title: item.name,
        style: swatch !== undefined ? `--sw:${hex(swatch)}` : '',
        onclick: () => this.tryItem(item, apply),
      },
      swatch === undefined ? h('span', { class: 'item-name' }, item.name) : '',
      lock ? h('span', { class: 'item-lock' }, lock) : equipped ? h('span', { class: 'item-lock' }, '✓') : '',
    );
  }

  private renderCustomise(): void {
    const p = this.profiles.profile;
    const l = p.loadout;
    this.game.startPreview(lookFrom(l, this.settings.playerName));
    const grid = (kind: ItemKind, field: keyof Loadout) =>
      h(
        'div',
        { class: 'items' },
        ...ITEMS.filter((i) => i.kind === kind).map((i) => this.itemButton(i, l[field] === i.value, (x) => ({ ...x, [field]: i.value }))),
      );
    let body: HTMLElement;
    switch (this.tab) {
      case 'character':
        body = h(
          'div',
          { class: 'items' },
          ...ITEMS.filter((i) => i.kind === 'character').map((i) =>
            this.itemButton(i, l.character === i.value, (x) => {
              const d = defaultLoadout(String(i.value));
              return { ...x, character: d.character, body: d.body, pants: d.pants, hat: d.hat, hatColor: d.hatColor };
            }),
          ),
        );
        break;
      case 'colours': {
        const target = this.colourTarget;
        const c = characterById(l.character);
        // The character's own colours are always available.
        const own = [c.body, c.pants, c.hatColor].filter((v) => !PALETTE.includes(v));
        body = h(
          'div',
          {},
          h(
            'div',
            { class: 'subtabs' },
            ...(
              [
                ['body', 'Body'],
                ['pants', 'Trousers'],
                ['hatColor', 'Hat'],
              ] as const
            ).map(([k, label]) =>
              h(
                'button',
                {
                  class: `btn tiny ${target === k ? 'primary' : ''}`,
                  onclick: () => {
                    this.colourTarget = k;
                    this.renderCustomise();
                  },
                },
                label,
              ),
            ),
          ),
          h(
            'div',
            { class: 'items swatches' },
            ...own.map((v) => this.itemButton({ id: `own:${v}`, kind: 'color', value: v, name: 'Original colour' }, l[target] === v, (x) => ({ ...x, [target]: v }), v)),
            ...ITEMS.filter((i) => i.kind === 'color').map((i) => this.itemButton(i, l[target] === i.value, (x) => ({ ...x, [target]: i.value as number }), i.value as number)),
          ),
        );
        break;
      }
      case 'hat':
        body = grid('hat', 'hat');
        break;
      case 'outfit':
        body = grid('outfit', 'outfit');
        break;
      case 'accessory':
        body = grid('accessory', 'accessory');
        break;
      case 'emote':
        body = grid('emote', 'emote');
        break;
      case 'victory':
        body = grid('victory', 'victory');
        break;
    }
    this.screens.customise.replaceChildren(
      h(
        'div',
        { class: 'panel side-panel' },
        h('div', { class: 'side-head' }, this.back(), h('h2', {}, 'Customise'), h('div', { class: 'coins' }, `${coin} ${p.coins}`)),
        h(
          'div',
          { class: 'tabs wrap' },
          ...TABS.map(([id, label]) =>
            h(
              'button',
              {
                class: `tab ${this.tab === id ? 'on' : ''}`,
                onclick: () => {
                  this.tab = id;
                  this.message = '';
                  this.renderCustomise();
                },
              },
              label,
            ),
          ),
        ),
        body,
        this.message ? h('p', { class: 'cust-msg' }, this.message) : null,
        h(
          'div',
          { class: 'buttons' },
          h('button', { class: 'btn tiny', id: 'try-emote', onclick: () => this.game.previewEmote() }, `Try emote (${itemById(`emote:${l.emote}`)?.name})`),
          h('button', { class: 'btn tiny', id: 'try-victory', onclick: () => this.game.previewVictory() }, 'Try victory pose'),
        ),
        h('p', { class: 'note' }, 'Purely cosmetic — no item changes how you fight. Your look is used for P1 locally and for you online.'),
      ),
    );
  }

  // ----------------------------------------------------------------- settings
  private renderSettings(): void {
    const s = this.settings;
    const save = () => saveSettings(s);
    const check = (label: string, value: boolean, set: (v: boolean) => void) =>
      h(
        'label',
        { class: 'setting' },
        h('input', {
          type: 'checkbox',
          ...(value ? { checked: true } : {}),
          onchange: (e: Event) => {
            set((e.target as HTMLInputElement).checked);
            save();
          },
        }),
        ' ' + label,
      );
    const slider = (label: string, value: number, set: (v: number) => void) =>
      h(
        'label',
        { class: 'setting' },
        label + ' ',
        h('input', {
          type: 'range',
          min: 0,
          max: 1,
          step: 0.05,
          value,
          oninput: (e: Event) => {
            set(Number((e.target as HTMLInputElement).value));
            save();
          },
        }),
      );
    this.screens.settings.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'side-head' }, this.back(), h('h2', {}, 'Settings')),
        h(
          'div',
          { class: 'settings-grid' },
          h('h3', {}, 'Audio'),
          slider('Master volume', s.volume, (v) => {
            s.volume = v;
            this.sfx.setVolume(v);
          }),
          slider('Sound effects', s.sfxVolume ?? 1, (v) => {
            s.sfxVolume = v;
            this.sfx.setSfxVolume(v);
          }),
          slider('Music', s.musicVolume ?? 0.6, (v) => {
            s.musicVolume = v;
            this.sfx.setMusicVolume(v);
          }),
          h('h3', {}, 'Gameplay'),
          check('Hold to keep punching', s.holdToPunch, (v) => {
            s.holdToPunch = v;
            this.game.setHoldToPunch(v);
          }),
          check('Mouse buttons for the WASD player', s.mouseControls, (v) => (s.mouseControls = v)),
          check('Camera shake', s.cameraShake ?? true, (v) => {
            s.cameraShake = v;
            this.game.setCameraShake(v);
          }),
          h('button', { class: 'btn tiny', onclick: () => this.hooks.controls() }, 'Remap controls…'),
          h('h3', {}, 'Graphics'),
          h(
            'label',
            { class: 'setting' },
            'Quality ',
            h(
              'select',
              {
                'aria-label': 'Graphics quality',
                onchange: (e: Event) => {
                  s.quality = (e.target as HTMLSelectElement).value as Settings['quality'];
                  this.game.setQuality(s.quality ?? 'auto');
                  save();
                },
              },
              ...(['auto', 'high', 'medium', 'low'] as const).map((q) => {
                const o = h('option', { value: q }, q === 'auto' ? 'Auto (adapts to frame rate)' : q[0].toUpperCase() + q.slice(1));
                if ((s.quality ?? 'auto') === q) o.selected = true;
                return o;
              }),
            ),
          ),
          h('h3', {}, 'Progress'),
          h(
            'button',
            {
              class: 'btn tiny danger',
              onclick: () => {
                if (confirm('Reset your level, coins, unlocks and statistics? This cannot be undone.')) {
                  this.profiles.reset();
                  this.hooks.show('menu');
                }
              },
            },
            'Reset progress',
          ),
        ),
      ),
    );
  }

  // -------------------------------------------------------------------- stats
  private renderStats(): void {
    const p = this.profiles.profile;
    const s = p.stats;
    const lv = levelInfo(p.xp);
    const fav = Object.entries(s.mapPlays).sort((a, b) => b[1] - a[1])[0];
    const favName = fav ? (ARENAS.find((a) => a.id === fav[0])?.name ?? fav[0]) : '—';
    const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
    const mins = Math.floor(s.seconds / 60);
    const row = (label: string, value: string | number) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, String(value)));
    this.screens.stats.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'side-head' }, this.back(), h('h2', {}, 'Statistics')),
        this.profileBar(),
        h(
          'div',
          { class: 'stats-grid' },
          row('Level', `${lv.level} (${rankFor(lv.level)})`),
          row('Total XP', p.xp),
          row('Matches played', s.matches),
          row('Matches won', `${s.matchWins} (${pct(s.matchWins, s.matches)})`),
          row('Rounds won', `${s.roundWins} / ${s.rounds}`),
          row('Knockouts', s.kos),
          row('Ring-outs', s.ringOuts),
          row('Times knocked off', s.falls),
          row('Punches', s.punches),
          row('Kicks', s.kicks),
          row('Headbutts', s.headbutts),
          row('Dive tackles', s.dives),
          row('Throws', s.throws),
          row('Climbs', s.climbs),
          row('Time brawling', `${Math.floor(mins / 60)}h ${mins % 60}m`),
          row('Favourite map', favName),
        ),
        h('h3', {}, 'Wins by mode'),
        h('div', { class: 'stats-grid' }, ...MODES.map((m) => row(m.name, s.modeWins[m.id] ?? 0))),
      ),
    );
  }

  // ------------------------------------------------------------------ friends
  private renderFriends(): void {
    this.hooks.activateOnline();
    this.screens.friends.replaceChildren(
      h('div', { class: 'panel' }, h('div', { class: 'side-head' }, this.back(), h('h2', {}, 'Friends')), this.hooks.friendsPanel(), h('p', { class: 'note' }, 'Invite friends from your room on the Play → Online screen.')),
    );
  }

  // ------------------------------------------------------------------ results
  showResults(result: ApplyResult, won: boolean, buttons: { label: string; id: string; run: () => void; primary?: boolean }[]): void {
    const p = this.profiles.profile;
    const lv = levelInfo(p.xp);
    const pct = lv.need ? Math.round((lv.into / lv.need) * 100) : 100;
    this.screens.results.replaceChildren(
      h(
        'div',
        { class: 'panel results-panel' },
        h('h2', { class: won ? 'win' : '' }, won ? 'Victory!' : 'Match over'),
        h(
          'table',
          { class: 'reward' },
          ...result.reward.lines.map((l) => h('tr', {}, h('td', {}, l.label), h('td', {}, l.xp ? `+${l.xp} XP` : ''), h('td', {}, l.coins ? `+${l.coins} ${coin}` : ''))),
          h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', {}, `+${result.reward.xp} XP`), h('td', {}, `+${result.reward.coins} ${coin}`)),
        ),
        result.levelAfter > result.levelBefore ? h('div', { class: 'levelup' }, `LEVEL UP! You're now level ${result.levelAfter} — ${rankFor(result.levelAfter)}`) : null,
        h('div', { class: 'xpbar big' }, h('i', { style: `width:${pct}%` })),
        h('p', { class: 'note' }, `Level ${lv.level} · ${lv.need ? `${lv.into} / ${lv.need} XP to the next level` : 'max level'} · ${coin} ${p.coins}`),
        result.unlocked.length ? h('div', { class: 'unlocks' }, h('b', {}, 'Unlocked: '), result.unlocked.map((i) => i.name).join(', ')) : null,
        h(
          'div',
          { class: 'buttons' },
          ...buttons.map((b) =>
            h(
              'button',
              {
                class: `btn ${b.primary ? 'primary' : ''}`,
                id: b.id,
                onclick: () => b.run(),
              },
              b.label,
            ),
          ),
        ),
      ),
    );
  }
}
