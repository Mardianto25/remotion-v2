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

// Ambil daftar model dari ENV (array) atau gunakan default sebagai cadangan
const geminiModels = process.env.GEMINI_MODELS 
  ? process.env.GEMINI_MODELS.split(',').map(m => m.trim())
  : ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash'];

// Daftar tautan cadangan (fallback) video YouTube Shorts ceramah/renungan yang aktif
const backupShorts = [
  'https://www.youtube.com/shorts/58V3Pt07y80',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ'
];

// Fungsi helper untuk delay (dalam milidetik)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTopViralShortFromAI() {
  const prompt = `
    Bertindaklah sebagai pengamat konten kreator YouTube Islami. 
    Berikan HANYA 1 (satu) tautan video YouTube Shorts resmi yang valid dan aktif dari channel dakwah populer (seperti Yufid.TV, Al-Bahjah TV, atau Syafiq Riza Basalamah Official) bertema renungan atau ceramah pendek.
    PENTING: Pastikan URL benar-benar ada dan berformat https://www.youtube.com/shorts/ID_VIDEO. 
    Jangan membuat-buat ID video fiktif. 
    Kembalikan HANYA dalam bentuk JSON Array berisi tepat 1 string URL tanpa teks lain dan tanpa blok markdown:
    ["https://www.youtube.com/shorts/ID_VIDEO_AKTIF"]
  `;

  // Iterasi mencoba model Gemini secara berurutan dari array
  for (let i = 0; i < geminiModels.length; i++) {
    const modelName = geminiModels[i];
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
      console.warn(`⚠️ Model ${modelName} gagal atau terkena limit.`);
      
      // Jika bukan model terakhir, berikan delay sebelum mencoba model berikutnya
      if (i < geminiModels.length - 1) {
        console.log(`⏳ Menunggu 3 detik sebelum mencoba model berikutnya...`);
        await delay(3000); // Jeda 3 detik
      }
    }
  }

  throw new Error('Semua model Gemini di dalam array gagal merespon tautan.');
}

async function runAutoDispatcher() {
  try {
    const audioPath = path.join(publicDir, 'audio.mp3');
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    let videoUrl = null;
    let downloaded = false;

    // 1. Ambil link dari AI (menggunakan array model Gemini dengan delay pengaman)
    try {
      videoUrl = await fetchTopViralShortFromAI();
    } catch (e) {
      console.warn('⚠️ Gagal mendapatkan tautan dari semua model AI, menggunakan link cadangan...');
    }

    // 2. Coba unduh dari link rekomendasi AI
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

    // 3. Jika link AI gagal atau kosong, gunakan daftar link cadangan (fallback) secara berurutan
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
      throw new Error('Semua tautan (baik dari AI maupun cadangan) gagal diunduh.');
    }

    console.log('✅ Audio berhasil disimpan di public/audio.mp3');

    // 4. Jalankan pipeline utama
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
