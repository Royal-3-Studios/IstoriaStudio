// FILE: src/lib/brush/pointer.ts
/* Pointer → RenderPathPoint helpers

* Guarantees:
* * t is **epoch ms**
* * pressure is present on both `p` and `pressure` in [0..1]
* * optional tilt/azimuth derived without writing `undefined`
* * coalesced events respected when available
    */

import type { RenderPathPoint } from "@/lib/brush/engine.types";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Convert DOMHighResTimeStamp to epoch ms (keeps Date.now() shape). */
export function toEpochMs(ts: number): number {
  // Already epoch-like?
  if (ts > 1e12) return Math.floor(ts);
  const origin =
    (typeof performance !== "undefined" &&
      (performance.timeOrigin as number | undefined)) ||
    Date.now() - performance.now();
  return Math.floor(origin + ts);
}

/** Compute stylus azimuth (radians), altitude (degrees), and a normalized tilt-shading. */
export function stylusAnglesFromTilt(
  tiltX?: number,
  tiltY?: number
): { azimuthRad?: number; altitudeDeg?: number; tiltShading?: number } {
  if (
    typeof tiltX !== "number" ||
    typeof tiltY !== "number" ||
    !Number.isFinite(tiltX) ||
    !Number.isFinite(tiltY)
  ) {
    return {};
  }
  // Spec: tiltX, tiltY in degrees, range [-90, 90]
  const mag = Math.hypot(tiltX, tiltY);
  const altitudeDeg = Math.max(0, Math.min(90, 90 - mag)); // 0 = parallel to surface, 90 = perpendicular
  const azimuthRad = Math.atan2(tiltX, tiltY); // clockwise from the y-axis
  const tiltShading = clamp01((90 - altitudeDeg) / 90); // 0 upright .. 1 fully on side
  return { azimuthRad, altitudeDeg, tiltShading };
}

/** Map a pointer-like event to a RenderPathPoint (optionally derive heading vs. `prev`). */
export function eventToRenderPoint(
  e: {
    clientX: number;
    clientY: number;
    pressure?: number;
    timeStamp?: number;
    tiltX?: number;
    tiltY?: number;
  },
  prev?: RenderPathPoint
): RenderPathPoint & { azimuthRad?: number; altitudeDeg?: number } {
  const p = clamp01(
    typeof e.pressure === "number" && Number.isFinite(e.pressure)
      ? e.pressure
      : 0.7 // pleasant fallback (matches adapters)
  );

  const t =
    typeof e.timeStamp === "number" && Number.isFinite(e.timeStamp)
      ? toEpochMs(e.timeStamp)
      : Date.now();

  const { azimuthRad, altitudeDeg } = stylusAnglesFromTilt(e.tiltX, e.tiltY);

  const out: RenderPathPoint & { azimuthRad?: number; altitudeDeg?: number } = {
    x: e.clientX,
    y: e.clientY,
    p,
    pressure: p,
    t,
  };

  if (typeof azimuthRad === "number") (out as any).azimuthRad = azimuthRad;
  if (typeof altitudeDeg === "number") (out as any).altitudeDeg = altitudeDeg;

  if (prev) {
    const dx = out.x - prev.x;
    const dy = out.y - prev.y;
    if (dx !== 0 || dy !== 0) out.angle = Math.atan2(dy, dx);
  }

  return out;
}

/**

* Collect coalesced pointer points (when available) and convert each to RenderPathPoint.
* If `prev` is provided, the first point’s heading will be derived against it; subsequent
* points derive heading against the immediately preceding coalesced point.
  */
export function collectCoalescedPoints(
  e: PointerEvent,
  prev?: RenderPathPoint
): Array<RenderPathPoint & { azimuthRad?: number; altitudeDeg?: number }> {
  const raw =
    typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;

  // Build a simple list of events to convert (coalesced if present, else the event itself)
  const list =
    raw && raw.length > 0
      ? raw
      : ([e] as unknown as Array<
          Pick<
            PointerEvent,
            "clientX" | "clientY" | "pressure" | "timeStamp" | "tiltX" | "tiltY"
          >
        >);

  const out: Array<
    RenderPathPoint & { azimuthRad?: number; altitudeDeg?: number }
  > = [];

  for (let i = 0; i < list.length; i++) {
    const ev = list[i]!;
    const reference = i === 0 ? prev : out[i - 1];
    out.push(
      eventToRenderPoint(
        {
          clientX: ev.clientX,
          clientY: ev.clientY,
          pressure: (ev as any).pressure,
          timeStamp: (ev as any).timeStamp,
          tiltX: (ev as any).tiltX,
          tiltY: (ev as any).tiltY,
        },
        reference
      )
    );
  }

  return out;
}
