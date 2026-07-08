// Sækir UI-myndefni (Higgsfield) og þjappar fyrir vefinn.
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "web", "public", "marketing");
mkdirSync(dir, { recursive: true });

const base = "https://d8j0ntlcm91z4.cloudfront.net/user_3DUPnGlZ3BS3QfvMG7nYF1lhIJT";

async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Bakgrunnsmynstur fyrir innskráningu (9:16)
const bg = await fetchBuf(`${base}/hf_20260708_190333_b1ad7241-f860-4467-9d36-59fac50b0c8d.png`);
await sharp(bg).resize(1100).jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(dir, "login-bg.jpg"));
console.log("✅ login-bg.jpg");

// Tómt-innhólf skreyting (1:1)
const mb = await fetchBuf(`${base}/hf_20260708_190744_2572ed5f-1609-4524-bce8-bf36989caed9.png`);
await sharp(mb).resize(480).png({ compressionLevel: 9 }).toFile(path.join(dir, "empty-inbox.png"));
console.log("✅ empty-inbox.png");
