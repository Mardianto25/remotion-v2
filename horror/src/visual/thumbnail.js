import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, DATA_DIR, OUT_DIR } from "../config.js";

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c]);
}
function selectedStyle() {
  const value = String(process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase();
  return value === "2d-animation" || value === "2d"
    ? { visual: "premium cinematic 2D animation, semi-realistic dark graphic-novel illustration, expressive consistent character design, hand-painted detailed environment", avoid: "not photorealistic 3D, not anime, not childish cartoon" }
    : { visual: "premium cinematic realistic 3D render, detailed physically based materials, lifelike character design, Unreal Engine quality, volumetric atmosphere", avoid: "not flat illustration, not anime, not childish cartoon" };
}
async function generateBackground(prompt) {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) throw new Error("CF_ACCOUNT_ID dan CF_API_TOKEN wajib tersedia untuk membuat thumbnail.");
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + config.cloudflareAccountId + "/ai/run/" + config.cloudflareModel;
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + config.cloudflareApiToken, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, steps: 4 }) });
  if (!response.ok) throw new Error("Cloudflare thumbnail HTTP " + response.status + ": " + (await response.text()).slice(0, 400));
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const payload = await response.json();
    if (!payload?.result?.image) throw new Error("Cloudflare thumbnail tidak mengembalikan result.image.");
    return Buffer.from(payload.result.image, "base64");
  }
  return Buffer.from(await response.arrayBuffer());
}
function makeOverlay(width, height, text) {
  const fontSize = 104;
  const x = 70;
  const y = Math.round(height * 0.79);
  const maxWidth = width - 140;
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".42" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#shade)"/>
    <text x="${x}" y="${y}" fill="#fff" font-family="Arial, sans-serif" font-size="${fontSize}" textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs" font-weight="900" stroke="#160b0b" stroke-width="7" paint-order="stroke" letter-spacing="1">${escapeXml(text)}</text>
  </svg>`);
}
export async function generateThumbnail(story, seo, topic) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const style = selectedStyle();
  const subject = String(seo.thumbnailPrompt || story.scenes?.[0]?.visualPrompt || story.title + ". " + topic);
  const genre = String(process.env.STORY_GENRE || story.genre || story.category || "mystery").toLowerCase();
  const prompt = [
    "Create a premium YouTube Shorts cover image, portrait 9:16 composition.", style.visual,
    "One unmistakable focal subject that communicates the selected story genre, dramatic close or medium shot, strong silhouette, expressive emotion, cinematic lighting, rich contrast, detailed setting.",
    "Genre: " + genre + ". Depict the most compelling and emotionally clear moment from this story: " + subject,
    "Compose exclusively for vertical 9:16 mobile Shorts viewing. Keep the face, key object, and story action large and unmistakable in the central safe area.",
    "Keep the lower 25 percent relatively dark and uncluttered for one short hook overlay. No letters, typography, logo, channel name, watermark, collage, border.",
    style.avoid + ". Respect the selected genre; no horror elements unless the genre is horror."
  ].join(" ");
  const imageBuffer = await generateBackground(prompt);
  const label = String(seo.thumbnailText || story.title || topic).trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 28);
  const verticalPath = path.join(OUT_DIR, "shorts-cover.jpg");
  await sharp(imageBuffer).resize(1080, 1920, { fit: "cover", position: "attention" }).composite([{ input: makeOverlay(1080, 1920, label) }]).jpeg({ quality: 90, mozjpeg: true }).toFile(verticalPath);
  // Compatibility copy: uploader reads youtube-thumbnail.jpg, but its content remains vertical 9:16.
  const landscapePath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
  await fs.copyFile(verticalPath, landscapePath);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "youtube-metadata.json"), JSON.stringify({ ...seo, format: "youtube-shorts", thumbnail: { version: "shorts-ctr-v2", format: "9:16", vertical: "out/shorts-cover.jpg", youtube: "out/youtube-thumbnail.jpg" } }, null, 2));
  return { verticalPath, landscapePath };
}
