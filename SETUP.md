# Uppsetning — Supabase + Vercel

Þetta skjal leiðir þig skref-fyrir-skref í að koma kerfinu í loftið svo þú getir stofnað
verkefni og starfsmenn og prófað allt í verki.

**Arkitektúr:**
- **Supabase** = gagnagrunnur + Auth + API (hýsir Postgres/PostGIS).
- **Vercel** = web-stjórnborðið (Next.js).
- **Expo/EAS** = mobile-appið (native — fer ekki á Vercel).

---

## HLUTI 1 — Supabase (gagnagrunnur)

### 1.1 Búa til verkefni
1. Farðu á [supabase.com](https://supabase.com) → **New project**.
2. Veldu **Region: Frankfurt (eu-central-1)** eða annað ESB-svæði (GDPR — gögn innan EES).
3. Veldu sterkt **Database password** og geymdu það.

### 1.2 Keyra skemað
1. Í Supabase → **SQL Editor** → **New query**.
2. Opnaðu `supabase/setup_all.sql` (öll uppsetning í einni skrá), afritaðu **allt**, límdu inn.
3. Ýttu á **Run**. Þetta býr til allar töflur, föll, RLS, og prufugögn (seed).
   - PostGIS-extension er virkjuð sjálfkrafa í scriptinu.

### 1.3 Sækja lykla
1. **Project Settings → API**.
2. Afritaðu:
   - **Project URL**  → `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### 1.4 Búa til innskráningu (admin)
1. **Authentication → Users → Add user**.
2. Netfang: `admin@verktak.is`, veldu lykilorð, hakaðu við **Auto Confirm User**.
3. Þetta tengist sjálfkrafa seed-stjórnandanum (trigger `on_auth_user_created`) →
   `tenant_id` og hlutverk leysast af sjálfu sér.

> Til að prófa fleiri hlutverk: búðu til notendur fyrir `jon@verktak.is` (verkefnastjóri),
> `laun@verktak.is` (laun). Mobile-prófun: `anna@verktak.is` / `pall@verktak.is` (starfsmenn).

### 1.5 (Valfrjálst) Dulkóðunarlykill fyrir kennitölu
Til að vista dulkóðaða kennitölu þarf DB-lykil. Í SQL Editor:
```sql
alter role authenticator set app.kennitala_key = 'settu-langan-leyndan-streng';
```
Sleppir þú þessu er kennitala einfaldlega ekki vistuð (ekkert brotnar).

---

## HLUTI 2 — Web-stjórnborð á Vercel

### 2.1 Staðbundin prófun fyrst (mælt með)
```bash
cd web
cp .env.local.example .env.local      # límdu URL + anon key
npm install
npm run dev                            # http://localhost:3000
```
Innskráðu með `admin@verktak.is`. Nú geturðu **stofnað verkefni og starfsmenn**.

### 2.2 Deploy á Vercel — leið A: GitHub (mælt með)
1. Settu verkefnið á GitHub (sjá „git" hér neðar ef það er ekki komið í git).
2. Á [vercel.com](https://vercel.com) → **Add New → Project** → veldu repo-ið.
3. **MIKILVÆGT — Root Directory:** settu `web` (appið er í undirmöppu).
   - Framework Preset: **Next.js** (greinist sjálfkrafa).
4. **Environment Variables** — bættu við:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **Deploy**. Vercel gefur þér slóð (t.d. `https://timastjornun.vercel.app`).

### 2.3 Deploy á Vercel — leið B: CLI
```bash
npm i -g vercel
cd web
vercel            # fylgdu leiðbeiningum (login í vafra), veldu þetta sem rót
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

### 2.4 Eftir deploy
- Engin breyting þarf í Supabase fyrir Vercel-slóðina (Auth virkar með JWT/cookies).
  Ef þú bætir síðar við magic-link/OAuth: bættu Vercel-slóðinni við **Auth → URL Configuration**.

---

## HLUTI 3 — Mobile-app (Expo)

Mobile fer **ekki** á Vercel. Til prófunar:
```bash
cd mobile
cp .env.example .env                   # límdu EXPO_PUBLIC_* lyklana
npm install
npx expo start                          # skannaðu QR með Expo Go appinu
```
Innskráðu sem `anna@verktak.is`. Anna er úthlutuð á verkefni 102 (Höfðabakki).
GPS-staðsetning seed-verkefnisins er í Reykjavík — til að prófa „innan svæðis" án þess að
vera þar geturðu fært geofence seed-verkefnis að þinni eigin staðsetningu (uppfærðu
`project_locations.center` í SQL Editor, eða stofnaðu nýtt verkefni í stjórnborðinu á þínum stað).

Seinna: dreifing gegnum **EAS Build** (`eas build`) í App Store / Google Play.

---

## (Ef þörf) Setja verkefnið í git fyrir GitHub
```bash
cd "<verkefnamappan>"
git init
git add .
git commit -m "Tímastjórnun MVP: gagnagrunnur, web stjórnborð, mobile app"
git branch -M main
git remote add origin https://github.com/<notandi>/<repo>.git
git push -u origin main
```
`.gitignore` er þegar uppsett (sleppir `node_modules`, `.next`, `.env*`).

---

## Yfirlit — hvað þú þarft að gera
1. ☐ Búa til Supabase verkefni (ESB-svæði)
2. ☐ Keyra `setup_all.sql` í SQL Editor
3. ☐ Afrita URL + anon key
4. ☐ Búa til Auth-notanda `admin@verktak.is`
5. ☐ `web/.env.local` + `npm run dev` → stofna verkefni/starfsmenn
6. ☐ Deploy web á Vercel (Root = `web`, env vars)
7. ☐ (Valfrjálst) Mobile: `mobile/.env` + `npx expo start`

Þegar þú hefur URL + anon key get ég aðstoðað við að ganga frá env-skrám og prófa.
