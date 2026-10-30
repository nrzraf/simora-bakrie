# Database PostgreSQL

Jalankan `npm run db:migrate` untuk mengeksekusi `001_schema.sql`. Alternatif: jalankan SQL tersebut melalui console SQL provider menggunakan akun database tepercaya.

Relasi:

- users → sessions: satu akun memiliki beberapa sesi perangkat.
- events → qr_sessions: satu sesi QR aktif/terakhir per kegiatan.
- events + users → attendance: satu catatan per peserta per kegiatan (primary key gabungan).
- users → audit_logs: pencatatan aksi pengelolaan dan check-in.
- rate_limits: pembatasan percobaan lintas instance server.

`001_schema.sql` dapat dijalankan ulang untuk database kosong/versi skema yang sama. `IF NOT EXISTS` bukan pengganti migrasi ALTER untuk perubahan skema di masa depan. Jangan menjalankan DROP TABLE pada database berisi data pengguna.
