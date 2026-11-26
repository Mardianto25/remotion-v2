import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const OUT = path.resolve("out/facebook-reels");
const MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const VOICE = process.env.GEMINI_TTS_VOICE || "Algenib";

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum diatur.");
  const content = JSON.parse(await fs.readFile(path.join(OUT, "content.json"), "utf8"));
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{
      parts: [{
        text: `Bacakan teks Bahasa Indonesia berikut persis tanpa menambah atau mengurangi kata. Narator laki-laki dewasa, suara rendah dan hangat, emosional, tulus, menyentuh hati, tempo sedang cenderung tenang. Berikan jeda alami pada tanda baca, artikulasi jelas, tidak berlebihan seperti iklan.\n\n${content.narration}`
      }]
    }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        languageCode: "id-ID",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } }
      }
    }
  });
  const base64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData?.data;
  if (!base64) throw new Error("Gemini TTS tidak mengembalikan audio.");
  const pcm = Buffer.from(base64, "base64");
  if (!pcm.length) throw new Error("Audio Gemini kosong.");
  const durationSeconds = pcm.length / (24000 * 2);
  if (durationSeconds < 25 || durationSeconds > 50) {
    throw new Error(`Durasi audio ${durationSeconds.toFixed(2)} detik di luar target Reels 30-45 detik (toleransi 25-50).`);
  }
  await fs.mkdir(path.join(OUT, "public"), { recursive: true });
  await fs.writeFile(path.join(OUT, "public", "narration.wav"), pcmToWav(pcm));
  await fs.writeFile(path.join(OUT, "audio-meta.json"), JSON.stringify({
    durationSeconds, sampleRate: 24000, voice: VOICE, model: MODEL
  }, null, 2) + "\n");
  console.log(`Audio ${durationSeconds.toFixed(2)} detik dibuat dengan ${MODEL}, voice ${VOICE}.`);
}
main().catch(error => { console.error(error); process.exit(1); });
