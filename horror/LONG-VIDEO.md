# Long Video Pipeline

Jalur Long Video berjalan terpisah dari workflow Shorts. Semua file produksi disimpan di namespace tersendiri: `public/long-video/<output-id>/`, `data/long-video/<output-id>/`, dan `long-out/<output-id>/`.

## Single Video

1. Buka GitHub Actions → **Long Video - 02 Production (Single / Episode)**.
2. Pilih mode `single`.
3. Isi topik, genre, target durasi 1–8 menit, dan visual style.
4. Jalankan workflow. Hasil MP4 landscape 1920×1080, thumbnail 16:9, audio, subtitle, gambar scene, dan manifest tersedia sebagai artifact.

## Series / Episode

1. Jalankan **Long Video - 01 Season Plan**. Isi judul, konsep, genre, jumlah episode, dan durasi per episode (1–8 menit).
2. Setelah season plan tersimpan, buka **Long Video - 02 Production (Single / Episode)**.
3. Pilih mode `episode`, masukkan Series ID dan nomor episode, lalu pilih visual style.
4. Workflow mengambil naskah final dari season plan, membuat aset, thumbnail, dan MP4 landscape.

## CLI

```bash
# Single Video
npm run generate:long -- --topic "Kisah perjuangan keluarga" --duration 5 --output-id single-kisah-keluarga

# Long Video season plan
npm run generate:long-season -- --season keluarga-01 --episodes 4 --duration 5 --genre drama --title "Kisah Keluarga" --concept "Perjuangan keluarga menghadapi masalah ekonomi"

# Materialize episode dari plan
npm run generate:long-episode -- --season keluarga-01 --episode 1
```

Audio tidak dipotong otomatis. Jika hasil narasi melebihi 8 menit 30 detik, proses berhenti dan meminta naskah diperbaiki. Render memakai komposisi Remotion `LongVideo` 1920×1080, terpisah dari komposisi portrait Shorts.
