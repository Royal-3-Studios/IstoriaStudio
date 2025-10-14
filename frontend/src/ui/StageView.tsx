"use client";

import React, { useEffect, useRef } from "react";

export type DrawPaint = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
) => void | Promise<void>;

type Props = {
  /** Logical canvas size (unscaled), typically your preset W/H in CSS px. */
  width: number;
  height: number;

  /** Device pixel ratio cap you pass down (e.g. Math.min(window.dpr, 2)). */
  dpr?: number;

  /** Visual zoom multiplier applied on top of the logical W/H. */
  zoom?: number;

  /** Pan in logical px (pre-zoom). */
  pan?: { x: number; y: number };

  /** Your render callback (receives the scaled 2D ctx). */
  drawPaintAction: DrawPaint;

  /** Optional className for container div. */
  className?: string;

  /** Optional inline styles for container. */
  style?: React.CSSProperties;
};

const StageView: React.FC<Props> = ({
  width,
  height,
  dpr = 1,
  zoom = 1,
  pan = { x: 0, y: 0 },
  drawPaintAction,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Resize backing store + redraw when dims/zoom/dpr change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    const scalePx = Math.max(0.01, zoom);
    const scaleDpr = Math.max(0.5, dpr);

    // Backing store pixels
    const pixelW = Math.max(1, Math.floor(safeW * scalePx * scaleDpr));
    const pixelH = Math.max(1, Math.floor(safeH * scalePx * scaleDpr));
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset transform; apply dpr*zoom and pan
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scaleDpr * scalePx, scaleDpr * scalePx);
    if (pan.x || pan.y) ctx.translate(pan.x, pan.y);

    // Draw at logical units (your drawPaint uses preset W/H coordinates)
    const draw = () => {
      // guard if unmounted mid-raf
      if (!canvasRef.current) return;
      drawPaintAction(canvas, ctx as CanvasRenderingContext2D);
    };

    // schedule a single frame (keeps future room for throttling if needed)
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [width, height, dpr, zoom, pan.x, pan.y, drawPaintAction]);

  // Let parent control CSS size; default to logical*zoom if not set.
  const cssW = Math.max(1, Math.floor(width * (zoom || 1)));
  const cssH = Math.max(1, Math.floor(height * (zoom || 1)));

  return (
    <div
      className={className}
      style={{
        lineHeight: 0,
        width: cssW,
        height: cssH,
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

export default StageView;
