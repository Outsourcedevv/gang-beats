import * as THREE from 'three';
import { GameSim } from '../sim/game';
import { TEST_ARENA } from '../sim/arena';
import type { ArenaDef } from '../sim/arena';
import { Bot } from '../sim/bot';
import type { SimEvent } from '../sim/events';
import type { PlayerInput } from '../sim/input';
import { createScene } from './render/scene';
import type { SceneBundle } from './render/scene';
import { buildArena } from './render/arenaView';
import { CharacterView } from './render/characterView';
import { CameraRig } from './render/cameraRig';
import { Effects } from './render/fx';
import { FIGHTERS } from './render/fighters';
import type { FighterLook } from './render/fighters';
import type { InputManager, DeviceId } from './input/devices';
import type { Sfx } from './audio/sfx';

export interface Fighter {
  device: DeviceId;
  look: FighterLook;
}

export interface GameListener {
  onEvent(ev: SimEvent, game: Game): void;
}

/**
 * Owns the running match on the client: the simulation, its views, the fixed
 * timestep loop and the translation of sim events into sound and effects.
 */
export class Game {
  readonly gfx: SceneBundle;
  readonly arena: ArenaDef = TEST_ARENA;
  sim: GameSim | null = null;
  fighters: Fighter[] = [];
  views: CharacterView[] = [];
  private bots: (Bot | null)[] = [];
  private propMeshes: THREE.Object3D[];
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
    this.propMeshes = buildArena(this.gfx.scene, this.arena);
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
    return this.sim !== null;
  }

  start(fighters: Fighter[]): void {
    this.stop();
    this.fighters = fighters;
    const sandbox = fighters.length < 2;
    this.sim = new GameSim({ arena: this.arena, players: fighters.length, sandbox, seed: (Math.random() * 1e9) | 0 });
    for (const c of this.sim.characters) c.holdToPunch = this.holdToPunch;
    this.views = fighters.map((f, i) => {
      const v = new CharacterView(f.look, i);
      this.gfx.scene.add(v.root);
      return v;
    });
    this.bots = fighters.map((f, i) => (f.device === 'bot' ? new Bot(i, (Math.random() * 1e9) | 0, 0.45 + Math.random() * 0.35) : null));
    this.paused = false;
    this.acc = 0;
    this.rig.snap(this.focusPoints());
    for (const ev of this.sim.drainEvents()) this.handleEvent(ev);
  }

  stop(): void {
    if (!this.sim) return;
    for (const v of this.views) {
      this.gfx.scene.remove(v.root);
      v.dispose();
    }
    this.views = [];
    this.sim.dispose();
    this.sim = null;
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
      return this.input.read(f.device);
    });
  }

  private frame(tMs: number): void {
    const t = tMs / 1000;
    let dt = this.last ? t - this.last : 1 / 60;
    this.last = t;
    dt = Math.min(dt, 0.1);
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
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
      }
      if (steps === 5) this.acc = 0; // fell behind; drop time rather than spiral
    }
    const alpha = sim ? Math.min(1, this.acc / sim.dt) : 0;
    if (sim) {
      sim.characters.forEach((c, i) => this.views[i].update(c, sim.prevSnap, sim.currSnap, sim.partOffset(i, 0), alpha, dt));
      const q = new THREE.Quaternion();
      sim.props.forEach((_p, i) => {
        const o = sim.propOffset(i);
        const a = sim.prevSnap;
        const b = sim.currSnap;
        const m = this.propMeshes[i];
        m.position.set(a[o] + (b[o] - a[o]) * alpha, a[o + 1] + (b[o + 1] - a[o + 1]) * alpha, a[o + 2] + (b[o + 2] - a[o + 2]) * alpha);
        THREE.Quaternion.slerpFlat(q as unknown as number[], 0, a as unknown as number[], o + 3, b as unknown as number[], o + 3, alpha);
        m.quaternion.copy(q);
      });
      if (!this.paused) this.rig.update(this.focusPoints(), dt);
    } else {
      // Idle attract camera: slow orbit over the empty arena.
      this.gfx.camera.position.set(Math.sin(t * 0.15) * 15, 8.5, Math.cos(t * 0.15) * 15);
      this.gfx.camera.lookAt(0, 0.5, 0);
    }
    this.fx.update(this.paused ? 0 : dt);
    this.gfx.renderer.render(this.gfx.scene, this.gfx.camera);
  }

  /** Points the shared camera should keep in view: active fighters still on (or near) the roof. */
  private focusPoints(): THREE.Vector3[] {
    const sim = this.sim;
    if (!sim) return [];
    const pts: THREE.Vector3[] = [];
    for (const c of sim.characters) {
      if (!c.alive) continue;
      const p = c.torsoPos;
      if (p.y < -2.5) continue;
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    return pts;
  }

  private handleEvent(ev: SimEvent): void {
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
      case 'eliminated':
        sfx.fall();
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
