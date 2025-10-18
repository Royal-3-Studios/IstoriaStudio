// FILE: src/lib/brush/core/input.ts
import type {
  BrushInputSample,
  RenderOverrides,
} from "@/lib/brush/engine.types";

/** Cross-browser tilt/azimuth extraction (safely returns partials). */
export function getAltitudeAzimuthFromPointer(e: PointerEvent): {
  altitudeDeg?: number; // 0..90
  azimuthRad?: number; // 0..2π
} {
  // iPadOS/Safari/Chromium: altitudeAngle (0..π/2), azimuthAngle (0..2π)
  const alt = (e as any).altitudeAngle as number | undefined;
  const azi = (e as any).azimuthAngle as number | undefined;
  if (typeof alt === "number" && typeof azi === "number") {
    return { altitudeDeg: (alt * 180) / Math.PI, azimuthRad: azi };
  }

  // Windows Pen: tiltX/tiltY (deg in [-90..90])
  const tiltX = (e as any).tiltX as number | undefined;
  const tiltY = (e as any).tiltY as number | undefined;
  if (typeof tiltX === "number" && typeof tiltY === "number") {
    const tx = (tiltX * Math.PI) / 180;
    const ty = (tiltY * Math.PI) / 180;
    const tanTx = Math.tan(tx);
    const tanTy = Math.tan(ty);
    const tanMag = Math.hypot(tanTx, tanTy);
    const altitudeRad = Math.atan(1 / Math.max(1e-6, tanMag)); // 0..π/2
    const azimuthRad = Math.atan2(tanTx, tanTy); // heuristic
    return { altitudeDeg: (altitudeRad * 180) / Math.PI, azimuthRad };
  }

  return {};
}

/** px/s between two time-stamped points (ms → px/s). */
export function speedPxPerSec(
  x0: number,
  y0: number,
  t0: number,
  x1: number,
  y1: number,
  t1: number
): number {
  const dt = Math.max(1, t1 - t0); // avoid div-by-zero
  const dx = x1 - x0,
    dy = y1 - y0;
  return (Math.hypot(dx, dy) * 1000) / dt;
}

/** Normalize raw pointer values into what the backends expect. */
export function toInputSample(
  pressureRaw: number | undefined,
  pxPerSec: number,
  altitudeDeg?: number,
  azimuthRad?: number,
  ov?: RenderOverrides
): BrushInputSample {
  const pressure = Math.max(0, Math.min(1, pressureRaw ?? 1));
  const ref = Math.max(1, ov?.speedNormRefPxPerSec ?? 1000);
  const speedNorm = Math.max(0, Math.min(1, pxPerSec / ref));

  // Side shading proxy from tilt (0 at 90°, 1 at 0°)
  let tiltShading: number | undefined;
  if (typeof altitudeDeg === "number") {
    const k = 1 - Math.min(90, Math.max(0, altitudeDeg)) / 90; // 0..1
    const exp = ov?.tiltSideShadingExp ?? 1.25;
    tiltShading = Math.pow(k, exp);
  }

  // With exactOptionalPropertyTypes: only include optional keys when defined
  const out: BrushInputSample = {
    pressure,
    speedNorm,
    ...(altitudeDeg != null ? { altitudeDeg } : {}),
    ...(azimuthRad != null ? { azimuthRad } : {}),
    ...(tiltShading != null ? { tiltShading } : {}),
  };
  return out;
}
