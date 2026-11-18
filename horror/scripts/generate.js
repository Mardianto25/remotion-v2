import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateStory } from "../src/ai/storyGenerator.js";
import { getSceneImage } from "../src/visual/providers.js";
import { generateNarration } from "../src/audio/edgeTts.js";
import { ROOT, ASSETS_DIR, AUDIO_DIR, DATA_DIR, OUT_DIR } from "../src/config.js";

function parseVtt(vtt) {
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
  return blocks.flatMap(block => {
    const lines = block.split("\n");
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
function audioDuration(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
    let output = "";
    child.stdout.on("data", chunk => output += chunk);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(Number(output.trim())) : reject(new Error("ffprobe gagal")));
  });
}

const topic = process.argv.slice(2).join(" ").trim() || process.env.HORROR_TOPIC;
if (!topic) throw new Error('Gunakan: npm run generate -- "Misteri Alas Purwo"');
await Promise.all([ASSETS_DIR, AUDIO_DIR, DATA_DIR, OUT_DIR].map(dir => fs.mkdir(dir, { recursive: true })));

console.log("[1/4] Generate cerita");
const story = await generateStory(topic);
await fs.writeFile(path.join(DATA_DIR, "story.json"), JSON.stringify(story, null, 2));

console.log("[2/4] Generate narasi Edge-TTS");
const audioPath = path.join(AUDIO_DIR, "narration.mp3");
const subtitlePath = path.join(AUDIO_DIR, "narration.vtt");
await generateNarration(story.narration, audioPath, subtitlePath);
const captions = parseVtt(await fs.readFile(subtitlePath, "utf8"));
const duration = await audioDuration(audioPath);

console.log("[3/4] Ambil visual scene");
const assets = [];
for (let i = 0; i < story.scenes.length; i++) {
  console.log("Scene " + (i + 1) + "/" + story.scenes.length);
  assets.push(await getSceneImage(story.scenes[i], i));
}

const words = story.scenes.map(s => (s.narration || "").split(/\s+/).filter(Boolean).length);
const totalWords = words.reduce((a, b) => a + b, 0) || 1;
let cursor = 0;
const fps = 30;
const scenes = story.scenes.map((scene, i) => {
  const startFrame = Math.round(cursor * fps);
  cursor += duration * words[i] / totalWords;
  const endFrame = i === story.scenes.length - 1 ? Math.ceil(duration * fps) : Math.round(cursor * fps);
  return { ...assets[i], startFrame, durationInFrames: Math.max(1, endFrame - startFrame) };
});

const manifest = {
  title: story.title,
  description: story.description || "",
  disclaimer: story.disclaimer || "",
  durationInFrames: Math.ceil(duration * fps),
  fps,
  scenes,
  captions
};
await fs.writeFile(path.join(ROOT, "remotion", "generatedStory.js"), "export const generatedStory = " + JSON.stringify(manifest, null, 2) + ";\n");
console.log("[4/4] Berhasil. Durasi: " + duration.toFixed(1) + " detik.");
