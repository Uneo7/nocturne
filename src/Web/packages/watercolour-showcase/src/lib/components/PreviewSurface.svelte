<script lang="ts">
  import type { Snippet } from 'svelte';
  import { showcaseSettings, type PreviewBackground } from '$lib/showcase-settings.svelte';

  let {
    background,
    class: className = '',
    children,
  }: { background?: PreviewBackground; class?: string; children: Snippet } = $props();

  const resolved = $derived(background ?? showcaseSettings.previewBackground);
</script>

<!-- `.dark` is the theme's colour-scheme hook, so a forced preview only needs the class. -->
<div class={resolved === 'dark' ? 'dark' : resolved === 'light' ? 'light' : ''}>
  <div class="rounded-lg border bg-background p-4 text-foreground {className}">
    {@render children()}
  </div>
</div>
