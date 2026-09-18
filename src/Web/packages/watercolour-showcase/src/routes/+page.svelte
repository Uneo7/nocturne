<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { Artwork } from '$lib/artwork';
  import { NAV_PAGES } from '$lib/nav';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';

  const pages = NAV_PAGES.filter((p) => p.href !== '/');
</script>

<svelte:head>
  <title>Overview - Watercolour showcase</title>
</svelte:head>

<section class="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  <div class="flex flex-col gap-3">
    <h1 class="text-3xl font-semibold tracking-tight">Watercolour graphics, in context</h1>
    <p class="text-muted-foreground">
      Each page here is a conventional Nocturne screen built on synthetic data, with the places
      artwork will sit marked out. Readings, controls and alerts stay crisp; artwork is decorative
      and never sits behind text.
    </p>
    <p class="text-sm text-muted-foreground">
      Use the settings control in the header to change palette, seed, motion and playback mode for
      every artwork at once.
    </p>
  </div>
  <Artwork artwork="moonlit-shoreline" {...showcaseSettings.options} class="aspect-[16/9] w-full" />
</section>

<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  {#each pages as item (item.href)}
    <a href={item.href} class="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card.Root class="h-full transition-colors group-hover:bg-accent/40">
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-base">
            <item.icon class="size-4 text-muted-foreground" />
            {item.label}
            <ArrowRight class="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Card.Title>
          <Card.Description>{item.description}</Card.Description>
        </Card.Header>
      </Card.Root>
    </a>
  {/each}
</section>
