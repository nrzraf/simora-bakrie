/** Attendance rules invoked only by the authenticated server service. */
export type AttendanceEvent = {
  id: number;
  name: string;
  status: string;
  org: string;
  date: string;
  time: string;
  location: string;
};
export type QRTicket = {
  eventId: number;
  token: string;
  code: string;
  issuedAt: number;
  expiresAt: number;
  issuedBy: number;
  revokedAt: number | null;
};
export type CheckIn = {
  eventId: number;
  userId: number;
  checkedAt: number;
  method: "QR kamera" | "QR gambar" | "Kode";
  ticketToken: string;
};
export type Tickets = Record<string, QRTicket>;
export type CheckIns = Record<string, CheckIn>;
export type Actor = { id: number; role: string };
export function issueTicket(
  event: AttendanceEvent,
  actor: Actor,
  minutes: number,
  now = Date.now(),
): QRTicket {
  if (!["Admin", "Pengurus"].includes(actor.role))
    throw new Error(
      "Hanya Admin atau Pengurus yang dapat menerbitkan QR absensi.",
    );
  if (event.status !== "Berlangsung")
    throw new Error(
      "Ubah status kegiatan menjadi Berlangsung sebelum membuka absensi.",
    );
  if (![5, 15, 30, 60].includes(minutes))
    throw new Error("Durasi absensi tidak valid.");
  const random = (bytes: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  return {
    eventId: event.id,
    token: random(16),
    code: random(4),
    issuedAt: now,
    expiresAt: now + minutes * 60000,
    issuedBy: actor.id,
    revokedAt: null,
  };
}
export function revokeTicket(
  ticket: QRTicket,
  actor: Actor,
  now = Date.now(),
): QRTicket {
  if (!["Admin", "Pengurus"].includes(actor.role))
    throw new Error("Anda tidak dapat menutup absensi.");
  return { ...ticket, revokedAt: now };
}
export function encodeTicket(ticket: QRTicket) {
  return `SIMORA:1:${ticket.eventId}:${ticket.token}`;
}
export function verifyCheckIn(
  input: string,
  event: AttendanceEvent,
  actor: Actor,
  ticket: QRTicket | undefined,
  alreadyPresent: boolean,
  method: CheckIn["method"],
  now = Date.now(),
): CheckIn {
  if (actor.role !== "Anggota")
    throw new Error("Pemindaian absensi hanya untuk akun Anggota.");
  if (event.status !== "Berlangsung")
    throw new Error("Kegiatan belum berlangsung atau sudah selesai.");
  if (!ticket || ticket.eventId !== event.id)
    throw new Error("Sesi absensi belum diterbitkan. Hubungi Pengurus.");
  if (ticket.revokedAt !== null)
    throw new Error("Sesi absensi telah ditutup oleh penyelenggara.");
  if (now < ticket.issuedAt || now >= ticket.expiresAt)
    throw new Error("QR sudah kedaluwarsa. Minta QR terbaru kepada Pengurus.");
  const value = input.trim();
  if (method === "Kode") {
    if (value.replace(/[\s-]/g, "").toUpperCase() !== ticket.code)
      throw new Error("Kode absensi tidak cocok dengan kegiatan yang dipilih.");
  } else {
    const match = /^SIMORA:1:(\d+):([A-F0-9]{32})$/.exec(value);
    if (!match) throw new Error("Gambar atau QR ini bukan QR absensi SIMORA.");
    if (Number(match[1]) !== event.id)
      throw new Error(
        "QR berasal dari kegiatan lain. Pilih kegiatan yang sesuai.",
      );
    if (match[2] !== ticket.token)
      throw new Error("QR sudah diganti. Gunakan QR terbaru dari Pengurus.");
  }
  if (alreadyPresent)
    throw new Error(
      "Anda sudah tercatat Hadir pada kegiatan ini. Absensi tidak dicatat ulang.",
    );
  return {
    eventId: event.id,
    userId: actor.id,
    checkedAt: now,
    method,
    ticketToken: ticket.token,
  };
}
export function timeWIB(timestamp: number) {
  return (
    new Date(timestamp).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " WIB"
  );
}
