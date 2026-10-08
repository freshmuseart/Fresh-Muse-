/**
 * Generates public/og.png — the social share image.
 *
 * Original Fresh Muse artwork: flowing night-wind curves, a slow spiral,
 * distant lights, and the star mark. No text (the renderer has no fonts)
 * and no reproduction of any existing painting.
 *
 * Run:  node scripts/generate-og.mjs
 */
import sharp from 'sharp';

const W = 1200;
const H = 630;

// deterministic pseudo-random so the image is reproducible
let a = 20261007;
const rand = () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- flowing wind bands ----------------------------------------------------
let bands = '';
for (let i = 0; i < 9; i++) {
  const y = 70 + i * 62 + rand() * 30;
  const amp = 26 + rand() * 52;
  const gold = rand() > 0.6;
  const d = `M -40 ${y.toFixed(0)} C ${(W * 0.25).toFixed(0)} ${(y - amp).toFixed(0)}, ${(W * 0.55).toFixed(0)} ${(y + amp).toFixed(0)}, ${(W + 40).toFixed(0)} ${(y - amp * 0.4).toFixed(0)}`;
  bands += `<path d="${d}" fill="none" stroke="${gold ? '#c8a86a' : '#7d8cc4'}" stroke-width="${(1.5 + rand() * 2.5).toFixed(1)}" stroke-opacity="${(0.14 + rand() * 0.3).toFixed(2)}" stroke-linecap="round"/>`;
}

// --- central spiral --------------------------------------------------------
const cx = W * 0.66;
const cy = H * 0.44;
let spiral = '';
let px = cx;
let py = cy;
const turns = 2.6;
for (let i = 1; i <= 90; i++) {
  const t = i / 90;
  const ang = t * turns * Math.PI * 2;
  const r = 6 + t * 190;
  const x = cx + Math.cos(ang) * r;
  const y = cy + Math.sin(ang) * r * 0.68;
  spiral += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  px = x;
  py = y;
}

// --- distant points of light ------------------------------------------------
let stars = '';
for (let i = 0; i < 60; i++) {
  const x = (rand() * W).toFixed(1);
  const y = (rand() * H).toFixed(1);
  const r = (0.8 + rand() * 2.4).toFixed(2);
  const gold = rand() > 0.65;
  stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="${gold ? '#d9a55e' : '#e9e4d6'}" fill-opacity="${(0.2 + rand() * 0.6).toFixed(2)}"/>`;
}

// --- star mark (same geometry as favicon) ----------------------------------
const mark = (x, y, s) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#c8a86a" stroke-width="4" stroke-linejoin="round">
     <path d="M0 -60 C 11 -30, 30 -11, 60 0 C 30 11, 11 30, 0 60 C -11 30, -30 11, -60 0 C -30 -11, -11 -30, 0 -60 Z"/>
   </g>`;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0e1e"/>
      <stop offset="55%" stop-color="#04060d"/>
      <stop offset="100%" stop-color="#10162c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#c8a86a" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#c8a86a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="indigo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#262e52" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#262e52" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="180" cy="90" rx="420" ry="300" fill="url(#indigo)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="330" ry="300" fill="url(#glow)"/>

  ${bands}
  <path d="M${spiral}" fill="none" stroke="#c8a86a" stroke-width="2.2" stroke-opacity="0.55" stroke-linecap="round"/>
  ${stars}
  ${mark(150, H - 130, 1.15)}
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log('public/og.png written');
