<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as Table from '@nocturne/ui/ui/table';
  import { Button } from '@nocturne/ui/ui/button';
  import { Badge } from '@nocturne/ui/ui/badge';
  import { toast } from 'svelte-sonner';
  import Download from '@lucide/svelte/icons/download';
  import { Artwork } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';
  import { computeStats, generateDay } from '$lib/synthetic/glucose';
  import { formatMmol } from '$lib/synthetic/units';

  const weeks = Array.from({ length: 6 }, (_, i) => {
    const stats = computeStats(generateDay(1610 + i * 11));
    const end = new Date(2026, 8, 13 - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { id: `w${i}`, start, end, stats, readings: 1980 + Math.round(Math.sin(i) * 40) };
  });

  const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

  function exportPdf() {
    toast.success('Report queued', { description: 'Synthetic: a PDF would be generated from these weeks.' });
  }
</script>

<svelte:head>
  <title>Reports - Watercolour showcase</title>
</svelte:head>

<Artwork artwork="distant-mountains" {...showcaseSettings.options} class="h-24 w-full sm:h-32" />

<PageHeader title="Reports" description="Weekly summaries over the last six weeks.">
  {#snippet actions()}
    <Button onclick={exportPdf}><Download /> Export PDF</Button>
  {/snippet}
</PageHeader>

<Card.Root>
  <Card.Header>
    <div class="flex items-center gap-2">
      <Artwork artwork="report-pages" {...showcaseSettings.options} class="size-8 shrink-0" />
      <Card.Title>Weekly statistics</Card.Title>
      <Badge variant="outline" class="ml-auto">Computed from synthetic data</Badge>
    </div>
    <Card.Description>Time in range is 70 to 180 mg/dL. Mean shown in mg/dL with mmol/L beneath.</Card.Description>
  </Card.Header>
  <Card.Content class="overflow-x-auto px-0">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="pl-6">Week</Table.Head>
          <Table.Head class="text-right">Readings</Table.Head>
          <Table.Head class="text-right">In range</Table.Head>
          <Table.Head class="text-right">Below</Table.Head>
          <Table.Head class="text-right">Above</Table.Head>
          <Table.Head class="text-right">Mean</Table.Head>
          <Table.Head class="text-right">CV</Table.Head>
          <Table.Head class="pr-6 text-right">GMI</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each weeks as w (w.id)}
          <Table.Row>
            <Table.Cell class="pl-6 whitespace-nowrap">{fmt.format(w.start)} to {fmt.format(w.end)}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{w.readings}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{w.stats.timeInRangePct}%</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{w.stats.timeBelowPct}%</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{w.stats.timeAbovePct}%</Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {w.stats.meanMgdl} mg/dL
              <span class="block text-xs text-muted-foreground">{formatMmol(w.stats.meanMgdl)}</span>
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">{w.stats.cvPct}%</Table.Cell>
            <Table.Cell class="pr-6 text-right tabular-nums">{w.stats.gmiPct}%</Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </Card.Content>
</Card.Root>
