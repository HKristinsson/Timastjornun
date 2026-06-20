// Keyrir tiltekna SQL-skrá gegn Supabase.
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/run-sql.mjs <skrá.sql>
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
const file = process.argv[2];
if (!url || !file) {
  console.error("Notkun: SETUP_DATABASE_URL=... node run-sql.mjs <skrá.sql>");
  process.exit(1);
}

const sql = readFileSync(path.resolve(file), "utf8").replace(/﻿/g, "");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`✅ Tengdur. Keyri ${path.basename(file)} ...`);
  await client.query(sql);
  console.log("✅ Keyrt.");
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
