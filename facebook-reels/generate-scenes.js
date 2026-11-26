import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("out/facebook-reels");
const PUBLIC = path.join(OUT, "public");
const SCENES_DIR = path.join(PUBLIC, "scenes");
const CHARACTER = "the exact same Indonesian Muslim man in every image, approximately 30 years old, oval face, warm medium-brown skin, short neat black hair, subtle short beard, cream-colored simple koko shirt, consistent facial identity and proportions";
const STYLE = "premium stylized 3D animated feature-film quality, cinematic composition, expressive natural character acting, realistic fabric and material textures, volumetric lighting, detailed environment, rich depth of field, vertical 9:16 frame, no text, no captions, no logos, no watermark, respectful Islamic atmosphere, never depict Allah or prophets";
const MASTER_PROMPT = `Character reference portrait, full body three-quarter view of ${CHARACTER}. Neutral calm expression, simple dark neutral background, soft cinematic key light. ${STYLE}`;

async function flux(prompt, outputPath) {
  const account = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!account || !token) throw new Error("CF_ACCOUNT_ID dan CF_API_TOKEN wajib diatur.");
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 4 }),
    signal: AbortSignal.timeout(120000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success || !result.result?.image) {
    throw new Error(`Cloudflare FLUX gagal HTTP ${response.status}: ${JSON.stringify(result.errors || result).slice(0, 900)}`);
  }
  const image = Buffer.from(result.result.image, "base64");
  if (!image.length) throw new Error("Hasil gambar kosong.");
  await fs.writeFile(outputPath, image);
}

async function main() {
  await fs.mkdir(SCENES_DIR, { recursive: true });
  const content = JSON.parse(await fs.readFile(path.join(OUT, "content.json"), "utf8"));
  const audioMeta = JSON.parse(await fs.readFile(path.join(OUT, "audio-meta.json"), "utf8"));
  const masterPath = path.resolve("facebook-reels/assets/character-master.png");
  await fs.mkdir(path.dirname(masterPath), { recursive: true });
  try {
    await fs.access(masterPath);
    console.log("Menggunakan character master yang sudah tersedia.");
  } catch {
    await flux(MASTER_PROMPT, masterPath);
    console.log("Character master berhasil dibuat dan akan disimpan dalam GitHub Actions cache.");
  }

  const totalWords = content.scenes.reduce((sum, scene) => sum + String(scene.text).trim().split(/\s+/).length, 0);
  let elapsed = 0;
  const timed = content.scenes.map((scene, index) => {
    const words = String(scene.text).trim().split(/\s+/).length;
    const start = elapsed;
    elapsed += index === content.scenes.length - 1
      ? audioMeta.durationSeconds - elapsed
      : audioMeta.durationSeconds * words / totalWords;
    return {
      ...scene,
      start: Number(start.toFixed(3)),
      end: Number(elapsed.toFixed(3)),
      image: `scenes/scene-${String(index + 1).padStart(2, "0")}.png`
    };
  });
  for (let i = 0; i < timed.length; i++) {
    const scene = timed[i];
    const prompt = `${CHARACTER}. Scene action and environment: ${scene.imagePrompt}. The character must retain the same face, hairstyle, skin tone, beard, age, and cream koko shirt as the recurring character. ${STYLE}`;
    await flux(prompt, path.join(SCENES_DIR, `scene-${String(i + 1).padStart(2, "0")}.png`));
    console.log(`Scene ${i + 1}/${timed.length} selesai.`);
  }
  await fs.writeFile(path.join(OUT, "scenes.json"), JSON.stringify({
    fps: 30,
    width: 1080,
    height: 1920,
    durationSeconds: audioMeta.durationSeconds,
    scenes: timed
  }, null, 2) + "\n");
}
main().catch(error => { console.error(error); process.exit(1); });
