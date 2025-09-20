import type { PixelBuf } from "@/lib/brush/core/types";
import {
  sampleNearest,
  sampleBilinear,
  sampleBilinearLinear,
  type WrapMode,
} from "./sampler";

/* ============================== Type guards ============================== */

function isPixelBuf(x: unknown): x is PixelBuf {
  return (
    !!x &&
    typeof (x as PixelBuf).width === "number" &&
    typeof (x as PixelBuf).height === "number" &&
    (x as PixelBuf).data instanceof Uint8ClampedArray
  );
}

function hasNaturalSize(x: unknown): x is HTMLImageElement {
  return (
    typeof HTMLImageElement !== "undefined" && x instanceof HTMLImageElement
  );
}

function isImageBitmapLike(x: unknown): x is ImageBitmap {
  // In some environments ImageBitmap may be undefined
  return typeof ImageBitmap !== "undefined" && x instanceof ImageBitmap;
}

function isImageDataLike(x: unknown): x is ImageData {
  return typeof ImageData !== "undefined" && x instanceof ImageData;
}

function isOffscreenCanvas(x: unknown): x is OffscreenCanvas {
  return typeof OffscreenCanvas !== "undefined" && x instanceof OffscreenCanvas;
}

function isCanvas2DContext(
  ctx:
    | RenderingContext
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
): ctx is OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  return (
    !!ctx &&
    typeof (ctx as CanvasRenderingContext2D).getImageData === "function"
  );
}

/* ============================== Core types ============================== */

export type TextureSource =
  | string // URL
  | HTMLImageElement
  | ImageBitmap
  | ImageData
  | PixelBuf;

export type Texture = {
  id: string;
  width: number;
  height: number;
  pixels: PixelBuf; // sRGB bytes (Uint8ClampedArray RGBA)
  wrapMode: WrapMode; // default sampler wrap
};

export type SampleRGBA8 = { r: number; g: number; b: number; a: number }; // sRGB bytes (floats 0..255)
export type SampleLinear = { r: number; g: number; b: number; a: number }; // linear floats 0..1

/* ============================== Helpers ============================== */

function createPixelBuf(
  width: number,
  height: number,
  data?: Uint8ClampedArray
): PixelBuf {
  return {
    width,
    height,
    data: data ?? new Uint8ClampedArray(width * height * 4),
  };
}

function imageDataToPixelBuf(img: ImageData): PixelBuf {
  // Copy to avoid external mutation
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}

function getBitmapSize(bmp: ImageBitmap | HTMLImageElement): {
  w: number;
  h: number;
} {
  if (isImageBitmapLike(bmp)) return { w: bmp.width, h: bmp.height };
  const img = bmp as HTMLImageElement;
  return {
    w: img.naturalWidth || img.width,
    h: img.naturalHeight || img.height,
  };
}

/**
 * Draw an ImageBitmap/HTMLImageElement into a canvas (Offscreen if available)
 * and return that canvas.
 */
function canvasFromBitmap(
  bmp: ImageBitmap | HTMLImageElement
): HTMLCanvasElement | OffscreenCanvas {
  const { w, h } = getBitmapSize(bmp);
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    if (!isCanvas2DContext(ctx))
      throw new Error("OffscreenCanvas 2D context unavailable");
    ctx.drawImage(bmp as CanvasImageSource, 0, 0);
    return c;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bmp as CanvasImageSource, 0, 0);
  return c;
}

/** Extract ImageData from a (Offscreen)Canvas 2D context and wrap as PixelBuf. */
function pixelBufFromCanvas(c: HTMLCanvasElement | OffscreenCanvas): PixelBuf {
  const ctx = c.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  const w = isOffscreenCanvas(c) ? c.width : (c as HTMLCanvasElement).width;
  const h = isOffscreenCanvas(c) ? c.height : (c as HTMLCanvasElement).height;
  const img = ctx.getImageData(0, 0, w, h);
  return imageDataToPixelBuf(img);
}

async function imageBitmapFromURL(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok)
    throw new Error(`Failed to fetch texture: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

function textureIdForSource(src: TextureSource): string {
  if (typeof src === "string") return `url:${src}`;
  if (isImageBitmapLike(src))
    return `bitmap:${src.width}x${src.height}:${(src as object as { _id?: string })?._id ?? ""}`;
  if (hasNaturalSize(src))
    return `img:${src.naturalWidth}x${src.naturalHeight}:${(src as object as { _id?: string })?._id ?? ""}`;
  if (isImageDataLike(src))
    return `data:${src.width}x${src.height}:${src.data.byteLength}`;
  if (isPixelBuf(src))
    return `pix:${src.width}x${src.height}:${src.data.byteLength}`;
  return "unknown";
}

/* ============================== Cache ============================== */

// Cache object sources by identity; URLs by string.
const cacheByObject = new WeakMap<object, Texture>();
const cacheByURL = new Map<string, Texture>();

/* ============================== Public API ============================== */

/** Load or wrap a texture source into a normalized Texture with caching. */
export async function loadTexture(
  source: TextureSource,
  wrapMode: WrapMode = "repeat"
): Promise<Texture> {
  if (typeof source === "string") {
    const cached = cacheByURL.get(source);
    if (cached) return cached;
    const bmp = await imageBitmapFromURL(source);
    const tex = await fromBitmap(bmp, wrapMode);
    cacheByURL.set(source, tex);
    return tex;
  }

  const keyObj = source as object;
  const cached = cacheByObject.get(keyObj);
  if (cached) return cached;

  let pixels: PixelBuf;

  if (isPixelBuf(source)) {
    pixels = createPixelBuf(source.width, source.height, source.data);
  } else if (isImageDataLike(source)) {
    pixels = imageDataToPixelBuf(source);
  } else if (hasNaturalSize(source) || isImageBitmapLike(source)) {
    const canvas = canvasFromBitmap(source as ImageBitmap | HTMLImageElement);
    pixels = pixelBufFromCanvas(canvas);
  } else {
    throw new Error("Unsupported texture source");
  }

  const tex: Texture = {
    id: textureIdForSource(source),
    width: pixels.width,
    height: pixels.height,
    pixels,
    wrapMode,
  };
  cacheByObject.set(keyObj, tex);
  return tex;
}

/** Wrap an ImageBitmap into a Texture (no cross-origin re-fetch). */
export async function fromBitmap(
  bmp: ImageBitmap,
  wrapMode: WrapMode = "repeat"
): Promise<Texture> {
  const canvas = canvasFromBitmap(bmp);
  const pixels = pixelBufFromCanvas(canvas);
  const tex: Texture = {
    id: `bitmap:${bmp.width}x${bmp.height}`,
    width: pixels.width,
    height: pixels.height,
    pixels,
    wrapMode,
  };
  cacheByObject.set(bmp as unknown as object, tex);
  return tex;
}

/* ============================== Sampling ============================== */

export function sampleTexNearest(
  tex: Texture,
  x: number,
  y: number,
  wrap?: WrapMode
): SampleRGBA8 {
  return sampleNearest(tex.pixels, x, y, wrap ?? tex.wrapMode);
}

export function sampleTexBilinear(
  tex: Texture,
  x: number,
  y: number,
  wrap?: WrapMode
): SampleRGBA8 {
  return sampleBilinear(tex.pixels, x, y, wrap ?? tex.wrapMode);
}

export function sampleTexLinear(
  tex: Texture,
  x: number,
  y: number,
  wrap?: WrapMode
): SampleLinear {
  return sampleBilinearLinear(tex.pixels, x, y, wrap ?? tex.wrapMode);
}

export function sampleTexUVLinear(
  tex: Texture,
  u: number,
  v: number,
  wrap?: WrapMode
): SampleLinear {
  const x = u * tex.width;
  const y = v * tex.height;
  return sampleBilinearLinear(tex.pixels, x, y, wrap ?? tex.wrapMode);
}

/* ============================== Generators ============================== */

/**
 * Generate a small FBM noise texture (value noise). Handy default paper.
 * @param size texture width/height (square)
 * @param octaves number of FBM octaves
 * @param gain amplitude falloff
 * @param lacunarity frequency growth
 */
export function generateFbmNoiseTexture(
  size = 256,
  octaves = 4,
  gain = 0.5,
  lacunarity = 2.0
): Texture {
  const buf = createPixelBuf(size, size);
  const gridSize = 32; // base period

  const hashTo01 = (x: number, y: number): number => {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = (h ^ (h >>> 13)) >>> 0;
    return ((h * 1274126177) >>> 0) / 0xffffffff;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const smooth = (t: number) => t * t * (3 - 2 * t);

  const data = buf.data;
  const denom = 1 - Math.pow(gain, octaves);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let amp = 1.0;
      let freq = 1.0;
      let sum = 0.0;
      for (let o = 0; o < octaves; o++) {
        const x = (i / gridSize) * freq;
        const y = (j / gridSize) * freq;
        const x0 = Math.floor(x),
          y0 = Math.floor(y);
        const x1 = x0 + 1,
          y1 = y0 + 1;
        const tx = smooth(x - x0),
          ty = smooth(y - y0);

        const v00 = hashTo01(x0, y0),
          v10 = hashTo01(x1, y0);
        const v01 = hashTo01(x0, y1),
          v11 = hashTo01(x1, y1);
        const v0 = lerp(v00, v10, tx);
        const v1 = lerp(v01, v11, tx);

        sum += lerp(v0, v1, ty) * amp;
        amp *= gain;
        freq *= lacunarity;
      }
      const g = Math.max(0, Math.min(255, Math.round((sum / denom) * 255)));
      const k = (j * size + i) * 4;
      data[k] = g;
      data[k + 1] = g;
      data[k + 2] = g;
      data[k + 3] = 255;
    }
  }

  return {
    id: `fbm:${size}`,
    width: size,
    height: size,
    pixels: buf,
    wrapMode: "repeat",
  };
}

/**
 * Create a tangent-space normal map from a grayscale height map.
 * Simple Sobel filter with adjustable strength.
 */
export function normalMapFromHeight(
  heightTex: Texture,
  strength = 1.0
): Texture {
  const { width: w, height: h } = heightTex;
  const src = heightTex.pixels.data;
  const out = new Uint8ClampedArray(src.length);

  const luma = (r: number, g: number, b: number) =>
    (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const getGray = (x: number, y: number): number => {
    // wrap repeat
    const ix = ((x % w) + w) % w;
    const iy = ((y % h) + h) % h;
    const i = (iy * w + ix) * 4;
    return luma(src[i], src[i + 1], src[i + 2]);
  };

  const kx = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const ky = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gx = 0,
        gy = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const g = getGray(x + i, y + j);
          gx += kx[j + 1][i + 1] * g;
          gy += ky[j + 1][i + 1] * g;
        }
      }
      const nx = -gx * strength;
      const ny = -gy * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      const r = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      const g = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      const b = Math.round((nz * invLen * 0.5 + 0.5) * 255);

      const k = (y * w + x) * 4;
      out[k] = r;
      out[k + 1] = g;
      out[k + 2] = b;
      out[k + 3] = src[k + 3];
    }
  }

  return {
    id: `${heightTex.id}:normal(strength=${strength.toFixed(2)})`,
    width: w,
    height: h,
    pixels: { width: w, height: h, data: out },
    wrapMode: heightTex.wrapMode,
  };
}
