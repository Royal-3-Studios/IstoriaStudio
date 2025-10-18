export function logCurve(points: { x: number; y: number }[]) {
  console.table(points.map((p, i) => ({ i, ...p })));
}

export function timeStroke(label: string, fn: () => void) {
  const t0 = performance.now();
  fn();
  console.log(`${label} took ${(performance.now() - t0).toFixed(2)}ms`);
}
