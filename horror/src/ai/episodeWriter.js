import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
function parseJson(raw) {
  const fence = String.fromCharCode(96).repeat(3);
  const text = String(raw || "").replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "").replace(new RegExp("\\s*" + fence + "$"), "").trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini tidak mengembalikan JSON naskah episode.");
    return JSON.parse(text.slice(start, end + 1));
  }
}
function normalizeEpisode(value, episodeNumber, planEpisode, genre) {
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  let narration = String(value.narration || scenes.map(scene => scene.narration || "").join("\n\n")).trim();
  if (!narration) throw new Error("Naskah episode kosong.");
  if (scenes.length < 5 || scenes.length > 8) throw new Error("Episode Shorts harus memiliki 5-8 scene.");
  const normalizedScenes = scenes.map((scene, index) => ({
    id: scene.id ?? index + 1,
    heading: String(scene.heading || scene.title || "Adegan " + (index + 1)),
    narration: String(scene.narration || "").trim(),
    visualPrompt: String(scene.visualPrompt || scene.imagePrompt || "").trim(),
    searchQuery: String(scene.searchQuery || scene.keyword || "").trim(),
    mood: String(scene.mood || "suspense")
  }));
  if (normalizedScenes.some(scene => !scene.narration || !scene.visualPrompt)) throw new Error("Setiap scene wajib memiliki narration dan visualPrompt.");
  const joined = normalizedScenes.map(scene => scene.narration).join(" ").replace(/\s+/g, " ").trim();
  const full = narration.replace(/\s+/g, " ").trim();
  if (joined !== full) {
    console.warn("[episode] Naskah utama berbeda dari gabungan scene. Menggunakan gabungan scene sebagai narasi kanonik agar audio, subtitle, dan visual sinkron.");
    narration = joined;
  }
  const wordCount = narration.split(/\s+/).filter(Boolean).length;
  // Panjang naskah tidak lagi menjadi hard validation; durasi ditentukan oleh kebutuhan cerita.
  return {
    genre: String(value.genre || genre || "storytelling"),
    episodeNumber, title: String(value.title || planEpisode.title || "Episode " + episodeNumber),
    description: String(value.description || planEpisode.logline || ""),
    genre: String(value.genre || "storytelling"),
    category: String(value.category || value.genre || "Storytelling"),
    disclaimer: String(value.disclaimer || "Cerita fiksi untuk hiburan. Kemiripan dengan kejadian atau tokoh nyata tidak disengaja."),
    hook: String(value.hook || planEpisode.openingHook || ""),
    mainConflict: String(value.mainConflict || planEpisode.mainConflict || ""),
    revelation: String(value.revelation || planEpisode.turningPoint || ""),
    cliffhanger: String(value.cliffhanger || planEpisode.cliffhanger || ""),
    storySummary: String(value.storySummary || planEpisode.logline || ""),
    narration, wordCount, scenes: normalizedScenes,
    continuityUpdate: value.continuityUpdate || { canonEvents: [], characterStates: [], unresolvedThreads: [], resolvedThreads: [] }
  };
}
export async function writeEpisode(input) {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY belum diatur.");
  const { seriesBible, characters, worldRules, episodePlan, previousEpisodes = [], continuityLedger, episodeNumber, revisionNotes = "" } = input;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const previousSummaries = previousEpisodes.map(item => ({
    episodeNumber: item.episodeNumber, title: item.title, storySummary: item.storySummary,
    ending: item.cliffhanger, canonEvents: item.continuityUpdate?.canonEvents || []
  }));
  const prompt = [
    "Anda adalah penulis utama serial untuk Ruang Cerita Indonesia. Ikuti genre, tone, sudut pandang, dan aturan dunia dari series bible. Jangan otomatis menambahkan unsur horor.",
    "Tulis HANYA episode nomor " + episodeNumber + " dari season 8 episode. Jangan menulis episode lain.",
    "SERIES BIBLE:\n" + JSON.stringify(seriesBible, null, 2),
    "CHARACTER BIBLE:\n" + JSON.stringify(characters, null, 2),
    "WORLD RULES:\n" + JSON.stringify(worldRules, null, 2),
    "RANCANGAN EPISODE INI:\n" + JSON.stringify(episodePlan, null, 2),
    "EPISODE SEBELUMNYA:\n" + JSON.stringify(previousSummaries, null, 2),
    "CONTINUITY LEDGER:\n" + JSON.stringify(continuityLedger, null, 2),
    "CATATAN REVISI EDITOR:\n" + (revisionNotes || "Tidak ada. Buat draft pertama terbaik."),
    "GAYA: narasi orang kedua menggunakan 'kamu', seolah penonton mengalami langsung kejadian. Bahasa Indonesia luwes, sederhana, emosional, tidak seperti esai. Hindari pembukaan channel, salam, ajakan subscribe di awal, dan eksposisi panjang.",
    "RETENTION: kalimat pertama berupa cold open spesifik; sebelum 30 detik penonton memahami konflik dan taruhan; setiap 20-35 detik ada informasi baru, keputusan, bahaya, perubahan tujuan, atau pertanyaan; setiap adegan mengubah situasi; dialog singkat dan fungsional; hindari repetisi dan filler; berikan payoff kecil di episode ini; akhiri dengan cliffhanger yang berasal dari kejadian, bukan sekadar kata bersambung.",
    "DURASI: ini YouTube Shorts vertikal dengan durasi audio final maksimal 60 detik. Tulis narasi bahasa Indonesia sekitar 100-125 kata (target 45-55 detik pada kecepatan narasi normal), ringkas dan langsung ke konflik. Gunakan tepat 5-8 scene. Jangan membuat intro channel, outro panjang, atau CTA. Cerita harus memiliki satu mini-arc yang terasa selesai sebagian, lalu cliffhanger kuat. Audio tidak boleh melebihi 60 detik. Narasi lengkap dan gabungan scene.narration harus sama persis, urut, tanpa kalimat hilang/tambahan/parafrase.",
    "KONTINUITAS: jangan mengubah fakta episode sebelumnya, jangan mengubah karakter atau aturan dunia, jangan mengulang hook/plot twist. Payoff utama mengikuti series bible dan boleh terjawab di episode 8. Jawab sebagian pertanyaan lama dan tanam pertanyaan baru bila sesuai genre.",
    "VISUAL: setiap visualPrompt berbahasa Inggris dan menggambarkan tepat momen scene. Jelaskan subjek, aksi, lokasi, komposisi kamera, pencahayaan, suasana, dan detail karakter; jangan mengunci prompt ke gaya 2D, anime, atau 3D karena renderer akan menerapkan visual style yang dipilih pengguna. Komposisi portrait vertical 9:16, subject framed for mobile screen, no text/logo/watermark; visual mood and subject matter must fit the selected genre. Tempel visualBible karakter yang muncul secara konsisten dari Character Bible. FLUX.1 Schnell adalah text-to-image; konsistensi dipandu prompt teks, bukan jaminan image reference.",
    "JSON valid tanpa markdown dengan struktur:",
    "{\"title\":\"...\",\"description\":\"...\",\"hook\":\"...\",\"mainConflict\":\"...\",\"revelation\":\"...\",\"cliffhanger\":\"...\",\"storySummary\":\"...\",\"disclaimer\":\"...\",\"narration\":\"naskah lengkap\",\"scenes\":[{\"id\":1,\"heading\":\"...\",\"narration\":\"potongan verbatim dari narration\",\"visualPrompt\":\"English cinematic visual prompt including consistent character details, portrait 9:16\",\"searchQuery\":\"keyword English untuk fallback\",\"mood\":\"...\"}],\"continuityUpdate\":{\"canonEvents\":[\"...\"],\"characterStates\":[{\"characterId\":\"char-01\",\"state\":\"...\"}],\"unresolvedThreads\":[\"...\"],\"resolvedThreads\":[\"...\"]}}",
    "Judul episode harus kuat dan spesifik, bukan sekadar Episode " + episodeNumber + "."
  ].join("\n");
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  return normalizeEpisode(parseJson(response.text), episodeNumber, episodePlan, seriesBible.genre);
}
