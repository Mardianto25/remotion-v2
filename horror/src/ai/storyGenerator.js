import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

export async function generateStory(topic) {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY belum diatur.");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Tulis naskah dokumenter misteri/horor Indonesia berbahasa Indonesia untuk video YouTube 8-10 menit, sekitar 1000-1300 kata.",
    "Buat 24-32 scene sesuai urutan narasi. Bedakan fakta, legenda, kesaksian dan dramatisasi. Jangan mengarang sumber, tanggal atau kutipan. Hindari gore eksplisit.",
    "Kembalikan JSON valid saja dengan struktur: {title, description, category, disclaimer, narration, scenes:[{id,heading,narration,visualPrompt,searchQuery,mood}]}",
    "visualPrompt harus bahasa Inggris, photorealistic cinematic horror documentary still, landscape 16:9, no text, no watermark.",
    "Topik: " + topic
  ].join("\n");
  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  const raw = response.text || "";
  let story;
  try { story = JSON.parse(raw); }
  catch {
    story = JSON.parse(raw.replace(/^\x60{3}json\s*/i, "").replace(/\s*\x60{3}$/, ""));
  }
  if (!story.title || !story.narration || !Array.isArray(story.scenes) || !story.scenes.length) {
    throw new Error("JSON cerita dari Gemini tidak memenuhi schema.");
  }
  return story;
}
