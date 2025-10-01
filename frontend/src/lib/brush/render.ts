// FILE: src/lib/brush/render.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { normalizeOptions } from "@/lib/brush/engine/normalize";

// Backends (import only the ones you support today)
import drawStamping from "@/lib/brush/backends/stamping";
// import drawWet from "@/lib/brush/backends/wet";
// import drawSmudge from "@/lib/brush/backends/smudge";
// import drawSpray from "@/lib/brush/backends/spray";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Render a stroke into an existing 2D context */
export function renderStroke(ctx: Ctx2D, options: RenderOptions): void {
  const opt = normalizeOptions(options);

  switch (opt.engine.backend) {
    case "stamping":
    case "auto": // you can default to stamping when auto
      drawStamping(ctx, opt);
      break;

    // case "wet":
    //   drawWet(ctx as any, opt);
    //   break;

    // case "smudge":
    //   drawSmudge(ctx as any, opt);
    //   break;

    // case "spray":
    //   drawSpray(ctx as any, opt);
    //   break;

    default:
      // Conservative fallback
      drawStamping(ctx, opt);
      break;
  }
}

/** Convenience: render directly to a canvas/offscreencanvas */
export function renderStrokeToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: RenderOptions
): void {
  const ctx = canvas.getContext("2d", { alpha: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return;
  renderStroke(ctx, options);
}
