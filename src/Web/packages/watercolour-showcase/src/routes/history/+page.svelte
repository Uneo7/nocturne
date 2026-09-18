<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as Pagination from '@nocturne/ui/ui/pagination';
  import * as ToggleGroup from '@nocturne/ui/ui/toggle-group';
  import { Button } from '@nocturne/ui/ui/button';
  import { Badge } from '@nocturne/ui/ui/badge';
  import { Checkbox } from '@nocturne/ui/ui/checkbox';
  import { Artwork, SelectionEdge } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';
  import {
    DATE_RANGES,
    EVENT_TYPES,
    filterEvents,
    generateEvents,
    paginate,
    type DateRange,
    type EventType,
  } from '$lib/synthetic/history';

  const PER_PAGE = 10;
  // Pinned so the events, the pages and the server/client render are stable:
  // `Date.now()` would re-derive the timestamps on every module evaluation and
  // let the same events drift between pages.
  const now = new Date(2026, 8, 18, 9, 0, 0).getTime();
  const all = generateEvents(now, 1610);

  const typeLabels: Record<EventType, string> = { reading: 'Reading', bolus: 'Bolus', carbs: 'Carbs', note: 'Note' };
  const rangeLabels: Record<DateRange, string> = { today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All time' };

  let types = $state<EventType[]>([]);
  let range = $state<DateRange>('30d');
  let page = $state(1);
  let selected = $state<string[]>([]);

  const filtered = $derived(filterEvents(all, { types: new Set(types), range }, now));
  const current = $derived(paginate(filtered, page, PER_PAGE));
  const hasFilters = $derived(types.length > 0 || range !== 'all');

  const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

  function clearFilters() {
    types = [];
    range = 'all';
    page = 1;
  }

  function toggle(id: string, checked: boolean) {
    selected = checked ? [...selected, id] : selected.filter((s) => s !== id);
  }

  const badgeVariant = (t: EventType) => (t === 'bolus' ? 'default' : t === 'carbs' ? 'secondary' : 'outline');
</script>

<svelte:head>
  <title>History - Watercolour showcase</title>
</svelte:head>

<PageHeader title="History" description="Readings, boluses, carbs and notes. Filter, page and select.">
  {#snippet actions()}
    {#if selected.length > 0}
      <Badge variant="secondary">{selected.length} selected</Badge>
      <Button variant="ghost" size="sm" onclick={() => (selected = [])}>Clear selection</Button>
    {/if}
  {/snippet}
</PageHeader>

<Card.Root>
  <Card.Header class="gap-3">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">Type</span>
        <ToggleGroup.Root
          type="multiple"
          variant="outline"
          size="sm"
          bind:value={types}
          onValueChange={() => (page = 1)}
          aria-label="Event type"
          class="justify-start"
        >
          {#each EVENT_TYPES as t (t)}
            <ToggleGroup.Item value={t} aria-label={typeLabels[t]}>{typeLabels[t]}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">Date range</span>
        <ToggleGroup.Root
          type="single"
          variant="outline"
          size="sm"
          bind:value={range}
          onValueChange={(v) => {
            if (!v) range = 'all';
            page = 1;
          }}
          aria-label="Date range"
          class="justify-start"
        >
          {#each DATE_RANGES as r (r)}
            <ToggleGroup.Item value={r} aria-label={rangeLabels[r]}>{rangeLabels[r]}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      </div>
    </div>
    <p class="text-xs text-muted-foreground">{current.total} events, {PER_PAGE} per page.</p>
  </Card.Header>

  <Card.Content class="px-0">
    {#if current.total === 0}
      <div class="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <Artwork artwork="magnifying-glass" {...showcaseSettings.options} class="size-24" />
        <div>
          <p class="font-medium">No events match these filters</p>
          <p class="text-sm text-muted-foreground">Try a wider date range or fewer types.</p>
        </div>
        <Button variant="outline" onclick={clearFilters}>Clear filters</Button>
      </div>
    {:else}
      <ul class="divide-y">
        {#each current.items as e (e.id)}
          {@const isSelected = selected.includes(e.id)}
          <li
            class="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-6 py-3 sm:grid-cols-[auto_7rem_6rem_minmax(0,1fr)_minmax(0,1fr)] {isSelected
              ? 'bg-accent/40'
              : ''}"
            aria-selected={isSelected}
          >
            <SelectionEdge side="left" active={isSelected} palette={showcaseSettings.palette} seed={showcaseSettings.seed} />
            <Checkbox
              checked={isSelected}
              onCheckedChange={(v) => toggle(e.id, v === true)}
              aria-label="Select event at {timeFmt.format(e.at)}"
            />
            <span class="text-sm tabular-nums">
              {dateFmt.format(e.at)}
              <span class="text-muted-foreground">{timeFmt.format(e.at)}</span>
            </span>
            <Badge variant={badgeVariant(e.type)} class="justify-self-end sm:justify-self-start">{typeLabels[e.type]}</Badge>
            <span class="col-start-2 text-sm font-medium tabular-nums sm:col-start-4">{e.value || '—'}</span>
            <span class="col-span-2 col-start-2 truncate text-sm text-muted-foreground sm:col-span-1 sm:col-start-5"
              >{e.notes || ''}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>

  {#if current.totalPages > 1}
    <Card.Footer class="justify-center">
      <Pagination.Root count={current.total} perPage={PER_PAGE} bind:page>
        {#snippet children({ pages, currentPage })}
          <Pagination.Content>
            <Pagination.Item><Pagination.PrevButton /></Pagination.Item>
            {#each pages as p (p.key)}
              {#if p.type === 'ellipsis'}
                <Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
              {:else}
                <Pagination.Item>
                  <Pagination.Link page={p} isActive={currentPage === p.value}>{p.value}</Pagination.Link>
                </Pagination.Item>
              {/if}
            {/each}
            <Pagination.Item><Pagination.NextButton /></Pagination.Item>
          </Pagination.Content>
        {/snippet}
      </Pagination.Root>
    </Card.Footer>
  {/if}
</Card.Root>

{#if hasFilters && current.total > 0}
  <p class="text-xs text-muted-foreground">
    Filters active. <button type="button" class="underline underline-offset-4" onclick={clearFilters}>Show everything</button>
  </p>
{/if}
