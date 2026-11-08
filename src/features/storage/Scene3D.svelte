<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
  import { t } from '../../lib/i18n';
  import { dispose, readPalette, type Built, type Palette } from '../../lib/storage/render3d';

  // The 3D canvas: turn it with a finger or the mouse, pinch or scroll to
  // zoom, tap something to open it. Draws only when something changes (no
  // animation loop), so it costs nothing while you just look at it.
  let {
    build,
    onPick,
    viewKey,
  }: {
    build: (pal: Palette) => Built;
    onPick: (pick: Record<string, string>) => void;
    // A new key frames the camera afresh (another unit); the same key keeps
    // where you turned it to while the contents change.
    viewKey: string;
  } = $props();

  let host: HTMLDivElement = $state()!;
  let failed = $state(false);
  let palVersion = $state(0);

  let renderer: THREE.WebGLRenderer | null = null;
  let labelRenderer: CSS2DRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let current: Built | null = null;
  let framedKey: string | null = null;
  let lastSize: [number, number, number] = [1, 1, 1];

  function render() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    labelRenderer?.render(scene, camera);
  }

  function frame(size: [number, number, number]) {
    if (!camera || !controls) return;
    lastSize = size;
    const [W, H, D] = size;
    const radius = 0.5 * Math.hypot(W, H, D);
    // Fit both ways: on a narrow phone screen the width is what limits.
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const distance = Math.max((radius / Math.sin(vfov / 2)) * 0.85, radius / Math.sin(hfov / 2));
    const dir = new THREE.Vector3(0.45, 0.55, 1).normalize();
    controls.target.set(0, H / 2, 0);
    camera.position.copy(dir.multiplyScalar(distance).add(controls.target));
    controls.minDistance = radius * 0.5;
    controls.maxDistance = distance * 3;
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
    controls.update();
  }

  export function resetView() {
    frame(lastSize);
    render();
  }

  function rebuild() {
    if (!scene) return;
    if (current) {
      scene.remove(current.root);
      for (const l of current.labels) scene.remove(l.object);
      dispose(current.root);
    }
    current = build(readPalette());
    scene.add(current.root);
    for (const l of current.labels) {
      const pick = l.pick;
      l.object.element.addEventListener('click', () => onPick(pick));
      scene.add(l.object);
    }
    if (framedKey !== viewKey) {
      framedKey = viewKey;
      frame(current.size);
    }
    render();
  }

  $effect(() => {
    void palVersion;
    void viewKey;
    void build;
    rebuild();
  });

  // A tap (not a turn) on something opens it.
  let downAt: { x: number; y: number } | null = null;
  function pointerDown(e: PointerEvent) {
    downAt = { x: e.clientX, y: e.clientY };
  }
  function pointerUp(e: PointerEvent) {
    if (!downAt || !renderer || !camera || !current) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(current.pickables, false)[0];
    if (hit) onPick(hit.object.userData as Record<string, string>);
  }

  onMount(() => {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      failed = true;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'labels';
    host.appendChild(labelRenderer.domElement);

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.49; // never from under the floor
    controls.addEventListener('change', render);

    const resize = () => {
      if (!renderer || !camera) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      labelRenderer?.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    rebuild();

    // Theme switched (or the system went dark): recolour.
    const themeWatch = new MutationObserver(() => palVersion++);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => palVersion++;
    media.addEventListener('change', onMedia);

    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);

    return () => {
      observer.disconnect();
      themeWatch.disconnect();
      media.removeEventListener('change', onMedia);
      controls?.dispose();
      if (current) dispose(current.root);
      renderer?.dispose();
      renderer?.domElement.remove();
      labelRenderer?.domElement.remove();
      renderer = null;
      scene = null;
    };
  });
</script>

{#if failed}
  <p class="muted">{$t('view3d.unsupported')}</p>
{:else}
  <div class="scene" bind:this={host}></div>
{/if}

<style>
  .scene {
    position: relative;
    width: 100%;
    height: min(70vh, 26rem);
    touch-action: none;
    border-radius: 8px;
    background: var(--bg);
    overflow: hidden;
  }
  .scene :global(canvas) {
    display: block;
  }
  .scene :global(.labels) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }
  .scene :global(.label3d) {
    pointer-events: auto;
    cursor: pointer;
    max-width: 9rem;
    padding: 0.1em 0.45em;
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 0.75rem;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .scene :global(.label3d.low) {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
