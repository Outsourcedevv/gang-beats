import * as THREE from 'three';
import type { Character } from '../../sim/character';
import { PART_DEFS, PART_INDEX } from '../../sim/ragdoll';
import type { PartName } from '../../sim/ragdoll';
import type { FighterLook } from './fighters';
import { starTexture } from './textures';

const tmpQ = new THREE.Quaternion();

function softMat(color: number): THREE.MeshPhysicalMaterial {
  // Velvety jelly look: rough base with a sheen rim.
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62,
    sheen: 0.8,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0xffffff),
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
  });
}

type Expression = 'normal' | 'effort' | 'hurt' | 'dazed' | 'ko' | 'scared' | 'tired';

/**
 * Visual representation of one ragdoll character: one mesh group per body part,
 * driven from interpolated physics snapshots, plus face, hat and squash/stretch.
 */
export class CharacterView {
  readonly root = new THREE.Group();
  private parts: THREE.Group[] = [];
  private head!: THREE.Group;
  private torsoMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;
  private eyes: THREE.Group[] = [];
  private pupils: THREE.Mesh[] = [];
  private xEyes: THREE.Group[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth!: THREE.Mesh;
  private stars: THREE.Sprite[] = [];
  private sweat!: THREE.Mesh;
  private squash = 0;
  private squashVel = 0;
  private blinkTimer = 2;
  private time = 0;

  constructor(
    readonly look: FighterLook,
    readonly index: number,
  ) {
    const body = softMat(look.body);
    const pants = softMat(look.pants);
    const shoe = new THREE.MeshStandardMaterial({ color: look.shoes, roughness: 0.55 });

    for (const def of PART_DEFS) {
      const g = new THREE.Group();
      this.parts.push(g);
      this.root.add(g);
      const m = this.partMesh(def.name, def.radius, def.halfHeight, body, pants, shoe);
      g.add(m);
    }
    this.head = this.parts[PART_INDEX.head];
    this.buildFace();
    this.buildHat();
    this.buildStars();
    this.sweat = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8fd6ff, roughness: 0.1, transparent: true, opacity: 0.85 }),
    );
    this.sweat.scale.set(0.8, 1.3, 0.8);
    this.sweat.position.set(-0.24, 0.16, 0.16);
    this.sweat.visible = false;
    this.head.add(this.sweat);
  }

  private partMesh(
    name: PartName,
    radius: number,
    halfHeight: number,
    body: THREE.Material,
    pants: THREE.Material,
    shoe: THREE.Material,
  ): THREE.Object3D {
    const g = new THREE.Group();
    const cap = (r: number, hh: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, hh * 2, 6, 14), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const ball = (r: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    switch (name) {
      case 'pelvis': {
        const m = ball(radius * 1.04, pants);
        m.scale.set(1.08, 0.95, 1.0);
        g.add(m);
        break;
      }
      case 'torso': {
        this.torsoMesh = cap(radius, halfHeight, body);
        g.add(this.torsoMesh);
        // Belly patch.
        const belly = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 0.72, 18, 14),
          new THREE.MeshPhysicalMaterial({ color: new THREE.Color(this.look.body).lerp(new THREE.Color(0xffffff), 0.35), roughness: 0.7, sheen: 0.6 }),
        );
        belly.scale.set(1, 1.15, 0.5);
        belly.position.set(0, -0.04, radius * 0.62);
        this.torsoMesh.add(belly);
        break;
      }
      case 'head': {
        this.headMesh = ball(radius * 1.02, body);
        this.headMesh.scale.set(1.0, 1.04, 0.98);
        g.add(this.headMesh);
        break;
      }
      case 'upperArmL':
      case 'upperArmR':
        g.add(cap(radius, halfHeight, body));
        break;
      case 'handL':
      case 'handR': {
        g.add(cap(radius * 0.85, halfHeight, body));
        const fist = ball(radius * 1.25, body);
        fist.position.y = -halfHeight - 0.02;
        fist.scale.set(1, 0.9, 1.1);
        g.add(fist);
        break;
      }
      case 'thighL':
      case 'thighR':
        g.add(cap(radius, halfHeight, pants));
        break;
      case 'shinL':
      case 'shinR': {
        g.add(cap(radius * 0.92, halfHeight, body));
        const foot = ball(radius * 1.2, shoe);
        foot.scale.set(1, 0.62, 1.45);
        foot.position.set(0, -halfHeight - 0.03, 0.05);
        g.add(foot);
        break;
      }
    }
    return g;
  }

  private buildFace(): void {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x15121c, roughness: 0.25 });
    const r = 0.29;
    for (const side of [1, -1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), white);
      ball.scale.set(1, 1.15, 0.55);
      eye.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), black);
      pupil.position.z = 0.035;
      pupil.scale.set(1, 1.1, 0.6);
      eye.add(pupil);
      eye.position.set(side * 0.105, 0.06, r * 0.9);
      eye.rotation.y = side * 0.25;
      this.head.add(eye);
      this.eyes.push(eye);
      this.pupils.push(pupil);

      // KO "X" eyes.
      const x = new THREE.Group();
      for (const a of [0.8, -0.8]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.02), black);
        bar.rotation.z = a;
        x.add(bar);
      }
      x.position.copy(eye.position).add(new THREE.Vector3(0, 0, 0.03));
      x.rotation.y = side * 0.25;
      x.visible = false;
      this.head.add(x);
      this.xEyes.push(x);

      // Brows for angry/effort faces.
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.03), black);
      brow.position.set(side * 0.105, 0.16, r * 0.88);
      brow.rotation.y = side * 0.25;
      brow.visible = false;
      this.head.add(brow);
      this.brows.push(brow);
    }
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a1f2e, roughness: 0.6 }),
    );
    mouth.position.set(0, -0.08, r * 0.95);
    mouth.scale.set(1, 0.35, 0.4);
    this.head.add(mouth);
    this.mouth = mouth;
    if (this.look.eyes === 'sleepy') for (const e of this.eyes) e.scale.set(1, 0.65, 1);
    if (this.look.eyes === 'wide') for (const e of this.eyes) e.scale.set(1.15, 1.15, 1);
  }

  private buildHat(): void {
    const { hat, hatColor, hatAccent } = this.look;
    const m = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7 });
    const a = new THREE.MeshStandardMaterial({ color: hatAccent, roughness: 0.6 });
    const g = new THREE.Group();
    const add = (mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    switch (hat) {
      case 'beanie': {
        const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.305, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), m));
        dome.position.y = 0.12;
        dome.scale.set(0.92, 0.75, 0.92);
        const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.045, 10, 24), m));
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.155;
        const pom = add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), a));
        pom.position.y = 0.38;
        break;
      }
      case 'tophat': {
        const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24), m));
        brim.position.y = 0.24;
        const crown = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.3, 24), m));
        crown.position.y = 0.4;
        const ribbon = add(new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.05, 24), a));
        ribbon.position.y = 0.28;
        g.rotation.z = 0.18;
        break;
      }
      case 'cone': {
        const cone = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 20), m));
        cone.position.y = 0.42;
        const stripe = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.135, 0.07, 20), a));
        stripe.position.y = 0.44;
        const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), m));
        base.position.y = 0.22;
        g.rotation.z = -0.12;
        break;
      }
      case 'headphones': {
        const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 24, Math.PI), a));
        band.position.y = 0.02;
        for (const s of [1, -1]) {
          const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 18), m));
          cup.rotation.z = Math.PI / 2;
          cup.position.set(s * 0.3, 0.0, 0);
        }
        break;
      }
      case 'none':
        break;
    }
    this.head.add(g);
  }

  private buildStars(): void {
    const mat = new THREE.SpriteMaterial({ map: starTexture(), depthWrite: false, transparent: true });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.22);
      s.visible = false;
      this.root.add(s);
      this.stars.push(s);
    }
  }

  /** Kick the squash spring (on hits, landings, slams). */
  bump(amount: number): void {
    this.squashVel += amount;
  }

  update(char: Character, prev: Float32Array, curr: Float32Array, base: number, alpha: number, dt: number): void {
    this.time += dt;
    this.root.visible = char.state !== 'eliminated';
    if (!this.root.visible) return;
    for (let i = 0; i < this.parts.length; i++) {
      const o = base + i * 7;
      const g = this.parts[i];
      g.position.set(
        prev[o] + (curr[o] - prev[o]) * alpha,
        prev[o + 1] + (curr[o + 1] - prev[o + 1]) * alpha,
        prev[o + 2] + (curr[o + 2] - prev[o + 2]) * alpha,
      );
      THREE.Quaternion.slerpFlat(tmpQ as unknown as number[], 0, prev as unknown as number[], o + 3, curr as unknown as number[], o + 3, alpha);
      g.quaternion.copy(tmpQ);
    }

    // Squash & stretch spring.
    this.squashVel += (-this.squash * 220 - this.squashVel * 14) * dt;
    this.squash += this.squashVel * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.35, 0.35);
    this.headMesh.scale.set(1 + sq * 0.6, 1.04 - sq, 0.98 + sq * 0.6);
    this.torsoMesh.scale.set(1 + sq * 0.4, 1 - sq * 0.7, 1 + sq * 0.4);

    this.updateFace(char, dt);
    this.updateStars(char);
  }

  private expression(c: Character): Expression {
    if (c.state === 'ko') return 'ko';
    if (c.hurtTimer > 0) return 'hurt';
    if (c.effort > 0.5) return 'effort';
    if (c.airTime > 0.6 || c.liftedBy >= 0) return 'scared';
    if (c.exhausted) return 'tired';
    if (c.daze > 45) return 'dazed';
    return 'normal';
  }

  private updateFace(c: Character, dt: number): void {
    const e = this.expression(c);
    const baseY = this.look.eyes === 'sleepy' ? 0.65 : this.look.eyes === 'wide' ? 1.15 : 1;
    this.blinkTimer -= dt;
    let blink = 1;
    if (this.blinkTimer < 0) {
      blink = 0.1;
      if (this.blinkTimer < -0.12) this.blinkTimer = 2 + Math.random() * 3;
    }
    let eyeY = baseY * blink;
    let mouthOpen = 0.35;
    let mouthW = 1;
    let browTilt = 0;
    let browVisible = false;
    const pupilOffset = new THREE.Vector2(0, 0);
    switch (e) {
      case 'effort':
        eyeY = 0.45;
        mouthOpen = 0.55;
        mouthW = 1.4;
        browVisible = true;
        browTilt = 0.45;
        break;
      case 'hurt':
        eyeY = 0.14;
        mouthOpen = 0.9;
        mouthW = 0.9;
        break;
      case 'scared':
        eyeY = baseY * 1.3;
        mouthOpen = 1.2;
        mouthW = 0.8;
        break;
      case 'dazed': {
        const t = this.time * 7;
        pupilOffset.set(Math.cos(t) * 0.025, Math.sin(t) * 0.025);
        mouthOpen = 0.5;
        mouthW = 1.2;
        break;
      }
      case 'ko':
        mouthOpen = 0.8;
        mouthW = 1.3;
        break;
      case 'tired':
        eyeY = baseY * 0.4;
        mouthOpen = 0.6 + Math.sin(this.time * 9) * 0.3;
        mouthW = 1.1;
        break;
    }
    this.sweat.visible = e === 'tired' || (e === 'effort' && c.stamina < 35);
    if (this.sweat.visible) this.sweat.position.y = 0.16 - ((this.time * 0.5) % 1) * 0.15;
    const ko = e === 'ko';
    for (let i = 0; i < 2; i++) {
      this.eyes[i].visible = !ko;
      this.xEyes[i].visible = ko;
      this.eyes[i].scale.y = THREE.MathUtils.lerp(this.eyes[i].scale.y, eyeY, 0.4);
      const side = i === 0 ? 1 : -1;
      this.pupils[i].position.x = pupilOffset.x * (e === 'dazed' ? side : 1);
      this.pupils[i].position.y = pupilOffset.y;
      this.brows[i].visible = browVisible;
      this.brows[i].rotation.z = -side * browTilt;
    }
    this.mouth.scale.set(mouthW, THREE.MathUtils.lerp(this.mouth.scale.y, mouthOpen, 0.35), 0.4);
  }

  private updateStars(c: Character): void {
    const show = c.state === 'ko' || c.daze > 70;
    const head = this.head.position;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.visible = show;
      if (!show) continue;
      const a = this.time * 4 + (i / this.stars.length) * Math.PI * 2;
      s.position.set(head.x + Math.cos(a) * 0.38, head.y + 0.42 + Math.sin(a * 2) * 0.04, head.z + Math.sin(a) * 0.38);
    }
  }

  /** World-space position of the head (for labels / effects). */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.head.position);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
