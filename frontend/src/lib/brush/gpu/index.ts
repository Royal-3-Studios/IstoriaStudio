// FILE: src/lib/brush/gpu/index.ts
import {
  type GpuSurface,
  type Tex,
  type Fbo,
  createGL,
  createTexture,
  deleteTexture,
  createFbo,
  deleteFbo,
  bindFbo,
  setTextureUnit,
  createProgram,
  drawFullscreen,
} from "./webgl2Context";
import { BlurProgram, SobelNormalProgram } from "./webgl2Kernels";

export type GpuBrushOps = {
  surface: GpuSurface;
  createTexFromImageData(id: ImageData): Tex;
  createEmptyTex(w: number, h: number): Tex;
  deleteTex(t: Tex): void;
  separableBlur(src: Tex, tmp: Fbo, dst: Fbo, sigmaHint?: number): void;
  sobelToNormal(src: Tex, dst: Fbo): void;
  createFbo(w: number, h: number): Fbo;
  deleteFbo(f: Fbo): void;
  blit(src: Tex): void;
  dispose(): void;
};

// Minimal copy shader (VS shared from kernels file would be fine;
// we inline here to keep this module self-contained).
const VS_COPY = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
const FS_COPY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
void main() {
  frag = texture(uSrc, vUv);
}`;

class CopyProgram {
  private prog: WebGLProgram;
  private locSrc: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, VS_COPY, FS_COPY);
    const loc = gl.getUniformLocation(this.prog, "uSrc");
    if (!loc) throw new Error("uniform uSrc missing");
    this.locSrc = loc;
  }

  run(src: Tex, targetW: number, targetH: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    bindFbo(gl, null, targetW, targetH);
    setTextureUnit(gl, 0, src);
    gl.uniform1i(this.locSrc, 0);
    drawFullscreen(gl);
    setTextureUnit(gl, 0, undefined);
    gl.useProgram(null);
  }
}

export function createGpuBrushOps(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  pixelW: number,
  pixelH: number
): GpuBrushOps | null {
  const s = createGL(canvas, pixelW, pixelH);
  if (!s) return null;
  const surface: GpuSurface = s;

  const { gl } = surface;
  const blur = new BlurProgram(gl);
  const sobel = new SobelNormalProgram(gl);
  const copy = new CopyProgram(gl);

  function createTexFromImageData(id: ImageData): Tex {
    const t = gl.createTexture();
    if (!t) throw new Error("createTexture failed");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      id.width,
      id.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      id.data
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex: t, w: id.width, h: id.height };
  }

  function createEmptyTex(w: number, h: number): Tex {
    return createTexture(gl, w, h);
  }

  function deleteTex(t: Tex): void {
    deleteTexture(gl, t);
  }

  function createFboLocal(w: number, h: number): Fbo {
    return createFbo(gl, w, h);
  }
  function deleteFboLocal(f: Fbo): void {
    deleteFbo(gl, f);
  }

  // 9-tap ~ sigma≈3 per iteration; scale passes by hint
  function separableBlur(
    src: Tex,
    tmp: Fbo,
    dst: Fbo,
    sigmaHint: number = 3.0
  ): void {
    const iters = Math.max(1, Math.min(6, Math.round(sigmaHint / 3)));
    let currentSrc: Tex = src;
    let currentDst: Fbo = tmp;

    for (let i = 0; i < iters; i++) {
      blur.run(
        currentSrc,
        currentDst,
        currentDst.tex.w,
        currentDst.tex.h,
        1,
        0
      );
      const texFromTmp: Tex = {
        tex: currentDst.tex.tex,
        w: currentDst.tex.w,
        h: currentDst.tex.h,
      };
      blur.run(texFromTmp, dst, dst.tex.w, dst.tex.h, 0, 1);
      currentSrc = { tex: dst.tex.tex, w: dst.tex.w, h: dst.tex.h };
      currentDst = tmp;
    }
  }

  function sobelToNormal(src: Tex, dst: Fbo): void {
    sobel.run(src, dst, dst.tex.w, dst.tex.h);
  }

  function blit(src: Tex): void {
    copy.run(src, surface.width, surface.height);
  }

  function dispose(): void {
    // No persistent GL objects here requiring explicit deletion (programs are freed with context)
  }

  return {
    surface,
    createTexFromImageData,
    createEmptyTex,
    deleteTex,
    separableBlur,
    sobelToNormal,
    createFbo: createFboLocal,
    deleteFbo: deleteFboLocal,
    blit,
    dispose,
  };
}
