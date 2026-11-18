# Semesta Kisah — Indonesian Horror AI

Pipeline produksi video misteri/horor Indonesia untuk channel YouTube **Semesta Kisah**. Seluruh pipeline berada di folder `horror/`, sehingga workflow Shorts yang sudah ada tidak diubah.

## Alur otomatis
1. Gemini membuat naskah dan daftar scene.
2. Gemini membuat judul, deskripsi, hashtag, dan tag SEO berdasarkan isi cerita.
3. Cloudflare Workers AI FLUX membuat visual; Pixabay fallback; Pexels opsional.
4. Edge-TTS membuat narasi dan subtitle VTT.
5. Cloudflare FLUX membuat gambar thumbnail, lalu Sharp menambahkan teks judul dan identitas channel.
6. Remotion merender video landscape.
7. GitHub Actions mengunggah video dan thumbnail ke channel Semesta Kisah jika opsi upload aktif.
8. Video, thumbnail, metadata, naskah, dan manifest disimpan sebagai artifact selama 7 hari.

## GitHub Actions Secrets
Atur di Settings > Secrets and variables > Actions:
- `GEMINI_API_KEY`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `PIXABAY_API_KEY`
- `PEXELS_API_KEY` (opsional)
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN_V2` — refresh token OAuth yang memang diberi akses ke channel Semesta Kisah.

Jangan commit credential atau token ke repository. OAuth harus memiliki scope YouTube Data API untuk upload. Workflow memeriksa nama channel sebelum upload dan membatalkan proses jika token mengarah ke channel selain Semesta Kisah.

## Menjalankan
Buka Actions > Generate Indonesian Horror Video > Run workflow. Isi topik, pilih apakah upload otomatis dilakukan, lalu pilih status video:
- `private` (default dan disarankan untuk pemeriksaan)
- `unlisted`
- `public`

Upload otomatis aktif secara default, tetapi video berstatus private. Periksa video di YouTube Studio sebelum mengubahnya menjadi public.

## Lokal
1. Masuk folder `horror/`.
2. Salin `.env.example` menjadi `.env` dan isi credential.
3. Jalankan `npm install`.
4. Instal Edge-TTS: `python3 -m pip install edge-tts`.
5. Pastikan ffmpeg tersedia.
6. Jalankan `npm run generate -- "Misteri Alas Purwo"`.
7. Jalankan `npm run render`.

Untuk upload lokal, isi variabel OAuth di environment dan jalankan `npm run upload:youtube`.

## Catatan
Metadata dan thumbnail dihasilkan AI, sehingga tetap perlu ditinjau. Hindari klaim "kisah nyata" atau fakta yang tidak terverifikasi. Pastikan lisensi aset visual sesuai penggunaan. Pipeline Shorts lama tidak disentuh.
