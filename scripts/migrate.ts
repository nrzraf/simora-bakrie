import { readFile } from "node:fs/promises";
import { database, closeDatabase } from "../server/db.ts";
try {
  await database.query(
    await readFile(
      new URL("../database/001_schema.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Migrasi database selesai.");
} finally {
  await closeDatabase();
}
