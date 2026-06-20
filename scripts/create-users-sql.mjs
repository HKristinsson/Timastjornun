// Stofnar Supabase Auth notendur beint í gagnagrunni (email/password, staðfest).
// Tengjast sjálfkrafa seed-notendum (trigger on_auth_user_created).
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/create-users-sql.mjs
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
if (!url) {
  console.error("Vantar SETUP_DATABASE_URL.");
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD ?? "Verktak2026!";
const users = [
  "admin@verktak.is",
  "jon@verktak.is",
  "anna@verktak.is",
  "pall@verktak.is",
  "laun@verktak.is",
];

const stmt = `
with ins_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', $1::text, crypt($2::text, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  where not exists (select 1 from auth.users where email = $1::text)
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from ins_user
returning user_id;
`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  for (const email of users) {
    const res = await client.query(stmt, [email, PASSWORD]);
    console.log(res.rowCount > 0 ? `✅ Stofnaður: ${email}` : `• Til fyrir: ${email}`);
  }
  console.log(`\nLykilorð allra: ${PASSWORD}  (breyttu því í Supabase eftir prófun)`);
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
