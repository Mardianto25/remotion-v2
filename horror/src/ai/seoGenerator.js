import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

function parseJson(text) {
  const clean = String(text || "").replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini tidak mengembalikan JSON metadata SEO.");
    return JSON.parse(clean.slice(start, end + 1));
  }
}

export async function generateSeo(story, topic) {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = `Bertindak sebagai editor YouTube dan spesialis SEO untuk channel Indonesia "Semesta Kisah".
Buat metadata untuk video berdasarkan cerita berikut. Bahasa Indonesia alami, menarik, tidak clickbait menyesatkan.
Jangan menyebut "kisah nyata", "terbukti", penampakan faktual, tanggal, sumber atau kejadian yang tidak ada dalam materi.
Judul maksimal 100 karakter, keyword utama di awal jika alami. Deskripsi 2-4 paragraf dengan ringkasan, keyword relevan, ajakan subscribe, dan disclaimer fakta/legenda/dramatisasi yang sesuai.
Hashtags 3-5 buah, relevan, tanpa spasi. Tags berupa 10-18 keyword pendek, jangan mengulang berlebihan.
Kembalikan JSON valid saja dengan struktur:
{"title":"...","description":"...","hashtags":["#..."],"tags":["..."],"thumbnailText":"teks pendek maksimal 5 kata"}
Topik: ${topic}
Judul cerita: ${story.title}
Ringkasan: ${story.description || ""}
Disclaimer: ${story.disclaimer || ""}
Potongan narasi: ${String(story.narration || "").slice(0, 7000)}`;
  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  const value = parseJson(response.text);
  const title = String(value.title || story.title || topic).slice(0, 100);
  const hashtags = [...new Set((Array.isArray(value.hashtags) ? value.hashtags : []).map(x => String(x).trim().replace(/\s+/g, "")).filter(x => /^#[\p{L}\p{N}_]+$/u.test(x)))].slice(0, 5);
  const tags = [...new Set((Array.isArray(value.tags) ? value.tags : []).map(x => String(x).trim()).filter(Boolean))].slice(0, 18);
  const baseDescription = String(value.description || story.description || "");
  const disclaimer = story.disclaimer || "Sebagian bagian cerita dapat berupa legenda atau dramatisasi.";
  const description = [baseDescription, "", disclaimer, "", "Ikuti Semesta Kisah untuk cerita misteri, legenda, sejarah, dan kisah menarik lainnya.", "", hashtags.join(" ")].join("\n").slice(0, 4900);
  return { title, description, hashtags, tags, thumbnailText: String(value.thumbnailText || title).slice(0, 30) };
}
