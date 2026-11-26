import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("out/facebook-reels");

async function main() {
  const content = JSON.parse(await fs.readFile(path.join(OUT, "content.json"), "utf8"));
  const audioMeta = JSON.parse(await fs.readFile(path.join(OUT, "audio-meta.json"), "utf8"));
  if (!Array.isArray(content.scenes) || content.scenes.length !== 5) {
    throw new Error("Storyboard harus berisi tepat 5 scene.");
  }
  const totalWords = content.scenes.reduce((sum, scene) => sum + scene.text.trim().split(/\s+/).length, 0);
  if (!totalWords) throw new Error("Teks storyboard kosong.");

  let elapsed = 0;
  const segments = content.scenes.map((scene, index) => {
    const words = scene.text.trim().split(/\s+/).length;
    const start = elapsed;
    elapsed = index === content.scenes.length - 1
      ? audioMeta.durationSeconds
      : audioMeta.durationSeconds * (content.scenes.slice(0, index + 1)
        .reduce((sum, item) => sum + item.text.trim().split(/\s+/).length, 0)) / totalWords;
    return {
      start: Number(start.toFixed(3)),
      end: Number(elapsed.toFixed(3)),
      text: scene.text,
      setting: scene.setting,
      action: scene.action,
      camera: scene.camera,
      mood: scene.mood
    };
  });

  const story = {
    fps: 30,
    width: 1080,
    height: 1920,
    durationSeconds: audioMeta.durationSeconds,
    segments
  };
  await fs.writeFile(path.join(OUT, "animation-story.json"), JSON.stringify(story, null, 2) + "\n");
  console.log(`Storyboard animasi siap: ${segments.length} scene, ${audioMeta.durationSeconds.toFixed(2)} detik.`);
}
main().catch(error => { console.error(error); process.exit(1); });
