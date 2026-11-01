<script lang="ts">
  import type { Chart, ChartConfiguration } from 'chart.js/auto';

  // chart.js is loaded only when a chart is first shown (its own chunk).
  let { config, height = 260 }: { config: ChartConfiguration; height?: number } = $props();

  let canvasEl: HTMLCanvasElement;
  let chart: Chart | null = null;

  $effect(() => {
    const cfg = config;
    let cancelled = false;
    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled) return;
      chart?.destroy();
      chart = new Chart(canvasEl, cfg);
    });
    return () => {
      cancelled = true;
      chart?.destroy();
      chart = null;
    };
  });
</script>

<div style={`height:${height}px`}>
  <canvas bind:this={canvasEl}></canvas>
</div>
