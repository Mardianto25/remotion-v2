import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { executePipeline } from './server.js';

const execAsync = promisify(exec);

export async function processInstagram(igUrl, publicDir) {
  const audioPath = path.join(publicDir, 'audio.mp3');

  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  const command =
    `yt-dlp --js-runtimes node -x --audio-format mp3 ` +
    `-o "${audioPath}" "${igUrl}"`;

  await execAsync(command);

  if (!fs.existsSync(audioPath)) {
    throw new Error('Gagal mengunduh audio Instagram.');
  }

  return await executePipeline(true);
}