// Reynir að stofna app-færslu í App Store Connect gegnum API.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;
const BUNDLE_DB_ID = "AC9JAAD2HT"; // is.reir.timaverk

function token() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" },
    readFileSync(KEY_PATH, "utf8"),
    { algorithm: "ES256", header: { alg: "ES256", kid: KEY_ID, typ: "JWT" } }
  );
}
const BASE = "https://api.appstoreconnect.apple.com/v1";
async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// Er appið þegar til?
const existing = await api("GET", "/apps?filter[bundleId]=is.reir.timaverk");
if (existing.json.data?.length > 0) {
  console.log(`✅ App-færsla til: ascAppId = ${existing.json.data[0].id}`);
  process.exit(0);
}

// Reyna að stofna
const created = await api("POST", "/apps", {
  data: {
    type: "apps",
    attributes: {
      name: "Tímaverk",
      primaryLocale: "is",
      sku: "timaverk-001",
      bundleId: "is.reir.timaverk",
    },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: BUNDLE_DB_ID } },
    },
  },
});
if (created.status >= 200 && created.status < 300) {
  console.log(`✅ App-færsla stofnuð: ascAppId = ${created.json.data.id}`);
} else {
  console.log(`❌ Stofnun hafnað (${created.status}):`);
  console.log(JSON.stringify(created.json.errors ?? created.json, null, 2));
  process.exit(1);
}
