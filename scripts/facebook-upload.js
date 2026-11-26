import fs from "node:fs/promises";
import path from "node:path";

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v27.0";
const VIDEO_PATH = path.resolve("out/video.mp4");
const TRANSCRIPT_PATH = path.resolve("public/transcript.txt");

if (!PAGE_ID || !ACCESS_TOKEN) {
  throw new Error("GitHub Secrets FACEBOOK_PAGE_ID dan FACEBOOK_PAGE_ACCESS_TOKEN wajib diatur.");
}

async function graphPost(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error || data.success === false) {
    throw new Error("Meta Graph API gagal: " + JSON.stringify(data));
  }
  return data;
}

async function uploadFeedVideo(videoBuffer, title, caption) {
  console.log("[Facebook Feed] Mengunggah video...");
  const form = new FormData();
  form.set("access_token", ACCESS_TOKEN);
  form.set("title", title);
  form.set("description", caption);
  form.set("published", "true");
  form.set("source", new Blob([videoBuffer], { type: "video/mp4" }), "video.mp4");

  const response = await fetch(
    `https://graph-video.facebook.com/${API_VERSION}/${PAGE_ID}/videos`,
    { method: "POST", body: form }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error || !data.id) {
    throw new Error("Facebook Feed gagal: " + JSON.stringify(data));
  }
  console.log("[Facebook Feed] Berhasil. Video ID: " + data.id);
  return data.id;
}

async function uploadReel(videoBuffer, title, caption) {
  console.log("[Facebook Reels] Memulai sesi upload...");
  const start = await graphPost(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/video_reels`,
    { access_token: ACCESS_TOKEN, upload_phase: "start" }
  );

  if (!start.video_id) {
    throw new Error("Meta tidak mengembalikan video_id untuk Reels: " + JSON.stringify(start));
  }

  console.log("[Facebook Reels] Mengunggah file video...");
  const uploadResponse = await fetch(
    `https://rupload.facebook.com/video-upload/${API_VERSION}/${start.video_id}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${ACCESS_TOKEN}`,
        offset: "0",
        file_size: String(videoBuffer.length),
        "Content-Type": "application/octet-stream"
      },
      body: videoBuffer
    }
  );
  const uploadData = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || uploadData.error || uploadData.success === false) {
    throw new Error("Upload file Reels gagal: " + JSON.stringify(uploadData));
  }

  console.log("[Facebook Reels] Menyelesaikan publikasi...");
  const finish = await graphPost(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/video_reels`,
    {
      access_token: ACCESS_TOKEN,
      video_id: start.video_id,
      upload_phase: "finish",
      video_state: "PUBLISHED",
      title,
      description: caption,
      is_ai_generated: "true"
    }
  );

  console.log("[Facebook Reels] Permintaan publikasi berhasil: " + JSON.stringify(finish));
  return finish.post_id || start.video_id;
}

async function main() {
  const videoBuffer = await fs.readFile(VIDEO_PATH);
  if (!videoBuffer.length) throw new Error("out/video.mp4 kosong.");

  let transcript = "";
  try {
    transcript = (await fs.readFile(TRANSCRIPT_PATH, "utf8")).trim();
  } catch {
    console.warn("[Metadata] transcript.txt tidak ditemukan; memakai caption default.");
  }

  const cleanTranscript = transcript.replace(/\\s+/g, " ").trim();
  const firstSentence = cleanTranscript.split(/(?<=[.!?])\\s+/)[0] || "Cerita inspiratif";
  const title = firstSentence.slice(0, 90) || "Cerita Inspiratif";
  const caption = [
    cleanTranscript.slice(0, 4500),
    "",
    "#RuangCeritaIndonesia #CeritaInspiratif"
  ].filter(Boolean).join("\\n");

  console.log(`Video siap: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log("Judul Facebook: " + title);

  await uploadFeedVideo(videoBuffer, title, caption);
  await uploadReel(videoBuffer, title, caption);
  console.log("Publikasi Facebook Feed dan Reels selesai.");
}

main().catch(error => {
  console.error("[Facebook Publish Error]", error);
  process.exit(1);
});
