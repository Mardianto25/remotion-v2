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
const seasonDir = path.join(DATA_DIR, "seasons", seasonId);
const episodesDir = path.join(seasonDir, "episodes");
await fs.mkdir(episodesDir, { recursive: true });
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));

if (command === "plan") {
  const genre = arg("--genre", "mystery");
  const concept = args.filter((value, index) => !["--season", "--concept", "--genre"].includes(value) && args[index - 1] !== "--season" && args[index - 1] !== "--concept" && args[index - 1] !== "--genre").join(" ").trim() || arg("--concept");
  if (!concept) throw new Error('Konsep season wajib diisi. Contoh: npm run generate:season -- --season season-01 --concept "POV: Terjebak di sekolah saat kiamat zombie"');
  const biblePath = path.join(seasonDir, "series-bible.json");
  try {
    await fs.access(biblePath);
    if (!flag("--force")) throw new Error("Season plan sudah ada. Gunakan --force jika ingin mengganti plan lama yang belum memiliki naskah dan scene.");
    const existingEpisodes = await fs.readdir(episodesDir);
    if (existingEpisodes.length) throw new Error("Season ini sudah memiliki folder episode. Untuk menghindari tertimpanya aset lama, gunakan season_id baru untuk membuat plan baru.");
  } catch (error) {
    if (error.message.includes("Season plan sudah ada")) throw error;
  }
  console.log("[season] Membuat series bible, 8 naskah final, dan seluruh scene...");
  const bible = await planSeason(concept, { seasonId, genre });
  await writeJson(biblePath, bible);
  await writeJson(path.join(seasonDir, "characters.json"), bible.characters);
  await writeJson(path.join(seasonDir, "world-rules.json"), bible.worldRules);
  await writeJson(path.join(seasonDir, "continuity-ledger.json"), createInitialLedger(bible));
  await writeJson(path.join(seasonDir, "production-state.json"), {
    seasonId, genre, status: "planned", episodes: bible.episodes.map(item => ({
      episodeNumber: item.episodeNumber, title: item.title, status: "not_started"
    })), updatedAt: new Date().toISOString()
  });
  console.log("[season] Season plan tersimpan: " + bible.seriesTitle + " (8 episode).");
  for (const episode of bible.episodes) console.log(String(episode.episodeNumber).padStart(2, "0") + ". " + episode.title);
  process.exit(0);
}

if (command === "episode") {
  const episodeNumber = Number(arg("--episode", "1"));
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 8) throw new Error("--episode harus angka 1 sampai 8.");
  const bible = await readJson(path.join(seasonDir, "series-bible.json"));
  const statePath = path.join(seasonDir, "production-state.json");
  const state = await readJson(statePath);
  const episodePlan = bible.episodes.find(item => Number(item.episodeNumber) === episodeNumber);
  if (!episodePlan) throw new Error("Episode tidak ditemukan di series bible.");
  if (!episodePlan.narration || !Array.isArray(episodePlan.scenes) || episodePlan.scenes.length < 5 || episodePlan.scenes.length > 8) {
    throw new Error("Season plan lama/tidak lengkap: episode ini belum memiliki naskah final dan 5-8 scene. Buat ulang season plan agar semua naskah dan scene disiapkan sejak awal.");
  }
  const episodeDir = path.join(episodesDir, "episode-" + String(episodeNumber).padStart(2, "0"));
  await fs.mkdir(episodeDir, { recursive: true });
  const storyPath = path.join(episodeDir, "story.json");
  try {
    const existingStory = await readJson(storyPath);
    if (!flag("--force")) {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await writeJson(path.join(DATA_DIR, "story.json"), existingStory);
      await writeJson(path.join(DATA_DIR, "active-episode.json"), { seasonId, episodeNumber, episodeDir, storyPath });
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
  if (scenes.map(scene => scene.narration).join(" ").replace(/\s+/g, " ").trim() !== narration.replace(/\s+/g, " ").trim()) {
    throw new Error("Naskah utama tidak sama dengan gabungan narration setiap scene. Perbaiki season plan sebelum produksi.");
  }
  const story = {
    episodeNumber, title: String(episodePlan.title || "Episode " + episodeNumber),
    description: String(episodePlan.description || episodePlan.logline || ""),
    genre: String(bible.genre || state.genre || "storytelling"),
    category: String(bible.genre || "Storytelling"),
    disclaimer: String(episodePlan.disclaimer || "Cerita fiksi untuk hiburan. Kemiripan dengan kejadian atau tokoh nyata tidak disengaja."),
    hook: String(episodePlan.hook || episodePlan.openingHook || ""),
    mainConflict: String(episodePlan.mainConflict || ""),
    revelation: String(episodePlan.revelation || episodePlan.turningPoint || ""),
    cliffhanger: String(episodePlan.cliffhanger || ""),
    storySummary: String(episodePlan.storySummary || episodePlan.logline || ""),
    narration, wordCount: narration.split(/\s+/).filter(Boolean).length,
    scenes, continuityUpdate: episodePlan.continuityUpdate || { canonEvents: [], characterStates: [], unresolvedThreads: [], resolvedThreads: [] }
  };
  await writeJson(storyPath, story);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJson(path.join(DATA_DIR, "story.json"), story);
  await writeJson(path.join(DATA_DIR, "active-episode.json"), { seasonId, episodeNumber, episodeDir, storyPath });
  state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber
    ? { ...item, title: story.title, status: "script_ready", sceneCount: scenes.length }
    : item);
  state.updatedAt = new Date().toISOString();
  await writeJson(statePath, state);
  console.log("[script] Episode " + episodeNumber + " diambil langsung dari season plan.");
  console.log("[script] Tidak ada pemanggilan Gemini pada tahap generate episode.");
  console.log("[script] Tersimpan: " + storyPath);
  process.exit(0);
}

throw new Error("Perintah tidak dikenal. Gunakan: node scripts/series.js plan|episode ...");
