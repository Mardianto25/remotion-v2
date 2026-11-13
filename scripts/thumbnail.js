
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
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'thumbnail.jpg');
const TRANSCRIPT_PATH = path.join(PUBLIC_DIR, 'transcript.txt');
const SUBTITLES_PATH = path.join(PUBLIC_DIR, 'subtitles.json');

const WIDTH = 1080;
const HEIGHT = 1920;

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

const SOURCE = (process.env.THUMBNAIL_SOURCE || 'auto').toLowerCase();

// ======================================================
// UTILITIES
// ======================================================

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ======================================================
// 1. GENERATE HEADLINE USING GEMINI
// ======================================================

async function generateHeadline(transcript) {
  console.log('Membuat judul thumbnail menggunakan Gemini...');

  const prompt = `
Buatkan judul thumbnail YouTube Shorts berdasarkan narasi berikut.

ATURAN:
- Bahasa Indonesia.
- Maksimal 5 kata.
- Menarik, kuat, dan membuat penasaran.
- Sesuai dengan isi narasi.
- Jangan membuat judul yang menyesatkan.
- Jangan gunakan tanda kutip.
- Hanya keluarkan judulnya saja.

NARASI:
${transcript.slice(0, 12000)}
`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });

  const headline = cleanText(response.text)
    .replace(/^["']|["']$/g, '')
    .replace(/^judul\s*:\s*/i, '');

  if (!headline) {
    throw new Error('Gemini tidak menghasilkan judul thumbnail.');
  }

  console.log('Headline:', headline);

  return headline;
}

// ======================================================
// 2. GENERATE BACKGROUND USING CLOUDFLARE FLUX
// ======================================================

async function generateCloudflareBackground(transcript) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('CF_ACCOUNT_ID atau CF_API_TOKEN belum diatur.');
  }

  console.log('Membuat gambar thumbnail menggunakan Cloudflare FLUX...');

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}` +
    `/ai/run/@cf/black-forest-labs/flux-1-schnell`;

  const prompt = `
Create a premium cinematic YouTube Shorts thumbnail background.

STORY CONTEXT:
${transcript.slice(0, 7000)}

VISUAL REQUIREMENTS:
- Understand the story and visualize its most emotional and important moment.
- Create a realistic, cinematic, professional photograph.
- Strong visual storytelling and emotional atmosphere.
- Dramatic cinematic lighting.
- Beautiful composition and high detail.
- Vertical 9:16 composition.
- Main subject should be in the upper and middle portions.
- Keep the bottom 40 percent darker and relatively uncluttered for headline text.
- Use colors and atmosphere appropriate to the story.
- If the story mentions a family, show the relevant family members.
- If the story mentions a child, show a child when appropriate.
- If the story mentions a Muslim woman, depict her wearing a modest hijab that covers her hair and neck.
- Use modest clothing for Muslim characters.
- Never depict Allah or Islamic prophets.
- Do not include Jesus, crosses, crucifixes, churches, or Christian religious symbols.
- No text, letters, captions, logos, or watermarks.
- Do not create a generic landscape unrelated to the story.

The image must communicate the meaning of the narration visually.
`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      steps: 4
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Cloudflare error ${response.status}: ${errorText.slice(0, 1000)}`
    );
  }

  const contentType = response.headers.get('content-type') || '';

  // Beberapa response Cloudflare mengembalikan image secara langsung.
  if (contentType.includes('image/')) {
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    if (!imageBuffer.length) {
      throw new Error('Cloudflare mengembalikan gambar kosong.');
    }

    return imageBuffer;
  }

  // Response JSON dapat berisi gambar dalam format base64.
  const result = await response.json();

  const base64Image =
    result?.result?.image ||
    result?.result?.data?.[0] ||
    result?.image;

  if (!result.success || !base64Image) {
    throw new Error(
      `Cloudflare gagal membuat gambar: ${JSON.stringify(result.errors || result).slice(0, 1000)}`
    );
  }

  const imageBuffer = Buffer.from(base64Image, 'base64');

  if (!imageBuffer.length) {
    throw new Error('Hasil gambar Cloudflare kosong.');
  }

  return imageBuffer;
}

// ======================================================
// 3. SELECT EXISTING SCENE IMAGE AS FALLBACK
// ======================================================

function selectExistingImage(subtitles) {
  if (!Array.isArray(subtitles)) {
    return null;
  }

  const candidates = subtitles
    .filter(item => {
      return item && (
        item.image ||
        item.imageUrl ||
        item.imagePath
      );
    })
    .sort((a, b) => {
      return String(b.text || '').length -
        String(a.text || '').length;
    });

  return candidates[0] || null;
}

async function downloadExistingImage(subtitles) {
  const selected = selectExistingImage(subtitles);

  if (!selected) {
    throw new Error('Tidak ada gambar scene di subtitles.json.');
  }

  const imagePath =
    selected.image ||
    selected.imageUrl ||
    selected.imagePath;

  console.log('Menggunakan gambar scene sebagai fallback:', imagePath);

  if (/^https:\/\//i.test(imagePath)) {
    const response = await fetch(imagePath);

    if (!response.ok) {
      throw new Error(`Gagal download gambar: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.startsWith('image/')) {
      throw new Error('URL scene tidak mengembalikan file gambar.');
    }

    return Buffer.from(await response.arrayBuffer());
  }

  if (/^http:\/\//i.test(imagePath)) {
    throw new Error('URL gambar harus menggunakan HTTPS.');
  }

  const normalizedPath = imagePath.replace(/^[/\\]+/, '');

  const absolutePath = path.resolve(PUBLIC_DIR, normalizedPath);
  const publicRoot = path.resolve(PUBLIC_DIR) + path.sep;

  if (!absolutePath.startsWith(publicRoot)) {
    throw new Error('Path gambar tidak valid.');
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File gambar tidak ditemukan: ${absolutePath}`);
  }

  return fs.readFileSync(absolutePath);
}

// ======================================================
// 4. WRAP HEADLINE
// ======================================================

function wrapHeadline(text, maxChars = 17) {
  const words = cleanText(text).split(' ');
  const lines = [];

  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (candidate.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

// ======================================================
// 5. CREATE PREMIUM HEADLINE SVG
// ======================================================

function createHeadlineSvg(headline) {
  let lines = wrapHeadline(headline, 17);

  if (lines.length > 3) {
    lines = wrapHeadline(headline, 22).slice(0, 3);
  }

  const fontSize =
    lines.some(line => line.length > 20) ? 82 :
    lines.some(line => line.length > 15) ? 94 :
    108;

  const lineHeight = fontSize * 1.2;

  const totalTextHeight = lines.length * lineHeight;

  const startY = 1390 - totalTextHeight / 2;

  const headlineText = lines.map((line, index) => {
    const y = startY + (index * lineHeight);

    const fill = index === lines.length - 1
      ? '#FFD76A'
      : '#FFFFFF';

    return `
      <text
        x="540"
        y="${y}"
        text-anchor="middle"
        fill="${fill}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        letter-spacing="-2"
        stroke="#000000"
        stroke-width="5"
        paint-order="stroke"
      >${escapeXml(line)}</text>
    `;
  }).join('');

  return `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">

    <defs>
      <linearGradient id="bottomGradient"
        x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="35%" stop-color="#000000" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
      </linearGradient>

      <linearGradient id="topGradient"
        x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <rect
      x="0"
      y="0"
      width="${WIDTH}"
      height="${HEIGHT}"
      fill="url(#topGradient)"
    />

    <rect
      x="0"
      y="900"
      width="${WIDTH}"
      height="1020"
      fill="url(#bottomGradient)"
    />

    <text
      x="70"
      y="110"
      fill="#FFFFFF"
      font-family="Arial, Helvetica, sans-serif"
      font-size="34"
      font-weight="700"
      letter-spacing="4"
      opacity="0.9"
    >CERITA HARI INI</text>

    ${headlineText}

    <rect
      x="440"
      y="1575"
      width="200"
      height="7"
      rx="4"
      fill="#FFD76A"
    />

  </svg>
  `;
}

// ======================================================
// 6. MAIN
// ======================================================

async function main() {
  console.log('================================');
  console.log('THUMBNAIL GENERATOR');
  console.log('================================');

  if (!fs.existsSync(PUBLIC_DIR)) {
    throw new Error('Folder public tidak ditemukan.');
  }

  if (!fs.existsSync(TRANSCRIPT_PATH)) {
    throw new Error('transcript.txt tidak ditemukan.');
  }

  if (!fs.existsSync(SUBTITLES_PATH)) {
    throw new Error('subtitles.json tidak ditemukan.');
  }

  const transcript = fs.readFileSync(
    TRANSCRIPT_PATH,
    'utf8'
  ).trim();

  const subtitles = JSON.parse(
    fs.readFileSync(SUBTITLES_PATH, 'utf8')
  );

  if (!transcript) {
    throw new Error('Transcript kosong.');
  }

  // Gemini hanya membuat headline, bukan gambar.
  const headline = await generateHeadline(transcript);

  let backgroundBuffer;

  if (SOURCE === 'existing') {
    backgroundBuffer = await downloadExistingImage(subtitles);
  } else if (SOURCE === 'cloudflare') {
    backgroundBuffer = await generateCloudflareBackground(transcript);
  } else {
    // AUTO: Cloudflare terlebih dahulu, lalu fallback ke scene.
    try {
      backgroundBuffer = await generateCloudflareBackground(transcript);
    } catch (error) {
      console.error('Cloudflare gagal:', error.message);
      console.log('Menggunakan gambar scene sebagai fallback...');

      backgroundBuffer = await downloadExistingImage(subtitles);
    }
  }

  console.log('Menggabungkan gambar dan headline...');

  const background = await sharp(backgroundBuffer)
    .rotate()
    .resize(WIDTH, HEIGHT, {
      fit: 'cover',
      position: 'centre'
    })
    .jpeg({
      quality: 95
    })
    .toBuffer();

  const svg = createHeadlineSvg(headline);

  await sharp(background)
    .composite([
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0
      }
    ])
    .jpeg({
      quality: 95,
      mozjpeg: true
    })
    .toFile(OUTPUT_PATH);

  console.log('================================');
  console.log('THUMBNAIL BERHASIL DIBUAT');
  console.log('Output:', OUTPUT_PATH);
  console.log('Headline:', headline);
  console.log('================================');
}

main().catch(error => {
  console.error('THUMBNAIL ERROR:', error);
  process.exit(1);
});
