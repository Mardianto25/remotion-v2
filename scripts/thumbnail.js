
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUTPUT_DIR = path.join(ROOT, 'out');

const OUTPUT_PATH = path.join(PUBLIC_DIR, 'thumbnail.jpg');

const TRANSCRIPT_PATH = path.join(PUBLIC_DIR, 'transcript.txt');
const SUBTITLES_PATH = path.join(PUBLIC_DIR, 'subtitles.json');
// const OUTPUT_PATH = path.join(OUTPUT_DIR, 'thumbnail.jpg');

const TEXT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const SOURCE = (process.env.THUMBNAIL_SOURCE || 'auto').toLowerCase();

const WIDTH = 1080;
const HEIGHT = 1920;

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxLength = 18) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);

  return lines.slice(0, 3);
}

async function generateHeadline(transcript) {
  console.log('[Thumbnail] Membuat headline thumbnail...');

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `
Buat headline thumbnail YouTube Shorts berbahasa Indonesia
berdasarkan narasi renungan Islami berikut.

Aturan:
- Maksimal 5 kata.
- Singkat, kuat, emosional, dan membuat penasaran.
- Sesuai isi narasi, jangan membuat klaim yang tidak ada.
- Jangan gunakan hashtag.
- Jangan gunakan tanda kutip.
- Kembalikan hanya headline.

Narasi:
${transcript.slice(0, 5000)}
`
  });

  const headline = (response.text || '')
    .replace(/["'`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!headline) {
    return 'RENUNGAN HARI INI';
  }

  return headline.split(/\s+/).slice(0, 5).join(' ').toUpperCase();
}

async function generateGeminiBackground(transcript) {
  console.log('[Thumbnail] Membuat background menggunakan Gemini Image...');

  const prompt = `
Create a premium cinematic vertical 9:16 background image
for an Indonesian Islamic reflection YouTube Shorts thumbnail.

Narrative theme:
${transcript.slice(0, 2000)}

Visual direction:
- Beautiful peaceful Islamic atmosphere.
- Cinematic lighting and rich contrast.
- Choose a relevant scene such as a beautiful mosque,
  mosque architecture, sunset, mountains, sky, ocean,
  forest or peaceful nature.
- No people, no human figures, no faces.
- No text, no letters, no typography, no watermark.
- Leave the central and lower-middle area visually clean
  for a large headline overlay.
- Professional photography, realistic details.
- Portrait composition, 9:16.
`;

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: {
      responseModalities: ['IMAGE']
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];

  const imagePart = parts.find(part => part.inlineData?.data);

  if (!imagePart) {
    throw new Error('Gemini tidak menghasilkan gambar.');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

function selectExistingImage(subtitles) {
  // Pilih segmen dengan narasi paling panjang sebagai representasi tema.
  const sorted = [...subtitles]
    .filter(item => item.image)
    .sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0));

  if (!sorted.length) {
    throw new Error('Tidak ada URL gambar pada subtitles.json.');
  }

  return sorted[0].image;
}

async function downloadExistingImage(subtitles) {
  const imageUrl = selectExistingImage(subtitles);
  const parsedUrl = new URL(imageUrl);

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('URL gambar harus menggunakan HTTPS.');
  }

  console.log('[Thumbnail] Menggunakan gambar dari subtitles.json...');

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Gagal mengunduh gambar: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.startsWith('image/')) {
    throw new Error('URL yang dipilih bukan file gambar.');
  }

  return Buffer.from(await response.arrayBuffer());
}

function createHeadlineSvg(headline) {
  const lines = wrapText(headline);

  const fontSize = lines.length === 1 ? 100 : 88;
  const lineHeight = fontSize * 1.2;
  const startY = 850 - ((lines.length - 1) * lineHeight) / 2;

  const textElements = lines.map((line, index) => `
    <text
      x="540"
      y="${startY + index * lineHeight}"
      text-anchor="middle"
      font-family="Arial, sans-serif"
      font-size="${fontSize}"
      font-weight="900"
      fill="#ffffff"
      stroke="#17202a"
      stroke-width="5"
      paint-order="stroke"
    >${escapeXml(line)}</text>
  `).join('');

  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="25%" stop-color="#000000" stop-opacity="0.05"/>
          <stop offset="48%" stop-color="#000000" stop-opacity="0.25"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0.72"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.25"/>
        </linearGradient>
      </defs>

      <rect width="100%" height="100%" fill="url(#shade)"/>

      <text
        x="540"
        y="250"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="38"
        font-weight="700"
        letter-spacing="7"
        fill="#ffffff"
      >RENUNGAN ISLAMI</text>

      ${textElements}
    </svg>
  `);
}

async function main() {
  if (!fs.existsSync(TRANSCRIPT_PATH)) {
    throw new Error('public/transcript.txt tidak ditemukan.');
  }

  if (!fs.existsSync(SUBTITLES_PATH)) {
    throw new Error('public/subtitles.json tidak ditemukan.');
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum diatur.');
  }

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  const transcript = fs.readFileSync(TRANSCRIPT_PATH, 'utf8').trim();
  const subtitles = JSON.parse(
    fs.readFileSync(SUBTITLES_PATH, 'utf8')
  );

  if (!transcript || !Array.isArray(subtitles) || !subtitles.length) {
    throw new Error('Transcript atau data subtitle kosong.');
  }

  const headline = await generateHeadline(transcript);

  let background;

  if (SOURCE === 'pixabay') {
    background = await downloadExistingImage(subtitles);
  } else if (SOURCE === 'gemini') {
    background = await generateGeminiBackground(transcript);
  } else if (SOURCE === 'auto') {
    try {
      background = await generateGeminiBackground(transcript);
    } catch (error) {
      console.warn(
        '[Thumbnail] Gemini gagal, menggunakan gambar yang sudah ada:',
        error.message
      );

      background = await downloadExistingImage(subtitles);
    }
  } else {
    throw new Error(
      'THUMBNAIL_SOURCE harus pixabay, gemini, atau auto.'
    );
  }

  const overlay = createHeadlineSvg(headline);

  await sharp(background)
    .rotate()
    .resize(WIDTH, HEIGHT, {
      fit: 'cover',
      position: 'attention'
    })
    .composite([
      {
        input: overlay,
        blend: 'over'
      }
    ])
    .jpeg({
      quality: 90,
      mozjpeg: true
    })
    .toFile(OUTPUT_PATH);

  console.log('✅ Thumbnail berhasil dibuat!');
  console.log(`📌 Headline: ${headline}`);
  console.log(`📌 Sumber: ${SOURCE}`);
  console.log(`📌 Output: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('❌ Gagal membuat thumbnail:', error);
  process.exit(1);
});
