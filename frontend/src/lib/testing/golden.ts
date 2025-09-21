// FILE: src/lib/testing/golden.ts

import type { RenderOptions } from "@/lib/brush/engine";

export type GoldenBaseline = {
  width: number; // pixel width
  height: number; // pixel height
  data: Uint8ClampedArray; // RGBA interleaved, length = w*h*4
};

export type GoldenCase = {
  name: string;
  /** Must set width/height/baseSizePx/color/engine/path/seed (your factory controls those). */
  makeOptions: () => RenderOptions;
  /** Precomputed ImageData-like baseline. */
  baseline: GoldenBaseline;
  /** Allowed mean absolute error per channel (0..255). 1–3 is very strict. Default: 2.0 */
  tolerance?: number;
};

export type GoldenResult = {
  name: string;
  passed: boolean;
  mae: number; // mean absolute error per channel
  maxErr: number;
};

function assertDomAvailable(): void {
  if (typeof document === "undefined") {
    throw new Error(
      "runGolden must be executed in a browser-like environment (document is undefined)."
    );
  }
}

function getImageDataFromCanvas(c: HTMLCanvasElement): ImageData {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable for golden test.");
  // Normalize state to reduce variability across environments
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx.getImageData(0, 0, c.width, c.height);
}

function compareImageData(a: ImageData, b: GoldenBaseline) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Dimension mismatch: got ${a.width}x${a.height}, baseline ${b.width}x${b.height}`
    );
  }
  const A = a.data;
  const B = b.data;
  if (A.length !== B.length) {
    throw new Error(
      `Data length mismatch: got ${A.length}, baseline ${B.length}`
    );
  }
  let sumAbs = 0;
  let maxErr = 0;
  const N = A.length;
  for (let i = 0; i < N; i++) {
    const d = Math.abs(A[i] - B[i]);
    sumAbs += d;
    if (d > maxErr) maxErr = d;
  }
  const mae = sumAbs / N; // 0..255
  return { mae, maxErr };
}

function validateBaseline(b: GoldenBaseline): void {
  if (
    !b ||
    typeof b.width !== "number" ||
    typeof b.height !== "number" ||
    !(b.data instanceof Uint8ClampedArray)
  ) {
    throw new Error("Invalid baseline: width/height/data are required.");
  }
  if (b.data.length !== b.width * b.height * 4) {
    throw new Error(
      `Invalid baseline data length: expected ${b.width * b.height * 4}, got ${b.data.length}.`
    );
  }
}

export async function runGolden(
  draw: (canvas: HTMLCanvasElement, opts: RenderOptions) => Promise<void>,
  test: GoldenCase
): Promise<GoldenResult> {
  assertDomAvailable();
  validateBaseline(test.baseline);

  const { width, height } = test.baseline;

  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;

  const opts = test.makeOptions();
  // Enforce size from baseline & deterministic DPR
  opts.width = width;
  opts.height = height;
  opts.pixelRatio = 1;

  try {
    await draw(c, opts);
  } catch (err) {
    throw new Error(
      `Golden "${test.name}" draw failed: ${(err as Error)?.message ?? err}`
    );
  }

  const img = getImageDataFromCanvas(c);
  const { mae, maxErr } = compareImageData(img, test.baseline);
  const tol = Math.max(0, test.tolerance ?? 2.0);

  return {
    name: test.name,
    passed: mae <= tol,
    mae,
    maxErr,
  };
}

export async function runGoldens(
  draw: (canvas: HTMLCanvasElement, opts: RenderOptions) => Promise<void>,
  cases: ReadonlyArray<GoldenCase>
): Promise<GoldenResult[]> {
  const out: GoldenResult[] = [];
  for (const t of cases) {
    /// eslint-disable-next-line no-await-in-loop
    out.push(await runGolden(draw, t));
  }
  return out;
}
