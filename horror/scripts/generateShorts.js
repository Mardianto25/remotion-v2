import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT, AUDIO_DIR, DATA_DIR, OUT_DIR } from "../src/config.js";

const FPS = 30;
const TARGET_SECONDS = 42;
const MIN_SECONDS = 34;
const MAX_SECONDS = 48;
const SHORT_COUNT = 3;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

function pickCaptionWindow(captions, target, duration, usedRanges) {
  if (!captions.length) throw new Error("Subtitle narration.vtt kosong; Shorts tidak dapat dipotong dengan aman.");
  const candidates = captions.filter(c => c.start < duration - MIN_SECONDS);
  let best = null;
  let bestScore = Infinity;

  for (const caption of candidates) {
    const start = caption.start;
    const endCaption = captions.find(c => c.end >= start + MIN_SECONDS && c.end <= start + MAX_SECONDS);
    if (!endCaption) continue;
    const end = endCaption.end;
    if (end - start < MIN_SECONDS || end - start > MAX_SECONDS) continue;
    const overlaps = usedRanges.some(range => start < range.end && end > range.start);
    if (overlaps) continue;
    const score = Math.abs(start - target) + Math.abs((end - start) - TARGET_SECONDS) * 0.35;
    if (score < bestScore) {
      best = { start, end };
      bestScore = score;
    }
  }
  return best;
}

function makeTitle(title, index) {
  const clean = String(title || "Cerita Horor Indonesia").replace(/[\r\n]+/g, " ").trim();
  const suffixes = ["Bagian paling mengerikan", "Ada sesuatu di baliknya", "Jangan tonton sendirian"];
  const suffix = suffixes[index] || "Cerita horor";
  return `${clean.slice(0, 75 - suffix.length)} — ${suffix} #Shorts`;
}

await fs.mkdir(path.join(OUT_DIR, "shorts"), { recursive: true });
await fs.mkdir(AUDIO_DIR, { recursive: true });
await fs.mkdir(DATA_DIR, { recursive: true });

const manifestUrl = new URL("../remotion/generatedStory.js", import.meta.url);
const { generatedStory } = await import(manifestUrl.href + `?build=${Date.now()}`);
const duration = (generatedStory.durationInFrames || 0) / (generatedStory.fps || FPS);
if (!duration || !generatedStory.scenes?.length) throw new Error("Manifest video panjang belum tersedia. Jalankan generate dan render video panjang terlebih dahulu.");
if (!generatedStory.captions?.length) throw new Error("Subtitle tidak ditemukan pada manifest video panjang.");

const targets = [0.08, 0.40, 0.70].map(ratio => Math.max(0, duration * ratio));
const usedRanges = [];
const shorts = [];

for (let index = 0; index < SHORT_COUNT; index++) {
  const range = pickCaptionWindow(generatedStory.captions, targets[index], duration, usedRanges);
  if (!range) {
    console.warn(`[Shorts] Tidak menemukan potongan non-overlap ke-${index + 1}; jumlah Shorts dikurangi.`);
    continue;
  }
  usedRanges.push(range);
  const number = String(index + 1).padStart(2, "0");
  const audioFile = `short-${number}.mp3`;
  const audioPath = path.join(AUDIO_DIR, audioFile);
  const clipDuration = range.end - range.start;

  await run("ffmpeg", [
    "-y", "-ss", range.start.toFixed(3), "-i", path.join(AUDIO_DIR, "narration.mp3"),
    "-t", clipDuration.toFixed(3), "-vn", "-acodec", "libmp3lame", "-q:a", "3", audioPath
  ]);

  const startFrame = Math.floor(range.start * FPS);
  const endFrame = Math.ceil(range.end * FPS);
  const scenes = generatedStory.scenes
    .filter(scene => {
      const sceneStart = scene.startFrame / FPS;
      const sceneEnd = (scene.startFrame + scene.durationInFrames) / FPS;
      return sceneStart < range.end && sceneEnd > range.start;
    })
    .map(scene => {
      const sceneStart = scene.startFrame;
      const sceneEnd = scene.startFrame + scene.durationInFrames;
      const clippedStart = Math.max(sceneStart, startFrame);
      const clippedEnd = Math.min(sceneEnd, endFrame);
      return {
        fileName: scene.fileName,
        startFrame: clippedStart - startFrame,
        durationInFrames: Math.max(1, clippedEnd - clippedStart)
      };
    })
    .filter(scene => scene.fileName && scene.durationInFrames > 0);

  if (!scenes.length) throw new Error(`Tidak ada visual yang cocok untuk Shorts ${number}.`);

  const captions = generatedStory.captions
    .filter(caption => caption.start < range.end && caption.end > range.start)
    .map(caption => ({
      start: Math.max(0, caption.start - range.start),
      end: Math.min(clipDuration, caption.end - range.start),
      text: caption.text
    }));

  shorts.push({
    id: index + 1,
    title: makeTitle(generatedStory.title, index),
    description: `Potongan cerita dari video lengkap “${generatedStory.title}”. Tonton cerita lengkapnya di channel Ruang Cerita Indonesia.\n\n#Shorts #CeritaHoror #HororIndonesia`,
    sourceTitle: generatedStory.title,
    startSeconds: range.start,
    durationInFrames: Math.ceil(clipDuration * FPS),
    fps: FPS,
    audioFile,
    scenes,
    captions
  });
  console.log(`[Shorts ${number}] ${range.start.toFixed(1)}s–${range.end.toFixed(1)}s | ${scenes.length} visual | ${captions.length} subtitle`);
}

if (!shorts.length) throw new Error("Tidak ada Shorts yang berhasil dibuat.");
await fs.writeFile(path.join(DATA_DIR, "shorts-manifest.json"), JSON.stringify(shorts, null, 2));
await fs.writeFile(
  path.join(ROOT, "remotion", "generatedShorts.js"),
  "export const generatedShorts = " + JSON.stringify(shorts, null, 2) + ";\n"
);
await fs.writeFile(path.join(DATA_DIR, "shorts-metadata.json"), JSON.stringify(
  shorts.map(({ id, title, description, startSeconds, durationInFrames }) => ({ id, title, description, startSeconds, durationSeconds: durationInFrames / FPS })),
  null, 2
));
console.log(`Berhasil menyiapkan ${shorts.length} Shorts tanpa memanggil Gemini atau FLUX.`);
