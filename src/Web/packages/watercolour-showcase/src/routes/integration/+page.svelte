<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import { Artwork, HeaderMotif } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';

  const importExample = `import { Artwork, HeaderMotif } from '@nocturne/watercolour';`;

  const pageTitleExample = `<script lang="ts">
  import { HeaderMotif } from '@nocturne/watercolour';
  import { getSettingsStore } from '$lib/stores/settings-store.svelte';

  let { title, description } = $props();
  const settings = getSettingsStore();
<\/script>

<header class="flex items-center gap-3">
  <h1 class="text-2xl font-semibold">{title}</h1>
  <HeaderMotif palette={settings.accentPalette} seed={settings.artworkSeed} class="hidden sm:flex" />
</header>
{#if description}<p class="text-muted-foreground">{description}</p>{/if}`;

  const optionsExample = `<Artwork
  artwork="moonlit-shoreline"
  palette="moonlight"
  seed={1610}
  motion="auto"      {/* honours prefers-reduced-motion */}
  mode="auto"        {/* live, baked or static, chosen per device */}
  quality="auto"
  class="aspect-[16/9] w-full"
/>`;

  const rules = [
    'Artwork is decorative: every component renders aria-hidden and carries no meaning the page does not also state in text.',
    'Never behind text. Put a motif beside a title, a hero beside copy, an edge along a row; never as a card background under readings.',
    'Alerts and clinical values take no artwork. An urgent alert renders its message and actions on the first frame with no motion.',
    'Motion defaults to the system preference. Pass motion="full" only when the user has opted in.',
    'Pass the palette and seed from the user preferences store so the same person sees the same wash everywhere.',
  ];
</script>

<svelte:head>
  <title>Integration - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Integrating into the app" description="How @nocturne/app should consume the components, with a live example.">
  {#snippet motif()}
    <HeaderMotif palette={showcaseSettings.palette} seed={showcaseSettings.seed} class="hidden sm:flex" />
  {/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <div class="flex flex-col gap-6">
    <Card.Root>
      <Card.Header>
        <Card.Title>Install and import</Card.Title>
        <Card.Description>
          The components ship from the <code class="rounded bg-muted px-1 py-0.5 text-xs">@nocturne/watercolour</code> workspace package
          and are the same ones every showcase page renders.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <pre class="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{importExample}</code></pre>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>A page title with a motif</Card.Title>
        <Card.Description>
          The natural home is a shared page-header component in <code class="rounded bg-muted px-1 py-0.5 text-xs">src/lib/components/</code>,
          so every settings and report page picks it up at once.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <pre class="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{pageTitleExample}</code></pre>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Options</Card.Title>
        <Card.Description>Every option is optional; the defaults are the safe ones.</Card.Description>
      </Card.Header>
      <Card.Content>
        <pre class="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{optionsExample}</code></pre>
      </Card.Content>
    </Card.Root>
  </div>

  <div class="flex flex-col gap-6">
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Card.Title>Live example</Card.Title>
        </div>
        <Card.Description>The page-header pattern above, rendered with the current showcase settings.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="rounded-lg border p-4">
          <header class="flex items-center gap-3">
            <h2 class="text-xl font-semibold">Reports</h2>
            <HeaderMotif palette={showcaseSettings.palette} seed={showcaseSettings.seed} class="w-24" />
          </header>
          <p class="mt-1 text-sm text-muted-foreground">Weekly summaries over the last six weeks.</p>
          <div class="mt-4 flex items-center gap-3">
            <Artwork artwork="report-pages" {...showcaseSettings.options} class="size-8" />
            <span class="text-sm">Weekly statistics</span>
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Rules of use</Card.Title>
      </Card.Header>
      <Card.Content>
        <ul class="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {#each rules as rule (rule)}
            <li>{rule}</li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  </div>
</div>
