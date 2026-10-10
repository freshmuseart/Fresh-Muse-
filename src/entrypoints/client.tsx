/**
 * Fresh Muse — client entry.
 *
 * The site is fully rendered to static HTML at build time; this module only
 * adds the small progressive enhancements the old Astro inline scripts
 * provided: the mobile menu, the NightSky canvas, the newsletter fallback
 * and (in the studio environment only) the Command Center panel.
 */
import '../styles/global.css';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '../styles/components.css';
import '../styles/pages.css';

/* --- mobile menu (was Header.astro's inline script) ------------------------ */

function initMobileMenu(): void {
  const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
  const menu = document.querySelector<HTMLElement>('#mobile-menu');

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    if (menu) menu.hidden = open;
    document.body.style.overflow = open ? '' : 'hidden';
  });

  // close menu when a link is chosen
  menu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      toggle?.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
      document.body.style.overflow = '';
    });
  });
}

/* --- night sky (was NightSky.astro's inline script) ------------------------ */

function initNightSky(): void {
  const canvasEl = document.querySelector<HTMLCanvasElement>('[data-night-sky]');
  if (!canvasEl) return;
  const context = canvasEl.getContext('2d');
  if (!context) return;

  // Bind non-null constants so the drawing closures type-check cleanly.
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = context;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- flow field: layered sine drift = wind-like organic movement -----
  function flowAngle(x: number, y: number, t: number): number {
    const nx = x * 0.0016;
    const ny = y * 0.0016;
    return (
      Math.sin(nx * 1.7 + t * 0.00022) * 1.1 +
      Math.cos(ny * 2.1 - t * 0.00017) * 0.9 +
      Math.sin((nx + ny) * 1.3 + t * 0.00013) * 0.7
    );
  }

  // --- particles: short strokes that follow the flow --------------------
  type P = { x: number; y: number; len: number; speed: number; hue: number; alpha: number };
  let particles: P[] = [];

  function seedParticles(): void {
    const count = Math.min(220, Math.floor((width * height) / 9000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 26 + Math.random() * 60,
      speed: 0.25 + Math.random() * 0.6,
      // mostly cool indigo, a few warm gold strokes
      hue: Math.random() > 0.82 ? 1 : 0,
      alpha: 0.05 + Math.random() * 0.14,
    }));
  }

  // --- distant points of light -------------------------------------------
  type S = { x: number; y: number; r: number; phase: number; gold: boolean };
  let stars: S[] = [];

  function seedStars(): void {
    stars = Array.from({ length: 46 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.72,
      r: 0.5 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      gold: Math.random() > 0.7,
    }));
  }

  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedParticles();
    seedStars();
  }

  function drawArchitecture(): void {
    // faint horizon + a quiet architectural silhouette, organic lines
    // moving around it — city forms after dark.
    const base = height * 0.86;
    ctx.save();
    ctx.fillStyle = 'rgba(6, 9, 20, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, base);
    const blocks = [
      [0.06, 0.16],
      [0.17, 0.1],
      [0.27, 0.22],
      [0.44, 0.13],
      [0.56, 0.19],
      [0.74, 0.11],
      [0.84, 0.17],
    ];
    for (const [px, ph] of blocks) {
      const x = width * px;
      const h = height * ph;
      ctx.lineTo(x, base - h);
      ctx.lineTo(x + width * 0.09, base - h);
      ctx.lineTo(x + width * 0.09, base);
    }
    ctx.lineTo(width, base);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // a single lit window — small distant point of light
    ctx.fillStyle = 'rgba(217, 165, 94, 0.8)';
    ctx.fillRect(width * 0.3, base - height * 0.16, 3, 4);
    ctx.fillRect(width * 0.77, base - height * 0.1, 3, 4);
    ctx.restore();
  }

  let raf = 0;
  let t = 0;

  function frame(): void {
    t += 16;

    // gentle trail persistence → painterly smear
    ctx.fillStyle = 'rgba(4, 6, 13, 0.085)';
    ctx.fillRect(0, 0, width, height);

    drawArchitecture();

    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.0012 + s.phase));
      ctx.beginPath();
      ctx.fillStyle = s.gold
        ? `rgba(217, 165, 94, ${0.5 * tw})`
        : `rgba(233, 228, 214, ${0.55 * tw})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of particles) {
      const a = flowAngle(p.x, p.y, t);
      const dx = Math.cos(a) * p.speed;
      const dy = Math.sin(a) * p.speed * 0.6;
      ctx.beginPath();
      ctx.strokeStyle = p.hue
        ? `rgba(200, 168, 106, ${p.alpha})`
        : `rgba(125, 140, 196, ${p.alpha})`;
      ctx.lineWidth = 1;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - dx * p.len * 0.14, p.y - dy * p.len * 0.14);
      ctx.stroke();

      p.x += dx;
      p.y += dy;

      // organic wrap
      if (p.x < -80) p.x = width + 80;
      if (p.x > width + 80) p.x = -80;
      if (p.y < -80) p.y = height + 80;
      if (p.y > height + 80) p.y = -80;
    }

    raf = requestAnimationFrame(frame);
  }

  function drawStill(): void {
    ctx.clearRect(0, 0, width, height);
    drawArchitecture();
    for (const s of stars) {
      ctx.beginPath();
      ctx.fillStyle = s.gold ? 'rgba(217, 165, 94, 0.5)' : 'rgba(233, 228, 214, 0.55)';
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // static gentle curves
    for (let i = 0; i < 60; i++) {
      const y = (height / 60) * i;
      ctx.beginPath();
      ctx.strokeStyle = i % 7 === 0 ? 'rgba(200, 168, 106, 0.1)' : 'rgba(125, 140, 196, 0.09)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, y + Math.sin(i) * 12);
      for (let x = 0; x <= width; x += 40) {
        ctx.lineTo(x, y + Math.sin(x * 0.004 + i * 0.6) * 14);
      }
      ctx.stroke();
    }
  }

  resize();
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    resize();
    if (reduceMotion) drawStill();
    else raf = requestAnimationFrame(frame);
  });

  if (reduceMotion) {
    drawStill();
  } else {
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, width, height);
    raf = requestAnimationFrame(frame);
  }
}

/* --- newsletter fallback (was Newsletter.astro's inline script) ------------- */

function initNewsletter(): void {
  const form = document.querySelector<HTMLFormElement>('[data-newsletter]');
  // NB: form.action returns the current URL when the attribute is absent,
  // so test the attribute itself to detect an unconnected form.
  if (form && !form.getAttribute('action')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = form.querySelector<HTMLElement>('[data-newsletter-note]');
      if (note) note.hidden = false;
    });
  }
}

/* --- command center panel (studio environment only) ------------------------ */

function initCommandCenter(): void {
  if (!import.meta.env.DEV) return;
  if (!document.getElementById('cc-form')) return;
  void import('../../command-center/ui/panel').then((m) => m.initPanel());
}

initMobileMenu();
initNightSky();
initNewsletter();
initCommandCenter();
