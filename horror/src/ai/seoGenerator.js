import { GoogleGenAI } from "@google/genai";
import { CHANNEL_NAME, config } from "../config.js";

function parseJson(text) {
  const clean = String(text || "").replace(/^\x60{3}json\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini tidak mengembalikan JSON metadata SEO.");
    return JSON.parse(clean.slice(start, end + 1));
  }
}

function fallbackSeo(story, topic) {
  const genre = String(story.genre || story.category || process.env.STORY_GENRE || "storytelling");
  const title = String(story.title || topic || "Cerita " + genre).trim().slice(0, 70);
  const tags = ["cerita " + genre, "storytelling Indonesia", "kisah inspiratif", "cerita Indonesia", "Ruang Cerita Indonesia", "video shorts"];
  const hashtags = ["#CeritaIndonesia", "#Shorts", "#" + genre.replace(/[^\\p{L}\\p{N}]/gu, "")];
  const scenePrompt = Array.isArray(story.scenes) ? story.scenes.slice(0, 2).map(x => x.visualPrompt || x.heading).filter(Boolean).join("; ") : "";
  const description = [
    String(story.description || ("Sebuah cerita " + genre + ": " + title + ".")).trim(),
    "",
    story.disclaimer || "Cerita ini merupakan fiksi dan dramatisasi untuk hiburan.",
    "",
    "Ikuti " + CHANNEL_NAME + " untuk cerita horor, misteri, dan kisah menegangkan lainnya.",
    "",
    hashtags.join(" ")
  ].join("\n").slice(0, 4900);
  return {
    title, titleAlternatives: [], selectionReason: "Metadata dibuat menggunakan template lokal karena Gemini API sedang mencapai kuota.",
    description, hashtags, tags, thumbnailText: title.split(/\s+/).slice(0, 4).join(" ").slice(0, 28),
    thumbnailPrompt: "Cinematic Indonesian horror cover image, portrait vertical 9:16, visual style consistent with the selected episode style. " + (scenePrompt || title) + ". One clear focal subject, visible suspenseful threat, mysterious atmosphere, dramatic cinematic lighting, empty space on the left for thumbnail text, no text, no logo, no watermark, no gore."
  };
}

export async function generateSeo(story, topic) {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const genre = String(story.genre || story.category || process.env.STORY_GENRE || "storytelling");
  const prompt = `Anda adalah YouTube packaging agent senior untuk channel Indonesia "${CHANNEL_NAME}". Tugas Anda bukan sekadar mengisi SEO, tetapi memilih kemasan video yang paling membuat penonton target ingin mengeklik tanpa menipu.
Genre konten: ${genre}. Analisis keseluruhan premis, konflik, emosi, lokasi, dan payoff cerita. Jangan otomatis memakai keyword horor jika genre bukan horor. Buat 3 kandidat judul secara internal, nilai masing-masing dari sisi rasa penasaran, kejelasan, relevansi dengan cerita, dan naturalitas bahasa Indonesia. Pilih satu pemenang.
Buat 2-4 kata untuk teks thumbnail. Teks thumbnail harus melengkapi judul, bukan mengulang judul. Buat prompt cover khusus YouTube Shorts berdasarkan momen paling kuat/unik dari cerita: satu focal subject yang langsung terbaca pada layar HP, ancaman terlihat jelas tetapi misterinya tidak dibocorkan, komposisi portrait vertical 9:16, subjek utama berada di area tengah agar aman saat di-crop. Prompt harus bahasa Inggris, mengikuti visual style yang dipilih (cinematic 3D atau 2D animation), konsisten dengan detail tokoh/entitas dalam cerita, tanpa tulisan/logo/watermark/gore.
Judul maksimal 70 karakter agar ringkas di feed Shorts, spesifik dan memancing rasa ingin tahu sesuai genre. Hindari judul generik, keyword stuffing, kapital berlebihan, dan clickbait yang tidak dibayar oleh isi cerita. Jangan mengklaim kisah nyata atau fakta yang tidak didukung materi.
Deskripsi 2-3 paragraf: kalimat pembuka kuat dan memuat keyword utama secara alami, ringkasan singkat tanpa membocorkan twist, konteks legenda/fiksi bila relevan, ajakan subscribe yang tidak berlebihan.
Hashtags 3-5 buah. Tags 10-18 keyword pendek yang benar-benar relevan.
Kembalikan JSON valid saja dengan struktur:
{"title":"judul terpilih","titleAlternatives":["alternatif 1","alternatif 2"],"selectionReason":"alasan singkat pemilihan judul","description":"...","hashtags":["#..."],"tags":["..."],"thumbnailText":"2-4 kata","thumbnailPrompt":"English image generation prompt"}
Topik: ${topic}
Judul cerita: ${story.title}
Ringkasan: ${story.description || ""}
Disclaimer: ${story.disclaimer || ""}
Naskah: ${String(story.narration || "").slice(0, 9000)}`;
  let value;
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    value = parseJson(response.text);
  } catch (error) {
    console.warn("[seo] Gemini tidak tersedia/kuota habis. Menggunakan metadata lokal:", error.message);
    return fallbackSeo(story, topic);
  }
  const title = String(value.title || story.title || topic).trim().slice(0, 70);
  const hashtags = [...new Set((Array.isArray(value.hashtags) ? value.hashtags : []).map(x => String(x).trim().replace(/\s+/g, "")).filter(x => /^#[\p{L}\p{N}_]+$/u.test(x)))].slice(0, 5);
  const uniqueTags = [...new Set((Array.isArray(value.tags) ? value.tags : []).map(x => String(x).trim()).filter(Boolean))].slice(0, 18);
  const tags = [];
  let tagLength = 0;
  for (const tag of uniqueTags) {
    const extra = tag.length + (tags.length ? 1 : 0);
    if (tagLength + extra > 480) continue;
    tags.push(tag);
    tagLength += extra;
  }
  const baseDescription = String(value.description || story.description || "");
  const disclaimer = story.disclaimer || "Sebagian bagian cerita dapat berupa legenda atau dramatisasi.";
  const description = [baseDescription, "", disclaimer, "", `Ikuti ${CHANNEL_NAME} untuk cerita misteri, legenda, sejarah, dan kisah menarik lainnya.`, "", hashtags.join(" ")].join("\n").slice(0, 4900);
  const thumbnailText = String(value.thumbnailText || title).trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 28);
  return {
    title, titleAlternatives: Array.isArray(value.titleAlternatives) ? value.titleAlternatives.slice(0, 2) : [],
    selectionReason: String(value.selectionReason || ""),
    description, hashtags, tags, thumbnailText,
    thumbnailPrompt: String(value.thumbnailPrompt || "")
  };
}
