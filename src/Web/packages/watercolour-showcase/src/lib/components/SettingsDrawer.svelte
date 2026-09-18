<script lang="ts">
  import * as Sheet from '@nocturne/ui/ui/sheet';
  import * as Select from '@nocturne/ui/ui/select';
  import * as RadioGroup from '@nocturne/ui/ui/radio-group';
  import { Button } from '@nocturne/ui/ui/button';
  import { Input } from '@nocturne/ui/ui/input';
  import { Label } from '@nocturne/ui/ui/label';
  import { Separator } from '@nocturne/ui/ui/separator';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Repeat from '@lucide/svelte/icons/repeat';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';
  import { PALETTE_IDS, type ArtworkMode, type ArtworkMotion, type ArtworkQuality, type PaletteId } from '$lib/artwork';
  import type { PreviewBackground } from '$lib/showcase-settings.svelte';

  let open = $state(false);

  const modes: { value: ArtworkMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'live', label: 'Live' },
    { value: 'baked', label: 'Baked' },
    { value: 'static', label: 'Static' },
  ];
  const motions: { value: ArtworkMotion; label: string }[] = [
    { value: 'auto', label: 'Follow system' },
    { value: 'reduced', label: 'Reduced' },
    { value: 'full', label: 'Full' },
  ];
  const qualities: { value: ArtworkQuality; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];
  const backgrounds: { value: PreviewBackground; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  function label<T extends string>(list: { value: T; label: string }[], value: T) {
    return list.find((item) => item.value === value)?.label ?? value;
  }
</script>

<Button variant="ghost" size="icon" onclick={() => (open = true)} aria-label="Showcase settings" title="Showcase settings">
  <SlidersHorizontal />
</Button>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="overflow-y-auto">
    <Sheet.Header>
      <Sheet.Title>Showcase settings</Sheet.Title>
      <Sheet.Description>Applied to every artwork on every page.</Sheet.Description>
    </Sheet.Header>

    <div class="flex flex-col gap-5 px-4 pb-6">
      <div class="grid gap-2">
        <Label>Palette</Label>
        <RadioGroup.Root bind:value={showcaseSettings.palette} class="grid grid-cols-2 gap-2">
          {#each PALETTE_IDS as palette (palette)}
            <Label
              for="drawer-palette-{palette}"
              class="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm capitalize has-[[data-state=checked]]:border-primary"
            >
              <RadioGroup.Item value={palette} id="drawer-palette-{palette}" />
              {palette}
            </Label>
          {/each}
        </RadioGroup.Root>
      </div>

      <div class="grid gap-2">
        <Label for="drawer-seed">Seed</Label>
        <div class="flex gap-2">
          <Input
            id="drawer-seed"
            type="number"
            min="0"
            step="1"
            value={showcaseSettings.seed}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => (showcaseSettings.seed = Number(e.currentTarget.value) || 0)}
          />
          <Button variant="outline" size="icon" onclick={() => showcaseSettings.reseed()} aria-label="New seed">
            <Repeat />
          </Button>
        </div>
      </div>

      <Separator />

      <div class="grid gap-2">
        <Label>Playback mode</Label>
        <Select.Root type="single" bind:value={showcaseSettings.mode}>
          <Select.Trigger class="w-full" aria-label="Playback mode">{label(modes, showcaseSettings.mode)}</Select.Trigger>
          <Select.Content>
            {#each modes as m (m.value)}
              <Select.Item value={m.value} label={m.label}>{m.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="grid gap-2">
        <Label>Motion</Label>
        <Select.Root type="single" bind:value={showcaseSettings.motion}>
          <Select.Trigger class="w-full" aria-label="Motion">{label(motions, showcaseSettings.motion)}</Select.Trigger>
          <Select.Content>
            {#each motions as m (m.value)}
              <Select.Item value={m.value} label={m.label}>{m.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="grid gap-2">
        <Label>Quality</Label>
        <Select.Root type="single" bind:value={showcaseSettings.quality}>
          <Select.Trigger class="w-full" aria-label="Quality">{label(qualities, showcaseSettings.quality)}</Select.Trigger>
          <Select.Content>
            {#each qualities as q (q.value)}
              <Select.Item value={q.value} label={q.label}>{q.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="grid gap-2">
        <Label>Preview background</Label>
        <Select.Root type="single" bind:value={showcaseSettings.previewBackground}>
          <Select.Trigger class="w-full" aria-label="Preview background">
            {label(backgrounds, showcaseSettings.previewBackground)}
          </Select.Trigger>
          <Select.Content>
            {#each backgrounds as b (b.value)}
              <Select.Item value={b.value} label={b.label}>{b.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <Separator />

      <Button variant="outline" onclick={() => showcaseSettings.reset()}>Reset to defaults</Button>
    </div>
  </Sheet.Content>
</Sheet.Root>
