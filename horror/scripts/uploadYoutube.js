import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { ROOT, DATA_DIR, OUT_DIR, config } from "../src/config.js";

const required = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN_V2"];
for (const key of required) if (!process.env[key]) throw new Error("GitHub Secret belum diatur: " + key);

const oauth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
oauth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_V2 });
const youtube = google.youtube({ version: "v3", auth: oauth });

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

const privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS || "private";
if (!["private", "unlisted", "public"].includes(privacyStatus)) throw new Error("YOUTUBE_PRIVACY_STATUS harus private, unlisted, atau public.");

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
    status: { privacyStatus, selfDeclaredMadeForKids: false }
  },
  media: { body: (await import("node:fs")).createReadStream(videoPath) }
});
const videoId = inserted.data.id;
if (!videoId) throw new Error("YouTube tidak mengembalikan video ID.");
await youtube.thumbnails.set({ videoId, media: { mimeType: "image/jpeg", body: (await import("node:fs")).createReadStream(thumbnailPath) } });
console.log("Upload berhasil. Video ID: " + videoId);
console.log("Channel: " + channelTitle);
console.log("Status: " + privacyStatus);
console.log("URL: https://www.youtube.com/watch?v=" + videoId);
