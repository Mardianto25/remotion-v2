import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function sanitizeContent(text) {
  if (!text) return '';
  const bannedWords = /\b(ai|artificial intelligence|remotion|gemini|bot|automated|otomatis|algoritma|script|pixabay|pexels)\b/gi;
  return text.replace(bannedWords, '').replace(/\s{2,}/g, ' ').trim();
}

async function generateYouTubeMetadata() {
  const transcriptPath = path.join(process.cwd(), 'public', 'transcript.txt');
  const transcript = fs.existsSync(transcriptPath)
    ? fs.readFileSync(transcriptPath, 'utf8').trim()
    : 'Renungan kehidupan dan ketenangan alam.';

  console.log('[Metadata] Merumuskan judul, deskripsi, dan tags dari transcript.txt...');

  const prompt = `
    Berikut adalah isi narasi suara dari sebuah video pendek:
    "${transcript}"

    Buatlah metadata YouTube Shorts berbahasa Indonesia yang menyentuh hati, reflektif, hangat, dan sangat manusiawi:
    1. "title": Judul yang menyentuh perasaan dan menarik perhatian (panjang maksimal 60 karakter agar tidak terpotong).
    2. "description": Deskripsi beberapa paragraf singkat yang relevan dengan isi narasi, diakhiri dengan hashtag pendukung.
    3. "tags": Sebuah array berisi 8 hingga 12 kata kunci/tag penting (dalam bentuk string) yang sangat relevan dengan isi video ini untuk keperluan SEO YouTube.
    
    ATURAN WAJIB: Dilarang keras menyebutkan kata teknis seperti AI, Remotion, Gemini, otomatis, atau pembuat video.

    Kembalikan HANYA format JSON murni tanpa blok markdown:
    {
      "title": "...",
      "description": "...",
      "tags": ["tag1", "tag2", "tag3"]
    }
  `;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt
  });

  let raw = response.text.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const data = JSON.parse(raw);

  // Pastikan judul ditambahkan hashtag #shorts secara otomatis di belakangnya
  let cleanTitle = sanitizeContent(data.title);
  if (!cleanTitle.toLowerCase().includes('#shorts')) {
    cleanTitle = `${cleanTitle} #shorts`;
  }

  return {
    title: cleanTitle.slice(0, 95),
    description: sanitizeContent(data.description),
    tags: data.tags || ["shorts", "renungan", "inspirasi", "motivasi", "religi"]
  };
}

async function getFreshAccessToken() {
  console.log('[OAuth2] Memperbarui Access Token menggunakan Refresh Token...');
  const response = await fetch('[https://oauth2.googleapis.com/token](https://oauth2.googleapis.com/token)', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Gagal mendapatkan Access Token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function uploadVideoMultipart() {
  const videoPath = path.join(process.cwd(), 'out', 'video.mp4');
  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video tidak ditemukan di ${videoPath}. Pastikan proses render berhasil.`);
  }

  const { title, description, tags } = await generateYouTubeMetadata();
  const accessToken = await getFreshAccessToken();

  const publishDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const metadataObj = {
    snippet: {
      title: title,
      description: description,
      categoryId: '22', // 22 = People & Blogs
      tags: tags
    },
    status: {
      privacyStatus: 'private',
      publishAt: publishDate,
      selfDeclaredMadeForKids: false
    }
  };

  console.log('[Upload] Menyiapkan konstruksi payload multipart/related...');
  const boundary = '-------AutoShortsMultipartBoundary' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadataObj);

  const mediaHeader =
    delimiter +
    'Content-Type: video/mp4\r\n\r\n';

  const videoBuffer = fs.readFileSync(videoPath);

  const multipartBody = Buffer.concat([
    Buffer.from(metadataPart, 'utf8'),
    Buffer.from(mediaHeader, 'utf8'),
    videoBuffer,
    Buffer.from(closeDelimiter, 'utf8')
  ]);

  console.log(`[Upload] Mengunggah video "${title}" ke YouTube...`);
  const uploadUrl = '[https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status](https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status)';

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
      'Content-Length': multipartBody.length.toString()
    },
    body: multipartBody
  });

  const result = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`YouTube API Upload Error: ${JSON.stringify(result)}`);
  }

  console.log('✅ Video berhasil diunggah ke YouTube!');
  console.log(`📌 Video ID       : ${result.id}`);
  console.log(`📌 Judul          : ${result.snippet.title}`);
  console.log(`📌 Tags           : ${result.snippet.tags?.join(', ')}`);
  console.log(`📌 Jadwal Tayang  : ${result.status.publishAt}`);
}

uploadVideoMultipart().catch((err) => {
  console.error('❌ Gagal menjalankan pipeline unggah YouTube:', err);
  process.exit(1);
});
