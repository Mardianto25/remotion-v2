import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("out/facebook-reels");

async function main() {
  const content = JSON.parse(await fs.readFile(path.join(OUT, "content.json"), "utf8"));
  const audioMeta = JSON.parse(await fs.readFile(path.join(OUT, "audio-meta.json"), "utf8"));
  if (!Array.isArray(content.scenes) || content.scenes.length !== 5) {
    throw new Error("Storyboard harus berisi tepat 5 scene.");
  }
  if (!Array.isArray(content.characters) || content.characters.length === 0) {
    throw new Error("Profil karakter dinamis tidak ditemukan.");
  }
  const duration = Number(audioMeta.durationSeconds);
  if (!Number.isFinite(duration) || duration < 20 || duration > 55) {
    throw new Error(`Durasi audio tidak valid: ${audioMeta.durationSeconds}`);
  }
  const weights = content.scenes.map(scene => Math.max(1, String(scene.text || "").trim().split(/\s+/).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let elapsed = 0;
  const segments = content.scenes.map((scene, index) => {
    const start = elapsed;
    elapsed = index === content.scenes.length - 1
      ? duration
      : duration * weights.slice(0, index + 1).reduce((sum, value) => sum + value, 0) / totalWeight;
    return {
      start: Number(start.toFixed(3)),
      end: Number(elapsed.toFixed(3)),
      text: String(scene.text).trim(),
      setting: scene.setting,
      mood: scene.mood,
      camera: scene.camera || { x: 0, y: 4.2, z: 12.5 },
      characters: Array.isArray(scene.characters) ? scene.characters : []
    };
  });
  const story = {
    fps: 30,
    width: 1080,
    height: 1920,
    durationSeconds: duration,
    characterProfiles: content.characters,
    segments
  };
  await fs.writeFile(path.join(OUT, "animation-story.json"), JSON.stringify(story, null, 2) + "\n");
  console.log(`Hybrid storyboard siap: ${segments.length} scene, ${content.characters.length} karakter, ${duration.toFixed(2)} detik.`);
}
main().catch(error => { console.error(error); process.exit(1); });
