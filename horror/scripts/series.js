import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { planSeason } from "../src/ai/seriesPlanner.js";
import { createInitialLedger } from "../src/ai/continuityLedger.js";
import { DATA_DIR } from "../src/config.js";

const [command, ...args] = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const flag = name => args.includes(name);
const seasonId = arg("--season", "season-01").replace(/[^a-zA-Z0-9_-]/g, "");
if (!seasonId) throw new Error("Season ID tidak valid.");
const format = arg("--format", "shorts") === "long" ? "long" : "shorts";
const seasonRoot = format === "long" ? "long-seasons" : "seasons";
const seasonDir = path.join(DATA_DIR, seasonRoot, seasonId);
const episodesDir = path.join(seasonDir, "episodes");
await fs.mkdir(episodesDir, { recursive: true });
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));

if (command === "plan") {
  const genre = arg("--genre", "mystery");
  const concept = arg("--concept");
  const seriesTitle = arg("--title");
  const episodeCount = Number(arg("--episodes", "8"));
  const durationMinutes = Number(arg("--duration", "5"));
  if (![4, 6, 8, 10, 12].includes(episodeCount)) throw new Error("--episodes harus 4, 6, 8, 10, atau 12.");
  if (!concept) throw new Error('Konsep season wajib diisi. Contoh: npm run generate:season -- --season season-01 --concept "POV: Terjebak di sekolah saat kiamat zombie"');
  const biblePath = path.join(seasonDir, "series-bible.json");
  try {
    await fs.access(biblePath);
    if (!flag("--force")) throw new Error("Season plan sudah ada. Gunakan --force jika ingin mengganti plan lama yang belum memiliki naskah dan scene.");
    const existingEpisodes = await fs.readdir(episodesDir);
    if (existingEpisodes.length) throw new Error("Season ini sudah memiliki folder episode. Untuk menghindari tertimpanya aset lama, gunakan season_id baru untuk membuat plan baru.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  console.log("[season] Membuat series bible, " + episodeCount + " naskah final, dan seluruh scene...");
  const bible = await planSeason(concept, { seasonId, genre, seriesTitle, episodeCount, format, durationMinutes });
  await writeJson(biblePath, bible);
  await writeJson(path.join(seasonDir, "characters.json"), bible.characters);
  await writeJson(path.join(seasonDir, "world-rules.json"), bible.worldRules);
  await writeJson(path.join(seasonDir, "continuity-ledger.json"), createInitialLedger(bible));
  await writeJson(path.join(seasonDir, "production-state.json"), {
    seasonId, genre, format, durationMinutes: format === "long" ? durationMinutes : null, episodeCount: bible.episodes.length, productionStandard: bible.productionStandard || null, status: "planned", episodes: bible.episodes.map(item => ({
      episodeNumber: item.episodeNumber, title: item.title, status: "not_started"
    })), updatedAt: new Date().toISOString()
  });
  console.log("[season] Season plan tersimpan: " + bible.seriesTitle + " (" + bible.episodes.length + " episode).");
  if (format === "shorts" && bible.productionStandard) {
    const standard = bible.productionStandard;
    console.log("[season] Standar Shorts: " + standard.scenesPerEpisode + " scene/episode, " + standard.minWordsPerEpisode + "-" + standard.maxWordsPerEpisode + " kata/episode, 115-125 detik/episode.");
    console.log("[season] Total season: " + standard.totalScenes + " scene, " + standard.minSeasonWords + "-" + standard.maxSeasonWords + " kata, " + Math.floor(standard.minSeasonDurationSeconds / 60) + ":" + String(standard.minSeasonDurationSeconds % 60).padStart(2, "0") + "-" + Math.floor(standard.maxSeasonDurationSeconds / 60) + ":" + String(standard.maxSeasonDurationSeconds % 60).padStart(2, "0") + " durasi total.");
  }
  for (const episode of bible.episodes) console.log(String(episode.episodeNumber).padStart(2, "0") + ". " + episode.title);
  process.exit(0);
}

if (command === "episode") {
  const episodeNumber = Number(arg("--episode", "1"));
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 12) throw new Error("--episode harus angka 1 sampai 12.");
  const bible = await readJson(path.join(seasonDir, "series-bible.json"));
  const statePath = path.join(seasonDir, "production-state.json");
  const state = await readJson(statePath);
  const episodePlan = bible.episodes.find(item => Number(item.episodeNumber) === episodeNumber);
  if (!episodePlan) throw new Error("Episode tidak ditemukan di series bible.");
  if (!episodePlan.narration || !Array.isArray(episodePlan.scenes) || episodePlan.scenes.length < (format === "long" ? Math.max(6, Math.round(Number(bible.durationMinutes || 5) * 3)) : 6) || episodePlan.scenes.length > (format === "long" ? Math.min(32, Math.max(6, Math.round(Number(bible.durationMinutes || 5) * 3)) + 2) : 8)) {
    throw new Error("Season plan lama/tidak lengkap: episode ini belum memiliki naskah final dan scene sesuai format. Buat ulang season plan agar semua naskah dan scene disiapkan sejak awal.");
  }
  const episodeDir = path.join(episodesDir, "episode-" + String(episodeNumber).padStart(2, "0"));
  await fs.mkdir(episodeDir, { recursive: true });
  const storyPath = path.join(episodeDir, "story.json");
  try {
    const existingStory = await readJson(storyPath);
    if (!flag("--force")) {
      if (format === "shorts") {
        const existingNarration = String(existingStory.narration || "").trim();
        const existingWords = existingNarration.split(/\s+/).filter(Boolean).length;
        const existingScenes = Array.isArray(existingStory.scenes) ? existingStory.scenes : [];
        const existingSceneNarration = existingScenes.map(scene => String(scene.narration || "").trim()).join(" ").replace(/\s+/g, " ").trim();
        if (existingWords < 240 || existingWords > 270 || existingScenes.length < 6 || existingScenes.length > 8 || existingSceneNarration !== existingNarration.replace(/\s+/g, " ").trim()) {
          throw new Error("story.json lama belum memenuhi standar Shorts (240-270 kata, 6-8 scene, dan narasi scene harus identik). Jalankan ulang workflow dengan regenerate_script=yes setelah Season Plan diperbarui.");
        }
      }
      if (format !== "long") await fs.mkdir(DATA_DIR, { recursive: true });
      if (format !== "long") await writeJson(path.join(DATA_DIR, "story.json"), existingStory);
      if (format !== "long") await writeJson(path.join(DATA_DIR, "active-episode.json"), { seasonId, episodeNumber, episodeDir, storyPath, format });
      state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber ? { ...item, title: existingStory.title, status: "script_ready", sceneCount: existingStory.scenes.length } : item);
      state.updatedAt = new Date().toISOString();
      await writeJson(statePath, state);
      console.log("[script] Naskah sudah tersedia; menggunakan file yang sama tanpa generate ulang.");
      process.exit(0);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const scenes = episodePlan.scenes.map((scene, index) => ({
    id: scene.id ?? index + 1,
    heading: String(scene.heading || "Adegan " + (index + 1)),
    narration: String(scene.narration || "").trim(),
    visualPrompt: String(scene.visualPrompt || "").trim(),
    searchQuery: String(scene.searchQuery || "").trim(),
    mood: String(scene.mood || "cinematic")
  }));
  if (scenes.some(scene => !scene.narration || !scene.visualPrompt)) throw new Error("Season plan memiliki scene tanpa narration atau visualPrompt.");
  const narration = String(episodePlan.narration).trim();
  const wordCount = narration.split(/\s+/).filter(Boolean).length;
  if (format === "shorts" && (wordCount < 240 || wordCount > 270)) throw new Error("Episode " + episodeNumber + " memiliki " + wordCount + " kata. Standar Shorts baru wajib 240-270 kata. Perbaiki/regenerate season plan sebelum produksi.");
  if (format === "shorts" && scenes.length < 6 || scenes.length > 8) throw new Error("Standar Shorts baru wajib 6-8 scene; ditemukan " + scenes.length + ".");
  if (scenes.map(scene => scene.narration).join(" ").replace(/\s+/g, " ").trim() !== narration.replace(/\s+/g, " ").trim()) {
    throw new Error("Naskah utama tidak sama dengan gabungan narration setiap scene. Perbaiki season plan sebelum produksi.");
  }
  const story = {
    episodeNumber,
    seriesTitle: String(bible.seriesTitle || bible.themeTitle || bible.title || ""),
    title: String(episodePlan.title || "Episode " + episodeNumber),
    description: String(episodePlan.description || episodePlan.logline || ""),
    genre: String(bible.genre || state.genre || "storytelling"),
    category: String(bible.genre || "Storytelling"),
    disclaimer: String(episodePlan.disclaimer || "Cerita fiksi untuk hiburan. Kemiripan dengan kejadian atau tokoh nyata tidak disengaja."),
    hook: String(episodePlan.hook || episodePlan.openingHook || ""),
    mainConflict: String(episodePlan.mainConflict || ""),
    revelation: String(episodePlan.revelation || episodePlan.turningPoint || ""),
    cliffhanger: String(episodePlan.cliffhanger || ""),
    endingType: String(episodePlan.endingType || (episodeNumber === bible.episodes.length ? "finale_resolution" : "cliffhanger")),
    nextEpisodeQuestion: String(episodePlan.nextEpisodeQuestion || ""),
    continuityFromPrevious: episodePlan.continuityBridge || null,
    episodePayoff: String(episodePlan.episodePayoff || ""),
    seasonTeaser: String(episodePlan.seasonTeaser || ""),
    storySummary: String(episodePlan.storySummary || episodePlan.logline || ""),
    narration, wordCount, targetDurationSeconds: format === "shorts" ? { min: 115, max: 125 } : null,
    scenes, characters: bible.characters || [], continuityUpdate: episodePlan.continuityUpdate || { canonEvents: [], characterStates: [], unresolvedThreads: [], resolvedThreads: [] }
  };
  await writeJson(storyPath, story);
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (format !== "long") await writeJson(path.join(DATA_DIR, "story.json"), story);
  if (format !== "long") await writeJson(path.join(DATA_DIR, "active-episode.json"), { seasonId, episodeNumber, episodeDir, storyPath, format });
  state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber
    ? { ...item, title: story.title, status: "script_ready", sceneCount: scenes.length }
    : item);
  state.updatedAt = new Date().toISOString();
  await writeJson(statePath, state);
  console.log("[script] Episode " + episodeNumber + " diambil langsung dari season plan (" + bible.episodes.length + " episode tersedia).");
  console.log("[script] Tidak ada pemanggilan Gemini pada tahap generate episode.");
  console.log("[script] Tersimpan: " + storyPath);
  process.exit(0);
}

throw new Error("Perintah tidak dikenal. Gunakan: node scripts/series.js plan|episode ...");
