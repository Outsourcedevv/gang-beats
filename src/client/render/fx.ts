import * as THREE from 'three';
import { burstTexture } from './textures';

const SPARK = [0xffffff, 0xfff2a0, 0xffc04a];

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Flash {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  size: number;
}

/** Pooled hit sparks, dust puffs and comic impact flashes. */
export class Effects {
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private pIdx = 0;
  private fIdx = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.TetrahedronGeometry(0.06);
    for (let i = 0; i < 120; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SPARK[i % 3], transparent: true }));
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
    const flashMat = new THREE.SpriteMaterial({ map: burstTexture(), transparent: true, depthWrite: false, depthTest: false });
    for (let i = 0; i < 12; i++) {
      const sprite = new THREE.Sprite(flashMat.clone());
      sprite.visible = false;
      sprite.renderOrder = 10;
      scene.add(sprite);
      this.flashes.push({ sprite, life: 0, maxLife: 1, size: 1 });
    }
  }

  hit(pos: THREE.Vector3, strength: number): void {
    const n = Math.min(14, 4 + Math.floor(strength));
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.pIdx++ % this.particles.length];
      p.mesh.position.copy(pos);
      p.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * strength * 0.5);
      p.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
      p.life = p.maxLife = 0.35 + Math.random() * 0.25;
      p.mesh.visible = true;
      p.mesh.scale.setScalar(0.8 + Math.random() * 0.8);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(SPARK[i % SPARK.length]);
    }
    const f = this.flashes[this.fIdx++ % this.flashes.length];
    f.sprite.position.copy(pos);
    f.size = 0.35 + Math.min(strength, 14) * 0.05;
    f.life = f.maxLife = 0.16;
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
  }

  dust(pos: THREE.Vector3, strength: number): void {
    const n = Math.min(10, 3 + Math.floor(strength * 0.6));
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.pIdx++ % this.particles.length];
      p.mesh.position.set(pos.x, Math.max(0.05, pos.y - 0.5), pos.z);
      const a = Math.random() * Math.PI * 2;
      p.vel.set(Math.cos(a) * 1.5, 0.6 + Math.random(), Math.sin(a) * 1.5);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      p.life = p.maxLife = 0.3 + Math.random() * 0.2;
      p.mesh.visible = true;
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xd9cbb8);
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = p.life / p.maxLife;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.visible = false;
        continue;
      }
      const t = 1 - f.life / f.maxLife;
      f.sprite.scale.setScalar(f.size * (0.6 + t * 0.9));
      f.sprite.material.opacity = 1 - t * t;
    }
  }
}
