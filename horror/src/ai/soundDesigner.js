import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

const ALLOWED_BEDS = ["drone.wav", "night-wind.wav", "rain.wav", "suspense.wav", "climax.wav"];
const ALLOWED_EFFECTS = ["knock.wav", "footsteps.wav", "creak.wav", "heartbeat.wav", "impact.wav", "wind-hit.wav"];

export async function generateSoundDesign(story, duration, scenes) {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const sceneText = scenes.map(s => JSON.stringify({ id: s.id, heading: s.heading, narration: s.narration, mood: s.mood })).join("\n");
  const prompt = "Bertindak sebagai sound designer film horor Indonesia. Buat timeline audio untuk cerita berdurasi " + duration.toFixed(1) + " detik.\n" +
    "Urutan scene:\n" + sceneText + "\n" +
    "Kembalikan JSON valid saja: {\"beds\":[{\"sceneId\":1,\"asset\":\"drone.wav\",\"volume\":0.12}],\"effects\":[{\"sceneId\":2,\"offsetSeconds\":3,\"asset\":\"knock.wav\",\"volume\":0.22}]}\n" +
    "Bed hanya boleh drone.wav, night-wind.wav, rain.wav, suspense.wav, climax.wav. Efek hanya knock.wav, footsteps.wav, creak.wav, heartbeat.wav, impact.wav, wind-hit.wav.\n" +
    "Buat perubahan mood: awal tipis dan tenang, ketegangan meningkat, klimaks paling intens, akhir menyisakan rasa ganjil. Efek hanya saat didukung kejadian narasi, maksimal 2 per scene. Offset maksimal 8 detik. Volume bed 0.06-0.18, efek 0.12-0.32 agar narasi dominan. SceneId harus persis dari daftar. Jangan menambah dialog atau suara manusia.";
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  const raw = String(response.text || "").replace(/^\x60{3}json\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Sound Design Agent mengembalikan JSON tidak valid."); }
  const validIds = new Set(scenes.map(scene => String(scene.id)));
  const beds = (Array.isArray(parsed.beds) ? parsed.beds : []).filter(x => validIds.has(String(x.sceneId)) && ALLOWED_BEDS.includes(x.asset)).map(x => ({
    sceneId: x.sceneId, asset: x.asset, volume: Math.max(0.06, Math.min(0.18, Number(x.volume) || 0.12))
  }));
  const effects = (Array.isArray(parsed.effects) ? parsed.effects : []).filter(x => validIds.has(String(x.sceneId)) && ALLOWED_EFFECTS.includes(x.asset)).map(x => ({
    sceneId: x.sceneId, offsetSeconds: Math.max(0, Math.min(8, Number(x.offsetSeconds) || 0)),
    asset: x.asset, volume: Math.max(0.12, Math.min(0.32, Number(x.volume) || 0.22))
  }));
  if (!beds.length) beds.push({ sceneId: scenes[0].id, asset: "drone.wav", volume: 0.1 });
  return { beds, effects };
}
