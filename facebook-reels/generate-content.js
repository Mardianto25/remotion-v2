import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const OUT = path.resolve("out/facebook-reels");
const topic = process.env.REELS_TOPIC?.trim() || "Renungan Islami tentang doa yang belum terkabul";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function parseJson(text) {
  const clean = String(text || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(clean);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum diatur.");
  const prompt = `
Bertindak sebagai penulis naskah renungan Islami untuk Facebook Reels Indonesia.
Buat satu cerita orisinal, menyentuh, tidak menggurui, dan selesai dalam 30-45 detik.
Topik: ${topic}

Alur wajib:
- 0-3 detik: hook emosional yang menghentikan scrolling.
- 3-15 detik: konflik dekat dengan kehidupan (doa, kehilangan, rezeki, lelah, atau ujian).
- 15-30 detik: puncak cerita, sudut pandang berubah, pesan Islami yang menenangkan.
- 30-45 detik: kalimat penutup yang membekas dan mengajak merenung tanpa memaksa komentar.

Batasan:
- Bahasa Indonesia natural, bukan bahasa buku atau terjemahan.
- Sekitar 75-95 kata untuk narasi, cocok dibacakan 30-45 detik.
- Jangan mengarang ayat, hadis, nomor surat, atau mengatasnamakan Allah dengan kutipan palsu.
- Jangan membuat janji bahwa doa pasti terkabul sesuai waktu/keinginan manusia.
- Hindari pembuka klise "Pernahkah kamu".
- Buat tepat 5 scene. Teks scene harus berurutan dan bila digabung menjadi narasi lengkap.
- Image prompt harus spesifik, sinematik 3D, vertikal 9:16, tanpa tulisan.
- Gunakan karakter utama yang sama: seorang pria Muslim Indonesia dewasa usia sekitar 30 tahun, wajah oval, kulit sawo matang, rambut hitam pendek rapi, janggut tipis, memakai baju koko krem sederhana. Pertahankan identitas dan ciri wajah ini di semua scene; variasikan ekspresi, pose, dan lingkungan sesuai narasi.
- Jangan menggambarkan Allah atau nabi.
- Buat metadata judul, caption, hashtag yang relevan untuk Facebook Page Reels.

Kembalikan JSON murni:
{
 "title":"maksimal 80 karakter",
 "caption":"1-2 kalimat natural",
 "hashtags":["#RenunganIslami","#...","#..."],
 "narration":"narasi lengkap",
 "scenes":[
  {"text":"bagian narasi scene","imagePrompt":"deskripsi visual scene tanpa teks"}
 ]
}
Jangan sertakan markdown atau penjelasan.
`;
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_CONTENT_MODEL || "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  const data = parseJson(response.text);
  if (!data.narration || !Array.isArray(data.scenes) || data.scenes.length !== 5) {
    throw new Error("Output Gemini harus memiliki narration dan tepat 5 scenes.");
  }
  const words = data.narration.trim().split(/\s+/).length;
  if (words < 65 || words > 110) throw new Error(`Panjang narasi di luar batas: ${words} kata.`);
  data.title = String(data.title || "Renungan Islami").slice(0, 80);
  data.caption = String(data.caption || data.title).slice(0, 1800);
  data.hashtags = [...new Set((data.hashtags || []).map(x => String(x).startsWith("#") ? String(x) : `#${x}`))].slice(0, 5);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "content.json"), JSON.stringify(data, null, 2) + "\n");
  await fs.writeFile(path.join(OUT, "transcript.txt"), data.narration.trim() + "\n");
  console.log(`Konten dibuat: ${words} kata, ${data.scenes.length} scene.`);
}
main().catch(error => { console.error(error); process.exit(1); });
