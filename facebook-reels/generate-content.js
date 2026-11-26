import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const OUT = path.resolve("out/facebook-reels");
const topic = process.env.REELS_TOPIC?.trim() || "Renungan Islami tentang doa yang belum terkabul";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ENUMS = {
  setting: ["street", "home", "garden", "courtyard", "mosque", "hospital", "bedroom"],
  mood: ["reflective", "sad", "hopeful", "peaceful", "night"],
  action: ["standing", "walking", "sitting", "dua", "looking_up", "crying", "prayer_qiyam", "prayer_ruku", "prayer_sujud", "prayer_jalsa"],
  emotion: ["calm", "sad", "worried", "hopeful", "grateful", "peaceful"],
  position: ["left", "center", "right"],
  facing: ["camera", "away", "left"],
  gender: ["male", "female"],
  ageGroup: ["child", "young_adult", "adult", "elderly"],
  skinTone: ["light", "medium", "deep"],
  outfit: ["koko", "abaya", "casual_modest", "school_uniform", "workwear"],
  headwear: ["peci", "hijab", "none"],
  beard: ["none", "short", "full"]
};

function parseJson(text) {
  const clean = String(text || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(clean);
}

function enumValue(value, key, label) {
  const normalized = String(value || "");
  if (!ENUMS[key].includes(normalized)) {
    throw new Error(`${label}: nilai ${key} tidak valid: ${normalized}`);
  }
  return normalized;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum diatur.");
  const prompt = `
Bertindak sebagai sutradara film animasi 3D cinematic dan penulis renungan Islami Indonesia.
Buat cerita orisinal, menyentuh, tidak menggurui, durasi 30-45 detik.
Topik: ${topic}

Alur wajib:
- 0-3 detik: hook emosional yang menghentikan scrolling.
- 3-15 detik: konflik dekat dengan kehidupan.
- 15-30 detik: puncak cerita dan perubahan sudut pandang.
- 30-45 detik: penutup yang membekas dan mengajak merenung.
Narasi 75-95 kata, bahasa Indonesia natural.
Jangan mengarang ayat/hadis atau menjanjikan doa pasti terkabul sesuai waktu manusia.
Jangan menggambarkan Allah atau nabi.

BUAT CAST DINAMIS:
- Definisikan 1 sampai 3 karakter yang memang dibutuhkan cerita, bukan karakter dekorasi.
- Setiap karakter punya id stabil (misalnya "main", "mother", "child"), gender, ageGroup, skinTone, outfit, headwear, beard.
- Karakter dengan id sama harus mempertahankan identitas, warna kulit, pakaian, dan penutup kepala pada semua scene.
- Karakter perempuan wajib headwear "hijab" dan outfit "abaya" atau "casual_modest".
- Jangan menambahkan manusia jika scene lebih kuat disampaikan lewat objek atau lingkungan; tetapi setiap scene tetap boleh characters: [].
- Jangan pernah menampilkan Allah atau nabi.

BUAT TEPAT 5 SCENE. Teks scene berurutan dan jika digabung menjadi narasi lengkap.
Setting pilih: street, home, garden, courtyard, mosque, hospital, bedroom.
Mood pilih: reflective, sad, hopeful, peaceful, night.
Action pilih: standing, walking, sitting, dua, looking_up, crying, prayer_qiyam, prayer_ruku, prayer_sujud, prayer_jalsa.
Emotion pilih: calm, sad, worried, hopeful, grateful, peaceful.
Setiap item characters berisi id, action, emotion, position (left/center/right), facing (camera/away/left).
Gunakan gerakan yang masuk akal dan sesuai cerita. Gerakan salat hanya jika konteks memang salat.
Tambahkan camera: { "x": angka -1.5 s/d 1.5, "y": angka 3 s/d 5.5, "z": angka 10 s/d 15 }.
Metadata title maksimal 80 karakter, caption natural, hashtags 3-5.

Kembalikan JSON murni:
{
 "title":"...",
 "caption":"...",
 "hashtags":["#RenunganIslami"],
 "narration":"...",
 "characters":[
  {"id":"main","name":"...","gender":"male","ageGroup":"adult","skinTone":"medium","outfit":"koko","headwear":"peci","beard":"short"}
 ],
 "scenes":[
  {"text":"...","setting":"mosque","mood":"peaceful","camera":{"x":0,"y":4.2,"z":12.5},
   "characters":[{"id":"main","action":"prayer_qiyam","emotion":"calm","position":"center","facing":"camera"}]}
 ]
}
Tanpa markdown atau penjelasan.
`;
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_CONTENT_MODEL || "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  const data = parseJson(response.text);
  if (!data.narration || !Array.isArray(data.scenes) || data.scenes.length !== 5) {
    throw new Error("Output Gemini harus memiliki narration dan tepat 5 scenes.");
  }
  const words = data.narration.trim().split(/\s+/).length;
  if (words < 65 || words > 110) throw new Error(`Panjang narasi di luar batas: ${words} kata.`);
  if (!Array.isArray(data.characters) || data.characters.length < 1 || data.characters.length > 3) {
    throw new Error("Cast harus berisi 1 sampai 3 karakter.");
  }

  const ids = new Set();
  data.characters = data.characters.map((profile, index) => {
    const id = String(profile.id || `character-${index + 1}`).trim();
    if (!/^[a-z0-9_-]{2,24}$/i.test(id) || ids.has(id)) throw new Error(`ID karakter tidak valid/duplikat: ${id}`);
    ids.add(id);
    const normalized = { id, name: String(profile.name || id).slice(0, 40) };
    for (const key of ["gender", "ageGroup", "skinTone", "outfit", "headwear", "beard"]) {
      normalized[key] = enumValue(profile[key], key, `Karakter ${id}`);
    }
    if (normalized.gender === "female") {
      normalized.headwear = "hijab";
      if (!["abaya", "casual_modest"].includes(normalized.outfit)) normalized.outfit = "abaya";
      normalized.beard = "none";
    }
    if (normalized.gender === "male" && normalized.headwear === "hijab") normalized.headwear = "peci";
    return normalized;
  });

  data.scenes = data.scenes.map((scene, index) => {
    const label = `Scene ${index + 1}`;
    const normalized = {
      text: String(scene.text || "").trim(),
      setting: enumValue(scene.setting, "setting", label),
      mood: enumValue(scene.mood, "mood", label),
      camera: {
        x: Math.max(-1.5, Math.min(1.5, Number(scene.camera?.x) || 0)),
        y: Math.max(3, Math.min(5.5, Number(scene.camera?.y) || 4.2)),
        z: Math.max(10, Math.min(15, Number(scene.camera?.z) || 12.5))
      },
      characters: Array.isArray(scene.characters) ? scene.characters.slice(0, 3).map((entry) => {
        const id = String(entry.id || "");
        if (!ids.has(id)) throw new Error(`${label}: karakter ${id} tidak ditemukan di cast.`);
        return {
          id,
          action: enumValue(entry.action, "action", label),
          emotion: enumValue(entry.emotion, "emotion", label),
          position: enumValue(entry.position, "position", label),
          facing: enumValue(entry.facing, "facing", label)
        };
      }) : []
    };
    if (!normalized.text) throw new Error(`${label}: teks kosong.`);
    return normalized;
  });

  data.title = String(data.title || "Renungan Islami").slice(0, 80);
  data.caption = String(data.caption || data.title).slice(0, 1800);
  data.hashtags = [...new Set((data.hashtags || []).map(x => String(x).startsWith("#") ? String(x) : `#${x}`))].slice(0, 5);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "content.json"), JSON.stringify(data, null, 2) + "\n");
  await fs.writeFile(path.join(OUT, "transcript.txt"), data.narration.trim() + "\n");
  console.log(`Konten dibuat: ${words} kata, ${data.characters.length} karakter dinamis, ${data.scenes.length} scene.`);
}
main().catch(error => { console.error(error); process.exit(1); });
