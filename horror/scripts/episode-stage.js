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
if (!seasonId || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 12) throw new Error("Season/episode tidak valid.");
const episodeDir = path.join(DATA_DIR, "seasons", seasonId, "episodes", "episode-" + String(episodeNumber).padStart(2, "0"));
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
const storyPath = path.join(episodeDir, "story.json");
const bible = await readJson(path.join(DATA_DIR, "seasons", seasonId, "series-bible.json"));
if (!Array.isArray(bible.episodes) || !bible.episodes.some(item => Number(item.episodeNumber) === episodeNumber)) throw new Error("Episode " + episodeNumber + " tidak ada dalam Season Plan. Serial ini memiliki " + (bible.episodes || []).length + " episode.");
const story = await readJson(storyPath);
story.contentId = "short-" + seasonId + "-episode-" + String(episodeNumber).padStart(2, "0");
story.format = "shorts";
story.characters = Array.isArray(bible.characters) ? bible.characters : [];
story.seriesTitle = String(bible.seriesTitle || story.seriesTitle || story.themeTitle || "").trim();
story.themeTitle = story.seriesTitle;
// Shorts standard: flexible narration length, with a minimum estimated word floor.
// Actual duration is validated from generated audio/video and must be at least 60 seconds.
const SHORTS_STANDARD = { minWords: 100, maxWords: 1000, minScenes: 6, maxScenes: 8, minDurationSeconds: 60 };
const narrationWordCount = String(story.narration || "").trim().split(/\s+/).filter(Boolean).length;
if (!Array.isArray(story.scenes) || story.scenes.length < SHORTS_STANDARD.minScenes || story.scenes.length > SHORTS_STANDARD.maxScenes) throw new Error("[standard] Episode " + episodeNumber + " memiliki " + (story.scenes || []).length + " scene. Standar Shorts wajib 6-8 scene.");
if (narrationWordCount < SHORTS_STANDARD.minWords || narrationWordCount > SHORTS_STANDARD.maxWords) throw new Error("[standard] Episode " + episodeNumber + " memiliki " + narrationWordCount + " kata. Standar Shorts menggunakan jumlah kata fleksibel (minimal 100 kata sebagai batas validasi awal; tidak ada batas 240-270 kata). Regenerate/perbaiki Season Plan jika narasi terlalu pendek atau terlalu panjang.");
const sceneNarration = story.scenes.map(scene => String(scene.narration || "").trim()).join(" ").replace(/\s+/g, " ").trim();
if (sceneNarration !== String(story.narration).replace(/\s+/g, " ").trim()) throw new Error("[standard] Gabungan narasi scene tidak sama persis dengan narasi utama.");
console.log("[standard] Lolos: " + narrationWordCount + " kata, " + story.scenes.length + " scene. Durasi audio/video minimal 60 detik; jumlah kata fleksibel.");
const seasonDir = path.dirname(path.dirname(episodeDir));
const statePath = path.join(seasonDir, "production-state.json");

// Manual season-bible imports may not include production-state.json.
// Initialize it once from the bible so every stage can safely update progress.
async function ensureProductionState() {
  try {
    await fs.access(statePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const initialState = {
      seasonId,
      genre: bible.genre || story.genre || "storytelling",
      format: "shorts",
      episodeCount: bible.episodes.length,
      status: "planned",
      episodes: bible.episodes.map(item => ({
        episodeNumber: Number(item.episodeNumber),
        title: item.title || "Episode " + item.episodeNumber,
        status: "not_started"
      })),
      updatedAt: new Date().toISOString()
    };
    await writeJson(statePath, initialState);
    console.log("[state] production-state.json belum ada; state awal dibuat dari series-bible.json.");
  }
}
await ensureProductionState();

async function setEpisodeState(status, extra = {}) {
  const state = await readJson(statePath);
  state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber ? { ...item, status, ...extra } : item);
  state.updatedAt = new Date().toISOString();
  await writeJson(statePath, state);
}
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
  const visualStyle = String(process.env.HORROR_VISUAL_STYLE || "cinematic-3d");
  const currentState = await readJson(statePath);
  const currentEpisode = currentState.episodes.find(item => item.episodeNumber === episodeNumber) || {};
  if (currentEpisode.visualStyle && currentEpisode.visualStyle !== visualStyle) throw new Error("Visual style episode sudah dikunci ke " + currentEpisode.visualStyle + ". Gunakan style yang sama saat resume agar gambar tidak tercampur.");
  await setEpisodeState("images_in_progress", { visualStyle });
  for (let i = 0; i < story.scenes.length; i++) {
    const filename = "scene-" + String(i + 1).padStart(3, "0") + ".jpg";
    const destination = path.join(assetsDir, filename);
    try {
      const stat = await fs.stat(destination);
      const forceRegenerate = String(process.env.FORCE_REGENERATE_IMAGES || "no").toLowerCase() === "yes";
      if (stat.size > 1024 && !forceRegenerate) { console.log("[image] Skip scene " + (i+1) + ", file sudah tersedia (" + stat.size + " bytes)."); continue; }
      if (stat.size > 1024 && forceRegenerate) console.log("[image] Generate ulang scene " + (i+1) + " sesuai pilihan workflow.");
    } catch {}
    console.log("[image] Generate scene " + (i+1) + "/" + story.scenes.length);
    await getSceneImage(story.scenes[i], i, assetsDir, story.characters);
    const produced = path.join(assetsDir, filename);
    const stat = await fs.stat(produced);
    if (stat.size <= 1024) throw new Error("Image scene " + (i+1) + " kosong/tidak valid.");
    await writeJson(path.join(episodeDir, "image-progress.json"), { completed: i + 1, total: story.scenes.length, lastCompletedScene: i + 1, updatedAt: new Date().toISOString() });
  }
  const manifest = story.scenes.map((scene, i) => ({ id: scene.id, fileName: "scene-" + String(i+1).padStart(3,"0") + ".jpg", visualPrompt: scene.visualPrompt }));
  await writeJson(path.join(episodeDir, "image-manifest.json"), manifest);
  await setEpisodeState("images_ready", { imageCount: story.scenes.length, visualStyle });
  console.log("[image] Semua " + story.scenes.length + " scene tersedia. File yang valid tidak dibuat ulang.");
} else if (stage === "audio") {
  await setEpisodeState("audio_in_progress");
  const audioPath = path.join(audioDir, "narration.mp3");
  const subtitlePath = path.join(audioDir, "narration.vtt");
  const forceRegenerateAudio = String(process.env.FORCE_REGENERATE_AUDIO || "no").toLowerCase() === "yes";
  let audioFilesReady = false;
  try {
    const [audioStat, subtitleStat] = await Promise.all([fs.stat(audioPath), fs.stat(subtitlePath)]);
    audioFilesReady = audioStat.size > 1024 && subtitleStat.size > 0;
  } catch {}
  if (audioFilesReady && !forceRegenerateAudio) {
    console.log("[audio] Audio dan subtitle sudah ada; tidak dibuat ulang.");
  } else {
    if (forceRegenerateAudio) console.log("[audio] Regenerate dipaksa oleh input workflow.");
    await generateNarration(story.narration, audioPath, subtitlePath);
  }
  const duration = await durationOf(audioPath);
  if (duration < SHORTS_STANDARD.minDurationSeconds) throw new Error("Audio " + duration.toFixed(1) + " detik kurang dari standar minimum Shorts 60 detik. Perbaiki narasi atau generate ulang audio.");
  const captions = parseVtt(await fs.readFile(subtitlePath, "utf8"));
  if (!captions.length) throw new Error("Subtitle VTT kosong/tidak valid.");
  await writeJson(path.join(episodeDir, "audio-manifest.json"), { durationSeconds: Number(duration.toFixed(3)), captions, audio: "audio/narration.mp3", subtitles: "audio/narration.vtt" });
  await setEpisodeState("audio_ready", { durationSeconds: Number(duration.toFixed(1)), wordCount: narrationWordCount, sceneCount: story.scenes.length, productionStandard: "shorts-minimum-60s-v2" });
  console.log("[audio] Selesai: " + duration.toFixed(1) + " detik.");
} else if (stage === "render") {
  await setEpisodeState("render_in_progress");
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
  if(videoDuration < SHORTS_STANDARD.minDurationSeconds) throw new Error("Hasil render " + videoDuration.toFixed(1) + " detik kurang dari standar minimum Shorts 60 detik.");
  await fs.copyFile(video,path.join(episodeDir,"indonesian-horror.mp4"));
  await setEpisodeState("rendered", { durationSeconds: Number(videoDuration.toFixed(1)), wordCount: narrationWordCount, sceneCount: story.scenes.length, productionStandard: "shorts-minimum-60s-v2", videoPath: "episodes/episode-" + String(episodeNumber).padStart(2,"0") + "/indonesian-horror.mp4" });
  console.log("[render] Video berhasil dibuat: "+video);
} else if (stage === "thumbnail") {
  await setEpisodeState("thumbnail_in_progress");
  process.env.STORY_GENRE = story.genre || "mystery";
  const currentState = await readJson(statePath);
  const currentEpisode = currentState.episodes.find(item => Number(item.episodeNumber) === episodeNumber) || {};
  const thumbnailStyle = String(process.env.HORROR_THUMBNAIL_STYLE || currentEpisode.thumbnailVisualStyle || currentEpisode.visualStyle || "cinematic-3d").toLowerCase();
  process.env.HORROR_THUMBNAIL_STYLE = thumbnailStyle;
  const styleKey = thumbnailStyle === "2d" || thumbnailStyle === "2d-animation" ? "2d-animation" : "cinematic-3d";
  const expectedThumbnailVersion = "episode-ctr-v12-season-master-" + styleKey + "-portrait";
  console.log("[thumbnail] Menggunakan visual style thumbnail: " + styleKey);
  const verticalExisting = path.join(episodeDir,"shorts-cover.jpg");
  try {
    const v = await fs.stat(verticalExisting);
    const cachedMetadata = await readJson(path.join(episodeDir,"youtube-metadata.json"));
    const forceRegenerate = String(process.env.FORCE_THUMBNAIL_REGENERATE || "no").toLowerCase() === "yes";
    if (v.size > 1024 && cachedMetadata.thumbnail?.version === expectedThumbnailVersion && !forceRegenerate) {
      console.log("[thumbnail] Shorts cover 9:16 " + styleKey + " sudah tersedia; tidak generate ulang.");
      await setEpisodeState("thumbnail_ready", { thumbnailVisualStyle: styleKey });
      process.exit(0);
    }
    if (forceRegenerate) console.log("[thumbnail] Regenerate dipaksa oleh input workflow.");
  } catch {}

  const seoPath = path.join(episodeDir,"youtube-metadata.json");
  let seo;
  try {
    seo=await readJson(seoPath);
    if (seo.format !== "shorts" || !seo.title || !seo.description || !seo.thumbnailPrompt || !seo.thumbnailText) {
      throw new Error("Metadata Shorts belum lengkap; perlu dibuat ulang.");
    }
    console.log("[thumbnail] Metadata SEO/CTR Shorts tersedia; memakai ulang.");
  } catch {
    console.log("[thumbnail] Membuat metadata SEO/CTR Shorts.");
    seo=await generateSeo(story,story.title,{ format: "shorts" });
    await writeJson(seoPath,seo);
  }
  await generateThumbnail(story,seo,story.title,seoPath,{ masterImagePath: path.join(seasonDir,"season-thumbnail-master.jpg") });
  await fs.copyFile(path.join(OUT_DIR,"shorts-cover.jpg"),path.join(episodeDir,"shorts-cover.jpg"));
  // Legacy filename remains available as a copy of the same portrait Shorts cover.
  await fs.copyFile(path.join(OUT_DIR,"shorts-cover.jpg"),path.join(episodeDir,"youtube-thumbnail.jpg"));
  await setEpisodeState("thumbnail_ready", { thumbnailVisualStyle: styleKey });
  console.log("[thumbnail] Shorts cover 9:16 + metadata CTR berhasil dibuat; hanya satu gambar AI yang digenerate.");
} else {
  throw new Error("Stage tidak dikenal. Gunakan images|audio|render|thumbnail.");
}
