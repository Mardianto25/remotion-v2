import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
function parseJson(raw) {
  const fence = String.fromCharCode(96).repeat(3);
  const text = String(raw || "").replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "").replace(new RegExp("\\s*" + fence + "$"), "").trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Continuity Agent tidak mengembalikan JSON.");
    return JSON.parse(text.slice(start, end + 1));
  }
}
export async function reviewContinuity(story, context) {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Anda adalah script supervisor dan penjaga kontinuitas serial. Audit episode baru terhadap canon season. Prioritaskan kontradiksi fakta, karakter, lokasi, waktu, aturan dunia, petunjuk, dan misteri.",
    "Series bible:\n" + JSON.stringify(context.seriesBible, null, 2),
    "Characters:\n" + JSON.stringify(context.characters, null, 2),
    "World rules:\n" + JSON.stringify(context.worldRules, null, 2),
    "Previous episodes:\n" + JSON.stringify(context.previousEpisodes, null, 2),
    "Continuity ledger:\n" + JSON.stringify(context.continuityLedger, null, 2),
    "Episode baru:\n" + JSON.stringify({ title: story.title, narration: story.narration, cliffhanger: story.cliffhanger, continuityUpdate: story.continuityUpdate }, null, 2),
    "Periksa apakah episode baru bertentangan dengan peristiwa canon, mengubah karakter tanpa sebab, melanggar world rules, mengulang informasi, mengabaikan pertanyaan yang harus dibayar, membocorkan final reveal terlalu awal, atau menanam petunjuk tanpa fungsi.",
    "Beri score 0-100. Kontradiksi canon fatal harus membuat score di bawah 75. Jangan menganggap detail belum diketahui sebagai fakta. Jangan menambahkan canon yang tidak ada di naskah.",
    "JSON valid saja: {\"score\":0,\"contradictions\":[{\"location\":\"...\",\"canon\":\"...\",\"newVersion\":\"...\",\"fix\":\"...\"}],\"unresolvedThreads\":[\"...\"],\"resolvedThreads\":[\"...\"],\"revisionBrief\":\"...\",\"verdict\":\"pass|revise\"}"
  ].join("\n");
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  const review = parseJson(response.text);
  const score = Math.max(0, Math.min(100, Number(review.score) || 0));
  return { ...review, score, verdict: score >= 85 && !(review.contradictions || []).length ? "pass" : "revise", reviewedAt: new Date().toISOString() };
}
