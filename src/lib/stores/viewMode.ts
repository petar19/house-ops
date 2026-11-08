import { writable } from 'svelte/store';

// 2D grid or 3D view for storage units and rooms — one choice for all of
// them, remembered on this device.
export type StorageView = '2d' | '3d';

const KEY = 'houseops:storageView';

function initial(): StorageView {
  try {
    return localStorage.getItem(KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

export const storageView = writable<StorageView>(initial());

storageView.subscribe((v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // private window / storage blocked: just not remembered
  }
});
