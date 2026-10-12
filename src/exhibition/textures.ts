/**
 * Procedural textures for the exhibition.
 *
 * Every image in the show is drawn here on a <canvas> — original Fresh Muse
 * compositions in the spirit of moving air and turning light, never a copy
 * of any existing artwork. That keeps the exhibition license-clean: no
 * third-party images, no downloads, no external services.
 *
 * All generators are deterministic: the same seed always draws the same
 * picture, so a piece looks identical from visit to visit.
 */
import * as THREE from 'three';

/* --- deterministic pseudo-random (same family as ArtPlate) --------------- */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Palette {
  bg: [string, string];
  strokes: string[];
  glow: string;
}

/** Five quiet palettes — all sit comfortably on a dark gallery wall. */
const PALETTES: Palette[] = [
  { bg: ['#0b1024', '#1b2244'], strokes: ['#c8a86a', '#6d7fc4', '#e9e4d6'], glow: '#d9b878' },
  { bg: ['#e7e1d3', '#cfc7b4'], strokes: ['#10131c', '#5c6172', '#8a7a5a'], glow: '#ffffff' },
  { bg: ['#08171a', '#0f2c2e'], strokes: ['#3d8b83', '#c07a4a', '#d9d3c6'], glow: '#7fc6bb' },
  { bg: ['#131720', '#252b3a'], strokes: ['#93a0bd', '#d8d3c6', '#5a6480'], glow: '#cdd6ea' },
  { bg: ['#180d0d', '#2b1512'], strokes: ['#d4763f', '#e6c98f', '#9a4a33'], glow: '#f0b573' },
];

/**
 * A generated artwork — flowing wind bands, a slow spiral of painterly
 * motion and a few distant points of light. Portrait canvas; the world
 * builder picks the frame aspect from `aspect`.
 */
export function makeArtTexture(seed: string, aspect: 'portrait' | 'landscape' | 'square') {
  const W = aspect === 'landscape' ? 768 : aspect === 'square' ? 640 : 560;
  const H = aspect === 'landscape' ? 560 : aspect === 'square' ? 640 : 768;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const rand = mulberry32(hashString(seed));
  const pal = PALETTES[Math.floor(rand() * PALETTES.length)];

  // background wash
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, pal.bg[0]);
  g.addColorStop(1, pal.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft central glow — light gathering in the picture
  const rg = ctx.createRadialGradient(W * 0.5, H * 0.44, 10, W * 0.5, H * 0.44, W * 0.75);
  rg.addColorStop(0, `${pal.glow}2e`);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // flowing wind bands
  const bandCount = 7 + Math.floor(rand() * 5);
  for (let b = 0; b < bandCount; b++) {
    const y0 = H * (0.12 + rand() * 0.76);
    const amp = H * (0.04 + rand() * 0.1);
    const drift = 0.6 + rand() * 1.6;
    const phase = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const x = t * (W + 60) - 30;
      const y =
        y0 +
        Math.sin(t * Math.PI * 2 * drift + phase) * amp +
        Math.sin(t * Math.PI * 3.4 + phase * 1.7) * amp * 0.35;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = pal.strokes[b % pal.strokes.length];
    ctx.globalAlpha = 0.16 + rand() * 0.3;
    ctx.lineWidth = 4 + rand() * 16;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // a slow spiral — the turning centre of the picture
  const cx = W * (0.32 + rand() * 0.36);
  const cy = H * (0.3 + rand() * 0.34);
  const turns = 2 + Math.floor(rand() * 2);
  ctx.beginPath();
  const steps = 220;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI * 2 * turns + rand() * 0.002;
    const r = t * W * (0.16 + rand() * 0.0009);
    const x = cx + Math.cos(ang) * r * 1.15;
    const y = cy + Math.sin(ang) * r * 0.82;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = pal.strokes[0];
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 3;
  ctx.stroke();

  // distant points of light
  const stars = 14 + Math.floor(rand() * 18);
  for (let s = 0; s < stars; s++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 0.6 + rand() * 2.4;
    ctx.globalAlpha = 0.25 + rand() * 0.55;
    ctx.fillStyle = pal.glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // quiet vignette
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Wall surface — a whisper of swirling movement baked into the plaster, so
 * the dark walls feel hand-finished rather than flat. Used as the colour
 * map over a tinted material; strokes are barely there.
 */
export function makeWallTexture(): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(20261011);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);

  for (let b = 0; b < 26; b++) {
    const y0 = rand() * S;
    const amp = 8 + rand() * 34;
    const drift = 0.5 + rand() * 1.4;
    const phase = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = t * (S + 40) - 20;
      const y = y0 + Math.sin(t * Math.PI * 2 * drift + phase) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rand() > 0.75 ? '#b9a481' : '#c9ccd6';
    ctx.globalAlpha = 0.05 + rand() * 0.08;
    ctx.lineWidth = 2 + rand() * 9;
    ctx.stroke();
  }

  // fine tooth of the plaster
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#9aa0ad' : '#ffffff';
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Floor — a dark, faintly grained surface that catches the light pools. */
export function makeFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(77031);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);

  // long boards running with the corridor
  const boards = 7;
  for (let i = 0; i < boards; i++) {
    const y = (S / boards) * i;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = i % 2 ? '#d8d2c8' : '#efe9df';
    ctx.fillRect(0, y, S, S / boards);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#8f887c';
    ctx.fillRect(0, y, S, 1);
  }
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#6f6a61' : '#ffffff';
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
