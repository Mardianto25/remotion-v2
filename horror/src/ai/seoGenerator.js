import { GoogleGenAI } from "@google/genai";
import { CHANNEL_NAME, config } from "../config.js";
import { generateGeminiContent } from "./geminiFallback.js";

function parseJson(text) {
  const clean = String(text || "").replace(/^\x60{3}json\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini tidak mengembalikan JSON metadata SEO.");
    return JSON.parse(clean.slice(start, end + 1));
  }
}

function fallbackSeo(story, topic, isLong = false) {
  const genre = String(story.genre || story.category || process.env.STORY_GENRE || "storytelling");
  const baseTitle = String(story.title || topic || "Cerita " + genre).trim();
  const episodePrefix = Number.isInteger(Number(story.episodeNumber)) && Number(story.episodeNumber) > 0 ? "EPS " + String(Number(story.episodeNumber)).padStart(2, "0") + " | " : "";
  const title = (episodePrefix + baseTitle).slice(0, isLong ? 90 : 60);
  const tags = ["cerita " + genre, "storytelling Indonesia", "cerita Indonesia", "Ruang Cerita Indonesia", isLong ? "video cerita panjang" : "video shorts"];
  const hashtags = isLong ? ["#CeritaIndonesia", "#Storytelling", "#" + genre.replace(/[^\p{L}\p{N}]/gu, "")] : ["#CeritaIndonesia", "#Shorts", "#" + genre.replace(/[^\\p{L}\\p{N}]/gu, "")];
  const scenePrompt = Array.isArray(story.scenes) ? story.scenes.slice(0, 2).map(x => x.visualPrompt || x.heading).filter(Boolean).join("; ") : "";
  const description = [
    String(story.description || ("Sebuah cerita " + genre + ": " + title + ".")).trim(),
    "",
    story.disclaimer || "Cerita ini merupakan fiksi dan dramatisasi untuk hiburan.",
    "",
    "Ikuti " + CHANNEL_NAME + " untuk storytelling, cerita, dan konten menarik lainnya.",
    "",
    hashtags.join(" ")
  ].join("\n").slice(0, 4900);
  return {
    title, titleAlternatives: [], selectionReason: "Metadata dibuat menggunakan template lokal karena Gemini API sedang mencapai kuota.",
    description, hashtags, tags, thumbnailText: baseTitle.split(/\s+/).slice(0, 5).join(" ").slice(0, 48),
    thumbnailPrompt: "Cinematic " + genre + " story cover image, " + (isLong ? "landscape 16:9" : "portrait vertical 9:16") + ", visual style consistent with the selected episode style. " + (scenePrompt || title) + ". One clear focal subject, genre-appropriate atmosphere, dramatic cinematic lighting, empty space for thumbnail text, no text, no logo, no watermark."
  };
}

export async function generateSeo(story, topic, options = {}) {
  const isLong = options.format === "long";
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const genre = String(story.genre || story.category || process.env.STORY_GENRE || "storytelling");
  const prompt = `Anda adalah YouTube packaging agent senior untuk channel Indonesia "${CHANNEL_NAME}". Tugas Anda bukan sekadar mengisi SEO, tetapi memilih kemasan video yang paling membuat penonton target ingin mengeklik tanpa menipu.
Genre konten: ${genre}. Analisis keseluruhan premis, konflik, emosi, lokasi, dan payoff cerita. Jangan otomatis memakai keyword horor jika genre bukan horor. Buat 3 kandidat judul secara internal, nilai masing-masing dari sisi rasa penasaran, kejelasan, relevansi dengan cerita, dan naturalitas bahasa Indonesia. Pilih satu pemenang.
${isLong ? "Buat packaging untuk video panjang YouTube standar, bukan Shorts. Pilih judul natural maksimal 90 karakter yang mengangkat konflik utama. Buat 2-4 kata untuk teks thumbnail. Optimalkan CTR dengan komposisi landscape 16:9, focal subject jelas, ekspresi kuat, kontras dan ruang aman untuk overlay judul." : "Buat packaging khusus YouTube Shorts, bukan video panjang. Pilih judul yang terasa natural di feed Shorts, maksimal 60 karakter, langsung mengangkat konflik atau konsekuensi paling menarik dari cerita, memancing rasa ingin tahu tanpa clickbait palsu. Buat 2-4 kata untuk teks cover sebagai hook visual yang melengkapi judul. Optimalkan CTR melalui satu momen emosional/konflik yang mudah dipahami dalam 1 detik, ekspresi tokoh kuat, focal subject besar, kontras jelas, dan komposisi portrait 9:16 untuk layar HP."}
${isLong ? "Judul maksimal 90 karakter untuk video panjang." : "Judul maksimal 60 karakter agar ringkas di feed Shorts."} Pilih judul spesifik dan memancing rasa ingin tahu sesuai konflik cerita. Hindari judul generik, keyword stuffing, kapital berlebihan, dan clickbait yang tidak dibayar oleh isi cerita. Jangan mengklaim kisah nyata atau fakta yang tidak didukung materi.
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
    const response = await generateGeminiContent(ai, {
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    value = parseJson(response.text);
  } catch (error) {
    console.warn("[seo] Gemini tidak tersedia/kuota habis. Menggunakan metadata lokal:", error.message);
    return fallbackSeo(story, topic, isLong);
  }
  const baseTitle = String(value.title || story.title || topic).trim();
  const episodePrefix = Number.isInteger(Number(story.episodeNumber)) && Number(story.episodeNumber) > 0 ? "EPS " + String(Number(story.episodeNumber)).padStart(2, "0") + " | " : "";
  const title = (episodePrefix + baseTitle).slice(0, isLong ? 90 : 60);
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
  const description = [baseDescription, "", disclaimer, "", `Ikuti ${CHANNEL_NAME} untuk cerita dan konten menarik lainnya.`, "", hashtags.join(" ")].join("\n").slice(0, 4900);
  const thumbnailText = String(value.thumbnailText || title).trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 28);
  return {
    title, titleAlternatives: Array.isArray(value.titleAlternatives) ? value.titleAlternatives.slice(0, 2) : [],
    selectionReason: String(value.selectionReason || ""),
    description, hashtags, tags, thumbnailText,
    thumbnailPrompt: String(value.thumbnailPrompt || "")
  };
}
