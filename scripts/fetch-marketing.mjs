// Sækir Higgsfield-myndir í web/public/marketing/ og býr til þjappað hero + base64.
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web", "public", "marketing");
mkdirSync(outDir, { recursive: true });

const base = "https://d8j0ntlcm91z4.cloudfront.net/user_3DUPnGlZ3BS3QfvMG7nYF1lhIJT";
const files = {
  "hero-construction.png": `${base}/hf_20260705_165943_a429524a-f4b6-4627-80c1-3b56750c0154.png`,
  "workers-grid.png": `${base}/hf_20260705_170040_116a5a73-9428-44cb-9a65-f629af9fa251.png`,
  "logo-a.png": `${base}/hf_20260705_165846_823c84f8-37f8-4510-9e9d-b9baf4921ddf.png`,
  "logo-b.png": `${base}/hf_20260705_165846_09072a0a-1300-4c19-9d50-c9d0f0ef9efa.png`,
};

for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path.join(outDir, name), buf);
  console.log("✅", name, `(${Math.round(buf.length / 1024)} KB)`);
}

// Þjappað hero fyrir sýnishorn í spjalli (base64 data-uri).
const heroRes = await fetch(files["hero-construction.png"]);
const heroBuf = Buffer.from(await heroRes.arrayBuffer());
const small = await sharp(heroBuf).resize(900).jpeg({ quality: 62 }).toBuffer();
const dataUri = "data:image/jpeg;base64," + small.toString("base64");
const scratch = process.env.SCRATCH || outDir;
writeFileSync(path.join(scratch, "hero-b64.txt"), dataUri);
console.log(`\n✅ hero-b64.txt (${Math.round(dataUri.length / 1024)} KB base64)`);
