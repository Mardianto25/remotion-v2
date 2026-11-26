import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
const INPUT = path.resolve("out/analytics/latest-snapshot.json");
const OUTPUT = path.resolve("out/analytics/recommendations.json");
const MARKDOWN = path.resolve("out/analytics/report.md");
async function main() {
  const snapshot = JSON.parse(await fs.readFile(INPUT, "utf8"));
  const usable = snapshot.videos.filter(video => video.youtube?.status === "ok");
  const metrics = usable.map(video => ({
    title: video.title, theme: video.theme, ageHours: video.ageHours,
    current: video.youtube.current, day1: video.youtube.day1, day7: video.youtube.day7, facebook: video.facebook
  }));
  let recommendations;
  if (!usable.length) {
    recommendations = {
      generatedAt: new Date().toISOString(), mode: "waiting_for_metrics",
      summary: "Belum ada data YouTube Analytics yang dapat dianalisis. Periksa izin OAuth yt-analytics.readonly dan jalankan collector kembali.",
      dataLimitations: ["Belum ada metrik video yang berhasil diambil."],
      recommendations: ["Tambahkan scope https://www.googleapis.com/auth/yt-analytics.readonly pada OAuth consent dan buat refresh token analytics.", "Pastikan video sudah terdaftar dan telah dipublikasikan.", "Jalankan ulang workflow analytics setelah secret diperbarui."],
      topPerformers: [], nextTopics: []
    };
  } else if (!process.env.GEMINI_API_KEY) {
    recommendations = {
      generatedAt: new Date().toISOString(), mode: "fallback",
      summary: "Analisis AI belum dijalankan karena GEMINI_API_KEY tidak tersedia.",
      recommendations: [
        "Pastikan minimal 24 jam data performa terkumpul sebelum membandingkan video.",
        "Bandingkan averageViewDuration dan views pada kelompok umur publikasi yang sama.",
        "Uji variasi hook 2-3 detik pertama tanpa mengubah tema utama secara bersamaan."
      ], nextTopics: []
    };
  } else {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const models = (process.env.GEMINI_MODELS || "gemini-2.5-flash,gemini-flash").split(",").map(x => x.trim()).filter(Boolean);
    const prompt = [
      "Kamu adalah analis performa konten video pendek berbahasa Indonesia.",
      "Fokus channel: renungan dan motivasi Islami dengan visual 3D cinematic.",
      "Gunakan hanya angka yang tersedia. Jangan menyimpulkan sebab-akibat dari data kecil.",
      "Bandingkan day1 hanya dengan day1 dan day7 hanya dengan day7. Jangan bandingkan video yang belum mencapai umur pengamatan sama.",
      "Jika data kurang, nyatakan keterbatasannya. Jangan mengarang angka, ayat, hadis, atau klaim agama.",
      "Berikan rekomendasi praktis untuk hook, tema, durasi, dan CTA. Hasilkan 5 ide topik berikutnya.",
      "Balas JSON murni: {\"summary\":\"...\",\"dataLimitations\":[\"...\"],\"recommendations\":[\"...\"],\"topPerformers\":[{\"title\":\"...\",\"reason\":\"...\"}],\"nextTopics\":[{\"title\":\"...\",\"angle\":\"...\",\"hook\":\"...\"}]}",
      "DATA:\n" + JSON.stringify(metrics)
    ].join("\n\n");
    let lastError;
    for (const model of [...new Set(models)]) {
      try {
        const response = await ai.models.generateContent({ model, contents: prompt });
        const raw = String(response.text || "").trim()
          .replace(new RegExp("^\\x60{3}json\\s*", "i"), "")
          .replace(new RegExp("^\\x60{3}\\s*", "i"), "")
          .replace(new RegExp("\\s*\\x60{3}$"), "");
        recommendations = { generatedAt: new Date().toISOString(), model, mode: "ai", ...JSON.parse(raw) };
        break;
      } catch (error) { lastError = error; console.warn("[Analyzer] Model " + model + " gagal: " + error.message); }
    }
    if (!recommendations) throw new Error("AI Analyzer gagal: " + (lastError?.message || "model tidak tersedia"));
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(recommendations, null, 2) + "\n", "utf8");
  const lines = [
    "# AI Content Performance Report", "",
    "- Waktu pengambilan: " + snapshot.collectedAt,
    "- Jumlah video: " + snapshot.videos.length,
    "- Video dengan data YouTube: " + usable.length, "",
    "## Ringkasan", "", recommendations.summary || "Belum ada ringkasan.", "",
    "## Rekomendasi", "", ...(recommendations.recommendations || []).map(item => "- " + item), "",
    "## Ide Konten Berikutnya", "",
    ...(recommendations.nextTopics || []).map((item, index) => (index + 1) + ". **" + item.title + "** — " + item.angle + "\n   Hook: " + item.hook), "",
    "## Ketersediaan Data", "",
    ...snapshot.videos.map(video => "- **" + video.title + "**: YouTube " + video.youtube.status + (video.youtube.error ? " (" + video.youtube.error + ")" : "") + "; Facebook " + video.facebook.status), "",
    "> Catatan: metrik hari-1 dan hari-7 baru tersedia setelah jendela pengamatan tercapai. Facebook Insights bergantung pada izin dan metrik yang tersedia untuk objek post."
  ];
  await fs.writeFile(MARKDOWN, lines.join("\n") + "\n", "utf8");
  console.log("[Analyzer] Report: " + MARKDOWN);
}
main().catch(error => { console.error("[Analytics Analyzer Error]", error); process.exit(1); });
