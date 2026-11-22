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
  ["wind-hit.wav", "anoisesrc=color=pink:duration=2.2", "highpass=f=120,lowpass=f=1800,volume=0.5,afade=t=in:st=0:d=0.2,afade=t=out:st=0.8:d=1.4"],
  // Procedural tonal approximations; these are stylized effects, not recordings.
  ["gamelan.wav", "aevalsrc=0.22*sin(2*PI*440*t)*exp(-3*t)+0.13*sin(2*PI*660*t)*exp(-4*t)+0.08*sin(2*PI*880*t)*exp(-5*t):s=44100:d=3.2", "afade=t=out:st=2.2:d=1"],
  ["gong.wav", "aevalsrc=0.30*sin(2*PI*110*t)*exp(-1.2*t)+0.18*sin(2*PI*164*t)*exp(-1.6*t)+0.10*sin(2*PI*221*t)*exp(-2*t):s=44100:d=4.5", "afade=t=out:st=3:d=1.5"],
  ["shriek.wav", "aevalsrc=0.24*sin(2*PI*(620*t-95*t*t))*if(lt(t\\,0.12)\\,t/0.12\\,exp(-1.25*(t-0.12))):s=44100:d=2.1", "highpass=f=350,lowpass=f=3200,afade=t=out:st=1.1:d=1"],
  ["gasp.wav", "anoisesrc=color=pink:duration=0.8", "highpass=f=450,lowpass=f=2600,volume=0.55,afade=t=in:st=0:d=0.04,afade=t=out:st=0.25:d=0.5"],
  ["breathing.wav", "anoisesrc=color=pink:duration=2.4", "highpass=f=180,lowpass=f=1100,volume=0.24,tremolo=f=0.7:d=0.85"],
  ["whisper.wav", "anoisesrc=color=pink:duration=1.8", "highpass=f=700,lowpass=f=4200,volume=0.16,tremolo=f=13:d=0.7"]
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
