# Long Video Pipeline

Jalur Long Video terpisah dari workflow Shorts. ID produksi diberi prefix format agar judul yang sama tidak membuat aset atau checkpoint tertukar:
- Shorts: `short-<slug-judul>` untuk Season ID baru.
- Long Video: `long-<slug-judul>` untuk Season ID dan `output_id`.
Judul publik YouTube tetap natural dan boleh sama; `contentId` internal, folder, checkpoint, dan artifact menjadi pembeda.

## Urutan workflow

**Shorts** tampil sebagai workflow 01–07, lalu **Long Video** tampil sebagai workflow 08–14 (label tahap Long Video tetap 01–07).

1. **Long Video 01 — Season Plan** (workflow 08) — opsional, untuk serial.
2. **Long Video 02 — Story** (workflow 09) — membuat naskah Single Video atau mengambil naskah episode dari Season Plan.
3. **Long Video 03 — Images** (workflow 10) — gambar landscape 16:9, mendukung resume.
4. **Long Video 04 — Audio & Subtitles** (workflow 11) — narasi MP3 dan subtitle VTT.
5. **Long Video 05 — Thumbnail & SEO** (workflow 12) — thumbnail 1280×720 dan metadata.
6. **Long Video 06 — Render 16:9** (workflow 13) — render dan validasi MP4 1920×1080.
7. **Long Video 07 — Upload YouTube** (workflow 14) — upload sebagai PRIVATE dan pasang thumbnail landscape.

Jalankan tahap 02–07 secara manual sesuai urutan. Gunakan `output_id` yang sama. Setiap tahap menyimpan checkpoint ke Git dan artifact Actions.

## Single Video

Pada workflow 09:
- Isi `output_id` dengan ID yang diawali `long-`, misalnya `long-kisah-keluarga`.
- Isi topik, genre, durasi 1–8 menit, dan visual style.
- Kosongkan `series_id`.

## Series / Episode

1. Jalankan workflow 08. Season ID otomatis diawali `long-`; ambil ID dari log workflow.
2. Jalankan workflow 09 dengan `series_id` dan nomor episode.
3. Isi `output_id` dengan pola `<series-id>-episode-XX`, misalnya `long-kisah-keluarga-episode-01`. Jangan isi topik.
4. Jalankan workflow 10–14 dengan `output_id` yang sama dan visual style yang sama seperti tahap 09.

## Upload YouTube

Upload default menggunakan status **PRIVATE**. Gunakan `new_video` untuk upload baru. Jika video berhasil diupload tetapi thumbnail gagal, jalankan ulang workflow 14 dengan `retry_thumbnail`; mode ini hanya mengulang pemasangan thumbnail, bukan mengupload video duplikat.

## Batasan

- Durasi target 1–8 menit; audio maksimal 8 menit 30 detik.
- Output landscape 1920×1080 (16:9), thumbnail 1280×720.
- Long Video tidak memakai hashtag `#Shorts`.
- Folder dan data Long Video terpisah dari Shorts.
