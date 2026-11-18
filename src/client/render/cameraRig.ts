import * as THREE from 'three';

/**
 * Shared party-game camera: frames every active fighter, zooms out as they
 * spread apart and in when they bunch up, with heavy smoothing and only a
 * tiny, fast-decaying shake on big hits.
 */
export class CameraRig {
  private target = new THREE.Vector3(0, 1, 0);
  private distance = 13;
  private shake = 0;
  private readonly dir = new THREE.Vector3(0, 0.66, 1).normalize();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly minDist = 8.5,
    private readonly maxDist = 24,
  ) {}

  addShake(amount: number): void {
    this.shake = Math.min(0.12, this.shake + amount);
  }

  snap(points: THREE.Vector3[]): void {
    this.update(points, 1, true);
  }

  update(points: THREE.Vector3[], dt: number, instant = false): void {
    const box = new THREE.Box3();
    if (points.length === 0) box.expandByPoint(new THREE.Vector3(0, 1, 0));
    for (const p of points) box.expandByPoint(p);
    const center = box.getCenter(this.tmp.set(0, 0, 0));
    const size = box.getSize(new THREE.Vector3());
    // Horizontal spread matters most; depth spread counts a bit less because of the camera tilt.
    const aspect = Math.max(0.6, this.camera.aspect);
    const spread = Math.max(size.x / aspect, size.z * 1.25, size.y);
    const wantDist = THREE.MathUtils.clamp(6.5 + spread * 1.15, this.minDist, this.maxDist);
    const wantTarget = new THREE.Vector3(center.x, Math.max(0.8, center.y * 0.6 + 0.6), center.z + 0.4);

    const k = instant ? 1 : 1 - Math.exp(-dt * 3.2);
    const kd = instant ? 1 : 1 - Math.exp(-dt * (wantDist > this.distance ? 2.6 : 1.4));
    this.target.lerp(wantTarget, k);
    this.distance += (wantDist - this.distance) * kd;

    const pos = this.tmp.copy(this.dir).multiplyScalar(this.distance).add(this.target);
    if (this.shake > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shake;
      pos.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 18);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }
}
