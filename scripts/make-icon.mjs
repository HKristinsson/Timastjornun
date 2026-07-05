// Býr til app-tákn (icon.png, adaptive-icon.png) + splash úr SVG með sharp.
// Notkun: node scripts/make-icon.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const assets = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../mobile/assets"
);
mkdirSync(assets, { recursive: true });

const BLUE = "#2563eb";

// Pinni + klukka, hvítt á bláu. Full-bleed (iOS rúnnar sjálft).
function iconSvg({ bg = BLUE, size = 1024 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${bg}"/>
  <path d="M512 235 C388 235 290 331 290 449 C290 583 512 800 512 800 C512 800 734 583 734 449 C734 331 636 235 512 235 Z" fill="#ffffff"/>
  <circle cx="512" cy="442" r="132" fill="${bg}"/>
  <line x1="512" y1="442" x2="512" y2="356" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
  <line x1="512" y1="442" x2="576" y2="476" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
  <circle cx="512" cy="442" r="22" fill="#ffffff"/>
</svg>`;
}

// Adaptive (Android) — pinni minni svo hann klippist ekki í hring.
function adaptiveSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BLUE}"/>
  <g transform="translate(512,512) scale(0.62) translate(-512,-512)">
    <path d="M512 235 C388 235 290 331 290 449 C290 583 512 800 512 800 C512 800 734 583 734 449 C734 331 636 235 512 235 Z" fill="#ffffff"/>
    <circle cx="512" cy="442" r="132" fill="${BLUE}"/>
    <line x1="512" y1="442" x2="512" y2="356" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
    <line x1="512" y1="442" x2="576" y2="476" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
    <circle cx="512" cy="442" r="22" fill="#ffffff"/>
  </g>
</svg>`;
}

async function png(svg, file, size = 1024) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(assets, file));
  console.log("✅", file);
}

await png(iconSvg(), "icon.png");
await png(adaptiveSvg(), "adaptive-icon.png");
await png(iconSvg(), "splash-icon.png"); // splash notar sama tákn á bláum grunni
console.log("Búið — mobile/assets/");
