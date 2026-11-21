import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateStory } from "../src/ai/storyGenerator.js";
import { generateSeo } from "../src/ai/seoGenerator.js";
import { researchTrendingTopic } from "../src/ai/trendResearcher.js";
import { generateThumbnail } from "../src/visual/thumbnail.js";
import { getSceneImage } from "../src/visual/providers.js";
import { generateNarration } from "../src/audio/edgeTts.js";
import { ROOT, ASSETS_DIR, AUDIO_DIR, DATA_DIR, OUT_DIR } from "../src/config.js";

function parseVtt(vtt) {
  const blocks = vtt.replace(/\r/g, "").split(/

+/);
  return blocks.flatMap(block => {
    const lines = block.split("
");
    const line = lines.find(x => x.includes("-->"));
    if (!line) return [];
    const parts = line.split("-->").map(x => x.trim().split(" ")[0]);
    const seconds = value => {
      const p = value.replace(",", ".").split(":").map(Number);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    };
    const text = lines.slice(lines.indexOf(line) + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    return text ? [{ start: seconds(parts[0]), end: seconds(parts[1]), text }] : [];
  });
}
function normalizeWords(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

function alignScenesToCaptions(scenes, captions, duration, fps) {
  const words = captions.flatMap(caption => normalizeWords(caption.text).map(word => ({ word, start: caption.start, end: caption.end })));
  let cursor = 0;
  const ranges = scenes.map(scene => {
    const expected = normalizeWords(scene.narration);
    if (!expected.length) return null;
    let best = null;
    for (let start = cursor; start < words.length; start++) {
      if (words[start].word !== expected[0]) continue;
      let scan = start;
      let matched = 0;
      let last = start;
      for (const word of expected) {
        let found = -1;
        for (let j = scan; j < Math.min(words.length, scan + 5); j++) {
          if (words[j].word === word) { found = j; break; }
        }
        if (found >= 0) { matched++; last = found; scan = found + 1; }
      }
      if (!best || matched > best.matched) best = { start, last, matched, ratio: matched / expected.length };
      if (matched / expected.length >= 0.82) break;
    }
    if (best && best.ratio >= 0.55) {
      cursor = best.last + 1;
      return { start: words[best.start].start, end: words[best.last].end };
    }
    return null;
  });

  const counts = scenes.map(scene => normalizeWords(scene.narration).length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let elapsed = 0;
  const fallback = counts.map((count, i) => {
    const start = elapsed;
    elapsed += duration * count / total;
    return { start, end: i === counts.length - 1 ? duration : elapsed };
  });
  if (ranges.some(range => !range)) console.warn("[timing] Ada scene yang tidak cocok dengan subtitle; hanya scene tersebut memakai estimasi fallback.");

  const resolved = ranges.map((range, i) => range || fallback[i]);
  const boundaries = [0];
  for (let i = 1; i < scenes.length; i++) {
    const left = resolved[i - 1].end;
    const right = resolved[i].start;
    boundaries.push(Math.max(boundaries[i - 1] + 0.25, Math.min(duration - 0.25 * (scenes.length - i), (left + right) / 2)));
  }
  boundaries.push(duration);
  return scenes.map((scene, i) => ({
    startFrame: Math.round(boundaries[i] * fps),
    durationInFrames: Math.max(1, Math.round((boundaries[i + 1] - boundaries[i]) * fps))
  }));
}

function audioDuration(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
    let output = "";
    child.stdout.on("data", chunk => output += chunk);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(Number(output.trim())) : reject(new Error("ffprobe gagal")));
  });
}

const args = process.argv.slice(2);
const autoMode = args.includes("--auto") || (process.env.HORROR_TOPIC_MODE || "").toLowerCase() === "auto";
let topic = args.filter(arg => arg !== "--auto").join(" ").trim() || process.env.HORROR_TOPIC || "";
await Promise.all([ASSETS_DIR, AUDIO_DIR, DATA_DIR, OUT_DIR].map(dir => fs.mkdir(dir, { recursive: true })));

if (autoMode) {
  console.log("[0/6] Riset tren horor/misteri YouTube Indonesia (kemarin)");
  const trend = await researchTrendingTopic();
  topic = trend.topic;
  await fs.writeFile(path.join(DATA_DIR, "trend-report.json"), JSON.stringify(trend, null, 2));
  console.log("[trend] Topik terpilih: " + topic);
  console.log("[trend] Alasan: " + trend.reason);
} else if (!topic) {
  throw new Error('Topik kosong. Gunakan: npm run generate -- --auto atau npm run generate -- "Misteri Alas Purwo".');
}

console.log("[1/6] Generate cerita");
const story = await generateStory(topic);
await fs.writeFile(path.join(DATA_DIR, "story.json"), JSON.stringify(story, null, 2));

console.log("[2/6] Generate metadata SEO dari isi cerita");
const seo = await generateSeo(story, topic);
await fs.writeFile(path.join(DATA_DIR, "youtube-metadata.json"), JSON.stringify(seo, null, 2));

console.log("[3/6] Generate narasi Edge-TTS");
const audioPath = path.join(AUDIO_DIR, "narration.mp3");
const subtitlePath = path.join(AUDIO_DIR, "narration.vtt");
await generateNarration(story.narration, audioPath, subtitlePath);
const captions = parseVtt(await fs.readFile(subtitlePath, "utf8"));
const duration = await audioDuration(audioPath);
if (duration > 300) {
  throw new Error(`[duration] Narasi ${duration.toFixed(1)} detik melewati batas 5 menit. Perpendek naskah lalu jalankan ulang; visual tidak dibuat agar biaya image generation tidak terbuang.`);
}

console.log("[4/6] Ambil visual scene");
const assets = [];
for (let i = 0; i < story.scenes.length; i++) {
  console.log("Scene " + (i + 1) + "/" + story.scenes.length);
  assets.push(await getSceneImage(story.scenes[i], i));
}

console.log("[5/6] Generate thumbnail YouTube");
await generateThumbnail(story, seo, topic);

const fps = 30;
const timings = alignScenesToCaptions(story.scenes, captions, duration, fps);
const scenes = story.scenes.map((scene, i) => ({
  ...assets[i],
  heading: scene.heading,
  narration: scene.narration,
  visualPrompt: scene.visualPrompt,
  startFrame: timings[i].startFrame,
  durationInFrames: timings[i].durationInFrames
}));
await fs.writeFile(path.join(DATA_DIR, "asset-manifest.json"), JSON.stringify(assets, null, 2));
const manifest = {
  title: story.title,
  description: story.description || "",
  disclaimer: story.disclaimer || "",
  durationInFrames: Math.ceil(duration * fps),
  fps,
  scenes,
  captions
};
await fs.writeFile(path.join(ROOT, "remotion", "generatedStory.js"), "export const generatedStory = " + JSON.stringify(manifest, null, 2) + ";
");
console.log("[6/6] Berhasil. Durasi: " + duration.toFixed(1) + " detik.");
