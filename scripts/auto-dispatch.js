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

async function fetchTopViralShortFromAI() {
  console.log('🤖 Meminta Gemini AI mencari 1 tautan YouTube Shorts Renungan Islami terbaik...');
  
  const prompt = `
    Berikan HANYA 1 (satu) contoh atau format tautan referensi YouTube Shorts publik yang valid dan relevan dengan tema renungan islami penyejuk hati (contoh format: https://www.youtube.com/shorts/...).
    Kembalikan HANYA dalam bentuk JSON Array berisi tepat 1 string URL tanpa teks lain dan tanpa blok markdown:
    ["https://www.youtube.com/shorts/EXAMPLE1"]
  `;

  const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
  let raw = response.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const list = JSON.parse(raw);
  return list[0] || null;
}

async function runAutoDispatcher() {
  try {
    // 1. AI mencari 1 link YouTube Shorts teratas
    const videoUrl = await fetchTopViralShortFromAI();
    if (!videoUrl) throw new Error('AI gagal memberikan tautan YouTube Shorts.');

    console.log(`📌 Tautan Terpilih: ${videoUrl}`);
    const audioPath = path.join(publicDir, 'audio.mp3');

    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    // 2. Unduh audio menggunakan yt-dlp dari YouTube
    console.log('📥 [1/4] Mengunduh audio dari YouTube Shorts...');
    const ytDlpCommand = `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${videoUrl}"`;
    await execAsync(ytDlpCommand);

    if (!fs.existsSync(audioPath)) {
      throw new Error('Gagal mengekstrak audio dari YouTube Shorts.');
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
