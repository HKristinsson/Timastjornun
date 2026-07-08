// Seedar póstgáttina: EINN hóps-2 prófunarnotandi + eitt sýnisskeyti (merkt test).
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/seed-mail.mjs
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
if (!url) { console.error("Vantar SETUP_DATABASE_URL."); process.exit(1); }

const EMAIL = process.env.SEED_MAIL_EMAIL ?? "worker.test@reir.is";
const PASSWORD = process.env.SEED_MAIL_PASSWORD ?? "Verktak2026!";
const TENANT = "11111111-1111-1111-1111-111111111111"; // seed-fyrirtækið

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  // 1) Auth-notandi (ef ekki til) — sama mynstur og create-users-sql.mjs
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

  // 2) Kerfis-notandi + tenging við auth + employee-hlutverk
  await client.query(`
    insert into public.users (tenant_id, auth_user_id, email, status)
    select $2::uuid, au.id, $1::citext, 'active'
    from auth.users au
    where au.email = $1::text
      and not exists (select 1 from public.users where email = $1::citext)
  `, [EMAIL, TENANT]);
  await client.query(`
    update public.users u set auth_user_id = au.id
    from auth.users au
    where u.email = $1::citext and au.email = $1::text and u.auth_user_id is null
  `, [EMAIL]);
  await client.query(`
    insert into user_roles (user_id, role_id)
    select u.id, r.id from public.users u, roles r
    where u.email = $1::citext and r.name = 'employee'
    on conflict do nothing
  `, [EMAIL]);

  // 3) Hóps-2 móttakandi
  await client.query(`
    insert into group2_recipients (tenant_id, email, user_id, active)
    select $2::uuid, $1::citext, u.id, true
    from public.users u where u.email = $1::citext
    on conflict (email) do update set active = true
  `, [EMAIL, TENANT]);

  // 4) Sýnisskeyti (merkt PRÓFUNARGÖGN) — aðeins ef ekkert test-skeyti er til
  const { rows } = await client.query(
    `select count(*)::int as n from inbound_emails where recipient_email = $1::citext and is_test`,
    [EMAIL]
  );
  if (rows[0].n === 0) {
    await client.query(`
      select app.mail_save_inbound(
        $1::text, 'sendandi@daemi.is', 'Prófunar Sendandi',
        'Velkomin í Reir póstgáttina (prófun)',
        'Þetta er sýnisskeyti svo hægt sé að prófa innhólf, lestur og svar án Mailgun-tengingar.',
        null, null, true)
    `, [EMAIL]);
  }

  console.log(`✅ Seed klárt: ${EMAIL} (lykilorð: ${PASSWORD}) + 1 sýnisskeyti (test)`);
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
