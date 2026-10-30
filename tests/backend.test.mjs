import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createService } from "../server/service.ts";
import { hashPassword } from "../server/security.ts";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { PNG } = createRequire(require.resolve("qrcode"))("pngjs");
const origin = "https://simora.test";
process.env.APP_URL = origin;
test("SQL-backed API integration with independent user sessions", async (t) => {
  const pg = new PGlite();
  await pg.exec(
    await readFile(
      new URL("../database/001_schema.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = {
    query: (q, p) => pg.query(q, p),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: (q, p) => tx.query(q, p) })),
  };
  const service = createService(db);
  async function req(
    path,
    method = "GET",
    data,
    cookie = "",
    requestOrigin = origin,
  ) {
    const response = await service.handle(
      new Request(origin + "/api/" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: requestOrigin,
          Cookie: cookie,
          ...(method === "GET"
            ? {}
            : { "x-vercel-forwarded-for": "test-client" }),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
    );
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  const pwd = "OnlyForTests-12345";
  await pg.query(
    "INSERT INTO users(name,email,password_hash,org,role) VALUES('Admin','admin@test.local',$1,'HIMSI','Admin')",
    [await hashPassword(pwd)],
  );
  let admin, pengurus, member, member2, eventId, ticket;
  await t.test("requires session and same-origin mutation", async () => {
    assert.equal((await req("state")).status, 401);
    assert.equal(
      (await req("auth/register", "POST", {}, "", "https://evil.test")).status,
      403,
    );
  });
  await t.test(
    "registration cannot elevate role and duplicate email is rejected",
    async () => {
      const data = {
        name: "Member",
        email: "member@test.local",
        password: pwd,
        org: "HIMSI",
        role: "Admin",
        nim: "1202000001",
        phone: "081200000001",
      };
      assert.equal((await req("auth/register", "POST", data)).status, 201);
      assert.equal((await req("auth/register", "POST", data)).status, 409);
      assert.equal(
        (await pg.query("SELECT role FROM users WHERE email=$1", [data.email]))
          .rows[0].role,
        "Anggota",
      );
      assert.equal(
        (
          await req("auth/register", "POST", {
            ...data,
            email: "member2@test.local",
            name: "Member 2",
            nim: "1202000002",
            phone: "081200000002",
          })
        ).status,
        201,
      );
    },
  );
  await t.test(
    "login validates password and role and creates HttpOnly sessions",
    async () => {
      assert.equal(
        (
          await req("auth/login", "POST", {
            email: "member@test.local",
            password: pwd,
            role: "Admin",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await req("auth/login", "POST", {
            email: "member@test.local",
            password: "wrong-password",
            role: "Anggota",
          })
        ).status,
        401,
      );
      admin = await req("auth/login", "POST", {
        email: "admin@test.local",
        password: pwd,
        role: "Admin",
      });
      member = await req("auth/login", "POST", {
        email: "member@test.local",
        password: pwd,
        role: "Anggota",
      });
      member2 = await req("auth/login", "POST", {
        email: "member2@test.local",
        password: pwd,
        role: "Anggota",
      });
      assert.equal(admin.status, 200);
      assert.ok(member.cookie);
      assert.equal(member.body.accounts.length, 1);
    },
  );
  await t.test(
    "only Admin creates Pengurus; submitted role is ignored",
    async () => {
      const data = {
        name: "Pengurus",
        email: "pengurus@test.local",
        password: pwd,
        org: "BEM",
        role: "Pengurus",
      };
      assert.equal(
        (await req("users", "POST", data, member.cookie)).status,
        403,
      );
      const created = await req("users", "POST", data, admin.cookie);
      assert.equal(created.status, 201);
      assert.equal(created.body.role, "Pengurus");
      pengurus = await req("auth/login", "POST", {
        email: data.email,
        password: pwd,
        role: "Pengurus",
      });
      assert.equal(
        (
          await req(
            "users",
            "POST",
            { ...data, email: "other@test.local" },
            pengurus.cookie,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "event input validated and only managers can create or issue QR",
    async () => {
      const data = {
        name: "Workshop",
        org: "HIMSI",
        date: "2026-10-30",
        time: "09:00",
        location: "Auditorium",
        capacity: 50,
        description: "SQL test workshop",
      };
      assert.equal(
        (await req("events", "POST", data, member.cookie)).status,
        403,
      );
      assert.equal(
        (
          await req(
            "events",
            "POST",
            { ...data, date: "2026-02-31" },
            admin.cookie,
          )
        ).status,
        400,
      );
      const created = await req("events", "POST", data, pengurus.cookie);
      assert.equal(created.status, 201);
      eventId = created.body.id;
      assert.equal(
        (
          await req(
            `events/${eventId}/qr`,
            "POST",
            { minutes: 15 },
            admin.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            `events/${eventId}`,
            "PATCH",
            { status: "Berlangsung" },
            pengurus.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await req(
            `events/${eventId}/qr`,
            "POST",
            { minutes: 15 },
            member.cookie,
          )
        ).status,
        403,
      );
      const r = await req(
        `events/${eventId}/qr`,
        "POST",
        { minutes: 15 },
        pengurus.cookie,
      );
      assert.equal(r.status, 200);
      ticket = r.body;
    },
  );
  await t.test(
    "member state does not expose QR secret or other user data",
    async () => {
      const state = await req("state", "GET", undefined, member.cookie);
      assert.equal(state.status, 200);
      assert.equal(state.body.users.length, 1);
      assert.equal(state.body.qrTickets[eventId].token, "");
      assert.equal(state.body.qrTickets[eventId].code, "");
      assert.ok(!JSON.stringify(state.body).includes("password_hash"));
    },
  );
  await t.test(
    "PNG scanned on separate member session writes shared SQL record",
    async () => {
      const value = `SIMORA:1:${eventId}:${ticket.token}`;
      const png = PNG.sync.read(
        await QRCode.toBuffer(value, { width: 500, margin: 4 }),
      );
      const decoded = jsQR(
        new Uint8ClampedArray(png.data),
        png.width,
        png.height,
      );
      assert.equal(decoded.data, value);
      const r = await req(
        `events/${eventId}/checkin`,
        "POST",
        { value: decoded.data, method: "QR gambar", userId: 1 },
        member.cookie,
      );
      assert.equal(r.status, 201);
      assert.equal(r.body.userId, member.body.user.id);
      const state = (await req("state", "GET", undefined, admin.cookie)).body;
      assert.equal(
        state.attendance[eventId + "-" + member.body.user.id],
        "Hadir",
      );
      assert.equal(
        state.checkIns[eventId + "-" + member.body.user.id].method,
        "QR gambar",
      );
      const second = (await req("state", "GET", undefined, member2.cookie))
        .body;
      assert.deepEqual(second.attendance, {});
    },
  );
  await t.test(
    "duplicate/concurrent check-ins cannot create additional rows",
    async () => {
      assert.equal(
        (
          await req(
            `events/${eventId}/checkin`,
            "POST",
            { value: ticket.code, method: "Kode" },
            member.cookie,
          )
        ).status,
        409,
      );
      const responses = await Promise.all([
        req(
          `events/${eventId}/checkin`,
          "POST",
          { value: ticket.code, method: "Kode" },
          member2.cookie,
        ),
        req(
          `events/${eventId}/checkin`,
          "POST",
          { value: ticket.code, method: "Kode" },
          member2.cookie,
        ),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        Number(
          (
            await pg.query(
              "SELECT count(*) AS n FROM attendance WHERE event_id=$1",
              [eventId],
            )
          ).rows[0].n,
        ),
        2,
      );
    },
  );
  await t.test(
    "manual correction, rotated, revoked, expired and wrong-event QR",
    async () => {
      const endpoint = `events/${eventId}/attendance/${member.body.user.id}`;
      assert.equal(
        (await req(endpoint, "PATCH", { status: "Alpha" }, member.cookie))
          .status,
        403,
      );
      assert.equal(
        (await req(endpoint, "PATCH", { status: "Alpha" }, admin.cookie))
          .status,
        200,
      );
      const old = ticket;
      ticket = (
        await req(`events/${eventId}/qr`, "POST", { minutes: 5 }, admin.cookie)
      ).body;
      assert.equal(
        (
          await req(
            `events/${eventId}/checkin`,
            "POST",
            { value: `SIMORA:1:${eventId}:${old.token}`, method: "QR kamera" },
            member.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            `events/${eventId}/checkin`,
            "POST",
            { value: `SIMORA:1:999:${ticket.token}`, method: "QR kamera" },
            member.cookie,
          )
        ).status,
        400,
      );
      await req(`events/${eventId}/qr`, "DELETE", undefined, pengurus.cookie);
      assert.equal(
        (
          await req(
            `events/${eventId}/checkin`,
            "POST",
            { value: ticket.code, method: "Kode" },
            member.cookie,
          )
        ).status,
        400,
      );
      ticket = (
        await req(`events/${eventId}/qr`, "POST", { minutes: 5 }, admin.cookie)
      ).body;
      await pg.query(
        "UPDATE qr_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE event_id=$1",
        [eventId],
      );
      assert.equal(
        (
          await req(
            `events/${eventId}/checkin`,
            "POST",
            { value: ticket.code, method: "Kode" },
            member.cookie,
          )
        ).status,
        400,
      );
    },
  );
  await t.test(
    "role changes revoke sessions; logout invalidates server session",
    async () => {
      assert.equal(
        (
          await req(
            "users/" + member.body.user.id,
            "PATCH",
            { role: "Admin" },
            admin.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            "users/" + member.body.user.id,
            "PATCH",
            { role: "Pengurus" },
            admin.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await req("state", "GET", undefined, member.cookie)).status,
        401,
      );
      assert.equal(
        (await req("auth/logout", "POST", {}, admin.cookie)).status,
        200,
      );
      assert.equal(
        (await req("state", "GET", undefined, admin.cookie)).status,
        401,
      );
    },
  );
  await t.test(
    "RSVP enforces capacity and blocks duplicate registration",
    async () => {
      admin = await req("auth/login", "POST", { email: "admin@test.local", password: pwd, role: "Admin" });
      assert.equal(admin.status, 200);
      for (const [mail, nm, nim] of [["rsvp1@test.local","RSVP Satu","1202000011"],["rsvp2@test.local","RSVP Dua","1202000012"]]) {
        await req("auth/register", "POST", { name: nm, email: mail, password: pwd, nim, phone: "081200000011" });
      }
      member = await req("auth/login", "POST", { email: "rsvp1@test.local", password: pwd, role: "Anggota" });
      member2 = await req("auth/login", "POST", { email: "rsvp2@test.local", password: pwd, role: "Anggota" });
      assert.equal(member.status, 200);
      assert.equal(member2.status, 200);
      const small = await req(
        "events",
        "POST",
        {
          name: "Kegiatan Kuota Satu",
          org: "HIMSI",
          date: "2026-08-01",
          time: "09:00",
          location: "Aula",
          capacity: 1,
          description: "Uji kuota",
        },
        admin.cookie,
      );
      assert.equal(small.status, 201);
      const id = small.body.id;
      assert.equal(
        (await req("events/" + id + "/register", "POST", {}, member.cookie)).status,
        201,
      );
      assert.equal(
        (await req("events/" + id + "/register", "POST", {}, member2.cookie)).status,
        409,
      );
      assert.equal(
        (await req("events/" + id + "/register", "POST", {}, admin.cookie)).status,
        403,
      );
    },
  );

  await t.test(
    "proposal flow: Pengurus submits, Pembina decides, member cannot",
    async () => {
      pengurus = await req("auth/login", "POST", { email: "pengurus@test.local", password: pwd, role: "Pengurus" });
      assert.equal(pengurus.status, 200);
      member = await req("auth/login", "POST", { email: "rsvp1@test.local", password: pwd, role: "Anggota" });
      const pembinaRow = (
        await pg.query(
          "INSERT INTO users(name,email,password_hash,org,role) VALUES('Pembina','pembina@test.local',$1,'HIMSI','Pembina') RETURNING id",
          [await hashPassword(pwd)],
        )
      ).rows[0];
      const pembina = await req("auth/login", "POST", {
        email: "pembina@test.local",
        password: pwd,
        role: "Pembina",
      });
      assert.equal(pembina.status, 200);
      const created = await req(
        "proposals",
        "POST",
        { title: "Proposal Uji", summary: "Ringkasan proposal pengujian.", budget: 150000 },
        pengurus.cookie,
      );
      assert.equal(created.status, 201);
      assert.equal(
        (await req("proposals", "POST", { title: "X", summary: "Ringkasan cukup panjang." }, member.cookie)).status,
        403,
      );
      const decided = await req(
        "proposals/" + created.body.id + "/decide",
        "POST",
        { status: "disetujui", note: "Disetujui untuk dilanjutkan." },
        pembina.cookie,
      );
      assert.equal(decided.status, 200);
      assert.equal(
        (
          await req(
            "proposals/" + created.body.id + "/decide",
            "POST",
            { status: "disetujui" },
            member.cookie,
          )
        ).status,
        403,
      );
      const state = await req("state", "GET", undefined, pengurus.cookie);
      const found = state.body.proposals.find((p) => p.id === created.body.id);
      assert.equal(found.status, "disetujui");
      assert.equal(found.deciderName, "Pembina");
      const note = state.body.notifications.find((n) => n.kind === "proposal");
      assert.ok(note, "pengaju menerima notifikasi keputusan");
    },
  );

  await t.test(
    "Admin can create Pembina and delete non-admin accounts only",
    async () => {
      admin = await req("auth/login", "POST", { email: "admin@test.local", password: pwd, role: "Admin" });
      member = await req("auth/login", "POST", { email: "rsvp1@test.local", password: pwd, role: "Anggota" });
      const made = await req(
        "users",
        "POST",
        {
          name: "Pembina Baru",
          email: "pembina2@test.local",
          password: pwd,
          role: "Pembina",
        },
        admin.cookie,
      );
      assert.equal(made.status, 201);
      assert.equal(made.body.role, "Pembina");
      assert.equal(
        (await req("users/" + made.body.id, "DELETE", undefined, member.cookie)).status,
        403,
      );
      assert.equal(
        (await req("users/" + made.body.id, "DELETE", undefined, admin.cookie)).status,
        200,
      );
      const adminId = (await pg.query("SELECT id FROM users WHERE email='admin@test.local'")).rows[0].id;
      assert.equal(
        (await req("users/" + adminId, "DELETE", undefined, admin.cookie)).status,
        403,
      );
    },
  );

  await t.test(
    "deactivated account cannot log in; profile email must stay unique",
    async () => {
      admin = await req("auth/login", "POST", { email: "admin@test.local", password: pwd, role: "Admin" });
      member = await req("auth/login", "POST", { email: "rsvp1@test.local", password: pwd, role: "Anggota" });
      const target = (await pg.query("SELECT id FROM users WHERE email='rsvp2@test.local'")).rows[0];
      await req("users/" + target.id, "PATCH", { status: "nonaktif" }, admin.cookie);
      assert.equal(
        (
          await req("auth/login", "POST", {
            email: "rsvp2@test.local",
            password: pwd,
            role: "Anggota",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            "auth/profile",
            "PATCH",
            { name: "Member", email: "admin@test.local" },
            member.cookie,
          )
        ).status,
        409,
      );
    },
  );

  await t.test("rate limiting is persisted in SQL", async () => {
    let last;
    for (let i = 0; i < 17; i++)
      last = await req("auth/login", "POST", {
        email: "unknown@test.local",
        password: "no-valid-password",
        role: "Anggota",
      });
    assert.equal(last.status, 429);
  });
  await pg.close();
});
