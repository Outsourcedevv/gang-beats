import * as THREE from 'three';
import type { AccessoryId, HatId, OutfitId } from '../../meta/cosmetics';
import { stripeTexture } from './textures';

// Meshes for hats, outfits and accessories. Head-local coordinates: head
// radius ≈ 0.29, +Z is the face. Torso-local: capsule radius 0.31, half-height 0.14.

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** Returns the hat group plus an optional per-frame animation (propeller). */
export function buildHat(hat: HatId, color: number, accent: number): { group: THREE.Group; animate?: (t: number) => void } {
  const g = new THREE.Group();
  const m = std(color, { roughness: 0.7 });
  const a = std(accent);
  let animate: ((t: number) => void) | undefined;
  switch (hat) {
    case 'beanie': {
      const dome = add(g, new THREE.SphereGeometry(0.305, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.12);
      dome.scale.set(0.92, 0.75, 0.92);
      const band = add(g, new THREE.TorusGeometry(0.262, 0.045, 10, 24), m, 0, 0.155);
      band.rotation.x = Math.PI / 2;
      add(g, new THREE.SphereGeometry(0.08, 12, 10), a, 0, 0.38);
      break;
    }
    case 'tophat':
      add(g, new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24), m, 0, 0.24);
      add(g, new THREE.CylinderGeometry(0.15, 0.16, 0.3, 24), m, 0, 0.4);
      add(g, new THREE.CylinderGeometry(0.162, 0.162, 0.05, 24), a, 0, 0.28);
      g.rotation.z = 0.18;
      break;
    case 'cone':
      add(g, new THREE.ConeGeometry(0.2, 0.42, 20), m, 0, 0.42);
      add(g, new THREE.CylinderGeometry(0.1, 0.135, 0.07, 20), a, 0, 0.44);
      add(g, new THREE.BoxGeometry(0.42, 0.04, 0.42), m, 0, 0.22);
      g.rotation.z = -0.12;
      break;
    case 'headphones': {
      add(g, new THREE.TorusGeometry(0.3, 0.035, 8, 24, Math.PI), a, 0, 0.02);
      for (const s of [1, -1]) {
        const cup = add(g, new THREE.CylinderGeometry(0.11, 0.11, 0.08, 18), m, s * 0.3, 0);
        cup.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'cap': {
      const dome = add(g, new THREE.SphereGeometry(0.3, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.1);
      dome.scale.set(0.98, 0.7, 0.98);
      const brim = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.12, 0.2);
      brim.scale.set(1, 1, 0.9);
      add(g, new THREE.SphereGeometry(0.035, 8, 6), a, 0, 0.32, 0);
      break;
    }
    case 'crown': {
      const gold = std(color || 0xffc23d, { metalness: 0.8, roughness: 0.25 });
      add(g, new THREE.CylinderGeometry(0.2, 0.19, 0.12, 20, 1, true), gold, 0, 0.3);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        add(g, new THREE.ConeGeometry(0.04, 0.11, 6), gold, Math.cos(ang) * 0.19, 0.41, Math.sin(ang) * 0.19);
        add(g, new THREE.SphereGeometry(0.025, 8, 6), std(accent, { emissive: accent, emissiveIntensity: 0.3 }), Math.cos(ang) * 0.2, 0.3, Math.sin(ang) * 0.2);
      }
      break;
    }
    case 'chef': {
      const white = std(0xffffff, { roughness: 0.9 });
      add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.18, 20), white, 0, 0.3);
      for (const [x, z] of [
        [0, 0],
        [0.1, 0.06],
        [-0.1, 0.05],
        [0.03, -0.1],
      ])
        add(g, new THREE.SphereGeometry(0.15, 14, 10), white, x, 0.45, z);
      break;
    }
    case 'viking': {
      const metal = std(color || 0xb0b8c0, { metalness: 0.7, roughness: 0.3 });
      const dome = add(g, new THREE.SphereGeometry(0.31, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, 0.08);
      dome.scale.set(1, 0.85, 1);
      for (const s of [1, -1]) {
        const horn = add(g, new THREE.ConeGeometry(0.06, 0.32, 12), std(accent || 0xf2e6c8), s * 0.32, 0.25);
        horn.rotation.z = -s * 0.9;
      }
      break;
    }
    case 'party': {
      const t = stripeTexture('#' + color.toString(16).padStart(6, '0'), '#ffffff', 6);
      add(g, new THREE.ConeGeometry(0.15, 0.4, 18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), 0.05, 0.44);
      add(g, new THREE.SphereGeometry(0.05, 10, 8), std(accent), 0.05, 0.66);
      g.rotation.z = -0.25;
      break;
    }
    case 'propeller': {
      const dome = add(g, new THREE.SphereGeometry(0.3, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.12);
      dome.scale.set(0.95, 0.72, 0.95);
      add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), std(0x888888), 0, 0.38);
      const blades = new THREE.Group();
      for (const s of [1, -1]) add(blades, new THREE.BoxGeometry(0.34, 0.012, 0.06), std(s > 0 ? accent : color), s * 0.17, 0, 0);
      blades.position.y = 0.44;
      g.add(blades);
      animate = (t) => (blades.rotation.y = t * 14);
      break;
    }
    case 'flower': {
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), std(0x3c8f4e), 0.1, 0.36);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.05, 10, 8), std(color || 0xff7eb6), 0.1 + Math.cos(ang) * 0.06, 0.5, Math.sin(ang) * 0.06);
      }
      add(g, new THREE.SphereGeometry(0.04, 10, 8), std(accent || 0xffe14a), 0.1, 0.5, 0);
      break;
    }
    case 'bucket': {
      add(g, new THREE.CylinderGeometry(0.22, 0.27, 0.2, 22), m, 0, 0.27);
      add(g, new THREE.CylinderGeometry(0.36, 0.36, 0.02, 24), m, 0, 0.18);
      break;
    }
    case 'none':
      break;
  }
  return { group: g, animate };
}

/** Outfit pieces attached to the torso (and a recolour for the torso material). */
export function buildOutfit(outfit: OutfitId, body: number, pants: number): { torso: THREE.Group; torsoMap?: THREE.Texture; head?: THREE.Group; animate?: (t: number, speed: number) => void } {
  const torso = new THREE.Group();
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  switch (outfit) {
    case 'overalls': {
      const mat = std(pants, { roughness: 0.8 });
      add(torso, new THREE.BoxGeometry(0.34, 0.26, 0.06), mat, 0, -0.12, 0.28);
      for (const s of [1, -1]) {
        const strap = add(torso, new THREE.BoxGeometry(0.06, 0.42, 0.04), mat, s * 0.13, 0.12, 0.27);
        strap.rotation.x = -0.25;
        add(torso, new THREE.SphereGeometry(0.025, 8, 6), std(0xffd23f, { metalness: 0.7 }), s * 0.13, -0.02, 0.32);
      }
      break;
    }
    case 'stripes':
      return { torso, torsoMap: stripeTexture(hex(body), '#ffffff', 8) };
    case 'hoodie': {
      const mat = std(pants, { roughness: 0.9 });
      const hood = add(torso, new THREE.TorusGeometry(0.2, 0.08, 10, 20, Math.PI * 1.4), mat, 0, 0.36, -0.12);
      hood.rotation.x = Math.PI / 2;
      hood.rotation.z = Math.PI * 0.8;
      add(torso, new THREE.BoxGeometry(0.3, 0.12, 0.05), mat, 0, -0.18, 0.29);
      return { torso, torsoMap: stripeTexture(hex(pants), hex(pants), 1) };
    }
    case 'tuxedo': {
      add(torso, new THREE.BoxGeometry(0.2, 0.4, 0.05), std(0xffffff), 0, 0.02, 0.29);
      for (const s of [1, -1]) {
        const lapel = add(torso, new THREE.BoxGeometry(0.08, 0.36, 0.05), std(0x1a1a22), s * 0.13, 0.02, 0.29);
        lapel.rotation.z = s * 0.25;
      }
      for (const s of [1, -1]) {
        const bow = add(torso, new THREE.ConeGeometry(0.05, 0.08, 8), std(0xd8243a), s * 0.04, 0.24, 0.32);
        bow.rotation.z = s * Math.PI / 2;
      }
      return { torso, torsoMap: stripeTexture('#1a1a22', '#1a1a22', 1) };
    }
    case 'cape': {
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.9, 1, 4), new THREE.MeshStandardMaterial({ color: pants, side: THREE.DoubleSide, roughness: 0.7 }));
      cape.castShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.3, -0.3);
      cape.position.y = -0.45;
      pivot.add(cape);
      torso.add(pivot);
      return { torso, animate: (t, speed) => (pivot.rotation.x = 0.15 + Math.min(1.1, speed * 0.25) + Math.sin(t * 6) * 0.06) };
    }
    case 'luchador': {
      const head = new THREE.Group();
      const mask = add(head, new THREE.SphereGeometry(0.298, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), std(pants, { roughness: 0.4 }), 0, 0, 0);
      mask.scale.set(1.02, 1.05, 1.0);
      for (const s of [1, -1]) {
        const flame = add(head, new THREE.TorusGeometry(0.07, 0.015, 6, 14), std(0xffd23f), s * 0.105, 0.06, 0.27);
        flame.rotation.y = s * 0.25;
      }
      return { torso, head };
    }
    case 'plain':
      break;
  }
  return { torso };
}

/** Accessory meshes in head-local space (or torso for neckwear). */
export function buildAccessory(acc: AccessoryId): { head?: THREE.Group; torso?: THREE.Group } {
  const g = new THREE.Group();
  const dark = std(0x1a1a22, { roughness: 0.3 });
  switch (acc) {
    case 'glasses':
    case 'monocle': {
      const metal = std(acc === 'monocle' ? 0xffc23d : 0x2a2a35, { metalness: 0.6, roughness: 0.3 });
      const sides = acc === 'monocle' ? [-1] : [1, -1];
      for (const s of sides) {
        const ring = add(g, new THREE.TorusGeometry(0.07, 0.012, 8, 20), metal, s * 0.105, 0.06, 0.3);
        ring.rotation.y = s * 0.25;
      }
      if (acc === 'glasses') add(g, new THREE.BoxGeometry(0.07, 0.012, 0.012), metal, 0, 0.07, 0.31);
      else add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), metal, -0.17, -0.06, 0.25);
      return { head: g };
    }
    case 'shades':
      for (const s of [1, -1]) {
        const lens = add(g, new THREE.BoxGeometry(0.12, 0.07, 0.03), dark, s * 0.1, 0.07, 0.29);
        lens.rotation.y = s * 0.25;
      }
      add(g, new THREE.BoxGeometry(0.34, 0.02, 0.02), dark, 0, 0.1, 0.28);
      return { head: g };
    case 'moustache': {
      const brown = std(0x4a2a1a, { roughness: 0.9 });
      for (const s of [1, -1]) {
        const half = add(g, new THREE.CapsuleGeometry(0.025, 0.08, 4, 8), brown, s * 0.05, -0.03, 0.29);
        half.rotation.z = Math.PI / 2 + s * 0.3;
      }
      return { head: g };
    }
    case 'eyepatch': {
      add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), dark, 0.105, 0.07, 0.29).rotation.x = Math.PI / 2;
      const band = add(g, new THREE.TorusGeometry(0.295, 0.01, 6, 30), dark, 0, 0.1, 0);
      band.rotation.x = Math.PI / 2 - 0.3;
      return { head: g };
    }
    case 'bowtie':
      for (const s of [1, -1]) {
        const bow = add(g, new THREE.ConeGeometry(0.06, 0.1, 8), std(0xd8243a), s * 0.05, 0.36, 0.25);
        bow.rotation.z = s * Math.PI / 2;
      }
      add(g, new THREE.SphereGeometry(0.025, 8, 6), std(0xa81a2a), 0, 0.36, 0.27);
      return { torso: g };
    case 'scarf': {
      const red = std(0xe8473f, { roughness: 0.9 });
      const ring = add(g, new THREE.TorusGeometry(0.22, 0.06, 10, 24), red, 0, 0.38, 0);
      ring.rotation.x = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.08, 0.25, 0.04), red, 0.1, 0.24, 0.24).rotation.z = 0.2;
      return { torso: g };
    }
    case 'none':
      break;
  }
  return {};
}
