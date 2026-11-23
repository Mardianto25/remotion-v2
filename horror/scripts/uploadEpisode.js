import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { CHANNEL_NAME, DATA_DIR, OUT_DIR } from "../src/config.js";

for (const key of ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN_V2"]) {
  if (!process.env[key]) throw new Error("GitHub Secret belum diatur: " + key);
}
const videoPath = path.join(OUT_DIR, "indonesian-horror.mp4");
const thumbnailPath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
const metadataPath = path.join(DATA_DIR, "youtube-metadata.json");
const statePath = path.join(DATA_DIR, "episode-youtube-upload.json");
for (const file of [videoPath, thumbnailPath, metadataPath]) await fs.access(file);
const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));

const oauth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
oauth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_V2 });
const youtube = google.youtube({ version: "v3", auth: oauth });
const { data: channelData } = await youtube.channels.list({ part: ["snippet"], mine: true });
const channel = channelData.items?.[0];
if (!channel) throw new Error("Token OAuth tidak memiliki akses ke channel YouTube.");
const channelTitle = channel.snippet?.title || "";
if (!channelTitle.toLocaleLowerCase("id-ID").includes(CHANNEL_NAME.toLocaleLowerCase("id-ID"))) {
  throw new Error(`Channel tujuan tidak cocok. Diharapkan "${CHANNEL_NAME}", token mengarah ke "${channelTitle}". Upload dibatalkan.`);
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
  if (!state.thumbnailUploaded) {
    await setThumbnail();
    console.log("Thumbnail berhasil diperbarui untuk video: " + state.url);
  } else {
    console.log("Episode ini sudah pernah di-upload: " + state.url);
  }
  process.exit(0);
}

const hashtags = Array.isArray(metadata.hashtags) ? metadata.hashtags : [];
const description = [metadata.description || "", "", ...hashtags, "#Shorts"].join("\n").slice(0, 4900);
const { data } = await youtube.videos.insert({
  part: ["snippet", "status"],
  requestBody: {
    snippet: {
      title: String(metadata.title || "Cerita Horor Indonesia #Shorts").slice(0, 100),
      description,
      tags: [...new Set([...(metadata.tags || []), "shorts", "cerita horor", "horor indonesia"])].slice(0, 18),
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
await setThumbnail();
console.log("Upload berhasil sebagai PRIVATE: " + state.url);
console.log("Thumbnail landscape dikirim ke YouTube. Cover vertikal tersedia sebagai shorts-cover.jpg.");
