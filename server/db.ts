import { Pool } from "pg";
import type { Database, SQL } from "./types.ts";
const shared = globalThis as unknown as { simoraPool?: Pool };
function pool() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL belum dikonfigurasi.");
  if (!shared.simoraPool)
    shared.simoraPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
    });
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
