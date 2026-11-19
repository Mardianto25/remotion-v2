# Ruang Cerita Indonesia — Indonesian Horror AI

Pipeline produksi video misteri/horor Indonesia untuk channel YouTube **Ruang Cerita Indonesia**. Seluruh pipeline berada di folder `horror/`, sehingga workflow Shorts yang sudah ada tidak diubah.

## Alur produksi
1. Mode otomatis mengambil video horor/misteri Indonesia yang terbit pada hari kalender kemarin (WIB) melalui YouTube Data API.
2. Gemini menganalisis jumlah views dan estimasi views per jam, lalu memilih tema untuk cerita orisinal. Judul video akhir tetap dibuat berdasarkan naskah, bukan menyalin judul video sumber.
3. Gemini membuat naskah, judul, deskripsi, hashtag, dan tag SEO.
4. Cloudflare Workers AI FLUX membuat visual; Pixabay fallback; Pexels opsional.
5. Edge-TTS membuat narasi dan subtitle VTT.
6. Cloudflare FLUX membuat thumbnail 1280x720, lalu Sharp menambahkan judul dan branding **Ruang Cerita Indonesia**.
7. Remotion merender video landscape.
8. GitHub Actions mengunggah video dan thumbnail ke channel Ruang Cerita Indonesia. Secara default video dijadwalkan tayang Jumat atau Minggu pukul 19.00 WIB.
9. Video, thumbnail, metadata, naskah, laporan tren, dan manifest disimpan sebagai artifact selama 7 hari. Status upload YouTube juga diarsipkan agar kegagalan saat memasang thumbnail dapat dilanjutkan tanpa upload video duplikat.

## GitHub Actions Secrets
Atur di Settings > Secrets and variables > Actions:
- `GEMINI_API_KEY`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `PIXABAY_API_KEY`
- `PEXELS_API_KEY` (opsional)
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN_V2` — refresh token OAuth yang memiliki akses baca data YouTube dan upload ke channel tujuan.

Jangan commit credential atau token ke repository. Mode tren otomatis membutuhkan scope `https://www.googleapis.com/auth/youtube.readonly`. Upload video dan thumbnail membutuhkan scope YouTube Data API yang sesuai.

## Menjalankan dari GitHub Actions
Buka Actions > **Generate Ruang Cerita Indonesia Video** > Run workflow.

- **Automatic** (default): riset video horor/misteri yang terbit kemarin di Indonesia, urutkan berdasarkan performa views, lalu pilih topik orisinal menggunakan Gemini.
- **Manual**: isi kolom topik sendiri.
- Upload otomatis aktif secara default.
- Penjadwalan Jumat/Minggu pukul 19.00 WIB aktif secara default. Video diunggah sebagai private dan dijadwalkan untuk dipublikasikan pada slot berikutnya.
- Jika penjadwalan dimatikan, status video dapat dipilih sebagai private, unlisted, atau public.

Mode otomatis memerlukan kuota YouTube Data API. Jika tidak ada hasil untuk niche horor pada hari sebelumnya, workflow berhenti dengan pesan yang jelas; gunakan mode manual sebagai alternatif. Jumlah views adalah sinyal minat, bukan bukti bahwa cerita sumber benar. Ide yang dipilih dibuat ulang menjadi cerita orisinal dan tidak menyalin video sumber.

Waktu tayang 19.00 WIB adalah baseline awal dan perlu dievaluasi ulang memakai Analytics > Audience > When your viewers are on YouTube setelah channel memiliki data.

## Lokal
1. Masuk folder `horror/`.
2. Salin `.env.example` menjadi `.env` dan isi credential.
3. Jalankan `npm install`.
4. Instal Edge-TTS: `python3 -m pip install edge-tts`.
5. Pastikan ffmpeg tersedia.
6. Mode manual: `npm run generate -- "Misteri Alas Purwo"`.
7. Mode otomatis: atur `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN_V2`, lalu jalankan `npm run generate -- --auto`.
8. Jalankan `npm run render`.

Jika upload gagal, buka Actions > **Retry Ruang Cerita Indonesia YouTube Upload**. Masukkan Run ID dari proses Generate Ruang Cerita Indonesia Video yang artifact-nya mau diupload ulang. Workflow retry mengambil video, thumbnail, dan metadata dari artifact, tanpa generate/render ulang. Artifact tersedia selama 7 hari. Jika upload video sudah berhasil tetapi thumbnail gagal, state berisi Video ID dipakai untuk melanjutkan pemasangan thumbnail pada video yang sama.

Untuk upload lokal, isi variabel OAuth di environment dan jalankan `npm run upload:youtube`.

## Catatan
Metadata dan thumbnail dihasilkan AI, sehingga tetap perlu ditinjau. Hindari klaim "kisah nyata" atau fakta yang tidak terverifikasi. Pastikan lisensi aset visual sesuai penggunaan. Pipeline Shorts lama tidak disentuh.
