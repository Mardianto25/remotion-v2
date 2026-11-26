# Independent Facebook Reels workflow

Workflow ini berdiri sendiri dan tidak menggunakan URL Instagram, aset YouTube, atau file bersama pada pipeline lama.

## Cara menjalankan

1. Buka **Actions → Generate and Publish Independent Facebook Reels**.
2. Pilih **Run workflow** dan isi topik renungan.
3. Workflow membuat naskah, audio Gemini TTS, visual 3D cinematic, render 9:16, metadata, lalu menerbitkan Reels ke Facebook Page.

## Secrets yang dibutuhkan

Workflow memakai konfigurasi Facebook yang sama dengan workflow `publish-facebook.yml`, tanpa membuat variable Facebook baru:

- `FB_PAGE_ID` (GitHub Secret, dipetakan ke `FACEBOOK_PAGE_ID`)
- `FB_PAGE_ACCESS_TOKEN` (GitHub Secret, dipetakan ke `FACEBOOK_PAGE_ACCESS_TOKEN`)
- `FACEBOOK_GRAPH_API_VERSION` (mengikuti versi yang dipakai workflow existing; default `v27.0`)

Secret tambahan khusus generator:

- `GEMINI_API_KEY`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`

## Karakter dan TTS

- TTS: `gemini-2.5-flash-preview-tts`
- Voice preset: `Algenib`; prompt mengarahkan pembacaan narator laki-laki dewasa yang emosional, hangat, dan tenang.
- Visual: Cloudflare FLUX 3D cinematic, 1080x1920.
- Character master dibuat sekali dan disimpan dalam GitHub Actions cache. Deskripsi identitas karakter dikunci untuk seluruh scene.

**Catatan konsistensi:** FLUX Schnell yang digunakan di workflow ini menghasilkan gambar dari prompt teks dan tidak menerima gambar master sebagai image-reference. Karena itu master disimpan untuk referensi aset, sedangkan konsistensi wajah dijaga melalui deskripsi karakter yang sama; kemiripan wajah antarscene belum bisa dijamin sempurna.

## Batasan

Workflow memublikasikan ke Facebook Page Reels saja. Posting ke profil pribadi tidak dilakukan melalui Graph API.

Output disimpan di `out/facebook-reels/`, tidak menyentuh `public/audio.mp3`, `public/subtitles.json`, `public/transcript.txt`, `public/images/`, maupun workflow lama.
