import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { cellBoxes, cellSize, DOOR_DEPTH, floorSize, placeOnFloor, unitSize, type Vec3 } from './scene3d';
import { spotFits } from './floorPlan';
import { doorShelfCount } from './layout';
import type { StorageUnit } from '../types';

// Builds the 3D view's objects. Only loaded with the 3D view itself (three.js
// is big), see Scene3D.svelte. Everything a tap can open carries userData:
// { cellId } inside a unit, { unitId } in a room.

export interface Palette {
  accent: THREE.Color;
  danger: THREE.Color;
  surface: THREE.Color;
  border: THREE.Color;
  text: THREE.Color;
  dim: THREE.Color;
  bg: THREE.Color;
  dark: boolean;
}

/** The theme's colours, read from the CSS variables. */
export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => {
    const c = new THREE.Color();
    try {
      c.setStyle(css.getPropertyValue(name).trim() || fallback);
    } catch {
      c.setStyle(fallback);
    }
    return c;
  };
  const bg = color('--bg', '#f7f7fa');
  return {
    accent: color('--accent', '#4f46e5'),
    danger: color('--danger', '#dc2626'),
    surface: color('--surface', '#ffffff'),
    border: color('--border', '#e2e2e8'),
    text: color('--text', '#1c1c22'),
    dim: color('--text-dim', '#6b6b76'),
    bg,
    dark: bg.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5,
  };
}

export interface CellState {
  count: number; // items + containers in it
  low: boolean;
  highlight: boolean; // a search match
  label: string | null; // shown over it, if labels are on
}

export interface Label {
  object: CSS2DObject;
  pick: Record<string, string>;
}

export interface Built {
  root: THREE.Group;
  pickables: THREE.Object3D[];
  labels: Label[];
  size: Vec3; // for framing the camera
  center?: Vec3; // where it's centred, when that isn't x = z = 0
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, at: Vec3): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...at);
  return m;
}

function label(text: string, at: Vec3, pick: Record<string, string>, className = ''): Label {
  const el = document.createElement('div');
  el.className = `label3d ${className}`.trim();
  el.textContent = text;
  const object = new CSS2DObject(el);
  object.position.set(...at);
  return { object, pick };
}

// The furniture itself, around cells laid out by cellBoxes: posts and
// boards for shelves, walls and an open lid for a chest, a cabinet with
// fronts for drawers, a cabinet with a door for a fridge, just boards for
// anything else.
function frame(unit: StorageUnit, pal: Palette, pulled: (level: number) => number, doorOpen: boolean): THREE.Group {
  const g = new THREE.Group();
  const [W, H, D] = unitSize(unit);
  const [, h] = cellSize(unit);
  const t = 0.02;
  const wood = new THREE.MeshStandardMaterial({ color: pal.dim, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: pal.dim, roughness: 0.6, transparent: true, opacity: 0.22, depthWrite: false });

  if (unit.kind === 'shelving' || unit.kind === 'custom') {
    for (let k = 0; k <= unit.levels; k++) {
      g.add(mesh(box(W + t, t, D + t), wood, [0, Math.max(t / 2, H - h * k), 0]));
    }
    if (unit.kind === 'shelving') {
      for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(mesh(box(t * 1.5, H + t, t * 1.5), wood, [x, H / 2, z]));
    }
  } else if (unit.kind === 'chest') {
    g.add(mesh(box(W + 2 * t, t, D + 2 * t), wood, [0, -t / 2, 0]));
    g.add(mesh(box(W + 2 * t, H, t), glass, [0, H / 2, -D / 2 - t / 2]));
    g.add(mesh(box(W + 2 * t, H, t), glass, [0, H / 2, D / 2 + t / 2]));
    g.add(mesh(box(t, H, D), glass, [-W / 2 - t / 2, H / 2, 0]));
    g.add(mesh(box(t, H, D), glass, [W / 2 + t / 2, H / 2, 0]));
    // The lid, swung open on its back hinge.
    const lid = new THREE.Group();
    lid.position.set(0, H, -D / 2 - t);
    lid.rotation.x = -Math.PI * 0.6;
    lid.add(mesh(box(W + 2 * t, t * 1.5, D + 2 * t), glass, [0, 0, (D + 2 * t) / 2]));
    g.add(lid);
  } else if (unit.kind === 'fridge') {
    const shell = new THREE.MeshStandardMaterial({ color: pal.surface.clone().lerp(pal.dim, 0.25), roughness: 0.4 });
    const door = doorShelfCount(unit);
    const inside = unit.levels - door;
    const body = D - (door ? DOOR_DEPTH : 0);
    const bz = -D / 2 + body / 2;
    g.add(mesh(box(W + 2 * t, t, body), shell, [0, H + t / 2, bz]));
    g.add(mesh(box(W + 2 * t, t, body), shell, [0, -t / 2, bz]));
    g.add(mesh(box(t, H, body), shell, [-W / 2 - t / 2, H / 2, bz]));
    g.add(mesh(box(t, H, body), shell, [W / 2 + t / 2, H / 2, bz]));
    g.add(mesh(box(W, H, t), shell, [0, H / 2, -D / 2 - t / 2]));
    for (let k = 1; k < inside; k++) g.add(mesh(box(W, t / 2, body), glass, [0, H - h * k, bz]));
    // The door (see-through, so the door shelves show) and a lip along the
    // bottom of each door shelf, shut across the front or open on the left.
    const hd = door ? H / door : 0;
    if (doorOpen) {
      g.add(mesh(box(t, H + 2 * t, W + 2 * t), glass, [-W / 2 - t / 2, H / 2, D / 2 + W / 2]));
      for (let k = 1; k <= door; k++) g.add(mesh(box(t, 0.05, W), wood, [-W / 2 + DOOR_DEPTH, H - hd * k + 0.025, D / 2 + W / 2]));
    } else {
      g.add(mesh(box(W + 2 * t, H + 2 * t, t), glass, [0, H / 2, D / 2 + t / 2]));
      for (let k = 1; k <= door; k++) g.add(mesh(box(W, 0.05, t), wood, [0, H - hd * k + 0.025, D / 2 - DOOR_DEPTH]));
    }
  } else if (unit.kind === 'drawers') {
    g.add(mesh(box(W + 2 * t, t, D + t), wood, [0, H + t / 2, -t / 2]));
    g.add(mesh(box(W + 2 * t, t, D + t), wood, [0, -t / 2, -t / 2]));
    g.add(mesh(box(t, H, D + t), wood, [-W / 2 - t / 2, H / 2, -t / 2]));
    g.add(mesh(box(t, H, D + t), wood, [W / 2 + t / 2, H / 2, -t / 2]));
    g.add(mesh(box(W, H, t), wood, [0, H / 2, -D / 2 - t / 2]));
    const handle = new THREE.MeshStandardMaterial({ color: pal.text, roughness: 0.4 });
    for (let level = 1; level <= unit.levels; level++) {
      const y = H - h * (level - 0.5);
      const z = D / 2 + t / 2 + pulled(level);
      g.add(mesh(box(W - t, h - t, t), glass, [0, y, z]));
      g.add(mesh(box(Math.min(0.18, W * 0.4), 0.025, 0.025), handle, [0, y, z + t]));
    }
  }
  return g;
}

/**
 * One storage unit: its frame and a see-through box per cell, with a solid
 * block inside for what's stored there (taller the more there is, red when
 * something's low). `focusLevel` shows only that level's cells (a drawer is
 * pulled out), so a chest's lower layers can be reached.
 */
export function buildUnit(
  unit: StorageUnit,
  state: (cellId: string) => CellState,
  pal: Palette,
  // `doorOpen`: a fridge's door swung open (its own view) or shut (in a room).
  opts: { focusLevel?: number | null; labels?: boolean; pick?: (cellId: string) => Record<string, string>; doorOpen?: boolean } = {},
): Built {
  const root = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const labels: Label[] = [];
  const [, , D] = unitSize(unit);
  const focus = opts.focusLevel ?? null;
  const pulled = (level: number) => (unit.kind === 'drawers' && focus === level ? D * 0.6 : 0);
  const pick = opts.pick ?? ((cellId: string) => ({ cellId }));
  const doorOpen = opts.doorOpen ?? true;
  root.add(frame(unit, pal, pulled, doorOpen));

  const edgeColor = pal.dark ? pal.dim : pal.border.clone().lerp(pal.dim, 0.5);
  for (const c of cellBoxes(unit, { doorOpen })) {
    if (focus !== null && c.level !== focus) continue;
    const s = state(c.id);
    const [w, h, d] = c.size;
    const at: Vec3 = [c.center[0], c.center[1], c.center[2] + pulled(c.level)];
    const filled = s.count > 0;
    const shell = new THREE.Mesh(
      box(w * 0.94, h * 0.9, d * 0.94),
      new THREE.MeshStandardMaterial({
        color: filled ? pal.accent : pal.dim,
        transparent: true,
        opacity: s.highlight ? 0.35 : filled ? 0.12 : 0.05,
        depthWrite: false,
      }),
    );
    shell.position.set(...at);
    shell.userData = pick(c.id);
    shell.renderOrder = 1;
    root.add(shell);
    pickables.push(shell);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(shell.geometry),
      new THREE.LineBasicMaterial({ color: s.highlight ? pal.accent : filled ? pal.accent.clone().lerp(edgeColor, 0.4) : edgeColor }),
    );
    edges.position.copy(shell.position);
    root.add(edges);

    if (filled) {
      const fill = Math.min(0.85, 0.3 + 0.14 * Math.min(s.count, 4));
      const stuff = mesh(
        box(w * 0.7, h * 0.9 * fill, d * 0.7),
        new THREE.MeshStandardMaterial({ color: s.low ? pal.danger : pal.accent, roughness: 0.55 }),
        [at[0], at[1] - (h * 0.9) / 2 + (h * 0.9 * fill) / 2, at[2]],
      );
      stuff.userData = pick(c.id);
      root.add(stuff);
      pickables.push(stuff);
    }
    if (opts.labels && s.label) {
      labels.push(label(s.label, [at[0], at[1] + h * 0.15, at[2] + d * 0.3], pick(c.id), s.low ? 'low' : ''));
    }
  }
  // Framed with the open door in view: it reaches out a fridge's width in front.
  const [W, H] = unitSize(unit);
  if (doorOpen && doorShelfCount(unit) > 0) return { root, pickables, labels, size: [W, H, D + W], center: [0, 0, W / 2] };
  return { root, pickables, labels, size: [W, H, D] };
}

/** A room from its floor plan: the floor, and each placed unit standing on its spot. */
export function buildRoom(
  room: StorageUnit,
  units: StorageUnit[],
  state: (unitId: string, cellId: string) => CellState,
  counts: (unitId: string) => number,
  icon: (unit: StorageUnit) => string,
  pal: Palette,
): Built {
  const floor = room.floor ?? { rows: 1, cols: 1 };
  const [FW, FD] = floorSize(floor);
  const root = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const labels: Label[] = [];

  const ground = mesh(box(FW, 0.02, FD), new THREE.MeshStandardMaterial({ color: pal.surface, roughness: 1 }), [0, -0.01, 0]);
  root.add(ground);
  const lines: number[] = [];
  for (let r = 0; r <= floor.rows; r++) lines.push(-FW / 2, 0.001, -FD / 2 + (r * FD) / floor.rows, FW / 2, 0.001, -FD / 2 + (r * FD) / floor.rows);
  for (let c = 0; c <= floor.cols; c++) lines.push(-FW / 2 + (c * FW) / floor.cols, 0.001, -FD / 2, -FW / 2 + (c * FW) / floor.cols, 0.001, FD / 2);
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  root.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: pal.border })));
  // Low walls along the back and the sides, so it reads as a room.
  const wall = new THREE.MeshStandardMaterial({ color: pal.border, roughness: 1, transparent: true, opacity: 0.6 });
  root.add(mesh(box(FW, 0.25, 0.03), wall, [0, 0.125, -FD / 2 - 0.015]));
  root.add(mesh(box(0.03, 0.25, FD), wall, [-FW / 2 - 0.015, 0.125, 0]));
  root.add(mesh(box(0.03, 0.25, FD), wall, [FW / 2 + 0.015, 0.125, 0]));

  let tallest = 0.3;
  for (const u of units) {
    if (!u.floorSpot || !spotFits(u.floorSpot, floor)) continue;
    const { center, scale } = placeOnFloor(u, u.floorSpot, floor);
    const built = buildUnit(u, (cellId) => state(u.id, cellId), pal, { pick: () => ({ unitId: u.id }), doorOpen: false });
    built.root.position.set(...center);
    built.root.scale.set(...scale);
    root.add(built.root);
    pickables.push(...built.pickables);
    const H = built.size[1];
    tallest = Math.max(tallest, H);
    const n = counts(u.id);
    labels.push(label(`${icon(u)} ${u.name}${n > 0 ? ` · ${n}` : ''}`, [center[0], H + 0.12, center[2]], { unitId: u.id }));
  }
  return { root, pickables, labels, size: [FW, tallest, FD] };
}

/** Frees the GPU memory of everything under `root`. */
export function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
