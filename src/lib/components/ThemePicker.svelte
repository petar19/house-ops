<script lang="ts">
  import { t } from '../i18n';

  // Auto (follow the device) → light → dark. Saved per device; index.html
  // applies it before first paint so there's no flash of the other theme.
  type Theme = 'auto' | 'light' | 'dark';
  const KEY = 'houseops:theme';
  const ICON: Record<Theme, string> = { auto: '🌓', light: '☀️', dark: '🌙' };
  const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };

  function saved(): Theme {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  }
  let theme = $state<Theme>(saved());

  function cycle() {
    theme = NEXT[theme];
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: just this visit */
    }
  }
</script>

<button type="button" class="theme" onclick={cycle} title={$t(`theme.${theme}`)} aria-label={$t(`theme.${theme}`)}>{ICON[theme]}</button>

<style>
  .theme {
    padding: 0.3em 0.5em;
    font-size: 0.9em;
  }
</style>
