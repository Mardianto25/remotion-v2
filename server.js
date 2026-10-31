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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

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

const PEXELS_FALLBACKS = [
  'https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/15286/pexels-photo.jpg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
  'https://images.pexels.com/photos/3225517/pexels-photo-3225517.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920'
];

async function fetchVerticalNatureImage(keyword, index) {
  const apiKey = process.env.PIXABAY_API_KEY;
  const fallbackUrl = PEXELS_FALLBACKS[index % PEXELS_FALLBACKS.length];

  if (!apiKey) return fallbackUrl;

  try {
    const query = encodeURIComponent(`${keyword} nature`);
    const url = `https://pixabay.com/api/?key=${apiKey}&q=${query}&image_type=photo&orientation=vertical&category=nature&safesearch=true&per_page=5`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.hits && data.hits.length > 0) {
      return data.hits[0].largeImageURL || data.hits[0].webformatURL;
    }
    return fallbackUrl;
  } catch (err) {
    console.warn(`[Pixabay Warning] Gagal memuat gambar untuk keyword "${keyword}". Menggunakan fallback Pexels.`);
    return fallbackUrl;
  }
}

// -------------------------------------------------------------
// FUNGSI UTAMA PIPELINE (Digunakan bersama oleh Upload File & IG Link)
// -------------------------------------------------------------
export async function executePipeline(autoPushGit, res) {
  const audioPath = path.join(publicDir, 'audio.mp3');
  console.log(`[2/4] Menganalisis isi audio menggunakan ${MODEL_NAME}...`);
  const audioBase64 = fs.readFileSync(audioPath).toString('base64');

  const prompt = `
    Dengarkan berkas audio ini dengan saksama.
    Tugas Anda:
    1. Pecah isi audio menjadi per kalimat secara berurutan beserta waktu mulai (start) dan waktu selesai (end) dalam satuan detik (gunakan angka desimal yang akurat).
    2. Untuk setiap kalimat, berikan SATU kata kunci (keyword) dalam bahasa Inggris yang spesifik mengenai suasana alam atau pemandangan yang paling relevan dengan emosi/isi kalimat tersebut (contoh: mountain, rain, forest, ocean, sunset, starry sky, river).

    Kembalikan HANYA format JSON Array murni tanpa blok markdown:
    [
      {
        "start": 0.0,
        "end": 3.5,
        "text": "Kalimat transkrip di sini",
        "keyword": "mountain"
      }
    ]
  `;

  const aiResponse = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
      prompt
    ]
  });

  let rawJson = aiResponse.text.trim();
  rawJson = rawJson.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const parsedSegments = JSON.parse(rawJson);

  console.log('[3/4] Mencari gambar latar belakang vertikal dari Pixabay...');
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

  res.json({
    success: true,
    message: 'Pemrosesan audio & pembuatan data berhasil!',
    gitStatus: gitStatusMessage,
    transcript: fullTranscript,
    subtitles: subtitlesData
  });
}

// -------------------------------------------------------------
// ENDPOINT 1: Upload File Audio Manual (Existing)
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
// ENDPOINT 2: Terima Link Instagram, Download Audio, lalu Proses AI (Baru)
// -------------------------------------------------------------
app.post('/api/process-ig-url', async (req, res) => {
  try {
    const { igUrl, autoPush } = req.body;
    if (!igUrl) {
      return res.status(400).json({ success: false, message: 'Parameter igUrl tidak boleh kosong.' });
    }

    console.log('[IG Parameter] Mengunduh audio dari tautan:', igUrl);
    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    // Menggunakan yt-dlp untuk mengunduh dan mengekstrak audio langsung ke public/audio.mp3
    const ytDlpCommand = `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${igUrl}"`;
    await execAsync(ytDlpCommand);

    if (!fs.existsSync(audioPath)) {
      throw new Error('Gagal mengekstrak audio dari tautan Instagram.');
    }

    console.log('[1/4] Audio dari link Instagram berhasil disimpan di public/audio.mp3');

    const autoPushGit = autoPush === true || autoPush === 'true';
    await executePipeline(autoPushGit, res);

  } catch (error) {
    console.error('[IG Error]:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server Auto-Shorts berjalan di http://localhost:${PORT}`);
});
