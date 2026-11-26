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

async function generateModernTts(ai, model, narration) {
  const interaction = await ai.interactions.create({
    model,
    input: [{
      type: "user_input",
      content: [{
        type: "text",
        text: narration,
        annotations: [{
          type: "speech_metadata",
          style: "Adult male Indonesian narrator. Deep, warm, grounded and sincere. Emotional and heartfelt Islamic reflection; begin with restrained emotional urgency, build gently through the central message, then close softly and thoughtfully. Clear natural Indonesian pronunciation, moderate pace, with meaningful pauses."
        }]
      }]
    }],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: [{ voice: "Orus" }]
    }
  });

  if (!interaction.output_audio?.data) {
    throw new Error("Interactions API tidak mengembalikan audio.");
  }
  // Gemini 3.8 unary TTS returns a complete WAV container.
  return Buffer.from(interaction.output_audio.data, "base64");
}

async function generateLegacyTts(ai, narration) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{
      role: "user",
      parts: [{
        text: [
          "Speak in Indonesian using an adult male voice.",
          "The delivery must be warm, grounded, sincere, emotional and heartfelt.",
          "Use a moderate pace, clear pronunciation, and a soft reflective ending.",
          "Read only the following verbatim narration:",
          narration
        ].join(" ")
      }]
    }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Orus" }
        }
      }
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find(part => part.inlineData?.data);
  if (!audioPart) throw new Error("GenerateContent TTS tidak mengembalikan audio.");
  const pcm = Buffer.from(audioPart.inlineData.data, "base64");
  return pcmToWav(pcm, sampleRate);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum tersedia.");
  const content = JSON.parse(await fs.readFile(contentPath, "utf8"));
  const narration = content.segments.map(segment => segment.text.trim()).join(" ");
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { apiVersion: "v1beta" }
  });
  const models = (process.env.GEMINI_TTS_MODELS ||
    "gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts")
    .split(",").map(value => value.trim()).filter(Boolean);

  let wavData;
  let selectedModel;
  let lastError;

  for (const model of models) {
    try {
      console.log("[Gemini TTS] Mencoba model " + model);
      wavData = model === "gemini-2.5-flash-preview-tts"
        ? await generateLegacyTts(ai, narration)
        : await generateModernTts(ai, model, narration);
      selectedModel = model;
      break;
    } catch (error) {
      lastError = error;
      console.warn("[Gemini TTS] " + model + " gagal: " + error.message);
    }
  }

  if (!wavData?.length) {
    throw new Error("Semua model TTS gagal: " + (lastError?.message || "audio kosong"));
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, wavData);
  await fs.writeFile(path.resolve("out/facebook-reels/voice-info.json"), JSON.stringify({
    provider: "Gemini TTS",
    model: selectedModel,
    voice: "Orus",
    voiceCharacter: "adult male",
    delivery: "emotional",
    sampleRate,
    generatedAt: new Date().toISOString()
  }, null, 2) + "\n");
  console.log("[Gemini TTS] Audio WAV berhasil dibuat menggunakan " + selectedModel);
}

main().catch(error => {
  console.error("[Facebook Reels TTS]", error);
  process.exit(1);
});
