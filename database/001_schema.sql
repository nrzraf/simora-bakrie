BEGIN;

-- ============================================================
-- SIMORA — skema diperluas (Next.js + PostgreSQL/Supabase)
-- Menambahkan kapabilitas dari sistem PHP sebelumnya:
--   peran Pembina, RSVP, proposal + berkas, notifikasi,
--   log email, serta kolom profil peserta.
-- Idempoten: aman dijalankan berulang pada database yang sudah ada.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(80) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  org           VARCHAR(40) NOT NULL DEFAULT 'Ormawa',
  role          VARCHAR(20) NOT NULL CHECK (role IN ('Admin','Pengurus','Pembina','Anggota')),
  nim           VARCHAR(24),
  phone         VARCHAR(24),
  division      VARCHAR(60),
  status        VARCHAR(12) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  org         VARCHAR(40) NOT NULL DEFAULT 'Ormawa',
  category    VARCHAR(60),
  date        DATE NOT NULL,
  time        TIME NOT NULL,
  location    VARCHAR(160) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'Mendatang'
              CHECK (status IN ('Draft','Mendatang','Berlangsung','Selesai','Dibatalkan')),
  capacity    INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 10000),
  description TEXT NOT NULL,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS events_date_idx ON events(date);

CREATE TABLE IF NOT EXISTS qr_sessions (
  event_id   BIGINT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  token      CHAR(32) NOT NULL,
  code       CHAR(8) NOT NULL,
  issued_by  BIGINT NOT NULL REFERENCES users(id),
  issued_at  TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS registrations (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     VARCHAR(12) NOT NULL DEFAULT 'terdaftar'
             CHECK (status IN ('terdaftar','hadir','batal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id);

CREATE TABLE IF NOT EXISTS attendance (
  event_id   BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     VARCHAR(10) NOT NULL CHECK (status IN ('Hadir','Izin','Alpha')),
  checked_at TIMESTAMPTZ,
  method     VARCHAR(20) NOT NULL CHECK (method IN ('QR kamera','QR gambar','Kode','Manual')),
  updated_by BIGINT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS proposals (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT REFERENCES events(id) ON DELETE SET NULL,
  title      VARCHAR(160) NOT NULL,
  summary    TEXT NOT NULL,
  budget     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status     VARCHAR(12) NOT NULL DEFAULT 'diajukan'
             CHECK (status IN ('diajukan','disetujui','ditolak','revisi')),
  note       TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  decided_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals(status);

CREATE TABLE IF NOT EXISTS proposal_files (
  id          BIGSERIAL PRIMARY KEY,
  proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  filename    VARCHAR(160) NOT NULL,
  mime        VARCHAR(80) NOT NULL,
  size        INTEGER NOT NULL,
  data        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   BIGINT REFERENCES events(id) ON DELETE SET NULL,
  kind       VARCHAR(20) NOT NULL DEFAULT 'sistem',
  message    TEXT NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS mail_log (
  id         BIGSERIAL PRIMARY KEY,
  recipient  VARCHAR(120) NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  kind       VARCHAR(30) NOT NULL,
  status     VARCHAR(12) NOT NULL DEFAULT 'log' CHECK (status IN ('terkirim','gagal','log')),
  error      VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key        CHAR(64) PRIMARY KEY,
  attempts   INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(60) NOT NULL,
  target     VARCHAR(120),
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);

-- ---- migrasi untuk database yang sudah lebih dulu ada ----
ALTER TABLE users  ADD COLUMN IF NOT EXISTS nim        VARCHAR(24);
ALTER TABLE users  ADD COLUMN IF NOT EXISTS phone      VARCHAR(24);
ALTER TABLE users  ADD COLUMN IF NOT EXISTS division   VARCHAR(60);
ALTER TABLE users  ADD COLUMN IF NOT EXISTS status     VARCHAR(12) NOT NULL DEFAULT 'aktif';
ALTER TABLE events ADD COLUMN IF NOT EXISTS category   VARCHAR(60);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS detail TEXT;

COMMIT;
