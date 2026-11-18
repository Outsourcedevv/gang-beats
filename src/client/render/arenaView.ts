import * as THREE from 'three';
import type { ArenaDef, PropDef, SurfaceStyle } from '../../sim/arena';
import { brickTexture, crateTexture, roofTexture, stripeTexture } from './textures';

function styleMaterial(style: SurfaceStyle, color?: number): THREE.Material {
  switch (style) {
    case 'roof':
      return new THREE.MeshStandardMaterial({ color: color ?? 0xffffff, map: roofTexture(), roughness: 0.95 });
    case 'brick': {
      const t = brickTexture();
      t.repeat.set(4, 4);
      return new THREE.MeshStandardMaterial({ color: color ?? 0xffffff, map: t, roughness: 0.9 });
    }
    case 'concrete':
      return new THREE.MeshStandardMaterial({ color: color ?? 0xc9beb1, roughness: 0.85 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: color ?? 0xa9bccb, roughness: 0.45, metalness: 0.45 });
    case 'railing':
      return new THREE.MeshStandardMaterial({ color: color ?? 0xf2c230, roughness: 0.4, metalness: 0.3 });
    case 'vent':
      return new THREE.MeshStandardMaterial({ color: color ?? 0x5f6a75, roughness: 0.5, metalness: 0.6 });
    case 'wood':
      return new THREE.MeshStandardMaterial({ color: color ?? 0xa8743f, roughness: 0.8 });
    case 'pipe':
      return new THREE.MeshStandardMaterial({ color: color ?? 0x7d8a95, roughness: 0.4, metalness: 0.6 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color: color ?? 0x9fd8ff,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
        clearcoat: 1,
      });
    case 'trim':
      return new THREE.MeshStandardMaterial({ color: color ?? 0xe0d2bf, roughness: 0.75 });
  }
}

/** Builds static arena meshes; returns prop meshes indexed like `arena.props`. */
export function buildArena(scene: THREE.Scene, arena: ArenaDef): THREE.Object3D[] {
  const cache = new Map<string, THREE.Material>();
  const mat = (style: SurfaceStyle, color?: number) => {
    const k = `${style}:${color ?? ''}`;
    let m = cache.get(k);
    if (!m) cache.set(k, (m = styleMaterial(style, color)));
    return m;
  };
  const group = new THREE.Group();
  for (const p of arena.pieces) {
    let mesh: THREE.Mesh;
    if (p.kind === 'box') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(p.half.x * 2, p.half.y * 2, p.half.z * 2), mat(p.style, p.color));
      if (p.yaw) mesh.rotation.y = p.yaw;
      if (p.style === 'roof') {
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.map?.repeat.set(p.half.x / 2, p.half.z / 2);
      }
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.halfHeight * 2, 28), mat(p.style, p.color));
    }
    mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    mesh.castShadow = p.style !== 'brick' && p.style !== 'glass';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  addDecor(group);
  scene.add(group);

  return arena.props.map((def) => {
    const m = propMesh(def);
    scene.add(m);
    return m;
  });
}

function propMesh(def: PropDef): THREE.Object3D {
  let mesh: THREE.Mesh;
  if (def.shape === 'crate') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(def.half.x * 2, def.half.y * 2, def.half.z * 2),
      new THREE.MeshStandardMaterial({ color: def.color, map: crateTexture(), roughness: 0.85 }),
    );
  } else if (def.shape === 'barrel') {
    const t = stripeTexture('#2f7fd1', '#1e5a99', 6);
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(def.half.x, def.half.x, def.half.y * 2, 22),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.5, metalness: 0.4 }),
    );
  } else {
    const t = stripeTexture('#ff6a1a', '#ffffff', 5);
    mesh = new THREE.Mesh(
      new THREE.ConeGeometry(def.half.x, def.half.y * 2, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.6 }),
    );
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Non-colliding set dressing: roof vents, cables, a neon sign. */
function addDecor(group: THREE.Group): void {
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
  // Neon sign on the side of the building, visible behind the arena.
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
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.1, 0.1), ventMat);
  post.position.set(-6.4, 1.05, -5.5);
  group.add(post);
  const post2 = post.clone();
  post2.position.x = -2.6;
  group.add(post2);
}
