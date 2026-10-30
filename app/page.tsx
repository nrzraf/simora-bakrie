"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";
import AuthGate, { AuthActions } from "../components/simora/auth";
import AttendanceQR from "../components/simora/attendance-qr";
import {
  issueTicket,
  revokeTicket,
  verifyCheckIn,
  timeWIB,
} from "../lib/simora/attendance";
import type { Tickets, CheckIns, CheckIn } from "../lib/simora/attendance";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Users,
  ClipboardCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Bell,
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Clock,
  Download,
  X,
  Menu,
  GraduationCap,
  Check,
  LogOut,
  ShieldCheck,
  MoreHorizontal,
  FileText,
  TicketCheck,
  BellRing,
  Trash2,
  Send,
} from "lucide-react";
type Event = {
  id: number;
  name: string;
  org: string;
  date: string;
  time: string;
  location: string;
  status: string;
  capacity: number;
  description: string;
};
const organizations = [
  { name: "BEM", full: "Badan Eksekutif Mahasiswa", color: "rose", desc: "Wadah aspirasi dan perubahan mahasiswa." },
  { name: "SENAT", full: "Senat Mahasiswa", color: "blue", desc: "Pengawasan dan advokasi kebijakan mahasiswa." },
  { name: "HMTIF", full: "Himpunan Mahasiswa Teknik Informatika", color: "purple", desc: "Kolaborasi teknologi dan rekayasa perangkat lunak." },
  { name: "HMSIF", full: "Himpunan Mahasiswa Sistem Informasi", color: "green", desc: "Pengembangan sistem informasi dan data." },
  { name: "HMILKOM", full: "Himpunan Mahasiswa Ilmu Komunikasi", color: "amber", desc: "Kreativitas media dan komunikasi publik." },
  { name: "HMM", full: "Himpunan Mahasiswa Manajemen", color: "rose", desc: "Pengembangan manajemen dan kewirausahaan." },
  { name: "HMPOL", full: "Himpunan Mahasiswa Ilmu Politik", color: "blue", desc: "Diskusi kebijakan dan kajian politik." },
  { name: "HMTL", full: "Himpunan Mahasiswa Teknik Lingkungan", color: "green", desc: "Gerakan lingkungan dan keberlanjutan." },
  { name: "HMITP", full: "Himpunan Mahasiswa Ilmu Teknologi Pangan", color: "purple", desc: "Inovasi pangan dan teknologi hasil pertanian." },
  { name: "HMTI", full: "Himpunan Mahasiswa Teknik Industri", color: "amber", desc: "Optimasi sistem dan proses industri." },
];
const nav = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Kegiatan", icon: CalendarDays },
  { name: "Pendaftaran", icon: TicketCheck },
  { name: "Kehadiran", icon: ClipboardCheck },
  { name: "Proposal", icon: FileText },
  { name: "Notifikasi", icon: BellRing },
  { name: "Organisasi", icon: Building2 },
  { name: "Pengguna", icon: Users },
  { name: "Audit Log", icon: ShieldCheck },
];
const fmt = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        ({
          Berlangsung: "blue",
          Mendatang: "amber",
          Selesai: "green",
          Hadir: "green",
          Izin: "amber",
          Alpha: "rose",
          Admin: "rose",
          Pengurus: "blue",
          Pembina: "amber",
          Anggota: "gray",
          Draft: "gray",
          Dibatalkan: "rose",
          diajukan: "amber",
          disetujui: "green",
          ditolak: "rose",
          revisi: "blue",
        }[value] || "gray")
      }
    >
      <i />
      {value}
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
export default function Page() {
  return <AuthGate>{(auth) => <Home auth={auth} />}</AuthGate>;
}
function Home({ auth }: { auth: AuthActions }) {
  const [page, setPage] = useState("Dashboard"),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [events, setEvents] = useState<Event[]>([]),
    [users, setUsers] = useState<
      Array<{
        id: number;
        name: string;
        email: string;
        org: string;
        role: string;
      }>
    >([]),
    [attendance, setAttendance] = useState<Record<string, string>>({}),
    [qrTickets, setQrTickets] = useState<Tickets>({}),
    [checkIns, setCheckIns] = useState<CheckIns>({}),
    [registrations, setRegistrations] = useState<Record<string, string>>({}),
    [proposals, setProposals] = useState<Array<any>>([]),
    [notifs, setNotifs] = useState<Array<any>>([]),
    [proposalModal, setProposalModal] = useState(false),
    [proposalBusy, setProposalBusy] = useState(false),
    [proposalError, setProposalError] = useState(""),
    [accountDeleteBusy, setAccountDeleteBusy] = useState(0),
    [newAccountRole, setNewAccountRole] = useState<"Pengurus" | "Pembina" | "Anggota">("Pengurus"),
    [audit, setAudit] = useState<Array<any>>([]),
    [fileBusy, setFileBusy] = useState(0),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(""),
    [eventSaving, setEventSaving] = useState(false),
    [accountModal, setAccountModal] = useState(false),
    [accountError, setAccountError] = useState(""),
    [accountBusy, setAccountBusy] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("Semua status"),
    [modal, setModal] = useState(false),
    [detail, setDetail] = useState<Event | null>(null),
    [toast, setToast] = useState(""),
    [notifications, setNotifications] = useState(false),
    [selectedEvent, setSelectedEvent] = useState(1),
    [period, setPeriod] = useState("6 bulan terakhir"),
    [profile, setProfile] = useState({
      name: "Biko Waffie",
      email: "biko@mahasiswa.ac.id",
    });
  const role = auth.user.role;
  const accountDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setProfile({ name: auth.user.name, email: auth.user.email });
    setUsers(auth.accounts);
  }, [
    auth.user.name,
    auth.user.email,
    auth.accounts.map((a) => a.id + ":" + a.role + ":" + a.email).join(","),
  ]);
  useEffect(() => {
    if (accountModal) accountDialogRef.current?.showModal();
    else accountDialogRef.current?.close();
  }, [accountModal]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canEdit = role !== "Anggota";
  const refresh = useCallback(async () => {
    try {
      const data = await api("state");
      setEvents(data.events);
      setUsers(data.users);
      setAttendance(data.attendance);
      setQrTickets(data.qrTickets);
      setCheckIns(data.checkIns);
      setRegistrations(data.registrations || {});
      setProposals(data.proposals || []);
      setNotifs(data.notifications || []);
      setSelectedEvent((prev) =>
        data.events.some((e: Event) => e.id === prev)
          ? prev
          : data.events[0]?.id || 0,
      );
      setLoadError("");
      setReady(true);
    } catch (e) {
      setLoadError((e as Error).message);
      setReady(true);
      throw e;
    }
  }, []);
  useEffect(() => {
    if (page === "Audit Log" && role === "Admin")
      api<{ entries: any[] }>("audit")
        .then((d) => setAudit(d.entries))
        .catch(() => {});
  }, [page, role]);
  useEffect(() => {
    void refresh().catch(() => {});
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {});
    }, 10000);
    const focused = () => void refresh().catch(() => {});
    window.addEventListener("focus", focused);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focused);
    };
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (modal || detail) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal, detail]);
  const go = (p: string) => {
    setPage(p);
    setQuery("");
    setStatus("Semua status");
    setMobile(false);
  };
  const filtered = events.filter(
    (e) =>
      (e.name + " " + e.org).toLowerCase().includes(query.toLowerCase()) &&
      (status === "Semua status" || e.status === status),
  );
  const getAttendance = (id: number) =>
    attendance[selectedEvent + "-" + id] || "Alpha";
  const visibleParticipants = users.filter(
    (u) =>
      u.role === "Anggota" && (role !== "Anggota" || u.id === auth.user.id),
  );
  const counts = ["Hadir", "Izin", "Alpha"].map(
    (s) => visibleParticipants.filter((u) => getAttendance(u.id) === s).length,
  );
  const rate = visibleParticipants.length
    ? Math.round((counts[0] / visibleParticipants.length) * 100)
    : 0;
  async function submitAttendance(value: string, method: CheckIn["method"]) {
    const record = await api<CheckIn>(
      "events/" + selectedEvent + "/checkin",
      "POST",
      { value, method },
    );
    await refresh();
    setToast("Absensi berhasil. Anda tercatat Hadir.");
    return record;
  }
  async function createQR(minutes: number) {
    await api("events/" + selectedEvent + "/qr", "POST", { minutes });
    await refresh();
  }
  async function closeQR() {
    await api("events/" + selectedEvent + "/qr", "DELETE");
    await refresh();
  }
  async function changeEventStatus(event: Event, status: string) {
    try {
      await api("events/" + event.id, "PATCH", { status });
      setDetail({ ...event, status });
      await refresh();
      setToast("Status kegiatan diperbarui");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function changeAttendance(id: number, status: string) {
    try {
      await api("events/" + selectedEvent + "/attendance/" + id, "PATCH", {
        status,
      });
      await refresh();
      setToast("Status kehadiran diperbarui");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function rsvp(eventId: number, cancel = false) {
    try {
      if (cancel) await api("events/" + eventId + "/register", "DELETE");
      else await api("events/" + eventId + "/register", "POST");
      await refresh();
      setToast(cancel ? "Pendaftaran dibatalkan." : "Pendaftaran berhasil.");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function submitProposal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (proposalBusy) return;
    const f = new FormData(e.currentTarget);
    setProposalBusy(true);
    setProposalError("");
    try {
      await api("proposals", "POST", {
        eventId: Number(f.get("eventId")) || null,
        title: String(f.get("title")).trim(),
        summary: String(f.get("summary")).trim(),
        budget: Number(f.get("budget")) || 0,
      });
      setProposalModal(false);
      await refresh();
      setToast("Proposal diajukan dan menunggu tinjauan Pembina.");
    } catch (err) {
      setProposalError((err as Error).message);
    } finally {
      setProposalBusy(false);
    }
  }
  async function decideProposal(id: number, status: string) {
    try {
      await api("proposals/" + id + "/decide", "POST", { status });
      await refresh();
      setToast("Keputusan proposal disimpan.");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function uploadProposalFile(id: number, file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setToast("Berkas maksimal 4 MB.");
      return;
    }
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      setToast("Format harus PDF, PNG, atau JPG.");
      return;
    }
    setFileBusy(id);
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await api("proposals/" + id + "/file", "POST", {
        filename: file.name,
        mime: file.type,
        data: btoa(binary),
      });
      setToast("Berkas proposal terlampir.");
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setFileBusy(0);
    }
  }
  async function removeProposal(id: number) {
    try {
      await api("proposals/" + id, "DELETE");
      await refresh();
      setToast("Proposal dihapus.");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function markNotifications() {
    try {
      await api("notifications/read", "POST", {});
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function removeAccount(id: number, name: string) {
    if (!window.confirm("Hapus akun " + name + "? Tindakan ini permanen.")) return;
    setAccountDeleteBusy(id);
    try {
      await api("users/" + id, "DELETE");
      await refresh();
      setToast("Akun " + name + " dihapus.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setAccountDeleteBusy(0);
    }
  }
  function exportReport() {
    const rows = [
      [
        "Kegiatan",
        "Nama",
        "Organisasi",
        "Status",
        "Waktu check-in (WIB)",
        "Metode",
      ],
      ...visibleParticipants.map((u) => {
        const receipt = checkIns[selectedEvent + "-" + u.id];
        return [
          events.find((e) => e.id === selectedEvent)?.name || "",
          u.name,
          u.org,
          getAttendance(u.id),
          receipt ? timeWIB(receipt.checkedAt) : "",
          receipt?.method || "Manual",
        ];
      }),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((r) =>
          r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "SIMORA-rekap-kehadiran.csv";
    a.click();
    URL.revokeObjectURL(url);
    setToast("Laporan kehadiran berhasil diekspor");
  }
  async function addEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || eventSaving) return;
    const f = new FormData(e.currentTarget);
    setEventSaving(true);
    try {
      await api("events", "POST", {
        name: String(f.get("name")).trim(),
        org: String(f.get("org")),
        date: String(f.get("date")),
        time: String(f.get("time")),
        location: String(f.get("location")).trim(),
        capacity: Number(f.get("capacity")),
        description: String(f.get("description")),
      });
      setModal(false);
      await refresh();
      setToast("Kegiatan baru berhasil ditambahkan");
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setEventSaving(false);
    }
  }
  const EventTable = ({ compact = false }: { compact?: boolean }) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Nama kegiatan</th>
            <th>Tanggal & waktu</th>
            <th>Status</th>
            <th>Kuota</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(compact ? events.slice(0, 4) : filtered).map((e) => (
            <tr key={e.id}>
              <td>
                <div className="cell-title">
                  <span
                    className={
                      "event-icon " +
                      (e.org === "BEM"
                        ? "blue"
                        : e.org === "Mapala"
                          ? "green"
                          : "rose")
                    }
                  >
                    <CalendarDays size={19} />
                  </span>
                  <div>
                    <strong>{e.name}</strong>
                    <small>
                      {e.org} <span className="dot">•</span> {e.location}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {fmt(e.date)}
                <small>{e.time} WIB</small>
              </td>
              <td>
                <Badge value={e.status} />
              </td>
              <td>
                <span className="inline-icon">
                  <Users size={14} />
                  {e.capacity}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Detail " + e.name}
                  onClick={() => setDetail(e)}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!compact && filtered.length === 0 && (
        <div className="empty">
          Tidak ada kegiatan yang sesuai. Coba kata kunci atau filter lain.
        </div>
      )}
    </div>
  );
  return (
    <div className={"app " + (collapsed ? "collapsed" : "")}>
      {mobile && (
        <button
          className="overlay"
          aria-label="Tutup navigasi"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("Dashboard");
          }}
        >
          <span className="brand-icon">
            <GraduationCap size={25} />
          </span>
          <div>
            SIMORA
          </div>
        </a>
        <nav>
          {nav
            .filter((n) => !["Pengguna", "Audit Log"].includes(n.name) || role === "Admin")
            .map((n) => (
              <button
                key={n.name}
                title={n.name}
                className={page === n.name ? "active" : ""}
                onClick={() => go(n.name)}
              >
                <n.icon size={20} />
                <span>{n.name}</span>
                {n.name === "Kegiatan" && <b>{events.length}</b>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={
              "settings-nav " + (page === "Pengaturan" ? "active" : "")
            }
            onClick={() => go("Pengaturan")}
          >
            <Settings size={20} />
            <span>Pengaturan</span>
          </button>
          <button
            className="settings-nav"
            onClick={() => void auth.logout().catch((e) => setToast(e.message))}
          >
            <LogOut size={20} />
            <span>Keluar</span>
          </button>
          <button className="user-profile" onClick={() => go("Profil")}>
            <Avatar name={profile.name} />
            <div>
              <strong>{profile.name}</strong>
              <small>{role}</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header>
          <div className="header-left">
            <button
              className="icon-button desktop-toggle"
              aria-label="Ciutkan sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu size={20} />
            </button>
            <button
              className="icon-button mobile-toggle"
              aria-label="Buka navigasi"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>
              Workspace <ChevronRight size={14} /> <strong>{page}</strong>
            </span>
          </div>
          <div className="header-right">
            <button
              className="bell icon-button"
              aria-label="Notifikasi"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={20} />
              <i />
            </button>
            <button
              className="icon-button"
              aria-label="Buka profil"
              onClick={() => go("Profil")}
            >
              <Avatar name={profile.name} />
            </button>
          </div>
          {notifications && (
            <div className="notification-panel">
              <h3>Notifikasi terbaru</h3>
              <p>
                <strong>UI/UX Design Bootcamp</strong>
                <br />
                Kegiatan berlangsung hari ini, 09:00 WIB.
              </p>
              <p>
                <strong>Lengkapi rekap kehadiran</strong>
                <br />
                Pastikan data peserta telah diperbarui.
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setNotifications(false);
                  go("Kehadiran");
                }}
              >
                Lihat kehadiran <ArrowRight size={14} />
              </button>
            </div>
          )}
        </header>
        <main>
          {loadError && (
            <div role="alert" className="auth-error">
              {loadError}{" "}
              <button
                className="text-button"
                onClick={() => void refresh().catch(() => {})}
              >
                Coba muat ulang
              </button>
            </div>
          )}
          {!ready && <p className="demo-note">Memuat data dari server...</p>}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CAMPUS, CONNECTED</div>
              <h1>
                {page === "Dashboard"
                  ? "Selamat datang, " + profile.name.split(" ")[0] + " 👋"
                  : page === "Kegiatan"
                    ? "Manajemen Kegiatan"
                    : page === "Organisasi"
                      ? "Organisasi Mahasiswa"
                      : page === "Kehadiran"
                        ? "Rekap Kehadiran"
                        : page === "Pengguna"
                          ? "Manajemen Pengguna"
                          : page === "Pendaftaran"
                            ? "Pendaftaran Kegiatan"
                            : page === "Proposal"
                              ? "Proposal Kegiatan"
                              : page === "Audit Log"
                                ? "Audit Log"
                                : page === "Notifikasi"
                                  ? "Notifikasi"
                                : page === "Profil"
                                  ? "Profil Saya"
                                  : "Pengaturan"}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Setiap kolaborasi dimulai dari sini. Yuk, lihat aktivitas organisasimu."
                  : page === "Kegiatan"
                    ? "Rencanakan, kelola, dan pantau setiap kegiatan dalam satu tempat."
                    : page === "Organisasi"
                      ? "Kenali komunitas dan tumbuh bersama organisasi kampus."
                      : page === "Kehadiran"
                        ? "Pantau partisipasi dan kelola kehadiran peserta dengan mudah."
                        : page === "Pengguna"
                          ? "Kelola anggota dan hak akses di ruang organisasimu."
                          : page === "Pendaftaran"
                            ? "Daftar kegiatan yang dibuka dan pantau kuotanya."
                            : page === "Proposal"
                              ? "Ajukan dan tinjau proposal kegiatan organisasi."
                              : page === "Audit Log"
                                ? "Jejak aktivitas sistem dan perubahan data."
                                : page === "Notifikasi"
                                  ? "Pemberitahuan pendaftaran, proposal, dan presensi."
                                : "Sesuaikan pengalaman SIMORA untuk kebutuhanmu."}
              </p>
            </div>
            {["Dashboard", "Kegiatan"].includes(page) && canEdit ? (
              <button className="primary" onClick={() => setModal(true)}>
                <Plus size={18} />
                Tambah kegiatan
              </button>
            ) : page === "Kehadiran" ? (
              <button className="secondary" onClick={exportReport}>
                <Download size={17} />
                Ekspor laporan
              </button>
            ) : null}
          </div>
          {page === "Dashboard" && (
            <>
              <section className="hero">
                <div>
                  <span className="hero-label">
                    <span /> RUANG KOLABORASI MAHASISWA
                  </span>
                  <h2>
                    Ide besar dimulai
                    <br />
                    dari langkah bersama.
                  </h2>
                  <p>
                    Satukan ide, hidupkan kegiatan, dan ciptakan
                    <br className="desktop" /> pengalaman kampus yang lebih
                    bermakna.
                  </p>
                  <button onClick={() => go("Kegiatan")}>
                    Jelajahi kegiatan <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-center">
                    <GraduationCap size={69} strokeWidth={1.2} />
                  </div>
                  <div className="floating float-one">
                    <span className="green">
                      <Check size={19} />
                    </span>
                    <div>
                      Kegiatan terorganisir
                      <small>Lebih mudah, lebih terarah</small>
                    </div>
                  </div>
                  <div className="floating float-two">
                    <span className="rose">
                      <Users size={22} />
                    </span>
                    <div>
                      Bertumbuh bersama<small>Satu ruang, banyak peluang</small>
                    </div>
                  </div>
                  <span className="spark spark-one">✦</span>
                  <span className="spark spark-two">✦</span>
                </div>
              </section>
              <div className="stats">
                {[
                  {
                    label: "Total kegiatan",
                    value: events.length,
                    icon: CalendarDays,
                    color: "rose",
                    note:
                      events.filter((e) => e.status === "Mendatang").length +
                      " kegiatan mendatang",
                  },
                  {
                    label: "Organisasi aktif",
                    value: organizations.length,
                    icon: Building2,
                    color: "blue",
                    note: "Terhubung dalam satu ruang",
                  },
                  {
                    label: "Total anggota",
                    value: users.filter((u) => u.role === "Anggota").length,
                    icon: Users,
                    color: "purple",
                    note: "Aktif berkolaborasi",
                  },
                  {
                    label: "Tingkat kehadiran",
                    value: rate + "%",
                    icon: ClipboardCheck,
                    color: "green",
                    note: "Pada kegiatan terpilih",
                  },
                ].map((s) => (
                  <div className="stat" key={s.label}>
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <span className={"stat-icon " + s.color}>
                        <s.icon size={19} />
                      </span>
                    </div>
                    <strong>{s.value}</strong>
                    <small>
                      <span className="trend">↗</span> {s.note}
                    </small>
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Aktivitas kegiatan</h3>
                      <p>Perjalanan kolaborasi sepanjang semester</p>
                    </div>
                    <select
                      aria-label="Periode grafik"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    >
                      <option>6 bulan terakhir</option>
                      <option>3 bulan terakhir</option>
                    </select>
                  </div>
                  <div className="chart-legend">
                    <i />
                    Jumlah kegiatan <span>Data demo 2026</span>
                  </div>
                  <div className="chart">
                    <div className="axis">
                      <span>6</span>
                      <span>4</span>
                      <span>2</span>
                      <span>0</span>
                    </div>
                    <div className="bars">
                      {(period === "6 bulan terakhir"
                        ? ["Mei", "Jun", "Jul", "Agu", "Sep", "Okt"]
                        : ["Agu", "Sep", "Okt"]
                      ).map((m, i) => {
                        const values =
                          period === "6 bulan terakhir"
                            ? [2, 3, 2, 4, 3, 3]
                            : [4, 3, 3];
                        return (
                          <div className="bar-col" key={m}>
                            <div
                              className="bar"
                              style={{ height: (values[i] / 6) * 100 + "%" }}
                              title={m + ": " + values[i] + " kegiatan"}
                            >
                              <span>{values[i]}</span>
                            </div>
                            <small>{m}</small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
                <section className="panel announcements">
                  <div className="panel-heading">
                    <h3>Pengumuman</h3>
                    <span className="count">3</span>
                  </div>
                  <div className="announcement">
                    <span className="announcement-dot rose" />
                    <div>
                      <span className="micro">
                        AKADEMIK <span>• 2 jam lalu</span>
                      </span>
                      <h4>Pengajuan program kerja dibuka</h4>
                      <p>
                        Ajukan proposal kegiatan semester depan sebelum 15
                        November 2026.
                      </p>
                    </div>
                  </div>
                  <div className="announcement">
                    <span className="announcement-dot amber" />
                    <div>
                      <span className="micro">
                        PENGINGAT <span>• 5 jam lalu</span>
                      </span>
                      <h4>Lengkapi laporan kegiatan</h4>
                      <p>
                        Jangan lupa unggah evaluasi dan rekap kehadiran
                        kegiatanmu.
                      </p>
                    </div>
                  </div>
                  <div className="announcement">
                    <span className="announcement-dot blue" />
                    <div>
                      <span className="micro">
                        KAMPUS <span>• Kemarin</span>
                      </span>
                      <h4>Satu ruang untuk berkolaborasi</h4>
                      <p>Temukan organisasi yang sesuai minat dan potensimu.</p>
                    </div>
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Kegiatan terdekat</h3>
                    <p>Jangan lewatkan kesempatan untuk terlibat</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => go("Kegiatan")}
                  >
                    Lihat semua <ArrowRight size={16} />
                  </button>
                </div>
                <EventTable compact />
              </section>
            </>
          )}
          {page === "Kegiatan" && (
            <section className="panel">
              <div className="tabs">
                <button
                  className={status === "Semua status" ? "selected" : ""}
                  onClick={() => setStatus("Semua status")}
                >
                  Semua kegiatan <b>{events.length}</b>
                </button>
                {["Mendatang", "Berlangsung", "Selesai"].map((s) => (
                  <button
                    key={s}
                    className={status === s ? "selected" : ""}
                    onClick={() => setStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="Cari kegiatan atau organisasi..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter status kegiatan"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {["Semua status", "Mendatang", "Berlangsung", "Selesai"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </div>
              <EventTable />
              <div className="table-footer">
                Menampilkan {filtered.length} dari {events.length} kegiatan{" "}
                <span>Semester Ganjil 2026/2027</span>
              </div>
            </section>
          )}
          {page === "Organisasi" && (
            <>
              <div className="search mb-6">
                <Search size={18} />
                <input
                  placeholder="Cari organisasi..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="org-grid">
                {organizations
                  .filter((o) =>
                    (o.name + o.full)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((o) => (
                    <section className="panel org-card" key={o.name}>
                      <span className={"org-logo " + o.color}>
                        <Building2 size={30} />
                      </span>
                      <Badge value="Aktif" />
                      <h2>{o.name}</h2>
                      <h4>{o.full}</h4>
                      <p>{o.desc}</p>
                      <div className="org-meta">
                        <span>
                          <Users size={16} />
                          {users.filter((u) => u.org === o.name).length} anggota
                        </span>
                        <span>
                          <CalendarDays size={16} />
                          {events.filter((e) => e.org === o.name).length}{" "}
                          kegiatan
                        </span>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          go("Kegiatan");
                          setQuery(o.name);
                        }}
                      >
                        Lihat kegiatan <ArrowRight size={16} />
                      </button>
                    </section>
                  ))}
              </div>
              {!organizations.some((o) =>
                (o.name + o.full).toLowerCase().includes(query.toLowerCase()),
              ) && <div className="empty">Organisasi tidak ditemukan.</div>}
            </>
          )}
          {page === "Kehadiran" && (
            <>
              <div className="attendance-select panel">
                <div>
                  <h3>Pilih kegiatan</h3>
                  <p>Rekap ditampilkan berdasarkan kegiatan yang dipilih.</p>
                </div>
                <select
                  aria-label="Pilih kegiatan absensi"
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(Number(e.target.value))}
                >
                  {events.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              {ready && events.find((e) => e.id === selectedEvent) && (
                <AttendanceQR
                  key={selectedEvent}
                  event={events.find((e) => e.id === selectedEvent)!}
                  role={role}
                  ticket={qrTickets[selectedEvent]}
                  checkIn={checkIns[selectedEvent + "-" + auth.user.id]}
                  attendance={getAttendance(auth.user.id)}
                  onIssue={createQR}
                  onRevoke={closeQR}
                  onSubmit={submitAttendance}
                  onDetail={() =>
                    setDetail(events.find((e) => e.id === selectedEvent)!)
                  }
                />
              )}
              <div className="stats attendance-stats">
                {["Hadir", "Izin", "Alpha"].map((s, i) => (
                  <div className="stat" key={s}>
                    <Badge value={s} />
                    <strong>
                      {counts[i]} <small>peserta</small>
                    </strong>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="toolbar">
                  <div className="search">
                    <Search size={18} />
                    <input
                      placeholder="Cari nama peserta..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter kehadiran"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {["Semua status", "Hadir", "Izin", "Alpha"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Peserta</th>
                        <th>Organisasi</th>
                        <th>Status kehadiran</th>
                        <th>Waktu & metode</th>
                        {canEdit && <th>Ubah status</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleParticipants
                        .filter(
                          (u) =>
                            u.name
                              .toLowerCase()
                              .includes(query.toLowerCase()) &&
                            (status === "Semua status" ||
                              getAttendance(u.id) === status),
                        )
                        .map((u) => (
                          <tr key={u.id}>
                            <td>
                              <div className="cell-title">
                                <Avatar name={u.name} />
                                <div>
                                  <strong>{u.name}</strong>
                                  <small>{u.email}</small>
                                </div>
                              </div>
                            </td>
                            <td>{u.org}</td>
                            <td>
                              <Badge value={getAttendance(u.id)} />
                            </td>
                            <td>
                              {checkIns[selectedEvent + "-" + u.id] ? (
                                <>
                                  {timeWIB(
                                    checkIns[selectedEvent + "-" + u.id]
                                      .checkedAt,
                                  )}
                                  <small>
                                    {
                                      checkIns[selectedEvent + "-" + u.id]
                                        .method
                                    }
                                  </small>
                                </>
                              ) : (
                                <small>Manual / belum absen</small>
                              )}
                            </td>
                            {canEdit && (
                              <td>
                                <select
                                  aria-label={"Kehadiran " + u.name}
                                  value={getAttendance(u.id)}
                                  onChange={(e) =>
                                    void changeAttendance(u.id, e.target.value)
                                  }
                                >
                                  {["Hadir", "Izin", "Alpha"].map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">
                  Data tersimpan di server. Rekap diperbarui setiap 10 detik.
                </div>
              </section>
            </>
          )}
          {page === "Pendaftaran" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Pendaftaran kegiatan</h3>
                  <p>
                    {role === "Anggota"
                      ? "Daftar kegiatan yang dibuka, lalu scan QR saat hari-H."
                      : "Pantau jumlah pendaftar terhadap kuota setiap kegiatan."}
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kegiatan</th>
                      <th>Tanggal</th>
                      <th>Status</th>
                      <th>Kuota</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const key = e.id + "-" + auth.user.id;
                      const mine = registrations[key];
                      const terdaftar = mine === "terdaftar" || mine === "hadir";
                      const jumlah = users.filter(
                        (u) => registrations[e.id + "-" + u.id] && registrations[e.id + "-" + u.id] !== "batal",
                      ).length;
                      const penuh = jumlah >= e.capacity;
                      const dibuka = e.status === "Mendatang" || e.status === "Berlangsung";
                      return (
                        <tr key={e.id}>
                          <td>
                            <strong>{e.name}</strong>
                            <small>{e.location}</small>
                          </td>
                          <td>{fmt(e.date)}</td>
                          <td>
                            <Badge value={e.status} />
                          </td>
                          <td>
                            {jumlah} / {e.capacity}
                          </td>
                          <td>
                            {role === "Anggota" ? (
                              terdaftar ? (
                                <button
                                  className="ghost"
                                  onClick={() => void rsvp(e.id, true)}
                                >
                                  Batalkan
                                </button>
                              ) : (
                                <button
                                  className="primary"
                                  disabled={!dibuka || penuh}
                                  onClick={() => void rsvp(e.id)}
                                >
                                  {penuh ? "Kuota penuh" : dibuka ? "Daftar" : "Belum dibuka"}
                                </button>
                              )
                            ) : (
                              <span className="muted-note">
                                {penuh ? "Kuota penuh" : "Tersedia"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!events.length && <div className="empty">Belum ada kegiatan.</div>}
            </section>
          )}

          {page === "Proposal" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Proposal kegiatan</h3>
                  <p>
                    {role === "Pembina"
                      ? "Tinjau dan putuskan proposal yang diajukan pengurus."
                      : "Ajukan proposal kegiatan untuk disetujui Pembina."}
                  </p>
                </div>
                {role !== "Anggota" && role !== "Pembina" && (
                  <button
                    className="primary"
                    onClick={() => {
                      setProposalError("");
                      setProposalModal(true);
                    }}
                  >
                    <Plus size={17} />
                    Ajukan proposal
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Judul</th>
                      <th>Pengaju</th>
                      <th>Anggaran</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.title}</strong>
                          <small>{p.summary}</small>
                        </td>
                        <td>{p.creatorName}</td>
                        <td>
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            maximumFractionDigits: 0,
                          }).format(p.budget)}
                        </td>
                        <td>
                          <Badge value={p.status} />
                          {p.deciderName && <small>oleh {p.deciderName}</small>}
                        </td>
                        <td>
                          {role === "Pembina" && p.status === "diajukan" ? (
                            <span className="row-actions">
                              <button
                                className="primary small"
                                onClick={() => void decideProposal(p.id, "disetujui")}
                              >
                                Setujui
                              </button>
                              <button
                                className="ghost small"
                                onClick={() => void decideProposal(p.id, "revisi")}
                              >
                                Revisi
                              </button>
                              <button
                                className="ghost small"
                                onClick={() => void decideProposal(p.id, "ditolak")}
                              >
                                Tolak
                              </button>
                            </span>
                          ) : (
                            <span className="row-actions">
                              {(p.creatorName === auth.user.name || role === "Admin") && (
                                <label className="file-button">
                                  <FileText size={14} />
                                  {fileBusy === p.id ? "Mengunggah..." : "Berkas"}
                                  <input
                                    type="file"
                                    accept="application/pdf,image/png,image/jpeg"
                                    hidden
                                    disabled={fileBusy === p.id}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void uploadProposalFile(p.id, f);
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              )}
                              {(p.creatorName === auth.user.name || role === "Admin") &&
                                p.status !== "disetujui" && (
                                  <button
                                    className="ghost small"
                                    onClick={() => void removeProposal(p.id)}
                                  >
                                    <Trash2 size={14} /> Hapus
                                  </button>
                                )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!proposals.length && (
                <div className="empty">Belum ada proposal diajukan.</div>
              )}
            </section>
          )}

          {page === "Notifikasi" && (
            <section className="panel">
              {notifs.some((n) => !n.read) && (
                <div className="panel-heading">
                  <div>
                    <h3>Belum dibaca</h3>
                    <p>
                      {notifs.filter((n) => !n.read).length} pemberitahuan baru.
                    </p>
                  </div>
                  <button className="ghost" onClick={() => void markNotifications()}>
                    <Check size={16} />
                    Tandai semua dibaca
                  </button>
                </div>
              )}
              <div className="notice-list">
                {notifs.map((n) => (
                  <article
                    key={n.id}
                    className={"notice-item " + (n.read ? "" : "unread")}
                  >
                    <span className="notice-dot" />
                    <div>
                      <strong>{n.message}</strong>
                      <small>
                        {new Date(n.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
              {!notifs.length && (
                <div className="empty">Belum ada notifikasi.</div>
              )}
            </section>
          )}

          {page === "Audit Log" && role === "Admin" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Jejak aktivitas</h3>
                  <p>Catatan tindakan yang mengubah data pada sistem.</p>
                </div>
                <span className="muted-note">{audit.length} entri terakhir</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Pelaku</th>
                      <th>Aksi</th>
                      <th>Sasaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {new Date(a.createdAt).toLocaleString("id-ID", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td>
                          <strong>{a.actor}</strong>
                        </td>
                        <td>
                          <span className="chip">{a.action}</span>
                        </td>
                        <td className="muted-note">{a.target || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!audit.length && <div className="empty">Belum ada aktivitas tercatat.</div>}
            </section>
          )}

          {page === "Pengguna" && role === "Admin" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Akun & hak akses</h3>
                  <p>Hanya Admin yang dapat membuat akun Pengurus.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setAccountError("");
                    setAccountModal(true);
                  }}
                >
                  <Plus size={17} />
                  Buat akun pengelola
                </button>
              </div>
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="Cari nama atau email pengguna..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <span>{users.length} pengguna terdaftar</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Pengguna</th>
                      <th>Organisasi</th>
                      <th>Role saat ini</th>
                      <th>Atur hak akses</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {users
                      .filter((u) =>
                        (u.name + u.email)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="cell-title">
                              <Avatar name={u.name} />
                              <div>
                                <strong>{u.name}</strong>
                                <small>{u.email}</small>
                              </div>
                            </div>
                          </td>
                          <td>{u.org}</td>
                          <td>
                            <Badge value={u.role} />
                          </td>
                          <td>
                            <select
                              aria-label={"Role " + u.name}
                              value={u.role}
                              disabled={u.role === "Admin"}
                              onChange={async (e) => {
                                try {
                                  await auth.changeRole(u.id, e.target.value);
                                  await refresh();
                                  setToast("Hak akses pengguna diperbarui");
                                } catch (err) {
                                  setToast((err as Error).message);
                                }
                              }}
                            >
                              {(u.role === "Admin"
                                ? ["Admin"]
                                : ["Pengurus", "Pembina", "Anggota"]
                              ).map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {u.role !== "Admin" && u.id !== auth.user.id && (
                              <button
                                className="ghost small danger"
                                disabled={accountDeleteBusy === u.id}
                                onClick={() => void removeAccount(u.id, u.name)}
                              >
                                <Trash2 size={14} />
                                {accountDeleteBusy === u.id ? "Menghapus..." : "Hapus"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Profil" && (
            <form
              className="panel profile-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await auth.updateProfile(
                    String(f.get("name")).trim(),
                    String(f.get("email")),
                  );
                  setToast("Profil berhasil disimpan");
                } catch (err) {
                  setToast((err as Error).message);
                }
              }}
            >
              <Avatar name={profile.name} />
              <h3>Informasi pribadi</h3>
              <label>
                Nama lengkap
                <input
                  required
                  name="name"
                  defaultValue={profile.name}
                  maxLength={60}
                />
              </label>
              <label>
                Alamat email
                <input
                  required
                  type="email"
                  name="email"
                  defaultValue={profile.email}
                />
              </label>
              <label>
                Role aktif
                <input readOnly value={role} />
              </label>
              <button className="primary" type="submit">
                Simpan perubahan
              </button>
            </form>
          )}
          {page === "Pengaturan" && (
            <section className="panel profile-form">
              <span className="org-logo rose">
                <ShieldCheck size={28} />
              </span>
              <h3>Akun & akses</h3>
              <p>
                Anda masuk sebagai <strong>{role}</strong> dengan email{" "}
                {auth.user.email}.
              </p>
              <div className="permission-list">
                <p>
                  <strong>Admin</strong> — Kelola kegiatan, kehadiran, role, dan
                  buat akun Pengurus.
                </p>
                <p>
                  <strong>Pengurus</strong> — Kelola kegiatan dan kehadiran.
                </p>
                <p>
                  <strong>Anggota</strong> — Scan QR kegiatan dan lihat rekap
                  kehadiran sendiri.
                </p>
              </div>
              <div className="demo-note">
                Pendaftaran mandiri hanya untuk Anggota. Hubungi Admin untuk
                memperoleh akun Pengurus. Hak akses divalidasi di server untuk
                setiap permintaan.
              </div>
              <button
                className="secondary"
                onClick={() =>
                  void auth.logout().catch((e) => setToast(e.message))
                }
              >
                <LogOut size={17} />
                Keluar dari akun
              </button>
            </section>
          )}
          <footer>
            <span>
              © 2026 SIMORA <span className="dot">•</span> Ruang untuk
              terhubung dan bertumbuh.
            </span>
            <span>
              <i />
              PostgreSQL <span className="dot">•</span> Sinkronisasi server
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        onCancel={() => {
          setModal(false);
          setDetail(null);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setModal(false);
            setDetail(null);
          }
        }}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">SIMORA / KEGIATAN</div>
            <h2>{detail ? "Detail kegiatan" : "Tambah kegiatan baru"}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Tutup modal"
            onClick={() => {
              setModal(false);
              setDetail(null);
            }}
          >
            <X />
          </button>
        </div>
        {detail ? (
          <div className="event-detail">
            <Badge value={detail.status} />
            <h2>{detail.name}</h2>
            <p>{detail.description}</p>
            <div className="detail-grid">
              <span>
                <Building2 />
                {detail.org}
              </span>
              <span>
                <CalendarDays />
                {fmt(detail.date)}
              </span>
              <span>
                <Clock />
                {detail.time} WIB
              </span>
              <span>
                <Users />
                Kuota {detail.capacity} peserta
              </span>
              <span>
                <MapPin />
                {detail.location}
              </span>
            </div>
            {canEdit && (
              <label>
                Status kegiatan
                <select
                  value={detail.status}
                  onChange={(e) =>
                    void changeEventStatus(detail, e.target.value)
                  }
                >
                  {["Mendatang", "Berlangsung", "Selesai"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="primary"
              onClick={() => {
                setSelectedEvent(detail.id);
                setDetail(null);
                go("Kehadiran");
              }}
            >
              {canEdit ? "Kelola QR & kehadiran" : "Scan QR & absensi"}{" "}
              <ArrowRight size={17} />
            </button>
          </div>
        ) : (
          <form onSubmit={addEvent} className="event-form">
            <label>
              Nama kegiatan
              <input
                name="name"
                placeholder="Contoh: Workshop UI/UX Design"
                required
                maxLength={100}
                pattern=".*\S.*"
              />
            </label>
            <div className="form-row">
              <label>
                Organisasi
                <select name="org" required={newAccountRole !== "Anggota"}>
                  {organizations.map((o) => (
                    <option key={o.name}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Kuota peserta
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue="50"
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Tanggal
                <input type="date" name="date" required />
              </label>
              <label>
                Waktu (WIB)
                <input type="time" name="time" defaultValue="09:00" required />
              </label>
            </div>
            <label>
              Lokasi
              <input
                name="location"
                placeholder="Nama gedung atau ruang"
                required
                pattern=".*\S.*"
              />
            </label>
            <label>
              Deskripsi
              <textarea
                name="description"
                rows={3}
                placeholder="Ceritakan tentang kegiatan ini..."
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(false)}
              >
                Batal
              </button>
              <button disabled={eventSaving} className="primary" type="submit">
                <Plus size={17} />
                {eventSaving ? "Menyimpan..." : "Simpan kegiatan"}
              </button>
            </div>
          </form>
        )}
      </dialog>
      {proposalModal && (
        <div className="modal-backdrop" onClick={() => setProposalModal(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Ajukan proposal kegiatan"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h3>Ajukan proposal</h3>
                <p>Proposal akan ditinjau oleh Pembina.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Tutup"
                onClick={() => setProposalModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitProposal} className="modal-form">
              <label>
                Kegiatan terkait
                <select name="eventId" defaultValue="">
                  <option value="">Tidak terkait kegiatan</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Judul proposal
                <input name="title" required minLength={3} maxLength={160} />
              </label>
              <label>
                Ringkasan
                <textarea name="summary" required minLength={10} rows={4} />
              </label>
              <label>
                Anggaran (Rp)
                <input name="budget" type="number" min={0} step={1000} defaultValue={0} />
              </label>
              {proposalError && (
                <div className="auth-error" role="alert">
                  {proposalError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setProposalModal(false)}
                >
                  Batal
                </button>
                <button className="primary" type="submit" disabled={proposalBusy}>
                  <Send size={16} />
                  {proposalBusy ? "Mengirim..." : "Kirim proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <dialog ref={accountDialogRef} onCancel={() => setAccountModal(false)}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">ADMIN / MANAJEMEN AKUN</div>
            <h2>Buat akun pengelola</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Tutup form akun"
            onClick={() => setAccountModal(false)}
          >
            <X />
          </button>
        </div>
        <form
          className="event-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (role !== "Admin") return;
            const f = new FormData(e.currentTarget);
            setAccountError("");
            if (f.get("password") !== f.get("confirm")) {
              setAccountError("Konfirmasi kata sandi tidak cocok.");
              return;
            }
            setAccountBusy(true);
            try {
              await auth.createPengurus({
                name: String(f.get("name")),
                email: String(f.get("email")),
                password: String(f.get("password")),
                role: newAccountRole,
                org: newAccountRole === "Anggota" ? undefined : String(f.get("org") || ""),
                nim: String(f.get("nim") || "") || undefined,
                phone: String(f.get("phone") || "") || undefined,
              });
              setAccountModal(false);
              setToast(
                "Akun " + newAccountRole + " berhasil dibuat dan dapat langsung digunakan.",
              );
            } catch (err) {
              setAccountError((err as Error).message);
            } finally {
              setAccountBusy(false);
            }
          }}
        >
          {accountError && (
            <p className="auth-error" role="alert">
              {accountError}
            </p>
          )}
          <label>
            Nama lengkap
            <input required name="name" maxLength={60} pattern=".*\S.*" />
          </label>
          <label>
            Peran akun
            <select
              name="role"
              value={newAccountRole}
              onChange={(e) =>
                setNewAccountRole(e.target.value as "Pengurus" | "Pembina" | "Anggota")
              }
            >
              <option value="Pengurus">Pengurus</option>
              <option value="Pembina">Pembina</option>
              <option value="Anggota">Anggota</option>
            </select>
          </label>
          <label>
            Email
            <input required name="email" type="email" maxLength={100} />
          </label>
          <label>
            NIM / NIP
            <input name="nim" maxLength={24} />
          </label>
          <label>
            Nomor WhatsApp
            <input name="phone" maxLength={24} />
          </label>
          {newAccountRole !== "Anggota" && (
            <label>
              Organisasi
              <select name="org" required>
                {organizations.map((o) => (
                  <option key={o.name}>{o.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Kata sandi awal
            <input
              required
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              placeholder="Minimal 12 karakter"
            />
          </label>
          <label>
            Konfirmasi kata sandi
            <input
              required
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
            />
          </label>
          <div className="demo-note">
            {newAccountRole === "Anggota"
              ? "Akun anggota tidak terikat organisasi."
              : "Akun " + newAccountRole + " wajib terikat pada satu organisasi."}
          </div>
          <div className="modal-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => setAccountModal(false)}
            >
              Batal
            </button>
            <button disabled={accountBusy} className="primary" type="submit">
              {accountBusy ? "Membuat akun..." : "Buat akun pengelola"}
            </button>
          </div>
        </form>
      </dialog>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
