// Drag an item (or container) name from one cell of a unit's grid onto
// another. Works with a mouse (press and move) and on touch screens (press
// and hold, then move — a quick swipe still scrolls the page). Cells mark
// themselves with data-drop-cell; only cells of the same grid accept a drop.

export interface DragToCellOptions {
  enabled: boolean;
  fromCell: string;
  label: string;
  onDrop: (toCell: string) => void;
}

const HOLD_MS = 350;
const MOVE_PX = 8;

export function dragToCell(node: HTMLElement, initial: DragToCellOptions) {
  let opts = initial;
  let startX = 0;
  let startY = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false; // pressed, not dragging yet
  let ghost: HTMLElement | null = null;
  let over: HTMLElement | null = null;

  const grid = () => node.closest('.unit-grid');

  function targetAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-cell]') ?? null;
    return el && el.closest('.unit-grid') === grid() ? el : null;
  }

  function begin(x: number, y: number) {
    pending = false;
    ghost = document.createElement('div');
    ghost.textContent = opts.label;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '1000',
      pointerEvents: 'none',
      padding: '0.3em 0.7em',
      borderRadius: '8px',
      background: 'var(--accent)',
      color: 'var(--accent-text)',
      fontSize: '0.9em',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(ghost);
    document.body.classList.add('cell-dragging');
    navigator.vibrate?.(15);
    window.addEventListener('touchmove', blockScroll, { passive: false });
    move(x, y);
  }

  function move(x: number, y: number) {
    if (!ghost) return;
    ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    const t = targetAt(x, y);
    if (t !== over) {
      over?.classList.remove('drop-over');
      over = t && t.dataset.dropCell !== opts.fromCell ? t : null;
      over?.classList.add('drop-over');
    }
  }

  function blockScroll(e: TouchEvent) {
    e.preventDefault();
  }

  // The cell under the finger would otherwise get the click that ends the
  // drag and open itself.
  function swallowNextClick() {
    const stop = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 300);
  }

  function end(drop: boolean) {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    pending = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('touchmove', blockScroll);
    if (!ghost) return;
    const target = over?.dataset.dropCell;
    over?.classList.remove('drop-over');
    over = null;
    ghost.remove();
    ghost = null;
    document.body.classList.remove('cell-dragging');
    swallowNextClick();
    if (drop && target && target !== opts.fromCell) opts.onDrop(target);
  }

  function onMove(e: PointerEvent) {
    if (ghost) {
      move(e.clientX, e.clientY);
      return;
    }
    if (!pending) return;
    const far = Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_PX;
    if (!far) return;
    if (e.pointerType === 'mouse') begin(e.clientX, e.clientY);
    else end(false); // moved before the hold finished: it's a scroll
  }
  const onUp = () => end(true);
  const onCancel = () => end(false);

  function onDown(e: PointerEvent) {
    if (!opts.enabled || e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    pending = true;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (e.pointerType !== 'mouse') {
      holdTimer = setTimeout(() => {
        if (pending) begin(startX, startY);
      }, HOLD_MS);
    }
  }

  node.addEventListener('pointerdown', onDown);
  // No long-press menu / text selection getting in the way on phones.
  const noMenu = (e: Event) => opts.enabled && e.preventDefault();
  node.addEventListener('contextmenu', noMenu);

  return {
    update(next: DragToCellOptions) {
      opts = next;
    },
    destroy() {
      end(false);
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('contextmenu', noMenu);
    },
  };
}
