<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    motif,
    actions,
  }: { title: string; description?: string; motif?: Snippet; actions?: Snippet } = $props();
</script>

<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div class="min-w-0">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
      {@render motif?.()}
    </div>
    {#if description}
      <p class="mt-1 text-sm text-muted-foreground">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 flex-wrap gap-2">{@render actions()}</div>
  {/if}
</header>
