import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const contentPath = path.resolve("out/facebook-reels/content.json");
const audioPath = path.resolve("public/facebook-reels/audio.wav");
const publicRoot = path.resolve("public/facebook-reels");
const imageDir = path.join(publicRoot, "images");
const masterPath = path.join(publicRoot, "character-master.png");

async function generateFlux(prompt, targetPath) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) throw new Error("CF_ACCOUNT_ID dan CF_API_TOKEN wajib tersedia.");
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId +
    "/ai/run/@cf/black-forest-labs/flux-1-schnell";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 4 }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.result?.image) {
    throw new Error("Cloudflare FLUX gagal (HTTP " + response.status + "): " +
      JSON.stringify(data.errors || data));
  }
  const image = Buffer.from(data.result.image, "base64");
  if (!image.length) throw new Error("Hasil gambar kosong.");
  // FLUX.1 Schnell returns square output; crop/resize to a 9:16 frame for Reels.
  await sharp(image).resize(768, 1365, {
    fit: "cover",
    position: "attention"
  }).png().toFile(targetPath);
}

async function main() {
  const content = JSON.parse(await fs.readFile(contentPath, "utf8"));
  const character = JSON.parse(await fs.readFile(path.resolve("facebook-reels/character.json"), "utf8"));
  await fs.mkdir(imageDir, { recursive: true });

  if (!(await fs.stat(masterPath).catch(() => null))) {
    console.log("[Visual] Membuat master character untuk pertama kali.");
    await generateFlux(
      "Full-body character reference sheet, one fictional Indonesian Muslim man in early 30s, medium warm tan skin, calm thoughtful dark-brown eyes, short neat black hair, subtle trimmed beard, average build, simple charcoal-gray modest tunic, neutral standing pose, centered full body, plain softly lit studio background. " +
      character.visualStyle + ". Vertical portrait composition, single character only, no text, no logo, no watermark.",
      masterPath
    );
  } else {
    console.log("[Visual] Menggunakan master character yang tersimpan.");
  }

  const duration = Number(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", audioPath
  ], { encoding: "utf8" }).trim());
  if (!Number.isFinite(duration) || duration < 25 || duration > 50) {
    throw new Error("Durasi audio " + duration.toFixed(2) +
      " detik. Target Reels 30-45 detik; perbaiki panjang naskah sebelum render.");
  }

  const weights = content.segments.map(segment => segment.text.trim().split(/\s+/).length);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const subtitles = [];

  for (let index = 0; index < content.segments.length; index++) {
    const segment = content.segments[index];
    const end = index === content.segments.length - 1
      ? duration : cursor + duration * (weights[index] / totalWeight);
    const imageName = "scene-" + String(index + 1).padStart(2, "0") + ".png";
    const imagePath = path.join(imageDir, imageName);
    const scenePrompt = [
      "Create a single vertical 9:16 cinematic 3D animated film scene.",
      character.visualStyle,
      "MAIN CHARACTER IDENTITY (keep exactly consistent): " + character.description,
      "SCENE ACTION AND SETTING: " + segment.visualPrompt,
      "The same main character must retain the same face, hair, beard, skin tone, age, body proportions and charcoal-gray tunic. Change only pose, expression, lighting and environment as required by this scene.",
      "Keep the character centered and fully visible within a vertical portrait frame. Emotion must feel sincere and restrained, not exaggerated.",
      "No text, letters, captions, calligraphy, logos, watermarks, prophets, sacred figures, or unrelated people."
    ].join(" ");
    console.log("[Visual] Generate scene " + (index + 1) + "/" + content.segments.length);
    await generateFlux(scenePrompt, imagePath);
    subtitles.push({
      start: Number(cursor.toFixed(3)), end: Number(end.toFixed(3)),
      text: segment.text.trim(),
      image: "facebook-reels/images/" + imageName,
      phase: segment.phase
    });
    cursor = end;
  }

  await fs.writeFile(path.join(publicRoot, "subtitles.json"), JSON.stringify(subtitles, null, 2) + "\n");
  await fs.writeFile(path.resolve("out/facebook-reels/audio-duration.txt"), duration.toFixed(3) + "\n");
  console.log("[Visual] " + subtitles.length + " scene selesai. Durasi audio " + duration.toFixed(2) + " detik.");
  console.log("[Visual] Timestamp subtitle dibagi proporsional berdasarkan jumlah kata; belum merupakan word-level forced alignment.");
}
main().catch(error => { console.error("[Facebook Reels Scenes]", error); process.exit(1); });
