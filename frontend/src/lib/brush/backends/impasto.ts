// FILE: src/lib/brush/backends/impasto.ts
/**
 * Impasto backend — height-map shading with a directional light.
 * - Builds a grayscale height map from stroke coverage (alpha encodes height).
 * - Computes normals via Sobel; lights with (half-)Lambert + optional spec.
 * - Draw ONLY in CSS space here. The engine has already sized & DPR-scaled.
 */

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import { Rand, Stroke as StrokeUtil, CanvasUtil, Blend } from "@backends";

import type { BrushInputConfig } from "@/data/brushPresets";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

type Ctx2D = CanvasUtil.Ctx2D;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ============================================================================
 * Pressure mapping from normalized input
 * ========================================================================== */

function toPressureMapFromInput(
  input?: BrushInputConfig
): PressureMapOpts | undefined {
  if (!input) return undefined;
  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;
  const deadZone =
    typeof input.pressure.clamp?.min === "number"
      ? Math.max(0, Math.min(0.5, input.pressure.clamp.min))
      : undefined;
  return gamma === undefined && deadZone === undefined
    ? undefined
    : { gamma, deadZone };
}

/* ============================================================================
 * Path resampling (arc-length)
 * ========================================================================== */

type Sample = { x: number; y: number; t: number; p: number; ang: number };

function resamplePath(
  pts: ReadonlyArray<RenderPathPoint>,
  stepPx: number,
  pmap?: PressureMapOpts
): Sample[] {
  if (StrokeUtil?.resamplePath) {
    const base = StrokeUtil.resamplePath(
      pts as RenderPathPoint[],
      stepPx
    ) as Array<{ x: number; y: number; t: number; p: number; angle?: number }>;

    const out: Sample[] = [];
    for (let i = 0; i < base.length; i++) {
      const a = base[Math.max(0, i - 1)];
      const b = base[Math.min(base.length - 1, i + 1)];
      const ang =
        typeof base[i].angle === "number"
          ? (base[i].angle as number)
          : Math.atan2(b.y - a.y, b.x - a.x);
      const p = clamp01(mapPressure(clamp01(base[i].p), pmap));
      out.push({ x: base[i].x, y: base[i].y, t: base[i].t, p, ang });
    }
    return out;
  }

  // Local fallback
  const out: Sample[] = [];
  if (!pts || pts.length < 2) return out;

  const n: number = pts.length;
  const segLen: number[] = new Array(n).fill(0);
  let total = 0;
  for (let i = 1; i < n; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const L = Math.hypot(dx, dy);
    segLen[i] = L;
    total += L;
  }
  if (total <= 0) return out;

  const prefix: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) prefix[i] = prefix[i - 1] + segLen[i];

  function posAt(sArc: number): {
    x: number;
    y: number;
    p: number;
    ang: number;
  } {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < n && prefix[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const s0 = prefix[i0 - 1];
    const L = segLen[i0];
    const u = L > 0 ? (s - s0) / L : 0;

    const a = pts[i0 - 1];
    const b = pts[i0];
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = clamp01(mapPressure(lerp(ap, bp, u), pmap));
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, p, ang };
  }

  const step = Math.max(0.5, Math.min(2.0, stepPx));
  for (let s = 0; s <= total; s += step) {
    const r = posAt(s);
    out.push({
      x: r.x,
      y: r.y,
      t: total > 0 ? s / total : 0,
      p: r.p,
      ang: r.ang,
    });
  }
  if (out.length && out[out.length - 1].t < 1) {
    const r = posAt(total);
    out.push({ x: r.x, y: r.y, t: 1, p: r.p, ang: r.ang });
  }
  return out;
}

/* ============================================================================
 * Height shaping & shading
 * ========================================================================== */

function pressureToRadius(baseSizePx: number, p: number): number {
  const q = Math.pow(clamp01(p), 0.85);
  return Math.max(0.5, baseSizePx * 0.5 * (0.6 + 0.9 * q));
}

function pressureToAlpha(p: number): number {
  const q = Math.pow(clamp01(p), 1.1);
  return 0.35 + q * 0.45; // 0.35..0.80
}

function shadeFromHeightAlpha(
  src: ImageData,
  width: number,
  height: number,
  lightDir: { x: number; y: number; z: number },
  intensity: number,
  ambient: number
): ImageData {
  const out = new ImageData(width, height);
  const s = src.data;
  const d = out.data;

  // Sobel kernels
  const kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const clampIdx = (x: number, y: number): number => {
    const ix = x < 0 ? 0 : x >= width ? width - 1 : x;
    const iy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return (iy * width + ix) * 4;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gx = 0,
        gy = 0,
        k = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = clampIdx(x + i, y + j);
          const h = s[idx + 3] / 255; // alpha as height
          gx += kx[k] * h;
          gy += ky[k] * h;
          k++;
        }
      }

      // Normal from gradient: n = normalize(-gx, -gy, 1)
      const nx = -gx * intensity;
      const ny = -gy * intensity;
      const nz = 1.0;
      const inv = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
      const nxx = nx * inv;
      const nyy = ny * inv;
      const nzz = nz * inv;

      const ndotl = Math.max(
        0,
        nxx * lightDir.x + nyy * lightDir.y + nzz * lightDir.z
      );
      const lambert = Math.pow(ndotl, 0.9);
      const shade = ambient + (1 - ambient) * lambert;

      const oi = (y * width + x) * 4;
      const v = Math.round(shade * 255);
      d[oi + 0] = v;
      d[oi + 1] = v;
      d[oi + 2] = v;
      d[oi + 3] = s[oi + 3]; // preserve coverage
    }
  }
  return out;
}

/* ============================================================================
 * Main (ctx-based) — assumes ctx is already DPR-normalized & cleared by engine
 * ========================================================================== */

export async function drawImpasto(
  ctx: Ctx2D,
  opt: RenderOptions
): Promise<void> {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 10);
  const color = opt.color ?? "#000000";

  // ---- Per-brush knobs (threaded via overrides, with sane defaults) ----
  const ov = (opt.engine.overrides ?? {}) as Record<string, unknown>;
  const spacingUI =
    opt.engine.strokePath?.spacing ?? (ov.spacing as number) ?? 6;

  const heightBlurPx = Math.max(0, Number(ov.heightBlurPx ?? 0.6));
  const reliefIntensity = Math.max(0.1, Number(ov.reliefIntensity ?? 1.5));
  const ambient = clamp01(Number(ov.ambient ?? 0.25));
  const specAmount = clamp01(Number(ov.specAmount ?? 0.18));
  const specFromShade = clamp01(Number(ov.specFromShade ?? 1));

  const lightAzimuthDeg = Number(ov.lightAzimuthDeg ?? 35);
  const lightElevationDeg = Number(ov.lightElevationDeg ?? 55);
  const az = (lightAzimuthDeg * Math.PI) / 180;
  const el = (lightElevationDeg * Math.PI) / 180;
  const L = {
    x: Math.cos(el) * Math.cos(az),
    y: Math.cos(el) * Math.sin(az),
    z: Math.sin(el),
  };

  // Spacing fraction (prefer shared util)
  const spacingFrac = StrokeUtil?.resolveSpacingFraction
    ? StrokeUtil.resolveSpacingFraction(spacingUI, 6)
    : (() => {
        const raw = typeof spacingUI === "number" ? spacingUI : 6;
        return raw > 1 ? clamp01(raw / 100) : clamp01(raw);
      })();

  // Pressure shaping from engine-normalized input
  const pmap = toPressureMapFromInput(
    (opt as unknown as { input?: BrushInputConfig }).input
  );

  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));
  const samples = resamplePath(path, stepPx, pmap);
  if (!samples.length) return;

  const seed = (opt.seed ?? 4242) >>> 0;
  const rng = Rand.mulberry32(seed);
  const rand = (): number => rng.nextFloat();

  // ---- Height map (alpha encodes height) — draw in CSS pixels ----
  const heightLayer = CanvasUtil.createLayer(viewW, viewH);
  const hx = heightLayer.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!hx) return;

  hx.globalCompositeOperation = "lighter";
  hx.lineCap = "round";
  hx.lineJoin = "round";

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const pMid = (a.p + b.p) * 0.5;

    const r = pressureToRadius(baseSizePx, pMid);
    const alpha = pressureToAlpha(pMid) * (0.82 + 0.18 * rand());

    hx.globalAlpha = alpha;
    (hx as CanvasRenderingContext2D).strokeStyle = color;
    hx.lineWidth = Math.max(0.5, r * 2);
    hx.beginPath();
    hx.moveTo(a.x, a.y);
    hx.lineTo(b.x, b.y);
    hx.stroke();
  }

  // Gentle blur to smooth the height field (when DOM 2D ctx present)
  const hctxDom = heightLayer.getContext(
    "2d"
  ) as CanvasRenderingContext2D | null;
  if (hctxDom) {
    hctxDom.filter = `blur(${heightBlurPx}px)`;
    hctxDom.drawImage(heightLayer, 0, 0);
    hctxDom.filter = "none";
  }

  // ---- Shade from height (Sobel -> normals -> Lambert) ----
  let heightImg: ImageData | null = null;
  const hForRead = heightLayer.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (hForRead) {
    heightImg = hForRead.getImageData(0, 0, viewW, viewH);
  }
  if (!heightImg) return;

  const shadeImg = shadeFromHeightAlpha(
    heightImg,
    viewW,
    viewH,
    L,
    reliefIntensity,
    ambient
  );

  const shadeCanvas = CanvasUtil.createLayer(viewW, viewH);
  const scx = shadeCanvas.getContext("2d", { alpha: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (scx) scx.putImageData(shadeImg, 0, 0);

  // ---- Pigment restricted to the height mask ----
  const pigment = CanvasUtil.createLayer(viewW, viewH);
  const px = pigment.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!px) return;

  // Fill pigment with brush color, then clip to height
  Blend.withComposite(px, "source-over", () => {
    (px as CanvasRenderingContext2D).fillStyle = color;
    px.fillRect(0, 0, viewW, viewH);
  });
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(heightLayer, 0, 0);
  });

  // Multiply lighting onto pigment (gives volume)
  Blend.withComposite(px, "multiply", () => {
    px.drawImage(shadeCanvas, 0, 0);
  });

  // Optional "specular from shade" pass (screen)
  if (specAmount > 0.001) {
    const spec = CanvasUtil.createLayer(viewW, viewH);
    const sx = spec.getContext("2d", { alpha: true }) as Ctx2D | null;
    if (sx) {
      sx.globalAlpha = specAmount;
      if (specFromShade < 1) {
        Blend.withCompositeAndAlpha(sx, "source-over", specFromShade, () => {
          sx.drawImage(shadeCanvas, 0, 0);
        });
      } else {
        sx.drawImage(shadeCanvas, 0, 0);
      }
      Blend.withComposite(px, "screen", () => {
        px.drawImage(spec, 0, 0);
      });
    }
  }

  // ---- Composite to destination ctx (engine handles global blend & opacity) ----
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(pigment, 0, 0);
  });
}

/* ============================================================================
 * Canvas adapter — do NOT resize or set DPR here (engine already did it)
 * ========================================================================== */

export async function drawImpastoToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return;
  await drawImpasto(ctx, opt);
}

export default drawImpasto;
