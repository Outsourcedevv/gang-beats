import * as THREE from 'three';
import type { ArenaDef, PropDef, StaticPiece, SurfaceStyle } from '../../sim/arena';
import { pieceRotation } from '../../sim/arena';
import type { GameSim } from '../../sim/game';
import {
  beltTexture,
  brickTexture,
  crateTexture,
  gratingTexture,
  hazardTexture,
  plankTexture,
  roofTexture,
  stripeTexture,
} from './textures';

/** World-space metres per texture repeat, per style (0 = no tiling). */
const TILE: Partial<Record<SurfaceStyle, number>> = {
  roof: 4,
  brick: 3,
  belt: 0.6,
  grating: 0.5,
  hazard: 0.8,
  plank: 1.6,
  rotten: 1.6,
  deck: 1.6,
};

const texCache = new Map<string, THREE.Texture>();
function cachedTex(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) texCache.set(key, (t = make()));
  return t;
}

function styleMaterial(style: SurfaceStyle, color?: number): THREE.Material {
  const c = (d: number) => color ?? d;
  switch (style) {
    case 'roof':
      return new THREE.MeshStandardMaterial({ color: c(0xffffff), map: cachedTex('roof', roofTexture), roughness: 0.95 });
    case 'brick':
      return new THREE.MeshStandardMaterial({ color: c(0xffffff), map: cachedTex('brick', brickTexture), roughness: 0.9 });
    case 'concrete':
      return new THREE.MeshStandardMaterial({ color: c(0xc9beb1), roughness: 0.85 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: c(0xa9bccb), roughness: 0.45, metalness: 0.45 });
    case 'railing':
      return new THREE.MeshStandardMaterial({ color: c(0xf2c230), roughness: 0.4, metalness: 0.3 });
    case 'vent':
      return new THREE.MeshStandardMaterial({ color: c(0x5f6a75), roughness: 0.5, metalness: 0.6 });
    case 'wood':
      return new THREE.MeshStandardMaterial({ color: c(0xa8743f), roughness: 0.8 });
    case 'pipe':
      return new THREE.MeshStandardMaterial({ color: c(0x7d8a95), roughness: 0.4, metalness: 0.6 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color: c(0x9fd8ff), roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 });
    case 'trim':
      return new THREE.MeshStandardMaterial({ color: c(0xe0d2bf), roughness: 0.75 });
    case 'belt':
      // Each belt gets its own texture instance so it can scroll independently.
      return new THREE.MeshStandardMaterial({ color: c(0xffffff), map: beltTexture(), roughness: 0.9 });
    case 'grating':
      return new THREE.MeshStandardMaterial({
        color: c(0xffffff),
        map: cachedTex('grating', gratingTexture),
        alphaTest: 0.5,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0.6,
      });
    case 'hazard':
      return new THREE.MeshStandardMaterial({ color: c(0xffffff), map: cachedTex('hazard', hazardTexture), roughness: 0.6 });
    case 'rubber':
      return new THREE.MeshStandardMaterial({ color: c(0xff3b5c), roughness: 0.5 });
    case 'plank':
      return new THREE.MeshStandardMaterial({ color: c(0xffffff), map: cachedTex('plank', () => plankTexture(false)), roughness: 0.85 });
    case 'rotten':
      return new THREE.MeshStandardMaterial({ color: c(0xffffff), map: cachedTex('rotten', () => plankTexture(true)), roughness: 0.95 });
    case 'deck':
      return new THREE.MeshStandardMaterial({ color: c(0x9a7a5a), map: cachedTex('plank', () => plankTexture(false)), roughness: 0.85 });
    case 'paint':
      return new THREE.MeshStandardMaterial({ color: c(0xcccccc), roughness: 0.55 });
    case 'glow':
      return new THREE.MeshStandardMaterial({ color: c(0xff7a1a), emissive: c(0xff5a00), emissiveIntensity: 1.5 });
  }
}

/** Box geometry whose UVs tile in world units instead of stretching. */
function tiledBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!tile) return g;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}

function pieceMesh(p: StaticPiece, mat: (style: SurfaceStyle, color?: number) => THREE.Material): THREE.Mesh {
  let m: THREE.Mesh;
  if (p.kind === 'box') m = new THREE.Mesh(tiledBox(p.half.x * 2, p.half.y * 2, p.half.z * 2, TILE[p.style] ?? 0), mat(p.style, p.color));
  else m = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.halfHeight * 2, Math.max(12, Math.round(p.radius * 24))), mat(p.style, p.color));
  m.position.set(p.pos.x, p.pos.y, p.pos.z);
  const q = pieceRotation(p);
  m.quaternion.set(q.x, q.y, q.z, q.w);
  m.castShadow = p.style !== 'brick' && p.style !== 'glass';
  m.receiveShadow = true;
  return m;
}

function propMesh(def: PropDef): THREE.Object3D {
  let mesh: THREE.Mesh;
  if (def.shape === 'crate') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(def.half.x * 2, def.half.y * 2, def.half.z * 2),
      new THREE.MeshStandardMaterial({ color: def.color, map: cachedTex('crate', crateTexture), roughness: 0.85 }),
    );
  } else if (def.shape === 'barrel') {
    const hex = '#' + def.color.toString(16).padStart(6, '0');
    const t = stripeTexture(hex, '#1e2a40', 6);
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(def.half.x, def.half.x, def.half.y * 2, 22),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.5, metalness: 0.4 }),
    );
  } else if (def.shape === 'ball') {
    const hex = '#' + def.color.toString(16).padStart(6, '0');
    const t = stripeTexture(hex, '#ffe14a', 6);
    mesh = new THREE.Mesh(new THREE.SphereGeometry(def.half.x, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: t, roughness: 0.35, clearcoat: 0.6 }));
  } else {
    const t = stripeTexture('#ff6a1a', '#ffffff', 5);
    mesh = new THREE.Mesh(new THREE.ConeGeometry(def.half.x, def.half.y * 2, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.6 }));
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Non-colliding set dressing for the rooftop: vents and a neon sign. */
function rooftopDecor(group: THREE.Group): void {
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x8b96a0, roughness: 0.5, metalness: 0.5 });
  for (const [x, z] of [
    [6.8, -1.0],
    [-7.2, -0.4],
    [1.8, 4.6],
  ]) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12), ventMat);
    v.position.set(x, 0.25, z);
    v.castShadow = true;
    group.add(v);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12), ventMat);
    cap.position.set(x, 0.56, z);
    group.add(cap);
  }
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 128;
  const g = signCanvas.getContext('2d')!;
  g.fillStyle = '#1b1530';
  g.fillRect(0, 0, 512, 128);
  g.font = 'bold 84px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff4fa3';
  g.shadowBlur = 22;
  g.fillStyle = '#ffd1ec';
  g.fillText('NOODLE HUT', 256, 66);
  const t = new THREE.CanvasTexture(signCanvas);
  t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.2 }),
  );
  sign.position.set(-4.5, 2.1, -5.47);
  group.add(sign);
  for (const x of [-6.4, -2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.1, 0.1), ventMat);
    post.position.set(x, 1.05, -5.5);
    group.add(post);
  }
}

const tmpQ = new THREE.Quaternion();

function applySnap(o: THREE.Object3D, prev: Float32Array, curr: Float32Array, off: number, alpha: number): void {
  o.position.set(
    prev[off] + (curr[off] - prev[off]) * alpha,
    prev[off + 1] + (curr[off + 1] - prev[off + 1]) * alpha,
    prev[off + 2] + (curr[off + 2] - prev[off + 2]) * alpha,
  );
  THREE.Quaternion.slerpFlat(tmpQ as unknown as number[], 0, prev as unknown as number[], off + 3, curr as unknown as number[], off + 3, alpha);
  o.quaternion.copy(tmpQ);
}

/**
 * All arena meshes: static scenery, moving machinery, breakables and props,
 * kept in sync with the simulation each frame.
 */
export class ArenaView {
  readonly group = new THREE.Group();
  private movers: THREE.Group[] = [];
  private breakables: THREE.Mesh[] = [];
  private props: THREE.Object3D[] = [];
  private belts: { tex: THREE.Texture; speed: number; tile: number }[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    readonly arena: ArenaDef,
  ) {
    const cache = new Map<string, THREE.Material>();
    const mat = (style: SurfaceStyle, color?: number) => {
      if (style === 'belt') return styleMaterial(style, color);
      const k = `${style}:${color ?? ''}`;
      let m = cache.get(k);
      if (!m) cache.set(k, (m = styleMaterial(style, color)));
      return m;
    };
    for (const p of arena.pieces) {
      const m = pieceMesh(p, mat);
      this.group.add(m);
      if (p.kind === 'box' && p.style === 'belt' && p.surfaceVel) {
        const map = (m.material as THREE.MeshStandardMaterial).map!;
        this.belts.push({ tex: map, speed: p.surfaceVel.x || p.surfaceVel.z, tile: TILE.belt! });
      }
    }
    for (const def of arena.movers ?? []) {
      const g = new THREE.Group();
      for (const p of def.parts) g.add(pieceMesh(p, mat));
      this.group.add(g);
      this.movers.push(g);
    }
    for (const def of arena.breakables ?? []) {
      const p = def.piece;
      const m = pieceMesh({ ...p, pos: { x: 0, y: 0, z: 0 }, yaw: 0, roll: 0 }, mat);
      this.group.add(m);
      this.breakables.push(m);
    }
    for (const def of [...arena.props, ...(arena.dropPool ?? [])]) {
      const m = propMesh(def);
      this.group.add(m);
      this.props.push(m);
    }
    if (arena.theme === 'sunset-rooftop') rooftopDecor(this.group);
    scene.add(this.group);
  }

  update(sim: GameSim | null, alpha: number, dt: number): void {
    this.time += dt;
    for (const b of this.belts) b.tex.offset.x = -(this.time * b.speed) / b.tile;
    if (!sim || sim.arena.id !== this.arena.id) return;
    const prev = sim.prevSnap;
    const curr = sim.currSnap;
    this.movers.forEach((g, i) => applySnap(g, prev, curr, sim.moverOffset(i), alpha));
    sim.runtime.breakables.forEach((b, i) => {
      const m = this.breakables[i];
      m.visible = b.state !== 'gone';
      if (!m.visible) return;
      applySnap(m, prev, curr, sim.breakableOffset(i), alpha);
      if (b.state === 'shaking') {
        m.position.x += (Math.random() - 0.5) * 0.05;
        m.position.y += (Math.random() - 0.5) * 0.03;
        m.position.z += (Math.random() - 0.5) * 0.05;
      }
    });
    sim.props.forEach((p, i) => {
      const m = this.props[i];
      m.visible = p.active;
      if (p.active) applySnap(m, prev, curr, sim.propOffset(i), alpha);
    });
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
