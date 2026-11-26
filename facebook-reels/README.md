# Independent Facebook Reels workflow

Workflow ini berdiri sendiri dan tidak menggunakan URL Instagram, aset YouTube, atau file bersama pada pipeline lama.

## Cara menjalankan

1. Buka **Actions → Generate and Publish Independent Facebook Reels**.
2. Pilih **Run workflow** dan isi topik renungan.
3. Workflow membuat naskah, audio Gemini TTS, visual 3D cinematic, render 9:16, metadata, lalu menerbitkan Reels ke Facebook Page.

## Secrets yang dibutuhkan

- `GEMINI_API_KEY`
- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `FB_PAGE_ID`
- `FB_PAGE_ACCESS_TOKEN`

## Karakter dan TTS

- TTS: `gemini-2.5-flash-preview-tts`
- Voice preset: `Algenib` (karakter suara laki-laki); prompt mengarahkan pembacaan emosional, hangat, dan tenang.
- Visual: Cloudflare FLUX 3D cinematic, 1080x1920.
- Character master disimpan dalam GitHub Actions cache agar workflow rerun dapat menggunakan aset master yang sama. Prompt identitas karakter juga dikunci untuk semua scene.

## Batasan

Character master dipakai sebagai acuan deskripsi prompt; FLUX Schnell pada implementasi ini tidak melakukan image-reference conditioning, sehingga kesamaan wajah antarscene belum dapat dijamin sempurna.

Workflow memublikasikan ke Facebook Page Reels saja. Posting ke profil pribadi tidak dilakukan melalui Graph API.

Output disimpan di `out/facebook-reels/`, tidak menyentuh `public/audio.mp3`, `public/subtitles.json`, `public/transcript.txt`, `public/images/`, maupun workflow lama.
