import { database, closeDatabase } from "../server/db.ts";
import { hashPassword } from "../server/security.ts";
import { z } from "zod";
const input = z
  .object({
    ADMIN_NAME: z.string().trim().min(1).max(60),
    ADMIN_EMAIL: z.string().email().max(100),
    ADMIN_PASSWORD: z.string().min(12).max(128),
  })
  .safeParse(process.env);
if (!input.success) {
  console.error(
    "Isi ADMIN_NAME, ADMIN_EMAIL dan ADMIN_PASSWORD minimal 12 karakter melalui environment.",
  );
  process.exitCode = 1;
} else {
  try {
    const d = input.data;
    await database.query(
      "INSERT INTO users(name,email,password_hash,org,role) VALUES($1,$2,$3,'HIMSI','Admin')",
      [
        d.ADMIN_NAME,
        d.ADMIN_EMAIL.toLowerCase(),
        await hashPassword(d.ADMIN_PASSWORD),
      ],
    );
    console.log(
      "Akun Admin berhasil dibuat. Hapus ADMIN_PASSWORD dari environment setelah selesai.",
    );
  } catch (e) {
    console.error(
      "Admin tidak dibuat. Pastikan migrasi selesai dan email belum terdaftar.",
    );
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
