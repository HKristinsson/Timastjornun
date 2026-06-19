# Tímastjórnun — Mobile app (starfsmaður)

Expo (React Native) app fyrir starfsmenn: GPS-byggð inn-/útskráning á verkefni.

## Skjáir
| Skrá | Skjár |
|---|---|
| `app/login.tsx` | Innskráning |
| `app/home.tsx` | Heimaskjár (staða, skrá inn / opna virka skráningu) |
| `app/project-select.tsx` | Velja verkefni — GPS + fjarlægð + check-in |
| `app/active.tsx` | Virk skráning — klukka, GPS-vöktun, viðvörun, sjálfvirk útskráning, skrá út |
| `app/timesheet.tsx` | Tímayfirlit starfsmanns |

## Keyrsla
Krefst [Expo Go](https://expo.dev/go) appsins á síma (eða emulator).

```bash
cd mobile
cp .env.example .env      # settu EXPO_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npx expo start            # skannaðu QR með Expo Go (sami WiFi)
```

## GPS-rökfræði
- **Check-in:** appið sækir staðsetningu og sendir til bakenda. Bakendinn (`app.check_in` RPC)
  reiknar geofence með PostGIS — appið getur **ekki** svindlað á staðsetningu.
- **Meðan innskráður:** `app/active.tsx` les staðsetningu á 30 sek fresti (`POLL_MS`) og kallar
  `app.log_location` sem skilar innan/utan svæðis.
- **Utan svæðis:** viðvörun birtist + niðurtalning (`GRACE_SEC`, 10 mín). Snúi starfsmaður ekki
  aftur → `app.auto_check_out` (merkt `auto_geofence`).
- **Skrá út:** `app.check_out` lokar skráningu (staða → í bið samþykktar).

> **Bakgrunnsvöktun:** núverandi útgáfa vaktar í **forgrunni** (app opið). Næsta skref er
> `expo-location` background task / OS-geofencing fyrir vöktun þegar app er í bakgrunni
> (krefst „Always allow" — sem er í lagi á fyrirtækjasímum skv. ákvörðun).

## Innskráning (MVP vs. framtíð)
- **MVP (til prófunar):** netfang + lykilorð gegnum Supabase Auth.
- **Framtíð (skv. hönnun):** OTP á síma við nýskráningu + PIN daglega.

## Stillingar fyrir prófun
`POLL_MS` og `GRACE_SEC` efst í `app/active.tsx` má lækka til að prófa sjálfvirka útskráningu hraðar.
