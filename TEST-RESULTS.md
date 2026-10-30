# Hasil pemeriksaan — 30 Oktober 2026

- `npm test`: 12 pengujian lulus, 0 gagal (1 suite + 11 subtest).
- `npx tsc --noEmit`: lulus.
- `npm run build`: build produksi Next.js lulus; route `/`, `/login`, `/api/[...path]` terdeteksi.

Pengujian integrasi menjalankan handler API aplikasi dengan request/cookie sesi yang terpisah dan database PostgreSQL embedded PGlite. Gambar QR PNG benar-benar dibuat dan dibaca kembali oleh jsQR, lalu payload hasil pembacaan dikirim ke handler check-in. Identitas yang dikirim klien tidak dapat menggantikan identitas akun dari sesi.

Cakupan subtest:

1. Akses tanpa sesi dan mutasi dari origin lain ditolak.
2. Registrasi memaksa role Anggota dan menolak email duplikat.
3. Login memeriksa password dan role.
4. Hanya Admin membuat Pengurus; input role palsu diabaikan.
5. Validasi tanggal kegiatan dan pembatasan penerbit QR.
6. Anggota tidak menerima secret QR atau data akun peserta lain.
7. Scan PNG melalui sesi Anggota mencatat data SQL yang terlihat oleh sesi Admin.
8. Absensi ganda dan permintaan bersamaan tidak menambah catatan duplikat.
9. Koreksi manual, QR yang diganti/dicabut/kedaluwarsa, dan kegiatan salah.
10. Perubahan role mencabut sesi; logout menonaktifkan sesi di server.
11. Rate limit tersimpan di SQL.

Belum diverifikasi: deployment Vercel pada akun pengguna, koneksi cloud PostgreSQL, pemindaian kamera HP fisik, beban produksi, pengiriman email, serta pengujian browser end-to-end. Tidak ada klaim pengujian layanan eksternal berdasarkan uji embedded ini.
