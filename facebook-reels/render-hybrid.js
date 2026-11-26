import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out", "facebook-reels");
const publicDir = path.join(outDir, "public");
const entryPoint = "facebook-reels/src/animated-index.jsx";
const cli = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Remotion render gagal (exit ${code}): ${args.join(" ")}`)));
  });
}

async function main() {
  const storyPath = path.join(outDir, "animation-story.json");
  const audioPath = path.join(publicDir, "narration.wav");
  if (!fs.existsSync(storyPath)) throw new Error("animation-story.json belum tersedia.");
  if (!fs.existsSync(audioPath)) throw new Error("narration.wav belum tersedia.");
  fs.mkdirSync(publicDir, { recursive: true });

  const story = JSON.parse(fs.readFileSync(storyPath, "utf8"));
  const platePath = path.join(publicDir, "3d-plate.mp4");
  const finalPath = path.join(outDir, "video.mp4");
  const common = [
    entryPoint,
    "--public-dir", publicDir,
    "--codec", "h264",
    "--gl=swangle",
    "--log=error"
  ];

  console.log("[Hybrid 1/2] Rendering 3D scene plate...");
  await run(["remotion", "render", ...common.slice(0, 1), "Facebook3DPlate", platePath, ...common.slice(1)]);

  if (!fs.existsSync(platePath) || fs.statSync(platePath).size < 10000) {
    throw new Error("3D plate tidak berhasil dibuat atau ukurannya tidak valid.");
  }

  console.log("[Hybrid 2/2] Compositing 3D plate, subtitle, dan narration...");
  await run(["remotion", "render", ...common.slice(0, 1), "FacebookHybridReel", finalPath, ...common.slice(1)]);

  if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size < 10000) {
    throw new Error("Video final hybrid tidak berhasil dibuat.");
  }
  console.log("Hybrid render selesai:", finalPath, "durasi:", story.durationSeconds, "detik.");
}

main().catch(error => {
  console.error("[Hybrid Render]", error);
  process.exit(1);
});
