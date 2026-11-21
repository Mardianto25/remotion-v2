import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'out');
const scenesPath = path.join(publicDir, 'subtitles.json');
const audioPath = path.join(publicDir, 'audio.mp3');

if (!fs.existsSync(scenesPath)) throw new Error('public/subtitles.json tidak ditemukan');
if (!fs.existsSync(audioPath)) throw new Error('public/audio.mp3 tidak ditemukan');

const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('Tidak ada scene untuk diekspor');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const packageDir = path.join(outDir, 'capcut-template');
const mediaDir = path.join(packageDir, 'media');
fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(mediaDir, { recursive: true });

const srtTime = (seconds) => {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000));
  const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const milli = String(ms % 1000).padStart(3, '0');
  return `${hh}:${mm}:${ss},${milli}`;
};

const srt = [];
const manifestScenes = [];
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i];
  const start = Number(scene.start);
  const end = Number(scene.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error(`Timestamp scene ${i + 1} tidak valid`);
  }
  const text = String(scene.text || '').trim();
  if (!text) throw new Error(`Teks scene ${i + 1} kosong`);
  srt.push(String(i + 1), `${srtTime(start)} --> ${srtTime(end)}`, text, '');

  let imageSource = String(scene.image || '');
  if (!imageSource) throw new Error(`Gambar scene ${i + 1} kosong`);
  if (/^https?:\/\//i.test(imageSource)) {
    throw new Error(`Scene ${i + 1} memakai URL gambar eksternal; ekspor Android membutuhkan file gambar lokal.`);
  }
  imageSource = path.join(publicDir, imageSource.replace(/^\/+/, ''));
  if (!fs.existsSync(imageSource)) throw new Error(`Gambar scene ${i + 1} tidak ditemukan: ${imageSource}`);
  const ext = path.extname(imageSource) || '.jpg';
  const filename = `scene-${String(i + 1).padStart(3, '0')}${ext}`;
  fs.copyFileSync(imageSource, path.join(mediaDir, filename));
  manifestScenes.push({
    order: i + 1,
    start,
    end,
    duration: Number((end - start).toFixed(3)),
    text,
    image: `media/${filename}`
  });
}

fs.copyFileSync(audioPath, path.join(mediaDir, 'audio-original.mp3'));
fs.writeFileSync(path.join(packageDir, 'captions.srt'), srt.join('\n'), 'utf8');
fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({
  format: 'capcut-android-import-pack',
  createdAt: new Date().toISOString(),
  aspectRatio: '9:16',
  fps: 30,
  audio: 'media/audio-original.mp3',
  sceneCount: manifestScenes.length,
  scenes: manifestScenes
}, null, 2));
fs.writeFileSync(path.join(packageDir, 'PETUNJUK-ANDROID.txt'), `PAKET BAHAN CAPCUT ANDROID

Isi:
- media/audio-original.mp3: audio asli dari video
- media/scene-001...: gambar sesuai urutan scene
- captions.srt: subtitle dengan timestamp dari pipeline
- manifest.json: urutan scene, waktu mulai/selesai, teks, dan nama gambar

CARA MEMBUAT TEMPLATE DI CAPCUT ANDROID
1. Ekstrak ZIP ini ke penyimpanan HP (jangan mengedit langsung dari dalam ZIP).
2. Buka CapCut > Proyek baru.
3. Pilih semua gambar di folder media sesuai urutan scene-001, scene-002, dan seterusnya.
4. Atur kanvas ke 9:16. Samakan durasi setiap gambar dengan waktu start/end pada manifest.json.
5. Tambahkan audio-original.mp3 ke track audio, mulai dari 00:00.
6. Impor captions.srt melalui fitur Captions/Subtitles > Import captions jika tersedia pada versi CapCut kamu. Jika menu impor SRT tidak tersedia, gunakan teks pada manifest.json sebagai acuan subtitle.
7. Tambahkan transisi Dissolve/Crossfade singkat antar gambar. Gunakan animasi keyframe zoom perlahan agar mendekati gerakan Ken Burns dari video Remotion.
8. Simpan proyek sebagai master. Untuk video berikutnya, duplikasikan proyek lalu ganti media dan subtitle.

CATATAN
Paket ini adalah bahan impor yang bisa diedit, bukan file proyek CapCut native (.capcut). CapCut Android tidak menyediakan jalur impor proyek native generik yang stabil dari pipeline eksternal. Ketersediaan impor SRT bisa berbeda menurut versi/aplikasi/region.
`, 'utf8');

fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, 'capcut-template.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execFileSync('zip', ['-qr', zipPath, 'capcut-template'], { cwd: outDir });
console.log(`Paket CapCut siap: ${zipPath} (${manifestScenes.length} scene)`);
