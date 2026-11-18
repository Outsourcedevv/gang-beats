import type { StaticBox, StaticPiece, SurfaceStyle } from '../arena';

// Small helpers for writing arena data by hand.

/** Axis-aligned box from min/max corners. */
export function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  style: SurfaceStyle,
  extra: Partial<StaticBox> = {},
): StaticBox {
  return {
    kind: 'box',
    pos: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
    half: { x: Math.abs(x1 - x0) / 2, y: Math.abs(y1 - y0) / 2, z: Math.abs(z1 - z0) / 2 },
    style,
    ...extra,
  };
}

/** A railing with a grabbable top bar, a mid bar and posts. */
export function railing(x0: number, z0: number, x1: number, z1: number, style: SurfaceStyle = 'railing', y = 0): StaticPiece[] {
  const out: StaticPiece[] = [];
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  out.push({ kind: 'box', pos: { x: cx, y: y + 0.95, z: cz }, half: { x: 0.05, y: 0.05, z: length / 2 }, yaw, style });
  out.push({ kind: 'box', pos: { x: cx, y: y + 0.5, z: cz }, half: { x: 0.035, y: 0.035, z: length / 2 }, yaw, style });
  const posts = Math.max(2, Math.round(length / 1.4) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    out.push({ kind: 'box', pos: { x: x0 + dx * t, y: y + 0.48, z: z0 + dz * t }, half: { x: 0.05, y: 0.48, z: 0.05 }, style });
  }
  return out;
}

/** Vertical post (pipe) from y0 to y1. */
export function post(x: number, z: number, y0: number, y1: number, style: SurfaceStyle = 'pipe', r = 0.08): StaticBox {
  return slab(x - r, x + r, y0, y1, z - r, z + r, style);
}
