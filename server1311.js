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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ambil daftar model dari ENV dalam bentuk array, berikan default jika kosong
const geminiModels = process.env.GEMINI_MODELS 
  ? process.env.GEMINI_MODELS.split(',').map(m => m.trim())
  : ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash'];

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, publicDir),
  filename: (req, file, cb) => cb(null, 'audio.mp3')
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));

// Daftar fallback aman: hanya masjid, arsitektur, dan pemandangan alam (tanpa figur manusia/wanita)
const PEXELS_FALLBACKS = [
  'https://images.pexels.com/photos/4388167/pexels-photo-4388167.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920', // Masjid / Kubah
  'https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',  // Hutan / Alam
  'https://images.pexels.com/photos/8111394/pexels-photo-8111394.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920', // Interior Masjid
  'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920', // Pemandangan Gunung
  'https://images.pexels.com/photos/3881104/pexels-photo-3881104.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920'  // Langit Senja / Sunset
];

async function fetchVerticalNatureImage(keyword, index) {
  const apiKey = process.env.PIXABAY_API_KEY;
  const fallbackUrl = PEXELS_FALLBACKS[(index + Math.floor(Math.random() * 10)) % PEXELS_FALLBACKS.length];

  if (!apiKey) return fallbackUrl;

  try {
    // Membatasi kueri agar fokus pada pemandangan atau arsitektur (tanpa figur manusia)
    let searchQuery = keyword;
    if (index % 2 === 0) {
      searchQuery = `${keyword} nature landscape no people`; 
    } else {
      searchQuery = `${keyword} mosque architecture scenery no people`; 
    }

    const query = encodeURIComponent(searchQuery);
    // Mengambil hingga 20 hasil agar memiliki banyak pilihan (pool)
    const url = `https://pixabay.com/api/?key=${apiKey}&q=${query}&image_type=photo&orientation=vertical&safesearch=true&per_page=20`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    // Filter tambahan untuk memastikan tidak mengambil foto yang mengandung manusia/potret
    if (data.hits && data.hits.length > 0) {
      const safeHits = data.hits.filter(hit => 
        !hit.tags.includes('woman') && 
        !hit.tags.includes('girl') && 
        !hit.tags.includes('model') && 
        !hit.tags.includes('person') &&
        !hit.tags.includes('people')
      );

      const poolToChoose = safeHits.length > 0 ? safeHits : data.hits;
      
      // Pilih secara ACAK dari daftar yang aman agar antar video tidak monoton/sama persis
      const randomHit = poolToChoose[Math.floor(Math.random() * poolToChoose.length)];

      return randomHit.largeImageURL || randomHit.webformatURL;
    }
    return fallbackUrl;
  } catch (err) {
    console.warn(`[Pixabay Warning] Gagal memuat gambar untuk keyword "${keyword}". Menggunakan fallback aman.`);
    return fallbackUrl;
  }
}

// -------------------------------------------------------------
// FUNGSI UTAMA PIPELINE (Dengan Fallback Model Gemini & Tema Islami + Alam)
// -------------------------------------------------------------
export async function executePipeline(autoPushGit = true) {
  const audioPath = path.join(publicDir, 'audio.mp3');
  const audioBase64 = fs.readFileSync(audioPath).toString('base64');

  const prompt = `
    Dengarkan berkas audio ini dengan saksama. Ini adalah konten bertema renungan dan motivasi Islami.
    Tugas Anda:
    1. Pecah isi audio menjadi per kalimat secara berurutan beserta waktu mulai (start) dan waktu selesai (end) dalam satuan detik.
    2. Untuk setiap kalimat, berikan SATU kata kunci (keyword) dalam bahasa Inggris yang spesifik mengenai pemandangan alam atau arsitektur masjid yang menenangkan (HANYA OBJEK/PEMANDANGAN, TANPA FIGUR MANUSIA, contoh: grand mosque, quran, mountain, ocean, forest, sunset, starry sky, islamic architecture, river).

    Kembalikan HANYA format JSON Array murni tanpa blok markdown:
    [
      {
        "start": 0.0,
        "end": 3.5,
        "text": "Kalimat transkrip di sini",
        "keyword": "grand mosque"
      }
    ]
  `;

  let aiResponseText = null;
  let successfulModel = '';

  // Iterasi mencoba model Gemini secara berurutan dari array
  for (const modelName of geminiModels) {
    try {
      console.log(`[2/4] Menganalisis isi audio menggunakan model Gemini: ${modelName}...`);
      const aiResponse = await ai.models.generateContent({
        model: modelName,
        contents: [
          { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
          prompt
        ]
      });

      if (aiResponse && aiResponse.text) {
        aiResponseText = aiResponse.text;
        successfulModel = modelName;
        console.log(`✅ Berhasil menganalisis audio menggunakan model: ${successfulModel}`);
        break;
      }
    } catch (err) {
      console.warn(`⚠️ Model ${modelName} gagal, mencoba model Gemini berikutnya...`);
    }
  }

  if (!aiResponseText) {
    throw new Error('Semua model Gemini di dalam array gagal memproses analisis audio.');
  }

  let rawJson = aiResponseText.trim();
  rawJson = rawJson.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const parsedSegments = JSON.parse(rawJson);

  console.log('[3/4] Mencari gambar latar belakang aman secara acak (Mix Alam & Masjid) dari Pixabay...');
  const subtitlesData = [];

  for (let i = 0; i < parsedSegments.length; i++) {
    const seg = parsedSegments[i];
    const imageUrl = await fetchVerticalNatureImage(seg.keyword, i);
    subtitlesData.push({
      start: Number(seg.start),
      end: Number(seg.end),
      text: seg.text.trim(),
      keyword: seg.keyword.trim(),
      image: imageUrl
    });
  }

  const subtitlesPath = path.join(publicDir, 'subtitles.json');
  fs.writeFileSync(subtitlesPath, JSON.stringify(subtitlesData, null, 2), 'utf8');

  const fullTranscript = subtitlesData.map(item => item.text).join(' ');
  const transcriptPath = path.join(publicDir, 'transcript.txt');
  fs.writeFileSync(transcriptPath, fullTranscript, 'utf8');

  console.log('[4/4] Berkas public/subtitles.json dan public/transcript.txt berhasil dibuat!');

  let gitStatusMessage = 'Selesai tanpa Git Push.';
  if (autoPushGit) {
    console.log('[Git] Mengirim pembaruan berkas ke GitHub untuk memulai render Actions...');
    try {
      await execAsync('git add public/audio.mp3 public/subtitles.json public/transcript.txt');
      await execAsync('git commit -m "chore: update audio and subtitles data for auto-render"');
      await execAsync('git push');
      gitStatusMessage = 'Berhasil push ke GitHub! GitHub Actions sedang merender & mengunggah video Anda.';
    } catch (gitErr) {
      console.warn('[Git Warning]:', gitErr.message);
      gitStatusMessage = `Pemrosesan lokal berhasil, namun Git push terkendala: ${gitErr.message}`;
    }
  }

  return {
    success: true,
    message: 'Pemrosesan audio & pembuatan data berhasil!',
    modelUsed: successfulModel,
    gitStatus: gitStatusMessage,
    transcript: fullTranscript,
    subtitles: subtitlesData
  };

  // if (res) {
  //   res.json({
  //     success: true,
  //     message: 'Pemrosesan audio & pembuatan data berhasil!',
  //     modelUsed: successfulModel,
  //     gitStatus: gitStatusMessage,
  //     transcript: fullTranscript,
  //     subtitles: subtitlesData
  //   });
  // }
}


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

    const ytDlpCommand = `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${igUrl}"`;

console.log('[IG URL] Command:', ytDlpCommand);

await execAsync(ytDlpCommand);

    // await execAsync('yt-dlp', [
    //   '--js-runtimes',
    //   'node',
    //   '-x',
    //   '--audio-format',
    //   'mp3',
    //   '-o',
    //   audioPath,
    //   parsedUrl.toString()
    // ]);

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

// -------------------------------------------------------------
// ENDPOINT 1: Upload File Audio Manual
// -------------------------------------------------------------
app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Tidak ada file audio yang diunggah.' });
    }

    const autoPushGit = req.body.autoPush === 'true';
    console.log('[1/4] Audio berhasil disimpan di public/audio.mp3');

    await executePipeline(autoPushGit, res);

  } catch (error) {
    console.error('[Error]:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// ENDPOINT 2: Terima Link, Download Audio, lalu Proses AI
// -------------------------------------------------------------
app.post('/api/process-url', async (req, res) => {
  try {
    const { videoUrl, autoPush } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ success: false, message: 'Parameter videoUrl tidak boleh kosong.' });
    }

    console.log('[URL Parameter] Mengunduh audio dari tautan:', videoUrl);
    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    const ytDlpCommand = `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${videoUrl}"`;
    await execAsync(ytDlpCommand);

    if (!fs.existsSync(audioPath)) {
      throw new Error('Gagal mengekstrak audio dari tautan yang diberikan.');
    }

    console.log('[1/4] Audio berhasil disimpan di public/audio.mp3');

    const autoPushGit = autoPush === true || autoPush === 'true';
    await executePipeline(autoPushGit, res);

  } catch (error) {
    console.error('[URL Error]:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// ENDPOINT 2B: Khusus Link Instagram Reels
// -------------------------------------------------------------
app.post('/api/process-ig-url', async (req, res) => {
  try {
    const { igUrl, autoPush } = req.body;
    if (!igUrl) {
      return res.status(400).json({ success: false, message: 'Parameter igUrl tidak boleh kosong.' });
    }

    console.log('[IG URL] Mengunduh audio dari Instagram:', igUrl);
    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    const ytDlpCommand = `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${igUrl}"`;
    await execAsync(ytDlpCommand);

    if (!fs.existsSync(audioPath)) {
      throw new Error('Gagal mengekstrak audio dari tautan Instagram yang diberikan.');
    }

    console.log('[1/4] Audio Instagram berhasil disimpan di public/audio.mp3');

    const autoPushGit = autoPush === true || autoPush === 'true';
    const result = await executePipeline(autoPushGit);
    return res.json(result);
    // await executePipeline(autoPushGit, res);

  } catch (error) {
    console.error('[IG URL Error]:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server Auto-Shorts berjalan di http://localhost:${PORT}`);
});

startWhatsApp({
  processInstagram: (igUrl) => processInstagram(igUrl, true)
}).catch(error => {
  console.error('Gagal menjalankan WhatsApp:', error);
});



// import express from 'express';
// import multer from 'multer';
// import fs from 'fs';
// import path from 'path';
// import { exec } from 'child_process';
// import { promisify } from 'util';
// import { GoogleGenAI } from '@google/genai';
// // import { google } from 'googleapis';
// import dotenv from 'dotenv';

// dotenv.config();

// const execAsync = promisify(exec);
// const app = express();
// const PORT = process.env.PORT || 3000;

// // Inisialisasi Google GenAI SDK
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// // Ambil daftar model dari ENV dalam bentuk array, berikan default jika kosong
// const geminiModels = process.env.GEMINI_MODELS 
//   ? process.env.GEMINI_MODELS.split(',').map(m => m.trim())
//   : ['gemini-2.5-flash', 'gemini-flash'];

// // Konfigurasi YouTube OAuth2 Client
// // const oauth2Client = new google.auth.OAuth2(
// //   process.env.YOUTUBE_CLIENT_ID,
// //   process.env.YOUTUBE_CLIENT_SECRET,
// //   process.env.YOUTUBE_REDIRECT_URI
// // );

// // oauth2Client.setCredentials({
// //   refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
// // });

// // const youtube = google.youtube({
// //   version: 'v3',
// //   auth: oauth2Client
// // });

// const publicDir = path.join(process.cwd(), 'public');
// if (!fs.existsSync(publicDir)) {
//   fs.mkdirSync(publicDir, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, publicDir),
//   filename: (req, file, cb) => cb(null, 'audio.mp3')
// });
// const upload = multer({ storage });

// app.use(express.json());
// app.use(express.static('public'));

// // Daftar fallback aman: hanya masjid, arsitektur, dan pemandangan alam (tanpa figur manusia/wanita)
// const PEXELS_FALLBACKS = [
//   'https://images.pexels.com/photos/4388167/pexels-photo-4388167.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920', // Masjid / Kubah
//   'https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',  // Hutan / Alam
//   'https://images.pexels.com/photos/8111394/pexels-photo-8111394.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920', // Interior Masjid
//   'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920', // Pemandangan Gunung
//   'https://images.pexels.com/photos/3881104/pexels-photo-3881104.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920'  // Langit Senja / Sunset
// ];

// // Agent Tool: Pencarian visual cerdas & aman dari figur manusia
// async function executeAgentVisualSearch(keyword, index) {
//   const apiKey = process.env.PIXABAY_API_KEY;
//   const fallbackUrl = PEXELS_FALLBACKS[index % PEXELS_FALLBACKS.length];

//   if (!apiKey) return fallbackUrl;

//   try {
//     let searchQuery = keyword;
//     if (index % 2 === 0) {
//       searchQuery = `${keyword} nature landscape no people`; 
//     } else {
//       searchQuery = `${keyword} mosque architecture scenery no people`; 
//     }

//     const query = encodeURIComponent(searchQuery);
//     const url = `https://pixabay.com/api/?key=${apiKey}&q=${query}&image_type=photo&orientation=vertical&safesearch=true&per_page=10`;
    
//     const response = await fetch(url);
//     if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
//     const data = await response.json();
    
//     // Filter agen untuk memastikan tidak ada figur manusia/wanita
//     if (data.hits && data.hits.length > 0) {
//       const safeHit = data.hits.find(hit => 
//         !hit.tags.includes('woman') && 
//         !hit.tags.includes('girl') && 
//         !hit.tags.includes('model') && 
//         !hit.tags.includes('person') &&
//         !hit.tags.includes('people')
//       ) || data.hits[0];

//       return safeHit.largeImageURL || safeHit.webformatURL;
//     }
//     return fallbackUrl;
//   } catch (err) {
//     console.warn(`[Agent Tool Warning] Gagal memuat gambar untuk keyword "${keyword}". Menggunakan fallback aman.`);
//     return fallbackUrl;
//   }
// }

// // Fungsi Agen untuk menentukan slot waktu upload otomatis (Prime Time Islami: 05.00, 12.30, 19.30 WIB)
// function getNextUploadSlot() {
//   const now = new Date();
//   const targetTimes = [
//     { hour: 5, minute: 0 },   // Pagi (05.00 WIB)
//     { hour: 12, minute: 30 }, // Siang (12.30 WIB)
//     { hour: 19, minute: 30 }  // Malam (19.30 WIB)
//   ];

//   for (const target of targetTimes) {
//     const slotDate = new Date(now);
//     slotDate.setHours(target.hour, target.minute, 0, 0);

//     if (slotDate.getTime() > now.getTime()) {
//       return slotDate.toISOString();
//     }
//   }

//   const tomorrowSlot = new Date(now);
//   tomorrowSlot.setDate(tomorrowSlot.getDate() + 1);
//   tomorrowSlot.setHours(targetTimes[0].hour, targetTimes[0].minute, 0, 0);

//   return tomorrowSlot.toISOString();
// }

// // -------------------------------------------------------------
// // AGENTIC PIPELINE UTAMA
// // -------------------------------------------------------------
// async function runContentAgent(autoPushGit, res) {
//   const audioPath = path.join(publicDir, 'audio.mp3');
//   const audioBase64 = fs.readFileSync(audioPath).toString('base64');

//   const agentPrompt = `
//     Anda adalah Autonomous Content Director Agent untuk channel YouTube Shorts Islami.
//     Tugas Anda:
//     1. Dengarkan berkas audio ini dengan saksama dan analisis isinya.
//     2. Pecah isi audio menjadi per kalimat secara berurutan beserta waktu mulai (start) dan waktu selesai (end) dalam satuan detik.
//     3. Untuk setiap kalimat, tentukan SATU kata kunci (keyword) dalam bahasa Inggris yang spesifik mengenai pemandangan alam atau arsitektur masjid yang menenangkan (HANYA OBJEK/PEMANDANGAN, TANPA FIGUR MANUSIA, contoh: grand mosque, quran, mountain, ocean, forest, sunset, starry sky, islamic architecture, river).

//     Kembalikan HANYA format JSON Array murni tanpa blok markdown:
//     [
//       {
//         "start": 0.0,
//         "end": 3.5,
//         "text": "Kalimat transkrip di sini",
//         "keyword": "grand mosque"
//       }
//     ]
//   `;

//   let aiResponseText = null;
//   let successfulModel = '';

//   // Agen mengevaluasi model Gemini secara bergantian (Fallback Model)
//   for (const modelName of geminiModels) {
//     try {
//       console.log(`[Agent AI] Menganalisis audio menggunakan model Gemini: ${modelName}...`);
//       const aiResponse = await ai.models.generateContent({
//         model: modelName,
//         contents: [
//           { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
//           agentPrompt
//         ]
//       });

//       if (aiResponse && aiResponse.text) {
//         aiResponseText = aiResponse.text;
//         successfulModel = modelName;
//         console.log(`✅ [Agent AI] Berhasil menganalisis audio menggunakan model: ${successfulModel}`);
//         break;
//       }
//     } catch (err) {
//       console.warn(`⚠️ Model ${modelName} gagal, agen mencoba model Gemini berikutnya...`);
//     }
//   }

//   if (!aiResponseText) {
//     throw new Error('Semua model Gemini di dalam array agen gagal memproses analisis audio.');
//   }

//   let rawJson = aiResponseText.trim();
//   rawJson = rawJson.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
//   const parsedSegments = JSON.parse(rawJson);

//   console.log('[Agent Tool] Menjalankan otonom pencarian aset visual (Mix Alam & Masjid)...');
//   const subtitlesData = [];

//   for (let i = 0; i < parsedSegments.length; i++) {
//     const seg = parsedSegments[i];
//     const imageUrl = await executeAgentVisualSearch(seg.keyword, i);
//     subtitlesData.push({
//       start: Number(seg.start),
//       end: Number(seg.end),
//       text: seg.text.trim(),
//       keyword: seg.keyword.trim(),
//       image: imageUrl
//     });
//   }

//   const subtitlesPath = path.join(publicDir, 'subtitles.json');
//   fs.writeFileSync(subtitlesPath, JSON.stringify(subtitlesData, null, 2), 'utf8');

//   const fullTranscript = subtitlesData.map(item => item.text).join(' ');
//   const transcriptPath = path.join(publicDir, 'transcript.txt');
//   fs.writeFileSync(transcriptPath, fullTranscript, 'utf8');

//   console.log('[Agent AI] Berkas public/subtitles.json dan public/transcript.txt berhasil disusun!');

//   let gitStatusMessage = 'Selesai tanpa Git Push.';
//   if (autoPushGit) {
//     console.log('[Git Agent] Mengirim pembaruan berkas ke GitHub untuk memulai render Actions...');
//     try {
//       await execAsync('git add public/audio.mp3 public/subtitles.json public/transcript.txt');
//       await execAsync('git commit -m "chore(agent): autonomous update audio and subtitles data for auto-render"');
//       await execAsync('git push');
//       gitStatusMessage = 'Berhasil push ke GitHub secara otonom! GitHub Actions sedang merender video.';
//     } catch (gitErr) {
//       console.warn('[Git Warning]:', gitErr.message);
//       gitStatusMessage = `Pemrosesan lokal agen berhasil, namun Git push terkendala: ${gitErr.message}`;
//     }
//   }

//   if (res) {
//     res.json({
//       success: true,
//       message: 'Agentic pipeline berhasil memproses audio & data visual!',
//       modelUsed: successfulModel,
//       gitStatus: gitStatusMessage,
//       transcript: fullTranscript,
//       subtitles: subtitlesData
//     });
//   }
// }

// // -------------------------------------------------------------
// // ENDPOINT 1: Upload File Audio Manual (Agent Driven)
// // -------------------------------------------------------------
// app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ success: false, message: 'Tidak ada file audio yang diunggah.' });
//     }

//     const autoPushGit = req.body.autoPush === 'true';
//     console.log('[1/4] Audio berhasil disimpan di public/audio.mp3');

//     await runContentAgent(autoPushGit, res);

//   } catch (error) {
//     console.error('[Agent Error]:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // -------------------------------------------------------------
// // ENDPOINT 2: Terima Link Umum, Download Audio, lalu Proses Agent
// // -------------------------------------------------------------
// app.post('/api/process-url', async (req, res) => {
//   try {
//     const { videoUrl, autoPush } = req.body;
//     if (!videoUrl) {
//       return res.status(400).json({ success: false, message: 'Parameter videoUrl tidak boleh kosong.' });
//     }

//     console.log('[URL Parameter] Mengunduh audio dari tautan:', videoUrl);
//     const audioPath = path.join(publicDir, 'audio.mp3');

//     if (fs.existsSync(audioPath)) {
//       fs.unlinkSync(audioPath);
//     }

//     const ytDlpCommand = `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${videoUrl}"`;
//     await execAsync(ytDlpCommand);

//     if (!fs.existsSync(audioPath)) {
//       throw new Error('Gagal mengekstrak audio dari tautan yang diberikan.');
//     }

//     console.log('[1/4] Audio berhasil disimpan di public/audio.mp3');

//     const autoPushGit = autoPush === true || autoPush === 'true';
//     await runContentAgent(autoPushGit, res);

//   } catch (error) {
//     console.error('[URL Error]:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // -------------------------------------------------------------
// // ENDPOINT 2B: Khusus Link Instagram Reels
// // -------------------------------------------------------------
// app.post('/api/process-ig-url', async (req, res) => {
//   try {
//     const { igUrl, autoPush } = req.body;
//     if (!igUrl) {
//       return res.status(400).json({ success: false, message: 'Parameter igUrl tidak boleh kosong.' });
//     }

//     console.log('[IG URL] Mengunduh audio dari Instagram:', igUrl);
//     const audioPath = path.join(publicDir, 'audio.mp3');

//     if (fs.existsSync(audioPath)) {
//       fs.unlinkSync(audioPath);
//     }

//     const ytDlpCommand = `yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${igUrl}"`;
//     await execAsync(ytDlpCommand);

//     if (!fs.existsSync(audioPath)) {
//       throw new Error('Gagal mengekstrak audio dari tautan Instagram yang diberikan.');
//     }

//     console.log('[1/4] Audio Instagram berhasil disimpan di public/audio.mp3');

//     const autoPushGit = autoPush === true || autoPush === 'true';
//     await runContentAgent(autoPushGit, res);

//   } catch (error) {
//     console.error('[IG URL Error]:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // -------------------------------------------------------------
// // ENDPOINT 3: Upload & Jadwalkan Otomatis ke YouTube (Prime Time & Related Video)
// // -------------------------------------------------------------
// app.post('/api/upload-youtube', async (req, res) => {
//   try {
//     const videoPath = path.join(process.cwd(), 'out', 'output.mp4');
    
//     if (!fs.existsSync(videoPath)) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'File video output.mp4 belum ditemukan. Pastikan video sudah dirender terlebih dahulu.' 
//       });
//     }

//     const publishDate = getNextUploadSlot();
//     console.log(`[YouTube Agent] Menjadwalkan video pada: ${publishDate}`);

//     const metadataPath = path.join(publicDir, 'metadata.json');
//     let title = "Renungan Harian #shorts";
//     let description = "Kumpulan renungan dan motivasi Islami penyejuk hati. #shorts #islamic";
//     let tags = ["shorts", "islamic", "motivasi", "renungan"];

//     if (fs.existsSync(metadataPath)) {
//       const metaData = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
//       title = metaData.title || title;
//       description = metaData.description || description;
//       if (metaData.tags) tags = metaData.tags;
//     }

//     const metadataObj = {
//       snippet: {
//         title: title,
//         description: description,
//         categoryId: '22',
//         tags: tags
//       },
//       status: {
//         privacyStatus: 'private',
//         publishAt: publishDate,
//         selfDeclaredMadeForKids: false
//       },
//       contentDetails: {
//         relatedVideoId: 'hWnuH6uVSLw' // ID Video terkait
//       }
//     };

//     const boundary = 'foo_bar_baz';
//     let multipartBody = '';

//     multipartBody += `--${boundary}\r\n`;
//     multipartBody += `Content-Type: application/json; charset=UTF-8\r\n\r\n`;
//     multipartBody += JSON.stringify(metadataObj) + `\r\n`;

//     multipartBody += `--${boundary}\r\n`;
//     multipartBody += `Content-Type: video/mp4\r\n\r\n`;

//     const videoBuffer = fs.readFileSync(videoPath);
//     const fullBody = Buffer.concat([
//       Buffer.from(multipartBody, 'utf8'),
//       videoBuffer,
//       Buffer.from(`\r\n--${boundary}--`, 'utf8')
//     ]);

//     const uploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status,contentDetails';
    
//     const { token } = await oauth2Client.getAccessToken();

//     const uploadRes = await fetch(uploadUrl, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': `multipart/related; boundary="${boundary}"`,
//         'Content-Length': fullBody.length.toString()
//       },
//       body: fullBody
//     });

//     const result = await uploadRes.json();
//     if (!uploadRes.ok) {
//       throw new Error(`YouTube API Upload Error: ${JSON.stringify(result)}`);
//     }

//     console.log(`[YouTube Berhasil] Video berhasil dijadwalkan dengan ID: ${result.id}`);
//     res.json({
//       success: true,
//       message: 'Video berhasil dijadwalkan ke YouTube oleh agen!',
//       youtubeData: result
//     });

//   } catch (error) {
//     console.error('[YouTube Endpoint Error]:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Autonomous Agent Server berjalan di http://localhost:${PORT}`);
// });

