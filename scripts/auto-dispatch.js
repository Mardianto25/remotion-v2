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
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const publicDir = path.join(process.cwd(), 'public');

const backupShorts = [
  'https://www.youtube.com/shorts/58V3Pt07y80',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ'
];

async function fetchTopViralShortFromAI() {
  const prompt = `
    Bertindaklah sebagai pengamat konten kreator YouTube Islami. 
    Berikan HANYA 1 (satu) tautan video YouTube Shorts resmi yang valid dan aktif dari channel dakwah populer (seperti Yufid.TV, Al-Bahjah TV, atau Syafiq Riza Basalamah Official) bertema renungan atau ceramah pendek.
    PENTING: Pastikan URL benar-benar ada dan berformat https://www.youtube.com/shorts/ID_VIDEO. 
    Jangan membuat-buat ID video fiktif. 
    Kembalikan HANYA dalam bentuk JSON Array berisi tepat 1 string URL tanpa teks lain dan tanpa blok markdown:
    ["https://www.youtube.com/shorts/ID_VIDEO_AKTIF"]
  `;

  console.log(`🤖 Mencoba Gemini AI menggunakan model: ${MODEL_NAME}...`);
  const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
  let raw = response.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const list = JSON.parse(raw);
  
  if (!list[0]) {
    throw new Error('AI tidak mengembalikan tautan.');
  }
  return list[0];
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
      console.warn('⚠️ Gagal mendapatkan tautan dari AI, menggunakan link cadangan...');
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
