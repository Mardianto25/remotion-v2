# Indonesian Horror AI

Pipeline produksi video cerita mistis Indonesia. Modul ini berada di folder horror/ agar tidak mengubah pipeline Shorts yang sudah ada.

## Alur
1. Gemini membuat naskah dan scene JSON.
2. Cloudflare Workers AI FLUX membuat gambar; Pixabay fallback; Pexels opsional jika API key tersedia.
3. Edge-TTS membuat narasi dan subtitle VTT.
4. Remotion merender video landscape 1920x1080.
5. GitHub Actions menyimpan MP4 sebagai artifact selama 7 hari.

## GitHub Secrets
Tambahkan di Settings > Secrets and variables > Actions:
- GEMINI_API_KEY
- CF_ACCOUNT_ID
- CF_API_TOKEN
- PIXABAY_API_KEY
- PEXELS_API_KEY (opsional)

Jangan commit API key ke repository publik.

## Lokal
1. Masuk folder horror.
2. Salin .env.example menjadi .env dan isi credential.
3. Jalankan npm install.
4. Instal Edge-TTS dengan python3 -m pip install edge-tts.
5. Pastikan ffmpeg tersedia.
6. Jalankan npm run generate -- "Misteri Alas Purwo".
7. Jalankan npm run render.

## GitHub Actions
Buka Actions > Generate Indonesian Horror Video > Run workflow, lalu isi topik.

Tahap awal hanya menghasilkan artifact. Upload YouTube belum diaktifkan.
Periksa fakta, sumber, lisensi aset dan hasil render sebelum publikasi.
