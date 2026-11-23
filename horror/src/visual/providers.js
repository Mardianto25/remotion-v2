import fs from "node:fs/promises";
import path from "node:path";
import { config, ASSETS_DIR } from "../config.js";

const HORROR_3D_STYLE = [
  "high-end cinematic 3D CGI horror film still",
  "photorealistic 3D rendering, physically based materials, realistic skin and fabric shaders",
  "detailed 3D environment, volumetric moonlight, deep cinematic shadows, atmospheric fog",
  "Unreal Engine quality render, dramatic film lighting, realistic depth and scale",
  "landscape 16:9 composition, no text, no logo, no watermark"
].join(", ");
const HORROR_2D_STYLE = [
  "2D cinematic horror animation frame",
  "semi-realistic dark graphic novel illustration, hand-painted background",
  "expressive consistent 2D character design, detailed linework and textured painterly shading",
  "cinematic composition, atmospheric fog, dramatic lighting, deep shadows, restrained color palette",
  "landscape 16:9 composition, no text, no logo, no watermark"
].join(", ");

function buildHorrorPrompt(prompt) {
  const selectedStyle = (process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase();
  const use2D = selectedStyle === "2d" || selectedStyle === "2d-animation";
  const style = use2D ? HORROR_2D_STYLE : HORROR_3D_STYLE;
  const suffix = use2D
    ? "Indonesian horror story illustration. Avoid photorealistic 3D rendering, game render, gore and explicit violence."
    : "Indonesian supernatural horror atmosphere. Avoid cartoon, anime, illustration, gore and explicit violence.";
  return String(prompt || "An abandoned Indonesian village at night, thick fog and a distant mysterious silhouette")
    .replace(/\b(photorealistic|cinematic)\b/gi, "")
    .trim() + ". " + style + ". " + suffix;
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
      prompt: buildHorrorPrompt(prompt),
      steps: 4
    })
  });
  await saveCloudflareImage(response, destination);
  return { provider: "cloudflare-workers-ai", model: config.cloudflareModel, visualStyle: use2D ? "2d-animation" : "cinematic-3d", sourceUrl: null, fileName: path.basename(destination) };
}

export async function pixabayImage(query, destination) {
  if (!config.pixabayApiKey) throw new Error("PIXABAY_API_KEY belum tersedia.");
  const params = new URLSearchParams({
    key: config.pixabayApiKey, q: query, image_type: "photo",
    orientation: "horizontal", safesearch: "true", per_page: "30"
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
  const params = new URLSearchParams({ query, orientation: "landscape", per_page: "20" });
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

export async function getSceneImage(scene, index) {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  const stem = "scene-" + String(index + 1).padStart(3, "0");
  const prompt = scene.visualPrompt || scene.narration || "Misty Indonesian forest at night";
  const query = scene.searchQuery || "Indonesian misty forest cinematic";
  const strictStyle = (process.env.HORROR_STRICT_VISUAL_STYLE || "").toLowerCase() === "true";
  const cloudflareProvider = () => cloudflareImage(prompt, path.join(ASSETS_DIR, stem + ".jpg"));
  const providers = strictStyle
    ? [cloudflareProvider]
    : [
        cloudflareProvider,
        () => pixabayImage(query, path.join(ASSETS_DIR, stem + ".jpg")),
        () => pexelsImage(query, path.join(ASSETS_DIR, stem + "-pexels.jpg"))
      ];
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await provider();
      return { ...result, localPath: path.join(ASSETS_DIR, result.fileName) };
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
