import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

const ALLOWED_BEDS = ["drone.wav", "night-wind.wav", "rain.wav", "suspense.wav", "climax.wav"];
const ALLOWED_EFFECTS = [
  "knock.wav", "footsteps.wav", "creak.wav", "heartbeat.wav", "impact.wav", "wind-hit.wav",
  "gamelan.wav", "gong.wav", "shriek.wav", "gasp.wav", "breathing.wav", "whisper.wav"
];

export async function generateSoundDesign(story, duration, scenes) {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const sceneText = scenes.map(s => JSON.stringify({ id: s.id, heading: s.heading, narration: s.narration, mood: s.mood })).join("\n");
  const prompt = "Bertindak sebagai sound designer film horor sinematik Indonesia. Buat timeline audio yang mengikuti kejadian dan kata-kata dalam narasi. Durasi cerita " + duration.toFixed(1) + " detik.\n" +
    "Urutan scene (baca narasi dengan teliti untuk menemukan momen cue):\n" + sceneText + "\n" +
    "Kembalikan JSON valid saja: {\"beds\":[{\"sceneId\":1,\"asset\":\"drone.wav\",\"volume\":0.12}],\"effects\":[{\"sceneId\":2,\"offsetSeconds\":3,\"asset\":\"knock.wav\",\"volume\":0.22,\"cue\":\"ketukan pintu\"}]}\n" +
    "Bed hanya boleh: drone.wav, night-wind.wav, rain.wav, suspense.wav, climax.wav. Efek hanya boleh: knock.wav, footsteps.wav, creak.wav, heartbeat.wav, impact.wav, wind-hit.wav, gamelan.wav, gong.wav, shriek.wav, gasp.wav, breathing.wav, whisper.wav.\n" +
    "Panduan pemilihan: gamelan.wav untuk gamelan/iringan tradisional yang terdengar; gong.wav untuk gong atau dentang besar; shriek.wav untuk teriakan melengking/jeritan tokoh; gasp.wav untuk tokoh tersentak atau terkejut; breathing.wav untuk napas berat/terengah; whisper.wav untuk bisikan misterius; footsteps.wav untuk langkah; creak.wav untuk pintu/benda berderit; knock.wav untuk ketukan; impact.wav untuk benturan; heartbeat.wav untuk detak jantung; wind-hit.wav untuk hembusan mendadak. Jangan menambahkan efek yang tidak didukung cerita.\n" +
    "Buat bed berubah mengikuti mood: awal tipis, ketegangan meningkat, klimaks intens, akhir menyisakan rasa ganjil. Efek maksimal 3 per scene dan prioritaskan momen penting, jangan menumpuk. Offset harus berada di dalam scene dan maksimal 12 detik. Volume bed 0.06-0.18, efek 0.12-0.38 agar narasi tetap jelas. SceneId harus persis dari daftar. Cue hanya label singkat untuk log. Jangan membuat dialog atau mengubah narasi.";
  const response = await ai.models.generateContent({ model: config.geminiModel, contents: prompt, config: { responseMimeType: "application/json" } });
  const raw = String(response.text || "").replace(/^\x60{3}json\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Sound Design Agent mengembalikan JSON tidak valid."); }
  const validIds = new Set(scenes.map(scene => String(scene.id)));
  const beds = (Array.isArray(parsed.beds) ? parsed.beds : []).filter(x => validIds.has(String(x.sceneId)) && ALLOWED_BEDS.includes(x.asset)).map(x => ({
    sceneId: x.sceneId, asset: x.asset, volume: Math.max(0.06, Math.min(0.18, Number(x.volume) || 0.12))
  }));
  const effects = (Array.isArray(parsed.effects) ? parsed.effects : []).filter(x => validIds.has(String(x.sceneId)) && ALLOWED_EFFECTS.includes(x.asset)).map(x => ({
    sceneId: x.sceneId, offsetSeconds: Math.max(0, Math.min(12, Number(x.offsetSeconds) || 0)),
    asset: x.asset, volume: Math.max(0.12, Math.min(0.38, Number(x.volume) || 0.22)),
    cue: String(x.cue || "").slice(0, 100)
  }));
  if (!beds.length && scenes.length) beds.push({ sceneId: scenes[0].id, asset: "drone.wav", volume: 0.1 });
  return { beds, effects };
}
