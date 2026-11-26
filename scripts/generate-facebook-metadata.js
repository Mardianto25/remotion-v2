import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const transcriptPath = path.resolve("public/transcript.txt");
const outputPath = path.resolve("out/facebook-metadata.json");
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function cleanHashtags(value, max = 4) {
  const tags = String(value || "")
    .match(/#[\\p{L}\\p{N}_]+/gu) || [];
  return [...new Set(tags)].slice(0, max);
}

function normalize(data) {
  const page = data.facebook_page || {};
  const personal = data.facebook_personal || {};
  const title = String(page.title || "Renungan Islami Hari Ini").trim().slice(0, 100);
  const pageCaption = String(page.caption || "").trim();
  const personalCaption = String(personal.caption || "").trim();
  const pageHashtags = cleanHashtags(page.hashtags, 4);
  const personalHashtags = cleanHashtags(personal.hashtags, 4);

  if (!pageCaption || !personalCaption || !pageHashtags.length || !personalHashtags.length) {
    throw new Error("Metadata Facebook dari AI tidak lengkap.");
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "public/transcript.txt",
    facebook_page: {
      title,
      caption: pageCaption,
      hashtags: pageHashtags,
      description: [pageCaption, "", pageHashtags.join(" ")].join("\\n")
    },
    facebook_personal: {
      title: String(personal.title || title).trim().slice(0, 100),
      caption: personalCaption,
      hashtags: personalHashtags,
      readyToPost: [personalCaption, "", personalHashtags.join(" ")].join("\\n")
    }
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum tersedia untuk membuat metadata Facebook.");

  const transcript = (await fs.readFile(transcriptPath, "utf8")).replace(/\\s+/g, " ").trim();
  if (!transcript) throw new Error("transcript.txt kosong; metadata tidak dapat dibuat.");

  const ai = new GoogleGenAI({ apiKey });
  const models = (process.env.GEMINI_MODELS || "gemini-2.5-flash,gemini-flash")
    .split(",").map(value => value.trim()).filter(Boolean);

  const prompt = `
Buat metadata berbahasa Indonesia untuk video renungan/motivasi Islami berdasarkan transkrip berikut.
Jangan menambah klaim agama, kutipan ayat/hadis, atau janji hasil yang tidak ada di transkrip.
Jangan menyebut AI, aplikasi, proses otomatis, atau nama platform lain.
Gunakan bahasa natural, hangat, tidak clickbait berlebihan.
Buat dua versi yang berbeda namun tetap sesuai isi:
1) facebook_page: gaya halaman kreator, hook ringkas, ajak interaksi dengan wajar.
2) facebook_personal: gaya berbagi pribadi, lebih conversational dan terasa seperti status pribadi.
Untuk masing-masing, buat judul singkat, caption 1-3 kalimat, dan 2-4 hashtag relevan.
Jangan memakai hashtag generik yang tidak relevan.
Kembalikan JSON murni dengan bentuk:
{
  "facebook_page": {"title":"...", "caption":"...", "hashtags":["#..."]},
  "facebook_personal": {"title":"...", "caption":"...", "hashtags":["#..."]}
}
TRANSKRIP:
${transcript.slice(0, 12000)}
`;

  let lastError;
  for (const model of [...new Set(models)]) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt });
      const raw = String(response.text || "").trim()
        .replace(/^\`\`\`json\\s*/i, "")
        .replace(/^\`\`\`\\s*/i, "")
        .replace(/\\s*\`\`\`$/, "");
      const metadata = normalize(JSON.parse(raw));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2) + "\\n", "utf8");

      if (summaryPath) {
        const summary = [
          "## Metadata Facebook siap digunakan",
          "",
          "### Facebook Page",
          `**Judul:** ${metadata.facebook_page.title}`,
          "",
          metadata.facebook_page.description,
          "",
          "### Profil Facebook pribadi (siap salin)",
          `**Judul:** ${metadata.facebook_personal.title}`,
          "",
          metadata.facebook_personal.readyToPost,
          "",
          "> Video yang sama dapat dibagikan ke Page dan profil milik sendiri jika kamu memiliki hak atas seluruh materi di dalamnya."
        ].join("\\n");
        await fs.appendFile(summaryPath, summary + "\\n", "utf8");
      }

      console.log("[Metadata] facebook-metadata.json berhasil dibuat.");
      console.log("[Metadata] Caption profil pribadi ditampilkan pada GitHub Actions Summary.");
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[Metadata] Model ${model} gagal: ${error.message}`);
    }
  }
  throw new Error(`Gagal membuat metadata Facebook: ${lastError?.message || "model tidak tersedia"}`);
}

main().catch(error => {
  console.error("[Facebook Metadata Error]", error);
  process.exit(1);
});
