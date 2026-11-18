import type { NetClient } from '../net/netClient';
import type { RoomInfo, ServerMsg } from '../../net/protocol';
import { MAX_ROOM } from '../../net/protocol';
import { ARENAS } from '../../sim/arenas';
import { FIGHTERS } from '../render/fighters';
import { MODES, TEAM_COLORS, TEAM_NAMES, modeDef } from '../../sim/modes';
import type { Settings } from '../storage';
import { saveSettings } from '../storage';
import type { Sfx } from '../audio/sfx';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
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

function avatar(fighter: number): HTMLElement {
  const look = FIGHTERS[fighter] ?? FIGHTERS[0];
  return h(
    'div',
    { class: 'avatar small', style: `--c:${hex(look.body)};--p:${hex(look.pants)}` },
    h('div', { class: 'av-hat', 'data-hat': look.hat, style: `--h:${hex(look.hatColor)}` }),
    h('div', { class: 'av-head' }, h('i'), h('i')),
    h('div', { class: 'av-body' }),
  );
}

export interface OnlineHooks {
  /** Re-render the setup screen (online tab content changed). */
  rerender(): void;
  matchStart(m: Extract<ServerMsg, { t: 'matchStart' }>): void;
  matchArena(m: Extract<ServerMsg, { t: 'arena' }>): void;
  matchEvents(m: Extract<ServerMsg, { t: 'events' }>): void;
  matchOver(): void;
  showOnlineTab(): void;
}

/** Online menus: profile, matchmaking, room codes, friends, invites and the room lobby. */
export class OnlineUI {
  private toastEl: HTMLElement;
  private joinCode = '';
  private friendInput = '';
  private pendingJoin: string | null = null;
  private friendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly net: NetClient,
    private readonly settings: Settings,
    private readonly sfx: Sfx,
    private readonly hooks: OnlineHooks,
    root: HTMLElement,
  ) {
    this.toastEl = h('div', { class: 'toasts' });
    root.append(this.toastEl);
    net.onMessage = (m) => this.handle(m);
    net.onChange = () => this.hooks.rerender();
    // Invite links: ?room=CODE
    const code = new URLSearchParams(location.search).get('room');
    if (code) {
      this.pendingJoin = code.toUpperCase();
      this.hooks.showOnlineTab();
    }
  }

  get name(): string {
    return this.settings.playerName ?? 'Player';
  }

  get fighter(): number {
    return this.settings.onlineFighter ?? 0;
  }

  /** Called when the online tab is shown. */
  activate(): void {
    if (this.net.status === 'offline') this.net.connect(this.name, this.fighter);
    if (!this.friendTimer) {
      this.friendTimer = setInterval(() => this.refreshFriends(), 5000);
      this.refreshFriends();
    }
  }

  private refreshFriends(): void {
    const codes = (this.settings.friends ?? []).map((f) => f.code);
    if (codes.length && this.net.status === 'online') this.net.send({ t: 'friends', codes });
  }

  private persist(): void {
    saveSettings(this.settings);
  }

  toast(text: string, actions: { label: string; run: () => void }[] = [], seconds = 6): void {
    const el = h('div', { class: 'toast' }, h('span', {}, text));
    for (const a of actions)
      el.append(
        h(
          'button',
          {
            class: 'btn tiny',
            onclick: () => {
              a.run();
              el.remove();
            },
          },
          a.label,
        ),
      );
    el.append(h('button', { class: 'x', 'aria-label': 'Dismiss', onclick: () => el.remove() }, '×'));
    this.toastEl.append(el);
    setTimeout(() => el.remove(), seconds * 1000);
  }

  private handle(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        if (this.pendingJoin) {
          this.net.send({ t: 'join', code: this.pendingJoin });
          this.pendingJoin = null;
          history.replaceState(null, '', location.pathname);
        }
        this.refreshFriends();
        break;
      case 'error':
        this.toast(m.message);
        break;
      case 'invited':
        this.sfx.click();
        this.toast(`${m.from} invited you to room ${m.code}`, [
          {
            label: 'Join',
            run: () => {
              this.hooks.showOnlineTab();
              this.net.send({ t: 'join', code: m.code });
            },
          },
        ], 20);
        break;
      case 'kicked':
        this.toast('The host removed you from the room.');
        break;
      case 'matchStart':
        this.hooks.matchStart(m);
        break;
      case 'arena':
        this.hooks.matchArena(m);
        break;
      case 'events':
        this.hooks.matchEvents(m);
        break;
      case 'matchOver':
        this.hooks.matchOver();
        break;
      case 'friends': {
        // Learn friends' names as they come online.
        let changed = false;
        for (const st of m.statuses) {
          const f = this.settings.friends?.find((x) => x.code === st.code);
          if (f && st.name && f.name !== st.name) {
            f.name = st.name;
            changed = true;
          }
        }
        if (changed) this.persist();
        break;
      }
    }
  }

  // ------------------------------------------------------------------ render
  render(): HTMLElement {
    const net = this.net;
    if (net.status !== 'online') {
      return h(
        'div',
        { class: 'online' },
        h('p', { class: 'status' }, net.status === 'connecting' ? 'Connecting to the game server…' : net.lastError || 'Offline.'),
        net.status === 'offline'
          ? h('button', { class: 'btn', onclick: () => this.net.connect(this.name, this.fighter) }, 'Retry')
          : null,
        h('p', { class: 'note' }, 'Online play needs the Wobble Weights server running (see README: npm run dev / npm start).'),
      );
    }
    return net.room ? this.renderLobby(net.room) : this.renderMenu();
  }

  private profile(): HTMLElement {
    const s = this.settings;
    const cycle = (d: number) => () => {
      s.onlineFighter = (this.fighter + d + FIGHTERS.length) % FIGHTERS.length;
      this.persist();
      this.net.setProfile(this.name, this.fighter);
      this.sfx.click();
      this.hooks.rerender();
    };
    return h(
      'div',
      { class: 'profile' },
      avatar(this.fighter),
      h(
        'div',
        { class: 'profile-fields' },
        h(
          'label',
          {},
          'Your name ',
          h('input', {
            class: 'text',
            maxlength: 16,
            value: this.name,
            'aria-label': 'Your name',
            onchange: (e: Event) => {
              s.playerName = (e.target as HTMLInputElement).value.slice(0, 16) || 'Player';
              this.persist();
              this.net.setProfile(this.name, this.fighter);
            },
          }),
        ),
        h(
          'div',
          { class: 'fighter-pick' },
          h('button', { class: 'arrow', onclick: cycle(-1), 'aria-label': 'Previous fighter' }, '◀'),
          h('span', { class: 'fighter-name' }, FIGHTERS[this.fighter].name),
          h('button', { class: 'arrow', onclick: cycle(1), 'aria-label': 'Next fighter' }, '▶'),
        ),
      ),
    );
  }

  private renderMenu(): HTMLElement {
    const code = h('input', {
      class: 'text code',
      maxlength: 5,
      placeholder: 'CODE',
      value: this.joinCode,
      'aria-label': 'Room code',
      oninput: (e: Event) => (this.joinCode = (e.target as HTMLInputElement).value.toUpperCase()),
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') this.net.send({ t: 'join', code: this.joinCode });
      },
    });
    return h(
      'div',
      { class: 'online' },
      this.profile(),
      h(
        'div',
        { class: 'online-actions' },
        h('button', { class: 'btn primary', id: 'quick-play', onclick: () => this.net.send({ t: 'quickPlay' }) }, 'Quick play'),
        h('button', { class: 'btn', id: 'create-private', onclick: () => this.net.send({ t: 'create', private: true }) }, 'Private room'),
        h('button', { class: 'btn', onclick: () => this.net.send({ t: 'create', private: false }) }, 'Public room'),
        h('span', { class: 'join' }, code, h('button', { class: 'btn', id: 'join-code', onclick: () => this.net.send({ t: 'join', code: this.joinCode }) }, 'Join')),
      ),
      this.friendsPanel(false),
      h('p', { class: 'note' }, `Connected · ${Math.round(this.net.rtt)} ms`),
    );
  }

  private friendsPanel(inRoom: boolean): HTMLElement {
    const s = this.settings;
    const friends = s.friends ?? [];
    const status = (code: string) => this.net.friends.find((f) => f.code === code);
    const add = () => {
      const c = this.friendInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length !== 6 || c === this.net.friendCode || friends.some((f) => f.code === c)) {
        this.toast(c === this.net.friendCode ? "That's your own code!" : 'Friend codes are 6 letters/numbers.');
        return;
      }
      s.friends = [...friends, { code: c, name: null }];
      this.friendInput = '';
      this.persist();
      this.refreshFriends();
      this.hooks.rerender();
    };
    return h(
      'div',
      { class: 'friends' },
      h(
        'div',
        { class: 'friends-head' },
        h('b', {}, 'Friends'),
        h('span', {}, ' · your friend code: '),
        h('code', { id: 'my-friend-code' }, this.net.friendCode),
        h('button', { class: 'btn tiny', onclick: () => this.copy(this.net.friendCode, 'Friend code copied') }, 'Copy'),
      ),
      h(
        'div',
        { class: 'friend-add' },
        h('input', {
          class: 'text',
          maxlength: 6,
          placeholder: 'Friend code',
          value: this.friendInput,
          'aria-label': 'Friend code to add',
          oninput: (e: Event) => (this.friendInput = (e.target as HTMLInputElement).value),
          onkeydown: (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') add();
          },
        }),
        h('button', { class: 'btn tiny', id: 'add-friend', onclick: add }, 'Add'),
      ),
      friends.length
        ? h(
            'ul',
            { class: 'friend-list' },
            ...friends.map((f) => {
              const st = status(f.code);
              return h(
                'li',
                {},
                h('span', { class: `dot ${st?.online ? 'on' : ''}` }),
                h('span', { class: 'fname' }, `${st?.name ?? f.name ?? 'Unknown'} (${f.code})`),
                h('span', { class: 'fstate' }, st?.online ? (st.roomCode ? `in room ${st.roomCode}` : 'online') : 'offline'),
                inRoom && st?.online
                  ? h('button', { class: 'btn tiny', onclick: () => (this.net.send({ t: 'invite', code: f.code }), this.toast(`Invite sent to ${st.name}`)) }, 'Invite')
                  : null,
                !inRoom && st?.roomCode ? h('button', { class: 'btn tiny', onclick: () => this.net.send({ t: 'join', code: st.roomCode! }) }, 'Join') : null,
                h(
                  'button',
                  {
                    class: 'x',
                    'aria-label': 'Remove friend',
                    onclick: () => {
                      s.friends = friends.filter((x) => x.code !== f.code);
                      this.persist();
                      this.hooks.rerender();
                    },
                  },
                  '×',
                ),
              );
            }),
          )
        : h('p', { class: 'note' }, 'Swap friend codes to see each other online and send invites.'),
    );
  }

  private copy(text: string, done: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.toast(done, [], 2),
      () => this.toast(text, [], 8),
    );
  }

  private renderLobby(room: RoomInfo): HTMLElement {
    const me = room.members.find((m) => m.friendCode === this.net.friendCode);
    const isHost = !!me?.host;
    const fighters = room.members.length + Math.min(room.settings.bots, MAX_ROOM - room.members.length);
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const playing = room.state === 'playing';
    const myVote = Object.entries(room.votes).find(([, ids]) => me && ids.includes(me.id))?.[0];
    const setBots = (n: number) => this.net.send({ t: 'settings', settings: { bots: n } });
    const mdef = modeDef(room.settings.mode);
    const teamsOn = mdef.teams === true || (mdef.teams === 'optional' && room.settings.teamsOn);
    const teamCount = room.settings.teamCount;
    return h(
      'div',
      { class: 'lobby' },
      h(
        'div',
        { class: 'lobby-head' },
        h('div', {}, h('span', { class: 'room-label' }, room.private ? 'Private room' : 'Public room'), h('span', { class: 'room-code', id: 'room-code' }, room.code)),
        h('button', { class: 'btn tiny', onclick: () => this.copy(link, 'Invite link copied — send it to a friend') }, 'Copy invite link'),
        h('button', { class: 'btn tiny', id: 'leave-room', onclick: () => this.net.send({ t: 'leave' }) }, 'Leave'),
      ),
      playing ? h('p', { class: 'note' }, 'A match is in progress — you are watching and will play in the next one.') : null,
      h(
        'ul',
        { class: 'members' },
        ...room.members.map((m) =>
          h(
            'li',
            { class: m.ready ? 'ready' : '' },
            avatar(m.fighter),
            h('span', { class: 'mname' }, (m.host ? '👑 ' : '') + m.name + (m.id === me?.id ? ' (you)' : '')),
            teamsOn
              ? h(
                  'button',
                  {
                    class: 'btn tiny team-btn',
                    style: `--t:${hex(TEAM_COLORS[m.team % 4])}`,
                    ...(m.id === me?.id ? {} : { disabled: true }),
                    title: m.id === me?.id ? 'Switch team' : '',
                    onclick: () => this.net.send({ t: 'team', team: (m.team + 1) % teamCount }),
                  },
                  TEAM_NAMES[m.team % 4],
                )
              : null,
            h('span', { class: 'mstate' }, m.spectating ? 'watching' : m.ready ? 'Ready!' : 'not ready'),
            isHost && !m.host ? h('button', { class: 'btn tiny', onclick: () => this.net.send({ t: 'kick', id: m.id }) }, 'Kick') : null,
          ),
        ),
        ...Array.from({ length: Math.min(room.settings.bots, MAX_ROOM - room.members.length) }, (_, i) =>
          h('li', { class: 'bot' }, avatar((room.members.length + i) % FIGHTERS.length), h('span', { class: 'mname' }, `Bot ${i + 1}`), h('span', { class: 'mstate' }, 'bot')),
        ),
      ),
      this.profile(),
      h(
        'div',
        { class: 'votes' },
        h('b', {}, `Mode: ${mdef.name}`),
        isHost
          ? h(
              'div',
              { class: 'map-row' },
              ...MODES.map((md) =>
                h(
                  'button',
                  { class: `map mode ${md.id === room.settings.mode ? 'picked' : ''}`, 'data-mode': md.id, title: md.blurb, onclick: () => this.net.send({ t: 'settings', settings: { mode: md.id } }) },
                  h('span', { class: 'map-name' }, md.name),
                ),
              ),
            )
          : null,
        h('div', { class: 'map-desc' }, mdef.blurb),
        mdef.teams !== false && isHost
          ? h(
              'div',
              { class: 'team-opts' },
              mdef.teams === 'optional'
                ? h(
                    'label',
                    {},
                    h('input', { type: 'checkbox', ...(room.settings.teamsOn ? { checked: true } : {}), onchange: (e: Event) => this.net.send({ t: 'settings', settings: { teamsOn: (e.target as HTMLInputElement).checked } }) }),
                    ' Play in teams',
                  )
                : null,
              teamsOn && room.settings.mode !== 'trophy'
                ? h('span', {}, 'Teams: ', ...[2, 3, 4].map((n) => h('button', { class: `btn tiny ${teamCount === n ? 'primary' : ''}`, onclick: () => this.net.send({ t: 'settings', settings: { teamCount: n } }) }, String(n))))
                : null,
              teamsOn ? h('button', { class: 'btn tiny', id: 'online-random-teams', onclick: () => this.net.send({ t: 'randomTeams' }) }, 'Random teams') : null,
            )
          : null,
      ),
      h(
        'div',
        { class: 'votes' },
        h('b', {}, room.settings.mapMode === 'rotate' ? 'Vote for the first map (then they rotate)' : 'Vote for a map'),
        h(
          'div',
          { class: 'map-row' },
          ...ARENAS.map((a) =>
            h(
              'button',
              { class: `map ${myVote === a.id ? 'picked' : ''}`, 'data-map': a.id, title: a.blurb, onclick: () => this.net.send({ t: 'vote', map: a.id }) },
              h('span', { class: 'map-name' }, a.name),
              h('span', { class: 'vote-count' }, '●'.repeat(room.votes[a.id]?.length ?? 0) || '—'),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'lobby-controls' },
        h(
          'button',
          { class: `btn ${me?.ready ? 'primary' : ''}`, id: 'ready-btn', onclick: () => this.net.send({ t: 'ready', ready: !me?.ready }) },
          me?.ready ? 'Ready ✓' : 'Ready?',
        ),
        isHost
          ? h(
              'span',
              { class: 'host-controls' },
              h('span', {}, 'Bots '),
              h('button', { class: 'arrow', 'aria-label': 'Fewer bots', onclick: () => setBots(room.settings.bots - 1) }, '−'),
              h('b', { id: 'bot-count' }, String(room.settings.bots)),
              h('button', { class: 'arrow', 'aria-label': 'More bots', onclick: () => setBots(room.settings.bots + 1) }, '+'),
              h(
                'label',
                {},
                h('input', {
                  type: 'checkbox',
                  ...(room.settings.mapMode === 'rotate' ? { checked: true } : {}),
                  onchange: (e: Event) => this.net.send({ t: 'settings', settings: { mapMode: (e.target as HTMLInputElement).checked ? 'rotate' : 'vote' } }),
                }),
                ' New map each round',
              ),
              h(
                'button',
                { class: 'btn primary', id: 'start-online', ...(fighters < 2 || playing ? { disabled: true } : {}), onclick: () => this.net.send({ t: 'start' }) },
                `Start (${fighters} fighters)`,
              ),
            )
          : h('span', { class: 'note' }, room.autoStartIn !== null ? `Starting in ${room.autoStartIn}…` : room.private ? 'Waiting for the host to start…' : 'Starts when everyone is ready.'),
      ),
      this.friendsPanel(true),
    );
  }
}
