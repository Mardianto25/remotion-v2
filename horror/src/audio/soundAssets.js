import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { AUDIO_DIR } from "../config.js";

const outputDir = path.join(AUDIO_DIR, "sfx");
const assets = [
  ["drone.wav", "sine=frequency=52:duration=10", "volume=0.22,lowpass=f=180"],
  ["night-wind.wav", "anoisesrc=color=pink:duration=10", "lowpass=f=520,volume=0.12,tremolo=f=0.18:d=0.55"],
  ["rain.wav", "anoisesrc=color=white:duration=10", "highpass=f=900,lowpass=f=6500,volume=0.09"],
  ["suspense.wav", "sine=frequency=78:duration=10", "volume=0.18,tremolo=f=2.2:d=0.65,lowpass=f=260"],
  ["climax.wav", "anoisesrc=color=pink:duration=10", "lowpass=f=1000,volume=0.2,tremolo=f=5:d=0.35"],
  ["knock.wav", "sine=frequency=95:duration=0.75", "volume=0.8,afade=t=out:st=0.12:d=0.63"],
  ["footsteps.wav", "anoisesrc=color=brown:duration=1.5", "highpass=f=80,lowpass=f=260,volume=0.55,afade=t=out:st=0.8:d=0.7"],
  ["creak.wav", "sine=frequency=240:duration=1.8", "volume=0.45,vibrato=f=4:d=0.7,afade=t=out:st=0.8:d=1"],
  ["heartbeat.wav", "sine=frequency=58:duration=1.6", "volume=0.7,tremolo=f=1.2:d=0.85,afade=t=out:st=1:d=0.6"],
  ["impact.wav", "anoisesrc=color=brown:duration=1.2", "lowpass=f=180,volume=0.85,afade=t=out:st=0.08:d=1.1"],
  ["wind-hit.wav", "anoisesrc=color=pink:duration=2.2", "highpass=f=120,lowpass=f=1800,volume=0.5,afade=t=in:st=0:d=0.2,afade=t=out:st=0.8:d=1.4"]
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("Gagal membuat SFX sintetis (ffmpeg exit " + code + ")")));
  });
}

export async function generateSoundAssets() {
  await fs.mkdir(outputDir, { recursive: true });
  for (const [name, source, filters] of assets) {
    const target = path.join(outputDir, name);
    try { await fs.access(target); continue; } catch {}
    await run(["-y", "-f", "lavfi", "-i", source, "-af", filters, "-ar", "44100", "-ac", "2", target]);
  }
  return assets.map(([name]) => name);
}
