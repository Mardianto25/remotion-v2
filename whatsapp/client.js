import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import { processWhatsAppAudio } from './audio-handler.js';

dotenv.config();

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'ai-content-manager'
  }),
  puppeteer: {
    headless: true,
    args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Sangat penting untuk Android
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--font-render-hinting=none'
        ],
        executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser'
  }
});

const allowedNumber = process.env.WHATSAPP_ALLOWED_NUMBER
  ?.replace(/\D/g, '');

client.on('qr', (qr) => {
  console.log('Scan QR WhatsApp berikut:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp AI Content Manager berhasil terhubung!');
});

client.on('authenticated', () => {
  console.log('WhatsApp berhasil diautentikasi.');
});

client.on('auth_failure', (message) => {
  console.error('WhatsApp authentication gagal:', message);
});

client.on('disconnected', (reason) => {
  console.log('WhatsApp terputus:', reason);
});

const userSessions = new Map();
let processInstagramCallback = null;


client.on('message', async (message) => {
  if (message.fromMe || message.from.endsWith('@g.us')) return;

  const senderPhone = await getSenderPhone(message);

  if (!senderPhone || senderPhone !== allowedNumber) return;

  const userId = message.from;
  const command = message.body.trim().toUpperCase();

  let session = userSessions.get(userId);

  // MENU UTAMA
  if (command === 'MENU') {
    userSessions.set(userId, { step: 'MENU' });

    return message.reply(
      '🤖 AI CONTENT MANAGER\n\n' +
      'Silakan pilih menu:\n\n' +
      '1. Produksi dari Audio\n' +
      '2. Produksi dari URL Instagram\n' +
      '3. Status Produksi\n' +
      '4. Riwayat Produksi\n\n' +
      'Ketik angka pilihan kamu.'
    );
  }

  if (command === 'BATAL') {
    userSessions.delete(userId);
    return message.reply('Proses dibatalkan.');
  }

  if (command === 'HELP') {
    return message.reply('Ketik MENU untuk melihat pilihan.');
  }

  // PILIHAN MENU
  if (command === '1') {
    userSessions.set(userId, { step: 'WAITING_AUDIO' });

    return message.reply(
      '🎧 PRODUKSI DARI AUDIO\n\n' +
      'Silakan kirim file audio atau voice note.\n\n' +
      'Ketik BATAL untuk membatalkan.'
    );
  }

  if (command === '2') {
    userSessions.set(userId, { step: 'WAITING_INSTAGRAM_URL' });

    return message.reply(
      '📹 PRODUKSI DARI INSTAGRAM\n\n' +
      'Silakan kirim URL Instagram.\n\n' +
      'Ketik BATAL untuk membatalkan.'
    );
  }

  if (command === '3') {
    return message.reply(
      '📊 STATUS PRODUKSI\n\n' +
      'Fitur status sedang disiapkan.'
    );
  }

  if (command === '4') {
    return message.reply(
      '📚 RIWAYAT PRODUKSI\n\n' +
      'Fitur riwayat sedang disiapkan.'
    );
  }

  // PROSES AUDIO
  if (session?.step === 'WAITING_AUDIO' && message.hasMedia) {
    try {
      await message.reply('🎧 Audio diterima. Memulai proses...');

      const result = await processWhatsAppAudio(message);

      await message.reply(
        '✅ Audio berhasil dikirim ke pipeline!\n' +
        JSON.stringify(result)
      );

      userSessions.delete(userId);
    } catch (error) {
      console.error(error);
      await message.reply('❌ Gagal: ' + error.message);
    }

    return;
  }

  // PROSES URL INSTAGRAM
  if (session?.step === 'WAITING_INSTAGRAM_URL') {
  const igUrl = message.body.trim();

  // Validasi URL Instagram
  let parsedUrl;

  try {
    parsedUrl = new URL(igUrl);
  } catch {
    return message.reply(
      '❌ URL tidak valid. Silakan kirim URL Instagram yang benar.'
    );
  }

  const allowedHosts = ['instagram.com', 'www.instagram.com'];

  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    !allowedHosts.includes(parsedUrl.hostname)
  ) {
    return message.reply(
      '❌ URL Instagram tidak valid. Silakan kirim ulang.'
    );
  }

  if (typeof processInstagramCallback !== 'function') {
    userSessions.delete(userId);
    return message.reply('❌ Handler Instagram belum dikonfigurasi.');
  }

  try {
    await message.reply(
      '📥 URL Instagram diterima.\nSedang mengunduh audio dan memproses konten menggunakan Gemini...'
    );

    console.log('[WhatsApp] URL Instagram:', igUrl);

    const result = await processInstagramCallback(igUrl);

    userSessions.delete(userId);

    if (!result?.success) {
      throw new Error(result?.message || 'Pemrosesan gagal.');
    }

    await message.reply(
      `✅ *PROSES INSTAGRAM BERHASIL!*

Model AI: ${result.modelUsed || '-'}

Status:
${result.gitStatus || result.message}

Transkrip:
${result.transcript?.substring(0, 1000) || '-'}`
    );

  } catch (error) {
    console.error('[Instagram Error]:', error);

    userSessions.delete(userId);

    await message.reply(
      `❌ Gagal memproses Instagram.\n\n${error.message}`
    );
  }

  return;
}

  if (!session || session.step === 'MENU') {
    return message.reply('Ketik MENU untuk melihat pilihan.');
  }

  return message.reply('Silakan ikuti instruksi menu. Ketik BATAL untuk membatalkan.');
});


async function getSenderPhone(message) {
  // Jika format sudah nomor telepon biasa
  if (message.from.endsWith('@c.us')) {
    return message.from.replace('@c.us', '');
  }

  // Jika format LID, coba cari nomor aslinya
  if (message.from.endsWith('@lid')) {
    try {
      const result = await client.getContactLidAndPhone([
        message.from
      ]);

      const phoneId = result?.[0]?.pn;

      if (phoneId?.endsWith('@c.us')) {
        return phoneId.replace('@c.us', '');
      }
    } catch (error) {
      console.error('Gagal mendapatkan nomor asli:', error);
    }
  }

  return null;
}

export async function startWhatsApp(options = {}) {
  // Menerima callback dari server.js
  processInstagramCallback = options.processInstagram;

  if (process.env.WHATSAPP_ENABLED !== 'true') {
    console.log('WhatsApp bot dinonaktifkan.');
    return;
  }

  await client.initialize();
}
export default client;