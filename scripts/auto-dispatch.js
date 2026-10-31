import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
// Impor fungsi pipeline langsung dari server.js Anda
import { executePipeline } from '../server.js'; 

dotenv.config();

const execAsync = promisify(exec);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const publicDir = path.join(process.cwd(), 'public');

async function fetchTopViralReelFromAI() {
  console.log('🤖 Meminta Gemini AI mencari 1 tautan Reels Instagram Renungan Islami terbaik...');
  
  const prompt = `
    Berikan HANYA 1 (satu) contoh atau format tautan referensi Reels Instagram publik yang valid dan relevan dengan tema renungan islami penyejuk hati.
    Kembalikan HANYA dalam bentuk JSON Array berisi tepat 1 string URL tanpa teks lain dan tanpa blok markdown:
    ["https://www.instagram.com/reel/EXAMPLE1/"]
  `;

  const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
  let raw = response.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const list = JSON.parse(raw);
  return list[0] || null;
}

async function runAutoDispatcher() {
  try {
    // 1. AI mencari 1 link teratas
    const igUrl = await fetchTopViralReelFromAI();
    if (!igUrl) throw new Error('AI gagal memberikan tautan.');

    console.log(`📌 Tautan Terpilih: ${igUrl}`);
    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    // 2. Unduh audio menggunakan yt-dlp (persis seperti di endpoint)
    console.log('📥 [1/4] Mengunduh audio dari tautan Instagram...');
    const ytDlpCommand = `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${igUrl}"`;
    await execAsync(ytDlpCommand);

    if (!fs.existsSync(audioPath)) {
      throw new Error('Gagal mengekstrak audio dari tautan Instagram.');
    }
    console.log('✅ Audio berhasil disimpan di public/audio.mp3');

    // 3. Langsung panggil method executePipeline dengan autoPush: true
    console.log('🚀 Menjalankan executePipeline...');
    const result = await executePipeline(true, null);

    console.log('🎉 Selesai!');
    console.log('📌 Status:', result.gitStatus);

  } catch (error) {
    console.error('❌ Error Auto-Dispatcher:', error.message);
    process.exit(1);
  }
}

runAutoDispatcher();
