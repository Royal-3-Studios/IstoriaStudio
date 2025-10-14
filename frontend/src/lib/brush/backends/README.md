# Backends README

A quick reference for brush backends: capabilities (`caps`), what they do with **tilt**, how they expect **DPR** to be handled, and adapter contracts. Keep this to hand when adding new variants or adapters.

---

## Shared contract (all backends)

- **DPR / Sizing**

  - The **engine** is the single source of truth for DPR. It sizes the target and sets the CSS-space transform.
  - Adapters **must not** do their own DPR math or create extra canvases. Use the engine-provided surface directly.
  - Helpers:

    - `ensureCanvasDprSize(canvas, cssW, cssH, dpr)` (engine-side)
    - `get2D(surface)` to obtain the context (CSS-space coordinates already active)

- **Input quality**

  - User “Stabilization” slider normalizes to:

    - `predictPx`, `speedToSpacing`, `minStepPx` (sampling)
    - optional `speedSmoothingMs` (velocity filtering)

  - Don’t invent per-backend smoothing unless strictly necessary. Prefer the shared samplers.

- **Path points**

  - `RenderPathPoint`: `{ x, y, p|pressure, t?, angle?, tilt? }`
  - Handle missing `tilt` gracefully (`0`).

- **Grain**

  - `engine.grain`: `{ kind: "none"|"paper"|"canvas"|"noise", depth, scale, rotate, motion }`
  - `motion`: `"paperLocked" | "tipLocked" | "smudgeLocked" | "animated"`

- **Overrides**

  - Cross-backend overrides live in `engine.overrides` (small, stable surface).
  - Deep knobs live under `engine.backendOverrides.<backend>`.

---

## Capabilities (`caps`) quick map

| Backend  | Typical `caps`                                        |
| -------- | ----------------------------------------------------- |
| stamping | `flow, tilt, rotation, angle, grainMotion, worker`    |
| ribbon   | `flow, tilt, rotation, angle, worker`                 |
| spray    | `flow, tilt, worker`                                  |
| wet      | `wet, flow, tilt, worker`                             |
| smudge   | `smudge, flow, tilt, worker`                          |
| particle | `flow, tilt, worker`                                  |
| pattern  | `flow, tilt, grainMotion, worker`                     |
| impasto  | `flow, tilt, rotation, heightfield, lighting, worker` |

> Backends should advertise only what they actually use; toggle `tilt`/`rotation` to `false` if not wired yet.

---

## Tilt usage cheatsheet

- **Common routing knobs (in `overrides`):**

  - `tiltToSize` — increases overall size with tilt (0..1 gain)
  - `tiltToFan` — increases anisotropy (flattening / splay) with tilt
  - `tiltToGrainScale` — scales grain texture with tilt
  - `tiltToEdgeNoise` — increases edge carve/noise with tilt

- **Per-backend conventions:**

  - **stamping**: tilt→grain scale / edge noise; calligraphy nibs may use tilt→fan/rotation if variant chooses.
  - **ribbon**: tilt→fan (chisel look), optional tilt→size; calligraphy variant biases nib angle toward stroke direction as tilt increases.
  - **spray**: tilt→elliptical footprint (major/minor spread along tangent); optional tilt→size.
  - **wet**: (optional) tilt→diffusion bias / pickup direction (if enabled).
  - **smudge**: (optional) tilt→smudge directionality / brush footprint skew.
  - **particle**: (optional) tilt→emission cone / particle scale.
  - **pattern**: tilt→pattern rotation/scale when `grainMotion !== "paperLocked"`.
  - **impasto**:

    - bristle: tilt→bristle fan (splay) + subtle height/alpha boost
    - knife: tilt→plate fan + rake angle bias (+/- ~18° cap)

---

## DPR expectations (per backend)

All backends draw in **CSS-space** coordinates onto the engine-sized surface:

- Never set `ctx.scale` in backends/adapters.
- If a backend needs temporary layers, use `createLayer(widthPx, heightPx)` and draw at **device pixels** only inside that private layer, or use a CSS-aware helper you already have (e.g., `createLayer2D(cssW, cssH, dpr)`) if provided by your utils.

---

## Backend specifics

### Stamping

- **Purpose**: Discrete stamps along a path (graphite/charcoal/marker/etc.).
- **Caps**: `flow`, `tilt`, `rotation`, `angle`, `grainMotion`, `worker`.
- **Tilt**:

  - Graphite/Charcoal variants read `tiltToGrainScale`, `tiltToEdgeNoise`.
  - Split nibs can optionally use `tiltToSplitFan`.

- **Notes**:

  - Use `pathToStamps` for spacing, jitter, taper; avoid custom resamplers.
  - Grain motion must honor `engine.grain.motion`.

### Ribbon

- **Purpose**: Solid ribbon stroke with width profile (pencil/ink/calligraphy).
- **Caps**: `flow`, `tilt`, `rotation`, `angle`, `worker`.
- **Tilt**:

  - `tiltToFan`: widen vs. narrow across tangent.
  - `tiltToSize`: optional size growth.
  - Calligraphy: bias nib angle toward stroke direction with tilt.

- **Notes**:

  - Build polygonal ribbon outlines from resampled path; fill on temp layer to apply `flow` then composite with `opacity`.

### Spray

- **Purpose**: Airbrush/splatter/nozzle stochastic droplets.
- **Caps**: `flow`, `tilt`, `worker`.
- **Tilt**:

  - Elliptical scatter oriented by tangent; fan grows with tilt.
  - Optional `tiltToSize`.

- **Notes**:

  - Use a mask+color layer; clip and multiply grain if requested.

### Wet

- **Purpose**: Diffusion/edges/pooling watercolor-ish.
- **Caps**: `wet`, `flow`, `tilt?`, `worker`.
- **Tilt**:

  - Optional directional bias for diffusion or pickup if you wire it.

- **Notes**:

  - Respect `engine.rendering.wetEdges`.

### Smudge

- **Purpose**: Pickup/laydown pipeline with blur/spacing controls.
- **Caps**: `smudge`, `flow`, `tilt?`, `worker`.
- **Tilt**:

  - Optional directional bias & footprint skew.

- **Notes**:

  - Use shared smudge defaults from engine overrides (`smudgeStrength`, etc.) when present.

### Particle

- **Purpose**: Emissive particles (trail/smoke/sparkle).
- **Caps**: `flow`, `tilt?`, `worker`.
- **Tilt**:

  - Optional emission cone alignment and scale modulation.

- **Notes**:

  - Prefer engine’s path sampling; only do your own if the effect truly requires it (document deviations).

### Pattern

- **Purpose**: Pattern/picture stampers and fills.
- **Caps**: `flow`, `tilt`, `grainMotion`, `worker`.
- **Tilt**:

  - Rotate/scale patterns with tilt when motion isn’t paper-locked.

- **Notes**:

  - Honor `engine.grain.*` consistently; avoid bespoke pattern transforms.

### Impasto

- **Purpose**: Heightfield + lighting (bristle/knife/glaze/rake).
- **Caps**: `flow`, `tilt`, `rotation`, `heightfield`, `lighting`, `worker`.
- **Tilt**:

  - **bristle**: tilt→fan & subtle depth bias.
  - **knife**: tilt→fan & rake angle bias.

- **Notes**:

  - Synthesize height on an offscreen, blur/tone-map, then shade & specular compose.

---

## Adapters: do’s and don’ts

**Do**

- Convert incoming points to `RenderPathPoint` (copy pressure into `p` and `pressure`).
- Merge `extra.overrides` / `extra.strokePath` without writing `undefined`.
- Pass the engine-configured **surface** straight to the backend.

**Don’t**

- Create canvases in adapters (no `new OffscreenCanvas()` / `document.createElement('canvas')`).
- Apply DPR transforms or `ctx.scale` in adapters.
- Implement custom smoothing in adapters (unless documented and unavoidable).

---

## Troubleshooting

- **Edge carve looks inconsistent** → verify `grain.motion` and `tiltToEdgeNoise` aren’t fighting each other (charcoal vs. graphite defaults differ).
- **Jagged spacing at speed** → check preset “Stabilization” normalization; ensure `speedToSpacing` is reaching the path sampler.
- **Softness changes with zoom** → adapter likely applied its own DPR; remove it and rely on engine sizing.
- **Type errors with `exactOptionalPropertyTypes`** → never assign `undefined` fields; only include keys when values are defined. Use `pruneUndefined`.

---

## Adding a new backend

1. Define backend-specific overrides under `engine.backendOverrides.<name>`.
2. Add a small adapter that:

   - normalizes `extra.*` into `engine` fields,
   - converts `path` into `RenderPathPoint[]`,
   - calls the backend’s `drawToCanvas(surface, renderOpts)`.

3. Declare truthful `caps`.
4. Document tilt/DPR expectations here.

---

_Last updated: keep this file in sync when you change overrides, grain motion, or tilt routing._
