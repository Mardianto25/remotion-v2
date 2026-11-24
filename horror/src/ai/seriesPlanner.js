import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { generateGeminiContent } from "./geminiFallback.js";
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
  const requestedTitle = String(options.seriesTitle || "").trim();
  const episodeCount = Number(options.episodeCount || 8);
  const format = options.format === "long" ? "long" : "shorts";
  const durationMinutes = Math.max(1, Math.min(8, Number(options.durationMinutes || 5)));
  const targetWords = format === "long" ? Math.round(durationMinutes * 130) : 115;
  const minWords = format === "long" ? Math.max(130, Math.round(targetWords * 0.88)) : 100;
  const maxWords = format === "long" ? Math.min(1150, Math.round(targetWords * 1.12)) : 125;
  const minScenes = format === "long" ? Math.max(6, Math.round(durationMinutes * 3)) : 5;
  const maxScenes = format === "long" ? Math.min(32, minScenes + 2) : 8;
  const aspectPrompt = format === "long" ? "landscape 16:9" : "portrait 9:16";
  if (![4, 6, 8, 10, 12].includes(episodeCount)) throw new Error("Jumlah episode harus 4, 6, 8, 10, atau 12.");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Anda adalah showrunner serial profesional untuk channel Ruang Cerita Indonesia.",
    "GENRE UTAMA season ini: " + genre + ". Seluruh premis, konflik, karakter, visual, tone, dan payoff wajib mengikuti genre ini. Jangan otomatis memasukkan hantu, pembunuhan, jumpscare, atau unsur horor kecuali genre yang dipilih memang horor.",
    "Buat rancangan SATU season tepat " + episodeCount + " episode dalam satu genre yang konsisten. Genre bisa berupa horor, misteri, Islami/inspiratif, drama keluarga, sejarah, legenda, petualangan, fantasi, edukasi, atau genre lain dari pengguna. Jangan mencampur genre secara acak.",
    "Judul serial yang diminta pengguna: " + (requestedTitle || "Buat judul yang paling sesuai dengan konsep") + ". Gunakan judul ini sebagai seriesTitle; jangan menggantinya dengan judul lain.",
    "Konsep season dari pengguna: " + concept,
    "FORMAT: pilih sudut pandang dan struktur yang paling cocok untuk genre. Gunakan bahasa Indonesia luwes, visual, mudah dinarasikan, tidak seperti esai. Premis harus langsung mudah dipahami dan memiliki konflik atau tujuan utama yang jelas.",
    "Buat cerita orisinal dan sesuai genre. Jangan menyalin karya, tokoh, atau plot terkenal. Jika membahas agama, sejarah, atau fakta, hindari klaim yang tidak terverifikasi. Hindari gore eksplisit dan eksploitasi anak.",
    "STRUKTUR " + episodeCount + " EPISODE: rancang arc serial lengkap untuk jumlah episode yang diminta. Episode awal memperkenalkan premis dan hook; bagian tengah mengembangkan karakter, konflik, konsekuensi dan turning point; episode-episode akhir membangun klimaks; episode terakhir wajib memberi payoff utama yang memuaskan dan boleh menyisakan benih cerita untuk season berikutnya. Atur pembagian beat secara proporsional terhadap jumlah episode, jangan memaksakan struktur 8 episode.",
    "PENTING: saat membuat season, rencanakan SELURUH MATERI PRODUKSI untuk seluruh " + episodeCount + " episode sekarang. Jangan hanya membuat outline. Untuk SETIAP episode tulis naskah final lengkap dan " + minScenes + "-" + maxScenes + " scene final beserta narration per scene dan visualPrompt final. Tahap produksi episode berikutnya hanya membaca data ini dan DILARANG memanggil AI untuk menulis ulang episode atau membuat ulang scene.",
    "Setiap naskah episode adalah video " + (format === "long" ? "Long Video landscape 16:9 berdurasi sekitar " + durationMinutes + " menit, " + minWords + "-" + maxWords + " kata" : "YouTube Shorts 45-55 detik, maksimal 60 detik, 100-125 kata") + ". Gabungan scenes[].narration harus sama persis dengan narration utama. Tiap scene wajib memiliki id berurutan, heading, narration verbatim, visualPrompt berbahasa Inggris dengan karakter/lokasi konsisten, searchQuery, dan mood.",
    "RETENTION DAN ENDING WAJIB: Episode 1 sampai " + (episodeCount - 1) + " TIDAK BOLEH berakhir hanya dengan tokoh termenung, berjalan pergi, suasana sedih, layar gelap, atau kalimat refleksi. Setiap episode non-finale wajib memiliki cliffhanger konkret: kejadian baru, ancaman, keputusan, pengungkapan rahasia, kedatangan seseorang, pesan/bukti tak terduga, atau konsekuensi yang langsung mengubah situasi. Kejadian tersebut harus muncul secara nyata di NARASI SCENE TERAKHIR dan divisualisasikan secara spesifik di visualPrompt scene terakhir. Jangan hanya menulis cliffhanger di metadata sementara scene terakhir tidak memperlihatkannya.",
    "Cliffhanger harus relevan dengan konflik dan genre, masuk akal berdasarkan kejadian sebelumnya, tidak terasa dipaksakan, serta membuka pertanyaan spesifik yang membuat penonton ingin menonton episode selanjutnya. Kalimat terakhir episode non-finale harus menjadi kejutan atau ancaman yang jelas, bukan CTA, bukan rangkuman moral, dan bukan sekadar 'bersambung'. Field cliffhanger harus menjelaskan kejadian yang benar-benar terjadi di scene terakhir dan nextEpisodeQuestion harus berisi pertanyaan yang timbul dari kejadian itu.",
    "KONTINUITAS WAJIB ANTAR-EPISODE: episode N+1 harus dimulai tepat dari situasi yang ditinggalkan episode N. Jangan melompat waktu, lokasi, konflik, atau kondisi karakter tanpa transisi yang dijelaskan di narasi. Scene pertama episode berikutnya harus memperlihatkan respons langsung terhadap kejadian cliffhanger sebelumnya sebelum masuk ke aktivitas/konflik baru. Jika episode sebelumnya berakhir dengan pintu didobrak dan antagonis datang membawa surat, episode berikutnya harus membuka dengan konfrontasi yang sama di lokasi dan waktu yang sama; jangan langsung melompat ke negosiasi/aktivitas lain. Pertahankan siapa hadir, posisi tokoh, benda yang sedang dipegang, kondisi tempat, ancaman, dan pertanyaan yang belum terjawab. Jangan mengulang cliffhanger sebagai ringkasan; lanjutkan aksinya. Setiap episode mulai nomor 2 wajib mengisi continuityBridge: previousEpisodeEnding (ringkasan kejadian terakhir episode sebelumnya), openingContinuation (aksi langsung yang melanjutkan adegan terakhir), timeAndLocation (waktu/lokasi pembuka yang konsisten), characterStatesAtOpening (kondisi tokoh yang hadir), carriedElements (benda/fakta/ancaman yang harus terbawa), unresolvedQuestion (pertanyaan yang harus mulai dijawab). Scene pertama harus mencerminkan openingContinuation dan tidak boleh bertentangan dengan field tersebut.",
    "Variasikan tipe cliffhanger sepanjang season dan jangan mengulang tipe yang sama berturut-turut. Bangun eskalasi; setiap ending harus meningkatkan taruhan atau mengubah pemahaman penonton. Episode terakhir (episode " + episodeCount + ") WAJIB menyelesaikan konflik utama dan membayar janji cerita season secara emosional/logis. Jangan menggantung konflik utama pada finale. Finale boleh memiliki teaser season berikutnya, tetapi harus opsional dan tidak mengurangi rasa tuntas.",

    "Series bible harus mencatat: logline, premis, janji cerita kepada penonton, sudut pandang, tone, konflik utama, payoff akhir, aturan dunia bila relevan, batas kemampuan tokoh, dan arc season.",
    "Karakter: buat 2-5 karakter penting. Berikan nama, peran, motivasi, sifat, hubungan, rahasia, serta deskripsi visual yang stabil (usia dewasa bila tidak wajib anak, bentuk wajah, rambut, pakaian, ciri khas, palet warna). Hindari terlalu banyak karakter.",
    "Visual bible: berikan deskripsi karakter dan lokasi yang konkret serta stabil. Jangan mengunci series bible ke gaya 2D, anime, atau 3D; visual renderer akan menerapkan style yang dipilih pengguna. FLUX.1 Schnell adalah text-to-image; jangan mengklaim dapat memakai image reference atau menjamin wajah identik. Konsistensi dijaga lewat deskripsi teks yang sama.",
    "KELUARAN JSON valid tanpa markdown dengan struktur tepat:",
    "{\"seriesTitle\":\"...\",\"genre\":\"" + genre + "\",\"logline\":\"...\",\"premise\":\"...\",\"audiencePromise\":\"...\",\"pointOfView\":\"sesuai genre\",\"tone\":\"...\",\"mainMystery\":\"konflik atau pertanyaan utama\",\"finalReveal\":\"payoff akhir\",\"seasonArc\":\"...\",\"worldRules\":[\"...\"],\"characters\":[{\"id\":\"char-01\",\"name\":\"...\",\"role\":\"...\",\"motivation\":\"...\",\"personality\":\"...\",\"secret\":\"...\",\"visualBible\":\"...\"}],\"episodes\":[{\"episodeNumber\":1,\"title\":\"...\",\"logline\":\"...\",\"openingHook\":\"...\",\"mainConflict\":\"...\",\"turningPoint\":\"...\",\"episodePayoff\":\"...\",\"endingType\":\"cliffhanger untuk episode non-finale, finale_resolution untuk episode terakhir\",\"cliffhanger\":\"kejadian konkret di scene terakhir\",\"nextEpisodeQuestion\":\"pertanyaan pemancing episode berikutnya; kosong untuk finale tanpa teaser\",\"continuityBridge\":{\"previousEpisodeEnding\":\"ringkasan akhir episode sebelumnya\",\"openingContinuation\":\"aksi langsung yang melanjutkan adegan terakhir\",\"timeAndLocation\":\"waktu dan lokasi pembuka yang sama\",\"characterStatesAtOpening\":[\"kondisi tokoh\"],\"carriedElements\":[\"benda/fakta/ancaman yang terbawa\"],\"unresolvedQuestion\":\"pertanyaan dari cliffhanger sebelumnya\"},\"seasonTeaser\":\"opsional, hanya untuk finale\",\"continuityQuestions\":[\"...\"],\"narration\":\"naskah lengkap sekitar " + minWords + "-" + maxWords + " kata\",\"description\":\"...\",\"hook\":\"...\",\"revelation\":\"...\",\"storySummary\":\"...\",\"disclaimer\":\"...\",\"continuityUpdate\":{\"canonEvents\":[\"...\"],\"characterStates\":[{\"characterId\":\"char-01\",\"state\":\"...\"}],\"unresolvedThreads\":[\"...\"],\"resolvedThreads\":[\"...\"]},\"scenes\":[{\"id\":1,\"heading\":\"...\",\"narration\":\"potongan verbatim dari narration\",\"visualPrompt\":\"English " + aspectPrompt + " prompt with consistent character/location and exact cliffhanger action when this is the final scene\",\"searchQuery\":\"...\",\"mood\":\"...\"}]}",
    "Pastikan episodeNumber berurutan 1 sampai " + episodeCount + ", jumlah episode tepat " + episodeCount + ", judul berbeda dan tidak generik. Untuk episode 1 continuityBridge boleh null atau berisi setup awal; untuk episode 2 sampai finale continuityBridge wajib lengkap dan scene pertama harus benar-benar melanjutkan episode sebelumnya. seasonId internal: " + seasonId
  ].join("\n");
  const response = await generateGeminiContent(ai, { contents: prompt, config: { responseMimeType: "application/json", maxOutputTokens: format === "long" ? 60000 : 30000 } });
  const plan = parseJson(response.text);
  if (!Array.isArray(plan.episodes) || plan.episodes.length !== episodeCount) throw new Error("Season Planner wajib menghasilkan tepat " + episodeCount + " episode.");
  plan.episodes = plan.episodes.map((episode, index) => ({ ...episode, episodeNumber: index + 1 }));
  for (const [index, episode] of plan.episodes.entries()) {
    if (!String(episode.narration || "").trim() || !Array.isArray(episode.scenes) || episode.scenes.length < minScenes || episode.scenes.length > maxScenes) throw new Error("Episode " + (index + 1) + " belum memiliki naskah final dan " + minScenes + "-" + maxScenes + " scene.");
    const combined = episode.scenes.map(scene => String(scene.narration || "").trim()).join(" ").replace(/\s+/g, " ").trim();
    if (combined !== String(episode.narration).replace(/\s+/g, " ").trim()) throw new Error("Naskah episode " + (index + 1) + " tidak sama dengan gabungan narration scene.");
    if (episode.scenes.some(scene => !scene.heading || !scene.visualPrompt)) throw new Error("Setiap scene wajib memiliki heading dan visualPrompt.");
    if (index > 0) {
      const bridge = episode.continuityBridge || {};
      const requiredBridge = ["previousEpisodeEnding", "openingContinuation", "timeAndLocation", "unresolvedQuestion"];
      const missingBridge = requiredBridge.filter(key => String(bridge[key] || "").trim().length < 12);
      if (missingBridge.length || !Array.isArray(bridge.characterStatesAtOpening) || !bridge.characterStatesAtOpening.length || !Array.isArray(bridge.carriedElements) || !bridge.carriedElements.length) {
        throw new Error("Episode " + (index + 1) + " continuityBridge belum lengkap: " + missingBridge.join(", "));
      }
      const firstScene = episode.scenes[0];
      if (String(firstScene.narration || "").trim().length < 30 || String(firstScene.visualPrompt || "").trim().length < 60) {
        throw new Error("Scene pembuka episode " + (index + 1) + " belum cukup spesifik untuk menyambung episode sebelumnya.");
      }
    }
    const finalEpisode = index === episodeCount - 1;
    const endingType = String(episode.endingType || "").trim();
    const lastScene = episode.scenes[episode.scenes.length - 1];
    if (!finalEpisode) {
      if (endingType !== "cliffhanger") throw new Error("Episode " + (index + 1) + " wajib memiliki endingType=cliffhanger.");
      if (String(episode.cliffhanger || "").trim().length < 20) throw new Error("Episode " + (index + 1) + " belum memiliki cliffhanger konkret.");
      if (String(episode.nextEpisodeQuestion || "").trim().length < 12) throw new Error("Episode " + (index + 1) + " belum memiliki pertanyaan pemancing episode berikutnya.");
      if (String(lastScene.narration || "").trim().length < 20) throw new Error("Scene terakhir episode " + (index + 1) + " belum menggambarkan kejadian cliffhanger.");
      if (String(lastScene.visualPrompt || "").trim().length < 40) throw new Error("Visual scene terakhir episode " + (index + 1) + " belum menggambarkan momen cliffhanger.");
    } else {
      if (endingType !== "finale_resolution") throw new Error("Episode finale wajib memiliki endingType=finale_resolution.");
      if (String(episode.episodePayoff || "").trim().length < 20) throw new Error("Episode finale belum memiliki payoff utama season yang tuntas.");
      if (String(lastScene.narration || "").trim().length < 20) throw new Error("Episode finale belum memiliki ending yang terasa tuntas.");
    }
  }
  if (!Array.isArray(plan.characters) || !plan.characters.length) throw new Error("Season Planner tidak menghasilkan character bible.");
  if (!Array.isArray(plan.worldRules) || !plan.worldRules.length) throw new Error("Season Planner tidak menghasilkan world rules.");
  if (episodeCount > 1) {
    const continuityInput = plan.episodes.slice(1).map((episode, index) => {
      const previous = plan.episodes[index];
      return {
        fromEpisode: previous.episodeNumber,
        previousEnding: {
          timeAndLocation: previous.scenes[previous.scenes.length - 1]?.heading || "",
          narration: previous.scenes[previous.scenes.length - 1]?.narration || "",
          cliffhanger: previous.cliffhanger || ""
        },
        toEpisode: episode.episodeNumber,
        bridge: episode.continuityBridge,
        openingScene: {
          heading: episode.scenes[0]?.heading || "",
          narration: episode.scenes[0]?.narration || "",
          visualPrompt: episode.scenes[0]?.visualPrompt || ""
        }
      };
    });
    const auditPrompt = [
      "Anda adalah continuity supervisor. Audit transisi setiap pasangan episode berikut secara ketat.",
      "PASS hanya jika opening episode berikutnya benar-benar melanjutkan kejadian terakhir episode sebelumnya secara kausal dan visual. Waktu, lokasi, karakter yang hadir, posisi, benda yang dibawa, ancaman dan kondisi fisik harus konsisten atau perubahan harus dijelaskan dengan transisi yang terlihat.",
      "FAIL jika episode baru melompat ke aktivitas/lokasi/waktu baru sebelum cliffhanger sebelumnya ditangani, mengabaikan karakter/objek penting, atau hanya mengulang ringkasan tanpa melanjutkan aksi.",
      "Nilai setiap transisi. JSON valid saja: {\"transitions\":[{\"fromEpisode\":1,\"toEpisode\":2,\"score\":0,\"pass\":false,\"issues\":[\"...\"],\"fix\":\"...\"}]}",
      "Transisi yang tidak jelas atau ada kontradiksi wajib pass=false. Jangan memberi PASS hanya karena karakter dan tema sama.",
      "TRANSITIONS:\n" + JSON.stringify(continuityInput, null, 2)
    ].join("\n");
    const auditResponse = await generateGeminiContent(ai, { contents: auditPrompt, config: { responseMimeType: "application/json" } });
    const audit = parseJson(auditResponse.text);
    if (!Array.isArray(audit.transitions) || audit.transitions.length !== episodeCount - 1) {
      throw new Error("Continuity audit tidak memeriksa semua transisi episode. Season plan tidak disimpan.");
    }
    const failed = audit.transitions.filter(item => item.pass !== true || Number(item.score) < 85 || (item.issues || []).length);
    if (failed.length) {
      const detail = failed.map(item => "Episode " + item.fromEpisode + " -> " + item.toEpisode + ": " + (item.issues || []).join("; ") + (item.fix ? " | Perbaikan: " + item.fix : "")).join(" || ");
      throw new Error("Continuity audit gagal. Season plan tidak disimpan agar cerita tidak terputus. " + detail);
    }
    plan.continuityAudit = { passed: true, transitions: audit.transitions, reviewedAt: new Date().toISOString() };
  }
  return { ...plan, seriesTitle: requestedTitle || plan.seriesTitle, genre, seasonId, createdAt: new Date().toISOString(), status: "planned", episodeCount, format, durationMinutes: format === "long" ? durationMinutes : null };
}
