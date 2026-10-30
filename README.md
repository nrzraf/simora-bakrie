# SIMORA — Next.js + PostgreSQL + Vercel

Versi full-stack SIMORA. React/Next.js App Router, Tailwind CSS, lucide-react, backend Node.js API, PostgreSQL, QR Code, autentikasi berbasis sesi server.

## Status paket

Source code siap build untuk Vercel. Build Next.js dan 12 pengujian integrasi lulus di lingkungan pengerjaan. Database pengujian memakai PGlite (PostgreSQL embedded), bukan database cloud pengguna. Deployment Vercel dan koneksi database cloud belum diselesaikan; tidak ada URL Vercel produksi yang diklaim dalam paket ini.

Versi ini terpisah dari demo Sites sebelumnya. Akun/data localStorage dari demo tidak dimigrasikan otomatis. Tidak ada akun/password admin bawaan. Grafik aktivitas historis dan pengumuman masih konten contoh berlabel demo; data kegiatan, akun, QR, dan absensi berasal dari SQL. Organisasi masih katalog HIMSI/BEM/UKM Seni/Mapala.

## Persiapan

- Node.js 22.13+ (disarankan Node 22 LTS), npm.
- Database PostgreSQL 16+ lokal atau layanan PostgreSQL terkelola.
- Untuk Vercel, gunakan connection string pooler dari penyedia database jika tersedia. Jangan menambahkan prefix NEXT_PUBLIC pada DATABASE_URL.

## Menjalankan lokal

1. Ekstrak ZIP dan buka folder `SIMORA-Vercel-SQL`.
2. Jalankan:

```bash
npm ci
cp .env.example .env.local
```

3. Isi `.env.local`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
APP_URL=http://localhost:3000
ADMIN_NAME=Administrator SIMORA
ADMIN_EMAIL=admin@domain-anda.com
ADMIN_PASSWORD=isi-kata-sandi-unik-minimal-12-karakter
```

Ganti seluruh nilai contoh. Connection string cloud biasanya memerlukan parameter SSL dari penyedia. Jangan menghilangkan verifikasi sertifikat.

4. Buat tabel dan akun Admin pertama:

```bash
npm run db:migrate
npm run db:admin
```

Hapus ADMIN_PASSWORD dari `.env.local` setelah akun dibuat. Perintah `db:admin` tidak mengubah akun yang sudah ada; email duplikat ditolak. Tidak ada halaman registrasi Admin.

5. Opsional, masukkan 6 kegiatan contoh (tidak membuat akun contoh):

```bash
npm run db:seed
```

Seed dilewati jika tabel kegiatan sudah berisi data. Tanggal kegiatan contoh tahun 2026; sesuaikan lewat kegiatan baru untuk penggunaan nyata.

6. Jalankan aplikasi:

```bash
npm run dev
```

Buka http://localhost:3000, pilih Admin, dan masuk menggunakan akun yang baru dibuat. Anggota mendaftar sendiri; Pengurus dibuat Admin melalui menu Pengguna.

## Deploy ke Vercel

Vercel mendukung Next.js dan PostgreSQL eksternal. Panduan resmi:

- https://vercel.com/docs/frameworks/full-stack/nextjs
- https://vercel.com/docs/postgres

1. Buat repository Git milik Anda dari isi proyek ini (tanpa node_modules, .next, atau .env.local).
2. Vercel → Add New Project → import repository tersebut.
3. Framework: Next.js; install command `npm ci`; build command `npm run build`; Node.js 22.x. `vercel.json` sudah disertakan.
4. Buat/hubungkan PostgreSQL melalui Vercel Marketplace (misalnya Neon) atau gunakan database PostgreSQL yang sudah Anda punya. Tinjau paket/biaya di akun Anda sebelum membuat layanan berbayar.
5. Tambahkan environment variable Vercel:
   - DATABASE_URL: connection string PostgreSQL/pooler, sebagai secret server.
   - APP_URL: origin deployment final, misalnya `https://nama-proyek.vercel.app` (tanpa path).
6. Jalankan `npm run db:migrate` dan `npm run db:admin` dari komputer Anda menggunakan `.env.local` yang menunjuk database cloud. Ini dilakukan sekali, bukan di setiap build. Jangan menyimpan password bootstrap Admin dalam environment Vercel.
7. Deploy/redeploy dan login. Untuk Preview Deployment dengan domain berbeda, set APP_URL yang sesuai untuk environment tersebut; bila tidak diisi, server menggunakan origin request. Jangan memakai APP_URL produksi pada preview domain berbeda.
8. Uji Admin di laptop dan Anggota di HP pada URL deployment yang sama. Kamera memerlukan HTTPS dan izin kamera pengguna.

Alternatif CLI setelah login akun Vercel di komputer Anda:

```bash
npx vercel login
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel env add APP_URL production
npx vercel --prod
```

Masukkan nilai environment melalui prompt aman CLI; jangan menulis kredensial di chat atau commit. Tidak ada Vercel token yang disertakan dalam ZIP.

## Alur penggunaan

### Admin

- Login role Admin.
- Pengguna → Buat akun Pengurus; password awal minimal 12 karakter.
- Dapat mengubah role Anggota/Pengurus; akun Admin dikelola melalui provisioning server. Perubahan role mengakhiri sesi akun terkait.
- Kelola kegiatan, status, QR dan koreksi kehadiran.

### Pengurus

- Login menggunakan akun buatan Admin.
- Buat kegiatan, ubah status menjadi Berlangsung.
- Kehadiran → pilih kegiatan → buka absensi, pilih durasi 5/15/30/60 menit.
- Tampilkan/unduh QR atau salin kode alternatif. Menerbitkan QR baru membatalkan QR lama.
- Pantau rekap (polling 10 detik); tutup sesi bila selesai. Status kegiatan selain Berlangsung otomatis mencabut sesi QR.

### Anggota

- Registrasi menghasilkan Anggota, terlepas dari field role yang dikirim klien.
- Login, pilih kegiatan di Kehadiran, scan kamera, unggah gambar QR, atau isi kode alternatif.
- Server memeriksa sesi akun, role, kegiatan, token, masa berlaku dan duplikasi.
- Status Hadir, waktu WIB dan metode masuk ke database; Anggota hanya dapat membaca kehadirannya sendiri.

## Struktur

```text
app/                         Halaman React, CSS, layout
app/api/[...path]/route.ts    API Next.js runtime Node
components/simora/auth.tsx    Login/registrasi terhubung API
components/simora/attendance-qr.tsx  QR dan kamera
server/service.ts            Validasi, otorisasi, transaksi, endpoint
server/security.ts           Hash password, token sesi
server/db.ts                 Pool koneksi PostgreSQL
server/types.ts              Kontrak adapter database
lib/api.ts                   HTTP client frontend
lib/simora/attendance.ts      Aturan QR yang dipanggil server
 database/001_schema.sql      Skema SQL (7 tabel)
scripts/                     Migrasi, provisioning Admin, seed opsional
tests/backend.test.mjs        Pengujian integrasi SQL
.env.example                 Contoh konfigurasi tanpa secret
vercel.json                  Konfigurasi Vercel
package-lock.json            Versi dependensi terkunci
```

## API

Semua mutasi memerlukan Origin yang sesuai dan JSON (kecuali DELETE). Endpoint selain login/register/logout memerlukan cookie sesi yang valid.

| Endpoint                           | Metode        | Akses                          |
| ---------------------------------- | ------------- | ------------------------------ |
| /api/auth/register                 | POST          | Publik; selalu Anggota         |
| /api/auth/login                    | POST          | Publik; email/password/role    |
| /api/auth/logout                   | POST          | Hapus sesi server              |
| /api/auth/me                       | GET           | Akun aktif                     |
| /api/auth/profile                  | PATCH         | Profil sendiri                 |
| /api/state                         | GET           | Data sesuai role               |
| /api/users                         | POST          | Admin; selalu Pengurus         |
| /api/users/:id                     | PATCH         | Admin; ubah Anggota/Pengurus   |
| /api/events                        | POST          | Admin/Pengurus                 |
| /api/events/:id                    | PATCH         | Admin/Pengurus; status         |
| /api/events/:id/qr                 | POST / DELETE | Admin/Pengurus                 |
| /api/events/:id/checkin            | POST          | Anggota; identitas dari sesi   |
| /api/events/:id/attendance/:userId | PATCH         | Admin/Pengurus; koreksi manual |

## Pengamanan dan batas implementasi

Password di-hash dengan scrypt + salt acak. Token sesi acak 256 bit, hash token disimpan di SQL, cookie HttpOnly/SameSite=Lax/Secure pada produksi, masa berlaku 8 jam. Query SQL memakai parameter. API memeriksa role, bukan hanya menyembunyikan tombol. Rate limit login, registrasi dan check-in disimpan di database. Transaksi + penguncian baris kegiatan + primary key gabungan attendance mencegah duplikasi check-in bersamaan. Token/kode QR tidak diberikan melalui API state kepada Anggota.

Rekap menggunakan polling 10 detik, bukan WebSocket. Tidak ada verifikasi email, lupa password, MFA, notifikasi email, pembatasan pengurus berdasarkan organisasi, atau migrasi akun demo otomatis. Anggota yang belum absen ditampilkan Alpha pada rekap; itu adalah default tampilan, bukan penetapan ketidakhadiran final. QR dapat difoto/dibagikan selama masa berlaku; sistem ini tidak memverifikasi lokasi fisik atau identitas biometrik. Kamera HP dan deployment cloud perlu diuji di lingkungan pengguna.

## Operasional database

Cadangkan database melalui penyedia. Untuk membersihkan sesi/rate limit kedaluwarsa secara berkala, jalankan dari lingkungan database tepercaya:

```sql
DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;
DELETE FROM rate_limits WHERE expires_at < CURRENT_TIMESTAMP;
```

Audit log disimpan pada tabel audit_logs. Password hash dan token sesi tidak dicetak ke log aplikasi.

## Pengujian

```bash
npm test
npm run typecheck
npm run build
```

Pengujian memakai PostgreSQL embedded yang terisolasi; tidak perlu DATABASE_URL dan tidak mengubah database produksi. Cakupan: autentikasi, registrasi anti-elevasi role, otorisasi Pengurus, input kegiatan, pembatasan data Anggota, QR PNG encode/decode, sesi pengguna berbeda, rekap SQL bersama, duplicate/concurrent check-in, rotasi/pencabutan/expiry QR, koreksi manual, logout/revokasi sesi dan rate limit.
