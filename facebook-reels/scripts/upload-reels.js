import fs from "node:fs/promises";
import path from "node:path";

const pageId = process.env.FB_PAGE_ID;
const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
const apiVersion = process.env.FACEBOOK_GRAPH_API_VERSION || "v27.0";
const videoPath = path.resolve("out/facebook-reels/reel.mp4");
const metadataPath = path.resolve("out/facebook-reels/metadata.json");
const timeZone = "Asia/Jakarta";
const publishSlots = ["05:00", "11:30", "18:30"];

if (!pageId || !accessToken) {
  throw new Error("Secrets FB_PAGE_ID dan FB_PAGE_ACCESS_TOKEN wajib tersedia.");
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

function nextSchedule(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const base = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const earliest = now.getTime() + 15 * 60_000;
  for (let offset = 0; offset < 3; offset++) {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() + offset);
    for (const slot of publishSlots) {
      const [hour, minute] = slot.split(":").map(Number);
      const instant = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(),
        date.getUTCDate(), hour - 7, minute);
      if (instant >= earliest) {
        return {
          timestamp: Math.floor(instant / 1000),
          local: new Intl.DateTimeFormat("id-ID", {
            timeZone, dateStyle: "full", timeStyle: "short"
          }).format(new Date(instant))
        };
      }
    }
  }
  throw new Error("Tidak dapat menentukan jadwal publikasi.");
}

async function main() {
  const video = await fs.readFile(videoPath);
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const title = metadata.page.title;
  const description = [metadata.page.caption, "", metadata.page.hashtags.join(" ")].join("\n");
  const schedule = nextSchedule();
  console.log("[Facebook Reels] Menjadwalkan ke Page: " + schedule.local + " WIB");

  const start = await graphPost(
    "https://graph.facebook.com/" + apiVersion + "/" + pageId + "/video_reels",
    { access_token: accessToken, upload_phase: "start" }
  );
  if (!start.video_id) throw new Error("Meta tidak mengembalikan video_id: " + JSON.stringify(start));

  const uploadResponse = await fetch(
    "https://rupload.facebook.com/video-upload/" + apiVersion + "/" + start.video_id,
    {
      method: "POST",
      headers: {
        Authorization: "OAuth " + accessToken,
        offset: "0",
        file_size: String(video.length),
        "Content-Type": "application/octet-stream"
      },
      body: video
    }
  );
  const uploadData = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || uploadData.error || uploadData.success === false) {
    throw new Error("Upload binary Reels gagal: " + JSON.stringify(uploadData));
  }

  const finish = await graphPost(
    "https://graph.facebook.com/" + apiVersion + "/" + pageId + "/video_reels",
    {
      access_token: accessToken,
      video_id: start.video_id,
      upload_phase: "finish",
      video_state: "SCHEDULED",
      scheduled_publish_time: String(schedule.timestamp),
      title,
      description,
      is_ai_generated: "true"
    }
  );
  await fs.writeFile(path.resolve("out/facebook-reels/publish-result.json"),
    JSON.stringify({
      pageId, videoId: start.video_id, postId: finish.post_id || null,
      scheduledLocal: schedule.local, status: "SCHEDULED"
    }, null, 2) + "\n");
  console.log("[Facebook Reels] Berhasil dijadwalkan. Video ID: " + start.video_id);
}
main().catch(error => { console.error("[Facebook Reels Upload]", error); process.exit(1); });
