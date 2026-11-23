import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
function parseJson(raw) {
  const fence = String.fromCharCode(96).repeat(3);
  const text = String(raw || "").replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "").replace(new RegExp("\\s*" + fence + "$"), "").trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini tidak mengembalikan JSON season plan.");
    return JSON.parse(text.slice(start, end + 1));
  }
}
export async function planSeason(concept, options = {}) {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY belum diatur.");
  const seasonId = options.seasonId || "season-01";
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Anda adalah showrunner serial POV Survival & Mystery Stories untuk channel Ruang Cerita Indonesia.",
    "Buat rancangan SATU season tepat 8 episode. Genre campuran: horror supernatural, zombie/apocalypse, survival, bencana, psychological thriller, misteri dan eksperimen rahasia. Satu season hanya boleh memiliki satu konflik utama dan satu aturan dunia yang konsisten; jangan mencampur genre secara acak.",
    "Konsep season dari pengguna: " + concept,
    "FORMAT: penonton adalah tokoh utama (POV orang kedua: kamu). Gunakan bahasa Indonesia luwes, visual, mudah dinarasikan, tidak seperti esai. Premis harus langsung mudah dipahami dan memiliki ancaman konkret.",
    "Buat cerita fiksi orisinal. Jangan menyalin karya, tokoh, atau plot terkenal. Hindari gore eksplisit dan eksploitasi anak. Jika latar sekolah atau anak digunakan, ancaman boleh menegangkan tetapi tanpa detail kekerasan grafis.",
    "STRUKTUR 8 EPISODE: 1 insiden pemicu dan hook kuat; 2 aturan dunia dan tujuan bertahan; 3 konflik meningkat; 4 mid-season twist yang mengubah dugaan; 5 rahasia/pengkhianatan; 6 titik terendah dan ancaman besar; 7 klimaks awal/persiapan final; 8 final showdown, payoff misteri utama, dan satu benih cerita opsional untuk season berikutnya.",
    "Setiap episode harus punya konflik mini yang mendapat payoff, tetapi menyisakan satu pertanyaan serial. Jangan membuat cliffhanger yang sama berulang-ulang. Jangan menyelesaikan misteri utama sebelum episode 8.",
    "Series bible harus mencatat: logline, premis, janji cerita kepada penonton, sudut pandang, tone, misteri utama, jawaban final yang sebenarnya, aturan dunia, batas kemampuan tokoh, dan arc season.",
    "Karakter: buat 2-5 karakter penting. Berikan nama, peran, motivasi, sifat, hubungan, rahasia, serta deskripsi visual yang stabil (usia dewasa bila tidak wajib anak, bentuk wajah, rambut, pakaian, ciri khas, palet warna). Hindari terlalu banyak karakter.",
    "Visual bible: berikan deskripsi karakter dan lokasi yang konkret serta stabil. Jangan mengunci series bible ke gaya 2D, anime, atau 3D; visual renderer akan menerapkan style yang dipilih pengguna. FLUX.1 Schnell adalah text-to-image; jangan mengklaim dapat memakai image reference atau menjamin wajah identik. Konsistensi dijaga lewat deskripsi teks yang sama.",
    "KELUARAN JSON valid tanpa markdown dengan struktur tepat:",
    "{\"seriesTitle\":\"...\",\"genre\":\"mixed\",\"logline\":\"...\",\"premise\":\"...\",\"audiencePromise\":\"...\",\"pointOfView\":\"orang kedua - kamu\",\"tone\":\"...\",\"mainMystery\":\"...\",\"finalReveal\":\"...\",\"seasonArc\":\"...\",\"worldRules\":[\"...\"],\"characters\":[{\"id\":\"char-01\",\"name\":\"...\",\"role\":\"...\",\"motivation\":\"...\",\"personality\":\"...\",\"secret\":\"...\",\"visualBible\":\"...\"}],\"episodes\":[{\"episodeNumber\":1,\"title\":\"...\",\"logline\":\"...\",\"openingHook\":\"...\",\"mainConflict\":\"...\",\"turningPoint\":\"...\",\"episodePayoff\":\"...\",\"cliffhanger\":\"...\",\"continuityQuestions\":[\"...\"]}]}",
    "Pastikan episodeNumber berurutan 1 sampai 8, judul berbeda dan tidak generik. seasonId internal: " + seasonId
  ].join("\n");
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  const plan = parseJson(response.text);
  if (!Array.isArray(plan.episodes) || plan.episodes.length !== 8) throw new Error("Season Planner wajib menghasilkan tepat 8 episode.");
  plan.episodes = plan.episodes.map((episode, index) => ({ ...episode, episodeNumber: index + 1 }));
  if (!Array.isArray(plan.characters) || !plan.characters.length) throw new Error("Season Planner tidak menghasilkan character bible.");
  if (!Array.isArray(plan.worldRules) || !plan.worldRules.length) throw new Error("Season Planner tidak menghasilkan world rules.");
  return { ...plan, seasonId, createdAt: new Date().toISOString(), status: "planned" };
}
