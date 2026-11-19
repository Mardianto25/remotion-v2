import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { OUT_DIR, DATA_DIR } from "../src/config.js";

const manifestPath = path.join(DATA_DIR, "shorts-manifest.json");
const shorts = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (!Array.isArray(shorts) || shorts.length === 0) throw new Error("Manifest Shorts kosong.");

const outputDir = path.join(OUT_DIR, "shorts");
await fs.mkdir(outputDir, { recursive: true });

for (const short of shorts) {
  const number = String(short.id).padStart(2, "0");
  const output = path.join(outputDir, `short-${number}.mp4`);
  const compositionId = `HorrorShort-${short.id}`;
  console.log(`Render ${compositionId} -> ${output}`);

  await new Promise((resolve, reject) => {
    const child = spawn("npx", [
      "remotion", "render", "remotion/index.jsx", compositionId, output,
      "--codec=h264", "--crf=22"
    ], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Remotion ${compositionId} gagal dengan exit code ${code}`)));
  });
}
console.log(`Berhasil render ${shorts.length} video Shorts.`);
