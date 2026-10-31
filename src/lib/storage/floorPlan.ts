import type { FloorSpot } from '../types';

export const DEFAULT_FLOOR = { rows: 6, cols: 8 };
export const MAX_FLOOR = 20;

/** Keeps a spot inside the plan: shrinks it if too big, slides it back in if it hangs over the edge. */
export function fitSpot(spot: FloorSpot, floor: { rows: number; cols: number }): FloorSpot {
  const w = Math.min(Math.max(1, Math.round(spot.w)), floor.cols);
  const h = Math.min(Math.max(1, Math.round(spot.h)), floor.rows);
  const col = Math.min(Math.max(1, Math.round(spot.col)), floor.cols - w + 1);
  const row = Math.min(Math.max(1, Math.round(spot.row)), floor.rows - h + 1);
  return { row, col, w, h };
}

/** Whether a spot still fits a (possibly smaller) plan as it is. */
export function spotFits(spot: FloorSpot, floor: { rows: number; cols: number }): boolean {
  return spot.row >= 1 && spot.col >= 1 && spot.row + spot.h - 1 <= floor.rows && spot.col + spot.w - 1 <= floor.cols;
}
