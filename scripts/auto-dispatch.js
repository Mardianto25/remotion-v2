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
const MODEL_NAME = 'gemini-2.5-flash';
const publicDir = path.join(process.cwd(), 'public');

// Daftar tautan cadangan (fallback) video YouTube Shorts ceramah/renungan yang aktif
const BACKUP_SHORTS = [
  'https://www.youtube.com/shorts/58V3Pt07y80',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ' // Sesuaikan/tambahkan link shorts aktif lainnya jika diperlukan
];

async function fetchTopViralShortFromAI() {
  console.log('🤖 Meminta Gemini AI mencari 1 tautan YouTube Shorts Renungan Islami dari channel populer...');
  
  try {
    const prompt = `
      Berikan HANYA 1 (satu) tautan video YouTube Shorts publik dari channel resmi atau populer yang bertema ceramah pendek, motivasi, atau renungan islami yang aktif dan tidak dihapus.
      Kembalikan HANYA dalam bentuk JSON Array berisi tepat 1 string URL tanpa teks lain dan tanpa blok markdown:
      ["https://www.youtube.com/shorts/ID_VIDEO_AKTIF"]
    `;

    const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
    let raw = response.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const list = JSON.parse(raw);
    return list[0] || null;
  } catch (err) {
    console.warn('⚠️ AI gagal merespon tautan, beralih menggunakan link cadangan...');
    return null;
  }
}

async function runAutoDispatcher() {
  try {
    const audioPath = path.join(publicDir, 'audio.mp3');
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    let videoUrl = await fetchTopViralShortFromAI();
    let downloaded = false;

    // 1. Coba unduh dari link rekomendasi AI terlebih dahulu
    if (videoUrl) {
      console.log(`📌 Tautan Pilihan AI: ${videoUrl}`);
      try {
        console.log('📥 Mencoba mengunduh audio dari link AI...');
        await execAsync(`yt-dlp --js-runtimes node -x --audio-format mp3 -o "${audioPath}" "${videoUrl}"`);
        if (fs.existsSync(audioPath)) {
          downloaded = true;
        }
      } catch (e) {
        console.warn('⚠️ Gagal mendownload dari link AI (kemungkinan video unavailable). Beralih ke link cadangan...');
      }
    }

    // 2. Jika link AI gagal atau kosong, gunakan daftar link cadangan (fallback) secara berurutan
    if (!downloaded) {
      for (const backupUrl of BACKUP_SHORTS) {
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

    // 3. Jalankan pipeline utama (analisis AI & buat subtitle)
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
