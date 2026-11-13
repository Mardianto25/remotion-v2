
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const execFileAsync = promisify(execFile);

const API_URL = `http://127.0.0.1:${process.env.PORT || 3000}/api/upload-audio`;

export async function processWhatsAppAudio(message) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-content-')
  );

  try {
    // Download media dari WhatsApp
    console.log('Menerima media WhatsApp...');
    console.log('Mimetype:', message.type);
    console.log('Has media:', message.hasMedia);

    const rawId = message.id;

const msgId = rawId?._serialized ?? rawId?.$1;

console.log('Raw Message ID:', rawId);
console.log('Serialized ID:', msgId);

if (!msgId) {
    throw new Error('ID pesan WhatsApp tidak ditemukan.');
}

// Normalisasi ID agar kompatibel dengan whatsapp-web.js
message.id._serialized = msgId;

const debugResult = await message.client.pupPage.evaluate((id) => {
    const Msg = window.require('WAWebCollections').Msg;
    const msg = Msg.get(id);

    return {
        id,
        found: !!msg,
        type: msg?.type,
        mimetype: msg?.mimetype,
        hasMedia: msg?.hasMedia
    };
}, msgId);

console.log('DEBUG WA MESSAGE:', debugResult);

const media = await message.downloadMedia();

    if (!media.mimetype?.startsWith('audio/')) {
      throw new Error('File yang dikirim bukan audio.');
    }

    const inputPath = path.join(tempDir, 'input-audio');
    const outputPath = path.join(tempDir, 'audio.mp3');

    // Simpan file sementara
    await fs.writeFile(
      inputPath,
      Buffer.from(media.data, 'base64')
    );

    // Konversi ke MP3
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-codec:a', 'libmp3lame',
      '-q:a', '4',
      outputPath
    ]);

    // Kirim MP3 ke endpoint pipeline yang sudah ada
    const audioBuffer = await fs.readFile(outputPath);

    const formData = new FormData();

    formData.append(
      'audio',
      new Blob([audioBuffer], { type: 'audio/mpeg' }),
      'audio.mp3'
    );

    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || result.error || 'Gagal memproses audio.'
      );
    }

    return result;

  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true
    });
  }
}
