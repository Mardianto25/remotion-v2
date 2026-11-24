# Ruang Cerita Indonesia — AI Storytelling Studio

Pipeline produksi YouTube Shorts storytelling multi-genre untuk channel **Ruang Cerita Indonesia**. Genre dapat dipilih per season: horor, misteri, Islami/inspiratif, drama, sejarah, petualangan, fantasi, edukasi, atau konsep khusus. Pipeline utama video panjang tetap berjalan seperti sebelumnya. Setelah video panjang selesai dirender, workflow juga membuat tiga video Shorts dari potongan audio, subtitle, dan visual yang sama.

## Alur produksi
1. Mode otomatis mengambil video horor/misteri Indonesia yang terbit pada hari kalender kemarin (WIB) melalui YouTube Data API.
2. Gemini menganalisis performa topik, lalu memilih tema untuk cerita orisinal.
3. Gemini membuat naskah cerita panjang dan metadata SEO.
4. Cloudflare Workers AI FLUX membuat visual; Pixabay fallback; Pexels opsional.
5. Edge-TTS membuat narasi dan subtitle VTT.
6. FLUX membuat thumbnail landscape dan Sharp menambahkan judul serta branding **Ruang Cerita Indonesia**.
7. Remotion merender video panjang landscape 16:9.
8. Generator Shorts memilih hingga tiga rentang subtitle yang tidak saling tumpang tindih, memotong audio asli dengan FFmpeg, lalu mengambil scene visual yang waktunya beririsan dengan rentang tersebut.
9. Remotion merender Shorts vertikal 9:16 ke folder `out/shorts/`.
10. Artifact berisi video panjang, thumbnail, hingga tiga video Shorts, dan metadata disimpan selama 7 hari.
11. Upload YouTube yang sudah ada tetap hanya mengunggah video panjang. Shorts disediakan sebagai artifact untuk ditinjau dan diunggah terpisah setelah kualitasnya disetujui.

## Biaya AI Shorts
Pembuatan Shorts tidak memanggil Gemini, FLUX, Pixabay, Pexels, atau Edge-TTS lagi. Shorts memakai ulang audio, subtitle, dan gambar yang sudah dihasilkan pada proses video panjang. Biaya tambahan utamanya adalah waktu render GitHub Actions dan penyimpanan artifact, bukan token AI atau kuota generate gambar.

## GitHub Actions Secrets
Atur di Settings > Secrets and variables > Actions:
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY` (fallback jika seluruh model Gemini gagal)
- `CF_ACCOUNT_ID_V2`
- `CF_API_TOKEN_V2`
- `CF_ACCOUNT_ID_V3` (opsional, akun Cloudflare kedua)
- `CF_API_TOKEN_V3` (opsional, token akun kedua)
- `CF_ACCOUNT_ID_V4` (opsional, akun Cloudflare ketiga)
- `CF_API_TOKEN_V4` (opsional, token akun ketiga)
- `PIXABAY_API_KEY`
- `PEXELS_API_KEY` (opsional)
- `YOUTUBE_CLIENT_ID_3N`
- `YOUTUBE_CLIENT_SECRET_3N`
- `YOUTUBE_REFRESH_TOKEN_3N`

Jangan commit credential atau token ke repository. Mode tren otomatis memerlukan kuota YouTube Data API dan scope baca YouTube. Upload video memerlukan scope YouTube Data API yang sesuai.

### Pilihan akun Cloudflare dan style gambar
Workflow **03 - SHORT | Images**, **06 - SHORT | Thumbnail & SEO**, **10 - LONG 03 | Images**, dan **12 - LONG 05 | Thumbnail & SEO** menyediakan pilihan akun Cloudflare: `v2`, `v3`, atau `v4`. Setiap pilihan menggunakan pasangan Account ID + API Token yang sesuai:
- `v2` memakai secret `CF_ACCOUNT_ID_V2` dan `CF_API_TOKEN_V2` (konfigurasi yang sudah digunakan sebelumnya).
- `v3` memakai secret `CF_ACCOUNT_ID_V3` dan `CF_API_TOKEN_V3`.
- `v4` memakai secret `CF_ACCOUNT_ID_V4` dan `CF_API_TOKEN_V4`.

Tambahkan pasangan secret untuk akun lain di **Settings > Secrets and variables > Actions** sebelum memilih profile tersebut. Token tidak ditampilkan di log dan tidak disimpan ke file repository. Jika secret profile yang dipilih belum lengkap, workflow berhenti dengan pesan yang jelas.

Workflow 06 juga menyediakan pilihan **Thumbnail Style**: `cinematic-3d` atau `2d-animation`. Pilihan ini terpisah dari style gambar scene di workflow 03. Cache thumbnail mengikuti style yang dipilih, sehingga mengganti style akan membuat thumbnail baru saat dijalankan ulang. Long Video thumbnail juga memiliki pilihan style landscape 16:9.


## Menjalankan dari GitHub Actions
Buka Actions > **Generate Ruang Cerita Indonesia Video** > Run workflow.

- **Automatic** (default): riset topik horor/misteri yang sedang diminati, lalu pilih topik orisinal.
- **Manual**: isi kolom topik sendiri.
- Upload otomatis dan penjadwalan video panjang tetap mengikuti pilihan workflow.
- Setelah render, workflow menghasilkan hingga tiga Shorts dan menyertakannya di artifact `ruang-cerita-indonesia-assets`.
- Shorts belum diunggah otomatis. Unduh artifact tersebut, tinjau file di `out/shorts/`, lalu unggah Shorts yang layak secara terpisah.

## Menjalankan lokal
1. Masuk folder `horror/`.
2. Salin `.env.example` menjadi `.env` dan isi credential.
3. Jalankan `npm install`.
4. Instal Edge-TTS dan pastikan FFmpeg tersedia.
5. Jalankan generate cerita: `npm run generate -- "Misteri Alas Purwo"` atau mode otomatis `npm run generate -- --auto`.
6. Render video panjang: `npm run render`.
7. Buat manifest dan audio potongan Shorts: `npm run generate:shorts`.
8. Render Shorts: `npm run render:shorts`.

## Output Shorts
- `out/shorts/short-01.mp4`
- `out/shorts/short-02.mp4`
- `out/shorts/short-03.mp4`
- `data/shorts-manifest.json`
- `data/shorts-metadata.json`

Jumlah Shorts dapat kurang dari tiga jika subtitle tidak menyediakan potongan yang cukup panjang dan tidak tumpang tindih. Periksa hasil video sebelum upload. Potongan diambil berdasarkan rentang subtitle yang tersedia; generator tidak mengubah isi narasi atau membuat hook narasi baru.

## Catatan
Metadata dan thumbnail dihasilkan AI, sehingga tetap perlu ditinjau. Hindari klaim "kisah nyata" atau fakta yang tidak terverifikasi. Pastikan lisensi aset visual sesuai penggunaan.


## Serial Story Production — Multi-Genre, Resumable

Season Planner menyiapkan **seluruh naskah episode dan seluruh scene** sesuai pilihan 4, 6, 8, 10, atau 12 episode dalam satu kali perencanaan. Setiap workflow produksi berikutnya hanya membaca hasil yang tersimpan; workflow Generate Episode Script tidak memanggil Gemini untuk menulis ulang naskah atau scene.

### Workflow produksi (urut 01–07)

Di tab **Actions**, workflow sudah diberi nomor di depan namanya agar tampil berurutan. Jalankan sesuai nomor; jangan lompat ke tahap berikutnya sebelum tahap sebelumnya berhasil.

1. [01 — Season Plan](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-season-plan.yml) — Gemini membuat series bible, karakter, aturan dunia, naskah final sesuai jumlah episode yang dipilih, dan 5-8 scene per episode.
2. [02 — Episode Script](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-script.yml) — menyalin naskah dan scene dari season plan ke folder episode. Tidak ada AI call.
3. [03 — Episode Images](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-images.yml) — membuat gambar scene yang belum tersedia. Gambar yang valid dilewati. Jika scene 4 gagal, jalankan workflow yang sama lagi: scene 1-3 dilewati, scene 4 dicoba ulang, lalu lanjut scene berikutnya.
4. [04 — Episode Audio](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-audio.yml) — Edge-TTS membuat narasi dan subtitle; file valid digunakan kembali.
5. [05 — Render Episode Video](https://github.com/Mardianto25/remotion-v2/actions/workflows/render-episode-video.yml) — Remotion memakai gambar dan audio tersimpan; hasil MP4 menjadi artifact.
6. [06 — Thumbnail & SEO](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-thumbnail.yml) — membuat SEO metadata dan thumbnail terpisah; pilih style 3D/2D dan profile akun Cloudflare; cache mengikuti style terpilih.
7. [07 — Upload Episode YouTube](https://github.com/Mardianto25/remotion-v2/actions/workflows/upload-episode-youtube.yml) — mengunduh artifact video dan thumbnail dari run yang dipilih, lalu upload sebagai PRIVATE menggunakan credential channel 3N.

### Urutan penggunaan

- Jalankan Season Plan satu kali untuk serial baru. Isi **Series Title**, pilih **Concept**, genre, dan jumlah episode (4, 6, 8, 10, atau 12). Series ID dibuat otomatis dari judul, misalnya `Semangat Belajar` menjadi `semangat-belajar`.
- Setelah Season Plan berhasil, workflow akan memperbarui pilihan dropdown pada workflow 02–07 berdasarkan seluruh `series-bible.json` yang tersimpan di repository.
- Pada workflow 02–07, pilih **Series ID** dari dropdown, pilih **Episode Number**, lalu pilih saran **Episode Title**. Judul episode divalidasi agar cocok dengan plan dan nomor episode yang dipilih. Tidak perlu mengetik ulang judul serial.
- Naskah dan 5–8 scene per episode sudah dibuat pada tahap Season Plan. Workflow Episode Script hanya mengambil naskah yang tersimpan; tahap produksi berikutnya menggunakan data scene yang sama tanpa menulis ulang naskah dengan AI.
- Pemanggilan AI memakai urutan `gemini-3.8-flash`, `gemini-3.5-flash`, dan `gemini-2.5-flash`. Jika seluruh model Gemini gagal, pipeline otomatis beralih ke OpenRouter dengan model default `openai/gpt-4o-mini`. Atur `OPENROUTER_API_KEY` di GitHub Actions Secrets; model dapat diubah melalui `OPENROUTER_MODEL`.
- Jika Images gagal, jalankan ulang workflow Images dengan Series ID, episode, judul episode, dan visual style yang sama. File gambar yang sudah valid tidak akan digenerate ulang.
- Upload membutuhkan dua run ID: run ID workflow Render Episode Video dan run ID workflow Generate Episode Thumbnail. Ambil angka run ID dari URL halaman run GitHub Actions. Artifact disimpan 30 hari.
- Pastikan GitHub Actions memiliki izin **Read and write permissions** karena naskah, gambar, audio, thumbnail, dan status produksi disimpan ke repository. Upload YouTube tetap PRIVATE dan membutuhkan YOUTUBE_CLIENT_ID_3N, YOUTUBE_CLIENT_SECRET_3N, serta YOUTUBE_REFRESH_TOKEN_3N.

### Data dan checkpoint

Semua data episode berada di data/seasons/<season-id>/episodes/episode-XX/. Gambar disimpan per scene dan audio disimpan per episode. image-progress.json, image-manifest.json, audio-manifest.json, dan production-state.json mencatat progres. Video MP4 dipertukarkan sebagai GitHub Actions artifact agar tidak menambah ukuran Git repository.

Workflow `99 - LEGACY | Season Planner` hanya dipertahankan untuk kompatibilitas dan tidak perlu digunakan. Gunakan workflow bernomor 01 untuk membuat season baru. Workflow lain yang tidak terkait (Instagram, CapCut, dan pipeline video panjang) tetap dipertahankan.

