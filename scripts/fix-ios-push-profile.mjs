// Bætir PUSH_NOTIFICATIONS heimild á bundle ID og endurgerir provisioning profile.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;
const BUNDLE_DB_ID = "AC9JAAD2HT";     // is.reir.timaverk
const CERT_ID = "CYXGGS22UV";          // dreifingarvottorðið okkar
const OLD_PROFILE_ID = "DMH5FY58G4";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  return json;
}

// 1) Push Notifications heimild á bundle ID
try {
  await api("POST", "/bundleIdCapabilities", {
    data: {
      type: "bundleIdCapabilities",
      attributes: { capabilityType: "PUSH_NOTIFICATIONS" },
      relationships: { bundleId: { data: { type: "bundleIds", id: BUNDLE_DB_ID } } },
    },
  });
  console.log("✅ PUSH_NOTIFICATIONS heimild bætt við bundle");
} catch (e) {
  if (String(e).includes("409") || String(e).includes("already")) {
    console.log("• Heimild var þegar til");
  } else throw e;
}

// 2) Eyða gamla prófílnum
try {
  await api("DELETE", `/profiles/${OLD_PROFILE_ID}`);
  console.log("✅ Gamla prófílnum eytt");
} catch {
  console.log("• Gamli prófíllinn þegar horfinn");
}

// 3) Nýr prófíll með heimildinni
const prof = await api("POST", "/profiles", {
  data: {
    type: "profiles",
    attributes: { name: `Timaverk App Store v2 ${Date.now()}`, profileType: "IOS_APP_STORE" },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: BUNDLE_DB_ID } },
      certificates: { data: [{ type: "certificates", id: CERT_ID }] },
    },
  },
});
writeFileSync(
  path.join(root, "mobile", "credentials", "timaverk.mobileprovision"),
  Buffer.from(prof.data.attributes.profileContent, "base64")
);
console.log(`✅ Nýr prófíll (${prof.data.id}) — mobileprovision uppfært`);
