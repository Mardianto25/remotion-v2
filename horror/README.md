# Ruang Cerita Indonesia — Indonesian Horror AI

Pipeline produksi video misteri/horor Indonesia untuk channel YouTube **Ruang Cerita Indonesia**. Pipeline utama video panjang tetap berjalan seperti sebelumnya. Setelah video panjang selesai dirender, workflow juga membuat tiga video Shorts dari potongan audio, subtitle, dan visual yang sama.

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
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN_V2`

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


## Serial POV Survival & Mystery (8 episode per season)

Workflow serial tersedia di **Actions > Ruang Cerita Indonesia — Episode Generator** atau melalui tab **Cerita Episode** pada Auto-Shorts Studio. Workflow dispatch berada di branch default (`main`), sehingga bisa dijalankan langsung dari GitHub Actions.

1. Pilih `create-season`, isi `season_id` (contoh `season-01`) dan konsep. Gemini membuat series bible, world rules, character bible, dan outline 8 episode.
2. Pilih `generate-episode`, gunakan season ID yang sama dan pilih satu episode. Episode 2-8 hanya bisa dibuat jika episode sebelumnya sudah berhasil dirender.
3. Gemini Episode Writer menulis naskah POV orang kedua, lalu Retention Agent dan Continuity Agent menilai naskah. Maksimal tiga draft; skor minimal 85/100 untuk kedua pemeriksaan.
4. Jika lolos, pipeline existing membuat Edge-TTS, FLUX.1 Schnell, sound design, thumbnail, dan Remotion video. Pilih visual style **cinematic-3d** (default) atau **2d-animation** saat menjalankan workflow. Style dijaga konsisten; jika FLUX gagal, workflow tidak mengganti scene dengan foto stok. Workflow cerita lama tetap memakai perilaku default-nya.
5. Hasil episode, review, aset, video, dan continuity ledger disimpan di `data/seasons/<season-id>/episodes/episode-XX/`. Workflow menyimpan data season ke branch `main` agar run berikutnya dapat melanjutkan cerita.

Perintah lokal dari folder `horror/`:
- `npm run generate:season -- --season season-01 --concept "POV: Terjebak di sekolah saat kiamat zombie"`
- `npm run generate:episode -- --season season-01 --episode 1`
- `npm run generate:episode-assets`
- `npx remotion render remotion/index.jsx HorrorVideo out/indonesian-horror.mp4 --codec=h264 --crf=22`

Jalankan workflow dari branch default `main`. Workflow episodik membutuhkan izin GitHub Actions untuk menulis commit agar season bible dan progres episode bertahan di antara workflow run. Pastikan Actions memiliki izin **Read and write permissions** pada Settings > Actions > General. Jangan aktifkan `force_regenerate` untuk episode yang sudah dirender; perubahan episode lama memerlukan rekonsiliasi continuity dan episode setelahnya.
