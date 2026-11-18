import * as THREE from 'three';
import { GameSim, trophyDef } from '../sim/game';
import type { ModeId } from '../sim/modes';
import { ModeView } from './render/modeView';
import { MatchTracker } from './matchTracker';
import type { ArenaDef } from '../sim/arena';
import { ARENAS, arenaById } from '../sim/arenas';
import { Bot } from '../sim/bot';
import type { SimEvent } from '../sim/events';
import type { PlayerInput } from '../sim/input';
import { emptyInput } from '../sim/input';
import type { WorldView } from '../sim/view';
import { NetMatch } from './net/netMatch';
import type { NetClient } from './net/netClient';
import type { SlotInfo } from '../net/protocol';
import { createScene } from './render/scene';
import type { SceneBundle } from './render/scene';
import { ArenaView } from './render/arenaView';
import { applyTheme } from './render/themes';
import type { ThemeView } from './render/themes';
import { CharacterView } from './render/characterView';
import { CameraRig } from './render/cameraRig';
import { Effects } from './render/fx';
import { FIGHTERS, lookFrom } from './render/fighters';
import type { FighterLook } from './render/fighters';
import type { InputManager, DeviceId } from './input/devices';
import type { Sfx } from './audio/sfx';

export interface Fighter {
  device: DeviceId | 'net';
  look: FighterLook;
  /** Display label (device name locally, player name online). */
  label?: string;
}

/** Which map(s) a match uses: a specific arena id, 'random' (one random map) or 'rotate' (new map every round). */
export type MapChoice = string;

export interface GameListener {
  onEvent(ev: SimEvent, game: Game): void;
}

/**
 * Owns the running match on the client: the simulation, its views, the fixed
 * timestep loop and the translation of sim events into sound and effects.
 */
export class Game {
  readonly gfx: SceneBundle;
  arena: ArenaDef = ARENAS[0];
  sim: GameSim | null = null;
  /** Online match (server-driven), when playing online. */
  net: NetMatch | null = null;
  private arenaView: ArenaView;
  private theme: ThemeView;
  private mapChoice: MapChoice = ARENAS[0].id;
  mode: ModeId = 'ffa';
  private teams: number[] | undefined;
  private modeView: ModeView | null = null;
  private rotation: ArenaDef[] = [];
  fighters: Fighter[] = [];
  views: CharacterView[] = [];
  private bots: (Bot | null)[] = [];
  private rig: CameraRig;
  private fx: Effects;
  private acc = 0;
  private last = 0;
  paused = false;
  holdToPunch = false;
  listener: GameListener | null = null;
  /** Average physics step time in ms (for the debug readout). */
  stepMs = 0;
  fps = 60;

  constructor(
    container: HTMLElement,
    private readonly input: InputManager,
    private readonly sfx: Sfx,
  ) {
    this.gfx = createScene(container);
    this.theme = applyTheme(this.gfx, this.arena);
    this.arenaView = new ArenaView(this.gfx.scene, this.arena);
    this.rig = new CameraRig(this.gfx.camera);
    this.fx = new Effects(this.gfx.scene);
    this.rig.snap([new THREE.Vector3(0, 1, 0)]);
    const loop = (t: number) => {
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get running(): boolean {
    return this.sim !== null || this.net !== null;
  }

  get online(): boolean {
    return this.net !== null;
  }

  /** Whatever is being shown: the local simulation or the online replica. */
  get world(): WorldView | null {
    return this.net ? this.net.world : this.sim;
  }

  /** Our fighter in an online match was knocked out of the round. */
  get spectating(): boolean {
    const n = this.net;
    if (!n) return false;
    return n.you < 0 || n.world.characters[n.you]?.state === 'eliminated';
  }

  private makeViews(fighters: Fighter[]): void {
    for (const v of this.views) {
      this.gfx.scene.remove(v.root);
      v.dispose();
    }
    this.views = fighters.map((f, i) => {
      const v = new CharacterView(f.look, i);
      this.gfx.scene.add(v.root);
      return v;
    });
  }

  /** Begin showing an online match (the server runs the simulation). */
  startOnline(net: NetClient, arenaId: string, epoch: number, slots: SlotInfo[], you: number, mode: ModeId = 'ffa', sides?: number[]): void {
    this.stop();
    this.stopPreview();
    this.fighters = slots.map((s, i) => ({ device: 'net' as const, look: lookFrom(s.loadout, s.name), label: s.bot ? 'Bot' : i === you ? 'You' : 'Online player' }));
    this.net = new NetMatch(net, arenaId, epoch, slots, you, mode, sides);
    this.mode = mode;
    this.showArena(this.net.world.arena);
    this.makeViews(this.fighters);
    this.refreshMode();
    this.sfx.setMusic(this.net.world.arena.theme);
    this.paused = false;
    this.rig.snap([new THREE.Vector3(0, 1, 0)]);
  }

  /** The server switched maps mid-match. */
  onlineArena(arenaId: string, epoch: number): void {
    if (!this.net) return;
    this.net.changeArena(arenaId, epoch);
    this.showArena(this.net.world.arena);
    this.refreshMode();
    this.tracker?.arena(arenaId);
    this.sfx.setMusic(this.net.world.arena.theme);
  }

  /** Swap the visible arena (scenery, theme, lighting). */
  private showArena(arena: ArenaDef): void {
    if (arena === this.arenaView.arena) return;
    this.arenaView.dispose(this.gfx.scene);
    this.theme.dispose();
    this.arena = arena;
    this.theme = applyTheme(this.gfx, arena);
    this.arenaView = new ArenaView(this.gfx.scene, arena);
    this.sfx.setAmbience(arena.theme);
  }

  /** Preview a map behind the menus. */
  preview(choice: MapChoice): void {
    const a = arenaById(choice);
    if (a && !this.sim) this.showArena(a);
  }

  private firstArena(choice: MapChoice): ArenaDef {
    if (choice === 'random' || choice === 'rotate') {
      this.rotation = [...ARENAS].sort(() => Math.random() - 0.5);
      return this.rotation[0];
    }
    return arenaById(choice) ?? ARENAS[0];
  }

  /** Records the profile owner's match for XP/stats (null when nobody to credit). */
  tracker: MatchTracker | null = null;

  /** Begin tracking fighter `me` (the profile owner) for progression. */
  track(me: number): void {
    const w = this.world;
    this.tracker = w && me >= 0 ? new MatchTracker(me, w.rules.sides, w.rules.mode, this.online, w.arena.id) : null;
  }

  private makeSim(arena: ArenaDef, resume?: { round: number; scores: number[] }): GameSim {
    const sandbox = this.fighters.length < 2;
    const sim = new GameSim({
      arena,
      players: this.fighters.length,
      sandbox,
      seed: (Math.random() * 1e9) | 0,
      resume,
      mode: this.mode,
      teams: this.teams,
      looks: this.fighters.map((f) => ({ emote: f.look.emote, victory: f.look.victory })),
      // Local matches wait on the results screen (Rematch / Menu).
      autoRestart: false,
      nextArena: this.mapChoice === 'rotate' ? (round) => this.rotation[(round - 1) % this.rotation.length] : undefined,
    });
    for (const c of sim.characters) c.holdToPunch = this.holdToPunch;
    return sim;
  }

  /** Rebuild mode markers (and mode props) for the current world. */
  private refreshMode(): void {
    this.modeView?.dispose(this.gfx.scene);
    this.modeView = null;
    const w = this.world;
    if (!w) return;
    this.arenaView.setExtraProps(w.rules.mode === 'trophy' ? [trophyDef(w.arena)] : []);
    this.modeView = new ModeView(this.gfx.scene, w);
  }

  start(fighters: Fighter[], map: MapChoice = this.mapChoice, mode: ModeId = 'ffa', teams?: number[]): void {
    this.stop();
    this.stopPreview();
    this.fighters = fighters;
    this.mapChoice = map;
    this.mode = mode;
    this.teams = teams;
    const arena = this.firstArena(map);
    this.showArena(arena);
    this.sim = this.makeSim(arena);
    this.refreshMode();
    this.sfx.setMusic(arena.theme);
    this.makeViews(fighters);
    this.bots = fighters.map((f, i) => (f.device === 'bot' ? new Bot(i, (Math.random() * 1e9) | 0, 0.45 + Math.random() * 0.35) : null));
    this.paused = false;
    this.acc = 0;
    this.rig.snap(this.focusPoints());
    for (const ev of this.sim.drainEvents()) this.handleEvent(ev);
  }

  stop(): void {
    for (const v of this.views) {
      this.gfx.scene.remove(v.root);
      v.dispose();
    }
    this.views = [];
    this.sim?.dispose();
    this.sim = null;
    this.net = null;
    this.modeView?.dispose(this.gfx.scene);
    this.modeView = null;
    this.arenaView.setExtraProps([]);
    this.tracker = null;
    this.sfx.setMusic('menu');
    this.gfx.renderer.domElement.style.filter = '';
  }

  setCameraShake(on: boolean): void {
    this.rig.shakeScale = on ? 1 : 0;
  }

  /** Graphics quality: resolution and shadows. 'auto' steps down when the frame rate drops. */
  quality: 'auto' | 'high' | 'medium' | 'low' = 'auto';
  private autoLevel: 'high' | 'medium' | 'low' = 'high';
  private slowTime = 0;

  setQuality(q: 'auto' | 'high' | 'medium' | 'low'): void {
    this.quality = q;
    this.applyQuality(q === 'auto' ? this.autoLevel : q);
  }

  private applyQuality(level: 'high' | 'medium' | 'low'): void {
    const r = this.gfx.renderer;
    const dpr = Math.min(window.devicePixelRatio, 2);
    r.setPixelRatio(level === 'high' ? dpr : level === 'medium' ? Math.min(1, dpr) : 0.6);
    const shadows = level !== 'low';
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.gfx.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    this.gfx.resize();
  }

  /** Auto quality: after a few seconds under ~40 fps, drop a level. */
  private autoQuality(dt: number): void {
    if (this.quality !== 'auto' || this.autoLevel === 'low') return;
    this.slowTime = this.fps < 40 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 4) {
      this.slowTime = 0;
      this.autoLevel = this.autoLevel === 'high' ? 'medium' : 'low';
      this.applyQuality(this.autoLevel);
    }
  }

  setHoldToPunch(v: boolean): void {
    this.holdToPunch = v;
    if (this.sim) for (const c of this.sim.characters) c.holdToPunch = v;
  }

  private gatherInputs(dt: number): PlayerInput[] {
    const sim = this.sim!;
    return this.fighters.map((f, i) => {
      const bot = this.bots[i];
      if (bot) return bot.think(sim, dt);
      return this.input.read(f.device as DeviceId);
    });
  }

  /** Online: keyboard (WASD scheme + mouse) merged with the first gamepad. */
  private onlineInput(): PlayerInput {
    const a = this.input.read('kbA');
    const b = this.input.read('pad0');
    const out = emptyInput();
    out.moveX = Math.max(-1, Math.min(1, a.moveX + b.moveX));
    out.moveZ = Math.max(-1, Math.min(1, a.moveZ + b.moveZ));
    for (const k of ['jump', 'punch', 'grab', 'lift', 'sprint', 'kick', 'headbutt', 'dive', 'emote'] as const) out[k] = a[k] || b[k];
    return out;
  }

  private frame(tMs: number): void {
    const t = tMs / 1000;
    let dt = this.last ? t - this.last : 1 / 60;
    this.last = t;
    dt = Math.min(dt, 0.1);
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    this.autoQuality(dt);
    const sim = this.sim;
    if (sim && !this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= sim.dt && steps < 5) {
        const t0 = performance.now();
        sim.step(this.gatherInputs(sim.dt));
        this.stepMs += (performance.now() - t0 - this.stepMs) * 0.05;
        this.input.consume();
        for (const ev of sim.drainEvents()) this.handleEvent(ev);
        this.acc -= sim.dt;
        steps++;
        if (sim.pendingArena) break;
      }
      if (steps === 5) this.acc = 0; // fell behind; drop time rather than spiral
      if (sim.pendingArena) this.switchArena(sim.pendingArena.arena, sim.pendingArena.resume);
    }
    const net = this.net;
    if (net) {
      // Online menus overlay the game but never pause it; don't send inputs while they're open.
      net.sendInput(this.paused ? emptyInput() : this.onlineInput());
      this.input.consume();
      for (const ev of net.update()) this.handleEvent(ev);
      this.gfx.renderer.domElement.style.filter = this.spectating ? 'grayscale(1) brightness(0.85)' : '';
    }
    const live: WorldView | null = this.world;
    const alpha = net ? net.alpha : live && this.sim ? Math.min(1, this.acc / this.sim.dt) : 0;
    const vdt = this.paused && !net ? 0 : dt;
    this.arenaView.update(live, alpha, vdt);
    this.theme.update(vdt, t);
    if (live) {
      live.characters.forEach((c, i) => this.views[i].update(c, live.prevSnap, live.currSnap, live.partOffset(i, 0), alpha, dt));
      if (!this.paused || net) this.rig.update(this.focusPoints(), dt);
      this.modeView?.update(this.views, vdt);
      const r = live.rules;
      if (r.mode === 'potato' && r.phase === 'fight' && r.potatoHolder >= 0 && vdt > 0) this.sfx.tick(r.potatoTimer < 4);
      this.tracker?.tick(vdt, r.phase === 'fight');
    } else if (this.previewState) {
      this.updatePreview(dt);
    } else {
      // Idle attract camera: slow orbit over the empty arena.
      this.gfx.camera.position.set(Math.sin(t * 0.15) * 15, 8.5, Math.cos(t * 0.15) * 15);
      this.gfx.camera.lookAt(0, 0.5, 0);
    }
    this.fx.update(vdt);
    this.gfx.renderer.render(this.gfx.scene, this.gfx.camera);
  }

  /** Points the shared camera should keep in view: active fighters still on (or near) the roof. */
  private focusPoints(): THREE.Vector3[] {
    const sim = this.world;
    if (!sim) return [];
    const pts: THREE.Vector3[] = [];
    for (const c of sim.characters) {
      if (!c.alive) continue;
      const p = c.torsoPos;
      if (p.y < Math.max(-2.5, sim.killY + 0.2)) continue;
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    return pts;
  }

  /** The rules moved the match to another arena: rebuild the simulation there, keeping scores. */
  private switchArena(arena: ArenaDef, resume: { round: number; scores: number[] }): void {
    this.sim?.dispose();
    this.showArena(arena);
    this.tracker?.arena(arena.id);
    this.sfx.setMusic(arena.theme);
    this.sim = this.makeSim(arena, resume);
    this.refreshMode();
    this.bots = this.fighters.map((f, i) => (f.device === 'bot' ? new Bot(i, (Math.random() * 1e9) | 0, 0.45 + Math.random() * 0.35) : null));
    this.acc = 0;
    this.rig.snap(this.focusPoints());
    for (const ev of this.sim.drainEvents()) this.handleEvent(ev);
  }

  // ------------------------------------------------------------ customise preview
  private previewState: { sim: GameSim; view: CharacterView; emote: boolean } | null = null;

  /** Show one fighter wobbling about on its own (Customise screen). */
  startPreview(look: FighterLook): void {
    if (this.running) return;
    this.stopPreview();
    const sim = new GameSim({ arena: this.arena, players: 1, sandbox: true, looks: [{ emote: look.emote, victory: look.victory }] });
    const s = this.arena.spawns[0];
    sim.characters[0].reset(sim.world, { x: s.x, y: s.y + 0.02, z: s.z }, 0);
    const view = new CharacterView(look, 0);
    this.gfx.scene.add(view.root);
    this.previewState = { sim, view, emote: false };
  }

  /** Swap the previewed look (keeps the physics running). */
  previewLook(look: FighterLook): void {
    const p = this.previewState;
    if (!p) return this.startPreview(look);
    this.gfx.scene.remove(p.view.root);
    p.view.dispose();
    p.view = new CharacterView(look, 0);
    this.gfx.scene.add(p.view.root);
    p.sim.characters[0].emoteKind = look.emote;
    p.sim.characters[0].victoryKind = look.victory;
  }

  previewEmote(): void {
    if (this.previewState) this.previewState.emote = true;
  }

  previewVictory(): void {
    this.previewState?.sim.characters[0].celebrate(3);
  }

  stopPreview(): void {
    if (!this.previewState) return;
    this.gfx.scene.remove(this.previewState.view.root);
    this.previewState.view.dispose();
    this.previewState.sim.dispose();
    this.previewState = null;
  }

  private updatePreview(dt: number): void {
    const p = this.previewState!;
    const sim = p.sim;
    this.acc += dt;
    while (this.acc >= sim.dt) {
      sim.step([{ ...emptyInput(), emote: p.emote }]);
      sim.drainEvents();
      p.emote = false;
      this.acc -= sim.dt;
    }
    const c = sim.characters[0];
    p.view.update(c, sim.prevSnap, sim.currSnap, sim.partOffset(0, 0), Math.min(1, this.acc / sim.dt), dt);
    const at = c.torsoPos;
    // Fighter on the right of the screen; the customise panel sits on the left.
    this.gfx.camera.position.set(at.x - 1.5, at.y + 0.9, at.z + 3.6);
    this.gfx.camera.lookAt(at.x - 1.25, at.y + 0.1, at.z);
  }

  private handleEvent(ev: SimEvent): void {
    this.tracker?.feed(ev);
    const sfx = this.sfx;
    const look = (i: number) => this.fighters[i]?.look ?? FIGHTERS[0];
    switch (ev.type) {
      case 'punch':
        sfx.whoosh();
        if (Math.random() < 0.3) sfx.grunt(look(ev.char).voice, 0.6);
        break;
      case 'hit': {
        const p = new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z);
        this.fx.hit(p, ev.strength);
        sfx.hit(ev.strength, ev.head);
        sfx.grunt(look(ev.victim).voice, 0.9);
        this.views[ev.victim]?.bump(ev.head ? 3.2 : ev.kind === 'kick' || ev.kind === 'dive' ? 2.8 : 2);
        if (ev.strength > 9 || ev.kind === 'dive') this.rig.addShake(ev.kind === 'dive' ? 0.07 : 0.05);
        break;
      }
      case 'propHit':
        this.fx.hit(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), ev.strength * 0.6);
        sfx.clunk(ev.strength);
        break;
      case 'kick':
        sfx.kick();
        if (Math.random() < 0.4) sfx.grunt(look(ev.char).voice, 0.7);
        break;
      case 'headbutt':
        sfx.headbutt();
        sfx.grunt(look(ev.char).voice, 0.8);
        break;
      case 'dive':
        sfx.dive();
        sfx.grunt(look(ev.char).voice, 1);
        break;
      case 'climb':
        sfx.grunt(look(ev.char).voice, 0.9);
        break;
      case 'exhausted':
        sfx.pant(look(ev.char).voice);
        break;
      case 'getup':
        if (Math.random() < 0.5) sfx.grunt(look(ev.char).voice, 0.5);
        break;
      case 'impact': {
        this.fx.dust(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), ev.strength);
        sfx.thud(ev.strength);
        this.views[ev.char]?.bump(2.5);
        if (ev.strength > 10) this.rig.addShake(0.06);
        break;
      }
      case 'land':
        this.views[ev.char]?.bump(Math.min(3, ev.strength * 0.3));
        if (ev.strength > 6) {
          this.fx.dust(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), ev.strength * 0.5);
          sfx.thud(ev.strength * 0.5);
        }
        break;
      case 'ko':
        sfx.ko();
        break;
      case 'grab':
        sfx.grab();
        break;
      case 'throw':
        sfx.throw();
        sfx.grunt(look(ev.char).voice, 1);
        break;
      case 'jump':
        sfx.jump();
        break;
      case 'escape':
        sfx.grunt(look(ev.char).voice, 1);
        sfx.whoosh();
        break;
      case 'topple':
        sfx.grunt(look(ev.char).voice, 0.7);
        break;
      case 'eliminated': {
        const p = new THREE.Vector3(ev.pos.x, Math.max(ev.pos.y, this.world ? this.world.killY : -9), ev.pos.z);
        if (ev.cause === 'water') {
          this.fx.splash(new THREE.Vector3(ev.pos.x, -0.8, ev.pos.z));
          sfx.splash();
        } else if (ev.cause === 'molten') {
          this.fx.sparks(new THREE.Vector3(ev.pos.x, -1.9, ev.pos.z));
          sfx.sizzle();
        } else if (ev.cause === 'grinder') {
          this.fx.sparks(p);
          this.fx.splinters(p);
          sfx.grind();
          this.rig.addShake(0.08);
        } else if (ev.cause === 'road') {
          this.fx.dust(p, 8);
          sfx.thud(10);
          sfx.fall();
        } else sfx.fall();
        break;
      }
      case 'shatter':
        this.fx.shards(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), ev.half);
        sfx.shatter();
        break;
      case 'break':
        this.fx.splinters(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z));
        sfx.crack();
        break;
      case 'creak':
        sfx.creak();
        break;
      case 'drop':
        this.fx.ring(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), this.gfx.scene);
        sfx.whistle();
        break;
      case 'bounce':
        sfx.boing();
        break;
      case 'crush':
        this.fx.dust(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z), 10);
        sfx.crush();
        this.rig.addShake(0.1);
        break;
      case 'swerve':
        sfx.truckHorn();
        this.rig.addShake(0.08);
        break;
      case 'gust':
        sfx.gust();
        break;
      case 'sweepWarning':
        sfx.truckHorn();
        break;
      case 'explode': {
        const p = new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z);
        this.fx.sparks(p);
        this.fx.dust(p, 14);
        this.fx.hit(p, 16);
        sfx.boom();
        this.rig.addShake(0.12);
        break;
      }
      case 'goal':
        this.fx.sparks(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z));
        sfx.goal();
        break;
      case 'potatoPass':
        sfx.pop();
        break;
      case 'respawn':
        sfx.pop();
        break;
      case 'hillMove':
        sfx.bell();
        break;
      case 'warning':
      case 'timeUp':
      case 'arenaChange':
        break;
      case 'roundStart':
        sfx.bell();
        break;
      case 'fight':
        sfx.horn();
        break;
      case 'roundEnd':
      case 'matchEnd':
        sfx.cheer();
        break;
      case 'recover':
        break;
    }
    this.listener?.onEvent(ev, this);
  }

  /** Project a world point to CSS pixel coordinates of the canvas. */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.gfx.camera);
    const el = this.gfx.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight, visible: v.z < 1 };
  }

  headScreen(i: number): { x: number; y: number; visible: boolean } | null {
    const v = this.views[i];
    if (!v) return null;
    const p = v.headPosition(new THREE.Vector3());
    p.y += 0.7;
    return this.toScreen(p);
  }
}
