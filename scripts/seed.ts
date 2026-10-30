import { database, closeDatabase } from "../server/db.ts";
import { sampleEvents } from "./seed-events.ts";
try {
  await database.transaction(async (sql) => {
    const n = (await sql.query("SELECT count(*) AS count FROM events")).rows[0]
      .count;
    if (Number(n) > 0) {
      console.log("Seed dilewati: kegiatan sudah ada.");
      return;
    }
    for (const e of sampleEvents)
      await sql.query(
        "INSERT INTO events(name,org,date,time,location,status,capacity,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          e.name,
          e.org,
          e.date,
          e.time,
          e.location,
          e.status,
          e.capacity,
          e.description,
        ],
      );
    console.log(
      "Kegiatan contoh berhasil dibuat; tidak ada akun contoh yang dibuat.",
    );
  });
} finally {
  await closeDatabase();
}
