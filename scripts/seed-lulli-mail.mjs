// Prófunargögn fyrir lulli@reir.is: innhólf, úthólf og tilkynning.
// Notkun:  SETUP_DATABASE_URL="postgresql://..." node scripts/seed-lulli-mail.mjs
import pg from "pg";

const url = process.env.SETUP_DATABASE_URL;
if (!url) { console.error("Vantar SETUP_DATABASE_URL."); process.exit(1); }

const EMAIL = "lulli@reir.is";
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  const { rows: [u] } = await client.query(
    `select u.id, u.tenant_id from users u where u.email = $1::citext`, [EMAIL]);
  if (!u) throw new Error(`${EMAIL} fannst ekki`);

  // Lykilorð endurstillt svo prófun sé fyrirsjáanleg
  await client.query(`
    update auth.users set encrypted_password = crypt('Verktak2026!', gen_salt('bf')),
      confirmation_token = coalesce(confirmation_token,''), recovery_token = coalesce(recovery_token,''),
      email_change = coalesce(email_change,''), email_change_token_new = coalesce(email_change_token_new,''),
      updated_at = now()
    where email = $1`, [EMAIL]);
  console.log(`✅ Lykilorð ${EMAIL} = Verktak2026!`);

  // INNHÓLF: 5 sýnisskeyti á mismunandi dögum (merkt test)
  const inbound = [
    ["byggir@dæmi.is", "Byggir ehf.", "Tilboð í efniskaup", "Sæll Lúlli,\n\nMeðfylgjandi er tilboð í efnið sem þú baðst um. Gildir í 14 daga.\n\nKv. Byggir", 0],
    ["anna@verktak.is", "Anna Aradóttir", "Vaktaplan næstu viku", "Hæ,\n\nVaktaplanið fyrir næstu viku er komið. Þú ert á morgunvöktum mán-mið.\n\nAnna", 1],
    ["birgir@dæmi.is", "Birgir verkstjóri", "Munið öryggisbúnaðinn", "Minni alla á að hjálmar og vesti eru skylda á svæðinu frá og með mánudegi.", 2],
    ["pantanir@dæmi.is", "Pöntunarkerfið", "Pöntun #4521 staðfest", "Pöntun þín á 40 einingum hefur verið staðfest. Afhending á fimmtudag.", 4],
    ["hilmar@reir.is", "Hilmar Þór", "Velkominn í póstkerfið", "Sæll Lúlli,\n\nÞetta er nýja póstkerfið okkar — hér tekur þú við pósti, svarar og áframsendir beint úr appinu.\n\nHilmar", 6],
  ];
  let n = 0;
  for (const [sender, name, subject, body, daysAgo] of inbound) {
    const { rowCount } = await client.query(
      `select 1 from inbound_emails where recipient_user_id = $1 and subject = $2`, [u.id, subject]);
    if (rowCount > 0) continue;
    await client.query(`
      insert into inbound_emails (tenant_id, recipient_email, recipient_user_id,
        sender_email, sender_name, subject, body_text, received_at, is_test)
      values ($1, $2::citext, $3, $4, $5, $6, $7, now() - ($8 || ' days')::interval, true)`,
      [u.tenant_id, EMAIL, u.id, sender, name, subject, body, daysAgo]);
    n++;
  }
  console.log(`✅ Innhólf: ${n} ný sýnisskeyti`);

  // ÚTHÓLF: 2 send skeyti
  const outbound = [
    ["birgir@dæmi.is", "Re: Munið öryggisbúnaðinn", "Móttekið — verð með allt á hreinu.\n\nLúlli", 2],
    ["anna@verktak.is", "Frí á föstudag?", "Sæl Anna,\n\nGæti ég fengið frí næsta föstudag? Þarf að skreppa til tannlæknis.\n\nLúlli", 3],
  ];
  let m = 0;
  for (const [to, subject, body, daysAgo] of outbound) {
    const { rowCount } = await client.query(
      `select 1 from outbound_emails where sender_user_id = $1 and subject = $2`, [u.id, subject]);
    if (rowCount > 0) continue;
    await client.query(`
      insert into outbound_emails (tenant_id, sender_user_id, from_email, to_email,
        subject, body_text, status, sent_at, created_at)
      values ($1, $2, $3::citext, $4, $5, $6, 'mock_sent',
              now() - ($7 || ' days')::interval, now() - ($7 || ' days')::interval)`,
      [u.tenant_id, u.id, EMAIL, to, subject, body, daysAgo]);
    m++;
  }
  console.log(`✅ Úthólf: ${m} ný send skeyti`);

  // TILKYNNING frá admin félagsins (ef ekki til) + les-raðir á alla virka starfsmenn
  const title = "Sumarlokun skrifstofu";
  const { rowCount: annExists } = await client.query(
    `select 1 from announcements where tenant_id = $1 and title = $2`, [u.tenant_id, title]);
  if (annExists === 0) {
    const { rows: [adm] } = await client.query(`
      select u2.id from users u2
      join user_roles ur on ur.user_id = u2.id
      join roles r on r.id = ur.role_id
      where u2.tenant_id = $1 and r.name = 'admin' limit 1`, [u.tenant_id]);
    const { rows: [ann] } = await client.query(`
      insert into announcements (tenant_id, sender_user_id, title, body)
      values ($1, $2, $3, 'Skrifstofan verður lokuð 15.–19. júlí vegna sumarleyfa. Neyðarsími er 555-0100. Vinsamlegast kvittið fyrir lestur.')
      returning id`, [u.tenant_id, adm?.id ?? null, title]);
    await client.query(`
      insert into announcement_reads (announcement_id, user_id)
      select $1, e.user_id from employees e
      where e.tenant_id = $2 and e.status = 'active' and e.user_id is not null
      on conflict do nothing`, [ann.id, u.tenant_id]);
    console.log(`✅ Tilkynning „${title}" send á alla starfsmenn`);
  } else {
    console.log(`• Tilkynning „${title}" var til`);
  }
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
