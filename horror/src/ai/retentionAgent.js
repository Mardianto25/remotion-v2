import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
function parseJson(raw) {
  const fence = String.fromCharCode(96).repeat(3);
  const text = String(raw || "").replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "").replace(new RegExp("\\s*" + fence + "$"), "").trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Retention Agent tidak mengembalikan JSON.");
    return JSON.parse(text.slice(start, end + 1));
  }
}
export async function reviewRetention(story, episodePlan) {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = [
    "Anda adalah editor retention YouTube yang kritis. Evaluasi naskah serial sesuai genre yang dipilih. Jangan memuji secara basa-basi dan jangan memberi skor tinggi hanya karena tata bahasa rapi.",
    "Episode plan:\n" + JSON.stringify(episodePlan, null, 2),
    "Naskah:\n" + story.narration,
    "Hook:\n" + story.hook,
    "Cliffhanger:\n" + story.cliffhanger,
    "Nilai total 100 dengan bobot: hook 20, curiosity gaps/progres informasi 20, escalation/ketegangan 20, karakter dan emosi 15, payoff/twist 15, cliffhanger 10.",
    "Periksa: apakah 30 detik pertama langsung menarik; apakah ada bagian bertele-tele; apakah informasi diulang; apakah setiap scene mengubah situasi; apakah konflik mendapat payoff; apakah ending kuat tanpa clickbait.",
    "Beri masalah konkret dengan lokasi/kutipan, dampak pada penonton, dan instruksi revisi. Jangan menulis ulang naskah.",
    "JSON valid saja: {\"score\":0,\"scores\":{\"hook\":0,\"curiosity\":0,\"escalation\":0,\"characterEmotion\":0,\"payoffTwist\":0,\"cliffhanger\":0},\"strengths\":[\"...\"],\"issues\":[{\"location\":\"...\",\"quote\":\"...\",\"problem\":\"...\",\"fix\":\"...\"}],\"revisionBrief\":\"instruksi revisi maksimal 8 poin\",\"verdict\":\"revise|pass\"}"
  ].join("\n");
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  const review = parseJson(response.text);
  const score = Math.max(0, Math.min(100, Number(review.score) || 0));
  return { ...review, score, verdict: score >= 85 ? "pass" : "revise", reviewedAt: new Date().toISOString() };
}
