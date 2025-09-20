import { deg2rad } from "./math";

export type Vec2 = { x: number; y: number };

export const v = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const len2 = (a: Vec2) => a.x * a.x + a.y * a.y;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);

export function norm(a: Vec2): Vec2 {
  const L = len(a);
  return L > 0 ? { x: a.x / L, y: a.y / L } : { x: 0, y: 0 };
}
export const normalizeSafe = norm;

export const rot = (a: Vec2, deg: number): Vec2 => {
  const r = deg2rad(deg),
    c = Math.cos(r),
    s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const fromAngleDeg = (deg: number, L = 1): Vec2 => {
  const r = deg2rad(deg);
  return { x: Math.cos(r) * L, y: Math.sin(r) * L };
};
export const angleDeg = (a: Vec2) => (Math.atan2(a.y, a.x) * 180) / Math.PI;
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x }); // 90° CCW

export const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);
export const distance2 = (a: Vec2, b: Vec2) =>
  (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// Projection of a onto 'onto'
export const project = (a: Vec2, onto: Vec2): Vec2 => {
  const l2 = len2(onto) || 1;
  const k = dot(a, onto) / l2;
  return mul(onto, k);
};

// Rotate point p around center c by 'deg'
export const rotateAround = (p: Vec2, c: Vec2, deg: number): Vec2 => {
  const t = sub(p, c);
  const r = rot(t, deg);
  return add(c, r);
};
