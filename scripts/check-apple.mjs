// Staðfestir að Apple Developer aðgangurinn virki, með App Store Connect API-lykli.
// Býr til ES256 JWT og kallar á App Store Connect API.
//
// Notkun (PowerShell):
//   $env:ASC_KEY_ID="XXXXXXXXXX"
//   $env:ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
//   $env:ASC_KEY_PATH="C:\...\AuthKey_XXXXXXXXXX.p8"
//   node scripts/check-apple.mjs
import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";

const keyId = process.env.ASC_KEY_ID;
const issuerId = process.env.ASC_ISSUER_ID;
const keyPath = process.env.ASC_KEY_PATH;

if (!keyId || !issuerId || !keyPath) {
  console.error("Vantar ASC_KEY_ID, ASC_ISSUER_ID og ASC_KEY_PATH.");
  process.exit(1);
}

const privateKey = readFileSync(keyPath, "utf8");
const now = Math.floor(Date.now() / 1000);

const token = jwt.sign(
  { iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" },
  privateKey,
  { algorithm: "ES256", header: { alg: "ES256", kid: keyId, typ: "JWT" } }
);

const base = "https://api.appstoreconnect.apple.com/v1";
const headers = { Authorization: `Bearer ${token}` };

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

try {
  console.log("Tengist App Store Connect API ...\n");

  // 1) Staðfesta auðkenningu — sækja öpp á reikningnum
  const apps = await get("/apps?limit=50");
  if (apps.status === 401) {
    console.error("❌ 401 Unauthorized — lykill/issuer rangt eða aðgangur ekki virkur.");
    console.error(JSON.stringify(apps.body, null, 2));
    process.exit(1);
  }
  if (apps.status !== 200) {
    console.error(`❌ Óvænt svar (${apps.status}):`);
    console.error(JSON.stringify(apps.body, null, 2));
    process.exit(1);
  }

  console.log("✅ Auðkenning tókst — Apple Developer aðgangurinn er VIRKUR.\n");

  const list = apps.body.data ?? [];
  console.log(`Öpp á reikningnum: ${list.length}`);
  for (const a of list) {
    console.log(`  • ${a.attributes?.name} (${a.attributes?.bundleId})`);
  }
  const exists = list.some(
    (a) => a.attributes?.bundleId === "is.reir.timastjornun"
  );
  console.log(
    exists
      ? "\n✅ Bundle 'is.reir.timastjornun' er þegar til í App Store Connect."
      : "\nℹ️ Bundle 'is.reir.timastjornun' ekki enn til — EAS býr það til við fyrsta build/submit."
  );
} catch (e) {
  console.error("❌ Villa:", e.message);
  process.exit(1);
}
