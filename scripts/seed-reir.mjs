// Stofnar félagið Reir (lén reir.is) með hilmar@reir.is sem admin + super_admin.
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/seed-reir.mjs
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
if (!url) { console.error("Vantar SETUP_DATABASE_URL."); process.exit(1); }

const EMAIL = "hilmar@reir.is";
const PASSWORD = process.env.SEED_REIR_PASSWORD ?? "Verktak2026!";

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  // 1) Félag
  const { rows: comp } = await client.query(`
    insert into companies (name, domain, status)
    values ('Reir', 'reir.is', 'active')
    on conflict ((lower(domain))) do update set name = companies.name
    returning id
  `);
  const tenantId = comp[0].id;
  console.log(`✅ Félag Reir (${tenantId}), lén reir.is`);

  // 2) Auth-notandi
  await client.query(`
    with ins_user as (
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change, email_change_token_new
      )
      select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        'authenticated', 'authenticated', $1::text, crypt($2::text, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
      where not exists (select 1 from auth.users where email = $1::text)
      returning id, email
    )
    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), id, id::text,
      jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
    from ins_user
  `, [EMAIL, PASSWORD]);

  // 3) Kerfis-notandi í Reir + hlutverk admin + super_admin
  await client.query(`
    insert into public.users (tenant_id, auth_user_id, email, status)
    select $2::uuid, au.id, $1::citext, 'active'
    from auth.users au
    where au.email = $1::text
      and not exists (select 1 from public.users where email = $1::citext)
  `, [EMAIL, tenantId]);
  await client.query(`
    insert into user_roles (user_id, role_id)
    select u.id, r.id from public.users u, roles r
    where u.email = $1::citext and r.name in ('admin','super_admin')
    on conflict do nothing
  `, [EMAIL]);

  const { rows: chk } = await client.query(`
    select string_agg(r.name, ', ') as roles from public.users u
    join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id
    where u.email = $1::citext
  `, [EMAIL]);
  console.log(`✅ ${EMAIL} — hlutverk: ${chk[0].roles} (lykilorð: ${PASSWORD} — BREYTTU ÞVÍ)`);
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
