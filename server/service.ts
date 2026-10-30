import { z } from "zod";
import type { Database, SQL, Row } from "./types.ts";
import {
  checkPassword,
  digest,
  hashPassword,
  newToken,
  sessionToken,
} from "./security.ts";
import {
  issueTicket,
  revokeTicket,
  verifyCheckIn,
} from "../lib/simora/attendance.ts";
const roles = z.enum(["Admin", "Pengurus", "Pembina", "Anggota"]);
export const ORGS = ["BEM","SENAT","HMTIF","HMSIF","HMILKOM","HMM","HMPOL","HMTL","HMITP","HMTI"] as const;
const org = z.enum(ORGS);
const email = z
  .string()
  .trim()
  .email()
  .max(100)
  .transform((s) => s.toLowerCase());
const name = z.string().trim().min(1).max(60);
const password = z.string().min(12, "Kata sandi minimal 12 karakter.").max(128);
const account = z.object({ name, email, password, org });
const eventInput = z.object({
  name: z.string().trim().min(1).max(100),
  org,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(s);
      return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, "Tanggal tidak valid"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  location: z.string().trim().min(1).max(160),
  capacity: z.number().int().min(1).max(10000),
  description: z.string().trim().min(1).max(5000),
});
class HTTPError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const fail = (status: number, message: string): never => {
  throw new HTTPError(status, message);
};
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
const publicUser = (u: Row) => ({
  id: Number(u.id),
  name: u.name,
  email: u.email,
  org: u.org,
  role: u.role,
});
const publicEvent = (e: Row) => ({
  ...e,
  id: Number(e.id),
  date:
    e.date instanceof Date
      ? e.date.toISOString().slice(0, 10)
      : String(e.date).slice(0, 10),
  time: String(e.time).slice(0, 5),
  capacity: Number(e.capacity),
});
const publicTicket = (q: Row) => ({
  eventId: Number(q.event_id),
  token: q.token,
  code: q.code,
  issuedBy: Number(q.issued_by),
  issuedAt: new Date(q.issued_at).getTime(),
  expiresAt: new Date(q.expires_at).getTime(),
  revokedAt: q.revoked_at ? new Date(q.revoked_at).getTime() : null,
});
const manager = (u: Row) => {
  if (!["Admin", "Pengurus"].includes(u.role))
    fail(403, "Hanya Admin atau Pengurus yang diizinkan.");
};
const admin = (u: Row) => {
  if (u.role !== "Admin") fail(403, "Hanya Admin yang diizinkan.");
};
const numeric = (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) fail(400, "ID tidak valid.");
  return n;
};
async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 16384) fail(413, "Data terlalu besar.");
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, "JSON tidak valid.");
  }
}
export function createService(db: Database) {
  async function limit(key: string, max: number, seconds: number) {
    const result = await db.query(
      `INSERT INTO rate_limits(key,attempts,expires_at) VALUES($1,1,CURRENT_TIMESTAMP+($2 * INTERVAL '1 second')) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN rate_limits.expires_at<=CURRENT_TIMESTAMP THEN 1 ELSE rate_limits.attempts+1 END,expires_at=CASE WHEN rate_limits.expires_at<=CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP+($2 * INTERVAL '1 second') ELSE rate_limits.expires_at END RETURNING attempts`,
      [digest(key), seconds],
    );
    if (Number(result.rows[0].attempts) > max)
      fail(429, "Terlalu banyak percobaan. Coba lagi setelah beberapa menit.");
  }
  async function user(request: Request) {
    const token = sessionToken(request);
    if (!token) fail(401, "Silakan login terlebih dahulu.");
    const result = await db.query(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP",
      [digest(token!)],
    );
    return result.rows[0] || fail(401, "Sesi berakhir. Silakan login kembali.");
  }
  async function people(actor: Row) {
    const result = await db.query(
      actor.role === "Anggota"
        ? "SELECT id,name,email,org,role FROM users WHERE id=$1"
        : "SELECT id,name,email,org,role FROM users ORDER BY id",
      actor.role === "Anggota" ? [actor.id] : [],
    );
    return result.rows.map(publicUser);
  }
  async function eventForUpdate(sql: SQL, id: number) {
    const e = (
      await sql.query("SELECT * FROM events WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    return e || fail(404, "Kegiatan tidak ditemukan.");
  }
  async function audit(sql: SQL, actor: Row, action: string, target: string) {
    await sql.query(
      "INSERT INTO audit_logs(actor_id,action,target) VALUES($1,$2,$3)",
      [actor.id, action, target],
    );
  }
  async function handle(request: Request) {
    try {
      const url = new URL(request.url),
        path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""),
        method = request.method;
      if (!["GET", "HEAD"].includes(method)) {
        const origin = request.headers.get("origin");
        const allowed = process.env.APP_URL
          ? new URL(process.env.APP_URL).origin
          : url.origin;
        if (!path.startsWith("cron/") && (!origin || origin !== allowed))
          fail(403, "Origin permintaan tidak diizinkan.");
        const noBody = path.startsWith("cron/");
        if (
          method !== "DELETE" &&
          !noBody &&
          !request.headers.get("content-type")?.includes("application/json")
        )
          fail(415, "Gunakan application/json.");
      }
      const ip =
        request.headers.get("x-vercel-forwarded-for") ||
        request.headers.get("x-forwarded-for") ||
        "local";
      if (path === "auth/register" && method === "POST") {
        await limit("register:" + ip, 10, 900);
        const data = z
          .object({
            name,
            email,
            password,
            org: org.optional(),
            nim: z.string().trim().min(6, "NIM minimal 6 digit.").max(24),
            phone: z.string().trim().min(9, "Nomor WhatsApp tidak valid.").max(24),
            division: z.string().trim().max(60).optional(),
          })
          .parse(await body(request));
        await limit("register-account:" + data.email, 5, 900);
        const hash = await hashPassword(data.password);
        const r = await db.query(
          "INSERT INTO users(name,email,password_hash,org,role,nim,phone,division) VALUES($1,$2,$3,$4,'Anggota',$5,$6,$7) RETURNING id",
          [data.name, data.email, hash, data.org || "Ormawa", data.nim, data.phone, data.division ?? null],
        );
        const newId = Number(r.rows[0].id);
        await db.query(
          "INSERT INTO notifications(user_id,kind,message) VALUES($1,'sistem','Selamat datang. Akun anggota Anda sudah aktif.')",
          [newId],
        );
        await audit(db, { id: newId, role: "Anggota" } as Row, "register", String(newId));
        return json({ ok: true, id: newId }, 201);
      }
      if (path === "auth/login" && method === "POST") {
        await limit("login-ip:" + ip, 40, 900);
        const data = z
          .object({ email, password: z.string().min(1).max(128), role: roles })
          .parse(await body(request));
        await limit("login-account:" + data.email, 15, 900);
        const u = (
          await db.query("SELECT * FROM users WHERE email=$1", [data.email])
        ).rows[0];
        const dummy =
          "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
        const valid = await checkPassword(
          data.password,
          u?.password_hash || dummy,
        );
        if (!u || !valid || u.role !== data.role)
          fail(401, "Email, kata sandi, atau peran tidak sesuai.");
        if (u.status === "nonaktif")
          fail(403, "Akun Anda dinonaktifkan. Hubungi Admin.");
        const token = newToken();
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '8 hours')",
          [digest(token), u.id],
        );
        return json({ user: publicUser(u), accounts: await people(u) }, 200, {
          "Set-Cookie": `simora_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        });
      }
      if (path === "auth/logout" && method === "POST") {
        const token = sessionToken(request);
        if (token)
          await db.query("DELETE FROM sessions WHERE token_hash=$1", [
            digest(token),
          ]);
        return json({ ok: true }, 200, {
          "Set-Cookie": `simora_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        });
      }
      // ---------- Pengingat H-1 (cron, dipanggil scheduler) ----------
      if (path === "cron/reminder" && method === "POST") {
        const secret = request.headers.get("x-cron-key") || url.searchParams.get("key") || "";
        if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)
          fail(403, "Kunci cron tidak valid.");
        const rows = await db.query(
          `SELECT e.id, e.name, e.date, e.time, e.location,
                  (SELECT COUNT(*)::int FROM registrations r WHERE r.event_id=e.id AND r.status<>'batal') AS terdaftar
             FROM events e
            WHERE e.status='Mendatang'
              AND e.date = CURRENT_DATE + 1`,
        );
        let sent = 0;
        for (const e of rows.rows) {
          const peserta = await db.query(
            "SELECT u.id,u.name,u.email FROM users u JOIN registrations r ON r.user_id=u.id WHERE r.event_id=$1 AND r.status<>'batal'",
            [e.id],
          );
          for (const u of peserta.rows) {
            const msg =
              "Pengingat: " + e.name + " besok " + String(e.date).slice(0, 10) +
              " pukul " + String(e.time).slice(0, 5) + " di " + e.location + ".";
            await db.query(
              "INSERT INTO notifications(user_id,event_id,kind,message) VALUES($1,$2,'pengingat',$3)",
              [u.id, e.id, msg],
            );
            await db.query(
              "INSERT INTO mail_log(recipient,subject,kind,status) VALUES($1,$2,'pengingat','log')",
              [u.email, "Pengingat H-1: " + e.name],
            );
            sent++;
          }
        }
        return json({ ok: true, events: rows.rows.length, sent });
      }

      const actor = await user(request);
      if (path === "auth/me" && method === "GET")
        return json({ user: publicUser(actor), accounts: await people(actor) });
      if (path === "auth/profile" && method === "PATCH") {
        const data = z
          .object({ name, email, phone: z.string().trim().max(24).optional(), division: z.string().trim().max(60).optional() })
          .parse(await body(request));
        const taken = await db.query(
          "SELECT id FROM users WHERE email=$1 AND id<>$2",
          [data.email, actor.id],
        );
        if (taken.rows[0]) fail(409, "Email sudah dipakai akun lain.");
        await db.query(
          "UPDATE users SET name=$1,email=$2,phone=COALESCE($3,phone),division=COALESCE($4,division) WHERE id=$5",
          [data.name, data.email, data.phone ?? null, data.division ?? null, actor.id],
        );
        await audit(db, actor, "profile_update", String(actor.id));
        return json({ ok: true });
      }
      if (path === "auth/password" && method === "PATCH") {
        const data = z
          .object({
            current: z.string().min(1).max(128),
            next: z.string().min(12, "Kata sandi baru minimal 12 karakter.").max(128),
          })
          .parse(await body(request));
        const ok = await checkPassword(data.current, actor.password_hash);
        if (!ok) fail(400, "Kata sandi saat ini tidak sesuai.");
        await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          await hashPassword(data.next),
          actor.id,
        ]);
        await audit(db, actor, "password_change", String(actor.id));
        return json({ ok: true });
      }
      if (path === "users" && method === "POST") {
        admin(actor);
        const data = z
          .object({
            name,
            email,
            password,
            org: org.optional(),
            role: z.enum(["Pengurus", "Pembina", "Anggota"]),
            nim: z.string().trim().max(24).optional(),
            phone: z.string().trim().max(24).optional(),
            division: z.string().trim().max(60).optional(),
          })
          .refine(
            (v) => v.role === "Anggota" || Boolean(v.org),
            "Pilih organisasi untuk akun Pengurus atau Pembina.",
          )
          .parse(await body(request));
        const hashed = await hashPassword(data.password);
        const created = await db.transaction(async (sql) => {
          const row = (
            await sql.query(
              "INSERT INTO users(name,email,password_hash,org,role,nim,phone,division) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
              [data.name, data.email, hashed, data.org || actor.org, data.role, data.nim ?? null, data.phone ?? null, data.division ?? null],
            )
          ).rows[0];
          await audit(sql, actor, "create_" + data.role.toLowerCase(), String(row.id));
          return publicUser(row);
        });
        return json(created, 201);
      }
      if (/^users\/\d+$/.test(path) && method === "DELETE") {
        admin(actor);
        const id = numeric(path.split("/")[1]);
        if (id === Number(actor.id)) fail(403, "Akun sendiri tidak dapat dihapus.");
        const target = (await db.query("SELECT * FROM users WHERE id=$1", [id])).rows[0];
        if (!target) fail(404, "Pengguna tidak ditemukan.");
        if (target.role === "Admin") fail(403, "Akun Admin tidak dapat dihapus.");
        await db.transaction(async (sql) => {
          await sql.query("DELETE FROM sessions WHERE user_id=$1", [id]);
          await sql.query("DELETE FROM users WHERE id=$1", [id]);
          await audit(sql, actor, "delete_user:" + target.role, String(id));
        });
        return json({ ok: true });
      }
      if (/^users\/\d+$/.test(path) && method === "PATCH") {
        admin(actor);
        const id = numeric(path.split("/")[1]);
        if (id === Number(actor.id))
          fail(403, "Role akun aktif tidak dapat diubah.");
        const data = z
          .object({
            role: z.enum(["Pengurus", "Pembina", "Anggota"]).optional(),
            status: z.enum(["aktif", "nonaktif"]).optional(),
          })
          .refine((v) => v.role || v.status, "Tidak ada perubahan.")
          .parse(await body(request));
        await db.transaction(async (sql) => {
          const target = (
            await sql.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
          ).rows[0];
          if (!target) fail(404, "Pengguna tidak ditemukan.");
          if (target.role === "Admin")
            fail(403, "Akun Admin hanya dikelola melalui provisioning server.");
          if (data.role) await sql.query("UPDATE users SET role=$1 WHERE id=$2", [data.role, id]);
          if (data.status) await sql.query("UPDATE users SET status=$1 WHERE id=$2", [data.status, id]);
          await sql.query("DELETE FROM sessions WHERE user_id=$1", [id]);
          await audit(sql, actor, "user_update:" + (data.role || "") + (data.status || ""), String(id));
        });
        return json({ ok: true });
      }
      if (path === "state" && method === "GET") {
        const [ev, us, att, qr] = await Promise.all([
          db.query(
            "SELECT id,name,org,date,time,location,status,capacity,description FROM events ORDER BY date,id",
          ),
          people(actor),
          db.query(
            actor.role === "Anggota"
              ? "SELECT * FROM attendance WHERE user_id=$1"
              : "SELECT * FROM attendance",
            actor.role === "Anggota" ? [actor.id] : [],
          ),
          db.query("SELECT * FROM qr_sessions"),
        ]);
        const attendance: Record<string, string> = {},
          checkIns: Record<string, unknown> = {},
          qrTickets: Record<string, unknown> = {};
        for (const a of att.rows) {
          const key = a.event_id + "-" + a.user_id;
          attendance[key] = a.status;
          if (a.checked_at)
            checkIns[key] = {
              eventId: Number(a.event_id),
              userId: Number(a.user_id),
              checkedAt: new Date(a.checked_at).getTime(),
              method: a.method,
              ticketToken: "",
            };
        }
        for (const q of qr.rows) {
          const t = publicTicket(q);
          qrTickets[q.event_id] =
            actor.role === "Anggota" ? { ...t, token: "", code: "" } : t;
        }
        const [regs, props, notifs] = await Promise.all([
          db.query(
            actor.role === "Anggota"
              ? "SELECT event_id,status FROM registrations WHERE user_id=$1"
              : "SELECT event_id,user_id,status FROM registrations",
            actor.role === "Anggota" ? [actor.id] : [],
          ),
          db.query(
            "SELECT p.*, u.name AS creator_name, d.name AS decider_name FROM proposals p JOIN users u ON u.id=p.created_by LEFT JOIN users d ON d.id=p.decided_by ORDER BY p.created_at DESC",
          ),
          db.query(
            "SELECT id,kind,message,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
            [actor.id],
          ),
        ]);
        const registrations: Record<string, string> = {};
        for (const r of regs.rows) {
          registrations[r.event_id + "-" + (r.user_id ?? actor.id)] = r.status;
        }
        return json({
          events: ev.rows.map(publicEvent),
          users: us,
          attendance,
          checkIns,
          qrTickets,
          registrations,
          proposals: props.rows.map((r: Row) => ({
            id: Number(r.id),
            eventId: r.event_id ? Number(r.event_id) : null,
            title: r.title,
            summary: r.summary,
            budget: Number(r.budget),
            status: r.status,
            note: r.note,
            creatorName: r.creator_name,
            deciderName: r.decider_name,
            createdAt: new Date(r.created_at).getTime(),
          })),
          notifications: notifs.rows.map((r: Row) => ({
            id: Number(r.id),
            kind: r.kind,
            message: r.message,
            read: Boolean(r.read_at),
            createdAt: new Date(r.created_at).getTime(),
          })),
          serverNow: Date.now(),
        });
      }
      if (path === "events" && method === "POST") {
        manager(actor);
        const data = eventInput.parse(await body(request));
        const row = (
          await db.query(
            "INSERT INTO events(name,org,date,time,location,capacity,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
            [
              data.name,
              data.org,
              data.date,
              data.time,
              data.location,
              data.capacity,
              data.description,
              actor.id,
            ],
          )
        ).rows[0];
        return json(publicEvent(row), 201);
      }
      if (/^events\/\d+$/.test(path) && method === "PATCH") {
        manager(actor);
        const id = numeric(path.split("/")[1]);
        const data = z
          .object({ status: z.enum(["Mendatang", "Berlangsung", "Selesai"]) })
          .parse(await body(request));
        await db.transaction(async (sql) => {
          await eventForUpdate(sql, id);
          await sql.query("UPDATE events SET status=$1 WHERE id=$2", [
            data.status,
            id,
          ]);
          if (data.status !== "Berlangsung")
            await sql.query(
              "UPDATE qr_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE event_id=$1",
              [id],
            );
          await audit(sql, actor, "event_status:" + data.status, String(id));
        });
        return json({ ok: true });
      }
      if (/^events\/\d+\/qr$/.test(path) && method === "POST") {
        manager(actor);
        const id = numeric(path.split("/")[1]);
        const { minutes } = z
          .object({
            minutes: z.number().refine((v) => [5, 15, 30, 60].includes(v)),
          })
          .parse(await body(request));
        const ticket = await db.transaction(async (sql) => {
          const e = await eventForUpdate(sql, id);
          const ticket = issueTicket(
            publicEvent(e) as any,
            publicUser(actor),
            minutes,
          );
          await sql.query(
            "INSERT INTO qr_sessions(event_id,token,code,issued_by,issued_at,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT(event_id) DO UPDATE SET token=EXCLUDED.token,code=EXCLUDED.code,issued_by=EXCLUDED.issued_by,issued_at=EXCLUDED.issued_at,expires_at=EXCLUDED.expires_at,revoked_at=NULL",
            [
              id,
              ticket.token,
              ticket.code,
              actor.id,
              new Date(ticket.issuedAt),
              new Date(ticket.expiresAt),
            ],
          );
          await audit(sql, actor, "issue_qr", String(id));
          return ticket;
        });
        return json(ticket);
      }
      if (/^events\/\d+\/qr$/.test(path) && method === "DELETE") {
        manager(actor);
        const id = numeric(path.split("/")[1]);
        await db.transaction(async (sql) => {
          await eventForUpdate(sql, id);
          await sql.query(
            "UPDATE qr_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE event_id=$1",
            [id],
          );
          await audit(sql, actor, "close_qr", String(id));
        });
        return json({ ok: true });
      }
      if (/^events\/\d+\/checkin$/.test(path) && method === "POST") {
        if (actor.role !== "Anggota")
          fail(403, "Absensi mandiri hanya untuk Anggota.");
        const id = numeric(path.split("/")[1]);
        await limit("checkin:" + actor.id + ":" + id, 15, 60);
        const data = z
          .object({
            value: z.string().min(1).max(300),
            method: z.enum(["QR kamera", "QR gambar", "Kode"]),
          })
          .parse(await body(request));
        const record = await db.transaction(async (sql) => {
          const e = await eventForUpdate(sql, id);
          const q = (
            await sql.query("SELECT * FROM qr_sessions WHERE event_id=$1", [id])
          ).rows[0];
          const a = (
            await sql.query(
              "SELECT * FROM attendance WHERE event_id=$1 AND user_id=$2",
              [id, actor.id],
            )
          ).rows[0];
          let receipt;
          try {
            receipt = verifyCheckIn(
              data.value,
              publicEvent(e) as any,
              publicUser(actor),
              q ? publicTicket(q) : undefined,
              a?.status === "Hadir",
              data.method,
            );
          } catch (err) {
            fail(a?.status === "Hadir" ? 409 : 400, (err as Error).message);
          }
          await sql.query(
            "INSERT INTO attendance(event_id,user_id,status,checked_at,method,updated_by) VALUES($1,$2,'Hadir',$3,$4,$2) ON CONFLICT(event_id,user_id) DO UPDATE SET status='Hadir',checked_at=EXCLUDED.checked_at,method=EXCLUDED.method,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP",
            [id, actor.id, new Date(receipt!.checkedAt), data.method],
          );
          await audit(sql, actor, "checkin", String(id));
          return { ...receipt, ticketToken: "" };
        });
        return json(record, 201);
      }
      if (/^events\/\d+\/attendance\/\d+$/.test(path) && method === "PATCH") {
        manager(actor);
        const [, e, , u] = path.split("/");
        const id = numeric(e),
          uid = numeric(u);
        const data = z
          .object({ status: z.enum(["Hadir", "Izin", "Alpha"]) })
          .parse(await body(request));
        await db.transaction(async (sql) => {
          await eventForUpdate(sql, id);
          if (
            !(await sql.query("SELECT id FROM users WHERE id=$1", [uid]))
              .rows[0]
          )
            fail(404, "Peserta tidak ditemukan.");
          await sql.query(
            "INSERT INTO attendance(event_id,user_id,status,method,updated_by) VALUES($1,$2,$3,'Manual',$4) ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status,checked_at=NULL,method='Manual',updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP",
            [id, uid, data.status, actor.id],
          );
          await audit(
            sql,
            actor,
            "manual_attendance:" + data.status,
            id + ":" + uid,
          );
        });
        return json({ ok: true });
      }
      // ---------- RSVP / pendaftaran kegiatan ----------
      if (/^events\/\d+\/register$/.test(path) && method === "POST") {
        if (actor.role !== "Anggota")
          fail(403, "Pendaftaran hanya untuk akun Anggota.");
        const id = numeric(path.split("/")[1]);
        const result = await db.transaction(async (sql) => {
          const e = await eventForUpdate(sql, id);
          if (!["Mendatang", "Berlangsung"].includes(e.status))
            fail(400, "Kegiatan ini tidak dibuka untuk pendaftaran.");
          const used = Number(
            (
              await sql.query(
                "SELECT COUNT(*)::int AS n FROM registrations WHERE event_id=$1 AND status<>'batal'",
                [id],
              )
            ).rows[0].n,
          );
          if (used >= Number(e.capacity)) fail(409, "Kuota kegiatan sudah penuh.");
          await sql.query(
            "INSERT INTO registrations(event_id,user_id) VALUES($1,$2) ON CONFLICT(event_id,user_id) DO UPDATE SET status='terdaftar'",
            [id, actor.id],
          );
          await sql.query(
            "INSERT INTO notifications(user_id,event_id,kind,message) VALUES($1,$2,'konfirmasi',$3)",
            [actor.id, id, "Pendaftaran berhasil: " + e.name],
          );
          await audit(sql, actor, "rsvp", id + ":" + actor.id);
          return { ok: true };
        });
        return json(result, 201);
      }
      if (/^events\/\d+\/register$/.test(path) && method === "DELETE") {
        const id = numeric(path.split("/")[1]);
        await db.query(
          "UPDATE registrations SET status='batal' WHERE event_id=$1 AND user_id=$2",
          [id, actor.id],
        );
        await audit(db, actor, "rsvp_cancel", id + ":" + actor.id);
        return json({ ok: true });
      }

      // ---------- Proposal kegiatan ----------
      if (path === "proposals" && method === "POST") {
        manager(actor);
        const data = z
          .object({
            eventId: z.number().int().positive().nullable().optional(),
            title: z.string().trim().min(3).max(160),
            summary: z.string().trim().min(10, "Ringkasan minimal 10 karakter.").max(5000),
            budget: z.number().min(0).max(999999999).default(0),
          })
          .parse(await body(request));
        const row = (
          await db.query(
            "INSERT INTO proposals(event_id,title,summary,budget,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
            [data.eventId ?? null, data.title, data.summary, data.budget, actor.id],
          )
        ).rows[0];
        const pid = Number(row.id);
        const pembina = await db.query("SELECT id FROM users WHERE role='Pembina' AND status='aktif'");
        for (const p2 of pembina.rows) {
          await db.query(
            "INSERT INTO notifications(user_id,kind,message) VALUES($1,'proposal',$2)",
            [p2.id, "Proposal baru menunggu tinjauan: " + data.title],
          );
        }
        await audit(db, actor, "proposal_create", String(pid));
        return json({ ok: true, id: pid }, 201);
      }
      if (/^proposals\/\d+$/.test(path) && method === "DELETE") {
        const id = numeric(path.split("/")[1]);
        const row = (await db.query("SELECT * FROM proposals WHERE id=$1", [id])).rows[0];
        if (!row) fail(404, "Proposal tidak ditemukan.");
        if (Number(row.created_by) !== Number(actor.id) && actor.role !== "Admin")
          fail(403, "Anda tidak dapat menghapus proposal ini.");
        if (row.status === "disetujui" && actor.role !== "Admin")
          fail(403, "Proposal yang sudah disetujui tidak dapat dihapus.");
        await db.query("DELETE FROM proposals WHERE id=$1", [id]);
        await audit(db, actor, "proposal_delete", String(id));
        return json({ ok: true });
      }
      if (/^proposals\/\d+\/decide$/.test(path) && method === "POST") {
        if (!["Pembina", "Admin"].includes(actor.role))
          fail(403, "Hanya Pembina yang dapat memutuskan proposal.");
        const id = numeric(path.split("/")[1]);
        const data = z
          .object({
            status: z.enum(["disetujui", "ditolak", "revisi"]),
            note: z.string().trim().max(2000).optional(),
          })
          .parse(await body(request));
        const result = await db.transaction(async (sql) => {
          const p2 = (
            await sql.query("SELECT * FROM proposals WHERE id=$1 FOR UPDATE", [id])
          ).rows[0];
          if (!p2) fail(404, "Proposal tidak ditemukan.");
          await sql.query(
            "UPDATE proposals SET status=$1,note=$2,decided_by=$3,decided_at=CURRENT_TIMESTAMP WHERE id=$4",
            [data.status, data.note ?? null, actor.id, id],
          );
          const label =
            data.status === "disetujui" ? "disetujui" : data.status === "ditolak" ? "ditolak" : "perlu revisi";
          await sql.query(
            "INSERT INTO notifications(user_id,kind,message) VALUES($1,'proposal',$2)",
            [p2.created_by, "Proposal \"" + p2.title + "\" " + label + "."],
          );
          await audit(sql, actor, "proposal_decide:" + data.status, String(id));
          return { ok: true };
        });
        return json(result);
      }

      // ---------- Notifikasi ----------
      if (path === "notifications/read" && method === "POST") {
        const data = z
          .object({ id: z.number().int().positive().optional() })
          .parse(await body(request));
        if (data.id)
          await db.query(
            "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2",
            [data.id, actor.id],
          );
        else
          await db.query(
            "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND read_at IS NULL",
            [actor.id],
          );
        return json({ ok: true });
      }

      // ---------- Audit log (Admin) ----------
      if (path === "audit" && method === "GET") {
        admin(actor);
        const limitParam = Number(url.searchParams.get("limit") || 100);
        const rows = await db.query(
          "SELECT a.id,a.action,a.target,a.detail,a.created_at,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT $1",
          [Math.min(500, Math.max(1, limitParam))],
        );
        return json({
          entries: rows.rows.map((r: Row) => ({
            id: Number(r.id),
            action: r.action,
            target: r.target,
            detail: r.detail,
            actor: r.actor || "Sistem",
            createdAt: new Date(r.created_at).getTime(),
          })),
        });
      }

      // ---------- Berkas proposal ----------
      if (/^proposals\/\d+\/file$/.test(path) && method === "POST") {
        manager(actor);
        const id = numeric(path.split("/")[1]);
        const data = z
          .object({
            filename: z.string().trim().min(1).max(160),
            mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
            data: z.string().min(10).max(6_000_000),
          })
          .parse(await body(request));
        const size = Math.floor((data.data.length * 3) / 4);
        if (size > 4 * 1024 * 1024) fail(413, "Berkas maksimal 4 MB.");
        const prop = (await db.query("SELECT * FROM proposals WHERE id=$1", [id])).rows[0];
        if (!prop) fail(404, "Proposal tidak ditemukan.");
        if (Number(prop.created_by) !== Number(actor.id) && actor.role !== "Admin")
          fail(403, "Hanya pengaju atau Admin yang dapat melampirkan berkas.");
        await db.query(
          "INSERT INTO proposal_files(proposal_id,filename,mime,size,data) VALUES($1,$2,$3,$4,$5)",
          [id, data.filename, data.mime, size, data.data],
        );
        await audit(db, actor, "proposal_file", String(id));
        return json({ ok: true }, 201);
      }
      if (/^proposals\/\d+\/file$/.test(path) && method === "GET") {
        const id = numeric(path.split("/")[1]);
        const f = (
          await db.query(
            "SELECT * FROM proposal_files WHERE proposal_id=$1 ORDER BY id DESC LIMIT 1",
            [id],
          )
        ).rows[0];
        if (!f) fail(404, "Berkas tidak ditemukan.");
        return new Response(Buffer.from(f.data, "base64"), {
          status: 200,
          headers: {
            "Content-Type": f.mime,
            "Content-Disposition": `inline; filename="${f.filename.replace(/"/g, "")}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      return json({ error: "Endpoint tidak ditemukan." }, 404);
    } catch (e) {
      if (e instanceof HTTPError) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError)
        return json(
          { error: e.issues[0]?.message || "Data tidak valid." },
          400,
        );
      if ((e as any)?.code === "23505")
        return json(
          { error: "Email sudah terdaftar atau data sudah ada." },
          409,
        );
      if (e instanceof Error && /Ubah status kegiatan/.test(e.message))
        return json({ error: e.message }, 400);
      console.error("SIMORA request failed", {
        code: (e as any)?.code || "INTERNAL",
      });
      return json(
        {
          error:
            "Layanan tidak tersedia. Periksa koneksi database atau hubungi Admin.",
        },
        503,
      );
    }
  }
  return { handle };
}
