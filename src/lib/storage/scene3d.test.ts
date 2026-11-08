import { describe, expect, it } from 'vitest';
import { cellBoxes, cellSize, DOOR_DEPTH, placeOnFloor, unitSize } from './scene3d';
import { doorShelfCount, isDoorLevel, levelLabel } from './layout';

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

  describe('a fridge', () => {
    const fridge = { kind: 'fridge' as const, levels: 7, rows: 1, cols: 1, doorShelves: 3 };

    it('is as tall as its shelves inside, with the door shelves along the front', () => {
      const [, h] = cellSize(fridge);
      const [, H, D] = unitSize(fridge);
      expect(H).toBeCloseTo(4 * h);
      const boxes = cellBoxes(fridge);
      expect(boxes.map((b) => b.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      const door = boxes.filter((b) => b.level > 4);
      expect(door.every((b) => b.center[2] > boxes[0].center[2])).toBe(true);
      expect(Math.max(...door.map((b) => b.center[2] + b.size[2] / 2))).toBeCloseTo(D / 2);
      // Door shelf 1 on top, and together they're the fridge's height.
      expect(door[0].center[1]).toBeGreaterThan(door[2].center[1]);
      expect(door.reduce((sum, b) => sum + b.size[1], 0)).toBeCloseTo(H);
    });

    it('swings the door open to the left, reaching out in front', () => {
      const [W, , D] = unitSize(fridge);
      const door = cellBoxes(fridge, { doorOpen: true }).filter((b) => b.level > 4);
      for (const b of door) {
        expect(b.center[0]).toBeCloseTo(-W / 2 + DOOR_DEPTH / 2);
        expect(b.center[2]).toBeGreaterThan(D / 2);
        expect(b.size[2]).toBeCloseTo(W);
      }
    });

    it('labels the door shelves apart', () => {
      const t = (key: string, p?: Record<string, unknown>) => `${key}:${p?.n ?? ''}`;
      const unit = { ...fridge, levelNames: {} };
      expect(levelLabel(unit, 4, t)).toBe('storage.level.fridge:4');
      expect(levelLabel(unit, 5, t)).toBe('storage.level.fridgeDoor:1');
      expect(levelLabel(unit, 7, t)).toBe('storage.level.fridgeDoor:3');
      expect(isDoorLevel(unit, 4)).toBe(false);
      // Never all of them, and only for a fridge.
      expect(doorShelfCount({ ...fridge, doorShelves: 9 })).toBe(6);
      expect(doorShelfCount({ ...fridge, kind: 'shelving' })).toBe(0);
    });
  });
});
