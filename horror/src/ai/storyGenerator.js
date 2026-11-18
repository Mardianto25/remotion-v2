import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

function extractJson(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Respons Gemini kosong. Periksa model, API key, dan quota.");

  const cleaned = text
    .replace(/^\x60{3}(?:json)?\s*/i, "")
    .replace(/\s*\x60{3}$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Gemini tidak mengembalikan objek JSON. Awal respons: " + cleaned.slice(0, 500));
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (error) {
      throw new Error("JSON Gemini tidak valid: " + error.message + ". Awal respons: " + cleaned.slice(0, 500));
    }
  }
}

function normalizeStory(input, topic) {
  // Beberapa respons model membungkus hasil di dalam story/data/result.
  let value = input;
  for (let i = 0; i < 3; i++) {
    if (value && !Array.isArray(value.scenes)) {
      const nested = value.story || value.data || value.result || value.output;
      if (nested && typeof nested === "object") value = nested;
    }
  }

  const rawScenes = value.scenes || value.sceneList || value.shots;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error("JSON Gemini tidak memiliki array scenes. Properti yang diterima: " + Object.keys(value || {}).join(", "));
  }

  const scenes = rawScenes.map((scene, index) => ({
    id: scene.id ?? index + 1,
    heading: scene.heading || scene.title || scene.name || `Adegan ${index + 1}`,
    narration: scene.narration || scene.voiceover || scene.script || scene.text || "",
    visualPrompt: scene.visualPrompt || scene.imagePrompt || scene.visual_prompt || scene.prompt || "",
    searchQuery: scene.searchQuery || scene.search_query || scene.query || "",
    mood: scene.mood || "misterius"
  }));

  const narration = value.narration || value.fullNarration || value.full_narration ||
    value.script || value.voiceover || scenes.map(scene => scene.narration).filter(Boolean).join("\n\n");

  if (!narration.trim()) {
    throw new Error("Narasi utama dan narasi per-scene kosong. Properti JSON: " + Object.keys(value || {}).join(", "));
  }

  const missingVisual = scenes.filter(scene => !scene.visualPrompt && !scene.searchQuery);
  if (missingVisual.length) {
    throw new Error(`Ada ${missingVisual.length} scene tanpa visualPrompt/searchQuery. Contoh scene: ${JSON.stringify(missingVisual[0]).slice(0, 400)}`);
  }

  return {
    title: value.title || value.videoTitle || topic,
    description: value.description || value.summary || "",
    category: value.category || "Horror & Mystery",
    disclaimer: value.disclaimer || "Kisah ini memuat legenda dan dramatisasi. Bagian yang belum terverifikasi tidak disajikan sebagai fakta.",
    narration,
    scenes
  };
}

export async function generateStory(topic) {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY belum diatur.");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Buat naskah dokumenter misteri/horor Indonesia berbahasa Indonesia untuk video YouTube 8-10 menit, sekitar 1000-1300 kata.",
    "Susun 24-32 scene sesuai urutan narasi. Bedakan fakta, legenda, kesaksian dan dramatisasi. Jangan mengarang sumber, tanggal atau kutipan. Hindari gore eksplisit.",
    "Kembalikan satu objek JSON valid tanpa markdown atau code fence. Gunakan tepat struktur berikut:",
    '{"title":"judul video","description":"deskripsi","category":"kategori","disclaimer":"catatan fakta dan dramatisasi","narration":"naskah narasi lengkap","scenes":[{"id":1,"heading":"judul adegan","narration":"bagian narasi adegan","visualPrompt":"English cinematic photorealistic visual prompt, landscape 16:9, no text, no watermark","searchQuery":"kata kunci visual alternatif","mood":"misterius"}]}',
    "Setiap scene wajib memiliki narration dan minimal salah satu dari visualPrompt atau searchQuery.",
    "visualPrompt harus bahasa Inggris, photorealistic cinematic horror documentary still, landscape 16:9, no text, no watermark.",
    "Topik: " + topic
  ].join("\n");

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const parsed = extractJson(response.text);
  return normalizeStory(parsed, topic);
}
