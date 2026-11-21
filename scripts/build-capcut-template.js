import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, 'out');
const audioPath = path.join(publicDir, 'audio.mp3');
const subtitlesPath = path.join(publicDir, 'subtitles.json');
const latestPath = path.join(publicDir, 'images', 'LATEST.json');

function assertFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(label + ' tidak ditemukan: ' + file);
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return [hours, minutes, secs].map(v => String(v).padStart(2, '0')).join(':') +
    ',' + String(millis).padStart(3, '0');
}

function csv(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

assertFile(audioPath, 'Audio');
assertFile(subtitlesPath, 'Subtitle JSON');

const scenes = JSON.parse(fs.readFileSync(subtitlesPath, 'utf8'));
if (!Array.isArray(scenes) || scenes.length === 0) {
  throw new Error('subtitles.json kosong atau bukan array.');
}

let latest = {};
if (fs.existsSync(latestPath)) {
  latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
}
const folderName = latest.videoFolder || 'latest-video';
const bundleName = 'CapCut-Template-' + folderName;
const bundleDir = path.join(outputDir, bundleName);
const imagesOut = path.join(bundleDir, 'Images');
const audioOut = path.join(bundleDir, 'Audio');
const subtitleOut = path.join(bundleDir, 'Subtitles');

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(imagesOut, { recursive: true });
fs.mkdirSync(audioOut, { recursive: true });
fs.mkdirSync(subtitleOut, { recursive: true });
fs.copyFileSync(audioPath, path.join(audioOut, 'original-audio.mp3'));

const srt = [];
const csvRows = [
  ['Scene', 'Start (seconds)', 'End (seconds)', 'Duration (seconds)', 'Subtitle', 'Image file'].join(',')
];
const manifestScenes = [];

for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i];
  const start = Number(scene.start);
  const end = Number(scene.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Timestamp scene ' + (i + 1) + ' tidak valid.');
  }
  if (!scene.image || /^https?:\\/\\//i.test(scene.image)) {
    throw new Error('Scene ' + (i + 1) + ' belum memiliki file gambar lokal.');
  }

  const relativeImage = scene.image.replace(/^\\/+/, '');
  const sourceImage = path.resolve(publicDir, relativeImage);
  if (!sourceImage.startsWith(publicDir + path.sep)) {
    throw new Error('Path gambar scene ' + (i + 1) + ' tidak aman.');
  }
  assertFile(sourceImage, 'Gambar scene ' + (i + 1));

  const ext = path.extname(sourceImage) || '.jpg';
  const imageName = 'scene-' + String(i + 1).padStart(3, '0') + ext.toLowerCase();
  fs.copyFileSync(sourceImage, path.join(imagesOut, imageName));

  const text = String(scene.text || '').trim();
  srt.push(
    String(i + 1),
    srtTime(start) + ' --> ' + srtTime(end),
    text,
    ''
  );
  csvRows.push([
    i + 1,
    start.toFixed(3),
    end.toFixed(3),
    (end - start).toFixed(3),
    csv(text),
    imageName
  ].join(','));

  manifestScenes.push({
    scene: i + 1,
    start,
    end,
    duration: Number((end - start).toFixed(3)),
    text,
    keyword: scene.keyword || '',
    image: 'Images/' + imageName,
    imagePrompt: scene.imagePrompt || ''
  });
}

fs.writeFileSync(path.join(subtitleOut, 'subtitles.srt'), srt.join('\\n'), 'utf8');
fs.writeFileSync(path.join(bundleDir, 'scene-list.csv'), csvRows.join('\\n'), 'utf8');
fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify({
  title: bundleName,
  aspectRatio: '9:16',
  sourceAudio: 'Audio/original-audio.mp3',
  subtitleFile: 'Subtitles/subtitles.srt',
  sceneCount: manifestScenes.length,
  scenes: manifestScenes
}, null, 2), 'utf8');

const readme = `CAPCUT TEMPLATE ASSETS — ANDROID

Isi folder:
- Audio/original-audio.mp3 : audio asli dari video.
- Images/scene-001...      : gambar tiap scene, sudah berurutan.
- Subtitles/subtitles.srt  : subtitle dengan timestamp.
- scene-list.csv           : urutan scene, durasi, teks, dan nama gambar.
- manifest.json            : data lengkap untuk referensi.

CARA MEMAKAI DI CAPCUT ANDROID:
1. Ekstrak ZIP ini di aplikasi Files / File Manager Android.
2. Buka CapCut lalu buat New project dengan rasio 9:16.
3. Pilih semua gambar dari folder Images sesuai urutan scene-001, scene-002, dan seterusnya.
4. Tambahkan Audio/original-audio.mp3 sebagai audio utama.
5. Atur durasi tiap gambar mengikuti kolom Start/End/Duration di scene-list.csv.
   Timeline dimulai dari waktu 0; sisakan jeda bila timestamp scene memang memiliki gap.
6. Jika versi CapCut mendukung impor subtitle SRT, impor Subtitles/subtitles.srt.
   Jika tidak tersedia, gunakan scene-list.csv atau buat Auto captions lalu koreksi teksnya.
7. Terapkan gaya font, animasi subtitle, transisi, dan efek pilihanmu, lalu simpan sebagai proyek dasar/duplikat untuk video berikutnya.

CATATAN:
Paket ini adalah bahan proyek yang bisa diedit, bukan file proyek CapCut native (.capcut).
Format proyek native CapCut tidak dibuat karena formatnya berbeda antar versi aplikasi.
Gunakan gambar dan audio dari paket ini agar hasil tetap sesuai narasi.
`;
fs.writeFileSync(path.join(bundleDir, 'README-ANDROID.txt'), readme, 'utf8');

fs.mkdirSync(outputDir, { recursive: true });
const zipPath = path.join(outputDir, 'capcut-template-assets.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execFileSync('zip', ['-qr', zipPath, bundleName], { cwd: outputDir });

console.log('CapCut assets siap: ' + zipPath);
console.log('Folder video: ' + folderName);
console.log('Jumlah scene: ' + manifestScenes.length);
