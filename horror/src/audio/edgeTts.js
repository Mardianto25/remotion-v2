import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { config } from "../config.js";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || "python", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("edge-tts exit code " + code)));
  });
}

export async function generateNarration(text, audioPath, subtitlePath) {
  const textPath = audioPath.replace(/\\.mp3$/i, ".txt");
  await fs.writeFile(textPath, text, "utf8");

  const args = [
    "-m", "edge_tts", "--voice", config.edgeVoice,
    "--rate", config.edgeRate, "--pitch", config.edgePitch,
    "--file", textPath, "--write-media", audioPath,
    "--write-subtitles", subtitlePath
  ];

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await fs.rm(audioPath, { force: true });
    await fs.rm(subtitlePath, { force: true });

    try {
      await run(args);
      const audio = await fs.stat(audioPath);
      const subtitles = await fs.stat(subtitlePath);
      if (audio.size === 0 || subtitles.size === 0) {
        throw new Error("Edge TTS menghasilkan file audio/subtitle kosong.");
      }
      return { audioPath, subtitlePath };
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          "Edge TTS gagal setelah " + maxAttempts + " percobaan. " +
          "Layanan TTS mungkin sedang membatasi koneksi atau tidak mengirim audio. " +
          "Detail: " + error.message
        );
      }
      const delaySeconds = attempt * 5;
      console.warn("[tts] Percobaan " + attempt + "/" + maxAttempts +
        " gagal: " + error.message + ". Coba lagi dalam " + delaySeconds + " detik.");
      await sleep(delaySeconds * 1000);
    }
  }
}
