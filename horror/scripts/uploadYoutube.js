import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { DATA_DIR, OUT_DIR } from "../src/config.js";

const required = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN_V2"];
for (const key of required) if (!process.env[key]) throw new Error("GitHub Secret belum diatur: " + key);

const oauth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
oauth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_V2 });
const youtube = google.youtube({ version: "v3", auth: oauth });

function nextMysteryPublishSlot(now = new Date()) {
  // Jadwal audiens Indonesia: Jumat dan Minggu pukul 19.00 WIB (UTC+7).
  const offsetMs = 7 * 60 * 60 * 1000;
  const jakartaNow = new Date(now.getTime() + offsetMs);
  for (let addDays = 0; addDays <= 7; addDays++) {
    const localDate = new Date(Date.UTC(
      jakartaNow.getUTCFullYear(),
      jakartaNow.getUTCMonth(),
      jakartaNow.getUTCDate() + addDays,
      19, 0, 0
    ));
    const day = localDate.getUTCDay();
    if (day !== 5 && day !== 0) continue;
    const publishAt = new Date(Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      12, 0, 0
    ));
    // Beri jeda minimal 2 jam dari proses upload agar video siap diproses YouTube.
    if (publishAt.getTime() >= now.getTime() + 2 * 60 * 60 * 1000) return publishAt;
  }
  throw new Error("Tidak menemukan slot publikasi Jumat/Minggu dalam 7 hari.");
}

const { data: channelData } = await youtube.channels.list({ part: ["snippet"], mine: true });
const channel = channelData.items?.[0];
if (!channel) throw new Error("Token V2 tidak memiliki akses ke channel YouTube.");
const channelTitle = channel.snippet?.title || "";
console.log("OAuth channel terdeteksi: " + channelTitle);
if (!channelTitle.toLocaleLowerCase("id-ID").includes("ruang cerita indonesia")) {
  throw new Error(`Channel tujuan tidak cocok. Diharapkan "Semesta Kisah", tetapi token mengarah ke "${channelTitle}". Upload dibatalkan.`);
}

const metadata = JSON.parse(await fs.readFile(path.join(DATA_DIR, "youtube-metadata.json"), "utf8"));
const videoPath = path.join(OUT_DIR, "indonesian-horror.mp4");
const thumbnailPath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
await fs.access(videoPath);
await fs.access(thumbnailPath);

const statePath = path.join(DATA_DIR, "youtube-upload-state.json");
let savedState = null;
try {
  savedState = JSON.parse(await fs.readFile(statePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

let videoId = savedState?.videoId || null;
let publishAt = savedState?.publishAt ? new Date(savedState.publishAt) : null;
let privacyStatus = savedState?.privacyStatus || null;

if (videoId) {
  // Jika proses sebelumnya berhasil membuat video tetapi gagal memasang thumbnail,
  // gunakan video yang sama agar retry tidak membuat upload duplikat.
  const { data } = await youtube.videos.list({ part: ["snippet", "status"], id: [videoId] });
  const existing = data.items?.[0];
  if (!existing || existing.snippet?.channelId !== channel.id) {
    throw new Error("State upload menunjuk video yang tidak ditemukan atau bukan milik channel Semesta Kisah. Upload ulang dibatalkan untuk mencegah duplikasi.");
  }
  console.log("Melanjutkan video yang sudah ter-upload: " + videoId);
} else {
  const scheduleEnabled = (process.env.YOUTUBE_SCHEDULE_ENABLED || "true").toLowerCase() === "true";
  const requestedPrivacy = process.env.YOUTUBE_PRIVACY_STATUS || "private";
  if (!["private", "unlisted", "public"].includes(requestedPrivacy)) throw new Error("YOUTUBE_PRIVACY_STATUS harus private, unlisted, atau public.");

  publishAt = scheduleEnabled ? nextMysteryPublishSlot() : null;
  privacyStatus = scheduleEnabled ? "private" : requestedPrivacy;
  if (publishAt) {
    console.log("Jadwal tayang: " + publishAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB");
  }

  const status = { privacyStatus, selfDeclaredMadeForKids: false };
  if (publishAt) status.publishAt = publishAt.toISOString();

  const inserted = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: "24",
        defaultLanguage: "id",
        defaultAudioLanguage: "id"
      },
      status
    },
    media: { body: (await import("node:fs")).createReadStream(videoPath) }
  });
  videoId = inserted.data.id;
  if (!videoId) throw new Error("YouTube tidak mengembalikan video ID.");

  // Simpan ID segera setelah insert agar kegagalan thumbnail bisa di-retry
  // tanpa mengupload file video yang sama untuk kedua kalinya.
  await fs.writeFile(statePath, JSON.stringify({
    videoId,
    channelId: channel.id,
    channelTitle,
    publishAt: publishAt?.toISOString() || null,
    privacyStatus,
    thumbnailSet: false
  }, null, 2));
}

await youtube.thumbnails.set({
  videoId,
  media: { mimeType: "image/jpeg", body: (await import("node:fs")).createReadStream(thumbnailPath) }
});
await fs.writeFile(statePath, JSON.stringify({
  videoId,
  channelId: channel.id,
  channelTitle,
  publishAt: publishAt?.toISOString() || null,
  privacyStatus,
  thumbnailSet: true
}, null, 2));
console.log("Upload berhasil. Video ID: " + videoId);
console.log("Channel: " + channelTitle);
console.log("Status: " + privacyStatus);
console.log("Publikasi terjadwal: " + (publishAt ? publishAt.toISOString() : "tidak dijadwalkan"));
console.log("URL: https://www.youtube.com/watch?v=" + videoId);
