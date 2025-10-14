// import { defineConfig } from "vitest/config";
// import tsconfigPaths from "vite-tsconfig-paths";

// export default defineConfig({
//   plugins: [tsconfigPaths()],
//   test: {
//     include: ["tests/brush/golden/**/*.{test,spec}.ts"],
//     environment: "node",               // we use node-canvas (see setup file)
//     setupFiles: ["./tests/brush/golden/setupCanvas.ts"],
//     globals: true,
//     threads: false,                    // native canvas + threads = flaky
//     hookTimeout: 30_000,
//     testTimeout: 30_000,
//     isolate: true,
//     // Keep snapshots/diffs next to tests (optional)
//     snapshotFormat: { printBasicPrototype: true },
//   },
//   esbuild: {
//     target: "es2020",
//   },
//   resolve: {
//     // Prefer Node builds of dependencies when both exist
//     conditions: ["node", "default"],
//   },
//   define: {
//     // Avoid Vite/DOM-only globals from sneaking in
//     "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "test"),
//   },
// });
