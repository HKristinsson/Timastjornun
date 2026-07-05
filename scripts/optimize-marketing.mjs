// Þjappar hero-myndir fyrir vefinn og eyðir þungu PNG-frumunum.
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "web", "public", "marketing");

const jobs = [
  ["hero-construction.png", "hero-construction.jpg", 1800],
  ["workers-grid.png", "workers-grid.jpg", 1400],
];

for (const [src, out, width] of jobs) {
  await sharp(path.join(dir, src)).resize(width).jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(dir, out));
  rmSync(path.join(dir, src));
  console.log("✅", out);
}
console.log("Búið.");
