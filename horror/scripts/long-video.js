import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateStory } from "../src/ai/storyGenerator.js";
import { generateSeo } from "../src/ai/seoGenerator.js";
import { getSceneImage } from "../src/visual/providers.js";
import { generateNarration } from "../src/audio/edgeTts.js";
import { generateLongThumbnail } from "../src/visual/thumbnail.js";
import { ROOT, LONG_PUBLIC_DIR, LONG_DATA_DIR, LONG_OUT_DIR } from "../src/config.js";

const args = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const durationMinutes = Number(arg("--duration", "5"));
if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 8) {
  throw new Error("--duration harus 1 sampai 8 menit.");
}
const storyFile = arg("--story-file");
const topic = arg("--topic");
if (!storyFile && !topic) {
  throw new Error('Masukkan --topic "topik cerita" atau --story-file data/long-seasons/.../story.json');
}
const safeId = String(arg("--output-id", topic || path.basename(storyFile || "single-video", ".json")))
  .toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "long-video";
const assetPrefix = "long-video/" + safeId;
const assetsDir = path.join(LONG_PUBLIC_DIR, safeId, "assets");
const audioDir = path.join(LONG_PUBLIC_DIR, safeId, "audio");
const dataDir = path.join(LONG_DATA_DIR, safeId);
const outDir = path.join(LONG_OUT_DIR, safeId);
await Promise.all([assetsDir, audioDir, dataDir, outDir].map(dir => fs.mkdir(dir, { recursive: true })));

const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(command + " exit code " + code)));
  });
}
function durationOf(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
    let output = "";
    child.stdout.on("data", chunk => output += chunk);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(Number(output.trim())) : reject(new Error("ffprobe gagal membaca durasi")));
  });
}
function parseVtt(vtt) {
  return vtt.replace(/\r/g, "").split(/\n\n+/).flatMap(block => {
    const lines = block.split("\n");
    const line = lines.find(value => value.includes("-->"));
    if (!line) return [];
    const [start, end] = line.split("-->").map(value => value.trim().split(" ")[0]);
    const seconds = value => {
      const parts = value.replace(",", ".").split(":").map(Number);
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    };
    const caption = lines.slice(lines.indexOf(line) + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    return caption ? [{ start: seconds(start), end: seconds(end), text: caption }] : [];
  });
}

console.log("[long-video] Mode: " + (storyFile ? "Series/Episode" : "Single Video") + " | Target: " + durationMinutes + " menit");
const story = storyFile
  ? await readJson(path.resolve(ROOT, storyFile))
  : await generateStory(topic, { durationMinutes, longVideo: true, genre: process.env.STORY_GENRE || "mystery" });
if (!story.narration || !Array.isArray(story.scenes) || !story.scenes.length) {
  throw new Error("Naskah tidak memiliki narration/scenes.");
}
process.env.STORY_GENRE = String(story.genre || story.category || process.env.STORY_GENRE || "mystery");
await writeJson(path.join(dataDir, "story.json"), story);
const seo = await generateSeo(story, topic || story.title, { format: "long" });
await writeJson(path.join(dataDir, "youtube-metadata.json"), seo);

const audioPath = path.join(audioDir, "narration.mp3");
const subtitlePath = path.join(audioDir, "narration.vtt");
await generateNarration(story.narration, audioPath, subtitlePath);
const duration = await durationOf(audioPath);
if (duration > 510) {
  throw new Error("Durasi audio " + duration.toFixed(1) + " detik melebihi batas Long Video 8 menit 30 detik. Audio tidak dipotong otomatis.");
}
const captions = parseVtt(await fs.readFile(subtitlePath, "utf8"));
if (!captions.length) throw new Error("Subtitle VTT kosong/tidak valid.");

const assets = [];
for (let index = 0; index < story.scenes.length; index++) {
  console.log("[long-video] Generate landscape scene " + (index + 1) + "/" + story.scenes.length);
  assets.push(await getSceneImage(story.scenes[index], index, assetsDir, story.characters || [], { aspectRatio: "16:9" }));
}
const thumbnail = await generateLongThumbnail(story, seo, topic || story.title, outDir);
const fps = 30;
const totalFrames = Math.ceil(duration * fps);
const weights = story.scenes.map(scene => (String(scene.narration || "").match(/\S+/g) || []).length);
const totalWords = weights.reduce((sum, value) => sum + value, 0) || 1;
let cursor = 0;
const scenes = story.scenes.map((scene, index) => {
  const startFrame = cursor;
  const frames = index === story.scenes.length - 1
    ? totalFrames - cursor
    : Math.max(1, Math.round(totalFrames * weights[index] / totalWords));
  cursor += frames;
  return { ...scene, fileName: "scene-" + String(index + 1).padStart(3, "0") + ".jpg", startFrame, durationInFrames: frames };
});
const manifest = {
  assetPrefix, title: story.title, description: story.description || "",
  disclaimer: story.disclaimer || "", durationInFrames: totalFrames, fps, scenes, captions
};
await fs.writeFile(
  path.join(ROOT, "remotion", "generatedLongStory.js"),
  "export const generatedLongStory = " + JSON.stringify(manifest, null, 2) + ";\n"
);
const videoPath = path.join(outDir, "long-video.mp4");
await run("npx", ["remotion", "render", "remotion/index.jsx", "LongVideo", videoPath, "--codec=h264", "--crf=22"]);
const renderedDuration = await durationOf(videoPath);
if (renderedDuration > 510.5) throw new Error("Video render melebihi toleransi 8 menit 30 detik.");
await writeJson(path.join(dataDir, "production-manifest.json"), {
  mode: storyFile ? "series-episode" : "single-video",
  targetDurationMinutes: durationMinutes,
  durationSeconds: Number(renderedDuration.toFixed(2)),
  aspectRatio: "16:9",
  visualStyle: process.env.HORROR_VISUAL_STYLE || "cinematic-3d",
  video: videoPath,
  thumbnail: thumbnail.landscapePath,
  sceneCount: scenes.length
});
console.log("[long-video] Selesai: " + videoPath + " (" + renderedDuration.toFixed(1) + " detik, 1920x1080).");
