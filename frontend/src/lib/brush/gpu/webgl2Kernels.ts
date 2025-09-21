// FILE: src/lib/brush/gpu/webgl2Kernels.ts
import {
  type Tex,
  type Fbo,
  createProgram,
  bindFbo,
  drawFullscreen,
  setTextureUnit,
} from "./webgl2Context";

/* Shared vertex shader: position + uv passthrough */
const VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* 1) Separable blur (9-tap; run multiple times for larger sigma) */
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec2 uDir;
vec3 sample9(vec2 uv, vec2 uTexel, vec2 uDir) {
  float w0 = 0.2270270270;
  float w1 = 0.1945945946;
  float w2 = 0.1216216216;
  float w3 = 0.0540540541;
  float w4 = 0.0162162162;
  vec3 c = texture(uSrc, uv).rgb * w0;
  c += texture(uSrc, uv + uDir * uTexel * 1.0).rgb * w1;
  c += texture(uSrc, uv - uDir * uTexel * 1.0).rgb * w1;
  c += texture(uSrc, uv + uDir * uTexel * 2.0).rgb * w2;
  c += texture(uSrc, uv - uDir * uTexel * 2.0).rgb * w2;
  c += texture(uSrc, uv + uDir * uTexel * 3.0).rgb * w3;
  c += texture(uSrc, uv - uDir * uTexel * 3.0).rgb * w3;
  c += texture(uSrc, uv + uDir * uTexel * 4.0).rgb * w4;
  c += texture(uSrc, uv - uDir * uTexel * 4.0).rgb * w4;
  return c;
}
void main() {
  vec3 rgb = sample9(vUv, uTexel, uDir);
  frag = vec4(rgb, 1.0);
}`;

/* 2) Sobel → normal map */
const FS_SOBEL_NORMAL = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 tl = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3  l = texture(uSrc, vUv + uTexel * vec2(-1.0,  0.0)).rgb;
  vec3 bl = texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3  t = texture(uSrc, vUv + uTexel * vec2( 0.0, -1.0)).rgb;
  vec3  c = texture(uSrc, vUv).rgb;
  vec3  b = texture(uSrc, vUv + uTexel * vec2( 0.0,  1.0)).rgb;
  vec3 tr = texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3  r = texture(uSrc, vUv + uTexel * vec2( 1.0,  0.0)).rgb;
  vec3 br = texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  float lt = dot(tl, vec3(0.299,0.587,0.114));
  float l0 = dot(l , vec3(0.299,0.587,0.114));
  float lb = dot(bl, vec3(0.299,0.587,0.114));
  float tt = dot(t , vec3(0.299,0.587,0.114));
  float cc = dot(c , vec3(0.299,0.587,0.114));
  float bb = dot(b , vec3(0.299,0.587,0.114));
  float rt = dot(tr, vec3(0.299,0.587,0.114));
  float r0 = dot(r , vec3(0.299,0.587,0.114));
  float rb = dot(br, vec3(0.299,0.587,0.114));
  float gx = -lt - 2.0*l0 - lb + rt + 2.0*r0 + rb;
  float gy = -lt - 2.0*tt - rt + lb + 2.0*bb + rb;
  vec3 n = normalize(vec3(gx, gy, 1.0));
  n = n * 0.5 + 0.5;
  frag = vec4(n, 1.0);
}`;

export class BlurProgram {
  private prog: WebGLProgram;
  private locSrc: WebGLUniformLocation;
  private locTexel: WebGLUniformLocation;
  private locDir: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, VS, FS_BLUR);
    const u = (name: string) => {
      const loc = gl.getUniformLocation(this.prog, name);
      if (!loc) throw new Error(`uniform ${name} missing`);
      return loc;
    };
    this.locSrc = u("uSrc");
    this.locTexel = u("uTexel");
    this.locDir = u("uDir");
  }

  run(
    src: Tex,
    dstFbo: Fbo | null,
    w: number,
    h: number,
    dirX: number,
    dirY: number
  ) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    bindFbo(gl, dstFbo, w, h);
    setTextureUnit(gl, 0, src);
    gl.uniform1i(this.locSrc, 0);
    gl.uniform2f(this.locTexel, 1 / src.w, 1 / src.h);
    gl.uniform2f(this.locDir, dirX, dirY);
    drawFullscreen(gl);
    setTextureUnit(gl, 0, undefined);
    gl.useProgram(null);
  }

  dispose() {
    this.gl.deleteProgram(this.prog);
  }
}

export class SobelNormalProgram {
  private prog: WebGLProgram;
  private locSrc: WebGLUniformLocation;
  private locTexel: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    this.prog = createProgram(gl, VS, FS_SOBEL_NORMAL);
    const u = (name: string) => {
      const loc = gl.getUniformLocation(this.prog, name);
      if (!loc) throw new Error(`uniform ${name} missing`);
      return loc;
    };
    this.locSrc = u("uSrc");
    this.locTexel = u("uTexel");
  }

  run(src: Tex, dstFbo: Fbo | null, w: number, h: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    bindFbo(gl, dstFbo, w, h);
    setTextureUnit(gl, 0, src);
    gl.uniform1i(this.locSrc, 0);
    gl.uniform2f(this.locTexel, 1 / src.w, 1 / src.h);
    drawFullscreen(gl);
    setTextureUnit(gl, 0, undefined);
    gl.useProgram(null);
  }

  dispose() {
    this.gl.deleteProgram(this.prog);
  }
}
