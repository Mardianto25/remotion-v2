import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CHANNEL_NAME, config, DATA_DIR, OUT_DIR } from "../config.js";

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
function makeOverlay(width, height, text, brand, vertical) {
  const fontSize = vertical ? 104 : 76;
  const x = vertical ? 70 : 76;
  const y = vertical ? Math.round(height * 0.78) : Math.round(height * 0.72);
  const maxWidth = vertical ? width - 140 : width - 150;
  const brandY = y + (vertical ? 90 : 72);
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".42" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".88"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#shade)"/>
    <text x="${x}" y="${y}" fill="#fff" font-family="Arial, sans-serif" font-size="${fontSize}" textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs" font-weight="900" stroke="#160b0b" stroke-width="7" paint-order="stroke" letter-spacing="1">${escapeXml(text)}</text>
    <text x="${x + 4}" y="${brandY}" fill="#ffcf55" font-family="Arial, sans-serif" font-size="${vertical ? 38 : 30}" font-weight="700" letter-spacing="3">${escapeXml(brand)}</text>
  </svg>`);
}
export async function generateThumbnail(story, seo, topic) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const style = selectedStyle();
  const subject = String(seo.thumbnailPrompt || story.scenes?.[0]?.visualPrompt || story.title + ". " + topic);
  const prompt = [
    "Create a premium YouTube Shorts cover image, portrait 9:16 composition.", style.visual,
    "One unmistakable focal subject and one readable threat, dramatic close or medium shot, strong silhouette, emotionally intense expression, cinematic lighting, rich contrast, detailed Indonesian setting.",
    "Depict the strongest suspenseful moment from this story: " + subject,
    "Keep the main character and threat inside the central 70 percent of the frame so the image can also be cropped to landscape safely.",
    "Keep the lower 25 percent relatively dark and uncluttered for a short title overlay. No letters, typography, logo, watermark, collage, border.",
    style.avoid + ". No gore, blood, dismemberment or explicit violence."
  ].join(" ");
  const imageBuffer = await generateBackground(prompt);
  const label = String(seo.thumbnailText || story.title || topic).trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 28);
  const brand = CHANNEL_NAME.toLocaleUpperCase("id-ID");
  const verticalPath = path.join(OUT_DIR, "shorts-cover.jpg");
  await sharp(imageBuffer).resize(1080, 1920, { fit: "cover", position: "attention" }).composite([{ input: makeOverlay(1080, 1920, label, brand, true) }]).jpeg({ quality: 90, mozjpeg: true }).toFile(verticalPath);
  const landscapePath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
  await sharp(imageBuffer).resize(1280, 720, { fit: "cover", position: "attention" }).composite([{ input: makeOverlay(1280, 720, label, brand, false) }]).jpeg({ quality: 90, mozjpeg: true }).toFile(landscapePath);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "youtube-metadata.json"), JSON.stringify({ ...seo, format: "youtube-shorts", thumbnail: { vertical: "out/shorts-cover.jpg", youtube: "out/youtube-thumbnail.jpg" } }, null, 2));
  return { verticalPath, landscapePath };
}
