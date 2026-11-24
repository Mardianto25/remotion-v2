import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { generateGeminiContent } from "./geminiFallback.js";

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

function normalizeStory(input, topic, selectedGenre = "mystery") {
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
    category: value.category || (selectedGenre === "mystery" ? "Horror & Mystery" : selectedGenre),
    genre: value.genre || selectedGenre,
    disclaimer: value.disclaimer || "Kisah ini memuat legenda dan dramatisasi. Bagian yang belum terverifikasi tidak disajikan sebagai fakta.",
    narration,
    scenes
  };
}

export async function generateStory(topic, options = {}) {
  const durationMinutes = Math.max(1, Math.min(8, Number(options.durationMinutes || 5)));
  const longVideo = options.longVideo === true;
  const selectedGenre = String(options.genre || process.env.STORY_GENRE || "mystery");
  const targetWords = longVideo ? Math.round(durationMinutes * 130) : 700;
  const minWords = longVideo ? Math.max(130, Math.round(targetWords * 0.88)) : 650;
  const maxWords = longVideo ? Math.min(1150, Math.round(targetWords * 1.12)) : 750;
  const sceneCount = longVideo ? Math.max(6, Math.min(32, Math.round(durationMinutes * 4))) : 22;
  const selectedStyle = String(process.env.HORROR_VISUAL_STYLE || "cinematic-3d").toLowerCase();
  const visualStylePrompt = longVideo && (selectedStyle === "2d" || selectedStyle === "2d-animation") ? "premium cinematic 2D animation, semi-realistic illustrated characters, detailed linework, hand-painted environment, textured painterly shading" : "high-end cinematic 3D CGI, realistic 3D characters and environments, physically based materials, detailed textures, volumetric lighting, cinematic depth, Unreal Engine quality render";
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY belum diatur.");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    longVideo ? "Buat naskah cerita video YouTube genre " + selectedGenre + " untuk Ruang Cerita Indonesia dengan target durasi " + durationMinutes + " menit (sekitar " + minWords + "-" + maxWords + " kata). Jangan melebihi " + Math.round(maxWords * 1.08) + " kata." : "Buat naskah cerita horor/misteri Indonesia untuk video YouTube Ruang Cerita Indonesia dengan target durasi narasi 5-6 menit (sekitar 650-750 kata; batas keras 820 kata).",
    "Prioritaskan cerita yang padat, mengalir, sinematik, dan membuat penonton ingin terus menonton. Jangan memperpanjang cerita dengan pengulangan, basa-basi, atau deskripsi suasana yang tidak menambah ketegangan.",
    "Gunakan struktur alur yang jelas: (1) hook kuat yang sesuai genre dalam 1-2 kalimat pertama; (2) pengenalan tokoh dan lokasi secara singkat; (3) konflik mulai berkembang; (4) konsekuensi dan taruhan meningkat dengan petunjuk atau keputusan baru; (5) klimaks yang emosional dan logis; (6) ending atau twist yang kuat dan membekas.",
    longVideo ? "Pastikan ada perkembangan cerita atau informasi baru setiap 20-35 detik. Buka dengan momen paling menarik atau pertanyaan spesifik yang sesuai genre." : "Pastikan ada perkembangan cerita atau informasi baru setiap 20-35 detik. Dalam 5-10 detik pertama, buka dengan kejadian paling ganjil/menyeramkan atau pertanyaan yang spesifik. Hindari intro channel, salam, ajakan subscribe di awal, dan latar belakang panjang. Jangan mengulang informasi yang sudah diketahui penonton, jangan terlalu cepat mengungkap sosok/rahasia utama, dan jangan menutup cerita secara terburu-buru.",
    "Buat " + sceneCount + "-" + Math.min(36, sceneCount + 2) + " scene yang mengikuti urutan narasi. Setiap scene harus mewakili satu momen visual yang jelas dan berbeda, bukan memecah satu kalimat menjadi banyak scene.",
    "Jika mengangkat lokasi, legenda, atau peristiwa nyata, bedakan fakta, legenda, kesaksian, dan dramatisasi. Jangan mengarang sumber, tanggal, kutipan, atau menyebut cerita sebagai kisah nyata tanpa dasar. Hindari gore eksplisit.",
    "Narasi lengkap harus konsisten dengan gabungan narration pada seluruh scene. Setiap scene.narration WAJIB berupa potongan VERBATIM yang berurutan dari narration lengkap: salin kalimat persis, jangan parafrase, jangan menambah/mengurangi kata, dan jangan mengubah urutan. Scene pertama dimulai dari awal cerita dan scene terakhir berakhir di akhir cerita.",
    "Kembalikan satu objek JSON valid tanpa markdown atau code fence. Gunakan tepat struktur berikut:",
    "JSON schema: {title, description, category, disclaimer, narration (sekitar " + minWords + "-" + maxWords + " kata), scenes: [{id, heading, narration, visualPrompt (English, landscape 16:9), searchQuery, mood}]}",
    "Setiap scene wajib memiliki narration dan minimal salah satu dari visualPrompt atau searchQuery.",
    "visualPrompt wajib bahasa Inggris dan memakai gaya visual berikut: " + visualStylePrompt + ", landscape 16:9, no text, no logo, no watermark. Jangan menulis prompt sebagai foto dokumenter atau gambar stok.",
    "Buat karakter utama dan entitas supernatural konsisten antar-scene: pertahankan umur, bentuk wajah, rambut, pakaian, ciri fisik, dan detail penampilan yang sama saat karakter muncul kembali. Deskripsikan kembali ciri penting tersebut di setiap visualPrompt karena setiap gambar dibuat secara terpisah.",
    "Variasikan framing antar-scene (wide establishing shot, medium shot, close-up, over-the-shoulder, low angle) sesuai momen cerita. Hindari mengulang komposisi yang sama.",
    longVideo ? "Jaga kualitas visual sinematik yang serius dan sesuai genre. Ikuti style yang dipilih pengguna; hindari gaya generik dan gore eksplisit." : "Gaya visual harus serius, menyeramkan, realistis seperti film horor CGI 3D; bukan kartun, anime, ilustrasi, atau game low-poly. Hindari gore dan kekerasan eksplisit.",
    "Topik: " + topic
  ].join("\n");

  const response = await generateGeminiContent(ai, {
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const parsed = extractJson(response.text);
  return normalizeStory(parsed, topic, selectedGenre);
}
