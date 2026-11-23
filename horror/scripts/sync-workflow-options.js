import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data", "seasons");
const workflowDir = path.resolve(process.cwd(), "..", ".github", "workflows");
const workflowFiles = [
  "generate-episode-script.yml",
  "generate-episode-images.yml",
  "generate-episode-audio.yml",
  "render-episode-video.yml",
  "generate-episode-thumbnail.yml",
  "upload-episode-youtube.yml"
];

const entries = [];
for (const name of await fs.readdir(dataDir).catch(() => [])) {
  const seasonDir = path.join(dataDir, name);
  try {
    const bible = JSON.parse(await fs.readFile(path.join(seasonDir, "series-bible.json"), "utf8"));
    entries.push({ id: name, bible });
  } catch {
    // Abaikan folder yang belum memiliki series bible valid.
  }
}
entries.sort((a, b) => a.id.localeCompare(b.id));

const seriesOptions = entries.length ? entries.map(item => item.id) : ["no-plan-yet"];
const episodeOptions = entries.flatMap(({ id, bible }) =>
  (Array.isArray(bible.episodes) ? bible.episodes : []).map(episode => {
    const number = String(episode.episodeNumber).padStart(2, "0");
    return id + " | " + number + " - " + String(episode.title || "Episode " + number).replace(/\s+/g, " ").trim();
  })
);
if (!episodeOptions.length) episodeOptions.push("no-episode-yet");

function replaceOptions(source, marker, values) {
  const start = "          # " + marker + "_START";
  const end = "          # " + marker + "_END";
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error("Marker " + marker + " tidak ditemukan pada workflow.");
  const lines = values.map(value => "          - " + JSON.stringify(value)).join("\n");
  return source.slice(0, from + start.length) + "\n" + lines + "\n" + source.slice(to);
}

for (const file of workflowFiles) {
  const target = path.join(workflowDir, file);
  let source = await fs.readFile(target, "utf8");
  source = replaceOptions(source, "SERIES_ID_OPTIONS", seriesOptions);
  source = replaceOptions(source, "EPISODE_TITLE_OPTIONS", episodeOptions);
  await fs.writeFile(target, source);
  console.log("[catalog] " + file + ": " + seriesOptions.length + " serial, " + episodeOptions.length + " judul episode");
}
