# Long Video Pipeline

Jalur Long Video terpisah dari workflow Shorts. Semua aset dan output memakai namespace sendiri: `public/long-video/<output-id>/`, `data/long-video/<output-id>/`, dan `long-out/<output-id>/`.

## Urutan workflow

1. **Long Video - 01 Season Plan** — opsional, hanya untuk serial. Membuat rencana season dan episode.
2. **Long Video - 02 Story** — membuat naskah Single Video, atau mengambil naskah episode dari Season Plan.
3. **Long Video - 03 Images** — generate gambar scene landscape 16:9. Bisa resume; gambar valid yang sudah ada tidak dibuat ulang.
4. **Long Video - 04 Audio & Subtitles** — generate narasi MP3 dan subtitle VTT.
5. **Long Video - 05 Thumbnail & SEO** — membuat thumbnail YouTube 1280×720 dan metadata.
6. **Long Video - 06 Render 16:9** — render dan validasi MP4 1920×1080.
7. **Long Video - 07 Upload YouTube | PRIVATE** — upload video standar ke channel sebagai PRIVATE, lalu memasang thumbnail landscape.

Jalankan setiap workflow secara manual sesuai urutan. Gunakan `output_id` yang sama pada tahap 02–07. Setiap tahap menyimpan checkpoint ke Git dan artifact Actions, sehingga tahap berikutnya bisa melanjutkan tanpa mengulang tahap sebelumnya.

## Single Video

Pada tahap 02:
- Isi `output_id` dengan ID sederhana, misalnya `single-kisah-keluarga`.
- Isi topik, genre, durasi 1–8 menit, dan visual style.
- Kosongkan `series_id`.

Contoh ID: `single-kisah-keluarga`.

## Series / Episode

1. Jalankan **Long Video - 01 Season Plan**. Isi judul, konsep, genre, jumlah episode, dan durasi setiap episode.
2. Ambil Series ID dari log workflow Season Plan.
3. Jalankan **Long Video - 02 Story**. Isi `series_id` dan nomor episode. Isi `output_id` dengan pola `<series-id>-episode-XX`, misalnya `kisah-keluarga-episode-01`. Jangan isi topik.
4. Jalankan tahap 03–07 dengan `output_id` yang sama. Pilih visual style yang sama pada tahap 02 dan 03.

## Upload YouTube

Upload default menggunakan status **PRIVATE**. Gunakan `new_video` untuk upload video baru. Jika video sudah berhasil diupload tetapi thumbnail gagal, jalankan ulang tahap 07 dengan `retry_thumbnail`; mode ini hanya mengulang pemasangan thumbnail dan tidak mengupload video duplikat.

## Batasan

- Durasi target 1–8 menit; audio maksimal 8 menit 30 detik.
- Output video landscape 1920×1080 (16:9).
- Thumbnail landscape 1280×720.
- Long Video tidak memakai hashtag `#Shorts`.
- Shorts workflow, data, dan komposisinya tidak diubah.
