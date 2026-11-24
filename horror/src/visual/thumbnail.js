import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, DATA_DIR, OUT_DIR } from "../config.js";

function cleanThumbnailLabel(value, fallback = "") {
  const clean = input => String(input || "")
    .replace(/\b(?:youtube|shorts?|videos?|episodes?|eps|subscribe)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ")
    .slice(0, 28);
  return clean(value) || clean(fallback) || "CERITA MENEGANGKAN";
}
function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c]);
}
function selectedStyle() {
  const value = String(process.env.HORROR_THUMBNAIL_STYLE || process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase();
  return value === "2d-animation" || value === "2d"
    ? { id: "2d-animation", visual: "premium cinematic 2D animation, semi-realistic illustrated characters, detailed linework, hand-painted environment, textured painterly shading, dramatic composition", avoid: "not photorealistic 3D, not anime, not childish cartoon" }
    : { id: "cinematic-3d", visual: "photorealistic cinematic 3D CGI matching a serious live-action film frame, lifelike human anatomy and realistic facial proportions, natural skin texture with subtle pores, individually detailed hair, physically accurate clothing and materials, realistic environmental detail, dramatic film lighting, natural lens depth of field, grounded color grading", avoid: "absolutely no cartoon, no caricature, no stylized animation, no Pixar or Disney look, no oversized eyes or heads, no toy-like plastic skin, no anime, no illustration, no exaggerated facial proportions" };
}
async function generateBackground(prompt, label = "thumbnail") {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) throw new Error("CF_ACCOUNT_ID dan CF_API_TOKEN wajib tersedia untuk membuat thumbnail.");
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + config.cloudflareAccountId + "/ai/run/" + config.cloudflareModel;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      console.log("[thumbnail] " + label + ": request Cloudflare (" + attempt + "/" + maxAttempts + ").");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + config.cloudflareApiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: String(prompt).slice(0, 2048), steps: 4 }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Cloudflare thumbnail HTTP " + response.status + ": " + (await response.text()).slice(0, 400));
      const type = response.headers.get("content-type") || "";
      let buffer;
      if (type.includes("application/json")) {
        const payload = await response.json();
        if (!payload?.result?.image) throw new Error("Cloudflare thumbnail tidak mengembalikan result.image.");
        buffer = Buffer.from(payload.result.image, "base64");
      } else {
        buffer = Buffer.from(await response.arrayBuffer());
      }
      if (!buffer.length) throw new Error("Cloudflare mengembalikan gambar kosong.");
      console.log("[thumbnail] " + label + ": gambar diterima (" + buffer.length + " bytes).");
      return buffer;
    } catch (error) {
      const timedOut = error.name === "AbortError";
      console.warn("[thumbnail] " + label + ": percobaan " + attempt + " gagal" + (timedOut ? " (timeout 45 detik)" : "") + ": " + error.message);
      if (attempt === maxAttempts) throw new Error("Gagal membuat " + label + " setelah " + maxAttempts + " percobaan: " + error.message);
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      clearTimeout(timeout);
    }
  }
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
  const theme = String(themeTitle || "").trim().toUpperCase();
  const themeMaxChars = isLandscape ? 34 : 27;
  const themeWords = theme.split(/\s+/).filter(Boolean);
  const themeLines = [];
  let themeLine = "";
  for (const word of themeWords) {
    const candidate = themeLine ? themeLine + " " + word : word;
    if (candidate.length > themeMaxChars && themeLine) {
      themeLines.push(themeLine);
      themeLine = word;
    } else {
      themeLine = candidate;
    }
  }
  if (themeLine) themeLines.push(themeLine);
  const themeFontSize = isLandscape ? 30 : (themeLines.length >= 3 ? 34 : 40);
  const themeLineHeight = isLandscape ? 42 : 52;
  const themeFirstY = isLandscape ? 176 : 270;
  const themeLabel = themeLines.map((value, index) =>
    '<text x="' + (width / 2) + '" y="' + (themeFirstY + index * themeLineHeight) + '" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="' + themeFontSize + '" font-weight="800" stroke="#120b0b" stroke-width="5" paint-order="stroke" letter-spacing="1">' + escapeXml(value) + '</text>'
  ).join("");
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
  const is2dStyle = style.id === "2d-animation";
  const continuityInstruction = characterBible
    ? "STRICT " + style.id.toUpperCase() + " CHARACTER CONTINUITY FOR THIS SHORTS SERIES: render every recurring character consistently in " + (is2dStyle ? "premium cinematic 2D illustrated animation with stable linework, face proportions, color palette, hairstyle and signature outfits" : "photorealistic cinematic 3D human character style with stable realistic facial anatomy, natural skin texture, lifelike hair and physically accurate fabric") + ". Keep the same face shape, eye shape, skin tone, apparent age, hairstyle, body proportions, signature clothing and color palette in every episode. Do not redesign or reinterpret them. Character reference canon: " + characterBible + ". Keep all recurring characters visually distinct and recognizable."
    : "Create a recurring cast in " + style.visual + " with stable, realistic human anatomy and consistent facial identity.";
  const common = [
    style.visual,
    continuityInstruction,
    "One unmistakable focal subject that communicates the selected story genre, dramatic close or medium shot, strong silhouette, expressive emotion, cinematic lighting, rich contrast, detailed setting.",
    "Genre: " + genre + ". Depict the most compelling and emotionally clear moment from this story: " + subject,
    "BACKGROUND IMAGE ONLY: absolutely no generated text or typography of any kind. Do not invent words, labels, headings, titles, episode numbers, badges, logos, signs, subtitles, watermarks, UI elements, or decorative lettering. The only text that may appear in the FINAL thumbnail will be added separately by our code: series theme, episode title, and episode number. Leave the top theme area and lower title area visually clean for those overlays. No collage, no border.",
    style.avoid + ". Respect the selected genre; no horror elements unless the genre is horror."
  ].join(" ");
  const verticalPrompt = [
    "Create a clean background photograph/render for a YouTube Shorts cover, portrait 9:16. This is image artwork only, not a finished poster or thumbnail design. Entire scene and all people must follow this selected visual style: " + style.visual + ". Do not generate any words, letters, numbers, title, theme, episode label, badge, logo, watermark, signage, or typography. Theme, title, and episode number are added later by code.",
    common,
    "Compose exclusively for vertical mobile Shorts viewing (9:16). Match the serious photorealistic cinematic 3D visual language of the episode video, not a cartoon or animated family-film aesthetic. Show one clear emotional story moment with lifelike human characters; preserve realistic facial anatomy, skin texture, body proportions and signature outfits defined in the character bible. Keep faces unobstructed and readable on a phone. Leave safe space near the top for the EPS badge and the lower quarter for the theme title overlay."
  ].join(" ");
  // Shorts only: generate one portrait image. Do not spend a second API call on 16:9.
  const verticalBuffer = await generateBackground(verticalPrompt, "Shorts 9:16");
  const label = String(seo.thumbnailText || story.title || topic).trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 28);
  const episodeNumber = story.episodeNumber;
  const themeTitle = story.seriesTitle || story.themeTitle || story.theme || "";
  const verticalPath = path.join(OUT_DIR, "shorts-cover.jpg");
  const compatibilityPath = path.join(OUT_DIR, "youtube-thumbnail.jpg");
  await sharp(verticalBuffer).resize(1080, 1920, { fit: "cover", position: "attention" })
    .composite([{ input: makeOverlay(1080, 1920, label, episodeNumber, "", themeTitle) }])
    .jpeg({ quality: 90, mozjpeg: true }).toFile(verticalPath);
  // Keep the legacy filename for existing workflow consumers, but its content is also 9:16.
  await fs.copyFile(verticalPath, compatibilityPath);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify({
    ...seo,
    thumbnail: { version: "episode-ctr-v11-" + style.id + "-portrait", format: "9:16", youtube: "shorts-cover.jpg", shorts: "shorts-cover.jpg", compatibilityFile: "youtube-thumbnail.jpg", visualStyle: style.id, characterContinuity: "series-bible" }
  }, null, 2));
  return { verticalPath, compatibilityPath };
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
