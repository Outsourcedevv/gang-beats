// Tiny allocation-light vector/quaternion helpers shared by the simulation.
// Kept independent of three.js so the simulation can run headless (tests, server).

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const lenXZ = (a: Vec3): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));

/** Rotate vector v by unit quaternion q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const rotateInv = (q: Quat, v: Vec3): Vec3 => rotate(conj(q), v);

export const quatYaw = (yaw: number): Quat => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
export const QUAT_ID: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Forward (+Z local) direction for a yaw angle. */
export const yawDir = (yaw: number): Vec3 => ({ x: Math.sin(yaw), y: 0, z: Math.cos(yaw) });

/** Wrap an angle into [-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Axis * angle (rotation vector) that rotates unit vector `from` onto unit vector `to`. */
export function rotationBetween(from: Vec3, to: Vec3): Vec3 {
  const c = cross(from, to);
  const s = len(c);
  const d = dot(from, to);
  const angle = Math.atan2(s, d);
  if (s < 1e-6) {
    if (d > 0) return { x: 0, y: 0, z: 0 };
    // Opposite: pick any perpendicular axis.
    const perp = Math.abs(from.x) < 0.9 ? cross(from, { x: 1, y: 0, z: 0 }) : cross(from, { x: 0, y: 1, z: 0 });
    return scale(normalize(perp), Math.PI);
  }
  return scale(c, angle / s);
}

/** Deterministic seeded RNG (mulberry32) so the sim can be reproduced on a server. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minimal rotation quaternion taking unit vector `a` onto unit vector `b`. */
export function quatFromUnitVectors(a: Vec3, b: Vec3, fallbackAxis?: Vec3): Quat {
  const d = dot(a, b);
  if (d < -0.999999) {
    let axis = fallbackAxis ?? (Math.abs(a.x) < 0.9 ? cross({ x: 1, y: 0, z: 0 }, a) : cross({ x: 0, y: 1, z: 0 }, a));
    axis = normalize(axis);
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }
  const c = cross(a, b);
  const w = 1 + d;
  const n = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z + w * w);
  return { x: c.x / n, y: c.y / n, z: c.z / n, w: w / n };
}
