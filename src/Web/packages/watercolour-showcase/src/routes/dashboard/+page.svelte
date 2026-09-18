<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as Tabs from '@nocturne/ui/ui/tabs';
  import * as Tooltip from '@nocturne/ui/ui/tooltip';
  import { Badge } from '@nocturne/ui/ui/badge';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import { HeaderMotif, PaintedUnderline } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GlucoseLineChart from '$lib/components/GlucoseLineChart.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';
  import { computeStats, generateDay } from '$lib/synthetic/glucose';
  import { formatMmol } from '$lib/synthetic/units';

  type Range = 'today' | '7d' | '30d';
  const ranges: { value: Range; label: string; seedOffset: number }[] = [
    { value: 'today', label: 'Today', seedOffset: 0 },
    { value: '7d', label: '7 days', seedOffset: 7 },
    { value: '30d', label: '30 days', seedOffset: 30 },
  ];

  let range = $state<Range>('today');

  const seedOffset = $derived(ranges.find((r) => r.value === range)?.seedOffset ?? 0);
  const points = $derived(generateDay(showcaseSettings.seed + seedOffset));
  const stats = $derived(computeStats(points));
  const current = $derived(points[points.length - 1]);

  const tiles = $derived([
    { label: 'Time in range', value: `${stats.timeInRangePct}%`, detail: '70 to 180 mg/dL' },
    { label: 'Mean', value: `${stats.meanMgdl} mg/dL`, detail: formatMmol(stats.meanMgdl) },
    { label: 'Coefficient of variation', value: `${stats.cvPct}%`, detail: 'SD divided by mean' },
    { label: 'GMI', value: `${stats.gmiPct}%`, detail: 'Glucose management indicator' },
  ]);
</script>

<svelte:head>
  <title>Dashboard - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Dashboard" description="Current reading, the last 24 hours, and summary statistics.">
  {#snippet motif()}
    <HeaderMotif palette={showcaseSettings.palette} seed={showcaseSettings.seed} class="hidden sm:flex" />
  {/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
  <Card.Root>
    <Card.Header>
      <Card.Description>Current reading</Card.Description>
    </Card.Header>
    <Card.Content>
      <Tooltip.Root>
        <Tooltip.Trigger class="flex items-baseline gap-2 text-left">
          <span class="text-6xl font-semibold tabular-nums tracking-tight">{current.mgdl}</span>
          <span class="text-lg text-muted-foreground">mg/dL</span>
          <ArrowUpRight class="size-8 self-center" aria-label="Rising slowly" />
        </Tooltip.Trigger>
        <Tooltip.Content>{formatMmol(current.mgdl)}</Tooltip.Content>
      </Tooltip.Root>
      <p class="mt-1 text-sm text-muted-foreground">6 min ago</p>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Tabs.Root bind:value={range}>
        <Tabs.List class="w-full sm:w-auto">
          {#each ranges as r (r.value)}
            <Tabs.Trigger value={r.value} class="relative flex-col gap-0.5">
              <span>{r.label}</span>
              <PaintedUnderline
                active={range === r.value}
                palette={showcaseSettings.palette}
                seed={showcaseSettings.seed}
                class="w-full"
              />
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    </Card.Header>
    <Card.Content>
      <GlucoseLineChart {points} />
      <p class="mt-2 text-xs text-muted-foreground">
        Shaded band is 70 to 180 mg/dL. Synthetic trace; the tabs reseed it to stand in for longer windows.
      </p>
    </Card.Content>
  </Card.Root>
</div>

<section aria-labelledby="stats-heading" class="flex flex-col gap-3">
  <div class="flex items-center gap-2">
    <h2 id="stats-heading" class="text-lg font-medium">Statistics</h2>
    <Badge variant="outline">Computed from synthetic data</Badge>
  </div>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {#each tiles as tile (tile.label)}
      <Card.Root>
        <Card.Header>
          <Card.Description>{tile.label}</Card.Description>
          <Card.Title class="text-2xl tabular-nums">{tile.value}</Card.Title>
        </Card.Header>
        <Card.Content class="text-xs text-muted-foreground">{tile.detail}</Card.Content>
      </Card.Root>
    {/each}
  </div>
</section>
