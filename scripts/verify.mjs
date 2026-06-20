// Staðfestir uppsetningu: notendatenging, hlutverk, gögn.
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/verify.mjs
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
if (!url) { console.error("Vantar SETUP_DATABASE_URL."); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  const linked = await client.query(`
    select u.email, (u.auth_user_id is not null) as tengdur,
           coalesce(string_agg(r.name, ', '), '—') as hlutverk
    from public.users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    group by u.email, u.auth_user_id
    order by u.email
  `);
  console.log("Notendur (tenging við Auth + hlutverk):");
  for (const r of linked.rows) {
    console.log(`  ${r.tengdur ? "✅" : "❌"} ${r.email.padEnd(22)} ${r.hlutverk}`);
  }

  const fns = await client.query(`
    select count(*) as public_rpc from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('check_in','check_out','create_project','log_location','my_roles')
  `);
  console.log(`\nPublic RPC-vörpur til staðar: ${fns.rows[0].public_rpc}/5`);
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
