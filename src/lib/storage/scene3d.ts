import { cellId, doorShelfCount } from './layout';
import type { FloorSpot, StorageUnit, StorageUnitKind } from '../types';

// Where things go in the 3D view, as plain numbers (metres, roughly) so it
// can be tested without a renderer. Axes: x = columns left → right, y = up,
// z = rows back → front (towards the viewer). Level 1 is the top one for
// every kind, same as the 2D view lists them.

export type Vec3 = [number, number, number];

export interface CellBox {
  id: string;
  level: number;
  row: number;
  col: number;
  center: Vec3;
  size: Vec3; // width, height, depth
}

// One cell's width (per column), height (per level) and depth (per row).
const CELL_SIZE: Record<Exclude<StorageUnitKind, 'room'>, Vec3> = {
  shelving: [0.6, 0.4, 0.4],
  fridge: [0.6, 0.3, 0.55],
  chest: [0.4, 0.22, 0.6],
  drawers: [0.55, 0.2, 0.45],
  custom: [0.5, 0.35, 0.4],
};

// Kept under a cell's own size so a unit with many cells stays roughly the
// size of real furniture rather than growing without end.
const MAX_SIZE: Vec3 = [2.4, 2.2, 1];

type Shape = Pick<StorageUnit, 'kind' | 'levels' | 'rows' | 'cols' | 'doorShelves'>;

// How deep a fridge's door shelves stick out from the door.
export const DOOR_DEPTH = 0.12;

/** The cell size of a unit: its kind's size, shrunk if the whole would be too big. */
export function cellSize(unit: Shape): Vec3 {
  const base = CELL_SIZE[unit.kind === 'room' ? 'custom' : unit.kind];
  // A fridge's height is its shelves inside; the door ones share that height.
  const counts: Vec3 = [unit.cols, unit.levels - doorShelfCount(unit), unit.rows];
  return base.map((s, i) => Math.min(s, MAX_SIZE[i] / Math.max(1, counts[i]))) as Vec3;
}

/** The whole unit's outer size (width, height, depth) — a fridge with its door shut. */
export function unitSize(unit: Shape): Vec3 {
  const [w, h, d] = cellSize(unit);
  const door = doorShelfCount(unit);
  return [w * unit.cols, h * (unit.levels - door), d * unit.rows + (door ? DOOR_DEPTH : 0)];
}

/**
 * Every cell of a unit, standing on y = 0 and centred on x = z = 0 (with its
 * door shut). A fridge's door shelves are on its door: shut, a strip across
 * the front; `doorOpen`, the door is swung 90° open on its left hinge, so
 * they stand in a column reaching out towards the viewer.
 */
export function cellBoxes(unit: Shape, opts: { doorOpen?: boolean } = {}): CellBox[] {
  const [w, h, d] = cellSize(unit);
  const [W, H, D] = unitSize(unit);
  const door = doorShelfCount(unit);
  const inside = unit.levels - door;
  const out: CellBox[] = [];
  for (let level = 1; level <= inside; level++) {
    for (let row = 1; row <= unit.rows; row++) {
      for (let col = 1; col <= unit.cols; col++) {
        out.push({
          id: cellId(level, row, col),
          level,
          row,
          col,
          center: [-W / 2 + w * (col - 0.5), H - h * (level - 0.5), -D / 2 + d * (row - 0.5)],
          size: [w, h, d],
        });
      }
    }
  }
  for (let level = inside + 1; level <= unit.levels; level++) {
    const k = level - inside; // door shelf 1 at the top
    const hd = H / door;
    const y = H - hd * (k - 0.5);
    const across = W / unit.cols; // the door is as wide as the fridge
    const deep = DOOR_DEPTH / unit.rows;
    for (let row = 1; row <= unit.rows; row++) {
      for (let col = 1; col <= unit.cols; col++) {
        out.push({
          id: cellId(level, row, col),
          level,
          row,
          col,
          center: opts.doorOpen
            ? [-W / 2 + deep * (row - 0.5), y, D / 2 + across * (col - 0.5)]
            : [-W / 2 + across * (col - 0.5), y, D / 2 - DOOR_DEPTH + deep * (row - 0.5)],
          size: opts.doorOpen ? [deep, hd, across] : [across, hd, deep],
        });
      }
    }
  }
  return out;
}

// One square of a room's floor plan, in metres.
export const FLOOR_SQUARE = 0.5;

/** A room floor's outer size (width, depth). */
export function floorSize(floor: { rows: number; cols: number }): [number, number] {
  return [floor.cols * FLOOR_SQUARE, floor.rows * FLOOR_SQUARE];
}

/**
 * Where a unit stands in a room: the centre of its spot on the floor, and how
 * much its width/depth are stretched to fill the spot (height stays real).
 * Row 1 of the plan is the far wall, as the 2D plan draws it at the top.
 */
export function placeOnFloor(unit: Shape, spot: FloorSpot, floor: { rows: number; cols: number }): { center: Vec3; scale: Vec3 } {
  const [FW, FD] = floorSize(floor);
  const [W, , D] = unitSize(unit);
  const spotW = spot.w * FLOOR_SQUARE;
  const spotD = spot.h * FLOOR_SQUARE;
  // A little gap all round so neighbours don't touch.
  const fill = 0.9;
  return {
    center: [-FW / 2 + (spot.col - 1) * FLOOR_SQUARE + spotW / 2, 0, -FD / 2 + (spot.row - 1) * FLOOR_SQUARE + spotD / 2],
    scale: [(spotW * fill) / W, 1, (spotD * fill) / D],
  };
}
