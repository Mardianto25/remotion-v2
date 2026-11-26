import fs from "node:fs/promises";
import path from "node:path";

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v27.0";
const VIDEO_PATH = path.resolve("out/video.mp4");
const TRANSCRIPT_PATH = path.resolve("public/transcript.txt");
const TIME_ZONE = "Asia/Jakarta";
const PUBLISH_SLOTS = ["05:00", "11:30", "18:30"];
const SCHEDULE_BUFFER_MINUTES = 15;

if (!PAGE_ID || !ACCESS_TOKEN) {
  throw new Error("GitHub Secrets FB_PAGE_ID dan FB_PAGE_ACCESS_TOKEN wajib diatur.");
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

function getJakartaParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getNextPublishSchedule(now = new Date()) {
  const jakarta = getJakartaParts(now);
  const localDate = new Date(Date.UTC(
    Number(jakarta.year),
    Number(jakarta.month) - 1,
    Number(jakarta.day)
  ));
  const earliestAllowed = now.getTime() + SCHEDULE_BUFFER_MINUTES * 60_000;

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const date = new Date(localDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);

    for (const slot of PUBLISH_SLOTS) {
      const [hour, minute] = slot.split(":").map(Number);
      // Jakarta uses UTC+7. Build the scheduled instant from the local wall clock.
      const scheduledAt = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        hour - 7,
        minute
      );

      if (scheduledAt >= earliestAllowed) {
        return {
          timestamp: Math.floor(scheduledAt / 1000),
          iso: new Date(scheduledAt).toISOString(),
          local: new Intl.DateTimeFormat("id-ID", {
            timeZone: TIME_ZONE,
            dateStyle: "full",
            timeStyle: "short"
          }).format(new Date(scheduledAt))
        };
      }
    }
  }

  throw new Error("Tidak berhasil menentukan jadwal publikasi Facebook.");
}

function buildMetadata(transcript) {
  const cleanTranscript = transcript.replace(/\s+/g, " ").trim();
  const sentences = cleanTranscript.split(/(?<=[.!?])\s+/).filter(Boolean);
  const title = (sentences[0] || "Cerita Inspiratif").slice(0, 90);

  const hashtags = [
    "#RuangCeritaIndonesia",
    "#CeritaInspiratif",
    "#MotivasiHarian",
    "#RenunganHarian"
  ];

  const description = [
    cleanTranscript || "Simak cerita dan renungan inspiratif hari ini.",
    "",
    "Jangan lupa like, bagikan, dan ikuti halaman ini untuk konten inspiratif lainnya.",
    "",
    hashtags.join(" ")
  ].join("\n").slice(0, 4900);

  return { title, description };
}

async function uploadFeedVideo(videoBuffer, title, description, scheduledAt) {
  console.log("[Facebook Feed] Mengunggah video untuk dijadwalkan...");
  const form = new FormData();
  form.set("access_token", ACCESS_TOKEN);
  form.set("title", title);
  form.set("description", description);
  form.set("published", "false");
  form.set("scheduled_publish_time", String(scheduledAt));
  form.set("source", new Blob([videoBuffer], { type: "video/mp4" }), "video.mp4");

  const response = await fetch(
    `https://graph-video.facebook.com/${API_VERSION}/${PAGE_ID}/videos`,
    { method: "POST", body: form }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error || !data.id) {
    throw new Error("Facebook Feed gagal dijadwalkan: " + JSON.stringify(data));
  }
  console.log("[Facebook Feed] Berhasil dijadwalkan. Video ID: " + data.id);
  return data.id;
}

async function uploadReel(videoBuffer, title, description, scheduledAt) {
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

  console.log("[Facebook Reels] Menyimpan jadwal publikasi...");
  const finish = await graphPost(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/video_reels`,
    {
      access_token: ACCESS_TOKEN,
      video_id: start.video_id,
      upload_phase: "finish",
      video_state: "SCHEDULED",
      scheduled_publish_time: String(scheduledAt),
      title,
      description,
      is_ai_generated: "true"
    }
  );

  console.log("[Facebook Reels] Berhasil dijadwalkan: " + JSON.stringify(finish));
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

  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(path.resolve("out/facebook-metadata.json"), "utf8"));
  } catch (error) {
    console.warn("[Metadata] Metadata AI tidak tersedia; memakai fallback dari transcript:", error.message);
  }

  const fallback = buildMetadata(transcript);
  const title = metadata?.facebook_page?.title || fallback.title;
  const description = metadata?.facebook_page?.description || fallback.description;
  const schedule = getNextPublishSchedule();

  console.log(`Video siap: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log("Judul Facebook: " + title);
  console.log("Caption dan hashtag disiapkan dari transcript.");
  console.log("Jadwal Feed dan Reels: " + schedule.local + " WIB");

  const results = await Promise.allSettled([
    uploadFeedVideo(videoBuffer, title, description, schedule.timestamp),
    uploadReel(videoBuffer, title, description, schedule.timestamp)
  ]);

  const labels = ["Facebook Feed", "Facebook Reels"];
  const failures = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`[${labels[index]}] Terjadwal: ${result.value}`);
    } else {
      console.error(`[${labels[index]}] Gagal: ${result.reason?.message || result.reason}`);
      failures.push(labels[index]);
    }
  });

  if (failures.length) {
    throw new Error("Penjadwalan gagal pada: " + failures.join(", "));
  }
  console.log("Facebook Feed dan Reels berhasil dimasukkan ke jadwal Meta.");
}

main().catch(error => {
  console.error("[Facebook Schedule Error]", error);
  process.exit(1);
});
