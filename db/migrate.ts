import "dotenv/config";
import { Pool } from "pg";
import * as fs from "fs/promises";
import * as path from "path";

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const migrationPath = path.join(__dirname, "migrations", "001_init.sql");
    const sql = await fs.readFile(migrationPath, "utf-8");

    console.log("[DB] Running migrations…");
    await pool.query(sql);
    console.log("[DB] Migrations complete ✓");
  } catch (err) {
    console.error("[DB] Migration failed:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
