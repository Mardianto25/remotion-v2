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
- `CF_ACCOUNT_ID_V2`
- `CF_API_TOKEN_V2`
- `PIXABAY_API_KEY`
- `PEXELS_API_KEY` (opsional)
- `YOUTUBE_CLIENT_ID_3N`
- `YOUTUBE_CLIENT_SECRET_3N`
- `YOUTUBE_REFRESH_TOKEN_3N`

Jangan commit credential atau token ke repository. Mode tren otomatis memerlukan kuota YouTube Data API dan scope baca YouTube. Upload video memerlukan scope YouTube Data API yang sesuai.

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

Season Planner menyiapkan **seluruh 8 naskah episode dan seluruh scene** dalam satu kali perencanaan. Setiap workflow produksi berikutnya hanya membaca hasil yang tersimpan; workflow Generate Episode Script tidak memanggil Gemini untuk menulis ulang naskah atau scene.

### Workflow terpisah

1. [Generate Season Plan](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-season-plan.yml) — Gemini membuat series bible, karakter, aturan dunia, 8 naskah final, dan 5-8 scene per episode.
2. [Generate Episode Script](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-script.yml) — menyalin naskah dan scene dari season plan ke folder episode. Tidak ada AI call.
3. [Generate Episode Images](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-images.yml) — membuat gambar scene yang belum tersedia. Gambar yang valid dilewati. Jika scene 4 gagal, jalankan workflow yang sama lagi: scene 1-3 dilewati, scene 4 dicoba ulang, lalu lanjut scene berikutnya.
4. [Generate Episode Audio](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-audio.yml) — Edge-TTS membuat narasi dan subtitle; file valid digunakan kembali.
5. [Render Episode Video](https://github.com/Mardianto25/remotion-v2/actions/workflows/render-episode-video.yml) — Remotion memakai gambar dan audio tersimpan; hasil MP4 menjadi artifact.
6. [Generate Episode Thumbnail](https://github.com/Mardianto25/remotion-v2/actions/workflows/generate-episode-thumbnail.yml) — membuat SEO metadata dan thumbnail terpisah; hasil tersimpan agar tidak perlu dibuat ulang.
7. [Upload Episode YouTube](https://github.com/Mardianto25/remotion-v2/actions/workflows/upload-episode-youtube.yml) — mengunduh artifact video dan thumbnail dari run yang dipilih, lalu upload sebagai PRIVATE menggunakan credential channel 3N.

### Urutan penggunaan

- Jalankan Season Plan satu kali untuk season baru. Season plan lama yang hanya memiliki outline perlu dibuat ulang karena belum menyimpan naskah dan scene final.
- Jalankan Episode Script untuk episode yang akan diproduksi.
- Jalankan Images, Audio, Render, dan Thumbnail secara terpisah. Isi season ID dan nomor episode yang sama di setiap workflow.
- Jika Images gagal, buka ulang workflow Images dengan season ID, episode, dan visual style yang sama. File gambar yang sudah valid tidak akan digenerate ulang.
- Upload membutuhkan dua run ID: run ID workflow Render Episode Video dan run ID workflow Generate Episode Thumbnail. Ambil angka run ID dari URL halaman run GitHub Actions. Artifact disimpan 30 hari.
- Pastikan GitHub Actions memiliki izin **Read and write permissions** karena naskah, gambar, audio, thumbnail, dan status produksi disimpan ke repository. Upload YouTube tetap PRIVATE dan membutuhkan YOUTUBE_CLIENT_ID_3N, YOUTUBE_CLIENT_SECRET_3N, serta YOUTUBE_REFRESH_TOKEN_3N.

### Data dan checkpoint

Semua data episode berada di data/seasons/<season-id>/episodes/episode-XX/. Gambar disimpan per scene dan audio disimpan per episode. image-progress.json, image-manifest.json, audio-manifest.json, dan production-state.json mencatat progres. Video MP4 dipertukarkan sebagai GitHub Actions artifact agar tidak menambah ukuran Git repository.

Workflow lama generate-horror-episode.yml sekarang hanya menjadi entry point Season Planner. Produksi episode dilakukan melalui workflow terpisah di atas.

