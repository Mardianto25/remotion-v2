# Independent Facebook Reels — Dynamic 3D Character + Hybrid Render

Workflow ini berdiri sendiri dan menghasilkan Reels dari topik hingga video animasi.
Workflow Shorts YouTube, image-based renderer, audio, subtitles, dan publishing yang lama tidak diganti.

## Pipeline

1. Gemini membuat naskah, metadata, cast karakter dinamis, dan storyboard 5 scene.
2. Gemini TTS membuat narasi Indonesia.
3. Storyboard dikonversi menjadi timeline yang mengikuti durasi audio.
4. Three.js + React Three Fiber merender dunia dan gerakan karakter menjadi 3D plate terpisah.
5. Remotion menggabungkan 3D plate dengan audio TTS, subtitle, gradient, dan transisi menjadi MP4 final.
6. Metadata disiapkan dan video dipublikasikan ke Facebook Page Reels.

## Dynamic character system

Profil karakter disimpan terpisah dari aksi scene. ID karakter yang sama menjaga identitas visual sepanjang cerita.

Atribut yang dikendalikan storyboard Gemini:
- gender dan kelompok usia
- skin tone
- outfit dan headwear (karakter perempuan otomatis memakai hijab)
- beard style
- aksi: walking, sitting, dua, looking up, crying, serta pose salat qiyam/ruku/sujud/jalsa
- emosi dan posisi karakter dalam frame

facebook-reels/src/CharacterRig.jsx berisi articulated hierarchy rig dengan pivot bahu, siku, pinggul, dan lutut. Pose dihitung deterministik dari frame Remotion, sehingga hasil render dapat diulang.

## Hybrid rendering

- Facebook3DPlate: hanya dunia 3D dan karakter, dirender ke out/facebook-reels/public/3d-plate.mp4.
- FacebookHybridReel: membaca 3D plate melalui OffthreadVideo, lalu menambahkan narration WAV dan subtitle.
- Orkestrasi: facebook-reels/render-hybrid.js.
- Composition root: facebook-reels/src/AnimatedRoot.jsx.

Menjalankan render setelah content, audio, dan animation story tersedia:

npm ci
node facebook-reels/generate-content.js
node facebook-reels/generate-audio.js
node facebook-reels/generate-animation-data.js
npm run render:facebook:hybrid

## GitHub Actions

Buka Actions → Generate and Publish Independent Facebook Reels. Pilih Run workflow dan isi topik.

Workflow menggunakan secrets yang sudah ada:
- GEMINI_API_KEY
- FB_PAGE_ID
- FB_PAGE_ACCESS_TOKEN

Tidak membutuhkan secret Cloudflare tambahan. Render menggunakan --gl=swangle untuk runner GitHub Actions.

## Catatan kualitas

- Karakter saat ini merupakan rig prosedural articulated, bukan model GLB hasil motion capture. Ini membuat pipeline tidak bergantung pada asset berbayar dan mudah diuji.
- Pose salat dibuat sebagai pose animasi dasar; tetap perlu review visual untuk memastikan gerakan dan orientasi sesuai.
- Subtitle memakai pembagian durasi berdasarkan jumlah kata per scene, belum forced alignment per kata.
- Render hybrid terdiri dari dua tahap: 3D plate lalu compositing. Hasil final tetap satu MP4 untuk upload Facebook.
