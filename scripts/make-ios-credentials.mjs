// Býr til iOS dreifingarvottorð + provisioning profile beint gegnum
// App Store Connect API og skrifar mobile/credentials/ + credentials.json
// fyrir EAS build með "credentialsSource": "local".
//
// Notkun (env): ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, OPENSSL (valfrj.)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;
const OPENSSL = process.env.OPENSSL || "openssl";
const BUNDLE_ID = "is.reir.timaverk";
const P12_PASSWORD = "timaverk-dist";

if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
  console.error("Vantar ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const credDir = path.join(root, "mobile", "credentials");
mkdirSync(credDir, { recursive: true });

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
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${p} -> ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json;
}

// 1) Einkalykill + CSR
const keyPem = path.join(credDir, "dist-key.pem");
const csrPem = path.join(credDir, "dist.csr");
execFileSync(OPENSSL, ["genrsa", "-out", keyPem, "2048"]);
execFileSync(OPENSSL, [
  "req", "-new", "-key", keyPem, "-out", csrPem,
  "-subj", "/CN=Timaverk Distribution/O=Reir/C=IS",
]);
console.log("✅ Einkalykill + CSR");

// 2) Dreifingarvottorð hjá Apple
const csrContent = readFileSync(csrPem, "utf8")
  .replace("-----BEGIN CERTIFICATE REQUEST-----", "")
  .replace("-----END CERTIFICATE REQUEST-----", "")
  .replace(/\s/g, "");
const certRes = await api("POST", "/certificates", {
  data: {
    type: "certificates",
    attributes: { certificateType: "DISTRIBUTION", csrContent },
  },
});
const certId = certRes.data.id;
const certDer = Buffer.from(certRes.data.attributes.certificateContent, "base64");
const certCer = path.join(credDir, "dist.cer");
writeFileSync(certCer, certDer);
console.log(`✅ Dreifingarvottorð stofnað hjá Apple (${certId})`);

// 3) Bundle ID (finna eða stofna)
let bundleRes = await api(
  "GET",
  `/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}`
);
let bundleDbId = bundleRes.data.find(
  (b) => b.attributes.identifier === BUNDLE_ID
)?.id;
if (!bundleDbId) {
  const created = await api("POST", "/bundleIds", {
    data: {
      type: "bundleIds",
      attributes: { identifier: BUNDLE_ID, name: "Timaverk", platform: "IOS" },
    },
  });
  bundleDbId = created.data.id;
  console.log(`✅ Bundle ID skráð: ${BUNDLE_ID} (${bundleDbId})`);
} else {
  console.log(`• Bundle ID til: ${BUNDLE_ID} (${bundleDbId})`);
}

// 4) App Store provisioning profile
const profRes = await api("POST", "/profiles", {
  data: {
    type: "profiles",
    attributes: { name: `Timaverk App Store ${Date.now()}`, profileType: "IOS_APP_STORE" },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: bundleDbId } },
      certificates: { data: [{ type: "certificates", id: certId }] },
    },
  },
});
const profilePath = path.join(credDir, "timaverk.mobileprovision");
writeFileSync(
  profilePath,
  Buffer.from(profRes.data.attributes.profileContent, "base64")
);
console.log(`✅ Provisioning profile (${profRes.data.id})`);

// 5) .p12 úr lykli + vottorði
const certPemPath = path.join(credDir, "dist-cert.pem");
execFileSync(OPENSSL, ["x509", "-inform", "DER", "-in", certCer, "-out", certPemPath]);
const p12Path = path.join(credDir, "dist.p12");
execFileSync(OPENSSL, [
  "pkcs12", "-export", "-inkey", keyPem, "-in", certPemPath,
  "-out", p12Path, "-password", `pass:${P12_PASSWORD}`,
  "-legacy",
]);
console.log("✅ dist.p12");

// 6) credentials.json fyrir EAS (slóðir afstæðar við mobile/)
writeFileSync(
  path.join(root, "mobile", "credentials.json"),
  JSON.stringify(
    {
      ios: {
        provisioningProfilePath: "credentials/timaverk.mobileprovision",
        distributionCertificate: {
          path: "credentials/dist.p12",
          password: P12_PASSWORD,
        },
      },
    },
    null,
    2
  )
);
console.log("✅ mobile/credentials.json — tilbúið fyrir EAS local credentials");
