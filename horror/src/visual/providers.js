import fs from "node:fs/promises";
import path from "node:path";
import { config, ASSETS_DIR } from "../config.js";

const VISUAL_STYLES = {
  "cinematic-3d": "high-end cinematic 3D CGI, realistic physically based materials, detailed environment, expressive character design, dramatic film lighting, realistic depth and scale",
  "2d-animation": "premium cinematic 2D animation, semi-realistic illustrated characters, detailed linework, hand-painted environment, textured painterly shading, dramatic composition"
};
function buildVisualPrompt(prompt) {
  const selectedStyle = (process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase();
  const styleKey = selectedStyle === "2d" ? "2d-animation" : selectedStyle;
  const style = VISUAL_STYLES[styleKey] || VISUAL_STYLES["cinematic-3d"];
  const genre = String(process.env.STORY_GENRE || "mystery").toLowerCase();
  const moodByGenre = {
    horror: "suspenseful unsettling atmosphere, eerie shadows, mysterious tension",
    mystery: "intriguing investigative atmosphere, clues, layered mystery",
    islamic: "respectful warm spiritual atmosphere, modest clothing, peaceful cinematic lighting",
    inspirational: "hopeful emotional atmosphere, human resilience, uplifting cinematic lighting",
    drama: "emotionally expressive realistic human drama, believable everyday locations",
    history: "period-appropriate historical setting, authentic clothing and architecture",
    adventure: "dynamic adventurous atmosphere, exploration, scale and discovery",
    fantasy: "immersive imaginative world, magical atmosphere, original fantasy design",
    education: "clear informative visual storytelling, accurate and approachable setting"
  };
  const mood = moodByGenre[genre] || "genre-appropriate cinematic visual storytelling";
  return String(prompt || "A cinematic scene with a clear central subject")
    .replace(/\\b(photorealistic|cinematic)\\b/gi, "")
    .trim() + ". " + style + ". " + mood + ". Portrait vertical 9:16 composition for mobile video, no text, no logo, no watermark.";
}
async function saveCloudflareImage(response, destination) {
  if (!response.ok) throw new Error("Cloudflare HTTP " + response.status);
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const payload = await response.json();
    const encoded = payload?.result?.image;
    if (!encoded) throw new Error("Cloudflare response tidak berisi result.image.");
    await fs.writeFile(destination, Buffer.from(encoded, "base64"));
  } else {
    await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
}

export async function cloudflareImage(prompt, destination) {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) throw new Error("Cloudflare credentials belum tersedia.");
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + config.cloudflareAccountId + "/ai/run/" + config.cloudflareModel;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + config.cloudflareApiToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildVisualPrompt(prompt),
      steps: 4
    })
  });
  await saveCloudflareImage(response, destination);
  return { provider: "cloudflare-workers-ai", model: config.cloudflareModel, visualStyle: ["2d", "2d-animation"].includes((process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase()) ? "2d-animation" : "cinematic-3d", genre: process.env.STORY_GENRE || "mystery", sourceUrl: null, fileName: path.basename(destination) };
}

export async function pixabayImage(query, destination) {
  if (!config.pixabayApiKey) throw new Error("PIXABAY_API_KEY belum tersedia.");
  const params = new URLSearchParams({
    key: config.pixabayApiKey, q: query, image_type: "photo",
    orientation: "vertical", safesearch: "true", per_page: "30"
  });
  const response = await fetch("https://pixabay.com/api/?" + params);
  if (!response.ok) throw new Error("Pixabay HTTP " + response.status);
  const data = await response.json();
  const item = data.hits?.[0];
  if (!item) throw new Error("Pixabay tidak menemukan gambar.");
  const imageResponse = await fetch(item.largeImageURL || item.webformatURL);
  if (!imageResponse.ok) throw new Error("Gagal mengunduh gambar Pixabay.");
  await fs.writeFile(destination, Buffer.from(await imageResponse.arrayBuffer()));
  return { provider: "pixabay", sourceUrl: item.pageURL, creator: item.user || null, fileName: path.basename(destination) };
}

export async function pexelsImage(query, destination) {
  if (!config.pexelsApiKey) throw new Error("Pexels nonaktif: PEXELS_API_KEY belum tersedia.");
  const params = new URLSearchParams({ query, orientation: "portrait", per_page: "20" });
  const response = await fetch("https://api.pexels.com/v1/search?" + params, {
    headers: { Authorization: config.pexelsApiKey }
  });
  if (!response.ok) throw new Error("Pexels HTTP " + response.status);
  const data = await response.json();
  const item = data.photos?.[0];
  if (!item) throw new Error("Pexels tidak menemukan foto.");
  const imageResponse = await fetch(item.src?.large2x || item.src?.large);
  if (!imageResponse.ok) throw new Error("Gagal mengunduh foto Pexels.");
  await fs.writeFile(destination, Buffer.from(await imageResponse.arrayBuffer()));
  return { provider: "pexels", sourceUrl: item.url, creator: item.photographer || null, fileName: path.basename(destination) };
}

export async function getSceneImage(scene, index, destinationDir = ASSETS_DIR) {
  await fs.mkdir(destinationDir, { recursive: true });
  const stem = "scene-" + String(index + 1).padStart(3, "0");
  const prompt = scene.visualPrompt || scene.narration || "Misty Indonesian forest at night";
  const query = scene.searchQuery || "Indonesian misty forest cinematic";
  const strictStyle = (process.env.HORROR_STRICT_VISUAL_STYLE || "").toLowerCase() === "true";
  const cloudflareProvider = () => cloudflareImage(prompt, path.join(destinationDir, stem + ".jpg"));
  const providers = strictStyle
    ? [cloudflareProvider]
    : [
        cloudflareProvider,
        () => pixabayImage(query, path.join(destinationDir, stem + ".jpg")),
        () => pexelsImage(query, path.join(destinationDir, stem + "-pexels.jpg"))
      ];
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await provider();
      return { ...result, localPath: path.join(destinationDir, result.fileName) };
    } catch (error) {
      errors.push(error.message);
      console.warn("[visual] " + error.message);
    }
  }
  if (strictStyle) {
    throw new Error("FLUX gagal membuat visual sesuai style " + (process.env.HORROR_VISUAL_STYLE || "cinematic-3d") + " pada scene " + (index + 1) + ". Fallback foto stok dinonaktifkan agar style serial tetap konsisten. " + errors.join(" | "));
  }
  throw new Error("Semua provider visual gagal pada scene " + (index + 1) + ": " + errors.join(" | "));
}
