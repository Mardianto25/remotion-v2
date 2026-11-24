import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { DATA_DIR, OUT_DIR } from "../src/config.js";

for (const key of ["YOUTUBE_CLIENT_ID_3N", "YOUTUBE_CLIENT_SECRET_3N", "YOUTUBE_REFRESH_TOKEN_3N"]) {
  if (!process.env[key]) throw new Error("GitHub Secret belum diatur: " + key);
}
const videoPath = path.join(OUT_DIR, "indonesian-horror.mp4");
const thumbnailPath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
const metadataPath = path.join(DATA_DIR, "youtube-metadata.json");
const statePath = process.env.EPISODE_UPLOAD_STATE ? path.resolve(process.env.EPISODE_UPLOAD_STATE) : path.join(DATA_DIR, "episode-youtube-upload.json");
for (const file of [videoPath, thumbnailPath, metadataPath]) await fs.access(file);
const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));

const oauth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID_3N, process.env.YOUTUBE_CLIENT_SECRET_3N);
oauth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_3N });
const youtube = google.youtube({ version: "v3", auth: oauth });
const { data: channelData } = await youtube.channels.list({ part: ["snippet"], mine: true });
const channel = channelData.items?.[0];
if (!channel) throw new Error("Token OAuth tidak memiliki akses ke channel YouTube.");
const channelTitle = channel.snippet?.title || "";
const expectedChannelName = process.env.YOUTUBE_CHANNEL_NAME_3N || "3n";
if (channelTitle.trim().toLocaleLowerCase("id-ID") !== expectedChannelName.trim().toLocaleLowerCase("id-ID")) {
  throw new Error(`Channel tujuan tidak cocok. Diharapkan "${expectedChannelName}", token mengarah ke "${channelTitle}". Upload dibatalkan.`);
}
let state = { channelId: channel.id, channelTitle };
try { state = { ...state, ...JSON.parse(await fs.readFile(statePath, "utf8")) }; }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (state.channelId !== channel.id) throw new Error("State upload berasal dari channel berbeda. Upload dibatalkan.");

async function saveState() {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
}
async function setThumbnail() {
  await youtube.thumbnails.set({
    videoId: state.videoId,
    media: { mimeType: "image/jpeg", body: createReadStream(thumbnailPath) }
  });
  state.thumbnailUploaded = true;
  state.thumbnailUpdatedAt = new Date().toISOString();
  await saveState();
}

if (state.videoId) {
  // A rerun of workflow 07 must refresh the cover even when the video was uploaded earlier.
  try {
    await setThumbnail();
    console.log("Thumbnail terbaru berhasil dikirim ulang untuk video: " + state.url);
  } catch (error) {
    console.warn("Video sudah ada di YouTube, tetapi pembaruan thumbnail gagal. Video tidak di-upload ulang:", error.message);
  }
  process.exit(0);
}

const hashtags = Array.isArray(metadata.hashtags) ? metadata.hashtags : [];
const description = [metadata.description || "", "", ...hashtags, "#Shorts"].join("\n").slice(0, 4900);
const { data } = await youtube.videos.insert({
  part: ["snippet", "status"],
  requestBody: {
    snippet: {
      title: String(metadata.title || "Cerita Indonesia #Shorts").slice(0, 100),
      description,
      tags: [...new Set([...(metadata.tags || []), "shorts", "cerita indonesia"])].slice(0, 18),
      categoryId: "24",
      defaultLanguage: "id",
      defaultAudioLanguage: "id"
    },
    status: { privacyStatus: "private", selfDeclaredMadeForKids: false }
  },
  media: { body: createReadStream(videoPath) }
});
if (!data.id) throw new Error("YouTube tidak mengembalikan video ID.");
state = {
  ...state,
  videoId: data.id,
  title: metadata.title,
  privacyStatus: "private",
  uploadedAt: new Date().toISOString(),
  url: "https://www.youtube.com/shorts/" + data.id,
  thumbnailUploaded: false
};
await saveState();
try {
  await setThumbnail();
  console.log("Shorts cover vertikal berhasil dikirim ke YouTube (jika format diterima YouTube).");
} catch (error) {
  console.warn("Video sudah berhasil di-upload, tetapi thumbnail gagal dikirim. Status disimpan untuk mencegah upload duplikat:", error.message);
}
console.log("Upload berhasil sebagai PRIVATE: " + state.url);
console.log("Cover yang disiapkan khusus Shorts: vertikal 9:16, tanpa branding channel.");
