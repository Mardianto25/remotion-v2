import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

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
    1. "title": Judul utama yang menyentuh perasaan dan menarik perhatian (panjang maksimal 50 karakter).
    2. "hashtags": Sebuah string berisi 2 sampai 3 hashtag pendek yang sangat relevan (misalnya: #shorts #renungan #inspirasi).
    3. "description": Deskripsi beberapa paragraf singkat yang relevan dengan isi narasi, diakhiri dengan hashtag pendukung.
    4. "tags": Sebuah array berisi 8 hingga 12 kata kunci/tag penting (dalam bentuk string) untuk keperluan SEO YouTube.
    
    ATURAN WAJIB: Dilarang keras menyebutkan kata teknis seperti AI, Remotion, Gemini, otomatis, atau pembuat video.

    Kembalikan HANYA format JSON murni tanpa blok markdown:
    {
      "title": "...",
      "hashtags": "#shorts #renungan",
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

  // Gabungkan judul bersih dengan hashtag yang disediakan AI (pastikan #shorts selalu ada)
  let cleanTitle = sanitizeContent(data.title);
  let hashtags = data.hashtags || '#shorts';
  if (!hashtags.toLowerCase().includes('#shorts')) {
    hashtags = `#shorts ${hashtags}`;
  }

  const finalTitle = `${cleanTitle} ${hashtags}`.slice(0, 95);

  return {
    title: finalTitle,
    description: sanitizeContent(data.description),
    tags: data.tags || ["shorts", "renungan", "inspirasi", "motivasi", "religi"]
  };
}

async function getFreshAccessToken() {
  console.log('[OAuth2] Memperbarui Access Token menggunakan Refresh Token...');
  
  // Pastikan URL di bawah ini bersih tanpa kurung siku ganda
  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  // const publishDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const publishDate = await getNextUploadSlot();
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
    },
    contentDetails: {
      relatedVideoId: 'hWnuH6uVSLw'
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
  const uploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status,contentDetails';

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

  const videoId = result.id;
  
  // Upload thumbnail
  await uploadYouTubeThumbnail(videoId, accessToken);

  console.log('✅ Video berhasil diunggah ke YouTube!');
  console.log(`📌 Video ID       : ${result.id}`);
  console.log(`📌 Judul          : ${result.snippet.title}`);
  console.log(`📌 Tags           : ${result.snippet.tags?.join(', ')}`);
  console.log(`📌 Jadwal Tayang  : ${result.status.publishAt}`);
}

async function getNextUploadSlot() {
  const now = new Date();

  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const wibTime = new Date(utc + (3600000 * 7));

  
  // Daftar jam target penayangan dalam format 24 jam (Jam 05.30, 11.30, dan 18.30)
  const targetTimes = [
    { hour: 5, minute: 0 },
    { hour: 11, minute: 30 },
    { hour: 18, minute: 30 }
  ];

  // Cari slot jam pertama hari ini yang belum terlewat oleh waktu sekarang
  for (const target of targetTimes) {
    const slotDate = new Date(wibTime);
    slotDate.setHours(target.hour, target.minute, 0, 0);

    // Jika waktu target hari ini masih di masa depan (belum terlewat), pilih jam ini!
    if (slotDate.getTime() > wibTime.getTime()) {
      return slotDate.toISOString();
    }
  }

  // Jika semua jam target hari ini (pagi, sore, malam) sudah terlewat, 
  // otomatis masuk ke slot jam target pertama (pagi 05.30) di keesokan harinya.
  const tomorrowSlot = new Date(wibTime);
  tomorrowSlot.setDate(tomorrowSlot.getDate() + 1);
  tomorrowSlot.setHours(targetTimes[0].hour, targetTimes[0].minute, 0, 0);

  return tomorrowSlot.toISOString();
}

// Contoh penggunaan saat melakukan penjadwalan:
// const publishDate = getNextUploadSlot();

// Fungsi untuk otomatis mengambil ID video terakhir dari channel Anda
async function getLatestVideoId() {
  try {
    const response = await youtube.search.list({
      part: 'snippet',
      forMe: true, // atau menggunakan channelId Anda
      maxResults: 1,
      order: 'date', // Mengambil video berdasarkan yang paling baru
      type: 'video'
    });

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].id.videoId;
    }
    return null;
  } catch (error) {
    console.log('[Info] Gagal mengambil video otomatis, melanjutkan tanpa video terkait.');
    return null;
  }
}


async function uploadYouTubeThumbnail(videoId, accessToken) {
  const thumbnailPath = path.join(process.cwd(), 'out', 'thumbnail.jpg');

  if (!fs.existsSync(thumbnailPath)) {
    throw new Error(`Thumbnail tidak ditemukan: ${thumbnailPath}`);
  }

  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg'
      },
      body: fs.readFileSync(thumbnailPath)
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `Gagal upload thumbnail: ${JSON.stringify(result)}`
    );
  }

  console.log('Thumbnail berhasil dipasang:', videoId);
  return result;
}


uploadVideoMultipart().catch((err) => {
  console.error('❌ Gagal menjalankan pipeline unggah YouTube:', err);
  process.exit(1);
});
