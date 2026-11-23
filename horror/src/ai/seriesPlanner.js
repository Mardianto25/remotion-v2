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
  const genre = String(options.genre || "mystery").trim();
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Anda adalah showrunner serial profesional untuk channel Ruang Cerita Indonesia.",
    "GENRE UTAMA season ini: " + genre + ". Seluruh premis, konflik, karakter, visual, tone, dan payoff wajib mengikuti genre ini. Jangan otomatis memasukkan hantu, pembunuhan, jumpscare, atau unsur horor kecuali genre yang dipilih memang horor.",
    "Buat rancangan SATU season tepat 8 episode dalam satu genre yang konsisten. Genre bisa berupa horor, misteri, Islami/inspiratif, drama keluarga, sejarah, legenda, petualangan, fantasi, edukasi, atau genre lain dari pengguna. Jangan mencampur genre secara acak.",
    "Konsep season dari pengguna: " + concept,
    "FORMAT: pilih sudut pandang dan struktur yang paling cocok untuk genre. Gunakan bahasa Indonesia luwes, visual, mudah dinarasikan, tidak seperti esai. Premis harus langsung mudah dipahami dan memiliki konflik atau tujuan utama yang jelas.",
    "Buat cerita orisinal dan sesuai genre. Jangan menyalin karya, tokoh, atau plot terkenal. Jika membahas agama, sejarah, atau fakta, hindari klaim yang tidak terverifikasi. Hindari gore eksplisit dan eksploitasi anak.",
    "STRUKTUR 8 EPISODE: susun arc yang sesuai genre. Episode 1 memperkenalkan premis dan hook; episode 2-3 mengembangkan karakter, tujuan dan konflik; episode 4 memberi perubahan besar; episode 5-6 memperdalam konsekuensi dan pilihan; episode 7 menyiapkan klimaks; episode 8 memberi payoff yang memuaskan dan benih cerita opsional untuk season berikutnya.",
    "PENTING: saat membuat season, rencanakan SELURUH MATERI PRODUKSI untuk kedelapan episode sekarang. Jangan hanya membuat outline. Untuk SETIAP episode tulis naskah final lengkap dan 5-8 scene final beserta narration per scene dan visualPrompt final. Tahap produksi episode berikutnya hanya membaca data ini dan DILARANG memanggil AI untuk menulis ulang episode atau membuat ulang scene.",
    "Setiap naskah episode adalah YouTube Shorts 45-55 detik, maksimal 60 detik, bahasa Indonesia sekitar 100-125 kata. Gabungan scenes[].narration harus sama persis dengan narration utama. Tiap scene wajib memiliki id berurutan, heading, narration verbatim, visualPrompt berbahasa Inggris dengan karakter/lokasi konsisten, searchQuery, dan mood.",
    "Setiap episode harus memiliki perkembangan atau konflik mini yang mendapat payoff, tetapi tetap mendorong penonton ke episode berikutnya. Variasikan ending; simpan payoff serial utama untuk episode 8.",
    "Series bible harus mencatat: logline, premis, janji cerita kepada penonton, sudut pandang, tone, konflik utama, payoff akhir, aturan dunia bila relevan, batas kemampuan tokoh, dan arc season.",
    "Karakter: buat 2-5 karakter penting. Berikan nama, peran, motivasi, sifat, hubungan, rahasia, serta deskripsi visual yang stabil (usia dewasa bila tidak wajib anak, bentuk wajah, rambut, pakaian, ciri khas, palet warna). Hindari terlalu banyak karakter.",
    "Visual bible: berikan deskripsi karakter dan lokasi yang konkret serta stabil. Jangan mengunci series bible ke gaya 2D, anime, atau 3D; visual renderer akan menerapkan style yang dipilih pengguna. FLUX.1 Schnell adalah text-to-image; jangan mengklaim dapat memakai image reference atau menjamin wajah identik. Konsistensi dijaga lewat deskripsi teks yang sama.",
    "KELUARAN JSON valid tanpa markdown dengan struktur tepat:",
    "{\"seriesTitle\":\"...\",\"genre\":\"" + genre + "\",\"logline\":\"...\",\"premise\":\"...\",\"audiencePromise\":\"...\",\"pointOfView\":\"sesuai genre\",\"tone\":\"...\",\"mainMystery\":\"konflik atau pertanyaan utama\",\"finalReveal\":\"payoff akhir\",\"seasonArc\":\"...\",\"worldRules\":[\"...\"],\"characters\":[{\"id\":\"char-01\",\"name\":\"...\",\"role\":\"...\",\"motivation\":\"...\",\"personality\":\"...\",\"secret\":\"...\",\"visualBible\":\"...\"}],\"episodes\":[{\"episodeNumber\":1,\"title\":\"...\",\"logline\":\"...\",\"openingHook\":\"...\",\"mainConflict\":\"...\",\"turningPoint\":\"...\",\"episodePayoff\":\"...\",\"cliffhanger\":\"...\",\"continuityQuestions\":[\"...\"],\"narration\":\"naskah lengkap 100-125 kata\",\"description\":\"...\",\"hook\":\"...\",\"revelation\":\"...\",\"storySummary\":\"...\",\"disclaimer\":\"...\",\"continuityUpdate\":{\"canonEvents\":[\"...\"],\"characterStates\":[{\"characterId\":\"char-01\",\"state\":\"...\"}],\"unresolvedThreads\":[\"...\"],\"resolvedThreads\":[\"...\"]},\"scenes\":[{\"id\":1,\"heading\":\"...\",\"narration\":\"potongan verbatim dari narration\",\"visualPrompt\":\"English portrait 9:16 prompt with consistent character and location details\",\"searchQuery\":\"...\",\"mood\":\"...\"}]}",
    "Pastikan episodeNumber berurutan 1 sampai 8, judul berbeda dan tidak generik. seasonId internal: " + seasonId
  ].join("\n");
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  const plan = parseJson(response.text);
  if (!Array.isArray(plan.episodes) || plan.episodes.length !== 8) throw new Error("Season Planner wajib menghasilkan tepat 8 episode.");
  plan.episodes = plan.episodes.map((episode, index) => ({ ...episode, episodeNumber: index + 1 }));
  for (const [index, episode] of plan.episodes.entries()) {
    if (!String(episode.narration || "").trim() || !Array.isArray(episode.scenes) || episode.scenes.length < 5 || episode.scenes.length > 8) throw new Error("Episode " + (index + 1) + " belum memiliki naskah final dan 5-8 scene.");
    const combined = episode.scenes.map(scene => String(scene.narration || "").trim()).join(" ").replace(/\s+/g, " ").trim();
    if (combined !== String(episode.narration).replace(/\s+/g, " ").trim()) throw new Error("Naskah episode " + (index + 1) + " tidak sama dengan gabungan narration scene.");
    if (episode.scenes.some(scene => !scene.heading || !scene.visualPrompt)) throw new Error("Setiap scene wajib memiliki heading dan visualPrompt.");
  }
  if (!Array.isArray(plan.characters) || !plan.characters.length) throw new Error("Season Planner tidak menghasilkan character bible.");
  if (!Array.isArray(plan.worldRules) || !plan.worldRules.length) throw new Error("Season Planner tidak menghasilkan world rules.");
  return { ...plan, genre, seasonId, createdAt: new Date().toISOString(), status: "planned" };
}
