import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const outputPath = path.resolve("out/facebook-reels/metadata.json");
const contentPath = path.resolve("out/facebook-reels/content.json");
const transcriptPath = path.resolve("out/facebook-reels/transcript.txt");

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum tersedia.");
  const content = JSON.parse(await fs.readFile(contentPath, "utf8"));
  const transcript = (await fs.readFile(transcriptPath, "utf8")).trim();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
    contents: [
      "Buat metadata untuk Facebook Reels dari video renungan Islami berikut.",
      "Kembalikan JSON valid saja: {\"page\":{\"title\":\"...\",\"caption\":\"...\",\"hashtags\":[\"#...\"]},\"personal\":{\"title\":\"...\",\"caption\":\"...\",\"hashtags\":[\"#...\"]}}.",
      "Page: gaya kreator, hook kuat, caption natural dan tidak memaksa komentar.",
      "Personal: terasa seperti seseorang membagikan renungan yang menyentuh secara pribadi.",
      "Judul maksimal 90 karakter. Caption 1-3 kalimat. Masing-masing 3-5 hashtag relevan.",
      "Jangan menambahkan ayat, hadis, klaim agama, atau janji hasil yang tidak ada di naskah.",
      "Judul video: " + content.title,
      "Naskah: " + transcript
    ].join("\n"),
    config: { responseMimeType: "application/json" }
  });
  const raw = String(response.text || "").trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  const metadata = JSON.parse(raw);

  for (const key of ["page", "personal"]) {
    if (!metadata[key]?.caption || !Array.isArray(metadata[key]?.hashtags)) {
      throw new Error("Metadata " + key + " tidak lengkap.");
    }
    metadata[key].title = String(metadata[key].title || content.title).slice(0, 90);
    metadata[key].hashtags = [...new Set(metadata[key].hashtags
      .map(tag => String(tag).trim())
      .filter(tag => /^#[\p{L}\p{N}_]+$/u.test(tag)))].slice(0, 5);
    if (!metadata[key].hashtags.length) throw new Error("Hashtag " + key + " kosong.");
  }

  metadata.generatedAt = new Date().toISOString();
  metadata.distribution = {
    facebookPageReels: {
      title: metadata.page.title,
      description: [metadata.page.caption, "", metadata.page.hashtags.join(" ")].join("\n")
    },
    personalProfile: {
      title: metadata.personal.title,
      caption: [metadata.personal.caption, "", metadata.personal.hashtags.join(" ")].join("\n")
    }
  };
  await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2) + "\n");
  await fs.writeFile(path.resolve("out/facebook-reels/personal-profile-caption.txt"),
    metadata.distribution.personalProfile.title + "\n\n" +
    metadata.distribution.personalProfile.caption + "\n");
  console.log("[Metadata] Page Reels dan caption profil pribadi selesai dibuat.");
}
main().catch(error => { console.error("[Facebook Reels Metadata]", error); process.exit(1); });
