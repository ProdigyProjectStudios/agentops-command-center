import { PGlite } from "@electric-sql/pglite";
import type { SqlPool, SqlClient } from "../../lib/proof-store";

/** Real embedded PostgreSQL for hermetic tests; production uses the pg pool. */
export async function proofTestDatabase(path?: string) {
  const pg = new PGlite(path);
  await pg.waitReady;
  let tail = Promise.resolve();
  async function lock() {
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    return release;
  }
  const raw: SqlClient = {
    query: async (sql, params) => {
      if (!params && sql.includes(";")) {
        await pg.exec(sql);
        return { rows: [] };
      }
      return pg.query(sql, params);
    },
  };
  const pool: SqlPool = {
    query: async (sql, params) => {
      const release = await lock();
      try {
        return await raw.query(sql, params);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await lock();
      return { query: raw.query, release };
    },
  };
  return { pool, close: () => pg.close() };
}
