import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CHANNEL_NAME, config, DATA_DIR, OUT_DIR } from "../config.js";

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c]);
}

export async function generateThumbnail(story, seo, topic) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const output = path.join(OUT_DIR, "youtube-thumbnail.jpg");
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + config.cloudflareAccountId + "/ai/run/" + config.cloudflareModel;
  const prompt = [
    "Create a high-CTR YouTube thumbnail background. Prioritize one instantly readable, emotionally disturbing focal subject and a clear visual question that makes viewers curious.",
    "High-end realistic 3D render, realistic 3D character or supernatural entity, physically based materials, detailed skin hair and fabric textures, detailed 3D environment, Unreal Engine quality, volumetric fog, dramatic moonlight, deep shadows, strong depth and scale, professional theatrical horror film poster.",
    "Landscape 16:9 composition, one instantly readable focal subject, striking silhouette and suspenseful storytelling.",
    "Depict the exact strongest story moment and threat from: " + (seo.thumbnailPrompt || (story.title + ". " + topic)) + ".",
    "Leave clean dark negative space on the left for large title overlay. No letters, no typography, no logo, no watermark, no collage, no borders.",
    "Serious realistic 3D horror aesthetic, not cartoon, not anime, not flat illustration. Avoid gore, blood, dismemberment and explicit violence."
  ].join(" ");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + config.cloudflareApiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 4 })
  });
  if (!response.ok) throw new Error("Cloudflare thumbnail HTTP " + response.status + ": " + (await response.text()).slice(0, 400));
  const type = response.headers.get("content-type") || "";
  let imageBuffer;
  if (type.includes("application/json")) {
    const payload = await response.json();
    if (!payload?.result?.image) throw new Error("Cloudflare thumbnail tidak mengembalikan result.image.");
    imageBuffer = Buffer.from(payload.result.image, "base64");
  } else {
    imageBuffer = Buffer.from(await response.arrayBuffer());
  }
  const label = escapeXml(String(seo.thumbnailText || story.title || topic).trim().split(/\\s+/).slice(0, 4).join(" "));
  const brand = escapeXml(CHANNEL_NAME.toLocaleUpperCase("id-ID"));
  const overlay = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".88"/><stop offset=".58" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    <rect width="1280" height="720" fill="url(#shade)"/>
    <text x="78" y="500" fill="#fff" font-family="Arial, sans-serif" font-size="68" textLength="920" lengthAdjust="spacingAndGlyphs" font-weight="900" stroke="#160b0b" stroke-width="5" paint-order="stroke" letter-spacing="1">${label}</text>
    <text x="82" y="565" fill="#ffcf55" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="3">${brand}</text>
  </svg>`);
  await sharp(imageBuffer).resize(1280, 720, { fit: "cover" }).composite([{ input: overlay }]).jpeg({ quality: 90, mozjpeg: true }).toFile(output);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "youtube-metadata.json"), JSON.stringify(seo, null, 2));
  return output;
}
