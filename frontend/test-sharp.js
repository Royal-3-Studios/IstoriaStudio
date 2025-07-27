import sharp from "sharp";

sharp({
  create: {
    width: 200,
    height: 200,
    channels: 3,
    background: { r: 255, g: 0, b: 0 },
  },
})
  .png()
  .toFile("test-output.png")
  .then(() => console.log("✅ Sharp is working and created test-output.png"))
  .catch((err) => console.error("❌ Sharp failed:", err));
