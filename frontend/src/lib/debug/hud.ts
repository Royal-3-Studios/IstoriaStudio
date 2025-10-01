// FILE: src/lib/debug/hud.ts
"use client";

import { create } from "zustand";

/* ----------------------------- your original types ----------------------------- */
export type HudMetrics = {
  fps?: number; // frames per second
  frameMs?: number; // last frame time
  strokeMs?: number; // last stroke render time
  workerRttMs?: number; // ping round-trip to worker
  workerQueue?: number; // pending jobs in your queue, if any
  stampsPerSec?: number; // optional: computed in backends
};

export type Hud = {
  el: HTMLDivElement;
  show(): void;
  hide(): void;
  destroy(): void;
  update(m: HudMetrics): void;
};

function safeNumber(v: unknown, digits = 1): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function createNoopHud(): Hud {
  const el = (
    typeof document !== "undefined"
      ? document.createElement("div")
      : ({} as HTMLDivElement)
  ) as HTMLDivElement;

  return {
    el,
    show() {},
    hide() {},
    destroy() {},
    update() {},
  };
}

export function createHud(
  parent: HTMLElement | null = typeof document !== "undefined"
    ? document.body
    : null
): Hud {
  if (typeof document === "undefined" || !parent) {
    return createNoopHud();
  }

  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("data-debug-hud", "");
  el.style.position = "fixed";
  el.style.right = "8px";
  el.style.top = "8px";
  el.style.zIndex = "2147483647";
  el.style.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  el.style.background = "rgba(0,0,0,0.65)";
  el.style.color = "#fff";
  el.style.padding = "8px 10px";
  el.style.borderRadius = "10px";
  el.style.pointerEvents = "none";
  el.style.whiteSpace = "pre";
  el.style.backdropFilter = "blur(4px)";
  el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.25)";
  el.hidden = false;

  const lines = {
    fps: document.createElement("div"),
    frame: document.createElement("div"),
    stroke: document.createElement("div"),
    worker: document.createElement("div"),
    queue: document.createElement("div"),
    stamps: document.createElement("div"),
    hint: document.createElement("div"),
  };

  el.appendChild(lines.fps);
  el.appendChild(lines.frame);
  el.appendChild(lines.stroke);
  el.appendChild(lines.worker);
  el.appendChild(lines.queue);
  el.appendChild(lines.stamps);
  el.appendChild(lines.hint);
  lines.hint.style.opacity = "0.6";
  lines.hint.style.marginTop = "4px";
  lines.hint.textContent = "Toggle: Ctrl/Cmd+Shift+H";

  parent.appendChild(el);

  function update(m: HudMetrics) {
    lines.fps.textContent = `FPS: ${safeNumber(m.fps, 0)}`;
    lines.frame.textContent = `Frame: ${safeNumber(m.frameMs, 2)} ms`;
    lines.stroke.textContent = `Stroke: ${safeNumber(m.strokeMs, 2)} ms`;
    lines.worker.textContent = `Worker RTT: ${safeNumber(m.workerRttMs, 2)} ms`;
    lines.queue.textContent = `Worker Queue: ${
      typeof m.workerQueue === "number" ? m.workerQueue : "—"
    }`;
    lines.stamps.textContent = `Stamps/s: ${safeNumber(m.stampsPerSec, 0)}`;
  }

  return {
    el,
    show() {
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
    },
    destroy() {
      el.remove();
    },
    update,
  };
}

/* Optional FPS tracker you can wire in your render loop */
export function createFpsTracker() {
  const perfNow =
    typeof performance !== "undefined" && performance && performance.now
      ? () => performance.now()
      : () => Date.now();

  let last = perfNow();
  let acc = 0;
  let frames = 0;
  let fps = 0;
  let frameMs = 0;

  function tick(): { fps: number; frameMs: number } {
    const now = perfNow();
    frameMs = now - last;
    last = now;
    acc += frameMs;
    frames += 1;
    if (acc >= 500) {
      // half-second window
      fps = (frames * 1000) / acc;
      acc = 0;
      frames = 0;
    }
    return { fps, frameMs };
  }

  return { tick };
}

/* ------------------------ NEW: global store + bridge ------------------------ */

type PerfHudState = {
  visible: boolean;
  metrics: HudMetrics;
  toggleVisible: () => void;
  setMetrics: (m: HudMetrics) => void;
};

export const perfHudStore = create<PerfHudState>((set) => ({
  visible: false,
  metrics: {},
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  setMetrics: (m) => set(() => ({ metrics: m })),
}));

/** Public helper to push metrics from anywhere (workers, paint loop, etc.). */
export function setPerfMetrics(m: HudMetrics): void {
  perfHudStore.getState().setMetrics(m);
}

/** Attach a singleton DOM HUD and keep it synced with the store. Call once. */
let __hudSingleton: Hud | null = null;
let __unsub: (() => void) | null = null;

export function ensureHudAttached(parent?: HTMLElement | null): void {
  if (typeof document === "undefined") return;

  if (!__hudSingleton) {
    __hudSingleton = createHud(parent ?? document.body);
  }
  if (!__unsub) {
    __unsub = perfHudStore.subscribe((s) => {
      // visibility
      if (__hudSingleton) {
        if (s.visible) __hudSingleton.show();
        else __hudSingleton.hide();
        // metrics
        __hudSingleton.update(s.metrics);
      }
    });
  }
}
