/**
 * Fresh Muse exhibition engine — the runtime half of /exhibition/.
 *
 * world.ts builds the geometry; this module makes it a place you can walk
 * through: renderer, first-person controls (pointer lock on desktop, twin
 * touch zones on phones), artwork selection with a close-look camera move,
 * the info panel, the HUD, pause and the error state.
 *
 * It is imported ONLY from client.tsx and ONLY on /exhibition/, so
 * three.js never reaches the rest of the site.
 */
import * as THREE from 'three';
import { buildWorld, type PlacedArtwork, type WorldHandle } from './world';

interface Payload {
  settings: {
    title: string;
    intro: string;
    howTo: string;
    layout: string;
    lighting: string;
    spacing: number;
  };
  rooms: { id: string; title: string; description: string; order: number }[];
  artworks: {
    id: string;
    title: string;
    artist: string;
    description: string;
    room: string;
    order: number;
    image: string;
    link: string;
    linkLabel: string;
    body: string;
    placeholder: boolean;
  }[];
}

const EYE = 1.62;
const WALK = 2.5; // metres per second
const RUN = 4.1;
const REACH = 7.5; // how close you must be to "view" a work
const PLAYER_R = 0.25;

export function startExhibition(): void {
  const root = document.getElementById('exhibition-root');
  if (!root) return;

  /* --- element handles ---------------------------------------------------- */
  const $ = <T extends HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null;
  const status = $('ex-status');
  const entry = $('ex-entry');
  const enterBtn = $<HTMLButtonElement>('ex-enter');
  const stage = $('ex-stage');
  const canvas = $<HTMLCanvasElement>('ex-canvas');
  const crosshair = $('ex-crosshair');
  const targetLabel = $('ex-target');
  const roomintro = $('ex-roomintro');
  const roomintroTitle = $<HTMLElement>('ex-roomintro-title');
  const roomintroDesc = $<HTMLElement>('ex-roomintro-desc');
  const motionBtn = $<HTMLButtonElement>('ex-motion');
  const leaveBtn = $('ex-leave');
  const joystick = $('ex-joy') ?? $('ex-joystick');
  const knob = $('ex-joystick-knob');
  const pause = $('ex-pause');
  const resumeBtn = $<HTMLButtonElement>('ex-resume');
  const pauseLeaveBtn = $('ex-pause-leave');
  const info = $('ex-info');
  const infoClose = $<HTMLButtonElement>('ex-info-close');
  const infoMedia = $('ex-info-media');
  const infoRoom = $<HTMLElement>('ex-info-room');
  const infoTitle = $<HTMLElement>('ex-info-title');
  const infoArtist = $<HTMLElement>('ex-info-artist');
  const infoBody = $('ex-info-body');
  const infoBadge = $('ex-info-placeholder');
  const infoLink = $<HTMLAnchorElement>('ex-info-link');
  const retryBtn = $<HTMLButtonElement>('ex-retry');

  if (!root || !stage || !canvas) {
    fail('The exhibition page is missing required elements.');
    return;
  }

  const dataEl = document.getElementById('ex-data');
  let payload: Payload;
  try {
    payload = JSON.parse(dataEl?.textContent ?? '') as Payload;
  } catch {
    fail('The exhibition content could not be read.');
    return;
  }

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const roomTitle = new Map(payload.rooms.map((r) => [r.id, r.title]));

  /* --- motion preference -------------------------------------------------- */
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let motionOn = !systemReduced;
  const syncMotionBtn = () => {
    if (motionBtn) {
      motionBtn.setAttribute('aria-pressed', String(!motionOn));
      motionBtn.textContent = motionOn ? 'Reduce motion' : 'Motion reduced';
    }
  };
  syncMotionBtn();

  /* --- three.js objects (created per visit, disposed on leave) ------------- */
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let world: WorldHandle | null = null;
  let raf = 0;
  let disposed = true;

  /* --- look state --------------------------------------------------------- */
  let yaw = 0;
  let pitch = 0;
  let locked = false;
  let panelOpen = false;
  let tween: { from: THREE.Vector3; to: THREE.Vector3; fy: number; ty: number; fp: number; tp: number; t: number } | null = null;

  const keys = new Set<string>();
  const pos = new THREE.Vector3();

  /* --- UI helpers --------------------------------------------------------- */
  function fail(message: string): void {
    status?.setAttribute('hidden', '');
    entry?.setAttribute('hidden', '');
    stage?.setAttribute('hidden', '');
    const err = $('ex-error');
    const msg = $('ex-error-message');
    if (msg && message) msg.textContent = message;
    err?.removeAttribute('hidden');
    $('ex-fallback')?.removeAttribute('hidden');
    root?.classList.remove('is-loading');
  }

  function showRoomIntro(roomId: string | null): void {
    if (!roomId || !roomintro) return;
    const title = roomTitle.get(roomId);
    const room = payload.rooms.find((r) => r.id === roomId);
    if (!title || !room || !room.description) return;
    if (roomintroTitle) roomintroTitle.textContent = title;
    if (roomintroDesc) roomintroDesc.textContent = room.description;
    roomintro.removeAttribute('hidden');
    window.setTimeout(() => roomintro?.setAttribute('hidden', ''), 3400);
  }

  /* --- boot --------------------------------------------------------------- */
  async function boot(): Promise<void> {
    disposed = false;
    status?.removeAttribute('hidden');
    entry?.setAttribute('hidden', '');
    stage?.setAttribute('hidden', '');
    root?.classList.add('is-loading');

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas ?? undefined,
        antialias: !isTouch,
        powerPreference: 'high-performance',
      });
    } catch {
      fail('This device could not start the 3D view (WebGL is unavailable).');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isTouch;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 90);
    camera.rotation.order = 'YXZ';

    world = await buildWorld(scene, {
      settings: {
        layout: payload.settings.layout === 'atrium' ? 'atrium' : 'enfilade',
        lighting:
          payload.settings.lighting === 'dawn' || payload.settings.lighting === 'white-cube'
            ? payload.settings.lighting
            : 'nocturne',
        spacing: payload.settings.spacing,
      },
      rooms: payload.rooms.map((r) => ({ id: r.id, title: r.title, description: r.description })),
      artworks: payload.artworks.map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        description: a.description,
        room: a.room,
        image: a.image,
        link: a.link,
        linkLabel: a.linkLabel,
        body: a.body,
        placeholder: a.placeholder,
      })),
    });

    if (disposed) {
      world.dispose();
      return;
    }

    pos.copy(world.spawn.pos);
    yaw = world.spawn.yaw;
    pitch = 0;

    status?.setAttribute('hidden', '');
    stage?.removeAttribute('hidden');
    // keep the stage hidden from visitors until they press Enter, but it
    // must be laid out to size the renderer — show entry over a black stage
    if (stage) stage.style.visibility = 'hidden';
    resize();
    entry?.removeAttribute('hidden');
    $('ex-fallback')?.setAttribute('hidden', '');
    if (enterBtn) enterBtn.disabled = false;
    root?.classList.remove('is-loading');
    startLoop();
  }

  /* --- resize ------------------------------------------------------------- */
  function resize(): void {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  /* --- input: keyboard ---------------------------------------------------- */
  function onKeyDown(e: KeyboardEvent): void {
    if (stage?.hasAttribute('hidden') || panelOpen) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
    if (e.code === 'Escape' && !locked && !isTouch) showPause();
  }
  function onKeyUp(e: KeyboardEvent): void {
    keys.delete(e.code);
  }

  /* --- input: mouse look (pointer lock) ----------------------------------- */
  function onmousemove(e: MouseEvent): void {
    if (!locked || tween) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
  }
  function onLockChange(): void {
    locked = document.pointerLockElement === canvas;
    const walking =
      !stage?.hasAttribute('hidden') && entry?.hasAttribute('hidden') === true;
    if (locked) {
      hidePause();
    } else if (!panelOpen && !isTouch && walking) {
      showPause();
    }
  }
  function requestLock(): void {
    if (isTouch || !canvas?.requestPointerLock) return;
    try {
      canvas.requestPointerLock();
    } catch {
      /* some browsers refuse right after exit — the pause card offers Resume */
    }
  }

  /* --- input: touch (twin zones) ------------------------------------------- */
  interface TouchZone { id: number; startX: number; startY: number; x: number; y: number }
  let moveZone: TouchZone | null = null;
  let lookZone: TouchZone | null = null;
  const moveVec = { x: 0, y: 0 };
  let tapCandidate: { x: number; y: number; t: number } | null = null;

  function onTouchStart(e: TouchEvent): void {
    if (stage?.hasAttribute('hidden') || panelOpen || tween) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth / 2 && !moveZone) {
        moveZone = { id: t.identifier, startX: t.clientX, startY: t.clientY, x: t.clientX, y: t.clientY };
        if (joystick) {
          joystick.removeAttribute('hidden');
          joystick.style.left = `${t.clientX}px`;
          joystick.style.top = `${t.clientY}px`;
        }
      } else if (t.clientX >= window.innerWidth / 2 && !lookZone) {
        lookZone = { id: t.identifier, startX: t.clientX, startY: t.clientY, x: t.clientX, y: t.clientY };
        tapCandidate = { x: t.clientX, y: t.clientY, t: performance.now() };
      }
    }
    e.preventDefault();
  }
  function onTouchMove(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (moveZone && t.identifier === moveZone.id) {
        moveZone.x = t.clientX;
        moveZone.y = t.clientY;
        const dx = t.clientX - moveZone.startX;
        const dy = t.clientY - moveZone.startY;
        const max = 56;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, max);
        const nx = (dx / len) * clamped;
        const ny = (dy / len) * clamped;
        moveVec.x = nx / max;
        moveVec.y = ny / max;
        if (knob) knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      } else if (lookZone && t.identifier === lookZone.id) {
        const dx = t.clientX - lookZone.x;
        const dy = t.clientY - lookZone.y;
        lookZone.x = t.clientX;
        lookZone.y = t.clientY;
        yaw -= dx * 0.0052;
        pitch -= dy * 0.0052;
        pitch = Math.max(-1.35, Math.min(1.35, pitch));
      }
    }
    e.preventDefault();
  }
  function onTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (moveZone && t.identifier === moveZone.id) {
        moveZone = null;
        moveVec.x = 0;
        moveVec.y = 0;
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
        joystick?.setAttribute('hidden', '');
      } else if (lookZone && t.identifier === lookZone.id) {
        // a quick, still tap on the right half = select the work under the finger
        if (tapCandidate && performance.now() - tapCandidate.t < 300) {
          const moved = Math.hypot(t.clientX - tapCandidate.x, t.clientY - tapCandidate.y);
          if (moved < 12) selectAt(t.clientX, t.clientY);
        }
        tapCandidate = null;
        lookZone = null;
      }
    }
  }

  /* --- artwork selection --------------------------------------------------- */
  const raycaster = new THREE.Raycaster();

  function aimedArtwork(): PlacedArtwork | null {
    if (!camera || !world) return null;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(world.artworks.map((a) => a.art), false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    if ((hit.distance ?? Infinity) > REACH) return null;
    const index = hit.object.userData.artworkIndex as number | undefined;
    return index === undefined ? null : world.artworks[index] ?? null;
  }

  function selectAt(clientX: number, clientY: number): void {
    if (!camera || !world) return;
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(world.artworks.map((a) => a.art), false);
    if (hits.length === 0) return;
    const hit = hits[0];
    if ((hit.distance ?? Infinity) > REACH + 2) return;
    const index = hit.object.userData.artworkIndex as number | undefined;
    const art = index === undefined ? null : world.artworks[index] ?? null;
    if (art) focusArtwork(art);
  }

  function focusArtwork(art: PlacedArtwork): void {
    if (!camera) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const eye = art.view.eye;
    const look = art.view.look;
    const dir = new THREE.Vector3().subVectors(look, eye).normalize();
    const ty = Math.atan2(-dir.x, -dir.z);
    const tp = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    if (!motionOn) {
      pos.copy(eye);
      yaw = ty;
      pitch = tp;
      openInfo(art.data);
      return;
    }
    tween = {
      from: pos.clone(),
      to: eye.clone(),
      fy: yaw,
      ty: normalizeAngle(ty, yaw),
      fp: pitch,
      tp,
      t: 0,
    };
    // the panel opens when the tween finishes (see the render loop)
    pendingArt = art;
  }

  let pendingArt: PlacedArtwork | null = null;

  function normalizeAngle(target: number, current: number): number {
    let t = target;
    while (t - current > Math.PI) t -= Math.PI * 2;
    while (t - current < -Math.PI) t += Math.PI * 2;
    return t;
  }

  function openInfo(data: PlacedArtwork['data']): void {
    if (!info) return;
    panelOpen = true;
    const room = payload.rooms.find((r) => r.id === data.room);
    if (infoRoom) infoRoom.textContent = room?.title ?? '';
    if (infoTitle) infoTitle.textContent = data.title;
    if (infoArtist) {
      infoArtist.textContent = data.artist;
      infoArtist.hidden = !data.artist;
    }
    if (infoBody) {
      infoBody.innerHTML = '';
      const parts = [data.description, data.body].filter(Boolean).join('\n\n').split(/\n{2,}/);
      for (const part of parts) {
        const p = document.createElement('p');
        p.textContent = part.replace(/\s*\n\s*/g, ' ').trim();
        if (p.textContent) infoBody.appendChild(p);
      }
    }
    if (infoBadge) infoBadge.hidden = !data.placeholder;
    if (infoMedia) {
      infoMedia.innerHTML = '';
      if (data.image) {
        const img = document.createElement('img');
        img.src = data.image;
        img.alt = '';
        infoMedia.appendChild(img);
        infoMedia.hidden = false;
      } else {
        infoMedia.hidden = true;
      }
    }
    if (infoLink) {
      if (data.link) {
        infoLink.href = data.link;
        infoLink.textContent = data.linkLabel || 'Read more';
        infoLink.removeAttribute('hidden');
      } else {
        infoLink.setAttribute('hidden', '');
      }
    }
    info.removeAttribute('hidden');
    infoClose?.focus();
  }

  function closeInfo(): void {
    info?.setAttribute('hidden', '');
    panelOpen = false;
    if (!isTouch) requestLock();
  }

  /* --- pause --------------------------------------------------------------- */
  function showPause(): void {
    pause?.removeAttribute('hidden');
  }
  function hidePause(): void {
    pause?.setAttribute('hidden', '');
  }

  /* --- movement + collision ------------------------------------------------- */
  function walkable(x: number, z: number): boolean {
    if (!world) return false;
    return world.walkRects.some(
      (r) => x >= r.x0 - PLAYER_R && x <= r.x1 + PLAYER_R && z >= r.z0 - PLAYER_R && z <= r.z1 + PLAYER_R,
    );
  }

  function step(dt: number): void {
    if (!camera || !world) return;
    let fx = 0;
    let fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    fx += moveVec.x;
    fz += moveVec.y;
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    if (len > 0.01) {
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK) * dt;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const dx = (fx * cos - fz * sin) * speed;
      const dz = (fx * -sin - fz * cos) * speed;
      if (walkable(pos.x + dx, pos.z)) pos.x += dx;
      if (walkable(pos.x, pos.z + dz)) pos.z += dz;
    }
    camera.position.set(pos.x, EYE, pos.z);
    camera.rotation.set(pitch, yaw, 0);
  }

  /* --- render loop ---------------------------------------------------------- */
  let last = 0;
  let lastRoom: string | null = null;
  let hudTick = 0;

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    if (disposed || !renderer || !scene || !camera || !world) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      const k = 1 - Math.pow(1 - tween.t, 3); // ease-out cubic
      pos.lerpVectors(tween.from, tween.to, k);
      yaw = tween.fy + (tween.ty - tween.fy) * k;
      pitch = tween.fp + (tween.tp - tween.fp) * k;
      camera.position.set(pos.x, EYE, pos.z);
      camera.rotation.set(pitch, yaw, 0);
      if (tween.t >= 1) {
        tween = null;
        if (pendingArt) {
          const art = pendingArt;
          pendingArt = null;
          openInfo(art.data);
        }
      }
    } else if (!panelOpen) {
      step(dt);
    }

    world.update(now / 1000, motionOn);

    // room intros
    const room = world.roomAt(pos);
    if (room !== lastRoom) {
      lastRoom = room;
      const walking = !stage?.hasAttribute('hidden') && entry?.hasAttribute('hidden') === true;
      if (walking && !panelOpen) showRoomIntro(room);
    }

    // crosshair target hint (desktop, every ~120 ms)
    if (!isTouch && now - hudTick > 120 && !panelOpen && !tween) {
      hudTick = now;
      const aimed = aimedArtwork();
      if (aimed && targetLabel) {
        targetLabel.textContent = aimed.data.title;
        targetLabel.removeAttribute('hidden');
        crosshair?.classList.add('is-hot');
      } else {
        targetLabel?.setAttribute('hidden', '');
        crosshair?.classList.remove('is-hot');
      }
    }

    renderer.render(scene, camera);
  }

  function startLoop(): void {
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  /* --- enter / leave --------------------------------------------------------- */
  function enter(): void {
    entry?.setAttribute('hidden', '');
    if (stage) stage.style.visibility = 'visible';
    stage?.removeAttribute('hidden');
    document.body.classList.add('ex-open');
    showRoomIntro(world?.roomAt(pos) ?? null);
    if (!isTouch) requestLock();
  }

  function leave(): void {
    disposed = true;
    cancelAnimationFrame(raf);
    if (document.pointerLockElement) document.exitPointerLock();
    keys.clear();
    moveVec.x = 0;
    moveVec.y = 0;
    panelOpen = false;
    tween = null;
    pendingArt = null;
    info?.setAttribute('hidden', '');
    pause?.setAttribute('hidden', '');
    stage?.setAttribute('hidden', '');
    document.body.classList.remove('ex-open');
    world?.dispose();
    renderer?.dispose();
    world = null;
    renderer = null;
    scene = null;
    camera = null;
    // return to the entry screen; the world rebuilds on the next Enter
    lastRoom = null;
    entry?.removeAttribute('hidden');
    if (enterBtn) {
      enterBtn.disabled = true;
      enterBtn.textContent = 'Preparing the exhibition…';
      void boot().then(() => {
        if (enterBtn) enterBtn.textContent = 'Enter the exhibition';
      });
    }
  }

  /* --- wiring ----------------------------------------------------------------- */
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onmousemove);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('click', () => {
    if (isTouch || panelOpen || tween) return;
    if (!locked) {
      requestLock();
      return;
    }
    const aimed = aimedArtwork();
    if (aimed) focusArtwork(aimed);
  });
  canvas.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd as EventListener);
  canvas.addEventListener('touchcancel', onTouchEnd as EventListener);

  enterBtn?.addEventListener('click', enter);
  leaveBtn?.addEventListener('click', leave);
  pauseLeaveBtn?.addEventListener('click', leave);
  resumeBtn?.addEventListener('click', () => {
    hidePause();
    requestLock();
  });
  infoClose?.addEventListener('click', closeInfo);
  info?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') closeInfo();
  });
  motionBtn?.addEventListener('click', () => {
    motionOn = !motionOn;
    syncMotionBtn();
  });
  retryBtn?.addEventListener('click', () => {
    $('ex-error')?.setAttribute('hidden', '');
    void boot();
  });

  void boot();
}
