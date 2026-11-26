import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const contentPath = path.resolve("out/facebook-reels/content.json");
const outputPath = path.resolve("public/facebook-reels/audio.wav");
const sampleRate = 24000;

function pcmToWav(pcm, rate) {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum tersedia.");
  const content = JSON.parse(await fs.readFile(contentPath, "utf8"));
  const narration = content.segments.map(segment => segment.text.trim()).join(" ");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = (process.env.GEMINI_TTS_MODELS ||
    "gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts")
    .split(",").map(value => value.trim()).filter(Boolean);
  let audioData;
  let selectedModel;
  let lastError;
  for (const model of models) {
    try {
      console.log("[Gemini TTS] Mencoba model " + model);
      const response = await ai.models.generateContent({
        model,
        contents: [{
          role: "user",
          parts: [{
            text: [
              "Speak in Indonesian (Bahasa Indonesia).",
              "Use one adult male narrator voice: warm, grounded, calm, deep, and sincere.",
              "Delivery style: emotional and heartfelt, like a reflective Islamic motivational narration.",
              "Start with a compelling but controlled emotional tone. Build intensity gently at the central message, then end softly and thoughtfully.",
              "Natural Indonesian pronunciation, clear articulation, moderate pace, meaningful pauses. Do not sound like a commercial announcer.",
              "Do not add, omit, translate, or paraphrase any words. Read only the narration below:",
              narration
            ].join(" ")
          }]
        }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Orus" } } }
        }
      });
      const parts = response.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find(part => part.inlineData?.data);
      if (!audioPart) throw new Error("Respons model tidak berisi audio.");
      audioData = Buffer.from(audioPart.inlineData.data, "base64");
      selectedModel = model;
      break;
    } catch (error) {
      lastError = error;
      console.warn("[Gemini TTS] " + model + " gagal: " + error.message);
    }
  }
  if (!audioData?.length) {
    throw new Error("Semua model TTS gagal: " + (lastError?.message || "audio kosong"));
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, pcmToWav(audioData, sampleRate));
  await fs.writeFile(path.resolve("out/facebook-reels/voice-info.json"), JSON.stringify({
    provider: "Gemini TTS", model: selectedModel, voice: "Orus",
    voiceCharacter: "adult male", delivery: "emotional", sampleRate,
    generatedAt: new Date().toISOString()
  }, null, 2) + "\n");
  console.log("[Gemini TTS] Audio WAV berhasil dibuat menggunakan " + selectedModel);
}
main().catch(error => { console.error("[Facebook Reels TTS]", error); process.exit(1); });
