# Independent Facebook Reels — Three.js Animated Edition

Workflow ini berdiri sendiri dan menghasilkan Reels dari topik hingga video animasi.
Tidak memakai URL Instagram, aset YouTube, Cloudflare image generation, atau file bersama dari pipeline lama.

## Alur produksi

1. Gemini menulis renungan Islami dan storyboard lima scene.
2. Setiap scene mendapat setting, aksi karakter, dan mood dari enum terkontrol.
3. Gemini TTS membuat narasi laki-laki Indonesia.
4. Storyboard diubah menjadi timeline sesuai durasi audio.
5. Three.js + React Three Fiber membangun dunia 3D dan karakter animasi.
6. Remotion merender video vertikal 1080x1920, subtitle, dan audio.
7. Generator metadata menyiapkan judul, caption, dan hashtag.
8. Graph API menerbitkan video ke Facebook Page Reels.

## Menjalankan

Buka **Actions → Generate and Publish Independent Facebook Reels** lalu pilih **Run workflow** dan isi topik.

## Secrets

- `GEMINI_API_KEY`
- `FB_PAGE_ID`
- `FB_PAGE_ACCESS_TOKEN`

Facebook secrets yang sudah dipakai workflow lama tetap digunakan. Tidak perlu secret Cloudflare untuk renderer animasi ini.

## Teknologi

- `three` + `@react-three/fiber`: dunia 3D, properti, karakter dan aksi.
- `@remotion/three`: canvas Three.js yang sinkron dengan frame Remotion.
- Remotion: timeline, subtitle, audio, dan render MP4.
- Gemini: naskah, metadata, dan TTS.

## Catatan kualitas

- Karakter dibuat dari geometri prosedural, bukan model manusia fotorealistis. Bentuk, pakaian, dan identitas visual dikunci dalam kode agar konsisten antarscene.
- Setting dan mood scene saat ini berupa variasi lingkungan prosedural; bukan model 3D bebas yang dihasilkan AI.
- Timing subtitle dibagi berdasarkan jumlah kata per scene terhadap durasi TTS. Ini estimasi, bukan word-level alignment, sehingga perlu QA audio/video.
- Render menggunakan `--gl=swangle` untuk runner GitHub Actions tanpa GPU dedicated. Render 3D lebih berat daripada slideshow gambar, jadi waktu dan stabilitas perlu diuji.
- Workflow lama YouTube dan komposisi image-based tidak diubah.
