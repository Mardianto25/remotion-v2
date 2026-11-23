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
  if (!String(text || "").trim()) throw new Error("Teks narasi kosong; Edge TTS tidak dijalankan.");
  await fs.mkdir(new URL(".", "file://" + audioPath).pathname, { recursive: true }).catch(() => {});

  // Kirim teks langsung melalui --text agar file input tidak mungkin tertimpa
  // atau terhapus ketika file output dibersihkan sebelum percobaan.
  const args = [
    "-m", "edge_tts", "--voice", config.edgeVoice,
    "--rate=" + (config.edgeRate || "-8%"), "--pitch=" + (config.edgePitch || "-5Hz"),
    "--text", String(text).trim(),
    "--write-media", audioPath,
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
      if (audio.size <= 1024 || subtitles.size === 0) {
        throw new Error("Edge TTS menghasilkan file audio/subtitle kosong atau tidak valid.");
      }
      return { audioPath, subtitlePath };
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          "Edge TTS gagal setelah " + maxAttempts + " percobaan. " +
          "Periksa koneksi atau ketersediaan layanan TTS. Detail: " + error.message
        );
      }
      const delaySeconds = attempt * 5;
      console.warn("[tts] Percobaan " + attempt + "/" + maxAttempts +
        " gagal: " + error.message + ". Coba lagi dalam " + delaySeconds + " detik.");
      await sleep(delaySeconds * 1000);
    }
  }
}
