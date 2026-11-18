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
if (!channelTitle.toLocaleLowerCase("id-ID").includes("semesta kisah")) {
  throw new Error(`Channel tujuan tidak cocok. Diharapkan "Semesta Kisah", tetapi token mengarah ke "${channelTitle}". Upload dibatalkan.`);
}

const metadata = JSON.parse(await fs.readFile(path.join(DATA_DIR, "youtube-metadata.json"), "utf8"));
const videoPath = path.join(OUT_DIR, "indonesian-horror.mp4");
const thumbnailPath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
await fs.access(videoPath);
await fs.access(thumbnailPath);

const scheduleEnabled = (process.env.YOUTUBE_SCHEDULE_ENABLED || "true").toLowerCase() === "true";
const requestedPrivacy = process.env.YOUTUBE_PRIVACY_STATUS || "private";
if (!["private", "unlisted", "public"].includes(requestedPrivacy)) throw new Error("YOUTUBE_PRIVACY_STATUS harus private, unlisted, atau public.");

const publishAt = scheduleEnabled ? nextMysteryPublishSlot() : null;
const privacyStatus = scheduleEnabled ? "private" : requestedPrivacy;
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
const videoId = inserted.data.id;
if (!videoId) throw new Error("YouTube tidak mengembalikan video ID.");
await youtube.thumbnails.set({ videoId, media: { mimeType: "image/jpeg", body: (await import("node:fs")).createReadStream(thumbnailPath) } });
console.log("Upload berhasil. Video ID: " + videoId);
console.log("Channel: " + channelTitle);
console.log("Status: " + privacyStatus);
console.log("Publikasi terjadwal: " + (publishAt ? publishAt.toISOString() : "tidak dijadwalkan"));
console.log("URL: https://www.youtube.com/watch?v=" + videoId);
