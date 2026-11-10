
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
Bertindaklah sebagai copywriter thumbnail YouTube profesional
untuk channel renungan Islam dan motivasi.

Buat headline berdasarkan inti pesan narasi berikut.

Kriteria:
- Maksimal 5 kata.
- Mengandung emosi, refleksi, atau rasa penasaran.
- Gunakan bahasa Indonesia yang natural.
- Pilih kata yang kuat dan mudah dipahami.
- Jangan membuat klaim berlebihan.
- Jangan menggunakan kalimat terlalu panjang.
- Hindari judul generik seperti "Renungan Hari Ini".
- Jangan menggunakan hashtag atau tanda kutip.
- Kembalikan hanya headline.

Contoh gaya:
- JANGAN TUNDA TAUBATMU
- ALLAH TAHU LELAHMU
- MUNGKIN INI TEGURAN-NYA
- JANGAN SAMPAI TERLAMBAT
- KETIKA HATI MULAI JAUH

Narasi:
${transcript.slice(0, 5000)}
`
  });

  const headline = (response.text || '')
    .replace(/["'\`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!headline) return 'JANGAN LUPA BERSYUKUR';

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
  const words = headline.split(/\s+/).filter(Boolean);

  // Maksimal 5 kata, dibagi menjadi baris yang proporsional.
  let lines = [];

  if (words.length <= 2) {
    lines = [words.join(' ')];
  } else if (words.length === 3) {
    lines = [words[0], words.slice(1).join(' ')];
  } else {
    const middle = Math.ceil(words.length / 2);
    lines = [
      words.slice(0, middle).join(' '),
      words.slice(middle).join(' ')
    ];
  }

  const fontSize = lines.some(line => line.length > 16) ? 82 : 100;
  const lineHeight = fontSize * 1.2;
  const startY = 1050 - ((lines.length - 1) * lineHeight) / 2;

  const headlineElements = lines.map((line, index) => {
    const y = startY + index * lineHeight;

    // Baris terakhir menggunakan warna emas.
    const isHighlight = index === lines.length - 1;
    const fill = isHighlight ? '#FFD166' : '#FFFFFF';

    return `
      <text
        x="85"
        y="${y}"
        text-anchor="start"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        letter-spacing="-3"
        fill="${fill}"
        stroke="#101522"
        stroke-width="8"
        stroke-linejoin="round"
        paint-order="stroke"
        filter="url(#shadow)"
      >${escapeXml(line)}</text>
    `;
  }).join('');

  return Buffer.from(`
  <svg width="${WIDTH}" height="${HEIGHT}"
       viewBox="0 0 ${WIDTH} ${HEIGHT}"
       xmlns="http://www.w3.org/2000/svg">

    <defs>
      <linearGradient id="darkOverlay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#050814" stop-opacity="0.15"/>
        <stop offset="35%" stop-color="#050814" stop-opacity="0.10"/>
        <stop offset="55%" stop-color="#050814" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#050814" stop-opacity="0.90"/>
      </linearGradient>

      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#FFE29A"/>
        <stop offset="100%" stop-color="#D99B35"/>
      </linearGradient>

      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
        <feOffset dx="3" dy="8"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.8"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Dark cinematic overlay -->
    <rect width="100%" height="100%" fill="url(#darkOverlay)"/>

    <!-- Top branding -->
    <rect x="85" y="190" width="12" height="65"
          rx="6" fill="url(#gold)"/>

    <text x="125" y="235"
          font-family="DejaVu Sans, Arial, sans-serif"
          font-size="34"
          font-weight="700"
          letter-spacing="5"
          fill="#FFFFFF">
      RENUNGAN ISLAMI
    </text>

    <!-- Gold divider -->
    <rect x="85" y="285" width="180" height="5"
          rx="3" fill="url(#gold)"/>

    <!-- Headline background panel -->
    <rect x="55" y="820" width="970" height="480"
          rx="28" fill="#080D18" opacity="0.28"/>

    <!-- Gold accent -->
    <rect x="85" y="875" width="10" height="300"
          rx="5" fill="url(#gold)"/>

    <!-- Main headline -->
    ${headlineElements}

    <!-- Bottom label -->
    <text x="85" y="1390"
          font-family="DejaVu Sans, Arial, sans-serif"
          font-size="30"
          font-weight="600"
          letter-spacing="3"
          fill="#FFFFFF"
          opacity="0.90">
      SEBUAH PENGINGAT UNTUK HATI
    </text>

    <rect x="85" y="1440" width="910" height="3"
          fill="#FFD166" opacity="0.65"/>

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
