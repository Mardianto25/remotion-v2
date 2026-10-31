import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { executePipeline } from '../server.js'; 

dotenv.config();

const execAsync = promisify(exec);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const publicDir = path.join(process.cwd(), 'public');

// Ambil daftar model dari ENV dan ubah menjadi Array
const geminiModels = process.env.GEMINI_MODELS 
  ? process.env.GEMINI_MODELS.split(',').map(m => m.trim())
  : ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];

const backupShorts = [
  'https://www.youtube.com/shorts/58V3Pt07y80',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ'
];

async function fetchTopViralShortFromAI() {
  const prompt = `
    Berikan HANYA 1 (satu) tautan video YouTube Shorts publik dari channel resmi atau populer yang bertema ceramah pendek, motivasi, atau renungan islami yang aktif dan tidak dihapus.
    Kembalikan HANYA dalam bentuk JSON Array berisi tepat 1 string URL tanpa teks lain dan tanpa blok markdown:
    ["https://www.youtube.com/shorts/ID_VIDEO_AKTIF"]
  `;

  // Iterasi model berdasarkan array dari ENV
  for (const modelName of geminiModels) {
    try {
      console.log(`🤖 Mencoba Gemini AI menggunakan model: ${modelName}...`);
      const response = await ai.models.generateContent({ model: modelName, contents: prompt });
      let raw = response.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
      const list = JSON.parse(raw);
      if (list[0]) {
        console.log(`✅ Berhasil mendapatkan link dari model ${modelName}`);
        return list[0];
      }
    } catch (err) {
      console.warn(`⚠️ Model ${modelName} gagal, beralih ke model Gemini berikutnya...`);
    }
  }

  throw new Error('Semua model Gemini di dalam konfigurasi ENV gagal merespon tautan.');
}

async function runAutoDispatcher() {
  try {
    const audioPath = path.join(publicDir, 'audio.mp3');
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    let videoUrl = null;
    let downloaded = false;

    try {
      videoUrl = await fetchTopViralShortFromAI();
    } catch (e) {
      console.warn('⚠️ Gagal mendapatkan tautan dari semua model AI, menggunakan link cadangan...');
    }

    if (videoUrl) {
      console.log(`📌 Tautan Pilihan AI: ${videoUrl}`);
      try {
        console.log('📥 Mencoba mengunduh audio dari link AI...');
        await execAsync(`yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${videoUrl}"`);
        if (fs.existsSync(audioPath)) {
          downloaded = true;
        }
      } catch (e) {
        console.warn('⚠️ Gagal mendownload dari link AI (video unavailable). Beralih ke link cadangan...');
      }
    }

    // Fallback menggunakan link cadangan
    if (!downloaded) {
      for (const backupUrl of backupShorts) {
        console.log(`🔄 Mencoba link cadangan: ${backupUrl}`);
        try {
          await execAsync(`yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${backupUrl}"`);
          if (fs.existsSync(audioPath)) {
            downloaded = true;
            console.log(`✅ Berhasil mengunduh dari link cadangan: ${backupUrl}`);
            break;
          }
        } catch (errBackup) {
          console.warn(`⚠️ Link cadangan ${backupUrl} gagal, mencoba berikutnya...`);
        }
      }
    }

    if (!downloaded || !fs.existsSync(audioPath)) {
      throw new Error('Semua tautan gagal diunduh.');
    }

    console.log('✅ Audio berhasil disimpan di public/audio.mp3');

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
