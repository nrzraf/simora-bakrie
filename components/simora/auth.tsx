"use client";
import { useState, useEffect, ReactNode } from "react";
import {
  GraduationCap,
  Users,
  ChevronDown,
  CircleHelp,
  ArrowRight,
  Eye,
  EyeOff,
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
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
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
        setShow(false);
        setNotice("Pendaftaran berhasil! Silakan masuk sebagai Anggota.");
      } else {
        const r = await api<{ user: User; accounts: User[] }>(
          "auth/login",
          "POST",
          { email, password },
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
            <GraduationCap size={23} aria-hidden="true" />
          </span>
          SIMORA
        </a>
        <div className="auth-story-copy">
          <p className="auth-story-title">Organisasi dan kegiatan kampus.</p>
          <p className="auth-story-note">
            Kelola kegiatan, ajukan proposal, dan pantau kehadiran dalam satu portal.
          </p>
        </div>
        <div className="auth-art" aria-hidden="true" />
      </section>
      <main className="auth-right">
        <div className="auth-card">
          <div className="auth-intro">
            <h1>{mode === "login" ? "Masuk ke SIMORA" : "Daftar akun anggota"}</h1>
            {mode === "login" && (
              <p>Gunakan email dan kata sandi akun SIMORA Anda.</p>
            )}
          </div>
          {mode === "register" && (
            <div className="register-info">
              <Users size={19} aria-hidden="true" />
              <span>Akun Pengurus dan Pembina dibuat oleh Admin.</span>
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
            <div className="auth-password">
              <label htmlFor="auth-password">Kata sandi</label>
              <div className="password-field">
                <input
                  id="auth-password"
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
            </div>
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
              disabled={busy}
            >
              {busy
                ? "Memproses..."
                : mode === "login"
                  ? "Masuk"
                  : "Daftar sebagai Anggota"}
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>
          <div className="auth-switch">
            <span>{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setNotice("");
                setShow(false);
              }}
            >
              {mode === "login" ? "Daftar sebagai anggota" : "Masuk"}
            </button>
          </div>
          {mode === "login" && (
            <details className="auth-help">
              <summary>
                <CircleHelp size={18} aria-hidden="true" />
                Bantuan masuk
                <ChevronDown size={17} className="auth-help-chevron" aria-hidden="true" />
              </summary>
              <dl>
                <dt>Lupa kata sandi?</dt>
                <dd>Hubungi Admin SIMORA dan sertakan email akun Anda.</dd>
                <dt>Perlu akses Pengurus atau Pembina?</dt>
                <dd>Minta Admin SIMORA membuatkan akun dengan peran yang sesuai.</dd>
              </dl>
            </details>
          )}
        </div>
      </main>
    </div>
  );
}
