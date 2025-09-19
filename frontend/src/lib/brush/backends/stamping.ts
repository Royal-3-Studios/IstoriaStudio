// // FILE: src/lib/brush/backends/stamping.ts
// /**
//  * Stamping backend — dry media + inking (multi-track) v4
//  *
//  * Goals
//  *  - Graphite/charcoal style belly+tooth with good tips
//  *  - Optional split nibs (multi parallel tracks, fan/curvature/asymmetry)
//  *  - Taper/body controls: tip scales, min tip clamp, belly gain, uniformity, end bias
//  *  - Edge noise & dry fringe (optional)
//  *
//  * This backend reads the extended RenderOverrides introduced in engine.ts.
//  * It remains backwards-safe: if new knobs are not provided, defaults yield
//  * the previous single-track look.
//  */

// import type {
//   RenderOptions,
//   RenderOverrides,
//   RenderPathPoint,
// } from "@/lib/brush/engine";

// /* ============================== Math & RNG =============================== */

// const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// const clamp01 = (v: number) => clamp(v, 0, 1);
// const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// function makeRng(seed = 1) {
//   let s = seed >>> 0 || 1;
//   return () => {
//     s |= 0;
//     s = (s + 0x6d2b79f5) | 0;
//     let t = Math.imul(s ^ (s >>> 15), 1 | s);
//     t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
//     return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
//   };
// }

// /* ============================== Helpers ================================= */

// type SamplePoint = {
//   x: number;
//   y: number;
//   t: number; // 0..1 arclength
//   p: number; // pressure 0..1
//   v: number; // normalized speed (0 slow .. 1 fast)
// };

// /** Simple resampling with constant step; returns arclength t, pressure and speed. */
// function resamplePath(
//   pts: RenderPathPoint[],
//   stepPx: number,
//   speedSmoothMs = 30
// ): SamplePoint[] {
//   const out: SamplePoint[] = [];
//   if (!pts || pts.length < 2) return out;

//   // If timestamps don't exist, synthesize rough ones based on distance.
//   const times: number[] = new Array(pts.length).fill(0);
//   for (let i = 1; i < pts.length; i++) {
//     const dx = pts[i].x - pts[i - 1].x;
//     const dy = pts[i].y - pts[i - 1].y;
//     const L = Math.hypot(dx, dy);
//     // assume ~1px/ms baseline if no times provided
//     times[i] = times[i - 1] + Math.max(1, L);
//   }

//   const N = pts.length;
//   const segLen = new Array<number>(N).fill(0);
//   let total = 0;
//   for (let i = 1; i < N; i++) {
//     const dx = pts[i].x - pts[i - 1].x;
//     const dy = pts[i].y - pts[i - 1].y;
//     const L = Math.hypot(dx, dy);
//     segLen[i] = L;
//     total += L;
//   }
//   if (total <= 0) return out;

//   const prefix = new Array<number>(N).fill(0);
//   for (let i = 1; i < N; i++) prefix[i] = prefix[i - 1] + segLen[i];

//   function atArc(sArc: number) {
//     const s = clamp(sArc, 0, total);
//     let idx = 1;
//     while (idx < N && prefix[idx] < s) idx++;
//     const i1 = Math.max(1, idx);
//     const s0 = prefix[i1 - 1];
//     const L = segLen[i1];
//     const u = L > 0 ? (s - s0) / L : 0;

//     const a = pts[i1 - 1];
//     const b = pts[i1];

//     const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
//     const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
//     const p = lerp(ap, bp, u);

//     const ta = times[i1 - 1];
//     const tb = times[i1];
//     const dt = Math.max(1, tb - ta);
//     const v = clamp01((L / dt) * 2); // crude px/ms -> 0..1

//     return {
//       x: a.x + (b.x - a.x) * u,
//       y: a.y + (b.y - a.y) * u,
//       p,
//       v,
//     };
//   }

//   const step = clamp(stepPx, 0.3, 0.8);
//   const first = atArc(0);
//   out.push({ x: first.x, y: first.y, t: 0, p: first.p, v: first.v });

//   for (let s = step; s < total; s += step) {
//     const q = atArc(s);
//     out.push({ x: q.x, y: q.y, t: s / total, p: q.p, v: q.v });
//   }
//   const last = atArc(total);
//   out.push({ x: last.x, y: last.y, t: 1, p: last.p, v: last.v });

//   // Speed smoothing (simple box)
//   if (speedSmoothMs > 0 && out.length > 2) {
//     const k = Math.max(1, Math.round(speedSmoothMs / 8));
//     const tmp = out.map((s) => s.v);
//     for (let i = 0; i < out.length; i++) {
//       let acc = 0,
//         n = 0;
//       for (let j = i - k; j <= i + k; j++) {
//         if (j >= 0 && j < out.length) {
//           acc += tmp[j];
//           n++;
//         }
//       }
//       out[i].v = acc / n;
//     }
//   }

//   return out;
// }

// /** Normal (unit) from a->b */
// function segmentNormal(ax: number, ay: number, bx: number, by: number) {
//   const dx = bx - ax;
//   const dy = by - ay;
//   const L = Math.hypot(dx, dy) || 1;
//   const nx = -dy / L;
//   const ny = dx / L;
//   return { nx, ny, len: L };
// }

// /* ============================== Tiles / Textures ========================= */

// function clampTileSizePx(sz: number | undefined, min = 2, max = 512) {
//   const n = Number.isFinite(sz as number) ? Math.floor(sz as number) : 0;
//   return Math.max(min, Math.min(max, n));
// }

// /** Near-white speckle for multiply compositing (graphite sheen). */
// function makeMultiplyTile(seed: number, size = 24, alpha = 0.16) {
//   const rand = makeRng(seed ^ 0x5151);
//   const c = document.createElement("canvas");
//   c.width = c.height = Math.max(2, Math.floor(size));
//   const x = c.getContext("2d")!;
//   const img = x.createImageData(c.width, c.height);
//   for (let i = 0; i < img.data.length; i += 4) {
//     const v = 215 + rand() * 40;
//     img.data[i + 0] = v;
//     img.data[i + 1] = v;
//     img.data[i + 2] = v;
//     img.data[i + 3] = Math.round(255 * alpha);
//   }
//   x.putImageData(img, 0, 0);
//   return x.createPattern(c, "repeat")!;
// }

// /** Soft alpha noise used to subtly vary hole density along stroke. */
// function makeAlphaNoiseTile(
//   seed: number,
//   size = 28,
//   bias = 0.6,
//   contrast = 1.0
// ) {
//   const rand = makeRng(seed ^ 0xa11a);
//   const c = document.createElement("canvas");
//   c.width = c.height = clampTileSizePx(size);
//   const x = c.getContext("2d")!;
//   const img = x.createImageData(c.width, c.height);
//   for (let i = 0; i < img.data.length; i += 4) {
//     let v = rand();
//     v = Math.pow(v, contrast);
//     const a = Math.max(0, Math.min(1, (v - (1 - bias)) / bias));
//     img.data[i + 3] = Math.round(255 * a);
//   }
//   x.putImageData(img, 0, 0);
//   return x.createPattern(c, "repeat")!;
// }

// /** Opaque dot tile for hard paper-tooth cutouts (destination-out). */
// function makeHoleDotTile(
//   seed: number,
//   sizePx: number,
//   density = 0.14, // 0..~0.4
//   rMin = 0.45,
//   rMax = 1.25
// ): CanvasPattern {
//   const size = clampTileSizePx(sizePx);
//   const rnd = makeRng(seed ^ 0x6b6b);
//   const c = document.createElement("canvas");
//   c.width = c.height = size;
//   const x = c.getContext("2d", { alpha: true })!;
//   x.clearRect(0, 0, size, size);

//   const avgR = (rMin + rMax) * 0.5;
//   const dots = Math.max(
//     1,
//     Math.round((size * size * density) / (Math.PI * avgR * avgR))
//   );

//   x.fillStyle = "#fff";
//   for (let i = 0; i < dots; i++) {
//     const r = rMin + rnd() * (rMax - rMin);
//     const px = (rnd() * size) | 0;
//     const py = (rnd() * size) | 0;
//     x.beginPath();
//     x.arc(px + 0.5, py + 0.5, r, 0, Math.PI * 2);
//     x.fill();
//   }
//   return x.createPattern(c, "repeat")!;
// }

// /** Fill with a pattern but randomize the phase so tiling seams don’t align. */
// function fillPatternRandomPhase(
//   ctx: CanvasRenderingContext2D,
//   pat: CanvasPattern,
//   w: number,
//   h: number,
//   rand: () => number
// ) {
//   const ox = Math.floor((rand() - 0.5) * 128);
//   const oy = Math.floor((rand() - 0.5) * 128);
//   ctx.save();
//   ctx.translate(ox, oy);
//   ctx.fillStyle = pat;
//   ctx.fillRect(-ox, -oy, w + Math.abs(ox) * 2, h + Math.abs(oy) * 2);
//   ctx.restore();
// }

// /* ============================== Taper / Width Maps ======================= */

// /** Map pressure to width & flow multipliers */
// function pressureToWidthScale(p01: number) {
//   return 0.85 + Math.pow(clamp01(p01), 0.65) * 0.45;
// }
// function pressureToFlowScale(p01: number) {
//   return 0.4 + Math.pow(clamp01(p01), 1.15) * 0.6;
// }

// /** Thickness profile over t ∈ [0,1] with user controls. */
// function thicknessAt(
//   t: number,
//   bellyGain: number,
//   tipStart: number,
//   tipEnd: number,
//   tipMinPx: number,
//   uniformity: number,
//   endBias: number,
//   tipRoundness: number,
//   curve: number
// ) {
//   // Base symmetric bell that reaches 1 in the center.
//   // Control curve (gamma-like) and uniformity.
//   const x = t;
//   const d = 1 - Math.abs(1 - 2 * x); // 0 at ends, 1 at center
//   const shaped = Math.pow(d, clamp(curve, 0.2, 3));
//   const uniform = mix(shaped, 1, clamp01(uniformity));

//   // Bias: shift mass toward start or end.
//   const bias = clamp(endBias, -1, 1);
//   const biased =
//     bias >= 0
//       ? mix(uniform, Math.pow(x, 0.5), bias)
//       : mix(uniform, Math.pow(1 - x, 0.5), -bias);

//   // Apply belly gain.
//   let body = clamp01(biased * bellyGain);

//   // Tip scale — narrowing both ends. We model as multiplying an ease-out/in near tips.
//   const sEase =
//     1 - Math.pow(clamp01(1 - x), mix(1, 2.4, clamp01(1 - tipRoundness)));
//   const eEase =
//     1 - Math.pow(clamp01(x), mix(1, 2.4, clamp01(1 - tipRoundness)));
//   const sMul = mix(1, clamp01(1 - tipStart), sEase);
//   const eMul = mix(1, clamp01(1 - tipEnd), eEase);

//   body *= sMul * eMul;

//   // Minimum px clamp is enforced by caller when converting to lineWidth.
//   return clamp01(body);
// }

// /* ============================== Main Render ============================== */

// export default function drawStamping(
//   ctx: CanvasRenderingContext2D,
//   options: RenderOptions
// ) {
//   const pts = options.path ?? [];
//   if (pts.length < 2) return;

//   const ov = (options.engine.overrides ?? {}) as Required<RenderOverrides>;
//   const baseFlow01 = clamp01((ov.flow ?? 64) / 100);

//   const baseSizePx = Math.max(
//     1,
//     options.baseSizePx * (options.engine.shape?.sizeScale ?? 1)
//   );

//   const seed = (options.seed ?? 42) & 0xffffffff;
//   const rand = makeRng(seed ^ 0x1234);

//   // Honor UI spacing to pick resampling step
//   const uiSpacing =
//     options.engine.strokePath?.spacing ?? options.engine.overrides?.spacing;
//   const spacingFrac = (() => {
//     const raw = typeof uiSpacing === "number" ? uiSpacing : 3;
//     const frac = raw > 1 ? raw / 100 : raw;
//     return clamp(frac, 0.02, 0.08);
//   })();
//   const stepPx = clamp(baseSizePx * spacingFrac, 0.3, 0.8);

//   const samples = resamplePath(pts, stepPx, ov.speedSmoothingMs ?? 30);
//   if (samples.length < 2) return;

//   /* ------------------ Derived helpers from overrides ------------------ */

//   const shapeType = options.engine.shape?.type;
//   const grainKind = options.engine.grain?.kind;
//   const isCharcoal =
//     shapeType === "charcoal" ||
//     (grainKind === "noise" && shapeType !== "round");

//   const tipStart = clamp01(ov.tipScaleStart ?? 0.85);
//   const tipEnd = clamp01(ov.tipScaleEnd ?? 0.85);
//   const tipMinPx = Math.max(0, ov.tipMinPx ?? 0);
//   const bellyGain = clamp(ov.bellyGain ?? 1.0, 0.5, 2.0);
//   const endBias = clamp(ov.endBias ?? 0, -1, 1);
//   const uniformity = clamp01(ov.uniformity ?? 0);
//   const tipRoundness = clamp01(ov.tipRoundness ?? 0);
//   const curve = clamp(ov.thicknessCurve ?? 1.0, 0.2, 3);

//   // Split nibs
//   const splitCount = Math.max(1, Math.round(ov.splitCount ?? 1));
//   const splitSpacing = ov.splitSpacing ?? 0;
//   const splitJ = clamp01((ov.splitSpacingJitter ?? 0) / 100);
//   const splitCurve = clamp(ov.splitCurvature ?? 0, -1, 1);
//   const splitAsym = clamp(ov.splitAsymmetry ?? 0, -1, 1);
//   const splitScatter = ov.splitScatter ?? 0;
//   const splitAngle = (ov.splitAngle ?? 0) * (Math.PI / 180);

//   const pressToSplit = clamp01(ov.pressureToSplitSpacing ?? 0);
//   const tiltFan = (ov.tiltToSplitFan ?? 0) * (Math.PI / 180);

//   // Speed dynamics -> width/flow
//   const speedToWidth = ov.speedToWidth ?? 0; // -1..+1
//   const speedToFlow = ov.speedToFlow ?? 0; // -1..+1

//   /* -------------------- INK MODE SHORT-CIRCUIT ------------------------- */
//   const renderMode = options.engine.rendering?.mode;
//   const isInkMode =
//     (renderMode === "marker" || renderMode === "blended") &&
//     (ov.toothBody ?? 0) <= 0.001 &&
//     (ov.toothFlank ?? 0) <= 0.001 &&
//     (ov.edgeNoiseStrength ?? 0) <= 0.001 &&
//     (ov.rimMode ?? "off") === "off" &&
//     (ov.grainKind ?? options.engine.grain?.kind ?? "none") === "none" &&
//     splitCount === 1;

//   if (isInkMode) {
//     // Crisp, solid stroke — no multiply, no perforations, no rim.
//     ctx.save();
//     ctx.globalCompositeOperation = "source-over";
//     ctx.strokeStyle = options.color ?? "#000";
//     ctx.lineCap = "round";
//     ctx.lineJoin = "round";

//     for (let i = 1; i < samples.length; i++) {
//       const a = samples[i - 1];
//       const b = samples[i];

//       const tMid = (a.t + b.t) * 0.5;
//       const pMid = (a.p + b.p) * 0.5;
//       const vMid = (a.v + b.v) * 0.5;

//       // Simplified thickness: mostly uniform, with tip shaping
//       const body = thicknessAt(
//         tMid,
//         Math.max(0.9, bellyGain),
//         tipStart,
//         tipEnd,
//         tipMinPx,
//         Math.max(0.85, uniformity),
//         endBias,
//         tipRoundness,
//         curve
//       );

//       const widthBase =
//         baseSizePx *
//         (0.92 + 0.08 * pressureToWidthScale(pMid)) *
//         (0.8 + 0.2 * body);

//       const wSpeed = 1 + (speedToWidth ?? 0) * (vMid * 2 - 1);
//       const segWidth = Math.max(tipMinPx, widthBase * wSpeed);

//       // Alpha: mostly constant; tiny pressure influence
//       const alphaBase =
//         baseFlow01 *
//         (0.9 + 0.1 * pressureToFlowScale(pMid)) *
//         (0.85 + 0.15 * body);
//       const aSpeed = clamp01(
//         alphaBase * (1 + (speedToFlow ?? 0) * (vMid * 2 - 1))
//       );

//       ctx.lineWidth = Math.max(0.5, segWidth);
//       ctx.globalAlpha = aSpeed;

//       ctx.beginPath();
//       ctx.moveTo(a.x, a.y);
//       ctx.lineTo(b.x, b.y);
//       ctx.stroke();
//     }
//     ctx.restore();
//     return; // done — do not run graphite pipeline below
//   }

//   /* ======================== GRAPHITE/CHARCOAL PIPELINE =================== */

//   const W = Math.max(1, Math.floor(options.width));
//   const H = Math.max(1, Math.floor(options.height));

//   const mask = document.createElement("canvas");
//   mask.width = W;
//   mask.height = H;
//   const mx = mask.getContext("2d", { alpha: true })!;
//   mx.lineCap = "round";
//   mx.lineJoin = "round";

//   function strokeTrack(
//     globalAlphaScale: number,
//     jitterSeed: number,
//     trackIndex: number
//   ) {
//     const r = makeRng(seed ^ jitterSeed);
//     const baseSep = splitSpacing * (trackIndex - (splitCount - 1) / 2);
//     const jitterSep = baseSep * (1 + (r() * 2 - 1) * splitJ);

//     mx.beginPath();
//     for (let i = 1; i < samples.length; i++) {
//       const a = samples[i - 1];
//       const b = samples[i];
//       const { nx, ny } = segmentNormal(a.x, a.y, b.x, b.y);
//       const tMid = (a.t + b.t) * 0.5;
//       const pMid = (a.p + b.p) * 0.5;
//       const vMid = (a.v + b.v) * 0.5;

//       const pressureSep = 1 + pressToSplit * (pMid - 0.5) * 2;
//       const curvature = splitCurve * (2 * tMid - 1);
//       const asym = splitAsym;
//       const localSep =
//         (jitterSep * pressureSep + asym * baseSep) * (1 + curvature);

//       const fanAngle = splitAngle + tiltFan * 0;
//       const rx = Math.cos(fanAngle) * nx - Math.sin(fanAngle) * ny;
//       const ry = Math.sin(fanAngle) * nx + Math.cos(fanAngle) * ny;

//       const sc = splitScatter > 0 ? (r() * 2 - 1) * splitScatter : 0;

//       const body = thicknessAt(
//         tMid,
//         bellyGain,
//         tipStart,
//         tipEnd,
//         tipMinPx,
//         uniformity,
//         endBias,
//         tipRoundness,
//         curve
//       );

//       const widthBase =
//         baseSizePx * pressureToWidthScale(pMid) * (0.62 + 0.38 * body);

//       const wSpeed = 1 + (speedToWidth ?? 0) * (vMid * 2 - 1);
//       const segWidth = Math.max(tipMinPx, widthBase * wSpeed);

//       const alphaBase =
//         baseFlow01 * pressureToFlowScale(pMid) * (0.55 + 0.45 * body);

//       const aSpeed = clamp01(
//         alphaBase * (1 + (speedToFlow ?? 0) * (vMid * 2 - 1))
//       );

//       mx.lineWidth = Math.max(0.5, segWidth);
//       mx.globalAlpha = clamp01(aSpeed * globalAlphaScale);

//       const ax = a.x + rx * localSep + nx * sc;
//       const ay = a.y + ry * localSep + ny * sc;
//       const bx = b.x + rx * localSep + nx * sc;
//       const by = b.y + ry * localSep + ny * sc;

//       if (i === 1) mx.moveTo(ax, ay);
//       mx.lineTo(bx, by);
//     }
//     mx.stroke();
//   }

//   /* -------------------- Composite mask into destination (INK-SAFE) -------- */
//   {
//     const W = Math.max(1, Math.floor(options.width));
//     const H = Math.max(1, Math.floor(options.height));

//     // 1) Create a solid-ink layer using the mask as alpha
//     const inkLayer = document.createElement("canvas");
//     inkLayer.width = W;
//     inkLayer.height = H;
//     const ix = inkLayer.getContext("2d", { alpha: true })!;

//     // Draw mask into ink layer
//     ix.drawImage(mask, 0, 0);

//     // Keep only the mask’s coverage and fill it with the brush color
//     ix.globalCompositeOperation = "source-in";
//     ix.fillStyle = options.color ?? "#000000";
//     ix.fillRect(0, 0, W, H);

//     // 2) Paint solid stroke into the destination with normal compositing
//     ctx.save();
//     ctx.globalCompositeOperation = "source-over";
//     ctx.drawImage(inkLayer, 0, 0);
//     ctx.restore();
//   }

//   // Draw all tracks into mask
//   mx.strokeStyle = "#000";
//   for (let k = 0; k < splitCount; k++) {
//     strokeTrack(1.0, 0x1000 + k * 97, k);
//   }

//   // Edge carve to remove faint halo and sharpen tips
//   {
//     const blurred = document.createElement("canvas");
//     blurred.width = W;
//     blurred.height = H;
//     const bx = blurred.getContext("2d", { alpha: true })!;
//     bx.filter = "blur(0.35px)";
//     bx.drawImage(mask, 0, 0);
//     bx.filter = "none";
//     bx.globalCompositeOperation = "destination-out";
//     bx.drawImage(mask, 0, 0);

//     mx.save();
//     mx.globalCompositeOperation = "destination-out";
//     mx.globalAlpha = 0.22;
//     mx.drawImage(blurred, 0, 0);
//     mx.restore();
//   }

//   /* ---- Paper tooth perforation (multi-scale + random phase) ---- */
//   {
//     // Detect “graphite-like” (glazed + paper) vs charcoal
//     const mode = options.engine.rendering?.mode ?? "glazed";
//     const kind = options.engine.grain?.kind ?? "none";
//     const isGraphite = mode === "glazed" && kind === "paper";

//     // Effective tile size
//     const effectiveTile = clampTileSizePx(
//       ov.toothScale && ov.toothScale > 1
//         ? ov.toothScale
//         : Math.round(baseSizePx * (isCharcoal ? 1.6 : 1.45)),
//       4,
//       256
//     );

//     // Key fix #1: belly lighter, flanks lively
//     const bodyDensity = isCharcoal ? 0.2 : 0.08;
//     const flankDensity = isCharcoal ? 0.32 : 0.16;

//     const bodyDepthRaw = clamp01(ov.toothBody ?? (isCharcoal ? 0.7 : 0.35));
//     const flankDepthRaw = clamp01(ov.toothFlank ?? (isCharcoal ? 0.9 : 0.65));
//     const bodyDepth = isGraphite ? Math.min(bodyDepthRaw, 0.42) : bodyDepthRaw;
//     const flankDepth = Math.min(flankDepthRaw, 0.85);

//     const noiseTile = makeAlphaNoiseTile(
//       seed ^ 0x77aa,
//       Math.max(8, Math.round(effectiveTile * 0.9)),
//       0.62,
//       1
//     );

//     // Build gates
//     const bodyGate = document.createElement("canvas");
//     bodyGate.width = W;
//     bodyGate.height = H;
//     const bg = bodyGate.getContext("2d", { alpha: true })!;
//     bg.strokeStyle = "#fff";
//     bg.lineCap = "round";
//     bg.lineJoin = "round";

//     const flankGate = document.createElement("canvas");
//     flankGate.width = W;
//     flankGate.height = H;
//     const fg = flankGate.getContext("2d", { alpha: true })!;
//     fg.strokeStyle = "#fff";
//     fg.lineCap = "round";
//     fg.lineJoin = "round";

//     for (let i = 1; i < samples.length; i++) {
//       const a = samples[i - 1];
//       const b = samples[i];
//       const tMid = (a.t + b.t) * 0.5;
//       const pMid = (a.p + b.p) * 0.5;

//       const body01 = thicknessAt(
//         tMid,
//         bellyGain,
//         tipStart,
//         tipEnd,
//         tipMinPx,
//         uniformity,
//         endBias,
//         tipRoundness,
//         curve
//       );

//       // Key fix #2: narrower belly gate
//       const innerW =
//         baseSizePx * pressureToWidthScale(pMid) * (0.26 + 0.42 * body01);
//       bg.lineWidth = Math.max(0.75, innerW);
//       bg.globalAlpha = 0.55;
//       bg.beginPath();
//       bg.moveTo(a.x, a.y);
//       bg.lineTo(b.x, b.y);
//       bg.stroke();

//       // Key fix #3: slightly wider flank gate
//       const flankW =
//         baseSizePx * pressureToWidthScale(pMid) * (0.22 + 0.5 * body01);
//       fg.lineWidth = Math.max(0.5, flankW);
//       fg.globalAlpha = 0.9;
//       fg.beginPath();
//       fg.moveTo(a.x, a.y);
//       fg.lineTo(b.x, b.y);
//       fg.stroke();
//     }

//     // Body holes
//     const bodyHoles = document.createElement("canvas");
//     bodyHoles.width = W;
//     bodyHoles.height = H;
//     const bhx = bodyHoles.getContext("2d", { alpha: true })!;

//     const bodyTileA = makeHoleDotTile(
//       seed ^ 0x1144,
//       effectiveTile,
//       bodyDensity
//     );
//     const bodyTileB = makeHoleDotTile(
//       seed ^ 0x3344,
//       Math.max(4, Math.round(effectiveTile * 0.6)),
//       bodyDensity * 0.75
//     );

//     fillPatternRandomPhase(bhx, bodyTileA, W, H, rand);
//     bhx.globalAlpha = 0.7;
//     fillPatternRandomPhase(bhx, bodyTileB, W, H, rand);
//     bhx.globalAlpha = 1;
//     bhx.globalCompositeOperation = "destination-in";
//     bhx.fillStyle = noiseTile;
//     bhx.fillRect(0, 0, W, H);
//     bhx.drawImage(bodyGate, 0, 0);

//     mx.save();
//     mx.globalCompositeOperation = "destination-out";
//     mx.globalAlpha = bodyDepth;
//     mx.drawImage(bodyHoles, 0, 0);
//     mx.restore();

//     // Flank holes
//     const flankHoles = document.createElement("canvas");
//     flankHoles.width = W;
//     flankHoles.height = H;
//     const fhx = flankHoles.getContext("2d", { alpha: true })!;

//     const flankTileA = makeHoleDotTile(
//       seed ^ 0x2288,
//       effectiveTile,
//       flankDensity
//     );
//     const flankTileB = makeHoleDotTile(
//       seed ^ 0x5588,
//       Math.max(4, Math.round(effectiveTile * 0.7)),
//       flankDensity * 0.85
//     );

//     fillPatternRandomPhase(fhx, flankTileA, W, H, rand);
//     fhx.globalAlpha = 0.8;
//     fillPatternRandomPhase(fhx, flankTileB, W, H, rand);
//     fhx.globalAlpha = 1;
//     fhx.globalCompositeOperation = "destination-in";
//     fhx.drawImage(flankGate, 0, 0);

//     mx.save();
//     mx.globalCompositeOperation = "destination-out";
//     mx.globalAlpha = flankDepth;
//     mx.drawImage(fhx.canvas, 0, 0);
//     mx.restore();
//   }

//   /* -------------------- Composite mask into destination ------------------ */
//   ctx.save();
//   ctx.globalCompositeOperation = "multiply";
//   ctx.drawImage(mask, 0, 0);
//   ctx.restore();

//   /* -------------------- Inner-belly grain (respects holes) --------------- */
//   {
//     const inner = document.createElement("canvas");
//     inner.width = W;
//     inner.height = H;
//     const ix = inner.getContext("2d", { alpha: true })!;
//     ix.lineCap = "round";
//     ix.lineJoin = "round";
//     ix.strokeStyle = "#fff";

//     for (let i = 1; i < samples.length; i++) {
//       const a = samples[i - 1];
//       const b = samples[i];
//       const tMid = (a.t + b.t) * 0.5;
//       const pMid = (a.p + b.p) * 0.5;

//       const body01 = thicknessAt(
//         tMid,
//         bellyGain,
//         tipStart,
//         tipEnd,
//         tipMinPx,
//         uniformity,
//         endBias,
//         tipRoundness,
//         curve
//       );
//       const innerW =
//         baseSizePx * pressureToWidthScale(pMid) * (0.28 + 0.5 * body01);

//       ix.lineWidth = Math.max(1, innerW);
//       ix.globalAlpha = 0.7;
//       ix.beginPath();
//       ix.moveTo(a.x, a.y);
//       ix.lineTo(b.x, b.y);
//       ix.stroke();
//     }

//     const grain = document.createElement("canvas");
//     grain.width = W;
//     grain.height = H;
//     const gx = grain.getContext("2d", { alpha: true })!;

//     const tileA = makeMultiplyTile(seed ^ 0x0999, 24, 0.17);
//     const tileB = makeMultiplyTile(seed ^ 0x2ab3, 20, 0.14);

//     gx.fillStyle = tileA;
//     gx.fillRect(0, 0, W, H);
//     gx.globalAlpha = 0.85;
//     gx.fillStyle = tileB;
//     gx.fillRect(0, 0, W, H);

//     gx.globalCompositeOperation = "destination-in";
//     gx.drawImage(inner, 0, 0);
//     gx.drawImage(mask, 0, 0); // respects perforations

//     ctx.save();
//     ctx.globalCompositeOperation = "multiply";
//     ctx.globalAlpha = 0.55;
//     ctx.drawImage(grain, 0, 0);
//     ctx.restore();
//   }

//   /* -------------------- Optional tip rim (screen) ------------------------ */
//   {
//     const rimMode = ov.rimMode ?? "auto";
//     const useRim = rimMode === "on" || (rimMode === "auto" && !isCharcoal);
//     if (useRim) {
//       const rim = document.createElement("canvas");
//       rim.width = W;
//       rim.height = H;
//       const rx = rim.getContext("2d", { alpha: true })!;
//       rx.lineCap = "round";
//       rx.lineJoin = "round";
//       rx.strokeStyle = "#fff";

//       for (let i = 1; i < samples.length; i++) {
//         const a = samples[i - 1];
//         const b = samples[i];
//         const tMid = (a.t + b.t) * 0.5;
//         const pMid = (a.p + b.p) * 0.5;

//         const body01 = thicknessAt(
//           tMid,
//           bellyGain,
//           tipStart,
//           tipEnd,
//           tipMinPx,
//           uniformity,
//           endBias,
//           tipRoundness,
//           curve
//         );
//         const w =
//           baseSizePx * pressureToWidthScale(pMid) * (0.12 + 0.25 * body01);
//         rx.lineWidth = Math.max(1, w);
//         rx.globalAlpha = Math.pow(1 - body01, 0.9) * (ov.rimStrength ?? 0.12);

//         rx.beginPath();
//         rx.moveTo(a.x, a.y);
//         rx.lineTo(b.x, b.y);
//         rx.stroke();
//       }

//       ctx.save();
//       ctx.globalCompositeOperation = "screen";
//       ctx.drawImage(rim, 0, 0);
//       ctx.restore();
//     }
//   }

//   /* -------------------- Optional edge noise / dry fringe ----------------- */
//   if ((ov.edgeNoiseStrength ?? 0) > 0) {
//     const noise = document.createElement("canvas");
//     noise.width = W;
//     noise.height = H;
//     const nx = noise.getContext("2d", { alpha: true })!;
//     // Build a quick high-contrast noise
//     const t = document.createElement("canvas");
//     t.width = t.height = Math.max(2, Math.round(ov.edgeNoiseScale ?? 8));
//     const tx = t.getContext("2d")!;
//     const rnd = makeRng(seed ^ 0x7eed);
//     const img = tx.createImageData(t.width, t.height);
//     for (let i = 0; i < img.data.length; i += 4) {
//       const v = rnd() * 255;
//       img.data[i + 3] = v;
//     }
//     tx.putImageData(img, 0, 0);
//     const pat = nx.createPattern(t, "repeat")!;
//     nx.fillStyle = pat;
//     nx.fillRect(0, 0, W, H);

//     // Keep only a thin band along the mask edges
//     const band = document.createElement("canvas");
//     band.width = W;
//     band.height = H;
//     const bx = band.getContext("2d", { alpha: true })!;
//     bx.drawImage(mask, 0, 0);
//     bx.globalCompositeOperation = "destination-out";
//     bx.filter = "blur(1.2px)";
//     bx.drawImage(mask, 0, 0);
//     bx.filter = "none";

//     nx.globalCompositeOperation = "destination-in";
//     nx.drawImage(band, 0, 0);

//     ctx.save();
//     ctx.globalCompositeOperation = "multiply";
//     ctx.globalAlpha = clamp01(ov.edgeNoiseStrength ?? 0.4);
//     ctx.drawImage(noise, 0, 0);
//     ctx.restore();
//   }
// }

// export const backendId = "stamping" as const;
// FILE: src/lib/brush/backends/stamping.ts
/**
 * Graphite & Charcoal — Stamping v34+
 * - Spacing-aware resample + unified per-segment gates
 * - Long, gentle tapers with crisp edge carve
 * - Paper-tooth perforation via multi-scale dot tiles + random phase (de-tiling)
 * - Inner-belly grain respects post-cut stroke alpha (holes remain holes)
 * - Faint tip rim for pencils (auto; off for charcoals)
 *
 * Added knobs (from overrides):
 *  tipScaleStart 0..1  // how much START tip narrows (0=none, 1=sharp)
 *  tipScaleEnd   0..1  // how much END tip narrows (0=none, 1=sharp)
 *  tipMinPx        px  // minimum tip width clamp (0 = no clamp)
 *  bellyGain    0.5..2 // multiplies belly thickness (1=neutral)
 *  endBias       -1..1 // fattens start(-) or end(+) side
 *  uniformity    0..1  // 0=normal, 1=uniform marker-like thickness
 */

import type {
  RenderOptions,
  RenderOverrides,
  RenderPathPoint,
} from "@/lib/brush/engine";

/* ============================== Math & RNG =============================== */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================== Tiles =================================== */

function clampTileSizePx(sz: number | undefined, min = 2, max = 512) {
  const n = Number.isFinite(sz as number) ? Math.floor(sz as number) : 0;
  return Math.max(min, Math.min(max, n));
}

/** Near-white speckle for multiply compositing (graphite sheen). */
function makeMultiplyTile(seed: number, size = 24, alpha = 0.16) {
  const rand = makeRng(seed ^ 0x5151);
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(2, Math.floor(size));
  const x = c.getContext("2d")!;
  const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 215 + rand() * 40;
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(255 * alpha);
  }
  x.putImageData(img, 0, 0);
  return x.createPattern(c, "repeat")!;
}

/** Soft alpha noise used to subtly vary hole density along stroke. */
function makeAlphaNoiseTile(
  seed: number,
  size = 28,
  bias = 0.6,
  contrast = 1.0
) {
  const rand = makeRng(seed ^ 0xa11a);
  const c = document.createElement("canvas");
  c.width = c.height = clampTileSizePx(size);
  const x = c.getContext("2d")!;
  const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    let v = rand();
    v = Math.pow(v, contrast);
    const a = Math.max(0, Math.min(1, (v - (1 - bias)) / bias));
    img.data[i + 0] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    img.data[i + 3] = Math.round(255 * a);
  }
  x.putImageData(img, 0, 0);
  return x.createPattern(c, "repeat")!;
}

/** Opaque dot tile for hard paper-tooth cutouts (destination-out). */
function makeHoleDotTile(
  seed: number,
  sizePx: number,
  density = 0.14, // 0..~0.4
  rMin = 0.45,
  rMax = 1.25
): CanvasPattern {
  const size = clampTileSizePx(sizePx);
  const rnd = makeRng(seed ^ 0x6b6b);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d", { alpha: true })!;
  x.clearRect(0, 0, size, size);

  const avgR = (rMin + rMax) * 0.5;
  const dots = Math.max(
    1,
    Math.round((size * size * density) / (Math.PI * avgR * avgR))
  );

  x.fillStyle = "#fff";
  for (let i = 0; i < dots; i++) {
    const r = rMin + rnd() * (rMax - rMin);
    const px = (rnd() * size) | 0;
    const py = (rnd() * size) | 0;
    x.beginPath();
    x.arc(px + 0.5, py + 0.5, r, 0, Math.PI * 2);
    x.fill();
  }
  return x.createPattern(c, "repeat")!;
}

/** Fill with a pattern but randomize the phase so tiling seams don’t align. */
function fillPatternWithRandomPhase(
  ctx: CanvasRenderingContext2D,
  pat: CanvasPattern,
  w: number,
  h: number,
  rand: () => number
) {
  // Random sub-tile translation (± ~tile span) — keeps the fill in-bounds.
  const ox = Math.floor((rand() - 0.5) * 128);
  const oy = Math.floor((rand() - 0.5) * 128);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(-ox, -oy, w + Math.abs(ox) * 2, h + Math.abs(oy) * 2);
  ctx.restore();
}

/* ============================== Spacing & Taper =========================== */

function resolveSpacingFraction(uiSpacing?: number, fallbackPct = 3): number {
  const raw = typeof uiSpacing === "number" ? uiSpacing : fallbackPct;
  const frac = raw > 1 ? raw / 100 : raw;
  return Math.max(0.02, Math.min(0.08, frac));
}

const EDGE_WINDOW_FRACTION = 0.42;

function bellyProgress01(tNorm: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const d = Math.min(tNorm, 1 - tNorm);
  return clamp01(d / edgeFrac);
}

function softTipMask01(tNorm: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const p = bellyProgress01(tNorm, edgeFrac);
  const exponent = 2.7;
  return p < 1 ? Math.pow(p, exponent) : 1;
}

function widthEndSqueeze(tNorm: number) {
  const a = softTipMask01(tNorm);
  return 0.84 + 0.12 * a;
}

function bellyAlphaDampFromProgress(progress: number) {
  return 1 - 0.25 * Math.pow(progress, 1.7);
}

function highPressureDamp(p01: number) {
  const q = clamp01(p01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}

const TIP_CULL_RADIUS_PX = 0;

/* ---- NEW: tip/body shaping helpers ------------------------------------- */

function tipBlend(tNorm: number, startAmt: number, endAmt: number) {
  // 0 at very ends, 1 in the belly
  const a = softTipMask01(tNorm); // 0→1
  // strength near each end (fade toward the center)
  const towardStart = 1 - Math.min(1, tNorm * 2); // 1 at start → 0 mid
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2); // 1 at end → 0 mid
  const tipAmt = startAmt * towardStart + endAmt * towardEnd; // 0..2-ish
  // shrink more near tips; preserve belly
  return 1 - tipAmt + tipAmt * a;
}

function applyEndBias(width: number, tNorm: number, bias: number) {
  // bias ∈ [-1,1]; negative fattens the start, positive fattens the end
  const k = (tNorm - 0.5) * 2; // -1 at start, +1 at end
  return width * (1 + 0.28 * bias * k);
}

function applyUniformity(width: number, belly01: number, u: number) {
  // Pull width toward a constant value as u→1 (reduces belly contrast)
  // Scale belly deviation down relative to your base body term (0.31 * belly^0.75)
  const dev = 0.31 * Math.pow(belly01, 0.75);
  const devScaled = dev * (1 - u);
  // Replace the dev by devScaled while keeping proportional width
  const factor = dev > 0 ? devScaled / dev : 1;
  return width * factor;
}

/* ============================== Pressure Maps ============================ */

function pressureToWidthScale(p01: number) {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}
function pressureToFlowScale(p01: number) {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}

/* ============================== Resampling =============================== */

type SamplePoint = { x: number; y: number; t: number; p: number };

function resamplePath(
  points: RenderPathPoint[],
  stepPx: number
): SamplePoint[] {
  const out: SamplePoint[] = [];
  if (!points || points.length < 2) return out;

  const N = points.length;
  const segLen = new Array<number>(N).fill(0);
  let total = 0;
  for (let i = 1; i < N; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const L = Math.hypot(dx, dy);
    segLen[i] = L;
    total += L;
  }
  if (total <= 0) return out;

  const prefix = new Array<number>(N).fill(0);
  for (let i = 1; i < N; i++) prefix[i] = prefix[i - 1] + segLen[i];

  function posAt(sArc: number) {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < N && prefix[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const prevS = prefix[i0 - 1];
    const L = segLen[i0];
    const u = L > 0 ? (s - prevS) / L : 0;

    const a = points[i0 - 1];
    const b = points[i0];
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = lerp(ap, bp, u);

    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p };
  }

  const first = posAt(0);
  out.push({ x: first.x, y: first.y, t: 0, p: first.p });

  const step = Math.max(0.3, Math.min(0.75, stepPx));
  for (let s = step; s < total; s += step) {
    const p = posAt(s);
    out.push({ x: p.x, y: p.y, t: s / total, p: p.p });
  }
  const last = posAt(total);
  out.push({ x: last.x, y: last.y, t: 1, p: last.p });

  return out;
}

/* ============================== Render ================================== */

export default function drawStamping(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions
) {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Required<RenderOverrides>;
  const baseFlow01 = clamp01((overrides.flow ?? 64) / 100);

  const baseSizePx = Math.max(
    1,
    options.baseSizePx * (options.engine.shape?.sizeScale ?? 1)
  );

  const seed = (options.seed ?? 42) & 0xffffffff;
  const rand = makeRng(seed ^ 0x1234);

  // honor UI spacing
  const uiSpacing =
    options.engine.strokePath?.spacing ?? options.engine.overrides?.spacing;
  const spacingFrac = resolveSpacingFraction(uiSpacing, 3);
  const resampleStepPx = Math.max(
    0.3,
    Math.min(0.75, baseSizePx * spacingFrac)
  );

  const samples = resamplePath(pts, resampleStepPx);
  if (samples.length < 2) return;

  type Gate = {
    tMid: number;
    bellyProgress: number;
    alphaProgress: number;
    midPressure: number;
  };
  const gates: Gate[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const tMid = (a.t + b.t) * 0.5;
    gates.push({
      tMid,
      bellyProgress: bellyProgress01(tMid),
      alphaProgress: softTipMask01(tMid),
      midPressure: (a.p + b.p) * 0.5,
    });
  }

  const shapeType = options.engine.shape?.type;
  const grainKind = options.engine.grain?.kind;
  const isCharcoal =
    shapeType === "charcoal" ||
    (grainKind === "noise" && shapeType !== "round");

  // NEW knobs (with safe clamps)
  const tipStart = clamp01(overrides.tipScaleStart ?? 0.85);
  const tipEnd = clamp01(overrides.tipScaleEnd ?? 0.85);
  const tipMinPx = Math.max(0, overrides.tipMinPx ?? 0);
  const bellyGain = Math.max(0.5, overrides.bellyGain ?? 1.0);
  const endBias = Math.max(-1, Math.min(1, overrides.endBias ?? 0));
  const uniformity = clamp01(overrides.uniformity ?? 0);

  const ovAny = overrides as unknown as {
    toothBody?: number;
    toothFlank?: number;
    toothScale?: number;
    rimMode?: "auto" | "on" | "off";
    rimStrength?: number;
    bgIsLight?: boolean;
  };

  /* -------------------- A) Stroke mask -------------------- */
  const mask = document.createElement("canvas");
  mask.width = Math.max(1, Math.floor(options.width));
  mask.height = Math.max(1, Math.floor(options.height));
  const mx = mask.getContext("2d", { alpha: true })!;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";

  // Pass 1 — main body
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
    if (alphaProgress <= 0.001) continue;

    let widthPx =
      baseSizePx *
      pressureToWidthScale(midPressure) *
      (bellyGain * 0.31 * Math.pow(bellyProgress, 0.75)) *
      widthEndSqueeze(tMid);

    // taper shaping
    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    if (0.5 * widthPx < TIP_CULL_RADIUS_PX) continue;

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      0.76 *
      baseFlow01 *
      pressureToFlowScale(midPressure) *
      Math.pow(alphaProgress, 0.86) *
      bellyAlphaDampFromProgress(bellyProgress) *
      highPressureDamp(midPressure);

    mx.beginPath();
    mx.moveTo(a.x, a.y);
    mx.lineTo(b.x, b.y);
    mx.stroke();
  }

  // Pass 2 — narrow spine
  mx.filter = "blur(0.22px)";
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
    if (alphaProgress <= 0.001) continue;

    let widthPx =
      baseSizePx *
      pressureToWidthScale(midPressure) *
      (bellyGain * 0.155 * Math.pow(bellyProgress, 0.95)) *
      widthEndSqueeze(tMid);

    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      0.33 *
      baseFlow01 *
      pressureToFlowScale(midPressure) *
      Math.pow(alphaProgress, 0.92) *
      bellyAlphaDampFromProgress(bellyProgress) *
      highPressureDamp(midPressure);

    mx.beginPath();
    mx.moveTo(a.x, a.y);
    mx.lineTo(b.x, b.y);
    mx.stroke();
  }
  mx.filter = "none";

  // Edge carve: remove faint halo
  {
    const blurred = document.createElement("canvas");
    blurred.width = mask.width;
    blurred.height = mask.height;
    const bx = blurred.getContext("2d", { alpha: true })!;
    bx.filter = "blur(0.40px)";
    bx.drawImage(mask, 0, 0);
    bx.filter = "none";
    bx.globalCompositeOperation = "destination-out";
    bx.drawImage(mask, 0, 0);

    mx.save();
    mx.globalCompositeOperation = "destination-out";
    mx.globalAlpha = 0.26;
    mx.drawImage(blurred, 0, 0);
    mx.restore();
  }

  /* ---- Paper tooth perforation (multi-scale + random phase) ---- */
  {
    const effectiveTile = clampTileSizePx(
      ovAny?.toothScale && ovAny.toothScale > 1
        ? ovAny.toothScale
        : Math.round(baseSizePx * (isCharcoal ? 1.6 : 1.35))
    );

    const bodyDensity = isCharcoal ? 0.22 : 0.12;
    const flankDensity = isCharcoal ? 0.34 : 0.18;

    const bodyDepth = clamp01(ovAny?.toothBody ?? (isCharcoal ? 0.75 : 0.55));
    const flankDepth = clamp01(ovAny?.toothFlank ?? (isCharcoal ? 1.0 : 0.85));

    const noiseTile = makeAlphaNoiseTile(
      seed ^ 0x77aa,
      effectiveTile * 0.9,
      0.6,
      1
    );

    // Build gates
    const bodyGate = document.createElement("canvas");
    bodyGate.width = mask.width;
    bodyGate.height = mask.height;
    const bg = bodyGate.getContext("2d", { alpha: true })!;
    bg.strokeStyle = "#fff";
    bg.lineCap = "round";
    bg.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const wScale = pressureToWidthScale(midPressure);
      const innerW =
        baseSizePx *
        wScale *
        (0.26 * Math.pow(bellyProgress, 0.9) + 0.18) *
        widthEndSqueeze(tMid);

      bg.lineWidth = Math.max(0.75, innerW);
      const centerEase = mix(0.7, 0.4, 1 - bodyDepth);
      bg.globalAlpha = alphaProgress * centerEase;
      bg.beginPath();
      bg.moveTo(a.x, a.y);
      bg.lineTo(b.x, b.y);
      bg.stroke();
    }

    const flankGate = document.createElement("canvas");
    flankGate.width = mask.width;
    flankGate.height = mask.height;
    const fg = flankGate.getContext("2d", { alpha: true })!;
    fg.strokeStyle = "#fff";
    fg.lineCap = "round";
    fg.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const wScale = pressureToWidthScale(midPressure);
      const flankW =
        baseSizePx *
        wScale *
        (0.22 * Math.pow(bellyProgress, 0.9) + 0.1) *
        widthEndSqueeze(tMid);

      fg.lineWidth = Math.max(0.5, flankW);
      fg.globalAlpha = 0.8 * alphaProgress;
      fg.beginPath();
      fg.moveTo(a.x, a.y);
      fg.lineTo(b.x, b.y);
      fg.stroke();
    }

    // Body holes canvas (two passes, different seeds/sizes + soft gate noise)
    const bodyHoles = document.createElement("canvas");
    bodyHoles.width = mask.width;
    bodyHoles.height = mask.height;
    const bhx = bodyHoles.getContext("2d", { alpha: true })!;

    const bodyTileA = makeHoleDotTile(
      seed ^ 0x1144,
      effectiveTile,
      bodyDensity
    );
    const bodyTileB = makeHoleDotTile(
      seed ^ 0x3344,
      Math.max(2, Math.round(effectiveTile * 0.62)),
      bodyDensity * 0.75
    );

    // Randomized phase fills
    fillPatternWithRandomPhase(
      bhx,
      bodyTileA,
      bodyHoles.width,
      bodyHoles.height,
      rand
    );
    bhx.globalAlpha = 0.7;
    fillPatternWithRandomPhase(
      bhx,
      bodyTileB,
      bodyHoles.width,
      bodyHoles.height,
      rand
    );
    bhx.globalAlpha = 1;

    // Multiply by soft noise and gate to belly
    bhx.globalCompositeOperation = "destination-in";
    bhx.fillStyle = noiseTile;
    bhx.fillRect(0, 0, bodyHoles.width, bodyHoles.height);
    bhx.drawImage(bodyGate, 0, 0);

    // Punch out body holes
    mx.save();
    mx.globalCompositeOperation = "destination-out";
    mx.globalAlpha = bodyDepth;
    mx.drawImage(bodyHoles, 0, 0);
    mx.restore();

    // Flank holes canvas (two passes, slightly denser)
    const flankHoles = document.createElement("canvas");
    flankHoles.width = mask.width;
    flankHoles.height = mask.height;
    const fhx = flankHoles.getContext("2d", { alpha: true })!;

    const flankTileA = makeHoleDotTile(
      seed ^ 0x2288,
      effectiveTile,
      flankDensity
    );
    const flankTileB = makeHoleDotTile(
      seed ^ 0x5588,
      Math.max(2, Math.round(effectiveTile * 0.7)),
      flankDensity * 0.85
    );

    fillPatternWithRandomPhase(
      fhx,
      flankTileA,
      flankHoles.width,
      flankHoles.height,
      rand
    );
    fhx.globalAlpha = 0.75;
    fillPatternWithRandomPhase(
      fhx,
      flankTileB,
      flankHoles.width,
      flankHoles.height,
      rand
    );
    fhx.globalAlpha = 1;

    fhx.globalCompositeOperation = "destination-in";
    fhx.drawImage(flankGate, 0, 0);

    mx.save();
    mx.globalCompositeOperation = "destination-out";
    mx.globalAlpha = flankDepth;
    mx.drawImage(flankHoles, 0, 0);
    mx.restore();
  }

  /* -------------------- B) Composite mask into destination ---------------- */
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(mask, 0, 0);
  ctx.restore();

  /* -------------------- C) Inner-belly grain (respects holes) ------------- */
  {
    const inner = document.createElement("canvas");
    inner.width = mask.width;
    inner.height = mask.height;
    const ix = inner.getContext("2d", { alpha: true })!;
    ix.strokeStyle = "#fff";
    ix.lineCap = "round";
    ix.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const innerW =
        baseSizePx *
        pressureToWidthScale(midPressure) *
        (0.32 * Math.pow(bellyProgress, 0.9) + 0.2);

      ix.lineWidth = Math.max(1, innerW);
      ix.globalAlpha = 0.75 * alphaProgress;
      ix.beginPath();
      ix.moveTo(a.x, a.y);
      ix.lineTo(b.x, b.y);
      ix.stroke();
    }

    const grain = document.createElement("canvas");
    grain.width = mask.width;
    grain.height = mask.height;
    const gx = grain.getContext("2d", { alpha: true })!;

    const tileA = makeMultiplyTile(seed ^ 0x0999, 24, 0.17);
    const tileB = makeMultiplyTile(seed ^ 0x2ab3, 20, 0.14);

    gx.fillStyle = tileA;
    gx.fillRect(0, 0, grain.width, grain.height);
    gx.globalAlpha = 0.85;
    gx.fillStyle = tileB;
    gx.fillRect(0, 0, grain.width, grain.height);

    // Keep grain only inside inner belly AND intersect with holes (mask)
    gx.globalCompositeOperation = "destination-in";
    gx.drawImage(inner, 0, 0);
    gx.drawImage(mask, 0, 0); // <- respects perforations

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(grain, 0, 0);
    ctx.restore();
  }

  /* -------------------- D) Tip rim (screen, pencils only) ----------------- */
  {
    const rimMode = (ovAny?.rimMode ?? "auto") as "auto" | "on" | "off";
    const useRim = rimMode === "on" || (rimMode === "auto" && !isCharcoal);
    if (useRim) {
      const rim = document.createElement("canvas");
      rim.width = mask.width;
      rim.height = mask.height;
      const rx = rim.getContext("2d", { alpha: true })!;
      rx.strokeStyle = "#fff";
      rx.lineCap = "round";
      rx.lineJoin = "round";

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const { bellyProgress, alphaProgress, midPressure } = gates[i - 1];
        if (alphaProgress <= 0.001) continue;

        rx.lineWidth = Math.max(
          1,
          baseSizePx *
            pressureToWidthScale(midPressure) *
            (0.14 * bellyProgress + 0.08)
        );
        const rimStrength = ovAny?.rimStrength ?? 0.12;
        rx.globalAlpha = Math.pow(1 - alphaProgress, 0.85) * rimStrength;

        rx.beginPath();
        rx.moveTo(a.x, a.y);
        rx.lineTo(b.x, b.y);
        rx.stroke();
      }

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rim, 0, 0);
      ctx.restore();
    }
  }
}

export const backendId = "stamping" as const;
