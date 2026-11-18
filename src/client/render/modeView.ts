import * as THREE from 'three';
import type { WorldView } from '../../sim/view';
import { TEAM_COLORS } from '../../sim/modes';
import type { CharacterView } from './characterView';

const tmp = new THREE.Vector3();

/** In-world markers for game modes: team rings, the hill, goals, the hot potato. */
export class ModeView {
  readonly group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private hill: THREE.Group | null = null;
  private hillWall!: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private hillDisc!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private goals: THREE.Group | null = null;
  private bomb: THREE.Group;
  private spark: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private time = 0;
  private lastPoints: number[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly world: WorldView,
  ) {
    const r = world.rules;
    // Team rings under each fighter.
    if (r.teamMode) {
      for (let i = 0; i < world.characters.length; i++) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.42, 0.56, 28),
          new THREE.MeshBasicMaterial({ color: TEAM_COLORS[r.sides[i] % TEAM_COLORS.length], transparent: true, opacity: 0.85, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 2;
        this.group.add(ring);
        this.rings.push(ring);
      }
    }
    if (r.mode === 'koth' && world.arena.hills?.length) {
      this.hill = new THREE.Group();
      this.hillWall = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1.6, 40, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      );
      this.hillWall.position.y = 0.8;
      this.hillDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
      this.hillDisc.rotation.x = -Math.PI / 2;
      this.hillDisc.position.y = 0.03;
      this.hill.add(this.hillWall, this.hillDisc);
      this.group.add(this.hill);
    }
    if (r.mode === 'trophy' && world.arena.goals) {
      this.goals = new THREE.Group();
      world.arena.goals.forEach((g, team) => {
        const size = new THREE.Vector3(g.max.x - g.min.x, g.max.y - g.min.y, g.max.z - g.min.z);
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(size.x, size.y, size.z),
          new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team], transparent: true, opacity: 0.16, depthWrite: false }),
        );
        box.position.set((g.min.x + g.max.x) / 2, (g.min.y + g.max.y) / 2, (g.min.z + g.max.z) / 2);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: TEAM_COLORS[team] }));
        edges.position.copy(box.position);
        this.goals!.add(box, edges);
      });
      this.group.add(this.goals);
    }
    // The hot potato.
    this.bomb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), new THREE.MeshStandardMaterial({ color: 0x1d1d24, roughness: 0.35, metalness: 0.3 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6 }));
    cap.position.y = 0.21;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xc9a46a }));
    fuse.position.set(0.03, 0.3, 0);
    fuse.rotation.z = -0.4;
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.spark.position.set(0.07, 0.37, 0);
    this.bomb.add(body, cap, fuse, this.spark);
    this.bomb.visible = false;
    this.group.add(this.bomb);
    scene.add(this.group);
  }

  update(views: CharacterView[], dt: number): void {
    this.time += dt;
    const w = this.world;
    const r = w.rules;
    this.rings.forEach((ring, i) => {
      const c = w.characters[i];
      ring.visible = !!c?.alive;
      if (!ring.visible) return;
      // Sit on whatever is under the pelvis (roughly).
      ring.position.set(c.torsoPos.x, c.torsoPos.y - 1.06, c.torsoPos.z);
    });
    if (this.hill) {
      const h = w.arena.hills![r.hillIndex % w.arena.hills!.length];
      this.hill.position.set(h.pos.x, h.pos.y, h.pos.z);
      this.hill.scale.set(h.radius, 1, h.radius);
      // Tint by whoever is scoring right now.
      let scorer = -1;
      r.points.forEach((p, i) => {
        if (p > (this.lastPoints[i] ?? 0) + 1e-4) scorer = i;
      });
      this.lastPoints = [...r.points];
      const col = scorer >= 0 ? (r.teamMode ? TEAM_COLORS[scorer % 4] : 0x7cff9a) : 0xffffff;
      this.hillWall.material.color.setHex(col);
      this.hillDisc.material.color.setHex(col);
      const pulse = 0.28 + Math.sin(this.time * 4) * 0.08;
      this.hillWall.material.opacity = pulse;
      this.hillDisc.material.opacity = pulse + 0.08;
    }
    const holder = r.mode === 'potato' && r.phase === 'fight' ? r.potatoHolder : -1;
    const v = holder >= 0 ? views[holder] : undefined;
    this.bomb.visible = !!v && !!w.characters[holder]?.alive;
    if (this.bomb.visible && v) {
      v.headPosition(tmp);
      this.bomb.position.set(tmp.x, tmp.y + 0.62, tmp.z);
      // Fuse flickers faster as time runs out.
      const rate = 6 + Math.max(0, 12 - r.potatoTimer) * 2.5;
      this.spark.visible = Math.sin(this.time * rate) > -0.3;
      const s = 1 + Math.max(0, 3 - r.potatoTimer) * 0.08 * (1 + Math.sin(this.time * 20));
      this.bomb.scale.setScalar(s);
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
    });
  }
}
