// Keyrir SQL-skrá og prentar niðurstöður allra select-fyrirspurna.
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
const file = process.argv[2];
if (!url || !file) { console.error("Notkun: SETUP_DATABASE_URL=... node query-sql.mjs <skrá.sql>"); process.exit(1); }

const sql = readFileSync(path.resolve(file), "utf8").replace(/﻿/g, "");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const res = await client.query(sql);
  const results = Array.isArray(res) ? res : [res];
  for (const r of results) {
    if (!r.rows || r.rows.length === 0) continue;
    console.log("---");
    for (const row of r.rows) console.log(JSON.stringify(row));
  }
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally { await client.end(); }
