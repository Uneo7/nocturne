<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as Select from '@nocturne/ui/ui/select';
  import * as ToggleGroup from '@nocturne/ui/ui/toggle-group';
  import { Button } from '@nocturne/ui/ui/button';
  import { Label } from '@nocturne/ui/ui/label';
  import { Slider } from '@nocturne/ui/ui/slider';
  import { Switch } from '@nocturne/ui/ui/switch';
  import Server from '@lucide/svelte/icons/server';
  import Database from '@lucide/svelte/icons/database';
  import Bell from '@lucide/svelte/icons/bell';
  import Users from '@lucide/svelte/icons/users';
  import Shield from '@lucide/svelte/icons/shield';
  import Heart from '@lucide/svelte/icons/heart';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Play from '@lucide/svelte/icons/play';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { Component } from 'svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PreviewSurface from '$lib/components/PreviewSurface.svelte';
  import {
    DEFAULT_MAX_LIVE_INSTANCES,
    DropGroup,
    DropSurface,
    PALETTE_IDS,
    detailForEdge,
    getEngineHost,
  } from '$lib/artwork';
  import type { ArtworkMode, DropFonts, DropReveal, PaletteId } from '$lib/artwork';

  interface Feature {
    icon: Component;
    title: string;
    copy: string;
  }

  const FEATURES: readonly Feature[] = [
    { icon: Server, title: 'Your server, your data', copy: 'Self-hosted, with no cloud middleman in the way.' },
    { icon: Database, title: 'Built for years of data', copy: 'PostgreSQL underneath, queried for the long run.' },
    { icon: Bell, title: 'Alarms that reach you', copy: 'Push, email, or a bot in the chat you already use.' },
    { icon: Users, title: 'One install, many people', copy: 'A household or a clinic on one deployment.' },
    { icon: Shield, title: 'Free and open source', copy: 'AGPL-3.0 licensed, stewarded by the Foundation.' },
    { icon: Heart, title: 'Built by the community', copy: 'Volunteers, everywhere, scratching their own itch.' },
  ];

  const ACTIONS = ['Connect a device', 'Invite someone', 'Export a report'] as const;

  const ROWS = [
    { name: 'Dexcom G7', detail: 'Connected, last reading 4 minutes ago' },
    { name: 'Omnipod 5', detail: 'Connected, last upload 11 minutes ago' },
    { name: 'Libre 3', detail: 'Needs re-authorisation' },
  ] as const;

  /**
   * The fonts Pretext measures with.
   *
   * Each has to match the CSS on the element it is named for. `text-sm` is
   * 14 px on a 20 px line, and the body face is the theme's. A stack that does
   * not match returns line boxes for text that was never drawn.
   */
  const SANS = '"Cabin", sans-serif';
  const CARD_FONTS: DropFonts = {
    title: { font: `600 14px ${SANS}`, lineHeight: 20 },
    copy: { font: `400 14px ${SANS}`, lineHeight: 20 },
  };
  const ROW_FONTS: DropFonts = {
    name: { font: `500 14px ${SANS}`, lineHeight: 20 },
    detail: { font: `400 12px ${SANS}`, lineHeight: 16 },
  };

  const REVEALS: readonly DropReveal[] = ['fade', 'mask', 'flip'];
  const REVEAL_LABELS: Record<DropReveal, string> = {
    none: 'None',
    fade: 'Fade',
    mask: 'Mask',
    flip: 'Mask and travel',
  };

  const MODES: readonly ArtworkMode[] = ['live', 'baked', 'static'];
  const MODE_LABELS: Record<string, string> = {
    live: 'Live',
    baked: 'Baked strip',
    static: 'Still',
  };

  let mode = $state<ArtworkMode>('static');
  let hold = $state(false);
  let measured = $state(true);
  let reveal = $state<DropReveal>('mask');
  let themeColour = $state<PaletteId | 'none'>('none');
  let tintSurface = $state(false);
  let generation = $state(0);
  let resolved = $state(new Map<string, string>());

  /**
   * The strip that puts the reveals beside each other. The engine's own is the
   * reference, and it cannot be scrubbed: it plays on its own clock.
   */
  const COMPARISON = [
    { key: 'live', label: 'The engine, live', reveal: 'none' as DropReveal, live: true },
    ...REVEALS.map((r) => ({ key: r, label: REVEAL_LABELS[r], reveal: r, live: false })),
  ];

  /** The baked columns: scrubbed by the slider, or played by the button. */
  let scrub = $state(0.42);
  let playing = $state(false);
  let playGeneration = $state(0);


  const palette = $derived<PaletteId | undefined>(themeColour === 'none' ? undefined : themeColour);
  const fonts = $derived(measured ? CARD_FONTS : undefined);
  const rowFonts = $derived(measured ? ROW_FONTS : undefined);
  // Read off the resolved rows: the host has no stats until an engine exists,
  // and there is no event to watch for one appearing.
  const leases = $derived(resolved.size >= 0 ? (getEngineHost().stats()?.liveInstances ?? 0) : 0);

  function record(key: string, value: string) {
    resolved = new Map(resolved).set(key, value);
  }

  function repaint() {
    resolved = new Map();
    generation += 1;
  }

  /**
   * The first engine acquire blocks the main thread for a few hundred ms while
   * the wasm module loads and WebGPU hands over a device. Paid on the first
   * pointer-enter, it freezes the transition that pointer just started, so it
   * is paid here instead. A machine with no GPU reports false and is served by
   * the baked path, which is what it would have fallen back to anyway.
   */
  $effect(() => {
    void getEngineHost().warm();
  });

  function play() {
    playing = false;
    playGeneration += 1;
    requestAnimationFrame(() => requestAnimationFrame(() => (playing = true)));
  }
</script>

<svelte:head>
  <title>Paint drops - Watercolour showcase</title>
</svelte:head>

<PageHeader
  title="Paint drops"
  description="Abstract marks placed in a surface's free space on hover, painted by the engine rather than served as stills."
/>

<div class="grid gap-6">
  <Card.Root>
    <Card.Header>
      <Card.Title>Controls</Card.Title>
      <Card.Description>
        A live mark is simulated in the browser from the same scene the bake runs, and the engine allows
        {DEFAULT_MAX_LIVE_INSTANCES} at once. A baked mark plays a shipped frame strip. A still is the finished
        paint alone, which is all the mask reveal needs - and the cheapest of the three by some way.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4">
      <div class="flex flex-wrap items-center gap-6">
        <div class="flex items-center gap-2">
          <Switch id="drops-hold" checked={hold} onCheckedChange={(v) => (hold = v)} />
          <Label for="drops-hold">Hold everything</Label>
        </div>
        <div class="flex items-center gap-2">
          <Switch
            id="drops-measured"
            checked={measured}
            onCheckedChange={(v) => { measured = v; repaint(); }}
          />
          <Label for="drops-measured">Measure off the DOM</Label>
        </div>
        <div class="flex items-center gap-2">
          <Switch id="drops-tint" checked={tintSurface} onCheckedChange={(v) => (tintSurface = v)} />
          <Label for="drops-tint">Tint the surface</Label>
        </div>
        <Button variant="outline" size="sm" onclick={repaint}><RotateCcw /> Repaint</Button>
        <p class="font-mono text-xs text-muted-foreground">
          live instances {leases} / {DEFAULT_MAX_LIVE_INSTANCES}
        </p>
      </div>
      <div class="flex flex-wrap items-end gap-6">
        <div class="grid gap-1">
          <span class="text-xs font-medium text-muted-foreground">What paints the mark</span>
          <ToggleGroup.Root
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(v) => { if (v) { mode = v as ArtworkMode; repaint(); } }}
            aria-label="Backend"
            class="justify-start"
          >
            {#each MODES as m (m)}
              <ToggleGroup.Item value={m} aria-label={MODE_LABELS[m]}>{MODE_LABELS[m]}</ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </div>
        <div class="grid gap-1">
          <span class="text-xs font-medium text-muted-foreground">How a still arrives</span>
          <ToggleGroup.Root
            type="single"
            variant="outline"
            size="sm"
            value={reveal}
            onValueChange={(v) => { if (v) reveal = v as DropReveal; }}
            aria-label="Reveal"
            class="justify-start"
          >
            {#each REVEALS as r (r)}
              <ToggleGroup.Item value={r} aria-label={REVEAL_LABELS[r]}>{REVEAL_LABELS[r]}</ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </div>
        <div class="grid gap-1">
          <span class="text-xs font-medium text-muted-foreground">Theme colour</span>
          <Select.Root
            type="single"
            value={themeColour}
            onValueChange={(v) => { themeColour = v as PaletteId | 'none'; repaint(); }}
          >
            <Select.Trigger class="w-44" aria-label="Theme colour">
              {themeColour === 'none' ? 'Each mark as baked' : themeColour}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none" label="Each mark as baked">Each mark as baked</Select.Item>
              {#each PALETTE_IDS as p (p)}
                <Select.Item value={p} label={p}>{p}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        A live mark takes the palette directly, so a theme colour is exact. A baked one ships in one palette only
        and is steered with a filter, which moves the granulation with the pigment - compare the two.
      </p>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>How it arrives</Card.Title>
      <Card.Description>
        The same mark on the same card. The engine's own reveal is the reference and plays on its own clock; the
        three baked ones are pinned at one instant, so drag to scrub them together, or play everything. A fade is
        the generic UI pop. The mask uncovers the paint's own dried edge from where the brush touched down, and
        gains pigment after it has stopped spreading.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4">
      <div class="flex flex-wrap items-center gap-4">
        <Button variant="outline" size="sm" onclick={play}><Play /> Play</Button>
        <div class="flex min-w-64 flex-1 items-center gap-3">
          <Slider type="single" bind:value={scrub} min={0} max={1} step={0.01} aria-label="Reveal progress" />
          <span class="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
            {Math.round(scrub * 100)} %
          </span>
        </div>
      </div>
      <PreviewSurface>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {#each COMPARISON as column (column.key)}
            <div class="grid gap-2">
              <p class="text-xs font-medium text-muted-foreground">{column.label}</p>
              {#key playGeneration}
                <DropSurface
                  index={1}
                  name="compare-{column.key}"
                  mode={column.live ? 'live' : mode === 'live' ? 'static' : mode}
                  {palette}
                  {tintSurface}
                  fonts={CARD_FONTS}
                  reveal={column.reveal}
                  progress={playing || column.live ? undefined : scrub}
                  shown={playing || column.live ? playing : undefined}
                  onresolved={record}
                  class="rounded-xl border bg-card"
                  contentClass="flex items-start gap-3 p-4"
                >
                  <div
                    data-drop-obstacle
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <Server class="size-5" />
                  </div>
                  <div class="min-w-0">
                    <h3 data-drop-text="title" class="text-sm font-semibold">Your server, your data</h3>
                    <p data-drop-text="copy" class="mt-0.5 text-sm text-muted-foreground">
                      Self-hosted, with no cloud middleman in the way.
                    </p>
                  </div>
                </DropSurface>
              {/key}
            </div>
          {/each}
        </div>
      </PreviewSurface>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Feature cards</Card.Title>
      <Card.Description>
        The case the marks were designed for: a wide hitbox, a glyph, two lines of copy and real empty space beside
        them. Consecutive cards never lead with the same mark in the same place.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <PreviewSurface>
        <DropGroup name="feature cards">
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {#each FEATURES as feature (feature.title)}
              {@const Icon = feature.icon}
              <DropSurface
                {mode}
                {generation}
                {reveal}
                {palette}
                {tintSurface}
                {fonts}
                name={feature.title}
                shown={hold ? true : undefined}
                onresolved={record}
                class="rounded-xl border bg-card transition-shadow hover:shadow-sm"
                contentClass="flex items-start gap-3 p-4"
              >
                <div
                  data-drop-obstacle
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <Icon class="size-5" />
                </div>
                <div class="min-w-0">
                  <h3 data-drop-text="title" class="text-sm font-semibold">{feature.title}</h3>
                  <p data-drop-text="copy" class="mt-0.5 text-sm text-muted-foreground">{feature.copy}</p>
                </div>
              </DropSurface>
            {/each}
          </div>
        </DropGroup>
      </PreviewSurface>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Buttons</Card.Title>
      <Card.Description>
        A button is nearly all label, so there is no empty space for a mark to find. These are the large buttons,
        not the icon ones: below a 64 px edge the catalogue drops to <code>{detailForEdge(63)}</code> detail and
        the engine discards the brushwork. An edge mark on a 40 px control is either a hairline nobody sees or,
        stretched until they do, a slab. The wash puts one mark over the whole control instead, behind the label.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4">
      <PreviewSurface>
        <div class="grid gap-4">
          <div class="grid gap-2">
            <p class="text-xs font-medium text-muted-foreground">Washed</p>
            <DropGroup name="wash buttons">
              <div class="flex flex-wrap gap-3">
                {#each ACTIONS as action (action)}
                  <DropSurface
                    {mode}
                    {generation}
                    {reveal}
                    {palette}
                    {tintSurface}
                    layout="wash"
                    name="wash {action}"
                    shown={hold ? true : undefined}
                    onresolved={record}
                    class="rounded-md border bg-background"
                  >
                    <Button variant="ghost" size="lg" class="hover:bg-transparent">{action}</Button>
                  </DropSurface>
                {/each}
              </div>
            </DropGroup>
          </div>
          <div class="grid gap-2">
            <p class="text-xs font-medium text-muted-foreground">Taking an edge</p>
            <DropGroup name="edge buttons">
              <div class="flex flex-wrap gap-3">
                {#each ACTIONS as action (action)}
                  <DropSurface
                    {mode}
                    {generation}
                    {reveal}
                    {palette}
                    {tintSurface}
                    count={1}
                    name="edge {action}"
                    shown={hold ? true : undefined}
                    onresolved={record}
                    class="rounded-md border bg-background"
                  >
                    <Button variant="ghost" size="lg" class="hover:bg-transparent">{action}</Button>
                  </DropSurface>
                {/each}
              </div>
            </DropGroup>
          </div>
        </div>
      </PreviewSurface>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>List rows</Card.Title>
      <Card.Description>
        A run of identical rows is where repetition shows worst. A row this tight has space for one mark and one
        only, so the run varies how it is drawn: consecutive rows mirror each other and take a different angle and
        size.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <PreviewSurface>
        <DropGroup name="device rows">
          <div class="divide-y rounded-lg border">
            {#each ROWS as row (row.name)}
              <DropSurface
                {mode}
                {generation}
                {reveal}
                {palette}
                {tintSurface}
                fonts={rowFonts}
                count={2}
                name={row.name}
                shown={hold ? true : undefined}
                onresolved={record}
                contentClass="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div class="min-w-0">
                  <p data-drop-text="name" class="text-sm font-medium">{row.name}</p>
                  <p data-drop-text="detail" class="text-xs text-muted-foreground">{row.detail}</p>
                </div>
                <ChevronRight data-drop-obstacle class="size-4 shrink-0 text-muted-foreground" />
              </DropSurface>
            {/each}
          </div>
        </DropGroup>
      </PreviewSurface>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>What resolved</Card.Title>
      <Card.Description>Each mark reports the backend it actually drew with, not the one it asked for.</Card.Description>
    </Card.Header>
    <Card.Content>
      {#if resolved.size === 0}
        <p class="text-sm text-muted-foreground">Hover a card, a button or a row.</p>
      {:else}
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-xs">
          {#each [...resolved] as [key, value] (key)}
            <dt class="text-muted-foreground">{key}</dt>
            <dd>{value}</dd>
          {/each}
        </dl>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
