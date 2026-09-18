<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as RadioGroup from '@nocturne/ui/ui/radio-group';
  import * as Select from '@nocturne/ui/ui/select';
  import { Label } from '@nocturne/ui/ui/label';
  import { setMode, userPrefersMode } from 'mode-watcher';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Monitor from '@lucide/svelte/icons/monitor';
  import { Artwork, HeaderMotif, PaintedUnderline, PALETTE_IDS, type ArtworkMode, type ArtworkMotion, type ArtworkQuality } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PreviewSurface from '$lib/components/PreviewSurface.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';

  type Theme = 'light' | 'dark' | 'system';
  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const motions: { value: ArtworkMotion; label: string; description: string }[] = [
    { value: 'auto', label: 'Follow system', description: 'Respects prefers-reduced-motion.' },
    { value: 'reduced', label: 'Reduced', description: 'Settle straight to the finished wash.' },
    { value: 'full', label: 'Full', description: 'Always play the painting.' },
  ];
  const modes: { value: ArtworkMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'live', label: 'Live simulation' },
    { value: 'baked', label: 'Baked frames' },
    { value: 'static', label: 'Static image' },
  ];
  const qualities: { value: ArtworkQuality; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const theme = $derived<Theme>(userPrefersMode.current ?? 'system');
  const modeLabel = $derived(modes.find((m) => m.value === showcaseSettings.mode)?.label ?? '');
  const qualityLabel = $derived(qualities.find((q) => q.value === showcaseSettings.quality)?.label ?? '');
</script>

<svelte:head>
  <title>Settings - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Settings" description="Appearance, accent palette and how the artwork moves." />

<div class="grid gap-6 lg:grid-cols-2">
  <Card.Root>
    <Card.Header>
      <Card.Title>Theme</Card.Title>
      <Card.Description>Applies to the whole showcase.</Card.Description>
    </Card.Header>
    <Card.Content>
      <RadioGroup.Root value={theme} onValueChange={(v) => setMode(v as Theme)} class="grid grid-cols-3 gap-2" aria-label="Theme">
        {#each themes as t (t.value)}
          <Label
            for="theme-{t.value}"
            class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40"
          >
            <t.icon class="size-5 text-muted-foreground" />
            <span>{t.label}</span>
            <RadioGroup.Item value={t.value} id="theme-{t.value}" class="sr-only" />
          </Label>
        {/each}
      </RadioGroup.Root>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Accent palette</Card.Title>
      <Card.Description>Used by every artwork. Swatches are the avatar wash in each palette.</Card.Description>
    </Card.Header>
    <Card.Content>
      <RadioGroup.Root bind:value={showcaseSettings.palette} class="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Accent palette">
        {#each PALETTE_IDS as p (p)}
          <Label
            for="palette-{p}"
            class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40"
          >
            <Artwork artwork="avatar-wash" palette={p} seed={showcaseSettings.seed} class="size-8 shrink-0 rounded-full" />
            <span class="capitalize">{p}</span>
            <RadioGroup.Item value={p} id="palette-{p}" class="sr-only" />
          </Label>
        {/each}
      </RadioGroup.Root>
    </Card.Content>
  </Card.Root>

  <Card.Root class="lg:col-span-2">
    <Card.Header>
      <Card.Title>Animation</Card.Title>
      <Card.Description>Motion follows the system by default, so a reduced-motion preference is honoured without a setting here.</Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-6 md:grid-cols-3">
      <div class="grid gap-2">
        <Label>Motion</Label>
        <RadioGroup.Root bind:value={showcaseSettings.motion} class="grid gap-2" aria-label="Motion">
          {#each motions as m (m.value)}
            <Label for="motion-{m.value}" class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary">
              <RadioGroup.Item value={m.value} id="motion-{m.value}" class="mt-0.5" />
              <span class="flex flex-col gap-0.5">
                <span>{m.label}</span>
                <span class="text-xs font-normal text-muted-foreground">{m.description}</span>
              </span>
            </Label>
          {/each}
        </RadioGroup.Root>
      </div>
      <div class="grid gap-2 self-start">
        <Label>Playback mode</Label>
        <Select.Root type="single" bind:value={showcaseSettings.mode}>
          <Select.Trigger class="w-full" aria-label="Playback mode">{modeLabel}</Select.Trigger>
          <Select.Content>
            {#each modes as m (m.value)}
              <Select.Item value={m.value} label={m.label}>{m.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-2 self-start">
        <Label>Quality</Label>
        <Select.Root type="single" bind:value={showcaseSettings.quality}>
          <Select.Trigger class="w-full" aria-label="Quality">{qualityLabel}</Select.Trigger>
          <Select.Content>
            {#each qualities as q (q.value)}
              <Select.Item value={q.value} label={q.label}>{q.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </Card.Content>
  </Card.Root>
</div>

<section class="flex flex-col gap-3">
  <h2 class="text-lg font-medium">Preview</h2>
  <div class="grid gap-4 md:grid-cols-2">
    {#each ['light', 'dark'] as const as bg (bg)}
      <PreviewSurface background={bg}>
        <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{bg}</p>
        <Card.Root>
          <Card.Header>
            <div class="flex items-center gap-3">
              <Card.Title>Dashboard</Card.Title>
              <HeaderMotif palette={showcaseSettings.palette} seed={showcaseSettings.seed} surface={bg} class="w-24" />
            </div>
            <Card.Description>Current reading and the last 24 hours.</Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="flex gap-4 text-sm">
              {#each ['Today', '7 days', '30 days'] as tab, i (tab)}
                <span class="relative flex flex-col gap-1">
                  <span class={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{tab}</span>
                  <PaintedUnderline active={i === 0} palette={showcaseSettings.palette} seed={showcaseSettings.seed} surface={bg} />
                </span>
              {/each}
            </div>
            <p class="mt-4 text-3xl font-semibold tabular-nums">142 <span class="text-base text-muted-foreground">mg/dL</span></p>
          </Card.Content>
        </Card.Root>
      </PreviewSurface>
    {/each}
  </div>
</section>
