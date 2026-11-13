
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { startWhatsApp } from './whatsapp/client.js';

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

const publicDir = path.join(process.cwd(), 'public');
const imagesDir = path.join(publicDir, 'images');

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

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
// FALLBACK PEXELS
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

async function downloadImage(imageUrl, filename) {
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

  const imagePath = path.join(imagesDir, filename);

  fs.writeFileSync(imagePath, buffer);

  return `images/${filename}`;
}

// ============================================================
// CLOUDFLARE FLUX IMAGE GENERATOR
// ============================================================

async function generateFluxImage(prompt, filename) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials belum dikonfigurasi.');
  }

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
    '/ai/run/@cf/black-forest-labs/flux-1-schnell';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: [
        prompt,
        'cinematic photography',
        'vertical 9:16 composition',
        'realistic detailed environment',
        'beautiful natural lighting',
        'no people',
        'no text',
        'no watermark'
      ].join(', '),
      steps: 4
    })
  });

  const result = await response.json();

  if (
    !response.ok ||
    !result.success ||
    !result.result?.image
  ) {
    throw new Error(
      `Cloudflare FLUX gagal: ${JSON.stringify(result.errors || result)}`
    );
  }

  const imageBuffer = Buffer.from(
    result.result.image,
    'base64'
  );

  if (!imageBuffer.length) {
    throw new Error('Hasil gambar FLUX kosong.');
  }

  const imagePath = path.join(imagesDir, filename);

  fs.writeFileSync(imagePath, imageBuffer);

  return `images/${filename}`;
}

// ============================================================
// PIXABAY + FLUX + PEXELS FALLBACK
// ============================================================

async function fetchVerticalNatureImage(keyword, index) {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 10000);

  const pixabayFilename =
    `scene-${String(index + 1).padStart(3, '0')}-${timestamp}-${randomId}.jpg`;

  const fluxFilename =
    `scene-${String(index + 1).padStart(3, '0')}-${timestamp}-${randomId}.png`;

  const fallbackUrl =
    PEXELS_FALLBACKS[index % PEXELS_FALLBACKS.length];

  // ----------------------------------------------------------
  // 1. PIXABAY
  // ----------------------------------------------------------

  const apiKey = process.env.PIXABAY_API_KEY;

  if (apiKey) {
    try {
      console.log(`[Pixabay] Mencari gambar: ${keyword}`);

      const searchQuery =
        `${keyword} landscape architecture scenery no people`;

      const query = encodeURIComponent(searchQuery);

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

      const unsafeWords = [
        'woman',
        'girl',
        'model',
        'person',
        'people',
        'portrait'
      ];

      const safeHits = (data.hits || []).filter(hit => {
        const tags = (hit.tags || '')
          .toLowerCase()
          .split(',')
          .map(tag => tag.trim());

        return !unsafeWords.some(word => tags.includes(word));
      });

      if (safeHits.length > 0) {
        const selected =
          safeHits[Math.floor(Math.random() * safeHits.length)];

        const imageUrl =
          selected.largeImageURL || selected.webformatURL;

        const imagePath = await downloadImage(
          imageUrl,
          pixabayFilename
        );

        console.log(`[Pixabay] Berhasil: ${imagePath}`);

        return imagePath;
      }

      console.log('[Pixabay] Tidak menemukan gambar yang sesuai.');

    } catch (error) {
      console.warn('[Pixabay Warning]:', error.message);
    }
  } else {
    console.log('[Pixabay] API key tidak tersedia.');
  }

  // ----------------------------------------------------------
  // 2. CLOUDFLARE FLUX
  // ----------------------------------------------------------

  if (
    process.env.CF_ACCOUNT_ID &&
    process.env.CF_API_TOKEN
  ) {
    try {
      console.log(`[FLUX] Membuat gambar: ${keyword}`);

      const prompt =
        `A beautiful peaceful cinematic scene representing ${keyword}, ` +
        'Islamic inspirational atmosphere, realistic photography, ' +
        'high detail, natural composition';

      const imagePath = await generateFluxImage(
        prompt,
        fluxFilename
      );

      console.log(`[FLUX] Berhasil: ${imagePath}`);

      return imagePath;

    } catch (error) {
      console.error('[FLUX Error]:', error.message);
    }
  } else {
    console.log('[FLUX] Credentials tidak tersedia.');
  }

  // ----------------------------------------------------------
  // 3. PEXELS FALLBACK
  // ----------------------------------------------------------

  console.log(`[Pexels] Menggunakan fallback untuk: ${keyword}`);

  return fallbackUrl;
}

// ============================================================
// GEMINI AUDIO ANALYSIS
// ============================================================

export async function executePipeline(autoPushGit = true) {
  const audioPath = path.join(publicDir, 'audio.mp3');

  if (!fs.existsSync(audioPath)) {
    throw new Error('File audio.mp3 tidak ditemukan.');
  }

  const audioBase64 = fs
    .readFileSync(audioPath)
    .toString('base64');

  const prompt = `
    Dengarkan berkas audio ini dengan saksama.

    Ini adalah konten bertema renungan dan motivasi Islami.

    Tugas Anda:

    1. Pecah isi audio menjadi per kalimat secara berurutan.
    2. Tentukan waktu mulai (start) dan selesai (end) setiap kalimat
       dalam satuan detik.
    3. Buat satu keyword visual dalam bahasa Inggris yang spesifik
       sesuai dengan makna kalimat.
    4. Keyword harus menggambarkan objek, pemandangan, atau suasana
       yang relevan dengan kalimat.
    5. Hindari manusia, wanita, potret, dan figur manusia.
    6. Gunakan visual seperti masjid, Al-Quran, cahaya matahari,
       gunung, laut, hutan, langit, bintang, hujan, jalan,
       arsitektur Islam, dan pemandangan alam.

    Contoh:
    Kalimat: Jangan pernah menyerah dalam berdoa kepada Allah.
    Keyword: peaceful mosque at sunrise

    Kalimat: Allah selalu memberikan jalan bagi hamba-Nya.
    Keyword: beautiful mountain sunrise landscape

    Kalimat: Jangan takut menghadapi masa depan.
    Keyword: golden sunlight through forest

    Kembalikan HANYA JSON Array murni tanpa markdown.

    Format:
    [
      {
        "start": 0.0,
        "end": 3.5,
        "text": "Kalimat transkrip di sini",
        "keyword": "peaceful mosque at sunrise"
      }
    ]
  `;

  let aiResponseText = null;
  let successfulModel = '';

  // ----------------------------------------------------------
  // GEMINI MODEL FALLBACK
  // ----------------------------------------------------------

  for (const modelName of geminiModels) {
    try {
      console.log(
        `[2/4] Menganalisis audio menggunakan Gemini: ${modelName}`
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

      if (aiResponse?.text) {
        aiResponseText = aiResponse.text;
        successfulModel = modelName;

        console.log(
          `[Gemini] Berhasil menggunakan model ${successfulModel}`
        );

        break;
      }

    } catch (error) {
      console.warn(
        `[Gemini] Model ${modelName} gagal: ${error.message}`
      );
    }
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

  // ----------------------------------------------------------
  // IMAGE GENERATION
  // ----------------------------------------------------------

  console.log('[3/4] Memproses gambar setiap scene...');

  const subtitlesData = [];

  for (let i = 0; i < parsedSegments.length; i++) {
    const seg = parsedSegments[i];

    const start = Number(seg.start);
    const end = Number(seg.end);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      throw new Error(`Waktu segment ke-${i + 1} tidak valid.`);
    }

    const keyword = (
      seg.keyword || 'peaceful nature landscape'
    ).trim();

    console.log(
      `[Image ${i + 1}/${parsedSegments.length}] ${keyword}`
    );

    const imagePath = await fetchVerticalNatureImage(
      keyword,
      i
    );

    subtitlesData.push({
      start,
      end,
      text: String(seg.text || '').trim(),
      keyword,
      image: imagePath
    });
  }

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
    gitStatus: gitStatusMessage,
    transcript: fullTranscript,
    subtitles: subtitlesData
  };
}

// ============================================================
// INSTAGRAM PROCESSING
// ============================================================

async function processInstagram(igUrl, autoPushGit = true) {
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

    return await executePipeline(autoPushGit);

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
    const { igUrl, autoPush } = req.body;

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
      autoPushGit
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

// ============================================================
// WHATSAPP
// ============================================================

startWhatsApp({
  processInstagram: (igUrl) => processInstagram(igUrl, true)
}).catch(error => {
  console.error('Gagal menjalankan WhatsApp:', error);
});
