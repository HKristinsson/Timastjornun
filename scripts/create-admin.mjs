// Stofnar Supabase Auth notanda (admin) gegnum Admin API.
// Tengist sjálfkrafa seed-notanda með sama netfangi (trigger on_auth_user_created).
// Notkun:
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE="..." \
//   ADMIN_EMAIL="admin@verktak.is" ADMIN_PASSWORD="..." node scripts/create-admin.mjs
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const email = process.env.ADMIN_EMAIL ?? "admin@verktak.is";
const password = process.env.ADMIN_PASSWORD;

if (!url || !key || !password) {
  console.error("Vantar SUPABASE_URL, SUPABASE_SERVICE_ROLE og ADMIN_PASSWORD.");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
});

const json = await res.json();
if (!res.ok) {
  console.error("❌ Villa:", json.msg ?? JSON.stringify(json));
  process.exit(1);
}
console.log(`✅ Auth notandi stofnaður: ${email} (id ${json.id ?? json.user?.id})`);
console.log("   Tengist seed-stjórnanda sjálfkrafa — tenant + hlutverk leysast.");
