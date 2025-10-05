// FILE: src/lib/brush/render.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { normalizeOptions } from "@/lib/brush/engine/normalize";

import drawStamping from "@/lib/brush/backends/stamping";
import drawWet from "@/lib/brush/backends/wet";
import drawSmudge from "@/lib/brush/backends/smudge";
import drawSpray from "@/lib/brush/backends/spray";
import drawRibbon from "@/lib/brush/backends/ribbon";
import drawParticle from "@/lib/brush/backends/particle";
import renderPattern from "@/lib/brush/backends/pattern";
import drawImpasto from "@/lib/brush/backends/impasto";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function renderStroke(ctx: Ctx2D, options: RenderOptions): void {
  const opt = normalizeOptions(options);
  switch (opt.engine.backend) {
    case "stamping":
      drawStamping(ctx, opt);
      break;
    case "wet":
      drawWet(ctx, opt);
      break;
    case "smudge":
      drawSmudge(ctx, opt);
      break;
    case "spray":
      drawSpray(ctx, opt);
      break;
    case "ribbon":
      drawRibbon(ctx, opt);
      break;
    case "particle":
      drawParticle(ctx, opt);
      break;
    case "pattern":
      renderPattern(ctx, opt);
      break;
    case "impasto":
      drawImpasto(ctx, opt);
      break;
    case "auto":
    default:
      // conservative fallback
      drawStamping(ctx, opt);
  }
}
