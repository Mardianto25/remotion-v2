import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
export const AUDIO_DIR = path.join(PUBLIC_DIR, "audio");
export const DATA_DIR = path.join(ROOT, "data");
export const OUT_DIR = path.join(ROOT, "out");
export const CHANNEL_NAME = process.env.YOUTUBE_CHANNEL_NAME || "Ruang Cerita Indonesia";
export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  geminiFallbackModels: (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash,gemini-2.5-flash").split(",").map(model => model.trim()).filter(Boolean),
  cloudflareAccountId: process.env.CF_ACCOUNT_ID,
  cloudflareApiToken: process.env.CF_API_TOKEN,
  cloudflareModel: process.env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell",
  pixabayApiKey: process.env.PIXABAY_API_KEY,
  pexelsApiKey: process.env.PEXELS_API_KEY,
  edgeVoice: process.env.EDGE_TTS_VOICE || "id-ID-ArdiNeural",
  edgeRate: process.env.EDGE_TTS_RATE || "-8%",
  edgePitch: process.env.EDGE_TTS_PITCH || "-5Hz"
};
