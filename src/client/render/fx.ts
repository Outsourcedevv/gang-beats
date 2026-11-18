import * as THREE from 'three';
import { burstTexture, ringTexture } from './textures';

const SPARK = [0xffffff, 0xfff2a0, 0xffc04a];

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
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
  private rings: { mesh: THREE.Mesh; life: number }[] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.TetrahedronGeometry(0.06);
    for (let i = 0; i < 220; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SPARK[i % 3], transparent: true }));
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, maxLife: 1, gravity: 9 });
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
      p.gravity = 9;
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

  /** Generic particle burst. */
  burst(pos: THREE.Vector3, n: number, colors: number[], speed: number, up: number, life = 0.6, size = 1, gravity = 9): void {
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.pIdx++ % this.particles.length];
      p.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y + (Math.random() - 0.5) * 0.2, pos.z + (Math.random() - 0.5) * 0.3);
      p.vel.set((Math.random() - 0.5) * speed, up * (0.5 + Math.random()), (Math.random() - 0.5) * speed);
      p.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.gravity = gravity;
      p.mesh.visible = true;
      p.mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colors[i % colors.length]);
    }
  }

  shards(pos: THREE.Vector3, half: { x: number; z: number }): void {
    for (let i = 0; i < 4; i++) {
      const q = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * half.x * 2, 0, (Math.random() - 0.5) * half.z * 2));
      this.burst(q, 10, [0xd8f4ff, 0x9fd8ff, 0xffffff], 4, 3, 0.9, 1.3);
    }
  }

  splinters(pos: THREE.Vector3): void {
    this.burst(pos, 16, [0x8a5a2a, 0xa8743f, 0x5a3a1a], 4, 3, 0.8, 1.2);
  }

  splash(pos: THREE.Vector3): void {
    this.burst(pos, 26, [0xffffff, 0xbfe6ff, 0x7fc6ff], 3, 7, 0.9, 1.4, 14);
  }

  sparks(pos: THREE.Vector3): void {
    this.burst(pos, 26, [0xffd23f, 0xff7a1a, 0xff3b1a], 5, 6, 0.8, 1, 12);
  }

  /** Red target ring on the floor where something is about to land. */
  ring(pos: THREE.Vector3, scene: THREE.Scene): void {
    let r = this.rings.find((x) => x.life <= 0);
    if (!r) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4),
        new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      r = { mesh, life: 0 };
      this.rings.push(r);
    }
    r.mesh.position.set(pos.x, pos.y + 0.03, pos.z);
    r.life = 1.1;
    r.mesh.visible = true;
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
      p.gravity = 9;
      p.mesh.visible = true;
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xd9cbb8);
    }
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      r.mesh.visible = r.life > 0;
      const m = r.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.min(1, r.life * 2) * (0.6 + 0.4 * Math.sin(r.life * 25));
      r.mesh.scale.setScalar(0.8 + (1.1 - r.life) * 0.3);
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
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
