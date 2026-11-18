import fs from "node:fs/promises";
import path from "node:path";
import { config, ASSETS_DIR } from "../config.js";

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
      prompt: prompt + ". Photorealistic cinematic Indonesian horror documentary still, landscape 16:9, atmospheric lighting, no text, no logo, no watermark.",
      steps: 4
    })
  });
  await saveCloudflareImage(response, destination);
  return { provider: "cloudflare-workers-ai", sourceUrl: null, fileName: path.basename(destination) };
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
  const providers = [
    () => cloudflareImage(prompt, path.join(ASSETS_DIR, stem + ".png")),
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
  throw new Error("Semua provider visual gagal pada scene " + (index + 1) + ": " + errors.join(" | "));
}
