import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { config } from "../config.js";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("edge-tts exit code " + code)));
  });
}
export async function generateNarration(text, audioPath, subtitlePath) {
  const textPath = audioPath.replace(/\.mp3$/i, ".txt");
  await fs.writeFile(textPath, text, "utf8");
  await run([
    "-m", "edge_tts", "--voice", config.edgeVoice,
    "--rate", config.edgeRate, "--pitch", config.edgePitch,
    "--file", textPath, "--write-media", audioPath,
    "--write-subtitles", subtitlePath
  ]);
  return { audioPath, subtitlePath };
}
