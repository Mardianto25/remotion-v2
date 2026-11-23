import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DATA_DIR, ROOT, OUT_DIR, AUDIO_DIR, ASSETS_DIR } from "../src/config.js";
import { getSceneImage } from "../src/visual/providers.js";
import { generateNarration } from "../src/audio/edgeTts.js";
import { generateSoundAssets } from "../src/audio/soundAssets.js";
import { generateSeo } from "../src/ai/seoGenerator.js";
import { generateThumbnail } from "../src/visual/thumbnail.js";

const args = process.argv.slice(2);
const stage = args[0];
const arg = (name, fallback = "") => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || fallback : fallback; };
const seasonId = arg("--season", "season-01").replace(/[^a-zA-Z0-9_-]/g, "");
const episodeNumber = Number(arg("--episode", "1"));
if (!seasonId || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 8) throw new Error("Season/episode tidak valid.");
const episodeDir = path.join(DATA_DIR, "seasons", seasonId, "episodes", "episode-" + String(episodeNumber).padStart(2, "0"));
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
const storyPath = path.join(episodeDir, "story.json");
const story = await readJson(storyPath);
const assetsDir = path.join(episodeDir, "assets");
const audioDir = path.join(episodeDir, "audio");
await Promise.all([assetsDir, audioDir, OUT_DIR].map(dir => fs.mkdir(dir, { recursive: true })));

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(command + " exit code " + code)));
  });
}
function parseVtt(vtt) {
  return vtt.replace(/\r/g, "").split(/\n\n+/).flatMap(block => {
    const lines = block.split("\n");
    const line = lines.find(x => x.includes("-->"));
    if (!line) return [];
    const [start, end] = line.split("-->").map(x => x.trim().split(" ")[0]);
    const seconds = value => { const p = value.replace(",", ".").split(":").map(Number); return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; };
    const text = lines.slice(lines.indexOf(line)+1).join(" ").replace(/<[^>]+>/g, "").trim();
    return text ? [{ start: seconds(start), end: seconds(end), text }] : [];
  });
}
async function durationOf(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file]);
    let out=""; child.stdout.on("data", c => out += c); child.on("error",reject);
    child.on("close",code => code === 0 ? resolve(Number(out.trim())) : reject(new Error("ffprobe gagal membaca durasi audio")));
  });
}

if (stage === "images") {
  for (let i = 0; i < story.scenes.length; i++) {
    const filename = "scene-" + String(i + 1).padStart(3, "0") + ".jpg";
    const destination = path.join(assetsDir, filename);
    try {
      const stat = await fs.stat(destination);
      if (stat.size > 1024) { console.log("[image] Skip scene " + (i+1) + ", file sudah tersedia (" + stat.size + " bytes)."); continue; }
    } catch {}
    console.log("[image] Generate scene " + (i+1) + "/" + story.scenes.length);
    await getSceneImage(story.scenes[i], i, assetsDir);
    const produced = path.join(assetsDir, filename);
    const stat = await fs.stat(produced);
    if (stat.size <= 1024) throw new Error("Image scene " + (i+1) + " kosong/tidak valid.");
  }
  const manifest = story.scenes.map((scene, i) => ({ id: scene.id, fileName: "scene-" + String(i+1).padStart(3,"0") + ".jpg", visualPrompt: scene.visualPrompt }));
  await writeJson(path.join(episodeDir, "image-manifest.json"), manifest);
  console.log("[image] Semua " + story.scenes.length + " scene tersedia. File yang valid tidak dibuat ulang.");
} else if (stage === "audio") {
  const audioPath = path.join(audioDir, "narration.mp3");
  const subtitlePath = path.join(audioDir, "narration.vtt");
  try {
    const stat = await fs.stat(audioPath);
    if (stat.size > 1024) console.log("[audio] Audio sudah ada; tidak dibuat ulang.");
    else throw new Error("empty");
  } catch {
    await generateNarration(story.narration, audioPath, subtitlePath);
  }
  const duration = await durationOf(audioPath);
  if (duration > 60) throw new Error("Audio " + duration.toFixed(1) + " detik melebihi batas Shorts 60 detik.");
  const captions = parseVtt(await fs.readFile(subtitlePath, "utf8"));
  if (!captions.length) throw new Error("Subtitle VTT kosong/tidak valid.");
  await writeJson(path.join(episodeDir, "audio-manifest.json"), { durationSeconds: Number(duration.toFixed(3)), captions, audio: "audio/narration.mp3", subtitles: "audio/narration.vtt" });
  console.log("[audio] Selesai: " + duration.toFixed(1) + " detik.");
} else if (stage === "render") {
  const audioManifest = await readJson(path.join(episodeDir, "audio-manifest.json"));
  const imageManifest = await readJson(path.join(episodeDir, "image-manifest.json"));
  const fps = 30;
  const duration = Number(audioManifest.durationSeconds);
  const totalFrames = Math.ceil(duration * fps);
  const words = story.scenes.map(scene => (scene.narration.match(/\S+/g) || []).length);
  const totalWords = words.reduce((a,b)=>a+b,0) || 1;
  let cursor = 0;
  const scenes = story.scenes.map((scene,i) => {
    const startFrame = cursor;
    const frames = i === story.scenes.length-1 ? totalFrames-cursor : Math.max(1,Math.round(totalFrames*words[i]/totalWords));
    cursor += frames;
    return { ...scene, fileName: imageManifest[i].fileName, startFrame, durationInFrames: frames };
  });
  await fs.mkdir(ASSETS_DIR,{recursive:true});
  for (const item of imageManifest) await fs.copyFile(path.join(assetsDir,item.fileName),path.join(ASSETS_DIR,item.fileName));
  await fs.mkdir(AUDIO_DIR,{recursive:true});
  await fs.copyFile(path.join(audioDir,"narration.mp3"),path.join(AUDIO_DIR,"narration.mp3"));
  const captions = audioManifest.captions;
  const manifest = { title:story.title, description:story.description||"", disclaimer:story.disclaimer||"", durationInFrames:totalFrames, fps, scenes, captions, soundEffects:[], soundBeds:[], soundAssets:[] };
  await fs.writeFile(path.join(ROOT,"remotion","generatedStory.js"),"export const generatedStory = "+JSON.stringify(manifest,null,2)+";\n");
  await run("npx",["remotion","render","remotion/index.jsx","HorrorVideo","out/indonesian-horror.mp4","--codec=h264","--crf=22"]);
  const video=path.join(OUT_DIR,"indonesian-horror.mp4");
  const videoDuration=await durationOf(video);
  if(videoDuration>60.05) throw new Error("Hasil render melebihi 60 detik.");
  await fs.copyFile(video,path.join(episodeDir,"indonesian-horror.mp4"));
  console.log("[render] Video berhasil dibuat: "+video);
} else if (stage === "thumbnail") {
  process.env.STORY_GENRE = story.genre || "mystery";
  const seoPath = path.join(episodeDir,"youtube-metadata.json");
  let seo;
  try { seo=await readJson(seoPath); console.log("[thumbnail] Metadata SEO sudah tersedia; memakai ulang."); }
  catch { seo=await generateSeo(story,story.title); await writeJson(seoPath,seo); }
  await generateThumbnail(story,seo,story.title);
  await fs.copyFile(path.join(OUT_DIR,"youtube-thumbnail.jpg"),path.join(episodeDir,"youtube-thumbnail.jpg"));
  await fs.copyFile(path.join(OUT_DIR,"shorts-cover.jpg"),path.join(episodeDir,"shorts-cover.jpg"));
  console.log("[thumbnail] Landscape dan vertical cover berhasil dibuat.");
} else {
  throw new Error("Stage tidak dikenal. Gunakan images|audio|render|thumbnail.");
}
