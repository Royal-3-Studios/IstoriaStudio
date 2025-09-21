// FILE: src/lib/brush/gpu/webgl2Context.ts
/* Minimal WebGL2 wrapper usable on HTMLCanvasElement or OffscreenCanvas */

export type GL = WebGL2RenderingContext;

export type GpuSurface = {
  gl: GL;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number; // pixel width
  height: number; // pixel height
};

export type Tex = {
  tex: WebGLTexture;
  w: number;
  h: number;
};

export type Fbo = {
  fbo: WebGLFramebuffer;
  tex: Tex;
};

export function isHtmlCanvas(x: unknown): x is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== "undefined" && x instanceof HTMLCanvasElement
  );
}

export function createGL(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  pixelW: number,
  pixelH: number
): GpuSurface | null {
  // Resize backing store
  canvas.width = Math.max(1, Math.floor(pixelW));
  canvas.height = Math.max(1, Math.floor(pixelH));

  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext(
    "webgl2",
    {
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
    }
  ) as WebGL2RenderingContext | null;

  if (!ctx) return null;

  const gl = ctx;
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, pixelW, pixelH);

  return { gl, canvas, width: pixelW, height: pixelH };
}

export function createTexture(
  gl: GL,
  w: number,
  h: number,
  data?: ArrayBufferView
): Tex {
  const tex = gl.createTexture();
  if (!tex) throw new Error("gl.createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data ?? null
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, w, h };
}

export function deleteTexture(gl: GL, t: Tex): void {
  gl.deleteTexture(t.tex);
}

export function createFbo(gl: GL, w: number, h: number): Fbo {
  const tex = createTexture(gl, w, h);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("gl.createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex.tex,
    0
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`FBO incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

export function deleteFbo(gl: GL, f: Fbo): void {
  gl.deleteTexture(f.tex.tex);
  gl.deleteFramebuffer(f.fbo);
}

export function createProgram(
  gl: GL,
  vsSrc: string,
  fsSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("gl.createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "link error";
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function compileShader(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("gl.createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "compile error";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

export function bindFbo(gl: GL, fbo: Fbo | null, w: number, h: number): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null);
  gl.viewport(0, 0, w, h);
}

export function drawFullscreen(gl: GL): void {
  // Lazy static quad (tri-strip)
  if (!(drawFullscreen as unknown as { _vao?: WebGLVertexArrayObject })._vao) {
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("VAO/VBO alloc failed");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // positions and uv: (x,y,u,v)
    const verts = new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const locPos = 0;
    const locUv = 1;
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locUv);
    gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 16, 8);
    (drawFullscreen as unknown as { _vao?: WebGLVertexArrayObject })._vao = vao;
  }
  const vao = (drawFullscreen as unknown as { _vao: WebGLVertexArrayObject })
    ._vao;
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

export function setTextureUnit(gl: GL, unit: number, tex?: Tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex ? tex.tex : null);
}
