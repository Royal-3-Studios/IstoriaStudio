// // FILE: tests/brush/golden/helpers.ts
// import { createCanvas, loadImage, ImageData } from "canvas";
// import * as path from "node:path";

// const GOLDEN_DIR = path.resolve(__dirname, "baselines");

// export async function loadGoldenFromDisk(filename: string): Promise<ImageData> {
//   const img = await loadImage(path.join(GOLDEN_DIR, filename));
//   const c = createCanvas(img.width, img.height);
//   const ctx = c.getContext("2d");
//   ctx.drawImage(img, 0, 0);
//   return ctx.getImageData(0, 0, img.width, img.height);
// }
