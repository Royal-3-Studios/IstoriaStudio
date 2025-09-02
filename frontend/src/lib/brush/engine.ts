// src/lib/brush/engine.ts
import type { BrushEngine, GrainCfg, ShapeCfg } from "@/data/brushPresets";

type HSL = { h: number; s: number; l: number };
export type PreviewPathPoint = { x: number; y: number; angle: number };

export type RenderOptions = {
  engine: BrushEngine;
  baseSizePx?: number;
  color?: string;
  path?: PreviewPathPoint[];
  width: number;
  height: number;
  seed?: number;
  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  overrides?: Partial<{
    centerlinePencil?: boolean;
    spacing: number;
    jitter: number;
    scatter: number;
    count: number;
    angle: number;
    softness: number;
    flow: number;
    wetEdges: boolean;
    grainKind: GrainCfg["kind"];
    grainDepth: number;
    grainScale: number; // 0.25..4 (1 = native)
    grainRotate: number; // deg

    // Pencil/graphite dynamics
    minSizePct?: number; // 0..0.2   minimum size fraction (used only for target width)
    opacityBase?: number; // 0..1     base visibility at light pressure
    opacityExp?: number; // 0.3..1.5 steeper curve = darker sooner
    velocityThin?: number; // 0..0.35  max % thinning at high speed
    taperStartPx?: number; // px       fade-in length
    taperEndPx?: number; // px       fade-out length
    rotationJitterDeg?: number; // deg      ± jitter on stamp rotation
    debugSingleLine?: boolean;
  }>;
};

export function drawStrokeToCanvas(
  canvas: HTMLCanvasElement,
  opts: RenderOptions
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // HiDPI
  const dpr = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
  canvas.width = Math.floor(opts.width * dpr);
  canvas.height = Math.floor(opts.height * dpr);
  canvas.style.width = `${opts.width}px`;
  canvas.style.height = `${opts.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, opts.width, opts.height);

  // helpers
  const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const easeEnds = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u); // pack samples near ends
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
  const easeOutQuad = (t: number) => {
    t = clamp01(t);
    return 1 - (1 - t) * (1 - t);
  };

  const seed =
    opts.seed ??
    1234567 ^
      Math.floor(
        (opts.engine.shape?.angle || 0) +
          (opts.engine.strokePath?.spacing || 0) * 1e3
      );
  const rand = mulberry32(seed);

  const eng = opts.engine;
  const path =
    opts.path ?? defaultPreviewPath({ width: opts.width, height: opts.height });

  // --- DEBUG: draw a single 1 device-pixel line and return ---
  if (opts.overrides?.debugSingleLine) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    // Make the stroke 1 *device* pixel wide under the DPR transform
    const dpr = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    ctx.lineWidth = 1 / dpr; // <-- key: 1 physical pixel
    ctx.strokeStyle = "#ffffff"; // white so it’s visible on black
    ctx.lineCap = "round"; // rounded ends; switch to "butt" if you prefer
    ctx.lineJoin = "round";

    // Optional half-pixel alignment helps on axis-aligned segments
    const off = 0.5 / dpr;

    ctx.beginPath();
    ctx.moveTo(path[0].x + off, path[0].y + off);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x + off, path[i].y + off);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Effective params
  const shape: ShapeCfg = { ...eng.shape };
  const spath = { ...eng.strokePath };
  const rend = { ...eng.rendering };
  const grain = { ...eng.grain };
  let grainRotateDeg = 0;

  // ---- 6B dynamics (sane defaults) ----
  const MIN_SIZE_PCT = opts.overrides?.minSizePct ?? 0.06;
  const OP_BASE = opts.overrides?.opacityBase ?? 0.22;
  const OP_EXP = opts.overrides?.opacityExp ?? 0.55;
  const V_THIN = opts.overrides?.velocityThin ?? 0.22;
  const TAP_IN_PX = opts.overrides?.taperStartPx ?? 28;
  const TAP_OUT_PX = opts.overrides?.taperEndPx ?? 40;
  const ROT_JIT_DEG = opts.overrides?.rotationJitterDeg ?? 5;

  // UI overrides
  if (opts.overrides) {
    if (typeof opts.overrides.count === "number")
      spath.count = opts.overrides.count;
    if (typeof opts.overrides.jitter === "number")
      spath.jitter = opts.overrides.jitter;
    if (typeof opts.overrides.scatter === "number")
      spath.scatter = opts.overrides.scatter;
    if (typeof opts.overrides.spacing === "number")
      spath.spacing = opts.overrides.spacing;
    if (typeof opts.overrides.angle === "number")
      shape.angle = opts.overrides.angle;
    if (typeof opts.overrides.softness === "number")
      shape.softness = opts.overrides.softness;
    if (typeof opts.overrides.flow === "number")
      rend.flow = opts.overrides.flow;
    if (typeof opts.overrides.wetEdges === "boolean")
      rend.wetEdges = opts.overrides.wetEdges;

    if (opts.overrides.grainKind) grain.kind = opts.overrides.grainKind;
    if (typeof opts.overrides.grainDepth === "number")
      grain.depth = opts.overrides.grainDepth;
    if (typeof opts.overrides.grainScale === "number")
      grain.scale = opts.overrides.grainScale;
    if (typeof opts.overrides.grainRotate === "number")
      grainRotateDeg = opts.overrides.grainRotate;
  }

  // Base size (lean for pencil)
  const baseSize =
    Math.max(
      2,
      Math.min(36, (opts.baseSizePx ?? 12) * (shape.sizeScale ?? 1))
    ) | 0;

  // Spacing (denser for pencil to reduce banding)
  let spacingPx = Math.max(0.5, ((spath.spacing ?? 5) / 100) * baseSize * 1.6);
  const isPencil = rend.mode === "blended";
  if (isPencil) spacingPx *= 0.7;

  // Flow
  const flow = Math.max(0, Math.min(1, (rend.flow ?? 100) / 100));

  // Grain
  const grainTile =
    grain.kind === "none"
      ? null
      : buildGrainTile({
          kind: grain.kind,
          depth: (grain.depth ?? 40) / 100,
          seed: Math.floor(seed * 1.37),
        });
  const grainScale = Math.max(0.25, Math.min(4, grain.scale ?? 1));

  //   // === CENTERLINE PENCIL — slim profile + fixed light rim + soft fade (no grain) ===
  //   if (opts.overrides?.centerlinePencil) {
  //     ctx.save();
  //     ctx.globalCompositeOperation = "source-over"; // on white paper, prefer "multiply"

  //     // helpers
  //     const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  //     const easeOutQuad = (t: number) => {
  //       t = clamp01(t);
  //       return 1 - (1 - t) * (1 - t);
  //     };
  //     const smoothstep = (e0: number, e1: number, x: number) => {
  //       const t = clamp01((x - e0) / (e1 - e0));
  //       return t * t * (3 - 2 * t);
  //     };
  //     const shiftL = (h: HSL, dl: number): HSL => ({
  //       ...h,
  //       l: clamp01(h.l + dl),
  //     });

  //     // tones derived from the chosen brush color
  //     const baseHex = opts.color ?? "#1a1a1a";
  //     const baseHsl = hexToHsl(baseHex);
  //     const rimHsl = shiftL(baseHsl, +0.28); // was +0.24
  //     const bridgeHsl = shiftL(baseHsl, -0.05);
  //     const coreHsl = shiftL(baseHsl, -0.32); // was -0.30

  //     // taper by path length → true 1px tips
  //     const totalLenPx = approximatePathLength(path);
  //     const taperInPx = 10; // longer, slender entry
  //     const taperOutPx = 10; // longer, slender exit

  //     // --- scale to the Procreate-sized preview (352×127) ---
  //     // Use an explicit target for the mid-stroke total width rather than baseSize.
  //     const TARGET_MID_TOTAL_WIDTH_PX = 3; // ~Procreate look on 352×127
  //     // Fixed light rim thickness per side; mid appears after this rim exists.
  //     const EDGE_BAND_PX = 0.15 / dpr;
  //     // Feather band per side for a soft transition (rim → bridge → core).
  //     const FEATHER_PX = 0.85;

  //     // — masks (crisper rim, firmer core, smooth bridge)
  //     const rimSoftness = 82; // was 84
  //     const bridgeSoftness = 86; // keep smooth
  //     const coreSoftness = 50; // was 52

  //     // — opacities (brighter rim, solid core, subtle bridge)
  //     const RIM_A_CONST = 0.18; // was 0.15
  //     const BRIDGE_A_MAX = 0.6; // was 0.20
  //     const CORE_A_MAX = 0.95; // keep strong center

  //     // tight sampling for smooth fill
  //     const spacingPx = 0.4;
  //     const steps = Math.max(16, Math.ceil(totalLenPx / spacingPx));

  //     let accLen = 0;
  //     let prev = samplePath(path, 0);

  //     for (let i = 0; i <= steps; i++) {
  //       const u = i / steps;
  //       const pt = samplePath(path, u);

  //       const segLen = Math.hypot(pt.x - prev.x, pt.y - prev.y);
  //       accLen += segLen;

  //       // bell-shaped taper 0→1→0 by length
  //       const grow = easeOutQuad(Math.min(1, accLen / Math.max(1, taperInPx)));
  //       const shrink = easeOutQuad(
  //         Math.min(1, (totalLenPx - accLen) / Math.max(1, taperOutPx))
  //       );
  //       const cap = grow * shrink;

  //       // total width grows from literal 1px at the tips
  //       const totalWidthPx = 1 + (TARGET_MID_TOTAL_WIDTH_PX - 1) * cap;

  //       // how much width exists beyond the fixed rim? (both sides)
  //       const extraBeyondRim = Math.max(0, totalWidthPx - 2 * EDGE_BAND_PX);
  //       // normalize that extra against the feather span (both sides)
  //       const over = extraBeyondRim / Math.max(1e-6, 2 * FEATHER_PX);

  //       // presence factors: bridge appears first, core later, both very smoothly
  //       const bridgePresence = smoothstep(0.0, 0.7, over); // earlier & gentle
  //       const corePresence = smoothstep(0.28, 0.92, over); // later & smoother

  //       // per-layer widths
  //       const rimWidthPx = totalWidthPx; // full width
  //       const bridgeWidthPx = Math.max(1, totalWidthPx - 2 * EDGE_BAND_PX); // after rim
  //       const coreWidthPx = Math.max(
  //         1,
  //         totalWidthPx - 2 * (EDGE_BAND_PX + FEATHER_PX)
  //       ); // after rim+feather

  //       // alphas
  //       const rimAlpha = RIM_A_CONST; // nearly constant (keeps tips light)
  //       const bridgeAlpha = BRIDGE_A_MAX * cap * bridgePresence;
  //       const coreAlpha = CORE_A_MAX * cap * corePresence;

  //       const cx = pt.x,
  //         cy = pt.y;

  //       // RIM — consistent light band
  //       if (rimAlpha > 0.01 && rimWidthPx > 0.5) {
  //         drawTip({
  //           ctx,
  //           x: cx,
  //           y: cy,
  //           w: rimWidthPx,
  //           shape: { type: "round", softness: rimSoftness, sizeScale: 1 },
  //           angleRad: 0,
  //           color: hslToCss(rimHsl),
  //           alpha: rimAlpha,
  //           grainTile: null,
  //           grainDepth: 0,
  //           grainScale: 1,
  //           grainRotateDeg: 0,
  //         });
  //       }

  //       // BRIDGE — softly fills between rim and core
  //       if (bridgeAlpha > 0.01 && bridgeWidthPx > 1.0) {
  //         drawTip({
  //           ctx,
  //           x: cx,
  //           y: cy,
  //           w: bridgeWidthPx,
  //           shape: { type: "round", softness: bridgeSoftness, sizeScale: 1 },
  //           angleRad: 0,
  //           color: hslToCss(bridgeHsl),
  //           alpha: bridgeAlpha,
  //           grainTile: null,
  //           grainDepth: 0,
  //           grainScale: 1,
  //           grainRotateDeg: 0,
  //         });
  //       }

  //       // CORE — darker center that fades in later
  //       if (coreAlpha > 0.01 && coreWidthPx > 1.0) {
  //         drawTip({
  //           ctx,
  //           x: cx,
  //           y: cy,
  //           w: coreWidthPx,
  //           shape: { type: "round", softness: coreSoftness, sizeScale: 1 },
  //           angleRad: 0,
  //           color: hslToCss(coreHsl),
  //           alpha: coreAlpha,
  //           grainTile: null,
  //           grainDepth: 0,
  //           grainScale: 1,
  //           grainRotateDeg: 0,
  //         });
  //       }

  //       prev = pt;
  //     }

  //     ctx.restore();
  //     return;
  //   }

  //   // Multiply for graphite
  //   ctx.save();
  //   ctx.globalCompositeOperation = isPencil ? "multiply" : "source-over";

  //   const color = opts.color ?? "#6b7280";
  //   const colorHsl = hexToHsl(color);
  //   const cj = opts.colorJitter ?? {};
  //   const perStamp = !!cj.perStamp;

  //   // Steps include endpoints so we *always* place stamps at t=0 and t=1
  //   const totalLenPx = approximatePathLength(path);
  //   const steps = Math.max(14, Math.ceil(totalLenPx / spacingPx));

  //   const j = (spath.jitter ?? 0) / 100;
  //   const s = (spath.scatter ?? 0) / 100;

  //   // Centerline model (halo + core)
  //   const WIDTH_SLIM = isPencil ? 0.22 : 1.0; // global pencil thinness
  //   const CORE_PLATEAU = 0.55; // flat-top fraction inside core mask (0..1)
  //   const EDGE_ALPHA = 0.06; // halo opacity multiplier
  //   const CORE_ALPHA = 0.95; // core opacity multiplier

  //   // Taper accumulators
  //   let accLen = 0;
  //   let prevP = samplePath(path, 0);

  //   for (let i = 0; i <= steps; i++) {
  //     // Denser sampling near ends
  //     const u = i / steps; // 0..1 uniform
  //     const t = easeEnds(u); // 0..1 eased
  //     const p = samplePath(path, t);

  //     // segment length & cumulative
  //     const segLen = Math.hypot(p.x - prevP.x, p.y - prevP.y);
  //     accLen += segLen;

  //     // Length-based taper with easing (bell-shaped 0→1→0)
  //     const startT = Math.min(1, accLen / Math.max(1, TAP_IN_PX));
  //     const endT = Math.min(1, (totalLenPx - accLen) / Math.max(1, TAP_OUT_PX));
  //     const cap = easeOutQuad(startT) * easeOutQuad(endT);

  //     const baseAngle = p.angle + (Math.PI / 180) * (shape.angle ?? 0);

  //     // Pressure profile across preview
  //     const pressure = 0.25 + 0.75 * easeInOutSine(t);

  //     // Fade jitter/scatter to zero at tips (prevents bluntness)
  //     const capJ = cap * cap;
  //     const jLocal = j * capJ;
  //     const sLocal = s * capJ;

  //     const jx = (rand() - 0.5) * jLocal * 10;
  //     const jy = (rand() - 0.5) * jLocal * 10;
  //     const rad = (rand() - 0.5) * sLocal * baseSize * 0.6;
  //     const phi = rand() * Math.PI * 2;

  //     const cx = p.x + jx + Math.cos(phi) * rad;
  //     const cy = p.y + jy + Math.sin(phi) * rad;

  //     const count = Math.max(1, Math.floor(spath.count || 1));
  //     for (let k = 0; k < count; k++) {
  //       const kx = k ? (rand() - 0.5) * sLocal * baseSize * 0.3 : 0;
  //       const ky = k ? (rand() - 0.5) * sLocal * baseSize * 0.3 : 0;

  //       // gentle size response (target mid-stroke width, no taper)
  //       const sizeJitter = 1 + (rand() - 0.5) * 0.1;
  //       const pressSize = isPencil
  //         ? lerp(0.38, 0.58, pressure)
  //         : lerp(0.9, 1.1, pressure);
  //       const sizeWithMin = Math.max(MIN_SIZE_PCT, pressSize);

  //       // velocity → thinner
  //       const vNorm = Math.min(1, segLen / Math.max(1e-3, spacingPx * 1.4));
  //       const velThin = isPencil ? 1 - V_THIN * vNorm : 1.0;

  //       const wTarget =
  //         baseSize * sizeJitter * sizeWithMin * WIDTH_SLIM * velThin;

  //       // --- THIS is the centerline expansion ---
  //       // grow from a literal 1px line (at ends) to target width (mid-stroke)
  //       const wEdge = 1 + (wTarget * 1.15 - 1) * cap; // wide faint halo
  //       const wCore = 1 + (wTarget * 0.72 - 1) * cap; // narrower darker core
  //       const wSingle = 1 + (wTarget - 1) * cap; // for non-pencil brushes

  //       // Opacity (also tapered)
  //       const alphaBase =
  //         (rend.mode === "wetMix"
  //           ? 0.55
  //           : rend.mode === "lightGlaze"
  //             ? 0.65
  //             : rend.mode === "heavyGlaze"
  //               ? 0.9
  //               : 0.8) *
  //         (1 - (shape.softness ?? 0) / 200);

  //       const pressAlpha = isPencil
  //         ? OP_BASE + (1 - OP_BASE) * Math.pow(pressure, OP_EXP)
  //         : lerp(0.6, 1.0, pressure);

  //       const alpha =
  //         Math.max(0, Math.min(1, alphaBase * flow * pressAlpha)) * cap;

  //       // skip if effectively invisible
  //       const effectiveW = isPencil ? Math.max(wEdge, wCore) : wSingle;
  //       if (effectiveW <= 0.5 || alpha <= 0.01) continue;

  //       // Mild “tilt” squish for ovals
  //       const shapeLocal: ShapeCfg =
  //         shape.type === "oval"
  //           ? {
  //               ...shape,
  //               roundness: Math.max(
  //                 8,
  //                 Math.min(100, (shape.roundness ?? 60) - 16 * pressure)
  //               ),
  //             }
  //           : shape;

  //       // orientation + tiny jitter
  //       const jitterRad = ((ROT_JIT_DEG * Math.PI) / 180) * (rand() - 0.5) * 2;
  //       const tipAngle =
  //         shapeLocal.type === "round"
  //           ? baseAngle +
  //             (shapeLocal.angle ? (rand() - 0.5) * 0.2 : 0) +
  //             jitterRad
  //           : baseAngle + jitterRad;

  //       const hsl = perStamp ? jitterHsl(colorHsl, cj, rand) : colorHsl;

  //       if (isPencil) {
  //         // 1) Halo (edge falloff): soft mask
  //         const aEdge = alpha * EDGE_ALPHA;
  //         if (aEdge > 0 && wEdge > 0.5) {
  //           drawTip({
  //             ctx,
  //             x: cx + kx,
  //             y: cy + ky,
  //             w: wEdge,
  //             shape: {
  //               ...shapeLocal,
  //               softness: Math.max(60, shapeLocal.softness ?? 60),
  //             },
  //             angleRad: tipAngle,
  //             color: hslToCss(hsl),
  //             alpha: aEdge,
  //             grainTile,
  //             grainDepth: (grain.depth ?? 40) / 100,
  //             grainScale,
  //             grainRotateDeg,
  //             flatTop: false,
  //             plateau: 0,
  //           });
  //         }

  //         // 2) Core (centerline): flat-top mask so the middle looks consistent
  //         const aCore = alpha * CORE_ALPHA;
  //         if (aCore > 0 && wCore > 0.5) {
  //           drawTip({
  //             ctx,
  //             x: cx + kx,
  //             y: cy + ky,
  //             w: wCore,
  //             shape: {
  //               ...shapeLocal,
  //               softness: Math.max(50, shapeLocal.softness ?? 50),
  //             },
  //             angleRad: tipAngle,
  //             color: hslToCss(hsl),
  //             alpha: aCore,
  //             grainTile,
  //             grainDepth: (grain.depth ?? 40) / 100,
  //             grainScale,
  //             grainRotateDeg,
  //             flatTop: true,
  //             plateau: CORE_PLATEAU,
  //           });
  //         }
  //       } else {
  //         // non-pencil: single layer also growing from 1px
  //         drawTip({
  //           ctx,
  //           x: cx + kx,
  //           y: cy + ky,
  //           w: wSingle,
  //           shape: shapeLocal,
  //           angleRad: tipAngle,
  //           color: hslToCss(hsl),
  //           alpha,
  //           grainTile,
  //           grainDepth: (grain.depth ?? 40) / 100,
  //           grainScale,
  //           grainRotateDeg,
  //           flatTop: false,
  //           plateau: 0,
  //         });
  //       }
  //     }

  //     // update once per outer step
  //     prevP = p;
  //   }

  //   ctx.restore();
  // }

  // === CENTERLINE PENCIL — triangular tips + true thin rim (ring) + solid core + spine ===
  if (opts.overrides?.centerlinePencil) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = clamp01((x - e0) / (e1 - e0));
      return t * t * (3 - 2 * t);
    };
    const easeOutQuad = (t: number) => {
      t = clamp01(t);
      return 1 - (1 - t) * (1 - t);
    };
    const shiftL = (h: HSL, dl: number): HSL => ({
      ...h,
      l: clamp01(h.l + dl),
    });

    // tones
    const baseHex = opts.color ?? "#1a1a1a";
    const baseHsl = hexToHsl(baseHex);
    const rimHsl = shiftL(baseHsl, +0.28);
    const bridgeHsl = shiftL(baseHsl, -0.05);
    const coreHsl = shiftL(baseHsl, -0.36);
    const spineHsl = shiftL(baseHsl, -0.42);

    // proportions vs Procreate preview (352×127)
    const REF_H = 127,
      REF_MID_TOTAL_WIDTH = 4.0;
    const canvasScale = opts.height / REF_H;
    const TARGET_MID_TOTAL_WIDTH_PX = REF_MID_TOTAL_WIDTH * canvasScale;

    // triangular width taper
    const taperInPx = 60 * canvasScale;
    const taperOutPx = 88 * canvasScale;

    // rim thickness ≈ device px; feather is short
    const dpr = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    const EDGE_BAND_PX_BASE = 0.45 / dpr; // thinner than before
    const FEATHER_PX = 0.6; // short, crisp fade

    // masks
    const rimOuterSoft = 78; // crisper outer edge
    const rimInnerSoft = 84; // slightly softer inner cut
    const ovalRoundness = 58; // align halo to tangent
    const bridgeSoftness = 88;
    const coreSoftness = 42;
    const spineSoftness = 30;

    // alphas
    const RIM_A_CONST = 0.15; // light but not flooding
    const BRIDGE_A_MAX = 0.1; // very gentle
    const CORE_A_MAX = 1.0;
    const SPINE_A_MAX = 0.34;

    // sampling
    const spacingPx = 0.34;
    const totalLenPx = approximatePathLength(path);
    const steps = Math.max(18, Math.ceil(totalLenPx / spacingPx));

    let accLen = 0;
    let prev = samplePath(path, 0);

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const pt = samplePath(path, u);
      const seg = Math.hypot(pt.x - prev.x, pt.y - prev.y);
      accLen += seg;

      // triangular width / soft alpha
      const growLin = Math.min(1, accLen / Math.max(1, taperInPx));
      const shrinkLin = Math.min(
        1,
        (totalLenPx - accLen) / Math.max(1, taperOutPx)
      );
      const capW = Math.min(growLin, shrinkLin); // width driver
      const capA = easeOutQuad(Math.min(growLin, shrinkLin)); // alpha driver

      const totalWidthPx = 1 + (TARGET_MID_TOTAL_WIDTH_PX - 1) * capW;

      // collapse rim near the very tip so no round dot appears
      const rimCollapse = smoothstep(0.14, 0.32, capW); // 0 at tip → 1 mid
      const EDGE_BAND_PX = EDGE_BAND_PX_BASE * rimCollapse;

      // beyond the rim → normalized over feather
      const extraBeyondRim = Math.max(0, totalWidthPx - 2 * EDGE_BAND_PX);
      const over = extraBeyondRim / Math.max(1e-6, 2 * FEATHER_PX);

      // make core appear earlier than bridge so the center stays visible
      const bridgePresence = smoothstep(0.0, 0.33, over);
      const corePresence = smoothstep(0.08, 0.5, over);

      // widths
      const rimOuterW = totalWidthPx;
      const rimInnerW = Math.max(0.5, rimOuterW - 2 * EDGE_BAND_PX); // inner cut
      const bridgeW = Math.max(1, totalWidthPx - 2 * EDGE_BAND_PX);
      const coreW = Math.max(1, totalWidthPx - 2 * (EDGE_BAND_PX + FEATHER_PX));

      // alphas per layer
      const rimAlpha = RIM_A_CONST * (0.85 + 0.15 * capA) * rimCollapse;
      const bridgeAlpha = BRIDGE_A_MAX * capA * bridgePresence;
      const coreAlpha = CORE_A_MAX * capA * corePresence;

      const cx = pt.x,
        cy = pt.y,
        angleRad = pt.angle || 0;

      // RIM — true thin *ring*, oval aligned to path
      if (rimAlpha > 0.01 && rimOuterW > 0.5 && EDGE_BAND_PX > 0.01) {
        drawRingTip({
          ctx,
          x: cx,
          y: cy,
          outerW: rimOuterW,
          innerW: rimInnerW,
          angleRad,
          color: hslToCss(rimHsl),
          alpha: rimAlpha,
          shapeOuter: {
            type: "oval",
            roundness: ovalRoundness,
            softness: rimOuterSoft,
            sizeScale: 1,
          },
          shapeInner: {
            type: "oval",
            roundness: ovalRoundness,
            softness: rimInnerSoft,
            sizeScale: 1,
          },
        });
      }

      // BRIDGE — subtle feather
      if (bridgeAlpha > 0.01 && bridgeW > 1) {
        drawTip({
          ctx,
          x: cx,
          y: cy,
          w: bridgeW,
          shape: { type: "round", softness: bridgeSoftness, sizeScale: 1 },
          angleRad: 0,
          color: hslToCss(bridgeHsl),
          alpha: bridgeAlpha,
          grainTile: null,
          grainDepth: 0,
          grainScale: 1,
          grainRotateDeg: 0,
        });
      }

      // CORE — dense center
      if (coreAlpha > 0.01 && coreW > 1) {
        drawTip({
          ctx,
          x: cx,
          y: cy,
          w: coreW,
          shape: { type: "round", softness: coreSoftness, sizeScale: 1 },
          angleRad: 0,
          color: hslToCss(coreHsl),
          alpha: coreAlpha,
          grainTile: null,
          grainDepth: 0,
          grainScale: 1,
          grainRotateDeg: 0,
        });
      }

      // SPINE — 1 device-px centerline to keep the core readable
      const spineW = Math.max(1, 0.6 / dpr);
      const spineAlpha = SPINE_A_MAX * capA * corePresence;
      if (spineAlpha > 0.01) {
        drawTip({
          ctx,
          x: cx,
          y: cy,
          w: spineW,
          shape: { type: "round", softness: spineSoftness, sizeScale: 1 },
          angleRad: 0,
          color: hslToCss(spineHsl),
          alpha: spineAlpha,
          grainTile: null,
          grainDepth: 0,
          grainScale: 1,
          grainRotateDeg: 0,
        });
      }

      prev = pt;
    }

    ctx.restore();
    return;
  }

  /* ---------------- internals --------------- */

  function mulberry32(seed: number) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function defaultPreviewPath({
    width,
    height,
  }: {
    width: number;
    height: number;
  }): PreviewPathPoint[] {
    const pts: PreviewPathPoint[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = 8 + (width - 16) * t;
      const y =
        height * 0.55 - height * 0.28 * t + height * 0.12 * Math.sin(7 * t);
      const dx = width - 16;
      const dy = -height * 0.28 + height * 0.84 * Math.cos(7 * t);
      const angle = Math.atan2(dy, dx);
      pts.push({ x, y, angle });
    }
    return pts;
  }
  function samplePath(path: PreviewPathPoint[], t: number) {
    const idx = t * (path.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(path.length - 1, i0 + 1);
    const frac = idx - i0;
    const p0 = path[i0],
      p1 = path[i1];
    return {
      x: p0.x + (p1.x - p0.x) * frac,
      y: p0.y + (p1.y - p0.y) * frac,
      angle: p0.angle + (p1.angle - p0.angle) * frac,
    };
  }
  function approximatePathLength(path: PreviewPathPoint[]) {
    let len = 0;
    for (let i = 1; i < path.length; i++)
      len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return len;
  }

  /* ---- grain ---- */
  type GrainTile = { canvas: HTMLCanvasElement; size: number };
  function buildGrainTile({
    kind,
    depth,
    seed,
  }: {
    kind: GrainCfg["kind"];
    depth: number;
    seed: number;
  }): GrainTile {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const rand = mulberry32(seed);

    ctx.fillStyle = "rgb(200,200,200)";
    ctx.fillRect(0, 0, size, size);

    if (kind === "noise") {
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 180 + Math.floor((rand() - 0.5) * 2 * 255 * depth * 0.5);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    } else if (kind === "paper") {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const nx = Math.floor(x / 4),
            ny = Math.floor(y / 4);
          const v =
            190 +
            Math.floor((hash2(nx, ny, seed) - 0.5) * 2 * 255 * depth * 0.35);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    } else if (kind === "canvas") {
      ctx.fillStyle = "rgb(205,205,205)";
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 0.35 * depth;
      ctx.strokeStyle = "rgb(170,170,170)";
      for (let i = 0; i < size; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return { canvas: c, size };
  }
  function hash2(x: number, y: number, seed: number) {
    let t = x * 374761393 + y * 668265263 + seed;
    t = (t ^ (t >> 13)) * 1274126177;
    t ^= t >> 16;
    return (t >>> 0) / 4294967296;
  }

  /* ---- tip drawing ---- */
  function drawTip({
    ctx,
    x,
    y,
    w,
    shape,
    angleRad,
    color,
    alpha,
    grainTile,
    grainDepth,
    grainScale,
    grainRotateDeg,
    flatTop = false,
    plateau = 0.5, // inner flat-top fraction for core
  }: {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    w: number; // full width (diameter) of the stamp
    shape: ShapeCfg;
    angleRad: number;
    color: string;
    alpha: number;
    grainTile: GrainTile | null;
    grainDepth: number; // 0..1
    grainScale: number; // 0.25..4
    grainRotateDeg: number;
    flatTop?: boolean; // draw a flat-top (top-hat) mask?
    plateau?: number; // inner solid fraction (0..1)
  }) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);

    const size = Math.ceil(Math.max(2, w * 2));
    const off = document.createElement("canvas");
    off.width = off.height = size;
    const octx = off.getContext("2d")!;
    octx.translate(size / 2, size / 2);

    // Mask (soft edge or flat-top core)
    octx.save();
    drawTipMask(octx, shape, w, flatTop, plateau);
    octx.restore();

    // Tint
    octx.globalCompositeOperation = "source-in";
    octx.fillStyle = color;
    octx.globalAlpha = alpha;
    octx.fillRect(-size / 2, -size / 2, size, size);

    // Canvas-anchored grain (keeps texture fixed under the stroke)
    if (grainTile && grainDepth > 0) {
      octx.save();
      octx.globalCompositeOperation = "multiply";
      octx.globalAlpha = Math.max(0, Math.min(1, grainDepth));
      const pattern = octx.createPattern(grainTile.canvas, "repeat");
      const inv = 1 / Math.max(0.25, Math.min(4, grainScale));
      if (pattern && "setTransform" in pattern) {
        const mat = new DOMMatrix()
          .translateSelf(-x, -y) // lock to canvas space
          .rotateSelf(grainRotateDeg - (angleRad * 180) / Math.PI)
          .scaleSelf(inv, inv);
        (pattern as CanvasPattern).setTransform(mat);
        octx.fillStyle = pattern;
        octx.fillRect(-size / 2, -size / 2, size, size);
      } else {
        // fallback: per-stamp grain
        octx.rotate((grainRotateDeg * Math.PI) / 180);
        octx.scale(inv, inv);
        octx.fillStyle = pattern!;
        octx.fillRect(-size / 2 / inv, -size / 2 / inv, size / inv, size / inv);
      }
      octx.restore();
    }

    ctx.drawImage(off, -size / 2, -size / 2);
    ctx.restore();
  }

  function drawTipMask(
    ctx: CanvasRenderingContext2D,
    shape: ShapeCfg,
    w: number,
    flatTop = false,
    plateau = 0.5
  ) {
    const softness = Math.max(0, Math.min(1, (shape.softness ?? 0) / 100));
    const hardEdge = 1 - softness;

    ctx.save();
    // For oval/round we support a "flat-top" (top-hat) center to make the middle solid.
    const drawOval = (rx: number, ry: number) => {
      if (!flatTop) {
        const g = ctx.createRadialGradient(
          0,
          0,
          Math.min(rx, ry) * hardEdge,
          0,
          0,
          Math.max(rx, ry)
        );
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 1) Solid inner ellipse
        const innerRx = rx * plateau;
        const innerRy = ry * plateau;
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.beginPath();
        ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2);
        ctx.fill();
        // 2) Soft ring from inner → outer
        const g = ctx.createRadialGradient(
          0,
          0,
          innerRx,
          0,
          0,
          Math.max(rx, ry)
        );
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (shape.type === "round") {
      const r = w * 0.5;
      drawOval(r, r);
    } else if (shape.type === "oval") {
      const rx = w * 0.55;
      const ry = w * 0.32 * ((shape.roundness ?? 60) / 60);
      drawOval(rx, ry);
    } else if (shape.type === "chisel") {
      const rx = w * 0.65,
        ry = w * 0.22;
      const g = ctx.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0.5 - hardEdge * 0.5, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      g.addColorStop(0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    } else if (shape.type === "square") {
      const s = w * 0.4;
      const g = ctx.createRadialGradient(0, 0, s * hardEdge, 0, 0, s);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-s, -s, 2 * s, 2 * s);
    } else if (shape.type === "spray") {
      const r = w * 0.45,
        count = 20;
      ctx.fillStyle = "rgba(0,0,0,1)";
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        const size = (Math.random() * 0.25 + 0.1) * (1 - softness * 0.5);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, size * r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (shape.type === "charcoal") {
      const r = w * 0.48;
      ctx.fillStyle = "rgba(0,0,0,1)";
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
        const d = r * (0.6 + Math.random() * 0.4);
        const size = 0.03 + Math.random() * 0.08;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, size * r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Draw a thin *ring* (outer blob minus inner blob) tinted with `color`.
  function drawRingTip({
    ctx,
    x,
    y,
    outerW,
    innerW,
    angleRad,
    color,
    alpha,
    // use the same shape for outer/inner, but allow different softness
    shapeOuter,
    shapeInner,
  }: {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    outerW: number; // total width to the outer edge of the rim
    innerW: number; // width of the inner cutout (outerW - 2*rimThickness)
    angleRad: number;
    color: string;
    alpha: number;
    shapeOuter: ShapeCfg; // e.g. { type:"oval", roundness:58, softness:80 }
    shapeInner: ShapeCfg; // e.g. same but slightly softer (80–88)
  }) {
    if (alpha <= 0 || outerW <= 0.5 || innerW <= 0.5 || innerW >= outerW)
      return;

    const size = Math.ceil(outerW * 2);
    const off = document.createElement("canvas");
    off.width = off.height = size;
    const octx = off.getContext("2d")!;
    octx.translate(size / 2, size / 2);
    octx.rotate(angleRad);

    // 1) OUTER mask
    octx.save();
    drawTipMask(octx, shapeOuter, outerW);
    octx.restore();

    // 2) Punch INNER hole
    octx.save();
    octx.globalCompositeOperation = "destination-out";
    drawTipMask(octx, shapeInner, innerW);
    octx.restore();

    // 3) Tint the ring
    octx.globalCompositeOperation = "source-in";
    octx.globalAlpha = alpha;
    octx.fillStyle = color;
    octx.fillRect(-size / 2, -size / 2, size, size);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    ctx.drawImage(off, -size / 2, -size / 2);
    ctx.restore();
  }
}

/* ---- color helpers ---- */
type RGB = { r: number; g: number; b: number };
function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}
function hslToCss(h: HSL) {
  const hC = (h.h + 360) % 360;
  const sP = Math.max(0, Math.min(1, h.s)) * 100;
  const lP = Math.max(0, Math.min(1, h.l)) * 100;
  return `hsl(${hC} ${sP}% ${lP}%)`;
}
function jitterHsl(
  hsl: HSL,
  cfg: { h?: number; s?: number; l?: number },
  rand: () => number
): HSL {
  const jH = (cfg.h ?? 0) * (rand() - 0.5);
  const jS = (cfg.s ?? 0) * (rand() - 0.5);
  const jL = (cfg.l ?? 0) * (rand() - 0.5);
  return {
    h: hsl.h + jH,
    s: Math.max(0, Math.min(1, hsl.s + jS / 100)),
    l: Math.max(0, Math.min(1, hsl.l + jL / 100)),
  };
}
function hexToRgb(hex: string): RGB {
  const s = hex.replace("#", "");
  const v = parseInt(
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s,
    16
  );
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}
