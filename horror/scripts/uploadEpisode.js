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
const thumbnailPath = path.join(OUT_DIR, "shorts-cover.jpg");
const metadataPath = path.join(DATA_DIR, "youtube-metadata.json");
const statePath = process.env.EPISODE_UPLOAD_STATE ? path.resolve(process.env.EPISODE_UPLOAD_STATE) : path.join(DATA_DIR, "episode-youtube-upload.json");
for (const file of [videoPath, thumbnailPath, metadataPath]) await fs.access(file);
const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
const uploadMode = String(process.env.EPISODE_UPLOAD_MODE || "retry_thumbnail").toLowerCase();
if (!["retry_thumbnail", "new_video"].includes(uploadMode)) throw new Error("EPISODE_UPLOAD_MODE harus retry_thumbnail atau new_video.");

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
async function waitForVideoProcessing() {
  const maxAttempts = 80;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data } = await youtube.videos.list({ part: ["processingDetails", "status"], id: state.videoId });
    const video = data.items?.[0];
    if (!video) throw new Error("Video " + state.videoId + " tidak ditemukan saat memeriksa status processing.");
    const processingStatus = video.processingDetails?.processingStatus || "unknown";
    console.log("[youtube] Processing video: " + processingStatus + " (cek " + attempt + "/" + maxAttempts + ")");
    if (processingStatus === "succeeded") return;
    if (processingStatus === "failed") throw new Error("YouTube gagal memproses video: " + JSON.stringify(video.processingDetails));
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  throw new Error("Video belum selesai diproses YouTube setelah 20 menit. Jalankan ulang workflow 07 dengan mode retry_thumbnail.");
}
async function setThumbnail() {
  if (!state.videoId) throw new Error("Tidak ada videoId untuk pemasangan thumbnail.");
  await waitForVideoProcessing();
  const result = await youtube.thumbnails.set({
    videoId: state.videoId,
    media: { mimeType: "image/jpeg", body: createReadStream(thumbnailPath) }
  });
  if (!result.data?.items?.length) throw new Error("YouTube tidak mengembalikan thumbnailSetResponse.items.");
  const { data: videoData } = await youtube.videos.list({ part: ["snippet"], id: state.videoId });
  const thumbnails = videoData.items?.[0]?.snippet?.thumbnails;
  if (!thumbnails || !Object.keys(thumbnails).length) throw new Error("Daftar thumbnail video belum tersedia saat verifikasi.");
  console.log("[youtube] Thumbnail API response: " + JSON.stringify(result.data.items));
  console.log("[youtube] Thumbnail video setelah update: " + JSON.stringify(thumbnails));
  state.thumbnailUploaded = true;
  state.thumbnailUpdatedAt = new Date().toISOString();
  state.thumbnailAspectRatio = "9:16";
  await saveState();
}

if (state.videoId && uploadMode === "retry_thumbnail") {
  // A rerun retries only the thumbnail; it never uploads a duplicate video.
  await setThumbnail();
  console.log("Thumbnail Shorts 9:16 berhasil dipasang ulang untuk video: " + state.url);
  process.exit(0);
}

const hashtags = Array.isArray(metadata.hashtags) ? metadata.hashtags : [];
const description = [metadata.description || "", "", ...hashtags, "#Shorts"].join("\n").slice(0, 4900);
// Schedule publication exactly 24 hours after this upload workflow starts the YouTube insert.
const scheduledPublishAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
console.log("[youtube] Video dijadwalkan tayang pada: " + scheduledPublishAt);
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
    status: { privacyStatus: "private", publishAt: scheduledPublishAt, selfDeclaredMadeForKids: false }
  },
  media: { body: createReadStream(videoPath) }
});
if (!data.id) throw new Error("YouTube tidak mengembalikan video ID.");
const previousUploads = Array.isArray(state.previousUploads) ? state.previousUploads : [];
if (state.videoId) previousUploads.push({ videoId: state.videoId, url: state.url, title: state.title, uploadedAt: state.uploadedAt, supersededAt: new Date().toISOString() });
state = {
  ...state,
  previousUploads,
  videoId: data.id,
  title: metadata.title,
  privacyStatus: "private",
  publishAt: scheduledPublishAt,
  scheduledPublishAt,
  uploadedAt: new Date().toISOString(),
  url: "https://www.youtube.com/shorts/" + data.id,
  thumbnailUploaded: false
};
await saveState();
try {
  await setThumbnail();
  console.log("Thumbnail Shorts portrait 9:16 berhasil dipasang pada video baru.");
} catch (error) {
  console.error("Video sudah berhasil di-upload, tetapi thumbnail gagal dikirim. Jalankan ulang workflow 07 untuk mencoba memasang thumbnail tanpa meng-upload video duplikat:", error.message);
  throw error;
}
console.log("Upload berhasil sebagai PRIVATE: " + state.url);
console.log("Thumbnail YouTube Shorts portrait 9:16 berhasil dipasang dan diverifikasi melalui API.");
