// // Headless canvas wiring for Vitest golden tests (Node environment)
// import { createCanvas, Image, ImageData } from "canvas";

// // 1) Provide a minimal OffscreenCanvas polyfill backed by node-canvas:
// class OffscreenCanvasPoly {
//   private _c = createCanvas(this._w, this._h);
//   constructor(
//     private _w: number,
//     private _h: number
//   ) {
//     this._c = createCanvas(_w, _h);
//   }
//   get width() {
//     return this._c.width;
//   }
//   set width(v: number) {
//     this._c.width = v;
//   }
//   get height() {
//     return this._c.height;
//   }
//   set height(v: number) {
//     this._c.height = v;
//   }
//   getContext(type: "2d", attrs?: CanvasRenderingContext2DSettings) {
//     // node-canvas ignores attrs but returns a 2D ctx
//     return this._c.getContext(
//       "2d",
//       attrs as any
//     ) as unknown as CanvasRenderingContext2D;
//   }
//   // Helpful when code expects CanvasImageSource compatibility
//   // (node-canvas Canvas already is fine for drawImage targets).
//   convertToBlob?: never;
//   transferToImageBitmap?: never;
// }

// // 2) Attach globals your code expects
// //    (we *don’t* define HTMLCanvasElement so your isHtmlCanvas() stays false in Node)
// (globalThis as any).OffscreenCanvas = OffscreenCanvasPoly;
// (globalThis as any).Image = Image;
// (globalThis as any).ImageData = ImageData;

// // Some code paths create <canvas> in browser; provide a tiny helper for tests if needed:
// (globalThis as any).__createTestCanvas = (w = 1, h = 1) => createCanvas(w, h);

// // Optional: polyfill atob/btoa if some utils rely on them
// if (typeof (globalThis as any).atob !== "function") {
//   (globalThis as any).atob = (b64: string) =>
//     Buffer.from(b64, "base64").toString("binary");
// }
// if (typeof (globalThis as any).btoa !== "function") {
//   (globalThis as any).btoa = (bin: string) =>
//     Buffer.from(bin, "binary").toString("base64");
// }
