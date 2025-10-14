// FILE: src/lib/brush/dev/dpr-check.ts
// Tiny visual debugger to verify that canvases are sized & rendered at the
// correct device-pixel ratio (DPR). It draws 1–device-pixel grids, a border,
// and a checker so you can quickly spot blurriness or half-pixel alignment.

import {
  ensureCanvas2D,
  type CanvasLike,
  type Ctx2D,
} from "@/lib/brush/backends/utils/canvas";

export type DprCheckOptions = {
  /** CSS-space width & height to draw in. Defaults to the canvas' client size if available, else 256×256. */
  cssW?: number;
  cssH?: number;
  /** The DPR to use. Defaults to globalThis.devicePixelRatio || 1. */
  dpr?: number;
  /** Major grid step in CSS px. Default 10. */
  gridStepCss?: number;
  /** Whether to render the DPR label and legend. Default true. */
  showText?: boolean;
};

/** Draw a DPR verification pattern onto `target`. */
export function drawDprCheck(
  target: CanvasLike,
  opts: DprCheckOptions = {}
): void {
  const dpr = clampPos(opts.dpr ?? getDpr(), 0.25, 8);
  const cssW = Math.max(1, Math.floor(opts.cssW ?? guessCssW(target) ?? 256));
  const cssH = Math.max(1, Math.floor(opts.cssH ?? guessCssH(target) ?? 256));
  const step = Math.max(2, Math.floor(opts.gridStepCss ?? 10));
  const showText = opts.showText ?? true;

  const ctx = ensureCanvas2D(target, cssW, cssH, dpr);

  // Clear (CSS space)
  ctx.clearRect(0, 0, cssW, cssH);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  // 1) Outer 1-device-pixel border
  drawDevicePixelRectStroke(ctx, 0, 0, cssW, cssH, dpr, "#000000");

  // 2) Major grid at `step` CSS px using 1-device-pixel lines
  ctx.save();
  ctx.globalAlpha = 0.8;
  for (let x = step; x < cssW; x += step) {
    drawDevicePixelVLine(ctx, x, 0, cssH, dpr, "#d0d0d0");
  }
  for (let y = step; y < cssH; y += step) {
    drawDevicePixelHLine(ctx, 0, y, cssW, dpr, "#d0d0d0");
  }
  ctx.restore();

  // 3) Sub-grid (every 5 CSS px) lighter
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let x = 5; x < cssW; x += 5) {
    drawDevicePixelVLine(ctx, x, 0, cssH, dpr, "#e7e7e7");
  }
  for (let y = 5; y < cssH; y += 5) {
    drawDevicePixelHLine(ctx, 0, y, cssW, dpr, "#e7e7e7");
  }
  ctx.restore();

  // 4) 1-device-pixel checker box (top-left) to verify exact pixel squares
  drawDevicePixelChecker(ctx, 10, 10, 12, 12, dpr);

  // 5) Sample 1-px device lines in primary colors
  drawDevicePixelVLine(ctx, 30, 10, 60, dpr, "#ff0000");
  drawDevicePixelVLine(ctx, 31, 10, 60, dpr, "#00aa00");
  drawDevicePixelVLine(ctx, 32, 10, 60, dpr, "#0000ff");

  drawDevicePixelHLine(ctx, 10, 30, 60, dpr, "#ff0000");
  drawDevicePixelHLine(ctx, 10, 31, 60, dpr, "#00aa00");
  drawDevicePixelHLine(ctx, 10, 32, 60, dpr, "#0000ff");

  // 6) Thin diagonal sample (will anti-alias; useful to compare across DPRs)
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1 / dpr; // ~1 device pixel stroke thickness
  ctx.beginPath();
  ctx.moveTo(70 + 0.5 / dpr, 10 + 0.5 / dpr);
  ctx.lineTo(110 + 0.5 / dpr, 50 + 0.5 / dpr);
  ctx.stroke();
  ctx.restore();

  // 7) Label
  if (showText) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.font = `${Math.max(10, Math.floor(12))}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(
      `DPR: ${fmt(dpr)}  |  grid: ${step}px  |  1dp lines`,
      10,
      cssH - 20
    );
    ctx.restore();
  }
}

/* ----------------------------- Drawing helpers ----------------------------- */

function drawDevicePixelVLine(
  ctx: Ctx2D,
  cssX: number,
  cssY: number,
  cssH: number,
  dpr: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  // 1 device pixel width in CSS space:
  const w = 1 / dpr;
  // Align to device pixel edge
  const x = snapToDevice(cssX, dpr);
  ctx.fillRect(x, cssY, w, cssH);
  ctx.restore();
}

function drawDevicePixelHLine(
  ctx: Ctx2D,
  cssX: number,
  cssY: number,
  cssW: number,
  dpr: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  const h = 1 / dpr;
  const y = snapToDevice(cssY, dpr);
  ctx.fillRect(cssX, y, cssW, h);
  ctx.restore();
}

function drawDevicePixelRectStroke(
  ctx: Ctx2D,
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number,
  dpr: number,
  color: string
): void {
  const t = 1 / dpr; // 1 device pixel thickness
  // Top
  drawDevicePixelHLine(ctx, cssX, cssY, cssW, dpr, color);
  // Bottom
  drawDevicePixelHLine(ctx, cssX, cssY + cssH - t, cssW, dpr, color);
  // Left
  drawDevicePixelVLine(ctx, cssX, cssY, cssH, dpr, color);
  // Right
  drawDevicePixelVLine(ctx, cssX + cssW - t, cssY, cssH, dpr, color);
}

function drawDevicePixelChecker(
  ctx: Ctx2D,
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number,
  dpr: number
): void {
  const px = 1 / dpr; // size of one device pixel in CSS units
  const cols = Math.max(1, Math.floor(cssW / px));
  const rows = Math.max(1, Math.floor(cssH / px));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const even = ((r + c) & 1) === 0;
      ctx.fillStyle = even ? "#000" : "#fff";
      ctx.fillRect(cssX + c * px, cssY + r * px, px, px);
    }
  }

  // Outline the checker
  drawDevicePixelRectStroke(ctx, cssX, cssY, cols * px, rows * px, dpr, "#000");
}

/* ----------------------------- Utilities ----------------------------------- */

function getDpr(): number {
  const gp = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof gp === "number" && isFinite(gp) && gp > 0 ? gp : 1;
}

/** Snap a CSS coordinate so that a 1/dpr-wide rect lands on device pixel boundaries. */
function snapToDevice(cssCoord: number, dpr: number): number {
  // Convert to device px → round → back to CSS px
  return Math.round(cssCoord * dpr) / dpr;
}

function clampPos(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function guessCssW(canvas: CanvasLike): number | undefined {
  if ("clientWidth" in canvas && typeof canvas.clientWidth === "number") {
    return canvas.clientWidth || undefined;
  }
  return undefined;
}
function guessCssH(canvas: CanvasLike): number | undefined {
  if ("clientHeight" in canvas && typeof canvas.clientHeight === "number") {
    return canvas.clientHeight || undefined;
  }
  return undefined;
}
