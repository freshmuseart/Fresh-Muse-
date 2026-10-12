/**
 * The exhibition floor plan and everything standing on it.
 *
 * Rooms come from src/content/exhibition/rooms/, artworks from
 * src/content/exhibition/artworks/ — this module turns that content into
 * geometry: walls with real doorways, a floor and ceiling, framed works
 * with generated (or uploaded) pictures, picture lights and per-room
 * lighting. Nothing is hard-coded to the current show: change the files
 * and the rooms rebuild differently.
 */
import * as THREE from 'three';
import { makeArtTexture, makeFloorTexture, makeWallTexture } from './textures';

export interface WorldSettings {
  layout: 'enfilade' | 'atrium';
  lighting: 'nocturne' | 'dawn' | 'white-cube';
  spacing: number;
}

export interface WorldRoom {
  id: string;
  title: string;
  description: string;
}

export interface WorldArtwork {
  id: string;
  title: string;
  artist: string;
  description: string;
  room: string;
  image: string;
  link: string;
  linkLabel: string;
  body: string;
  placeholder: boolean;
}

export interface PlacedArtwork {
  data: WorldArtwork;
  /** Frame group — positioned against a wall, facing into the room. */
  group: THREE.Group;
  /** The picture plane — raycast target. */
  art: THREE.Mesh;
  /** Where a visitor stands to look at it, and what they look at. */
  view: { eye: THREE.Vector3; look: THREE.Vector3 };
}

export interface WorldHandle {
  group: THREE.Group;
  artworks: PlacedArtwork[];
  /** Areas a visitor may stand in (rooms + doorway connectors). */
  walkRects: { x0: number; x1: number; z0: number; z1: number }[];
  spawn: { pos: THREE.Vector3; yaw: number };
  /** Room id under a world position, or null outside every room. */
  roomAt(pos: THREE.Vector3): string | null;
  update(elapsed: number, motionOn: boolean): void;
  dispose(): void;
}

type Side = 'north' | 'south' | 'east' | 'west'; // north = -z, south = +z

interface RoomPlan {
  id: string;
  title: string;
  description: string;
  w: number;
  d: number;
  cx: number;
  cz: number;
  /** Sides with a walkable doorway. */
  doors: Side[];
  /** Solid sides that never hang art (the entrance wall). */
  blocked: Side[];
}

const WALL_H = 3.4;
const WALL_T = 0.16;
const DOOR_W = 1.9;
const DOOR_H = 2.55;
const EYE = 1.62;
const ART_Y = 1.58;
const INSET = 0.45; // how far from a wall the visitor stops

/* --- lighting presets ------------------------------------------------------ */

interface LightingPreset {
  bg: number;
  fog: [number, number, number];
  wall: number;
  floor: number;
  ceiling: number;
  ambient: [number, number];
  spot: [number, number]; // colour, intensity
  artEmissive: number;
  lamp: number;
}

const LIGHTING: Record<WorldSettings['lighting'], LightingPreset> = {
  nocturne: {
    bg: 0x05070d,
    fog: [0x05070d, 8, 58],
    wall: 0x1b1f2a,
    floor: 0x2a2118,
    ceiling: 0x0a0c12,
    ambient: [0x3d4566, 0.5],
    spot: [0xffd9a6, 60],
    artEmissive: 0.66,
    lamp: 0xffe6bb,
  },
  dawn: {
    bg: 0x0a1018,
    fog: [0x0a1018, 9, 62],
    wall: 0x232a37,
    floor: 0x2b2620,
    ceiling: 0x10141c,
    ambient: [0x5b6a8c, 0.65],
    spot: [0xd6e4ff, 52],
    artEmissive: 0.58,
    lamp: 0xe8f0ff,
  },
  'white-cube': {
    bg: 0x14161b,
    fog: [0x14161b, 12, 70],
    wall: 0x464a53,
    floor: 0x38342c,
    ceiling: 0x22252c,
    ambient: [0xa7aec0, 0.95],
    spot: [0xffffff, 48],
    artEmissive: 0.5,
    lamp: 0xffffff,
  },
};

/* --- floor plans ------------------------------------------------------------ */

function buildPlan(rooms: WorldRoom[], layout: WorldSettings['layout']): RoomPlan[] {
  const usable = layout === 'atrium' && rooms.length > 5 ? 'enfilade' : layout;

  if (usable === 'atrium') {
    const hallW = 12;
    const hallD = 12;
    const sideW = 9;
    const sideD = 9;
    const sides: Side[] = ['east', 'west', 'north', 'south'];
    const plans: RoomPlan[] = [
      {
        ...toRoom(rooms[0]),
        w: hallW,
        d: hallD,
        cx: 0,
        cz: 0,
        doors: rooms.slice(1, 5).map((_, i) => sides[i]),
        blocked: [],
      },
    ];
    rooms.slice(1, 5).forEach((room, i) => {
      const side = sides[i];
      const off = hallW / 2 + sideW / 2; // 6 + 4.5
      const cx = side === 'east' ? off : side === 'west' ? -off : 0;
      const cz = side === 'south' ? off : side === 'north' ? -off : 0;
      const doorToHall: Side =
        side === 'east' ? 'west' : side === 'west' ? 'east' : side === 'south' ? 'north' : 'south';
      plans.push({
        ...toRoom(room),
        w: sideW,
        d: sideD,
        cx,
        cz,
        doors: [doorToHall],
        blocked: [],
      });
    });
    return plans;
  }

  // enfilade: rooms in a straight line along -z, doorways aligned.
  const w = 9;
  const d = 10;
  return rooms.map((room, i) => {
    const doors: Side[] = [];
    if (i > 0) doors.push('south'); // shared plane with the previous room
    const blocked: Side[] = [];
    if (i === 0) blocked.push('south'); // the entrance wall
    return {
      ...toRoom(room),
      w,
      d,
      cx: 0,
      cz: -i * d + d / 2,
      doors,
      blocked,
    };
  });
}

function toRoom(room: WorldRoom) {
  return { id: room.id, title: room.title, description: room.description };
}

function wallSpan(plan: RoomPlan, side: Side): { a0: number; a1: number; fixed: number; axis: 'x' | 'z' } {
  // `a` = the axis the wall runs along; `fixed` = its position.
  if (side === 'north') return { a0: plan.cx - plan.w / 2, a1: plan.cx + plan.w / 2, fixed: plan.cz - plan.d / 2, axis: 'x' };
  if (side === 'south') return { a0: plan.cx - plan.w / 2, a1: plan.cx + plan.w / 2, fixed: plan.cz + plan.d / 2, axis: 'x' };
  if (side === 'east') return { a0: plan.cz - plan.d / 2, a1: plan.cz + plan.d / 2, fixed: plan.cx + plan.w / 2, axis: 'z' };
  return { a0: plan.cz - plan.d / 2, a1: plan.cz + plan.d / 2, fixed: plan.cx - plan.w / 2, axis: 'z' };
}

/** Inward normal of a wall side (pointing into the room). */
function inward(side: Side): THREE.Vector3 {
  if (side === 'north') return new THREE.Vector3(0, 0, 1);
  if (side === 'south') return new THREE.Vector3(0, 0, -1);
  if (side === 'east') return new THREE.Vector3(-1, 0, 0);
  return new THREE.Vector3(1, 0, 0);
}

/* --- artwork loading --------------------------------------------------------- */

interface LoadedArt {
  texture: THREE.Texture;
  aspect: 'portrait' | 'landscape' | 'square';
}

const ASPECTS: LoadedArt['aspect'][] = ['portrait', 'landscape', 'square'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Load uploaded pictures first (so frames can match their shape), fall
 *  back to a generated placeholder if the file is missing or slow. */
async function loadArtworks(
  artworks: WorldArtwork[],
  signal: { cancelled: boolean },
): Promise<Map<string, LoadedArt>> {
  const out = new Map<string, LoadedArt>();
  const loader = new THREE.TextureLoader();

  await Promise.all(
    artworks.map(async (a) => {
      const generated = (): LoadedArt => ({
        texture: makeArtTexture(a.id, ASPECTS[hash(a.id) % 3]),
        aspect: ASPECTS[hash(a.id) % 3],
      });

      if (!a.image) {
        out.set(a.id, generated());
        return;
      }
      try {
        const texture = await new Promise<THREE.Texture>((resolve, reject) => {
          const t = loader.load(a.image, () => resolve(t), undefined, (err) => reject(err));
          setTimeout(() => reject(new Error('timeout')), 9000);
        });
        if (signal.cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        const img = texture.image as { width?: number; height?: number };
        const ratio = (img?.width ?? 1) / (img?.height ?? 1);
        out.set(a.id, {
          texture,
          aspect: ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square',
        });
      } catch {
        if (!signal.cancelled) out.set(a.id, generated());
      }
    }),
  );
  return out;
}

/* --- the builder -------------------------------------------------------------- */

export interface BuildOptions {
  settings: WorldSettings;
  rooms: WorldRoom[];
  artworks: WorldArtwork[];
}

export async function buildWorld(
  scene: THREE.Scene,
  { settings, rooms, artworks }: BuildOptions,
): Promise<WorldHandle> {
  const preset = LIGHTING[settings.lighting];
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color(preset.bg);
  scene.fog = new THREE.Fog(preset.fog[0], preset.fog[1], preset.fog[2]);

  const signal = { cancelled: false };
  const loaded = await loadArtworks(artworks, signal);

  const planRooms = rooms.length > 0 ? rooms : [{ id: 'main', title: 'The Gallery', description: '' }];
  const plans = buildPlan(planRooms, settings.layout);

  /* --- shared materials ---------------------------------------------------- */
  const wallTex = makeWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    color: preset.wall,
    map: wallTex,
    roughness: 0.94,
    metalness: 0,
  });
  const floorTex = makeFloorTexture();
  floorTex.repeat.set(6, 6);
  const floorMat = new THREE.MeshStandardMaterial({
    color: preset.floor,
    map: floorTex,
    roughness: 0.62,
    metalness: 0.06,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: preset.ceiling,
    roughness: 1,
    metalness: 0,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.7 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x35301f, roughness: 0.5, metalness: 0.25 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x16171c, roughness: 0.55, metalness: 0.15 });
  const matMat = new THREE.MeshStandardMaterial({ color: 0xdad4c6, roughness: 0.92 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x1d1c1a,
    emissive: new THREE.Color(preset.lamp),
    emissiveIntensity: 1.4,
    roughness: 0.5,
  });

  const disposables: { dispose(): void }[] = [wallTex, floorTex, wallMat, floorMat, ceilingMat, trimMat, doorMat, frameMat, matMat, lampMat];

  /* --- bounds (one floor + one ceiling over the whole plan) ---------------- */
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of plans) {
    minX = Math.min(minX, p.cx - p.w / 2);
    maxX = Math.max(maxX, p.cx + p.w / 2);
    minZ = Math.min(minZ, p.cz - p.d / 2);
    maxZ = Math.max(maxZ, p.cz + p.d / 2);
  }

  const floorGeo = new THREE.PlaneGeometry(maxX - minX + 1, maxZ - minZ + 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  const ceilGeo = new THREE.PlaneGeometry(maxX - minX + 1, maxZ - minZ + 1);
  ceilGeo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(ceilGeo, ceilingMat);
  ceiling.position.set((minX + maxX) / 2, WALL_H, (minZ + maxZ) / 2);
  group.add(ceiling);
  disposables.push(ceilGeo);

  /* --- walls --------------------------------------------------------------- */
  // The south plane of room i is also the north plane of room i+1 in the
  // enfilade, and a side room's attaching wall is already the hall's wall.
  // Build each plane exactly once: always the south/east side, plus the
  // far north/west side of the last room.
  const builtPlanes = new Set<string>();

  function addWall(plan: RoomPlan, side: Side, kind: 'door' | 'solid') {
    const span = wallSpan(plan, side);
    const key = `${span.axis}:${span.fixed.toFixed(2)}`;
    if (builtPlanes.has(key)) return;
    builtPlanes.add(key);

    const length = span.a1 - span.a0;
    const mid = (span.a0 + span.a1) / 2;
    const place = (aCenter: number, wAlong: number, h: number, y: number, mat: THREE.Material) => {
      if (wAlong <= 0.01 || h <= 0.01) return;
      const geo =
        span.axis === 'x'
          ? new THREE.BoxGeometry(wAlong, h, WALL_T)
          : new THREE.BoxGeometry(WALL_T, h, wAlong);
      const mesh = new THREE.Mesh(geo, mat);
      if (span.axis === 'x') mesh.position.set(aCenter, y, span.fixed);
      else mesh.position.set(span.fixed, y, aCenter);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(geo);
    };

    if (kind === 'door') {
      const half = DOOR_W / 2;
      // segments either side of the opening
      const leftW = (mid - half) - span.a0;
      const rightW = span.a1 - (mid + half);
      place(span.a0 + leftW / 2, leftW, WALL_H, WALL_H / 2, wallMat);
      place(span.a1 - rightW / 2, rightW, WALL_H, WALL_H / 2, wallMat);
      // lintel above the opening
      place(mid, DOOR_W, WALL_H - DOOR_H, DOOR_H + (WALL_H - DOOR_H) / 2, wallMat);
      // doorway reveal (a warm metal edge)
      const rev = 0.05;
      const edgeGeo =
        span.axis === 'x'
          ? new THREE.BoxGeometry(DOOR_W + rev * 2, DOOR_H + rev, WALL_T + 0.06)
          : new THREE.BoxGeometry(WALL_T + 0.06, DOOR_H + rev, DOOR_W + rev * 2);
      const edge = new THREE.Mesh(edgeGeo, doorMat);
      if (span.axis === 'x') edge.position.set(mid, (DOOR_H + rev) / 2, span.fixed);
      else edge.position.set(span.fixed, (DOOR_H + rev) / 2, mid);
      // carve the opening by scaling: the "edge" is a frame drawn as 4 thin bars — simpler: draw it as a hollow shape using 4 boxes instead.
      edge.visible = false;
      group.add(edge);
      disposables.push(edgeGeo);
      // four thin bars around the opening
      const bars: [number, number, number, number][] =
        span.axis === 'x'
          ? [
              [mid - half - 0.03, DOOR_H / 2, 0.06, DOOR_H],
              [mid + half + 0.03, DOOR_H / 2, 0.06, DOOR_H],
              [mid, DOOR_H + 0.03, DOOR_W + 0.12, 0.06],
            ]
          : [];
      if (span.axis === 'x') {
        for (const [x, y, bw, bh] of bars) {
          const geo = new THREE.BoxGeometry(bw, bh, WALL_T + 0.08);
          const m = new THREE.Mesh(geo, doorMat);
          m.position.set(x, y, span.fixed);
          group.add(m);
          disposables.push(geo);
        }
      } else {
        const vert: [number, number][] = [
          [mid - half - 0.03, DOOR_H / 2],
          [mid + half + 0.03, DOOR_H / 2],
        ];
        for (const [z, y] of vert) {
          const geo = new THREE.BoxGeometry(WALL_T + 0.08, DOOR_H, 0.06);
          const m = new THREE.Mesh(geo, doorMat);
          m.position.set(span.fixed, y, z);
          group.add(m);
          disposables.push(geo);
        }
        const geo = new THREE.BoxGeometry(WALL_T + 0.08, 0.06, DOOR_W + 0.12);
        const m = new THREE.Mesh(geo, doorMat);
        m.position.set(span.fixed, DOOR_H + 0.03, mid);
        group.add(m);
        disposables.push(geo);
      }
    } else {
      place(mid, length, WALL_H, WALL_H / 2, wallMat);
    }

    // baseboard
    const baseGeo =
      span.axis === 'x'
        ? new THREE.BoxGeometry(length, 0.14, WALL_T + 0.05)
        : new THREE.BoxGeometry(WALL_T + 0.05, 0.14, length);
    const base = new THREE.Mesh(baseGeo, trimMat);
    if (span.axis === 'x') base.position.set(mid, 0.07, span.fixed);
    else base.position.set(span.fixed, 0.07, mid);
    group.add(base);
    disposables.push(baseGeo);
  }

  plans.forEach((plan, i) => {
    const isLast = i === plans.length - 1;
    // south wall (also the previous room's north plane in a line plan)
    if (plan.blocked.includes('south')) addWall(plan, 'south', 'solid');
    else if (plan.doors.includes('south')) addWall(plan, 'south', 'door');
    else addWall(plan, 'south', 'solid');
    // east/west
    for (const side of ['east', 'west'] as Side[]) {
      addWall(plan, side, plan.doors.includes(side) ? 'door' : 'solid');
    }
    // north: only the far end (earlier north planes belong to the next room's south)
    if (isLast && plan.doors.includes('north')) addWall(plan, 'north', 'door');
    else if (isLast) addWall(plan, 'north', 'solid');
  });

  /* --- lights --------------------------------------------------------------- */
  scene.add(new THREE.AmbientLight(preset.ambient[0], preset.ambient[1]));

  const spots: THREE.SpotLight[] = [];
  for (const plan of plans) {
    const light = new THREE.SpotLight(preset.spot[0], preset.spot[1], 26, 0.78, 0.9, 1.6);
    light.position.set(plan.cx, WALL_H - 0.22, plan.cz);
    light.target.position.set(plan.cx, 0, plan.cz);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    group.add(light, light.target);
    spots.push(light);

    // ceiling fixture (decorative — the visible source of the pool of light)
    const fixGeo = new THREE.CylinderGeometry(0.34, 0.4, 0.07, 24);
    const fixture = new THREE.Mesh(fixGeo, lampMat);
    fixture.position.set(plan.cx, WALL_H - 0.05, plan.cz);
    group.add(fixture);
    disposables.push(fixGeo);
  }

  /* --- hang the artworks ------------------------------------------------------ */
  const walkRects: WorldHandle['walkRects'] = [];
  const placed: PlacedArtwork[] = [];

  // walkable areas: each room, inset from its walls
  for (const plan of plans) {
    walkRects.push({
      x0: plan.cx - plan.w / 2 + INSET,
      x1: plan.cx + plan.w / 2 - INSET,
      z0: plan.cz - plan.d / 2 + INSET,
      z1: plan.cz + plan.d / 2 - INSET,
    });
  }
  // doorway connectors (so the gap between two inset rooms is walkable)
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    for (const side of plan.doors) {
      const span = wallSpan(plan, side);
      const mid = (span.a0 + span.a1) / 2;
      if (span.axis === 'x') {
        walkRects.push({ x0: mid - 0.7, x1: mid + 0.7, z0: span.fixed - 0.7, z1: span.fixed + 0.7 });
      } else {
        walkRects.push({ x0: span.fixed - 0.7, x1: span.fixed + 0.7, z0: mid - 0.7, z1: mid + 0.7 });
      }
    }
  }

  const byRoom = new Map<string, WorldArtwork[]>();
  for (const a of artworks) {
    const list = byRoom.get(a.room) ?? [];
    list.push(a);
    byRoom.set(a.room, list);
  }

  for (const plan of plans) {
    const works = byRoom.get(plan.id) ?? [];
    if (works.length === 0) continue;

    // eligible walls: no doorway, not the entrance wall
    const sides: Side[] = (['east', 'west', 'north', 'south'] as Side[]).filter(
      (s) => !plan.doors.includes(s) && !plan.blocked.includes(s),
    );
    if (sides.length === 0) continue;

    works.forEach((work, i) => {
      const side = sides[i % sides.length];
      const onWall = works.filter((_, j) => j % sides.length === (i % sides.length)).length;
      const indexOnWall = Math.floor(i / sides.length);
      const span = wallSpan(plan, side);
      const len = span.a1 - span.a0;
      const art = loaded.get(work.id)!;
      const w = art.aspect === 'landscape' ? 1.5 : art.aspect === 'square' ? 1.2 : 1.05;
      const h = art.aspect === 'landscape' ? 1.05 : art.aspect === 'square' ? 1.2 : 1.4;
      const gap = Math.max(w + 0.55, (w + 0.8) * settings.spacing);
      const total = gap * (onWall - 1);
      const maxOff = len / 2 - Math.max(w / 2 + 0.4, 1);
      const offset =
        total <= maxOff * 2
          ? (indexOnWall - (onWall - 1) / 2) * gap
          : (indexOnWall / Math.max(1, onWall - 1) - 0.5) * 2 * maxOff;
      const aMid = (span.a0 + span.a1) / 2 + offset;

      const g = new THREE.Group();
      const n = inward(side);
      // position on the wall plane, pushed slightly into the room
      const px = span.axis === 'x' ? aMid : span.fixed + n.x * 0.04;
      const pz = span.axis === 'x' ? span.fixed + n.z * 0.04 : aMid;
      g.position.set(px, ART_Y, pz);
      // face inward: rotationY so that the plane's +z axis points along n
      const yaw = Math.atan2(n.x, n.z);
      g.rotation.y = yaw;

      const border = 0.075;
      const frameGeo = new THREE.BoxGeometry(w + border * 2, h + border * 2, 0.06);
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.z = 0.03;
      frame.castShadow = true;
      const matGeo = new THREE.BoxGeometry(w, h, 0.012);
      const matBoard = new THREE.Mesh(matGeo, matMat);
      matBoard.position.z = 0.062;
      const artGeo = new THREE.PlaneGeometry(w * 0.86, h * 0.86);
      const artMat = new THREE.MeshStandardMaterial({
        map: art.texture,
        emissiveMap: art.texture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: preset.artEmissive,
        roughness: 0.85,
        metalness: 0,
      });
      const artMesh = new THREE.Mesh(artGeo, artMat);
      artMesh.position.z = 0.07;
      // picture light above
      const armGeo = new THREE.BoxGeometry(0.05, 0.16, 0.05);
      const arm = new THREE.Mesh(armGeo, doorMat);
      arm.position.set(0, h / 2 + border + 0.08, 0.14);
      const barGeo = new THREE.BoxGeometry(w * 0.6, 0.05, 0.07);
      const bar = new THREE.Mesh(barGeo, lampMat);
      bar.position.set(0, h / 2 + border + 0.16, 0.15);

      g.add(frame, matBoard, artMesh, arm, bar);
      group.add(g);
      disposables.push(frameGeo, matGeo, artGeo, armGeo, barGeo, artMat);

      const wallCenter = new THREE.Vector3(px, ART_Y, pz);
      const eye = wallCenter.clone().addScaledVector(n, Math.max(1.9, w * 1.9));
      eye.y = ART_Y - 0.04;
      placed.push({
        data: work,
        group: g,
        art: artMesh,
        view: { eye, look: wallCenter.clone() },
      });
      artMesh.userData.artworkIndex = placed.length - 1;
    });
  }

  /* --- drifting motes (the Starry-Night-spirited air of the rooms) ---------- */
  const moteCount = 300;
  const motePos = new Float32Array(moteCount * 3);
  const moteBase = new Float32Array(moteCount * 3);
  const motePhase = new Float32Array(moteCount);
  const moteColor = new Float32Array(moteCount * 3);
  const gold = new THREE.Color(0xc8a86a);
  const indigo = new THREE.Color(0x7d8cd0);
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < moteCount; i++) {
    const x = minX + rnd() * (maxX - minX);
    const y = 0.4 + rnd() * (WALL_H - 0.8);
    const z = minZ + rnd() * (maxZ - minZ);
    moteBase.set([x, y, z], i * 3);
    motePos.set([x, y, z], i * 3);
    motePhase[i] = rnd() * Math.PI * 2;
    const c = rnd() > 0.72 ? gold : indigo;
    moteColor.set([c.r, c.g, c.b], i * 3);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColor, 3));
  const moteMat = new THREE.PointsMaterial({
    size: 0.032,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);
  disposables.push(moteGeo, moteMat);

  /* --- spawn point --------------------------------------------------------- */
  const first = plans[0];
  const spawn =
    first.doors.includes('south') || first.blocked.includes('south')
      ? { pos: new THREE.Vector3(first.cx, EYE, first.cz + first.d / 2 - 1.7), yaw: 0 }
      : { pos: new THREE.Vector3(first.cx, EYE, first.cz), yaw: 0 };

  /* --- runtime -------------------------------------------------------------- */

  function roomAt(pos: THREE.Vector3): string | null {
    for (const plan of plans) {
      if (
        pos.x >= plan.cx - plan.w / 2 &&
        pos.x <= plan.cx + plan.w / 2 &&
        pos.z >= plan.cz - plan.d / 2 &&
        pos.z <= plan.cz + plan.d / 2
      ) {
        return plan.id;
      }
    }
    return null;
  }

  const posAttr = moteGeo.getAttribute('position') as THREE.BufferAttribute;

  function update(elapsed: number, motionOn: boolean) {
    if (!motionOn) {
      // settle the air: park every mote at its home position once
      posAttr.array.set(moteBase);
      posAttr.needsUpdate = true;
      return;
    }
    for (let i = 0; i < moteCount; i++) {
      const b = i * 3;
      const ph = motePhase[i];
      const t = elapsed * 0.25;
      const x = moteBase[b] + Math.sin(t * 0.6 + ph) * 0.42 + Math.cos(t * 0.31 + ph * 1.7) * 0.22;
      const y = moteBase[b + 1] + Math.sin(t * 0.42 + ph * 2.1) * 0.3;
      const z = moteBase[b + 2] + Math.cos(t * 0.5 + ph) * 0.42;
      motePos[b] = x;
      motePos[b + 1] = y;
      motePos[b + 2] = z;
    }
    posAttr.needsUpdate = true;
  }

  function dispose() {
    signal.cancelled = true;
    scene.remove(group);
    scene.remove(...scene.children.filter((c) => c instanceof THREE.AmbientLight));
    for (const d of disposables) d.dispose();
    for (const p of placed) {
      p.data && loaded.get(p.data.id)?.texture.dispose();
    }
  }

  return { group, artworks: placed, walkRects, spawn, roomAt, update, dispose };
}
