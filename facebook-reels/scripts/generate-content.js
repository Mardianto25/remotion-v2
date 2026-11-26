import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const outputDir = path.resolve("out/facebook-reels");
const topic = String(process.env.REELS_TOPIC || "Ketika doa terasa belum dijawab").trim();
const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";

function extractJson(text) {
  return String(text || "").trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum tersedia.");
  await fs.mkdir(outputDir, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = [
    "Tulis naskah video renungan dan motivasi Islami berbahasa Indonesia untuk Facebook Reels.",
    "Durasi target 30 sampai 45 detik. Gunakan bahasa Indonesia sehari-hari yang hangat, natural, tidak kaku, dan mudah dipahami.",
    "Alur WAJIB: opening 0-3 detik berupa kalimat emosional yang menghentikan scroll; conflict 3-15 detik berisi masalah hidup yang relatable; peak 15-30 detik berisi sudut pandang baru dan pesan Islami; closing 30-45 detik berupa kalimat reflektif yang membekas.",
    "Buat tepat 6 segmen: phase opening tepat 1 segmen, conflict tepat 2 segmen, peak tepat 2 segmen, closing tepat 1 segmen. Setiap segmen harus menjadi kalimat/frasa utuh yang enak diucapkan.",
    "Total naskah sekitar 75-95 kata. Jangan menulis arahan kamera atau label fase ke dalam teks narasi.",
    "Jangan mengarang ayat Al-Qur'an, hadis, nomor surah, atau kutipan ulama. Jika tidak yakin sumbernya, sampaikan pesan umum tanpa atribusi.",
    "Hindari janji bahwa doa pasti dikabulkan sesuai waktu yang kita inginkan. Jangan menghakimi orang yang sedang kesulitan.",
    "Setiap visualPrompt harus mendeskripsikan satu adegan 3D cinematic vertikal yang benar-benar menggambarkan segmen terkait. Gunakan karakter utama yang sama: pria Muslim Indonesia fiktif usia awal 30-an, kulit sawo matang hangat, rambut hitam pendek rapi, janggut tipis, tunik abu-abu arang sederhana. Jangan tampilkan tulisan di gambar.",
    "Topik video: " + topic,
    "Kembalikan JSON valid saja dengan struktur:",
    '{"title":"judul singkat","segments":[{"phase":"opening","text":"narasi","visualPrompt":"deskripsi adegan visual"}]}',
    "Nilai phase hanya boleh opening, conflict, peak, atau closing."
  ].join("\n");
  const response = await ai.models.generateContent({
    model, contents: prompt, config: { responseMimeType: "application/json" }
  });
  const content = JSON.parse(extractJson(response.text));
  if (!Array.isArray(content.segments) || content.segments.length !== 6) {
    throw new Error("Generator harus menghasilkan tepat 6 segmen.");
  }
  const allowedPhases = new Set(["opening", "conflict", "peak", "closing"]);
  const phaseCounts = { opening: 0, conflict: 0, peak: 0, closing: 0 };
  for (const [index, segment] of content.segments.entries()) {
    if (!allowedPhases.has(segment.phase) || !String(segment.text || "").trim() ||
        !String(segment.visualPrompt || "").trim()) {
      throw new Error("Segmen " + (index + 1) + " tidak lengkap atau phase tidak valid.");
    }
    phaseCounts[segment.phase] += 1;
  }
  if (phaseCounts.opening !== 1 || phaseCounts.conflict !== 2 ||
      phaseCounts.peak !== 2 || phaseCounts.closing !== 1) {
    throw new Error("Distribusi phase harus opening 1, conflict 2, peak 2, closing 1.");
  }
  const transcript = content.segments.map(segment => segment.text.trim()).join(" ");
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  if (wordCount < 55 || wordCount > 115) {
    throw new Error("Panjang naskah " + wordCount + " kata di luar batas aman (55-115).");
  }
  content.title = String(content.title || "Renungan Hari Ini").trim().slice(0, 90);
  content.topic = topic;
  content.wordCount = wordCount;
  await fs.writeFile(path.join(outputDir, "content.json"), JSON.stringify(content, null, 2) + "\n");
  await fs.writeFile(path.join(outputDir, "transcript.txt"), transcript + "\n");
  console.log("[Content] Naskah berhasil dibuat: " + wordCount + " kata.");
}
main().catch(error => { console.error("[Facebook Reels Content]", error); process.exit(1); });
