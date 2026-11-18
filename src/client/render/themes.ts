import * as THREE from 'three';
import type { ArenaDef } from '../../sim/arena';
import type { SceneBundle } from './scene';
import { buildCity } from './scene';
import { lavaTexture, roadTexture, sandTexture, waterTexture } from './textures';

/** Per-map sky, fog, lighting and backdrop, plus any per-frame animation. */
export interface ThemeView {
  group: THREE.Group;
  update(dt: number, time: number): void;
  dispose(): void;
}

interface LightRig {
  sky: [number, number, number];
  sunDir: [number, number, number];
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunPos: [number, number, number];
  sunColor: number;
  rim: number;
  rimColor: number;
  exposure: number;
  showSky: boolean;
  background?: number;
}

const RIGS: Record<ArenaDef['theme'], LightRig> = {
  'sunset-rooftop': {
    sky: [0x3a4a9a, 0xf59a8a, 0xffc47e],
    sunDir: [-0.5, 0.18, -0.85],
    fog: 0xffb27a,
    fogNear: 38,
    fogFar: 120,
    hemiSky: 0xffd4b8,
    hemiGround: 0x4b3d66,
    hemi: 1.1,
    sun: 2.6,
    sunPos: [-9, 16, 8],
    sunColor: 0xffd6a8,
    rim: 0.7,
    rimColor: 0x9ab8ff,
    exposure: 1.05,
    showSky: true,
  },
  factory: {
    sky: [0x1a1412, 0x2a1d18, 0x3a2418],
    sunDir: [0, 1, 0],
    fog: 0x2a1c16,
    fogNear: 22,
    fogFar: 70,
    hemiSky: 0xd8dcff,
    hemiGround: 0x5a2a10,
    hemi: 0.75,
    sun: 2.2,
    sunPos: [3, 16, 6],
    sunColor: 0xe6ecff,
    rim: 0.5,
    rimColor: 0xff9a4a,
    exposure: 1.1,
    showSky: false,
    background: 0x1d1512,
  },
  highway: {
    sky: [0x2f6fd0, 0x8cc4ef, 0xf3e3c0],
    sunDir: [0.3, 0.6, -0.7],
    fog: 0xe8dcc0,
    fogNear: 45,
    fogFar: 170,
    hemiSky: 0xcfe6ff,
    hemiGround: 0x9a7a50,
    hemi: 1.2,
    sun: 2.8,
    sunPos: [6, 18, 9],
    sunColor: 0xfff2dc,
    rim: 0.5,
    rimColor: 0xbfd8ff,
    exposure: 1.0,
    showSky: true,
  },
  funfair: {
    sky: [0x070a24, 0x261a55, 0x5a2b6a],
    sunDir: [-0.4, 0.45, -0.8],
    fog: 0x1f1838,
    fogNear: 30,
    fogFar: 110,
    hemiSky: 0x7a6cff,
    hemiGround: 0x1a1030,
    hemi: 0.7,
    sun: 1.1,
    sunPos: [-7, 14, 7],
    sunColor: 0xb8c8ff,
    rim: 0.9,
    rimColor: 0xff6ad5,
    exposure: 1.15,
    showSky: true,
  },
};

function applyRig(b: SceneBundle, rig: LightRig): void {
  const u = b.sky.material.uniforms;
  u.top.value.setHex(rig.sky[0]);
  u.mid.value.setHex(rig.sky[1]);
  u.bottom.value.setHex(rig.sky[2]);
  u.sunDir.value.set(...rig.sunDir).normalize();
  b.sky.visible = rig.showSky;
  b.scene.background = rig.background !== undefined ? new THREE.Color(rig.background) : null;
  b.scene.fog = new THREE.Fog(rig.fog, rig.fogNear, rig.fogFar);
  b.hemi.color.setHex(rig.hemiSky);
  b.hemi.groundColor.setHex(rig.hemiGround);
  b.hemi.intensity = rig.hemi;
  b.sun.intensity = rig.sun;
  b.sun.color.setHex(rig.sunColor);
  b.sun.position.set(...rig.sunPos);
  b.rim.intensity = rig.rim;
  b.rim.color.setHex(rig.rimColor);
  b.renderer.toneMappingExposure = rig.exposure;
}

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// --------------------------------------------------------------------- themes

function rooftop(group: THREE.Group): ThemeView['update'] {
  buildCity(group);
  return () => {};
}

function factory(group: THREE.Group): ThemeView['update'] {
  // Molten vat filling everything below the floor.
  const lava = lavaTexture();
  lava.repeat.set(10, 6);
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: lava, emissive: 0xff5a00, emissiveMap: lava, emissiveIntensity: 1.6, roughness: 0.6 });
  const vat = mesh(new THREE.PlaneGeometry(60, 40), lavaMat, 0, -2.0, 4);
  vat.rotation.x = -Math.PI / 2;
  group.add(vat);
  const glow = new THREE.PointLight(0xff6a1a, 60, 22, 1.6);
  glow.position.set(0, -1.2, 5);
  group.add(glow);
  const glow2 = new THREE.PointLight(0xff4a10, 25, 12, 1.6);
  glow2.position.set(6.3, -0.8, -3.5);
  group.add(glow2);
  // Walls, pillars, ceiling beams and big machines.
  const wall = std(0x5a4038);
  group.add(mesh(new THREE.BoxGeometry(40, 18, 1), wall, 0, 6, -6));
  const pillar = std(0x6b6f75, { metalness: 0.4, roughness: 0.6 });
  for (const x of [-9, -4.5, 4.5, 9]) group.add(mesh(new THREE.BoxGeometry(0.6, 14, 0.6), pillar, x, 5, -5.2));
  for (const z of [-4, 0, 4]) group.add(mesh(new THREE.BoxGeometry(30, 0.5, 0.4), pillar, 0, 8.5, z));
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 2 });
  for (const x of [-4, 0, 4]) group.add(mesh(new THREE.BoxGeometry(1.4, 0.1, 0.3), lampMat, x, 8.2, 0));
  const tank = std(0x8a6a4a, { metalness: 0.3 });
  group.add(mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 24), tank, -9.5, 3.5, -3));
  group.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 9, 24), tank, 10, 4.5, -2.5));
  const pipe = std(0xa04a2a, { metalness: 0.5 });
  const p1 = mesh(new THREE.CylinderGeometry(0.25, 0.25, 20, 12), pipe, 0, 6.8, -5.4);
  p1.rotation.z = Math.PI / 2;
  group.add(p1);
  return (_dt, t) => {
    lava.offset.set(t * 0.02, t * 0.013);
    glow.intensity = 55 + Math.sin(t * 2.3) * 8 + Math.sin(t * 5.1) * 4;
  };
}

function highway(group: THREE.Group, arena: ArenaDef): ThemeView['update'] {
  const speed = arena.scrollSpeed ?? 16;
  const road = roadTexture();
  road.repeat.set(12, 1);
  const roadMesh = mesh(new THREE.PlaneGeometry(240, 13), new THREE.MeshStandardMaterial({ map: road, roughness: 0.95 }), 0, -1.05, -1.4);
  roadMesh.rotation.x = -Math.PI / 2;
  group.add(roadMesh);
  const sand = sandTexture();
  sand.repeat.set(40, 12);
  const ground = mesh(new THREE.PlaneGeometry(400, 160), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }), 0, -1.12, 0);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  // Distant mesas (static: far enough that parallax would be tiny).
  const mesaMat = std(0xb8714a);
  let s = 77;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const w = 8 + r() * 18;
    const h = 5 + r() * 14;
    const m = mesh(new THREE.CylinderGeometry(w * 0.7, w, h, 7), mesaMat, -120 + i * 18 + r() * 8, h / 2 - 1.1, -70 - r() * 30);
    group.add(m);
  }
  // Roadside scenery streaming past.
  const cactusMat = std(0x4f8a3a);
  const poleMat = std(0x8a8f96, { metalness: 0.5 });
  const scenery: THREE.Object3D[] = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const g = new THREE.Group();
    if (i % 3 === 0) {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), poleMat, 0, 2, 0));
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), poleMat, side * -0.6, 4.9, 0));
    } else {
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.6, 10), cactusMat, 0, 0.2, 0));
      const arm = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8), cactusMat, 0.55, 0.6, 0);
      arm.rotation.z = 0.2;
      g.add(arm);
    }
    g.position.set(-90 + i * 7.2, -1.1, side > 0 ? 7.5 + r() * 10 : -12 - r() * 14);
    group.add(g);
    scenery.push(g);
  }
  return (dt) => {
    road.offset.x -= (speed * dt) / (240 / 12);
    sand.offset.x -= (speed * dt) / (400 / 40);
    for (const g of scenery) {
      g.position.x += speed * dt;
      if (g.position.x > 95) g.position.x -= 190;
    }
  };
}

function funfair(group: THREE.Group): ThemeView['update'] {
  // Sea.
  const water = waterTexture();
  water.repeat.set(30, 30);
  const sea = mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x1a3d6a, map: water, roughness: 0.25, metalness: 0.35, emissive: 0x081830, emissiveIntensity: 0.6 }),
    0,
    -0.85,
    0,
  );
  sea.rotation.x = -Math.PI / 2;
  group.add(sea);
  // Stars.
  const starGeo = new THREE.BufferGeometry();
  const pts: number[] = [];
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 600; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.15 + r() * 1.2;
    pts.push(Math.cos(a) * Math.cos(e) * 250, Math.sin(e) * 250, Math.sin(a) * Math.cos(e) * 250);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false })));
  const moon = mesh(new THREE.SphereGeometry(8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }), -90, 70, -200);
  group.add(moon);
  // Coloured lights around the pier.
  const lights: THREE.PointLight[] = [];
  for (const [c, x, z] of [
    [0xff4fa3, -5, 2],
    [0x4fd6ff, 5, -2],
    [0xffd23f, 0, -0.5],
  ] as const) {
    const l = new THREE.PointLight(c, 22, 14, 1.5);
    l.position.set(x, 3.5, z);
    group.add(l);
    lights.push(l);
  }
  // String lights along the deck edges.
  const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const bulbColors = [0xff4fa3, 0xffd23f, 0x4fd6ff, 0x9bff6a];
  const bulbs: THREE.Mesh[] = [];
  const addBulb = (x: number, y: number, z: number, i: number) => {
    const m = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: bulbColors[i % bulbColors.length] }));
    m.position.set(x, y, z);
    group.add(m);
    bulbs.push(m);
  };
  let k = 0;
  for (let x = -7.4; x <= 7.4; x += 0.7) {
    addBulb(x, 2.4 + Math.sin(x * 0.9) * 0.15, -5.1, k++);
    addBulb(x, 2.4 + Math.cos(x * 0.9) * 0.15, 4.1, k++);
  }
  for (const x of [-7.5, 7.5]) for (const z of [-5.1, 4.1]) group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), std(0x8a5a3a), x, 1.3, z));
  // Big Ferris wheel and tents in the background.
  const wheel = new THREE.Group();
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff7ad9, emissiveIntensity: 0.8 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(9, 0.18, 8, 48), rimMat));
  for (let i = 0; i < 12; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(18, 0.1, 0.1), rimMat);
    spoke.rotation.z = (i / 12) * Math.PI;
    wheel.add(spoke);
    const a = (i / 12) * Math.PI * 2;
    const car = mesh(new THREE.BoxGeometry(1.1, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: bulbColors[i % 4], emissive: bulbColors[i % 4], emissiveIntensity: 0.5 }), Math.cos(a) * 9, Math.sin(a) * 9, 0);
    wheel.add(car);
  }
  wheel.position.set(-16, 9, -26);
  group.add(wheel);
  group.add(mesh(new THREE.BoxGeometry(0.6, 10, 0.6), std(0x6a6a7a), -16, 3, -26));
  const tentColors = [0xff4f6d, 0x4fb3ff, 0xffd23f];
  for (let i = 0; i < 5; i++) {
    const t = mesh(new THREE.ConeGeometry(3, 4, 12), std(tentColors[i % 3]), 6 + i * 6, 1.5, -24 - (i % 2) * 6);
    group.add(t);
  }
  return (dt, t) => {
    water.offset.set(t * 0.01, t * 0.006);
    wheel.rotation.z += dt * 0.12;
    for (let i = 0; i < bulbs.length; i++) bulbs[i].visible = Math.sin(t * 3 + i * 1.7) > -0.6;
    lights.forEach((l, i) => (l.intensity = 20 + Math.sin(t * 1.5 + i * 2) * 5));
  };
}

export function applyTheme(b: SceneBundle, arena: ArenaDef): ThemeView {
  applyRig(b, RIGS[arena.theme]);
  const group = new THREE.Group();
  let update: ThemeView['update'];
  switch (arena.theme) {
    case 'factory':
      update = factory(group);
      break;
    case 'highway':
      update = highway(group, arena);
      break;
    case 'funfair':
      update = funfair(group);
      break;
    default:
      update = rooftop(group);
  }
  b.scene.add(group);
  return {
    group,
    update,
    dispose() {
      b.scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
    },
  };
}
