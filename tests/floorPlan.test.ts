import { describe, expect, it } from 'vitest';
import { fitSpot, spotFits } from '../src/lib/storage/floorPlan';

describe('floor plan', () => {
  const floor = { rows: 4, cols: 6 };
  it('slides a spot back inside the plan', () => {
    expect(fitSpot({ row: 4, col: 6, w: 2, h: 2 }, floor)).toEqual({ row: 3, col: 5, w: 2, h: 2 });
  });
  it('shrinks something bigger than the room', () => {
    expect(fitSpot({ row: 1, col: 1, w: 9, h: 1 }, floor)).toEqual({ row: 1, col: 1, w: 6, h: 1 });
  });
  it('knows when a spot falls off a smaller plan', () => {
    expect(spotFits({ row: 3, col: 5, w: 2, h: 2 }, floor)).toBe(true);
    expect(spotFits({ row: 3, col: 5, w: 2, h: 2 }, { rows: 4, cols: 5 })).toBe(false);
  });
});
