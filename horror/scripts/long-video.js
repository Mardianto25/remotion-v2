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
const arg = (name, fallback = "") => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || fallback : fallback; };
const durationMinutes = Number(arg("--duration", "5"));
if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 8) throw new Error("--duration harus 1 sampai 8 menit.");
const storyFile = arg("--story-file");
const topic = arg("--topic") || args.filter((v, i) => !["--duration", "--story-file", "--topic"].includes(v) && args[i-1] !== "--duration" && args[i-1] !== "--story-file" && args[i-1] !== "--topic").join(" ").trim();
if (!storyFile && !topic) throw new Error('Masukkan --topic "topik cerita" atau --story-file data/long-seasons/.../story.json');
const safeId = String(arg("--output-id", topic || path.basename(storyFile || "single-video", ".json"))).toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "long-video";
const assetPrefix = "long-video/" + safeId;
const assetsDir = path.join(LONG_PUBLIC_DIR, safeId, "assets");
const audioDir = path.join(LONG_PUBLIC_DIR, safeId, "audio");
const dataDir = path.join(LONG_DATA_DIR, safeId);
const outDir = path.join(LONG_OUT_DIR, safeId);
const dirs = [assetsDir, audioDir, dataDir, outDir];
await Promise.all(dirs.map(dir => fs.mkdir(dir, { recursive: true })));
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
    const child = spawn("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file]);
    let out = ""; child.stdout.on("data", chunk => out += chunk); child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(Number(out.trim())) : reject(new Error("ffprobe gagal membaca durasi")));
  });
}
function parseVtt(vtt) {
  return vtt.replace(/\r/g, "").split(/\n\n+/).flatMap(block => {
    const lines = block.split("\n");
    const line = lines.find(value => value.includes("-->"));
    if (!line) return [];
    const [start, end] = line.split("-->").map(value => value.trim().split(" ")[0]);
    const seconds = value => { const p = value.replace(",", ".").split(":").map(Number); return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; };
    const caption = lines.slice(lines.indexOf(line)+1).join(" ").replace(/<[^>]+>/g, "").trim();
    return caption ? [{ start: seconds(start), end: seconds(end), text: caption }] : [];
  });
}
