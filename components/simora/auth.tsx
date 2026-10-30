"use client";
import { useState, useEffect, ReactNode } from "react";
import {
  GraduationCap,
  ShieldCheck,
  Users,
  Building2,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  LockKeyhole,
} from "lucide-react";
import { api } from "../../lib/api";
export type Role = "Admin" | "Pengurus" | "Pembina" | "Anggota";
export type User = {
  id: number;
  name: string;
  email: string;
  org: string;
  role: Role;
};
export type AuthActions = {
  user: User;
  accounts: User[];
  logout: () => Promise<void>;
  createPengurus: (data: {
    name: string;
    email: string;
    password: string;
    role: "Pengurus" | "Pembina" | "Anggota";
    org?: string;
    nim?: string;
    phone?: string;
  }) => Promise<User>;
  changeRole: (id: number, role: string) => Promise<void>;
  updateProfile: (name: string, email: string) => Promise<void>;
};
export default function AuthGate({
  children,
}: {
  children: (actions: AuthActions) => ReactNode;
}) {
  const [accounts, setAccounts] = useState<User[]>([]),
    [current, setCurrent] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [mode, setMode] = useState<"login" | "register">("login"),
    [role, setRole] = useState<Role>("Anggota"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  const fatal = false;
  async function refresh() {
    const r = await api<{ user: User; accounts: User[] }>("auth/me");
    setCurrent(r.user);
    setAccounts(r.accounts);
    return r;
  }
  useEffect(() => {
    let active = true;
    api<{ user: User; accounts: User[] }>("auth/me")
      .then((r) => {
        if (active) {
          setCurrent(r.user);
          setAccounts(r.accounts);
        }
      })
      .catch((e) => {
        if (active && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const expired = () => {
      setCurrent(null);
      setAccounts([]);
      setNotice("Sesi berakhir. Silakan masuk kembali.");
    };
    window.addEventListener("simora-session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("simora-session-expired", expired);
    };
  }, []);
  async function logout() {
    await api("auth/logout", "POST", {});
    setCurrent(null);
    setAccounts([]);
    setNotice("Anda berhasil keluar.");
    setError("");
    setMode("login");
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim().toLowerCase(),
      password = String(f.get("password"));
    try {
      if (mode === "register") {
        if (password !== f.get("confirm"))
          throw new Error("Konfirmasi kata sandi tidak cocok.");
        await api("auth/register", "POST", {
          name: String(f.get("name")),
          email,
          password,
          nim: String(f.get("nim")),
          phone: String(f.get("phone")),
        });
        setMode("login");
        setRole("Anggota");
        setShow(false);
        setNotice("Pendaftaran berhasil! Silakan masuk sebagai Anggota.");
      } else {
        const r = await api<{ user: User; accounts: User[] }>(
          "auth/login",
          "POST",
          { email, password, role },
        );
        setCurrent(r.user);
        setAccounts(r.accounts);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createPengurus(data: {
    name: string;
    email: string;
    password: string;
    role: "Pengurus" | "Pembina" | "Anggota";
    org?: string;
    nim?: string;
    phone?: string;
  }) {
    const created = await api<User>("users", "POST", data);
    await refresh();
    return created;
  }
  async function changeRole(id: number, role: string) {
    await api("users/" + id, "PATCH", { role });
    await refresh();
  }
  async function updateProfile(name: string, email: string) {
    await api("auth/profile", "PATCH", { name, email });
    await refresh();
  }
  if (!ready)
    return (
      <div className="auth-loading">
        <GraduationCap size={40} />
        <p>Memuat sesi akun...</p>
      </div>
    );
  if (current)
    return children({
      user: current,
      accounts,
      logout,
      createPengurus,
      changeRole,
      updateProfile,
    });
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="auth-brand" href="/login">
          <span>
            <GraduationCap size={28} />
          </span>
          SIMORA
        </a>
        <div className="auth-story-content">
          <div className="auth-kicker">SATU RUANG. BANYAK PELUANG.</div>
          <h1>
            Terhubung.
            <br />
            Berkolaborasi.
            <br />
            <em>Bertumbuh bersama.</em>
          </h1>
          <p>
            Ruang untuk menghidupkan ide, mengelola kegiatan, dan menciptakan
            pengalaman organisasi yang bermakna.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-ring" />
            <div className="auth-symbol">
              <GraduationCap size={75} strokeWidth={1.3} />
            </div>
            <div className="auth-float">
              <CheckCircle2 size={22} />
              <span>
                Kolaborasi jadi lebih mudah
                <small>Dari ide hingga aksi nyata</small>
              </span>
            </div>
          </div>
          <div className="auth-benefits">
            <span>
              <CheckCircle2 size={15} /> Kegiatan terorganisir
            </span>
            <span>
              <CheckCircle2 size={15} /> Kehadiran terpantau
            </span>
          </div>
        </div>
        <small>© 2026 SIMORA · Ruang kolaborasi mahasiswa</small>
      </section>
      <section className="auth-right">
        <div className="auth-top">
          <span>
            {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}
          </span>
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setNotice("");
              setShow(false);
            }}
          >
            {mode === "login" ? "Daftar anggota" : "Masuk akun"}{" "}
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="auth-card">
          <span className="auth-lock">
            <LockKeyhole size={23} />
          </span>
          <div className="eyebrow">SELAMAT DATANG DI SIMORA</div>
          {mode === "register" && (
            <p className="auth-intro">
              Daftar sebagai Anggota dan jadi bagian dari kolaborasi.
            </p>
          )}
          {mode === "login" ? (
            <div className="role-picker" aria-label="Pilih peran login">
              {(
                [
                  { name: "Anggota", icon: Users },
                  { name: "Pengurus", icon: Building2 },
  { name: "Pembina", icon: ShieldCheck },
                  { name: "Admin", icon: ShieldCheck },
                ] as const
              ).map((r) => (
                <button
                  aria-pressed={role === r.name}
                  key={r.name}
                  className={role === r.name ? "selected" : ""}
                  onClick={() => {
                    setRole(r.name);
                    setError("");
                  }}
                >
                  <r.icon size={21} />
                  {r.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="register-info">
              <Users size={19} />
              <span>
                Pendaftaran hanya untuk <strong>Anggota</strong>.
                <small>Akun pengurus dan pembina dibuat oleh Admin.</small>
              </span>
            </div>
          )}
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="auth-success" role="status">
              {notice}
            </div>
          )}
          <form key={mode} onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <>
                <label>
                  Nama lengkap
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Masukkan nama lengkap"
                    required
                    maxLength={60}
                  />
                </label>
                <label>
                  NIM
                  <input
                    name="nim"
                    inputMode="numeric"
                    placeholder="1202xxxxxxx"
                    required
                    minLength={6}
                    maxLength={24}
                  />
                </label>
                <label>
                  Nomor WhatsApp
                  <input
                    name="phone"
                    inputMode="tel"
                    placeholder="08xxxxxxxxxx"
                    required
                    minLength={9}
                    maxLength={24}
                  />
                </label>

              </>
            )}
            <label>
              Alamat email
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="nama@email.com"
                required
                maxLength={100}
              />
            </label>
            <label>
              Kata sandi
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "login"
                      ? "Masukkan kata sandi"
                      : "Minimal 12 karakter"
                  }
                  minLength={mode === "register" ? 12 : 1}
                  required
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-label={
                    show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {mode === "register" && (
              <label>
                Konfirmasi kata sandi
                <input
                  name="confirm"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Ulangi kata sandi"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
            )}
            <button
              className="primary auth-submit"
              type="submit"
              disabled={busy || fatal}
            >
              {busy
                ? "Memproses..."
                : mode === "login"
                  ? "Masuk"
                  : "Daftar sebagai Anggota"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="auth-footnote">
            <ShieldCheck size={14} /> Akun dan kehadiran tersimpan di server.
            <br />
            Hubungi Admin jika membutuhkan akses Pengurus.
          </p>
        </div>
        <div className="auth-bottom">
          SIMORA — Sistem Manajemen Organisasi & Kegiatan
        </div>
      </section>
    </div>
  );
}
