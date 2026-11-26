import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VIDEO = path.resolve("out/facebook-reels/video.mp4");
const API = process.env.FACEBOOK_GRAPH_API_VERSION || "v27.0";
const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

async function post(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  if (!PAGE_ID || !TOKEN) throw new Error("FB_PAGE_ID dan FB_PAGE_ACCESS_TOKEN wajib diatur.");
  const duration = Number(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", VIDEO
  ], { encoding: "utf8" }).trim());
  if (!Number.isFinite(duration) || duration < 25 || duration > 50) {
    throw new Error(`Durasi Reels harus sekitar 30-45 detik; hasil ${duration.toFixed(2)} detik.`);
  }
  const video = await fs.readFile(VIDEO);
  const metadata = JSON.parse(await fs.readFile(path.resolve("out/facebook-reels/facebook-metadata.json"), "utf8"));
  const start = await post(`https://graph.facebook.com/${API}/${PAGE_ID}/video_reels`, {
    access_token: TOKEN,
    upload_phase: "start"
  });
  if (!start.video_id) throw new Error("Meta tidak mengembalikan video_id: " + JSON.stringify(start));

  const uploaded = await fetch(`https://rupload.facebook.com/video-upload/${API}/${start.video_id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      offset: "0",
      file_size: String(video.length),
      "Content-Type": "application/octet-stream"
    },
    body: video
  });
  const uploadResult = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || uploadResult.error || uploadResult.success === false) {
    throw new Error("Upload bytes Reels gagal: " + JSON.stringify(uploadResult));
  }

  const finish = await post(`https://graph.facebook.com/${API}/${PAGE_ID}/video_reels`, {
    access_token: TOKEN,
    video_id: start.video_id,
    upload_phase: "finish",
    video_state: "PUBLISHED",
    title: metadata.title,
    description: metadata.description,
    is_ai_generated: "true"
  });
  console.log("Facebook Reel berhasil dikirim untuk publikasi:", finish.post_id || start.video_id);
}
main().catch(error => { console.error("[Facebook Reels Upload]", error); process.exit(1); });
