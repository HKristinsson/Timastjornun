// Keyrir supabase/setup_all.sql gegn Supabase Postgres.
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/db-setup.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
if (!url) {
  console.error("Vantar SETUP_DATABASE_URL umhverfisbreytu.");
  process.exit(1);
}

const sqlPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/setup_all.sql"
);
// Fjarlægja BOM-tákn (U+FEFF) sem geta slæðst með úr PowerShell-genereruðu skránni
const sql = readFileSync(sqlPath, "utf8").replace(/﻿/g, "");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("✅ Tengdur við gagnagrunn. Keyri setup_all.sql ...");
  // Allt í einni færslu (atomic): mistakist eitthvað er öllu rúllað til baka.
  await client.query(sql);
  console.log("✅ Skema, föll, RLS og prufugögn keyrð.");

  const { rows } = await client.query(`
    select
      (select count(*) from companies)  as fyrirtaeki,
      (select count(*) from projects)   as verkefni,
      (select count(*) from employees)  as starfsmenn,
      (select count(*) from roles)      as hlutverk,
      (select count(*) from project_locations) as svaedi
  `);
  console.log("Staðfesting:", rows[0]);
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
