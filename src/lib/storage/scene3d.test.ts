import { describe, expect, it } from 'vitest';
import { cellBoxes, cellSize, placeOnFloor, unitSize } from './scene3d';

describe('3D layout', () => {
  const shelves = { kind: 'shelving' as const, levels: 5, rows: 1, cols: 3 };

  it('gives every cell a box, level 1 on top and row 1 at the back', () => {
    const boxes = cellBoxes({ kind: 'chest', levels: 3, rows: 2, cols: 4 });
    expect(boxes).toHaveLength(24);
    const top = boxes.find((b) => b.id === '1.1.1')!;
    const bottom = boxes.find((b) => b.id === '3.1.1')!;
    const front = boxes.find((b) => b.id === '1.2.1')!;
    expect(top.center[1]).toBeGreaterThan(bottom.center[1]);
    expect(front.center[2]).toBeGreaterThan(top.center[2]);
    expect(boxes.find((b) => b.id === '1.1.4')!.center[0]).toBeGreaterThan(top.center[0]);
  });

  it('stands on the floor, centred', () => {
    const boxes = cellBoxes(shelves);
    const [, h] = cellSize(shelves);
    const lowest = Math.min(...boxes.map((b) => b.center[1] - b.size[1] / 2));
    expect(lowest).toBeCloseTo(0);
    expect(Math.max(...boxes.map((b) => b.center[1] + h / 2))).toBeCloseTo(unitSize(shelves)[1]);
    const xs = boxes.map((b) => b.center[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
  });

  it('keeps big units furniture-sized', () => {
    const [w, h, d] = unitSize({ kind: 'shelving', levels: 20, rows: 6, cols: 8 });
    expect(w).toBeLessThanOrEqual(2.4);
    expect(h).toBeLessThanOrEqual(2.2);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('puts a unit on its floor spot', () => {
    const floor = { rows: 6, cols: 8 }; // 4 m × 3 m
    const { center, scale } = placeOnFloor(shelves, { row: 1, col: 1, w: 2, h: 1 }, floor);
    expect(center[0]).toBeCloseTo(-2 + 0.5);
    expect(center[2]).toBeCloseTo(-1.5 + 0.25);
    expect(unitSize(shelves)[0] * scale[0]).toBeCloseTo(0.9);
    expect(scale[1]).toBe(1);
  });
});
