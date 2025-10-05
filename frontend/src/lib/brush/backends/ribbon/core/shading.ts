// FILE: src/lib/brush/backends/ribbon/core/shading.ts
import type { Ctx2D } from "@backends/utils/canvas";
import type { RibbonSample } from "./resample";
import type { RibbonTuning } from "./tuning";

/** Small helpers */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toRGBA = (hex: string, a: number): string => {
  const aa = clamp01(a);
  if (!hex || hex[0] !== "#") return `rgba(0,0,0,${aa})`;
  const s = hex.slice(1);
  const toByte = (t: string) =>
    Math.max(0, Math.min(255, Number.parseInt(t, 16) || 0));
  if (s.length === 3) {
    const r = toByte(s[0]! + s[0]!);
    const g = toByte(s[1]! + s[1]!);
    const b = toByte(s[2]! + s[2]!);
    return `rgba(${r},${g},${b},${aa})`;
  }
  const r = toByte(s.slice(0, 2));
  const g = toByte(s.slice(2, 4));
  const b = toByte(s.slice(4, 6));
  return `rgba(${r},${g},${b},${aa})`;
};

/** Draw a blurred, rounded “opacity spine” down the center. */
export function strokeOpacitySpine(
  ctx: Ctx2D,
  samples: ReadonlyArray<RibbonSample>,
  baseRadius: number,
  color: string,
  tuning: RibbonTuning,
  alpha01: number
): void {
  if (samples.length < 2) return;
  const meanR = baseRadius * 0.95;
  const blurPx = Math.max(0.6, tuning.glazeBlurPx * tuning.opacitySpineBlurK);
  (ctx as CanvasRenderingContext2D).filter = `blur(${blurPx.toFixed(3)}px)`;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = clamp01(alpha01 * tuning.opacitySpineAlpha);
  (ctx as CanvasRenderingContext2D).strokeStyle = toRGBA(
    color,
    ctx.globalAlpha
  );
  (ctx as CanvasRenderingContext2D).lineCap = "round";
  (ctx as CanvasRenderingContext2D).lineJoin = "round";
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
    1,
    meanR * tuning.opacitySpineWidth
  );

  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++)
    ctx.lineTo(samples[i]!.x, samples[i]!.y);
  ctx.stroke();
  (ctx as CanvasRenderingContext2D).filter = "none";
}

/** Multiply “plate” pass — a broad dark band. */
export function strokePlate(
  ctx: Ctx2D,
  samples: ReadonlyArray<RibbonSample>,
  baseRadius: number,
  color: string,
  alpha01: number,
  widthMul: number
): void {
  if (samples.length < 2) return;
  ctx.globalCompositeOperation = "multiply";
  const blurPx = Math.max(0.6, 0.9);
  (ctx as CanvasRenderingContext2D).filter = `blur(${blurPx.toFixed(3)}px)`;
  ctx.globalAlpha = clamp01(alpha01);
  (ctx as CanvasRenderingContext2D).strokeStyle = toRGBA(
    color,
    ctx.globalAlpha
  );
  (ctx as CanvasRenderingContext2D).lineCap = "round";
  (ctx as CanvasRenderingContext2D).lineJoin = "round";
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
    1,
    baseRadius * widthMul
  );

  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++)
    ctx.lineTo(samples[i]!.x, samples[i]!.y);
  ctx.stroke();
  (ctx as CanvasRenderingContext2D).filter = "none";
}

/** Two multiply glaze strokes (softer bands) */
export function strokeGlazes(
  ctx: Ctx2D,
  samples: ReadonlyArray<RibbonSample>,
  baseRadius: number,
  color: string,
  glaze1Alpha: number,
  glaze2Alpha: number,
  w1Mul: number,
  w2Mul: number
): void {
  if (samples.length < 2) return;
  ctx.globalCompositeOperation = "multiply";
  (ctx as CanvasRenderingContext2D).filter =
    `blur(${Math.max(0.6, 0.5).toFixed(3)}px)`;

  // #1
  ctx.globalAlpha = clamp01(glaze1Alpha);
  (ctx as CanvasRenderingContext2D).strokeStyle = toRGBA(
    color,
    ctx.globalAlpha
  );
  (ctx as CanvasRenderingContext2D).lineCap = "round";
  (ctx as CanvasRenderingContext2D).lineJoin = "round";
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(1, baseRadius * w1Mul);
  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++)
    ctx.lineTo(samples[i]!.x, samples[i]!.y);
  ctx.stroke();

  // #2
  ctx.globalAlpha = clamp01(glaze2Alpha);
  (ctx as CanvasRenderingContext2D).strokeStyle = toRGBA(
    color,
    ctx.globalAlpha
  );
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(1, baseRadius * w2Mul);
  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++)
    ctx.lineTo(samples[i]!.x, samples[i]!.y);
  ctx.stroke();

  (ctx as CanvasRenderingContext2D).filter = "none";
}

/** Destination-in tip fade along centerline (light ends). */
export function applyTipFade(
  ctx: Ctx2D,
  samples: ReadonlyArray<RibbonSample>,
  tipMinAlpha: number,
  viewW: number,
  viewH: number
): void {
  if (samples.length < 2) return;
  const a = samples[0]!;
  const b = samples[samples.length - 1]!;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const grad = (ctx as CanvasRenderingContext2D).createLinearGradient(
    a.x,
    a.y,
    b.x,
    b.y
  );
  const endAlpha = Math.max(0, Math.min(1, tipMinAlpha));
  grad.addColorStop(0.0, `rgba(0,0,0,${endAlpha.toFixed(2)})`);
  grad.addColorStop(0.08, "rgba(0,0,0,1.0)");
  grad.addColorStop(0.92, "rgba(0,0,0,1.0)");
  grad.addColorStop(1.0, `rgba(0,0,0,${endAlpha.toFixed(2)})`);
  (ctx as CanvasRenderingContext2D).fillStyle = grad;
  ctx.fillRect(0, 0, Math.max(1, viewW), Math.max(1, viewH));
  ctx.restore();
}

/** Optional subtle inner rim polish (destination-out stroke). */
export function innerRimPolish(
  ctx: Ctx2D,
  outline: Path2D,
  alpha = 0.18
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  (ctx as CanvasRenderingContext2D).filter = "blur(0.35px)";
  (ctx as CanvasRenderingContext2D).strokeStyle =
    `rgba(0,0,0,${Math.max(0, Math.min(1, alpha))})`;
  (ctx as CanvasRenderingContext2D).lineCap = "round";
  (ctx as CanvasRenderingContext2D).lineJoin = "round";
  (ctx as CanvasRenderingContext2D).lineWidth = 0.7;
  ctx.stroke(outline);
  (ctx as CanvasRenderingContext2D).filter = "none";
  ctx.restore();
}
