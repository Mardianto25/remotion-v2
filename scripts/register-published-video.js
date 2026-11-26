import fs from "node:fs/promises";
import path from "node:path";
const API = "https://api.github.com";
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const branch = process.env.ANALYTICS_REGISTRY_BRANCH || "main";
async function github(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("GitHub API " + response.status + ": " + JSON.stringify(data));
  return data;
}
async function main() {
  if (!repo || !token) throw new Error("GITHUB_REPOSITORY dan GITHUB_TOKEN wajib tersedia.");
  const youtube = JSON.parse(await fs.readFile(path.resolve("out/published-video.json"), "utf8"));
  const facebook = JSON.parse(await fs.readFile(path.resolve("out/facebook-published.json"), "utf8"));
  const filePath = "data/analytics/videos.json";
  const url = API + "/repos/" + repo + "/contents/" + filePath;
  let current = { videos: [] }; let sha;
  try {
    const file = await github(url + "?ref=" + encodeURIComponent(branch));
    sha = file.sha; current = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } catch (error) { if (!String(error.message).includes("404")) throw error; }
  current.videos = Array.isArray(current.videos) ? current.videos : [];
  const record = {
    youtubeVideoId: youtube.videoId, title: youtube.title || "Renungan dan Motivasi Islami",
    transcript: youtube.transcript || "", publishedAt: youtube.publishedAt || youtube.scheduledPublishAt || new Date().toISOString(),
    scheduledPublishAt: youtube.scheduledPublishAt || null, registeredAt: new Date().toISOString(),
    facebookPostIds: (facebook.posts || []).map(item => item.id).filter(Boolean), facebook: facebook.posts || []
  };
  const existing = current.videos.findIndex(item => item.youtubeVideoId === record.youtubeVideoId);
  if (existing >= 0) current.videos[existing] = { ...current.videos[existing], ...record };
  else current.videos.push(record);
  const body = {
    message: "chore(analytics): register published video " + record.youtubeVideoId,
    content: Buffer.from(JSON.stringify(current, null, 2) + "\n").toString("base64"), branch
  };
  if (sha) body.sha = sha;
  await github(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log("[Analytics] Video terdaftar: " + record.youtubeVideoId);
}
main().catch(error => { console.error("[Analytics Registry Error]", error); process.exit(1); });
