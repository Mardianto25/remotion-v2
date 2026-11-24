import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, DATA_DIR, OUT_DIR } from "../config.js";

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c]);
}
function selectedStyle() {
  // Shorts series thumbnails are locked to the established cinematic 3D character look.
  const value = "cinematic-3d";
  return value === "2d-animation" || value === "2d"
    ? { visual: "premium cinematic 2D animation, semi-realistic illustrated characters, detailed linework, hand-painted environment, textured painterly shading, dramatic composition", avoid: "not photorealistic 3D, not anime, not childish cartoon" }
    : { visual: "high-end cinematic 3D CGI, realistic physically based materials, detailed environment, expressive character design, dramatic film lighting, realistic depth and scale", avoid: "not flat illustration, not anime, not childish cartoon" };
}
async function generateBackground(prompt) {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) throw new Error("CF_ACCOUNT_ID dan CF_API_TOKEN wajib tersedia untuk membuat thumbnail.");
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + config.cloudflareAccountId + "/ai/run/" + config.cloudflareModel;
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + config.cloudflareApiToken, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: String(prompt).slice(0, 2048), steps: 4 }) });
  if (!response.ok) throw new Error("Cloudflare thumbnail HTTP " + response.status + ": " + (await response.text()).slice(0, 400));
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const payload = await response.json();
    if (!payload?.result?.image) throw new Error("Cloudflare thumbnail tidak mengembalikan result.image.");
    return Buffer.from(payload.result.image, "base64");
  }
  return Buffer.from(await response.arrayBuffer());
}
function makeOverlay(width, height, text, episodeNumber, labelOverride = "", themeTitle = "") {
  const isLandscape = width > height;
  const maxChars = isLandscape ? 24 : 18;
  const words = String(text || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (candidate.length > maxChars && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, 2);
  const fontSize = isLandscape ? (visibleLines.some(value => value.length > 20) ? 48 : 58) : (visibleLines.some(value => value.length > 15) ? 78 : 94);
  const firstY = isLandscape
    ? Math.round(height * (visibleLines.length > 1 ? 0.79 : 0.86))
    : Math.round(height * (visibleLines.length > 1 ? 0.835 : 0.89));
  const title = visibleLines.map((value, index) =>
    '<text x="' + (width / 2) + '" y="' + (firstY + index * (isLandscape ? 66 : 112)) + '" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="' + fontSize + '" font-weight="900" stroke="#120b0b" stroke-width="' + (isLandscape ? 6 : 8) + '" paint-order="stroke" letter-spacing="1">' + escapeXml(value) + '</text>'
  ).join("");
  const episodeLabel = labelOverride || (Number.isInteger(Number(episodeNumber)) && Number(episodeNumber) > 0
    ? "EPS " + String(Number(episodeNumber)).padStart(2, "0")
    : "EPISODE");
  const badgeWidth = isLandscape ? 250 : 300;
  const badgeHeight = isLandscape ? 76 : 92;
  const badgeX = isLandscape ? 56 : 64;
  const badgeY = isLandscape ? 48 : 70;
  const badge = '<rect x="' + badgeX + '" y="' + badgeY + '" width="' + badgeWidth + '" height="' + badgeHeight + '" rx="14" fill="#b91c1c"/>' +
    '<text x="' + (badgeX + badgeWidth / 2) + '" y="' + (badgeY + badgeHeight * 0.68) + '" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="' + (isLandscape ? 40 : 48) + '" font-weight="900" letter-spacing="2">' + episodeLabel + '</text>';
  const theme = String(themeTitle || "").trim().toUpperCase().slice(0, 48);
  const themeLabel = theme ? '<text x="' + (width / 2) + '" y="' + (isLandscape ? 176 : 250) + '" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="' + (isLandscape ? 30 : 42) + '" font-weight="800" stroke="#120b0b" stroke-width="5" paint-order="stroke" letter-spacing="1">' + escapeXml(theme) + '</text>' : "";
  const shadeStart = isLandscape ? 0.60 : 0.72;
  const shadeRectY = Math.round(height * shadeStart);
  return Buffer.from('<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".94"/></linearGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#shade)"/>' +
    '<rect x="30" y="' + shadeRectY + '" width="' + (width - 60) + '" height="' + Math.round(height * (1 - shadeStart) - 24) + '" rx="22" fill="#050505" fill-opacity=".24"/>' +
    badge + themeLabel + title + '</svg>');
}
export async function generateThumbnail(story, seo, topic, metadataPath = path.join(DATA_DIR, "youtube-metadata.json")) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const style = selectedStyle();
  const subject = String(seo.thumbnailPrompt || story.scenes?.[0]?.visualPrompt || story.title + ". " + topic);
  const genre = String(process.env.STORY_GENRE || story.genre || story.category || "mystery").toLowerCase();
  const characterBible = Array.isArray(story.characters) ? story.characters.map(character => character.name + ": " + character.visualBible).join(" | ") : "";
  const continuityInstruction = characterBible ? "STRICT 3D CHARACTER CONTINUITY FOR THIS SHORTS SERIES: render every recurring character as a polished high-end 3D animated film character, not a 2D illustration, not a photograph, and not anime. Keep each character model identical in every episode: same face shape, eye shape, skin tone, apparent age, hairstyle, hairline, body proportions, and signature clothing. Do not redesign or reinterpret them. Character reference canon: " + characterBible + ". Arya and Maya must remain visually distinct and recognizable whenever they appear together. Use consistent 3D facial proportions, realistic stylized skin shading, detailed 3D hair strands, physically based fabric, expressive but natural 3D facial animation aesthetic." : "Create a recurring cast in premium cinematic 3D animated-film style with stable, clearly defined character designs.";
  const common = [
    style.visual,
    continuityInstruction,
    "One unmistakable focal subject that communicates the selected story genre, dramatic close or medium shot, strong silhouette, expressive emotion, cinematic lighting, rich contrast, detailed setting.",
    "Genre: " + genre + ". Depict the most compelling and emotionally clear moment from this story: " + subject,
    "Do not render any text, letters, numbers, symbols, captions, signage, logos, channel names, watermarks, signatures, or typography anywhere in the image. No collage, no border.",
    style.avoid + ". Respect the selected genre; no horror elements unless the genre is horror."
  ].join(" ");
  const verticalPrompt = [
    "Create a premium YouTube Shorts cover image, portrait 9:16 composition. Entire scene and all people must be high-end cinematic 3D CGI animated characters with dimensional faces, sculpted 3D features, detailed 3D hair and physically based materials. Generate a clean image only, absolutely no visible writing of any kind.",
    common,
    "Compose exclusively for vertical mobile Shorts viewing (9:16). Show one clear emotional story moment with the recurring 3D characters large in frame; preserve the exact same character models and signature outfits defined in the character bible. Keep faces unobstructed and readable on a phone. Leave safe space near the top for the EPS badge and the lower quarter for the theme title overlay."
  ].join(" ");
  const landscapePrompt = [
    "Create a premium standard YouTube video thumbnail, landscape 16:9 composition, 1280x720 framing. Generate a clean image only, absolutely no visible writing of any kind.",
    common,
    "Compose for a desktop and mobile YouTube thumbnail. Use a strong cinematic focal subject on the right half, with clear negative space on the left and lower third for a separately added title overlay. Keep the main face and story action inside the central safe area."
  ].join(" ");
  const [verticalBuffer, landscapeBuffer] = await Promise.all([
    generateBackground(verticalPrompt),
    generateBackground(landscapePrompt)
  ]);
  const label = String(seo.thumbnailText || story.title || topic).trim().split(/\s+/).slice(0, 5).join(" ").slice(0, 48);
  const episodeNumber = story.episodeNumber;
  const themeTitle = story.seriesTitle || story.themeTitle || story.theme || "";
  const verticalPath = path.join(OUT_DIR, "shorts-cover.jpg");
  const landscapePath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
  await Promise.all([
    sharp(verticalBuffer).resize(1080, 1920, { fit: "cover", position: "attention" })
      .composite([{ input: makeOverlay(1080, 1920, label, episodeNumber, "", themeTitle) }])
      .jpeg({ quality: 90, mozjpeg: true }).toFile(verticalPath),
    sharp(landscapeBuffer).resize(1280, 720, { fit: "cover", position: "attention" })
      .composite([{ input: makeOverlay(1280, 720, label, episodeNumber, "", themeTitle) }])
      .jpeg({ quality: 92, mozjpeg: true }).toFile(landscapePath)
  ]);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify({
    ...seo,
    thumbnail: { version: "episode-ctr-v7-theme", format: "9:16", youtube: "youtube-thumbnail.jpg", shorts: "shorts-cover.jpg", visualStyle: "cinematic-3d", characterContinuity: "series-bible" }
  }, null, 2));
  return { verticalPath, landscapePath };
}


export async function generateLongThumbnail(story, seo, topic, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const selected = String(process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase();
  const is2d = selected === "2d" || selected === "2d-animation";
  const style = is2d
    ? "premium cinematic 2D animation, semi-realistic illustrated characters, detailed linework, hand-painted environment, textured painterly shading"
    : "high-end cinematic 3D CGI, realistic physically based materials, detailed environment, expressive character design, dramatic film lighting";
  const subject = String(seo.thumbnailPrompt || story.scenes?.[0]?.visualPrompt || story.title || topic);
  const characters = Array.isArray(story.characters) ? story.characters.map(c => c.name + ": " + c.visualBible).join(" | ") : "";
  const prompt = [
    "Create a premium standard YouTube thumbnail, landscape 16:9, 1280x720.",
    style,
    "Genre: " + String(story.genre || process.env.STORY_GENRE || "storytelling") + ".",
    "Depict this story moment: " + subject,
    characters ? "Keep recurring character appearance consistent with this reference: " + characters : "",
    "Strong cinematic focal subject on the right half, readable emotion, dramatic lighting, clear negative space on the left and lower third for a separately added title.",
    "No text, letters, numbers, logos, watermark, collage or border."
  ].filter(Boolean).join(" ");
  const buffer = await generateBackground(prompt);
  const label = String(seo.thumbnailText || story.title || topic).trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 48);
  const outputPath = path.join(outputDir, "youtube-thumbnail.jpg");
  await sharp(buffer).resize(1280, 720, { fit: "cover", position: "attention" })
    .composite([{ input: makeOverlay(1280, 720, label, story.episodeNumber, story.episodeNumber ? "" : "VIDEO") }])
    .jpeg({ quality: 92, mozjpeg: true }).toFile(outputPath);
  const metadataPath = path.join(outputDir, "youtube-metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify({
    ...seo,
    thumbnail: { version: "long-video-16x9-v1", format: "16:9", youtube: "youtube-thumbnail.jpg", visualStyle: is2d ? "2d-animation" : "cinematic-3d" }
  }, null, 2));
  return { landscapePath: outputPath, metadataPath };
}
