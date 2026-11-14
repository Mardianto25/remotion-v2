
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
// PRIORITAS UTAMA
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

  const visualRules = `
    Cinematic photorealistic photography,
    vertical 9:16 composition,
    highly detailed and realistic human expressions,
    accurate human anatomy,
    natural body proportions,
    highly detailed and realistic actions and activities,
    accurate depiction of events and situations,
    realistic human interactions and body movements,
    detailed objects and environmental elements relevant to the scene,
    accurate representation of the story and its context,
    every visual detail must match the described scene,
    dramatic cinematic lighting,
    realistic environment,
    visually accurate and detailed representation of the entire described scene.

    ISLAMIC VISUAL GUIDELINES:

    If a woman appears, portray her wearing a modest
    Islamic hijab covering her hair and neck,
    with modest loose Islamic clothing.

    Muslim men should wear modest clothing.

    Use respectful Islamic atmosphere and visual context.
    
    MANDATORY HIJAB REQUIREMENT:
    
    Every woman appearing in any scene MUST wear
    a proper Islamic hijab.
    
    - Hair must be completely covered.
    - No visible hair strands.
    - No exposed forehead hair or bangs.
    - Ears must be completely covered.
    - Neck must be completely covered.
    - Hijab must cover the head, hair, ears, and neck.
    - Hijab must be properly worn and securely fitted.
    
    NEVER generate:
    - Women without hijab.
    - Women with uncovered hair.
    - Women with partially covered hair.
    - Women wearing only headbands or scarves that
    leave their hair visible.
    - Women with loose hair or ponytails.
    - Women with exposed necks.
    
    All women must wear modest Islamic clothing
    in every scene without exception.
    
    If a scene requires a woman, always depict her
    as a Muslim woman wearing a complete hijab.
    
    This requirement overrides any conflicting
    visual interpretation of the scene.

    STRICT RELIGIOUS RESTRICTIONS:

    No Jesus.
    No crosses.
    No crucifixes.
    No churches.
    No Christian iconography.
    No unrelated religious symbols.

    Never depict Allah or Islamic prophets.

    No text, captions, logos, or watermarks.

    SCENE COMPOSITION AND SUBJECT SELECTION:

    Choose the visual subject based on the actual scene description.
    
    Do not automatically include human faces or characters
    in every scene.
    
    Include people only when they are relevant to the
    described event or activity.
    
    When appropriate, focus on:
    - Specific human activities and interactions.
    - Hands performing meaningful actions.
    - Relevant objects and important details.
    - Buildings, rooms, and locations.
    - Environmental or symbolic elements.
    
    Use close-up, medium, and wide shots depending
    on the actual scene.
    
    Do not use generic portraits or emotional facial
    expressions as a substitute for depicting the event.
    
    Do not replace important people, activities, or events
    with unrelated landscapes.
    
    Every image must communicate the actual event
    described in its corresponding narration.

    IMPORTANT:

    Follow the actual scene description.
    Do not replace people with landscapes.
    Do not generate empty nature scenery unless
    the description specifically requests it.
  `;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `${prompt}. ${visualRules}`,
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
// FLUX -> PIXABAY -> PEXELS FALLBACK
// ============================================================

async function fetchVerticalNatureImage(imagePrompt, keyword, index) {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 10000);

  const filename =
    `scene-${String(index + 1).padStart(3, '0')}-${timestamp}-${randomId}`;

  const fluxFilename = `${filename}.png`;
  const pixabayFilename = `${filename}.jpg`;

  const fallbackUrl =
    PEXELS_FALLBACKS[index % PEXELS_FALLBACKS.length];

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
  // 2. PIXABAY - FALLBACK
  // ----------------------------------------------------------

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
        const selected =
          hits[Math.floor(Math.random() * hits.length)];

        const imageUrl =
          selected.largeImageURL || selected.webformatURL;

        const imagePath = await downloadImage(
          imageUrl,
          pixabayFilename
        );

        console.log(`[Pixabay] Berhasil: ${imagePath}`);

        return imagePath;
      }

      console.log('[Pixabay] Tidak menemukan gambar.');

    } catch (error) {
      console.warn('[Pixabay Warning]:', error.message);
    }
  } else {
    console.log('[Pixabay] API key tidak tersedia.');
  }

  // ----------------------------------------------------------
  // 3. PEXELS - FALLBACK TERAKHIR
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
    Dengarkan audio ini dengan saksama.

    Konten merupakan renungan dan motivasi Islami.

    TUGAS:

    Bagi audio menjadi beberapa scene berdasarkan perubahan
    makna kalimat. Setiap scene memiliki satu gambar yang
    menggambarkan isi narasi secara langsung.

    HASILKAN FIELD:

    1. start: waktu mulai dalam detik.
    2. end: waktu selesai dalam detik.
    3. text: transkrip asli sesuai audio.
    4. keyword: keyword singkat dalam bahasa Inggris untuk Pixabay.
    5. imagePrompt: deskripsi visual detail dalam bahasa Inggris
       untuk AI image generator FLUX.

    ATURAN IMAGE PROMPT:

    - Visual harus sesuai dengan makna kalimat,
      bukan sekadar suasana atau pemandangan umum.
    - Utamakan manusia, ekspresi, aktivitas,
      hubungan keluarga, dan objek yang disebutkan.
    - Jika menyebut anak, gambarkan anak.
    - Jika menyebut ibu atau ayah, gambarkan orang tua.
    - Jika menyebut suami dan istri, gambarkan pasangan.
    - Jika menyebut perempuan Muslim, gambarkan perempuan
      menggunakan hijab yang menutup rambut dan leher
      serta pakaian Muslimah yang sopan.
    - Jika menyebut laki-laki Muslim, gambarkan dengan
      pakaian yang sopan.
    - Jangan otomatis menggunakan pemandangan alam
      untuk menggantikan karakter manusia.
    - Jika membahas neraka atau hari penghakiman,
      gambarkan suasana simbolis yang dramatis:
      kobaran api, kegelapan, kerumunan manusia ketakutan,
      dan cahaya dramatis. Tidak perlu gore.
    - Jika membahas akhirat, gunakan visual yang menghormati
      keyakinan Islam.
    - Jangan menggambarkan Allah atau para nabi.
    - Jangan membuat Yesus, salib, gereja, crucifix,
      atau simbol agama Kristen.
    - Jangan menambahkan simbol agama lain yang tidak relevan.
    - Jangan membuat tulisan, subtitle, logo, atau watermark.
    - Gunakan cinematic photorealistic photography,
      dramatic lighting, vertical 9:16 composition,
      highly detailed.

    CONTOH PERTAMA:

    Narasi:
    "Dan mereka teriak minta tolong, tolong saya."

    Keyword:
    "crying child asking for help"

    ImagePrompt:
    "A cinematic photorealistic scene of a frightened young
    child crying and reaching out for help, emotional facial
    expression, dramatic dark atmosphere, realistic human
    anatomy, vertical 9:16 composition."

    CONTOH KEDUA:

    Narasi:
    "Lupa dengan suami."

    Keyword:
    "Muslim married couple emotional separation"

    ImagePrompt:
    "A cinematic photorealistic scene of a Muslim husband
    and his hijab-wearing wife standing apart, emotional
    distance, modest Islamic clothing, dramatic lighting,
    vertical 9:16 composition."

    CONTOH KETIGA:

    Narasi:
    "Apa Anda rida masuk surga sementara anak-anak Anda
    berteriak masuk neraka?"

    Keyword:
    "frightened children dramatic fire"

    ImagePrompt:
    "A symbolic cinematic scene of frightened children
    reaching out for help in a dark dramatic environment
    with distant flames and intense atmospheric lighting,
    no gore, vertical 9:16 composition."

    CONTOH KEEMPAT:

    Narasi:
    "Lihat mata Anda di cermin yang penuh dengan dosa."

    Keyword:
    "person looking at mirror emotional reflection"

    ImagePrompt:
    "A cinematic photorealistic close-up of a person
    looking into a dusty mirror with a regretful expression,
    dramatic shadows, emotional atmosphere,
    vertical 9:16 composition."

    ATURAN KEYWORD:

    - Keyword harus spesifik dan sesuai adegan.
    - Jangan selalu menggunakan keyword landscape.
    - Jangan menambahkan kata landscape atau scenery
      jika narasi tidak membahas pemandangan.

    ATURAN WAKTU:

    - Tentukan start dan end sesuai waktu audio.
    - Jangan mengubah urutan kalimat.
    - Jangan menghilangkan bagian narasi.
    - Pastikan end lebih besar daripada start.

    KELUARAN:

    Hanya JSON array valid tanpa markdown.

    FORMAT:

    [
      {
        "start": 0.0,
        "end": 3.5,
        "text": "Kalimat asli dari audio",
        "keyword": "specific visual keyword",
        "imagePrompt": "Detailed cinematic image description"
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

  if (
    !Array.isArray(parsedSegments) ||
    parsedSegments.length === 0
  ) {
    throw new Error(
      'Gemini tidak menghasilkan segment audio yang valid.'
    );
  }

  // ----------------------------------------------------------
  // IMAGE GENERATION
  // FLUX -> PIXABAY -> PEXELS
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
      i
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
