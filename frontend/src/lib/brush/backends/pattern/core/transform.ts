// FILE: src/lib/brush/backends/pattern/core/transform.ts

export type Mat2x3 = [number, number, number, number, number, number]; // [a, b, c, d, tx, ty]

export function matIdentity(): Mat2x3 {
  return [1, 0, 0, 1, 0, 0];
}
export function matTranslate(tx: number, ty: number): Mat2x3 {
  return [1, 0, 0, 1, tx, ty];
}
export function matScale(sx: number, sy: number): Mat2x3 {
  return [sx, 0, 0, sy, 0, 0];
}
export function matRotate(rad: number): Mat2x3 {
  const c = Math.cos(rad),
    s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}
export function matMul(a: Mat2x3, b: Mat2x3): Mat2x3 {
  const [a0, a1, a2, a3, a4, a5] = a,
    [b0, b1, b2, b3, b4, b5] = b;
  return [
    a0 * b0 + a2 * b1,
    a1 * b0 + a3 * b1,
    a0 * b2 + a2 * b3,
    a1 * b2 + a3 * b3,
    a0 * b4 + a2 * b5 + a4,
    a1 * b4 + a3 * b5 + a5,
  ];
}
export function applyMat(
  m: Mat2x3,
  x: number,
  y: number
): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
