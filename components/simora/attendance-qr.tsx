"use client";
import { useEffect, useRef, useState } from "react";
import {
  QrCode,
  ScanLine,
  Camera,
  CameraOff,
  Download,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ImageUp,
  Keyboard,
  Copy,
  Square,
  Users,
} from "lucide-react";
import { encodeTicket, timeWIB } from "../../lib/simora/attendance";
import type {
  AttendanceEvent,
  QRTicket,
  CheckIn,
} from "../../lib/simora/attendance";
type Props = {
  event: AttendanceEvent;
  role: string;
  ticket?: QRTicket;
  checkIn?: CheckIn;
  attendance: string;
  onIssue: (minutes: number) => Promise<void>;
  onRevoke: () => Promise<void>;
  onSubmit: (value: string, method: CheckIn["method"]) => Promise<CheckIn>;
  onDetail: () => void;
};
export default function AttendanceQR({
  event,
  role,
  ticket,
  checkIn,
  attendance,
  onIssue,
  onRevoke,
  onSubmit,
  onDetail,
}: Props) {
  const manager = role === "Admin" || role === "Pengurus";
  const [duration, setDuration] = useState(15),
    [image, setImage] = useState(""),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [camera, setCamera] = useState(false),
    [starting, setStarting] = useState(false),
    [uploading, setUploading] = useState(false),
    [pending, setPending] = useState(false),
    [code, setCode] = useState("");
  const [boxSize, setBoxSize] = useState(240);
  const boxRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ x: number; y: number; size: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    stream = useRef<MediaStream | null>(null),
    request = useRef(0),
    onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const live = Boolean(
    ticket &&
      !ticket.revokedAt &&
      ticket.expiresAt > now &&
      event.status === "Berlangsung",
  );
  const remaining = ticket
    ? Math.max(0, Math.ceil((ticket.expiresAt - now) / 1000))
    : 0;
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    setImage("");
    if (!manager || !ticket) return;
    let cancelled = false;
    import("qrcode")
      .then((q) =>
        q.toDataURL(encodeTicket(ticket), {
          width: 640,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#24151C", light: "#FFFFFF" },
        }),
      )
      .then((url) => {
        if (!cancelled) setImage(url);
      })
      .catch(() => {
        if (!cancelled)
          setError("QR gagal dibuat. Silakan muat ulang halaman.");
      });
    return () => {
      cancelled = true;
    };
  }, [ticket?.token, manager]);
  function stopCamera() {
    request.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
    setStarting(false);
  }
  useEffect(() => {
    setError("");
    setNotice("");
    setCode("");
    stopCamera();
    setBoxSize(240);
    return () => {
      request.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [event.id]);
  // kamera menyala otomatis begitu sesi absensi aktif dan anggota belum hadir
  useEffect(() => {
    if (manager || attendance === "Hadir") return;
    if (live && !camera && !starting) void startCamera();
    if (!live) stopCamera();
  }, [live, manager, attendance]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  useEffect(() => {
    if (!camera) return;
    let cancelled = false,
      frame = 0,
      last = 0;
    let decode: typeof import("jsqr").default;
    import("jsqr")
      .then((m) => {
        decode = m.default;
        frame = requestAnimationFrame(scan);
      })
      .catch(() => {
        setError("Pemindai gagal dimuat. Gunakan kode alternatif.");
        stopCamera();
      });
    function scan(timestamp: number) {
      if (cancelled) return;
      const v = video.current,
        c = canvas.current;
      if (v && c && v.readyState >= 2 && timestamp - last > 180) {
        last = timestamp;
        const width = Math.min(800, v.videoWidth),
          height = Math.round((v.videoHeight * width) / v.videoWidth);
        if (width && height) {
          c.width = width;
          c.height = height;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, width, height);
            const result = decode(
              ctx.getImageData(0, 0, width, height).data,
              width,
              height,
              { inversionAttempts: "attemptBoth" },
            );
            if (result) {
              complete(result.data, "QR kamera");
              return;
            }
          }
        }
      }
      frame = requestAnimationFrame(scan);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [camera]);
  async function complete(value: string, method: CheckIn["method"]) {
    if (pending) return;
    setPending(true);
    stopCamera();
    setError("");
    setNotice("");
    try {
      const result = await onSubmitRef.current(value, method);
      setNotice("Kehadiran berhasil dicatat pada " + timeWIB(result.checkedAt));
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function startCamera() {
    setError("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Kamera memerlukan HTTPS dan browser yang mendukung kamera. Gunakan unggah QR atau kode alternatif.",
      );
      return;
    }
    const generation = ++request.current;
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      if (generation !== request.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setCamera(true);
      setStarting(false);
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
    } catch (e) {
      if (generation !== request.current) return;
      stopCamera();
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, atau unggah gambar QR."
          : (e as Error).name === "NotFoundError"
            ? "Kamera tidak ditemukan. Gunakan unggah QR atau kode alternatif."
            : "Kamera tidak dapat dibuka. Tutup aplikasi kamera lain dan coba lagi.",
      );
    }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    stopCamera();
    setError("");
    setNotice("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Pilih gambar PNG, JPG, atau WebP maksimal 10 MB.");
      return;
    }
    const generation = request.current;
    setUploading(true);
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const c = document.createElement("canvas"),
        ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      c.width = Math.round(bitmap.width * ratio);
      c.height = Math.round(bitmap.height * ratio);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Browser tidak mendukung pembacaan gambar.");
      ctx.drawImage(bitmap, 0, 0, c.width, c.height);
      const { default: decode } = await import("jsqr");
      const result = decode(
        ctx.getImageData(0, 0, c.width, c.height).data,
        c.width,
        c.height,
        { inversionAttempts: "attemptBoth" },
      );
      if (generation !== request.current) return;
      if (!result)
        throw new Error(
          "QR tidak terbaca. Gunakan gambar yang utuh, tajam, dan tidak terpotong.",
        );
      await complete(result.data, "QR gambar");
    } catch (e) {
      if (generation === request.current) setError((e as Error).message);
    } finally {
      bitmap?.close();
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function issue() {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await onIssue(duration);
      setNow(Date.now());
      setNotice(
        ticket
          ? "QR baru diterbitkan. QR sebelumnya tidak berlaku lagi."
          : "Sesi absensi berhasil dibuka.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function revoke() {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await onRevoke();
      setNow(Date.now());
      setNotice("Sesi ditutup. Anggota tidak dapat menggunakan QR ini lagi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function copyCode() {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket.code);
      setNotice("Kode alternatif disalin.");
    } catch {
      setError("Salin kode yang ditampilkan secara manual.");
    }
  }
  return (
    <section className="panel qr-panel">
      <div className="qr-heading">
        <span className="qr-heading-icon">
          <QrCode size={24} />
        </span>
        <div>
          <h3>{manager ? "QR Absensi Kegiatan" : "Absensi Mandiri"}</h3>
          <p>
            {manager
              ? "Terbitkan QR, tampilkan kepada peserta, dan pantau kehadiran."
              : "Scan QR dari penyelenggara untuk mencatat kehadiranmu."}
          </p>
        </div>
        <span className={"qr-state " + (live ? "is-live" : "")}>
          {live ? (
            <>
              <i />
              Absensi terbuka
            </>
          ) : ticket?.revokedAt ? (
            "Sesi ditutup"
          ) : ticket && ticket.expiresAt <= now ? (
            "QR kedaluwarsa"
          ) : (
            "Belum dibuka"
          )}
        </span>
      </div>
      {manager ? (
        <div className="qr-manager">
          <div className="qr-poster">
            <div className="qr-poster-top">
              <QrCode size={17} />
              <span>SIMORA · SCAN UNTUK HADIR</span>
            </div>
            <h4>{event.name}</h4>
            <p>
              {event.org} · {event.location}
            </p>
            <div className={"qr-image-frame " + (!live ? "qr-inactive" : "")}>
              {image && live ? (
                <img
                  src={image}
                  alt={"QR absensi " + event.name}
                  width="240"
                  height="240"
                />
              ) : (
                <div className="qr-placeholder">
                  <QrCode size={82} strokeWidth={1} />
                  <strong>
                    {live
                      ? "Menyiapkan QR..."
                      : ticket
                        ? "Sesi absensi tidak aktif"
                        : "QR belum diterbitkan"}
                  </strong>
                  <span>
                    {ticket
                      ? "Terbitkan QR baru untuk membuka sesi."
                      : "Buka absensi untuk membuat QR kegiatan."}
                  </span>
                </div>
              )}
            </div>
            {live && ticket ? (
              <>
                <div className="qr-timer">
                  <Clock size={14} />
                  <span>
                    Berlaku{" "}
                    {Math.floor(remaining / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(remaining % 60).toString().padStart(2, "0")}
                  </span>
                </div>
                <span className="qr-end">
                  Berakhir {timeWIB(ticket.expiresAt)}
                </span>
              </>
            ) : (
              <span className="qr-end">
                Hanya untuk kegiatan berstatus Berlangsung
              </span>
            )}
          </div>
          <div className="qr-controls">
            <span className="eyebrow">KELOLA SESI KEHADIRAN</span>
            <h2>
              Satu scan.
              <br />
              Kehadiran tercatat.
            </h2>
            <p>
              Setiap QR hanya berlaku untuk kegiatan ini. QR baru akan
              menggantikan QR sebelumnya.
            </p>
            {event.status !== "Berlangsung" && (
              <div className="demo-note">
                Status kegiatan: <strong>{event.status}</strong>. Atur menjadi
                Berlangsung untuk membuka absensi.
                <button className="text-button" onClick={onDetail}>
                  Buka detail kegiatan →
                </button>
              </div>
            )}
            <label>
              Masa berlaku QR
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[5, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} menit
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={pending || event.status !== "Berlangsung"}
              onClick={issue}
            >
              {ticket ? <RefreshCw size={17} /> : <QrCode size={17} />}{" "}
              {ticket ? "Terbitkan QR baru" : "Buka absensi & buat QR"}
            </button>
            {live && ticket && (
              <>
                <div className="qr-code-box">
                  <div>
                    <small>KODE ALTERNATIF</small>
                    <strong>
                      {ticket.code.slice(0, 4)} {ticket.code.slice(4)}
                    </strong>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Salin kode absensi"
                    onClick={copyCode}
                  >
                    <Copy size={18} />
                  </button>
                </div>
                <div className="qr-button-row">
                  <button
                    className="secondary"
                    disabled={!image}
                    onClick={() => {
                      if (!image) return;
                      const a = document.createElement("a");
                      a.href = image;
                      a.download = "SIMORA-QR-" + event.id + ".png";
                      a.click();
                    }}
                  >
                    <Download size={16} />
                    Unduh QR
                  </button>
                  <button
                    className="secondary danger"
                    disabled={pending}
                    onClick={revoke}
                  >
                    <Square size={14} />
                    Tutup absensi
                  </button>
                </div>
              </>
            )}
            <div className="qr-tip">
              <ShieldCheck size={18} />
              <span>
                QR kedaluwarsa, QR yang diganti, dan absen ganda akan ditolak.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="qr-member">
          {attendance === "Hadir" ? (
            <div className="qr-success-card">
              <CheckCircle2 size={42} />
              <h2>Kehadiranmu sudah tercatat!</h2>
              <p>{event.name}</p>
              <span>
                {checkIn
                  ? timeWIB(checkIn.checkedAt)
                  : "Status Hadir telah dicatat oleh penyelenggara."}
              </span>
              {checkIn && <small>Metode: {checkIn.method}</small>}
            </div>
          ) : (
            <>
              <div className="scan-card">
                <div className={"camera-window " + (camera ? "camera-on" : "")}>
                  <video
                    ref={video}
                    playsInline
                    muted
                    aria-label="Pratinjau kamera pemindai QR"
                  />
                  <canvas ref={canvas} hidden />
                  {!camera && (
                    <div className="camera-idle">
                      <ScanLine size={65} strokeWidth={1} />
                      <h4>Arahkan kamera ke QR kegiatan</h4>
                      <p>Kamera hanya aktif setelah Anda menekan tombol.</p>
                    </div>
                  )}
                  {camera && (
                    <div
                      ref={boxRef}
                      className="scan-target"
                      style={{ width: boxSize, height: boxSize }}
                      aria-hidden="true"
                    >
                      <span
                        className="scan-resize"
                        role="slider"
                        aria-label="Ubah ukuran kotak pindai"
                        aria-valuemin={120}
                        aria-valuemax={420}
                        aria-valuenow={boxSize}
                        onPointerDown={(e) => {
                          resizing.current = { x: e.clientX, y: e.clientY, size: boxSize };
                          try {
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          } catch {
                            /* pointer capture tidak selalu tersedia */
                          }
                          e.preventDefault();
                        }}
                        onPointerMove={(e) => {
                          if (!resizing.current) return;
                          // gerakan menjauh dari pusat = perbesar
                          const d =
                            Math.max(
                              e.clientX - resizing.current.x,
                              e.clientY - resizing.current.y,
                            ) * 2;
                          const max = Math.min(
                            video.current?.clientWidth || 420,
                            video.current?.clientHeight || 420,
                          );
                          setBoxSize(
                            Math.max(
                              120,
                              Math.min(max || 420, resizing.current.size + d),
                            ),
                          );
                        }}
                        onPointerUp={() => {
                          resizing.current = null;
                        }}
                        onPointerCancel={() => {
                          resizing.current = null;
                        }}
                        onPointerLeave={(e) => {
                          if (e.buttons === 0) resizing.current = null;
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="scan-buttons">
                  {camera || starting ? (
                    <button className="secondary" onClick={stopCamera}>
                      <CameraOff size={17} />
                      {starting ? "Batalkan" : "Hentikan kamera"}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={pending || uploading || !live}
                      onClick={startCamera}
                    >
                      <Camera size={18} />
                      Aktifkan kamera
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={pending || uploading || starting || !live}
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImageUp size={17} />
                    {uploading ? "Membaca QR..." : "Unggah gambar QR"}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    aria-label="Unggah gambar QR absensi"
                    onChange={(e) => readFile(e.target.files?.[0])}
                  />
                </div>
              </div>
              <div className="scan-instructions">
                <span className="eyebrow">CHECK-IN KEGIATAN</span>
                <h2>{event.name}</h2>
                <p>
                  Pastikan kegiatan yang dipilih sesuai dengan QR dari Admin
                  atau Pengurus.
                </p>
                <ol>
                  <li>
                    <span>1</span>Aktifkan kamera atau unggah gambar QR.
                  </li>
                  <li>
                    <span>2</span>Scan QR yang masih berlaku.
                  </li>
                  <li>
                    <span>3</span>Status Hadir tercatat otomatis untuk akunmu.
                  </li>
                </ol>
                {!live && (
                  <div className="demo-note">
                    Absensi belum dibuka atau QR sudah tidak aktif. Minta
                    Pengurus membuka sesi untuk kegiatan ini.
                  </div>
                )}
                <form
                  className="manual-code"
                  onSubmit={(e) => {
                    e.preventDefault();
                    complete(code, "Kode");
                  }}
                >
                  <label>
                    <span>
                      <Keyboard size={15} />
                      Gunakan kode alternatif
                    </span>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="Contoh: A1B2 C3D4"
                      maxLength={12}
                      minLength={8}
                      required
                      autoComplete="off"
                      disabled={!live}
                    />
                  </label>
                  <button
                    className="primary"
                    type="submit"
                    disabled={pending || !live || uploading}
                  >
                    {pending ? "Memverifikasi..." : "Catat kehadiran"}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
      {(error || notice) && (
        <div className="qr-feedback">
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
        </div>
      )}
      <div className="qr-demo-note">
        <Users size={15} />
        <span>
          Scan dari HP Anggota dengan akun masing-masing. Server memvalidasi QR
          dan mencatat kehadiran; rekap penyelenggara diperbarui setiap 10
          detik.
        </span>
      </div>
    </section>
  );
}
