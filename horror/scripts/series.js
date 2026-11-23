import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { planSeason } from "../src/ai/seriesPlanner.js";
import { writeEpisode } from "../src/ai/episodeWriter.js";
import { reviewRetention } from "../src/ai/retentionAgent.js";
import { reviewContinuity } from "../src/ai/continuityAgent.js";
import { createInitialLedger, applyEpisodeToLedger } from "../src/ai/continuityLedger.js";
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
  const concept = args.filter((value, index) => !["--season", "--concept"].includes(value) && args[index - 1] !== "--season" && args[index - 1] !== "--concept").join(" ").trim() || arg("--concept");
  if (!concept) throw new Error('Konsep season wajib diisi. Contoh: npm run generate:season -- --season season-01 --concept "POV: Terjebak di sekolah saat kiamat zombie"');
  const biblePath = path.join(seasonDir, "series-bible.json");
  try {
    await fs.access(biblePath);
    if (!flag("--force")) throw new Error("Season plan sudah ada. Gunakan --force hanya jika memang ingin mengganti seluruh bible.");
  } catch (error) {
    if (error.message.includes("Season plan sudah ada")) throw error;
  }
  console.log("[season] Membuat series bible dan outline tepat 8 episode...");
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
  const ledgerPath = path.join(seasonDir, "continuity-ledger.json");
  const ledger = await readJson(ledgerPath);
  const statePath = path.join(seasonDir, "production-state.json");
  const state = await readJson(statePath);
  const episodePlan = bible.episodes.find(item => Number(item.episodeNumber) === episodeNumber);
  if (!episodePlan) throw new Error("Episode tidak ditemukan di series bible.");
  const episodeDir = path.join(episodesDir, "episode-" + String(episodeNumber).padStart(2, "0"));
  await fs.mkdir(episodeDir, { recursive: true });
  const storyPath = path.join(episodeDir, "story.json");
  try {
    await fs.access(storyPath);
    if (!flag("--force")) throw new Error("Episode " + episodeNumber + " sudah memiliki naskah. Gunakan --force untuk membuat ulang naskah episode ini.");
  } catch (error) {
    if (error.message.includes("sudah memiliki naskah")) throw error;
  }
  if (episodeNumber > 1) {
    const previousPath = path.join(episodesDir, "episode-" + String(episodeNumber - 1).padStart(2, "0"), "story.json");
    try { await fs.access(previousPath); } catch {
      throw new Error("Episode " + (episodeNumber - 1) + " belum tersedia. Generate episode secara berurutan agar kontinuitas terjaga.");
    }
    const previousState = state.episodes.find(item => item.episodeNumber === episodeNumber - 1);
    if (!previousState || previousState.status !== "rendered") {
      throw new Error("Episode " + (episodeNumber - 1) + " belum selesai dirender. Episode berikutnya baru bisa dibuat setelah video sebelumnya berhasil diproduksi.");
    }
  }
  if (Number(ledger.lastGeneratedEpisode || 0) !== episodeNumber - 1) {
    throw new Error("Continuity ledger berada di episode " + ledger.lastGeneratedEpisode + ", sedangkan permintaan episode " + episodeNumber + ". Jangan menimpa urutan season; periksa status episode.");
  }
  const previousEpisodes = [];
  for (let number = 1; number < episodeNumber; number++) {
    const file = path.join(episodesDir, "episode-" + String(number).padStart(2, "0"), "story.json");
    previousEpisodes.push(await readJson(file));
  }
  state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber ? { ...item, status: "writing" } : item);
  state.updatedAt = new Date().toISOString();
  await writeJson(statePath, state);

  let acceptedStory = null;
  let acceptedRetention = null;
  let acceptedContinuity = null;
  let revisionNotes = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log("[writer] Episode " + episodeNumber + " — draft " + attempt + "/3");
    const draft = await writeEpisode({
      seriesBible: bible,
      characters: bible.characters,
      worldRules: bible.worldRules,
      episodePlan,
      previousEpisodes,
      continuityLedger: ledger,
      episodeNumber,
      revisionNotes
    });
    console.log("[retention] Memeriksa hook, curiosity, escalation, payoff dan cliffhanger...");
    const retention = await reviewRetention(draft, episodePlan);
    console.log("[retention] Skor " + retention.score + "/100");
    console.log("[continuity] Memeriksa canon, karakter dan world rules...");
    const continuity = await reviewContinuity(draft, {
      seriesBible: bible, characters: bible.characters, worldRules: bible.worldRules,
      previousEpisodes, continuityLedger: ledger
    });
    console.log("[continuity] Skor " + continuity.score + "/100; kontradiksi " + (continuity.contradictions || []).length);
    if (retention.score >= 85 && continuity.score >= 85 && !(continuity.contradictions || []).length) {
      acceptedStory = draft;
      acceptedRetention = retention;
      acceptedContinuity = continuity;
      break;
    }
    revisionNotes = [
      "Retention score: " + retention.score + "/100. " + (retention.revisionBrief || ""),
      "Retention issues: " + JSON.stringify(retention.issues || []),
      "Continuity score: " + continuity.score + "/100. " + (continuity.revisionBrief || ""),
      "Continuity contradictions: " + JSON.stringify(continuity.contradictions || [])
    ].join("\n");
    await writeJson(path.join(episodeDir, "draft-review-" + attempt + ".json"), { retention, continuity });
  }

  if (!acceptedStory) {
    state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber ? { ...item, status: "needs_manual_review" } : item);
    state.updatedAt = new Date().toISOString();
    await writeJson(statePath, state);
    throw new Error("Episode belum lolos quality gate setelah 3 draft. Periksa draft-review-*.json; tidak ada video yang dirender.");
  }

  const ledgerNext = applyEpisodeToLedger(ledger, acceptedStory, {
    retentionScore: acceptedRetention.score, continuityScore: acceptedContinuity.score
  });
  await writeJson(storyPath, acceptedStory);
  await writeJson(path.join(episodeDir, "retention-review.json"), acceptedRetention);
  await writeJson(path.join(episodeDir, "continuity-review.json"), acceptedContinuity);
  await writeJson(path.join(episodeDir, "continuity-ledger-after.json"), ledgerNext);
  state.episodes = state.episodes.map(item => item.episodeNumber === episodeNumber ? {
    ...item, title: acceptedStory.title, status: "script_approved",
    retentionScore: acceptedRetention.score, continuityScore: acceptedContinuity.score
  } : item);
  state.updatedAt = new Date().toISOString();
  await writeJson(statePath, state);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.copyFile(storyPath, path.join(DATA_DIR, "story.json"));
  await writeJson(path.join(DATA_DIR, "active-episode.json"), { seasonId, episodeNumber, episodeDir, storyPath });
  console.log("[approved] " + acceptedStory.title + " — retention " + acceptedRetention.score + "/100.");
  console.log("[approved] Naskah episode tersimpan: " + storyPath);
  console.log("[next] Jalankan npm run generate -- --story-file data/story.json untuk membuat audio, FLUX, thumbnail dan manifest Remotion.");
  process.exit(0);
}

throw new Error("Perintah tidak dikenal. Gunakan: node scripts/series.js plan|episode ...");
