// // FILE: tests/brush/golden/cases/stamping.graphite.spec.ts
// import { renderToImageData } from "../render";
// import { assertImagesClose } from "../compare";
// import { buildSlowCurve } from "../paths";
// import { loadGoldenFromDisk } from "../helpers";

// test("stamping/graphite stays stable", async () => {
//   const path = buildSlowCurve({ steps: 80, press: 0.8 });

//   const out = await renderToImageData({
//     width: 256,
//     height: 128,
//     pixelRatio: 2,
//     seed: 1337,
//     engine: {
//       backend: "stamping",
//       rendering: { intent: "graphite", blendMode: "source-over", flow: 100 },
//       strokePath: { spacing: 6 },
//       shape: { type: "round", softness: 60 },
//     },
//     baseSizePx: 14,
//     color: "#000",
//     path,
//   });

//   const golden = await loadGoldenFromDisk("stamping-graphite.png");

//   assertImagesClose(out, golden, {
//     perChannelTolerance: 2,
//     maxMae: 0.5,
//     maxRmse: 1.2,
//     maxOutlierFrac: 0.001,
//     diffAmplify: 8,
//   });
// });
