<script lang="ts">
  import { setMode, userPrefersMode } from 'mode-watcher';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Monitor from '@lucide/svelte/icons/monitor';
  import { Button } from '@nocturne/ui/ui/button';

  const order = ['light', 'dark', 'system'] as const;
  const labels = { light: 'Light theme', dark: 'Dark theme', system: 'Follow system theme' } as const;

  const current = $derived(userPrefersMode.current ?? 'system');

  function cycle() {
    setMode(order[(order.indexOf(current) + 1) % order.length]);
  }
</script>

<Button variant="ghost" size="icon" onclick={cycle} aria-label={labels[current]} title={labels[current]}>
  {#if current === 'light'}
    <Sun />
  {:else if current === 'dark'}
    <Moon />
  {:else}
    <Monitor />
  {/if}
</Button>
