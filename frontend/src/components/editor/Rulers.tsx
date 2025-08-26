// src/components/editor/Rulers.tsx
"use client";

import { useEffect, useRef } from "react";

type RulersProps = {
  widthPx: number; // stage pixel width (at current zoom)
  heightPx: number; // stage pixel height (at current zoom)
  scalePxPerUnit: number; // how many screen pixels per "design pixel"
};

export default function Rulers({
  widthPx,
  heightPx,
  scalePxPerUnit,
}: RulersProps) {
  const topRef = useRef<HTMLCanvasElement | null>(null);
  const leftRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    drawTop();
    drawLeft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthPx, heightPx, scalePxPerUnit]);

  function niceStep(pxPerUnit: number) {
    // choose a "nice" step in design pixels that lands ~50–120 device px apart
    const targetPx = 80;
    const raw = targetPx / pxPerUnit;
    const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const candidates = [1, 2, 5, 10];
    let best = pow10;
    let minDiff = Infinity;
    for (const c of candidates) {
      const step = c * pow10;
      const px = step * pxPerUnit;
      const diff = Math.abs(px - targetPx);
      if (diff < minDiff) {
        minDiff = diff;
        best = step;
      }
    }
    return best; // in design pixels
  }

  function drawTop() {
    const canvas = topRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const h = 24; // CSS pixels
    canvas.width = Math.max(1, Math.floor(widthPx * dpr));
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // background
    ctx.fillStyle = "rgba(245,245,245,0.95)";
    ctx.fillRect(0, 0, widthPx, h);
    ctx.strokeStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(widthPx, h - 0.5);
    ctx.stroke();

    // ticks
    const stepUnits = niceStep(scalePxPerUnit); // design px per major tick
    const stepPx = stepUnits * scalePxPerUnit;

    ctx.fillStyle = "#666";
    ctx.strokeStyle = "#bbb";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    for (let x = 0; x <= widthPx + 1; x += stepPx) {
      // major tick
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, 0);
      ctx.stroke();

      // label (design px)
      const label = Math.round(x / scalePxPerUnit).toString();
      ctx.fillText(label, x, 2);

      // minor ticks between majors (5)
      const minor = stepPx / 5;
      for (let i = 1; i < 5; i++) {
        const mx = x + minor * i;
        if (mx > widthPx) break;
        ctx.beginPath();
        ctx.moveTo(mx, h);
        ctx.lineTo(mx, h * 0.5);
        ctx.stroke();
      }
    }
  }

  function drawLeft() {
    const canvas = leftRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 24; // CSS pixels
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.max(1, Math.floor(heightPx * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${heightPx}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // background
    ctx.fillStyle = "rgba(245,245,245,0.95)";
    ctx.fillRect(0, 0, w, heightPx);
    ctx.strokeStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(w - 0.5, 0);
    ctx.lineTo(w - 0.5, heightPx);
    ctx.stroke();

    // ticks
    const stepUnits = niceStep(scalePxPerUnit);
    const stepPx = stepUnits * scalePxPerUnit;

    ctx.fillStyle = "#666";
    ctx.strokeStyle = "#bbb";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    for (let y = 0; y <= heightPx + 1; y += stepPx) {
      // major tick
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      // label
      const label = Math.round(y / scalePxPerUnit).toString();
      ctx.fillText(label, 2, y);

      // minor ticks (5)
      const minor = stepPx / 5;
      for (let i = 1; i < 5; i++) {
        const my = y + minor * i;
        if (my > heightPx) break;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, my);
        ctx.lineTo(w, my);
        ctx.stroke();
      }
    }
  }

  // wrapper covers top and left edges; consumer should position it
  return (
    <>
      <canvas ref={topRef} />
      <canvas ref={leftRef} />
    </>
  );
}
