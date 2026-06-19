# Tímastjórnun — GPS-byggt tímaskráningarkerfi

Multi-tenant SaaS sem heldur utan um verkefni, starfsmenn og staðsetningarbundnar tímaskráningar.
Starfsmaður getur aðeins skráð sig inn á verkefni ef hann er innan skilgreinds GPS-svæðis (geofence).

> Full hönnun: [HONNUNARSKJAL.md](HONNUNARSKJAL.md)

## Tæknistakkur

| Lag | Tækni |
|---|---|
| Mobile app (starfsmaður) | React Native (Expo) |
| Web stjórnborð | Next.js + TypeScript + Tailwind + shadcn/ui + MapLibre/OSM |
| Bakendi / DB / Auth / Realtime | Supabase (PostgreSQL + PostGIS + RLS + Realtime + Auth) |
| Geofence-staðfesting | Postgres-föll server-side (`ST_DWithin`, `SECURITY DEFINER`) |
| Útflutningur | Excel (.xlsx) |

## Verkefnaskipulag (monorepo)

```
.
├── HONNUNARSKJAL.md          # Heildar hönnunarskjal
├── supabase/                 # Gagnagrunnur (migrations, föll, RLS, seed)
│   ├── migrations/
│   │   ├── 0001_init.sql      # Extensions + skema + vísitölur
│   │   ├── 0002_functions.sql # Geofence check-in/out, audit, helpers
│   │   ├── 0003_rls.sql       # Row-Level Security stefnur (multi-tenant)
│   │   ├── 0004_admin.sql     # Views + RPC fyrir stjórnborð
│   │   └── 0005_mobile.sql    # Views + RPC fyrir mobile app
│   └── seed.sql              # Prufugögn (eitt fyrirtæki, verkefni, starfsmenn)
├── web/                      # Next.js stjórnborð (FULLBÚIÐ fyrir MVP)
└── mobile/                   # Expo app starfsmanns (FULLBÚIÐ fyrir MVP)
```

## ⚡ Prófa núna

**Web-stjórnborðið** keyrir strax (UI prófanlegt án Supabase):
```bash
cd web && npm install && npm run dev      # http://localhost:3000
```
Án Supabase sérðu viðmótið og **kortið virkar** (velja staðsetningu, radíus). Til að fá gögn,
innskráningu og fulla virkni þarftu Supabase (sjá að neðan).

**Til að prófa allt (web + mobile end-to-end)** þarftu Supabase-bakenda. Tvær leiðir:
- **Supabase Cloud (einfaldast, ókeypis, engin Docker):** búðu til verkefni á supabase.com,
  keyrðu SQL-skrárnar úr `supabase/migrations/` + `seed.sql` í SQL-ritlinum, og settu
  `URL` + `anon key` í `web/.env.local` og `mobile/.env`.
- **Staðbundið (Docker):** `supabase start && supabase db reset` (sjá að neðan).

> Eftir uppsetningu Supabase: búðu til Auth-notanda (t.d. í Supabase Studio) með sama netfangi og
> seed-notandinn, og tengdu hann (`users.auth_user_id`) + settu `tenant_id` í app_metadata svo
> RLS virki. Sjá nánari skref í `HONNUNARSKJAL.md`.

## Uppsetning gagnagrunns (þróun)

Krefst [Supabase CLI](https://supabase.com/docs/guides/cli) og Docker.

```bash
# 1. Ræsa staðbundinn Supabase (Postgres + PostGIS + Auth + Studio)
supabase start

# 2. Keyra migrations
supabase db reset      # keyrir migrations/ í röð + seed.sql

# 3. Skoða gögn í Supabase Studio
#    http://localhost:54323
```

### Lykilatriði í gagnagrunni
- **Multi-tenant:** `tenant_id` (FK → `companies`) á öllum töflum, varið með **Row-Level Security**.
  Notandi sér aðeins gögn síns fyrirtækis — `tenant_id` kemur úr JWT.
- **Geofence server-side:** öll inn-/útskráning fer gegnum `app.check_in()` / `app.check_out()`
  Postgres-föll sem reikna `ST_DWithin` — appið getur ekki svindlað á staðsetningu.
- **Rekjanleiki:** allar lykilbreytingar skráðar í `audit_log`.
- **GDPR:** kennitala dulkóðuð í hvíld; `location_logs` ætluð til sjálfvirkrar eyðingar eftir N daga.

## Staða þróunar

- [x] Hönnunarskjal samþykkt
- [x] Gagnagrunnsskema + PostGIS + vísitölur
- [x] Geofence check-in/check-out föll (server-side)
- [x] Row-Level Security (multi-tenant einangrun)
- [x] Prufugögn (seed)
- [x] **Web stjórnborð — FULLBÚIÐ fyrir MVP** ✅ build staðfest. Inniheldur:
  - Innskráning (Supabase Auth) + auth-middleware sem ver `/dashboard`
  - Dashboard með lifandi yfirliti (innan/utan svæðis, teljarar)
  - Verkefni: listi + stofna/breyta **með korti (MapLibre/OSM)**, draganlegur pinni + radíus, geocoding
  - Kort yfir öll verkefni með geofence-svæðum
  - Starfsmenn: listi + stofna/breyta + úthlutun á verkefni (kennitala dulkóðuð)
  - Tímaskráningar: listi + síur + **samþykkja/hafna** (með ástæðu)
  - Skýrslur: samantekt per starfsmaður
  - **Excel-útflutningur** (.xlsx, exceljs)
  - Kerfisstillingar: GPS-reglur (stillanlegar af admin)
- [x] **Mobile app (Expo) — FULLBÚIÐ fyrir MVP.** Inniheldur:
  - Innskráning, heimaskjár (staða), verkefnaval með GPS + fjarlægð
  - Check-in (bakenda-geofence), virk skráning með klukku
  - GPS-vöktun á 30 sek fresti, **viðvörun + sjálfvirk útskráning** þegar farið er út fyrir svæði
  - Skrá út, tímayfirlit starfsmanns
- [ ] Bakgrunns-GPS (OS-geofencing / background task) — núna vaktað í forgrunni
- [ ] Tengja Supabase Auth við starfsmanna-onboarding (OTP+PIN) — núna netfang+lykilorð
- [ ] Sjálfvirk útskráning við GPS-útfall í bakgrunni (cron/edge function sem öryggisnet)

### Þekkt umhverfisatriði (Windows + Dropbox)
Verkefnið er í Dropbox-samstilltri möppu. Dropbox getur læst `.next/` meðan á build stendur
(`EBUSY rmdir`). Lausn: `.next/` og `node_modules/` eru í `.gitignore`; ef build mistekst með
EBUSY, eyddu `.next` og keyrðu aftur — eða (betra) settu `.next`/`node_modules` í „Selective Sync"
útilokun í Dropbox.
