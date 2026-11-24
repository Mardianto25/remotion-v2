
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const geminiModels = process.env.GEMINI_MODELS
  ? process.env.GEMINI_MODELS.split(',').map(m => m.trim())
  : ['gemini-2.5-flash', 'gemini-flash'];

const STYLE_PRESETS = {
  'cinematic-3d': 'Premium stylized 3D animated feature-film look, carefully crafted 3D characters and environments, expressive but natural proportions, realistic fabric and material textures, cinematic volumetric lighting, rich depth, polished high-end 3D render.',
  photorealistic: 'Photorealistic live-action cinema still, natural human proportions, authentic real-world materials, physically plausible lighting, cinematic lens and depth of field.',
  anime: 'High-quality cinematic anime film illustration, refined hand-drawn-inspired details, expressive anime visual language, beautiful film lighting, consistent character design.',
  documentary: 'Natural documentary photography, authentic locations and objects, observational framing, realistic available light, restrained cinematic color grading.'
};
const publicDir = path.join(process.cwd(), 'public');
const imagesDir = path.join(publicDir, 'images');

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

// Setiap video memiliki folder sendiri agar aset antar-video tidak tercampur.
function createVideoImageFolder() {
  const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', 'Z');
  const folderName = `video-${timestamp}`;
  const folderPath = path.join(imagesDir, folderName);
  fs.mkdirSync(folderPath, { recursive: true });
  return { folderName, folderPath };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, publicDir),
  filename: (req, file, cb) => cb(null, 'audio.mp3')
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir));

// ============================================================
// PEXELS FALLBACK
// ============================================================

const PEXELS_FALLBACKS = [
  'https://images.pexels.com/photos/4388167/pexels-photo-4388167.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/8111394/pexels-photo-8111394.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/3881104/pexels-photo-3881104.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920'
];

// ============================================================
// DOWNLOAD IMAGE
// ============================================================

async function downloadImage(imageUrl, filename, targetDir = imagesDir) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Gagal download gambar: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.startsWith('image/')) {
    throw new Error('URL tidak mengembalikan file gambar.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error('File gambar kosong.');
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const imagePath = path.join(targetDir, filename);

  fs.writeFileSync(imagePath, buffer);

  return `images/${filename}`;
}

// ============================================================
// CLOUDFLARE FLUX IMAGE GENERATOR
// PRIORITAS UTAMA
// ============================================================

async function generateFluxImage(prompt, filename, targetDir = imagesDir, visualStyle = 'cinematic-3d') {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials belum dikonfigurasi.');
  }

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
    '/ai/run/@cf/black-forest-labs/flux-1-schnell';

  const styleInstructions = STYLE_PRESETS[visualStyle] || STYLE_PRESETS['cinematic-3d'];

  const visualRules = `
    STRICT SCENE MATCHING:
The image must illustrate only the exact subject, action, object, or idea in the supplied narration segment.
DEFAULT TO ZERO PEOPLE: do not generate people, faces, portraits, crowds, or human figures unless the narration explicitly mentions a person or a human action that requires depiction.
Prefer meaningful objects, environments, architecture, landscapes only when relevant, close details, symbolic still life, and cinematic establishing shots.
When a person is explicitly required, use the minimum number of people and prefer wide shots, silhouettes, rear views, or hands; avoid face close-ups.
Never invent a mother, father, child, couple, or random person.
For abstract ideas, use a clear relevant visual metaphor instead of an unrelated human portrait.
No text, captions, logos, symbols, or watermarks.
If a woman is explicitly required, she must wear a complete hijab covering hair, ears, and neck and modest loose clothing.
Never depict Allah or prophets.

CINEMATIC QUALITY:

${styleInstructions} Detailed environments, dramatic composition, vertical 9:16.

No text, captions, logos, or watermarks.
  `;

  const requestBody = JSON.stringify({
    prompt: `${prompt}. ${visualRules}`,
    steps: 4
  });
  const maxAttempts = 3;
  let imageBase64 = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: requestBody,
        signal: AbortSignal.timeout(120000)
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Cloudflare FLUX mengembalikan respons bukan JSON (HTTP ${response.status}).`);
      }

      if (!response.ok || !result.success || !result.result?.image) {
        const detail = JSON.stringify(result.errors || result);
        const error = new Error(`Cloudflare FLUX gagal (HTTP ${response.status}): ${detail}`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }

      imageBase64 = result.result.image;
      break;
    } catch (error) {
      lastError = error;
      const retryable = error.retryable !== false;
      if (!retryable || attempt === maxAttempts) break;

      const delayMs = attempt * 3000;
      console.warn(`[FLUX] Percobaan ${attempt}/${maxAttempts} gagal: ${error.message}. Coba ulang dalam ${delayMs / 1000} detik.`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (!imageBase64) {
    throw new Error(`FLUX gagal setelah ${maxAttempts} percobaan: ${lastError?.message || 'Tidak ada gambar yang diterima.'}`);
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  if (!imageBuffer.length) {
    throw new Error('Hasil gambar FLUX kosong.');
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const imagePath = path.join(targetDir, filename);

  fs.writeFileSync(imagePath, imageBuffer);

  return `images/${filename}`;
}

// ============================================================
// FLUX -> PIXABAY -> PEXELS FALLBACK
// ============================================================

async function fetchVerticalNatureImage(imagePrompt, keyword, index, targetDir = imagesDir, folderName = '', visualStyle = 'cinematic-3d') {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 10000);

  const filename =
    `scene-${String(index + 1).padStart(3, '0')}-${timestamp}-${randomId}`;

  const fluxFilename = `${filename}.png`;
  const pixabayFilename = `${filename}.jpg`;


  // ----------------------------------------------------------
  // 1. FLUX - PRIORITAS UTAMA
  // ----------------------------------------------------------

  if (
    process.env.CF_ACCOUNT_ID &&
    process.env.CF_API_TOKEN
  ) {
    try {
      console.log(`[FLUX] Membuat gambar scene ${index + 1}`);
      console.log(`[FLUX Prompt]: ${imagePrompt}`);

      const imagePath = await generateFluxImage(
        imagePrompt,
        fluxFilename,
        targetDir,
        visualStyle
      );

      console.log(`[FLUX] Berhasil: ${imagePath}`);

      return folderName ? `images/${folderName}/${path.basename(imagePath)}` : imagePath;

    } catch (error) {
      console.error('[FLUX Error]:', error.message);
    }
  } else {
    console.log('[FLUX] Credentials tidak tersedia.');
  }

  // ----------------------------------------------------------
  // 2. PIXABAY - FALLBACK
  // Foto stok hanya untuk style fotografi. Untuk 3D/anime,
  // hentikan proses daripada mencampur style yang tidak konsisten.
  // ----------------------------------------------------------

  if (visualStyle === 'cinematic-3d' || visualStyle === 'anime') {
    throw new Error(`FLUX gagal membuat gambar bergaya ${visualStyle} pada scene ${index + 1}; fallback foto stok dinonaktifkan agar style video tetap konsisten.`);
  }

  const apiKey = process.env.PIXABAY_API_KEY;

  if (apiKey) {
    try {
      console.log(`[Pixabay] Mencari gambar: ${keyword}`);

      const query = encodeURIComponent(keyword);

      const url =
        `https://pixabay.com/api/?key=${apiKey}` +
        `&q=${query}` +
        '&image_type=photo' +
        '&orientation=vertical' +
        '&safesearch=true' +
        '&per_page=20';

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Pixabay HTTP ${response.status}`);
      }

      const data = await response.json();
      const hits = data.hits || [];

      if (hits.length > 0) {
        // Pixabay mengurutkan hasil berdasarkan relevansi; jangan memilih acak.
        const selected = hits[0];

        const imageUrl =
          selected.largeImageURL || selected.webformatURL;

        const imagePath = await downloadImage(
          imageUrl,
          pixabayFilename,
          targetDir
        );

        console.log(`[Pixabay] Berhasil: ${imagePath}`);

        return folderName ? `images/${folderName}/${path.basename(imagePath)}` : imagePath;
      }

      console.log('[Pixabay] Tidak menemukan gambar.');

    } catch (error) {
      console.warn('[Pixabay Warning]:', error.message);
    }
  } else {
    console.log('[Pixabay] API key tidak tersedia.');
  }

  // Jangan gunakan gambar stok generik yang berpotensi tidak sesuai narasi.
  throw new Error(`Tidak ada gambar relevan untuk scene ${index + 1}. FLUX dan Pixabay gagal; render dihentikan agar tidak menghasilkan visual yang salah.`);
}

// ============================================================
// GEMINI AUDIO ANALYSIS
// ============================================================

export async function executePipeline(autoPushGit = true, visualStyle = 'cinematic-3d') {
  visualStyle = Object.hasOwn(STYLE_PRESETS, visualStyle) ? visualStyle : 'cinematic-3d';
  const styleInstructions = STYLE_PRESETS[visualStyle];
  console.log(`[Visual Style] ${visualStyle}`);

  const audioPath = path.join(publicDir, 'audio.mp3');

  if (!fs.existsSync(audioPath)) {
    throw new Error('File audio.mp3 tidak ditemukan.');
  }

  const audioBase64 = fs
    .readFileSync(audioPath)
    .toString('base64');

  const prompt = `
    Analisis audio terlampir secara langsung. Audio adalah satu-satunya sumber kebenaran.
    Jangan mengarang, memperbaiki, meringkas, atau menambahkan kata yang tidak terdengar.

    TUGAS:
    Buat transkrip verbatim dalam urutan asli dan bagi menjadi scene berdasarkan satu gagasan/kalimat utuh.
    Setiap scene harus memiliki teks, waktu, dan visual yang berasal dari bagian audio yang SAMA.

    TIMESTAMP:
    - start dan end dalam detik berdasarkan posisi aktual di audio.
    - Jangan memperkirakan durasi secara merata dan jangan menggeser timestamp demi membuat scene sama panjang.
    - Scene harus berurutan, tidak tumpang tindih, dan tidak melompati narasi.
    - Gunakan batas jeda alami dan pergantian kalimat.
    - Jangan memotong satu frasa di tengah kata.
    - Pastikan seluruh narasi sampai akhir audio tercakup.

    TEKS:
    - text harus merupakan kata-kata yang benar-benar terdengar.
    - Pertahankan bahasa asli, jangan parafrase.
    - Pecah kalimat panjang menjadi scene yang nyaman dibaca, tanpa mengubah urutan kata.

    VISUAL STYLE PRESET (WAJIB DIIKUTI):
    ${styleInstructions}
    Pertahankan style yang sama di seluruh scene agar tampilan video konsisten.
    Jangan mengubah objek atau kejadian yang disebut narasi demi mengikuti style.

    VISUAL — PRIORITAS UTAMA:
    - Visual harus menggambarkan makna spesifik dari text pada scene tersebut, bukan tema umum video.
    - DEFAULT: jangan tampilkan manusia, wajah, atau kerumunan.
    - Utamakan objek, lokasi, alam, arsitektur, detail aktivitas tanpa wajah, benda simbolis, dan visual konseptual yang relevan.
    - Gunakan manusia HANYA jika audio secara eksplisit menyebut orang/karakter atau tindakan manusia yang memang perlu divisualisasikan.
    - Jika manusia memang disebut, tampilkan seperlunya; utamakan wide shot, siluet, tampak belakang, atau tangan. Hindari close-up wajah dan portrait.
    - Jangan menambahkan perempuan, laki-laki, anak, pasangan, atau keluarga jika tidak disebutkan dalam audio.
    - Jangan mengganti kata konkret dengan visual yang tidak berhubungan. Contoh: "ibu" boleh divisualisasikan sebagai ibu; "hujan" harus hujan; "doa" dapat berupa sajadah/tangan berdoa; "waktu" dapat berupa jam.
    - Untuk konsep abstrak seperti dosa, penyesalan, kesabaran, atau kematian, gunakan simbol visual yang relevan tanpa otomatis menampilkan wajah/orang.
    - Untuk bencana, tampilkan bencana dan dampaknya; untuk surga/neraka gunakan visual simbolis yang menghormati keyakinan Islam.
    - Jangan menggambarkan Allah atau para nabi.
    - Jika perempuan harus ditampilkan, wajib berhijab menutup rambut dan leher serta berpakaian sopan.
    - Jangan tambahkan simbol agama lain yang tidak disebut atau tidak relevan.
    - Tidak boleh ada tulisan, subtitle, logo, watermark, atau tipografi di gambar.
    - Image prompt berbahasa Inggris, spesifik terhadap scene, dan WAJIB mengikuti visual style yang dipilih: ${styleInstructions}
    - Jangan menulis "photorealistic" kecuali style yang dipilih adalah photorealistic atau documentary.
    - CHARACTER CONTINUITY: sebelum membuat daftar scene, identifikasi karakter yang benar-benar disebut audio beserta ciri visual tetapnya. Jika karakter yang sama muncul lagi, ulangi ciri yang sama secara eksplisit di setiap imagePrompt (rentang usia, warna kulit, bentuk rambut atau hijab, pakaian, warna pakaian, dan detail pembeda). Jangan mengubah wajah, pakaian, usia, atau identitas karakter antar-scene. Jika karakter tidak disebut audio, jangan menciptakan karakter manusia.
    - STYLE CONTINUITY: semua imagePrompt harus memakai gaya render, palet warna, material, pencahayaan, dan tingkat detail yang konsisten. Hanya subjek, aksi, dan lokasi yang berubah sesuai narasi.
    - Komposisi vertical 9:16, satu frame sinematik, tanpa teks.

    KEYWORD:
    - keyword singkat, spesifik, bahasa Inggris, dan sesuai objek/kejadian scene.
    - Hindari keyword generik seperti nature, landscape, beautiful scenery kecuali memang disebut audio.

    KELUARAN:
    Hanya JSON array valid tanpa markdown.
    Setiap item wajib memiliki:
    {
      "start": 0.0,
      "end": 3.5,
      "text": "transkrip asli yang terdengar",
      "keyword": "specific subject or event",
      "imagePrompt": "A precise visual description of this exact narration segment"
    }
  `;

  let aiResponseText = null;
  let successfulModel = '';

  // ----------------------------------------------------------
  // GEMINI MODEL FALLBACK
  // ----------------------------------------------------------

  const geminiMaxAttempts = Math.max(1, Number.parseInt(process.env.GEMINI_RETRIES_PER_MODEL || '2', 10) || 2);

  for (const modelName of [...new Set(geminiModels.filter(Boolean))]) {
    for (let attempt = 1; attempt <= geminiMaxAttempts; attempt++) {
      try {
        console.log(
          `[2/4] Menganalisis audio dengan Gemini ${modelName} (percobaan ${attempt}/${geminiMaxAttempts})`
        );

        const aiResponse = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: audioBase64
              }
            },
            prompt
          ]
        });

        if (!aiResponse?.text) {
          throw new Error('Gemini mengembalikan respons kosong.');
        }

        aiResponseText = aiResponse.text;
        successfulModel = modelName;
        console.log(`[Gemini] Berhasil menggunakan model ${successfulModel}`);
        break;
      } catch (error) {
        console.warn(
          `[Gemini] Model ${modelName}, percobaan ${attempt}/${geminiMaxAttempts} gagal: ${error.message}`
        );

        if (attempt < geminiMaxAttempts) {
          const delayMs = attempt * 3000;
          console.log(`[Gemini] Retry dalam ${delayMs / 1000} detik...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    if (aiResponseText) break;
    console.warn(`[Gemini] Beralih ke model berikutnya setelah ${modelName} gagal.`);
  }

  if (!aiResponseText) {
    throw new Error(
      'Semua model Gemini gagal memproses audio.'
    );
  }

  // ----------------------------------------------------------
  // PARSE JSON
  // ----------------------------------------------------------

  let rawJson = aiResponseText.trim();

  rawJson = rawJson
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  const parsedSegments = JSON.parse(rawJson);

  if (!Array.isArray(parsedSegments) || parsedSegments.length === 0) {
    throw new Error('Gemini tidak menghasilkan segment audio yang valid.');
  }

  // Validasi durasi audio asli agar timestamp AI tidak melewati audio.
  let audioDuration = null;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const measuredDuration = Number(stdout.trim());
    if (Number.isFinite(measuredDuration) && measuredDuration > 0) {
      audioDuration = measuredDuration;
    }
  } catch (error) {
    console.warn('[Audio Duration] ffprobe tidak tersedia, validasi durasi dilewati:', error.message);
  }

  // Pertahankan urutan ucapan. Overlap kecil dirapikan pada batas scene,
  // sedangkan timestamp yang mundur atau di luar audio dianggap kesalahan.
  let previousStart = -1;
  let previousEnd = 0;
  const normalizedSegments = parsedSegments.map((segment, index) => {
    const start = Number(segment.start);
    let end = Number(segment.end);
    const text = String(segment.text || '').trim();

    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
      throw new Error(`Scene ${index + 1}: timestamp atau teks tidak valid.`);
    }
    if (start < 0 || end <= start) {
      throw new Error(`Scene ${index + 1}: rentang waktu tidak valid.`);
    }
    if (start < previousStart) {
      throw new Error(`Urutan timestamp mundur pada scene ${index + 1}; render dibatalkan agar tidak salah sinkron.`);
    }
    if (audioDuration && start >= audioDuration) {
      throw new Error(`Scene ${index + 1} dimulai setelah audio berakhir.`);
    }

    if (audioDuration) end = Math.min(end, audioDuration);
    if (index > 0 && start < previousEnd) {
      // Hanya rapikan overlap dengan memotong akhir scene sebelumnya.
      normalizedSegments[index - 1].end = start;
    }
    if (end <= start) {
      throw new Error(`Scene ${index + 1} terlalu pendek setelah validasi timestamp.`);
    }

    previousStart = start;
    previousEnd = end;
    return { ...segment, start, end, text };
  }).filter(segment => segment.end - segment.start >= 0.12);

  if (!normalizedSegments.length) {
    throw new Error('Tidak ada scene valid setelah validasi timestamp.');
  }

  // ----------------------------------------------------------
  // IMAGE GENERATION
  // FLUX -> PIXABAY -> PEXELS
  // ----------------------------------------------------------

  console.log('[3/4] Memproses gambar setiap scene...');

  const subtitlesData = [];
  const { folderName: videoFolderName, folderPath: videoFolderPath } = createVideoImageFolder();
  console.log(`[Images] Semua gambar video ini disimpan di public/images/${videoFolderName}/`);

  for (let i = 0; i < normalizedSegments.length; i++) {
    const seg = normalizedSegments[i];

    const start = Number(seg.start);
    const end = Number(seg.end);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      throw new Error(
        `Waktu segment ke-${i + 1} tidak valid.`
      );
    }

    const keyword = String(
      seg.keyword || seg.text || 'cinematic Islamic scene'
    ).trim();

    const imagePrompt = String(
      seg.imagePrompt ||
      `Cinematic photorealistic visual representing: ${seg.text}. ` +
      'Respectful Islamic atmosphere, vertical 9:16 composition.'
    ).trim();

    console.log(
      `[Image ${i + 1}/${parsedSegments.length}] ${seg.text}`
    );

    console.log(`[Keyword]: ${keyword}`);
    console.log(`[Image Prompt]: ${imagePrompt}`);

    const imagePath = await fetchVerticalNatureImage(
      imagePrompt,
      keyword,
      i,
      videoFolderPath,
      videoFolderName,
      visualStyle
    );

    subtitlesData.push({
      start,
      end,
      text: String(seg.text || '').trim(),
      keyword,
      imagePrompt,
      image: imagePath
    });
  }

  // Simpan manifest agar folder dapat dikenali sebagai satu hasil video.
  fs.writeFileSync(
    path.join(videoFolderPath, 'manifest.json'),
    JSON.stringify({
      videoFolder: videoFolderName,
      generatedAt: new Date().toISOString(),
      audioFile: 'audio.mp3',
      sceneCount: subtitlesData.length,
      scenes: subtitlesData.map(({ start, end, text, image, keyword }) => ({
        start, end, text, keyword, image
      }))
    }, null, 2),
    'utf8'
  );

  // Setelah generasi video baru berhasil, hapus folder aset video lama.
  // Folder aktif dipertahankan; folder lain yang bukan video-* tidak disentuh.
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('video-') && entry.name !== videoFolderName) {
      fs.rmSync(path.join(imagesDir, entry.name), { recursive: true, force: true });
      console.log(`[Cleanup] Folder gambar lama dihapus: ${entry.name}`);
    }
  }

  // Penanda folder aset untuk video yang terakhir diproses.
  fs.writeFileSync(
    path.join(imagesDir, 'LATEST.json'),
    JSON.stringify({
      videoFolder: videoFolderName,
      folder: `public/images/${videoFolderName}/`,
      generatedAt: new Date().toISOString(),
      sceneCount: subtitlesData.length
    }, null, 2),
    'utf8'
  );

  // ----------------------------------------------------------
  // SAVE SUBTITLES
  // ----------------------------------------------------------

  const subtitlesPath = path.join(
    publicDir,
    'subtitles.json'
  );

  fs.writeFileSync(
    subtitlesPath,
    JSON.stringify(subtitlesData, null, 2),
    'utf8'
  );

  const fullTranscript = subtitlesData
    .map(item => item.text)
    .join(' ');

  const transcriptPath = path.join(
    publicDir,
    'transcript.txt'
  );

  fs.writeFileSync(
    transcriptPath,
    fullTranscript,
    'utf8'
  );

  console.log(
    '[4/4] subtitles.json dan transcript.txt berhasil dibuat.'
  );

  // ----------------------------------------------------------
  // GIT PUSH
  // ----------------------------------------------------------

  let gitStatusMessage = 'Selesai tanpa Git Push.';

  if (autoPushGit) {
    try {
      console.log('[Git] Mengirim hasil ke GitHub...');

      await execAsync(
        'git add public/audio.mp3 public/subtitles.json public/transcript.txt public/images'
      );

      const { stdout: statusOutput } = await execAsync(
        'git status --porcelain'
      );

      if (statusOutput.trim()) {
        await execAsync(
          'git commit -m "chore: update audio, subtitles and scene images"'
        );

        await execAsync('git push');

        gitStatusMessage =
          'Berhasil push ke GitHub! GitHub Actions dapat memulai render video.';
      } else {
        gitStatusMessage =
          'Tidak ada perubahan file untuk di-push.';
      }

    } catch (gitError) {
      console.warn('[Git Warning]:', gitError.message);

      gitStatusMessage =
        `Pemrosesan lokal berhasil, Git push gagal: ${gitError.message}`;
    }
  }

  return {
    success: true,
    message: 'Pemrosesan audio dan gambar berhasil!',
    modelUsed: successfulModel,
    visualStyle,
    gitStatus: gitStatusMessage,
    transcript: fullTranscript,
    subtitles: subtitlesData
  };
}

// ============================================================
// INSTAGRAM PROCESSING
// ============================================================

async function processInstagram(igUrl, autoPushGit = true, visualStyle = 'cinematic-3d') {
  try {
    console.log('[IG URL] URL diterima:', igUrl);

    if (!igUrl || typeof igUrl !== 'string') {
      throw new Error('URL Instagram kosong atau tidak valid.');
    }

    const parsedUrl = new URL(igUrl.trim());

    if (
      !['instagram.com', 'www.instagram.com'].includes(parsedUrl.hostname) ||
      !['http:', 'https:'].includes(parsedUrl.protocol)
    ) {
      throw new Error('URL Instagram tidak valid.');
    }

    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    console.log('[IG URL] Menjalankan yt-dlp...');

    const safeUrl = parsedUrl.toString();

    await execAsync(
      `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${safeUrl}"`
    );

    if (!fs.existsSync(audioPath)) {
      throw new Error('Audio Instagram gagal diunduh.');
    }

    console.log('[IG URL] Audio berhasil diunduh.');

    return await executePipeline(autoPushGit, visualStyle);

  } catch (error) {
    console.error('[Process Instagram Error]:', error);
    throw error;
  }
}

// ============================================================
// ENDPOINT 1: UPLOAD AUDIO
// ============================================================

app.post(
  '/api/upload-audio',
  upload.single('audio'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada file audio yang diunggah.'
        });
      }

      const autoPushGit = req.body.autoPush === 'true';

      console.log('[1/4] Audio berhasil disimpan.');

      const result = await executePipeline(autoPushGit);

      return res.json(result);

    } catch (error) {
      console.error('[Upload Error]:', error);

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// ENDPOINT 2: PROCESS VIDEO URL
// ============================================================

app.post('/api/process-url', async (req, res) => {
  try {
    const { videoUrl, autoPush } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        message: 'Parameter videoUrl tidak boleh kosong.'
      });
    }

    const parsedUrl = new URL(videoUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('URL video tidak valid.');
    }

    console.log('[URL] Mengunduh audio:', videoUrl);

    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    await execAsync(
      `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${parsedUrl.toString()}"`
    );

    if (!fs.existsSync(audioPath)) {
      throw new Error('Gagal mengekstrak audio dari tautan.');
    }

    const autoPushGit =
      autoPush === true || autoPush === 'true';

    const result = await executePipeline(autoPushGit);

    return res.json(result);

  } catch (error) {
    console.error('[URL Error]:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// ENDPOINT 3: PROCESS INSTAGRAM URL
// ============================================================

app.post('/api/process-ig-url', async (req, res) => {
  try {
    const { igUrl, autoPush, visualStyle } = req.body;

    if (!igUrl) {
      return res.status(400).json({
        success: false,
        message: 'Parameter igUrl tidak boleh kosong.'
      });
    }

    const autoPushGit =
      autoPush === true || autoPush === 'true';

    const result = await processInstagram(
      igUrl,
      autoPushGit,
      visualStyle
    );

    return res.json(result);

  } catch (error) {
    console.error('[IG URL Error]:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(
    `Server Auto-Shorts berjalan di http://localhost:${PORT}`
  );
});

// WhatsApp tidak dijalankan dari server.js.
// Jalankan service WhatsApp secara terpisah jika memang diperlukan.
