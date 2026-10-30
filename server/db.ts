import { Pool } from "pg";
import type { Database, SQL } from "./types.ts";
const shared = globalThis as unknown as { simoraPool?: Pool };
function pool() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL belum dikonfigurasi.");
  if (!shared.simoraPool) {
    shared.simoraPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // transaction pooler (port 6543) menangani ratusan klien,
      // berbeda dengan session pooler yang dibatasi 15 koneksi.
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      // schema aplikasi; wajib diset per koneksi karena pooler
      // tidak mewarisi options=-c search_path.
      options: "-c search_path=simora,public",
    });
  }
  return shared.simoraPool;
}
export const database: Database = {
  query: async (text, params) => pool().query(text, params),
  transaction: async (fn) => {
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client as SQL);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
export async function closeDatabase() {
  await shared.simoraPool?.end();
  delete shared.simoraPool;
}
