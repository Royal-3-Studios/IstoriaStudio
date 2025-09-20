// src/lib/brush/backends/utils/events.ts
//
// Pointer aggregation for brush strokes.
// Emits normalized points in CSS pixel space. Safe to use with a <canvas> that
// draws with DPR transforms (engine handles DPR; we keep input in CSS px).
//
// You can move this file out of "backends" later (e.g., src/lib/input/events.ts)

type StrokePhase = "start" | "move" | "end" | "cancel";

type KnownPointer = "mouse" | "pen" | "touch" | "unknown";
function toPointerType(pt: string | undefined): KnownPointer {
  return pt === "mouse" || pt === "pen" || pt === "touch" ? pt : "unknown";
}

/** Matches your engine's RenderPathPoint shape. */
export type InputPoint = {
  x: number; // CSS px
  y: number; // CSS px
  time: number; // ms (performance.now())
  pressure?: number; // 0..1
  tilt?: number; // 0..1 (altitude mapped to 0..1)
  angle?: number; // degrees (azimuth heading), 0..360
  speed?: number; // 0..1 normalized speed (smoothed)
};

export type StrokeEvent = {
  phase: StrokePhase;
  pointerType: "mouse" | "pen" | "touch" | "unknown";
  points: InputPoint[]; // full stroke so far (append-only)
  point: InputPoint; // the newest point
  isCoalesced?: boolean;
};

export type StrokeCallbacks = {
  onStart?: (ev: StrokeEvent) => void;
  onMove?: (ev: StrokeEvent) => void;
  onEnd?: (ev: StrokeEvent) => void;
  onCancel?: (ev: StrokeEvent) => void;
};

export type StrokeOptions = {
  /** EMA smoothing time constant for speed (ms). 0 disables smoothing. */
  speedSmoothingMs?: number; // default 30
  /** Clamp for speed normalization (px/ms). 0 uses adaptive. */
  speedMaxPxPerMs?: number; // default 1.2 (≈1200 px/s)
  /** Minimum distance (CSS px) to record a new point (reduces noise). */
  minDistance?: number; // default 0.3
  /** Prevent default on pen/touch to avoid page scrolling/zooming. */
  preventDefault?: boolean; // default true
};

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function hypot2(dx: number, dy: number) {
  return Math.hypot(dx, dy);
}

function getCanvasCssPoint(
  target: HTMLElement,
  clientX: number,
  clientY: number
) {
  const r = target.getBoundingClientRect();
  // Return CSS pixel coordinates relative to the canvas’s top-left corner.
  return { x: clientX - r.left, y: clientY - r.top };
}

/** Map PointerEvent to pressure/tilt/angle with safe fallbacks. */
function readStylusProps(e: PointerEvent) {
  // Pressure: 0..1; mouse often reports 0 or 0.5 when buttons are down.
  const pressure =
    typeof e.pressure === "number" ? clamp01(e.pressure) : e.buttons ? 1 : 0;
  // Altitude (tilt magnitude): prefer tiltX/Y if altitudeAngle not available.
  // W3C: tiltX/Y ∈ [-90,+90]. We map to 0..1 where 1 = upright (altitude=90°), 0 = flat.
  let tilt = 1;
  if (typeof e.altitudeAngle === "number") {
    const alt = e.altitudeAngle as number; // radians [0..π/2]
    tilt = clamp01(alt / (Math.PI / 2));
  } else if (typeof e.tiltX === "number" && typeof e.tiltY === "number") {
    const ax = e.tiltX * (Math.PI / 180);
    const ay = e.tiltY * (Math.PI / 180);
    // Approx altitude from tilt magnitude:
    const t = Math.max(Math.abs(ax), Math.abs(ay)); // crude but stable
    const alt = Math.PI / 2 - t;
    tilt = clamp01(alt / (Math.PI / 2));
  }

  // Azimuth heading in degrees [0..360)
  let angle = 0;
  if (typeof e.azimuthAngle === "number") {
    angle = (e.azimuthAngle as number) * (180 / Math.PI);
  } else if (typeof e.twist === "number") {
    // twist is not azimuth but sometimes correlates; leave as 0 if not available
    angle = 0;
  }

  return { pressure, tilt, angle: ((angle % 360) + 360) % 360 };
}

/**
 * Tracks a single active pointer stroke on a target element (usually a canvas).
 * - Uses pointer capture to keep receiving events outside bounds.
 * - Coalesced events are consumed when available for high-resolution paths.
 */
export class PointerStrokeTracker {
  private target: HTMLElement;
  private opts: Required<StrokeOptions>;
  private cbs: StrokeCallbacks;

  private activeId: number | null = null;
  private points: InputPoint[] = [];
  private lastTime = 0;
  private lastX = 0;
  private lastY = 0;
  private emaSpeed = 0; // smoothed px/ms

  constructor(
    target: HTMLElement,
    callbacks: StrokeCallbacks,
    options?: StrokeOptions
  ) {
    this.target = target;
    this.cbs = callbacks;
    this.opts = {
      speedSmoothingMs: options?.speedSmoothingMs ?? 30,
      speedMaxPxPerMs: options?.speedMaxPxPerMs ?? 1.2, // ~1200 px/s
      minDistance: options?.minDistance ?? 0.3,
      preventDefault: options?.preventDefault ?? true,
    };
    this.handleDown = this.handleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);
    this.handleCancel = this.handleCancel.bind(this);

    // Passive must be false to allow preventDefault on touch/pen.
    target.addEventListener("pointerdown", this.handleDown, { passive: false });
  }

  destroy() {
    this.target.removeEventListener("pointerdown", this.handleDown);
    // If still active, also remove move/up listeners
    window.removeEventListener("pointermove", this.handleMove);
    window.removeEventListener("pointerup", this.handleUp);
    window.removeEventListener("pointercancel", this.handleCancel);
  }

  private handleDown(e: PointerEvent) {
    if (this.activeId !== null) return; // single-stroke tracker
    if (
      this.opts.preventDefault &&
      (e.pointerType === "pen" || e.pointerType === "touch")
    ) {
      e.preventDefault();
    }

    this.activeId = e.pointerId;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }

    const { x, y } = getCanvasCssPoint(this.target, e.clientX, e.clientY);
    const t = performance.now();
    const { pressure, tilt, angle } = readStylusProps(e);

    this.points = [];
    this.emaSpeed = 0;
    this.lastTime = t;
    this.lastX = x;
    this.lastY = y;

    const p: InputPoint = { x, y, time: t, pressure, tilt, angle, speed: 0 };
    this.points.push(p);

    const ev: StrokeEvent = {
      phase: "start",
      pointerType: toPointerType(e.pointerType) || "unknown",
      points: this.points,
      point: p,
    };
    this.cbs.onStart?.(ev);

    // Attach move/up/cancel until stroke ends
    window.addEventListener("pointermove", this.handleMove, { passive: false });
    window.addEventListener("pointerup", this.handleUp, { passive: false });
    window.addEventListener("pointercancel", this.handleCancel, {
      passive: false,
    });
  }

  private pushPoint(e: PointerEvent, isCoalesced: boolean) {
    const { x, y } = getCanvasCssPoint(this.target, e.clientX, e.clientY);
    const t = performance.now();
    const dt = Math.max(0.0001, t - this.lastTime); // ms
    const dx = x - this.lastX,
      dy = y - this.lastY;
    const dist = hypot2(dx, dy); // CSS px

    if (!isCoalesced && dist < this.opts.minDistance && dt < 8) return; // tiny jitter

    // instantaneous speed in px/ms
    const inst = dist / dt;

    // EMA smoothing (convert time constant to alpha per sample)
    let spd = inst;
    if (this.opts.speedSmoothingMs > 0) {
      const alpha = dt / (this.opts.speedSmoothingMs + dt);
      this.emaSpeed = this.emaSpeed + alpha * (inst - this.emaSpeed);
      spd = this.emaSpeed;
    }

    const { pressure, tilt, angle } = readStylusProps(e);

    this.lastTime = t;
    this.lastX = x;
    this.lastY = y;

    const normSpeed =
      this.opts.speedMaxPxPerMs > 0
        ? Math.min(1, spd / this.opts.speedMaxPxPerMs)
        : spd; // if 0, leave unnormalized (unlikely)

    const p: InputPoint = {
      x,
      y,
      time: t,
      pressure,
      tilt,
      angle,
      speed: normSpeed,
    };
    this.points.push(p);

    const ev: StrokeEvent = {
      phase: "move",
      pointerType: toPointerType(e.pointerType) || "unknown",
      points: this.points,
      point: p,
      isCoalesced,
    };
    this.cbs.onMove?.(ev);
  }

  private handleMove(e: PointerEvent) {
    if (this.activeId == null || e.pointerId !== this.activeId) return;
    if (
      this.opts.preventDefault &&
      (e.pointerType === "pen" || e.pointerType === "touch")
    ) {
      e.preventDefault();
    }

    // Use coalesced events for high-resolution input when available (e.g., Chrome/Windows Ink).
    const coalesced =
      typeof e.getCoalescedEvents === "function"
        ? e.getCoalescedEvents()
        : null;

    if (coalesced && coalesced.length) {
      for (const ce of coalesced as PointerEvent[]) {
        this.pushPoint(ce, true);
      }
    } else {
      this.pushPoint(e, false);
    }
  }

  private finish(e: PointerEvent, phase: "end" | "cancel") {
    if (this.activeId == null || e.pointerId !== this.activeId) return;

    const { x, y } = getCanvasCssPoint(this.target, e.clientX, e.clientY);
    const t = performance.now();
    const { pressure, tilt, angle } = readStylusProps(e);

    const p: InputPoint = {
      x,
      y,
      time: t,
      pressure,
      tilt,
      angle,
      speed: this.emaSpeed,
    };
    // Only append if it actually moved a bit since last
    const last = this.points[this.points.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) {
      this.points.push(p);
    }

    const ev: StrokeEvent = {
      phase,
      pointerType: toPointerType(e.pointerType) || "unknown",
      points: this.points,
      point: this.points[this.points.length - 1],
    };
    if (phase === "end") this.cbs.onEnd?.(ev);
    else this.cbs.onCancel?.(ev);

    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    this.activeId = null;
    window.removeEventListener("pointermove", this.handleMove);
    window.removeEventListener("pointerup", this.handleUp);
    window.removeEventListener("pointercancel", this.handleCancel);
  }

  private handleUp(e: PointerEvent) {
    if (
      this.opts.preventDefault &&
      (e.pointerType === "pen" || e.pointerType === "touch")
    ) {
      e.preventDefault();
    }
    this.finish(e, "end");
  }

  private handleCancel(e: PointerEvent) {
    if (
      this.opts.preventDefault &&
      (e.pointerType === "pen" || e.pointerType === "touch")
    ) {
      e.preventDefault();
    }
    this.finish(e, "cancel");
  }

  /** Retrieve the current stroke points (immutable copy). */
  getPoints(): ReadonlyArray<InputPoint> {
    return this.points;
  }

  /** Whether a stroke is currently active. */
  isActive(): boolean {
    return this.activeId !== null;
  }
}
