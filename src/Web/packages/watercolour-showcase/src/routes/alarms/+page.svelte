<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as Select from '@nocturne/ui/ui/select';
  import { Button } from '@nocturne/ui/ui/button';
  import { Input } from '@nocturne/ui/ui/input';
  import { Label } from '@nocturne/ui/ui/label';
  import { Slider } from '@nocturne/ui/ui/slider';
  import { Switch } from '@nocturne/ui/ui/switch';
  import { Separator } from '@nocturne/ui/ui/separator';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { toast } from 'svelte-sonner';
  import { Artwork } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';
  import { formatMmol } from '$lib/synthetic/units';

  let low = $state(70);
  let high = $state(180);
  let urgentLow = $state(54);
  let rateOfChange = $state(true);
  let snooze = $state('15');
  let quietHours = $state(false);
  let quietFrom = $state('22:00');
  let quietTo = $state('07:00');
  let acknowledged = $state(false);

  const snoozeOptions = [
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '60', label: '1 hour' },
  ];
  const snoozeLabel = $derived(snoozeOptions.find((o) => o.value === snooze)?.label ?? '');

  function clampInput(e: Event & { currentTarget: HTMLInputElement }, min: number, max: number) {
    return Math.min(max, Math.max(min, Number(e.currentTarget.value) || min));
  }
</script>

<svelte:head>
  <title>Alarms - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Alarms" description="Thresholds and quiet hours. The urgent alert example below is what a real alarm looks like: plain, immediate, no artwork." />

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <Card.Root>
    <Card.Header class="flex flex-row items-center gap-4">
      <Artwork artwork="alarm-bell" {...showcaseSettings.options} class="size-16 shrink-0 md:size-32" />
      <div>
        <Card.Title>Rules</Card.Title>
        <Card.Description>Values in mg/dL; the mmol/L equivalent follows each one.</Card.Description>
      </div>
    </Card.Header>
    <Card.Content class="grid gap-6">
      <div class="grid gap-3">
        <div class="flex items-center justify-between gap-4">
          <Label for="low-input">Low threshold</Label>
          <span class="text-sm text-muted-foreground">{formatMmol(low)}</span>
        </div>
        <div class="flex items-center gap-4">
          <Slider type="single" bind:value={low} min={55} max={110} step={1} aria-label="Low threshold" />
          <Input
            id="low-input"
            type="number"
            class="w-24"
            value={low}
            min="55"
            max="110"
            onchange={(e) => (low = clampInput(e, 55, 110))}
          />
        </div>
      </div>

      <div class="grid gap-3">
        <div class="flex items-center justify-between gap-4">
          <Label for="high-input">High threshold</Label>
          <span class="text-sm text-muted-foreground">{formatMmol(high)}</span>
        </div>
        <div class="flex items-center gap-4">
          <Slider type="single" bind:value={high} min={140} max={300} step={1} aria-label="High threshold" />
          <Input
            id="high-input"
            type="number"
            class="w-24"
            value={high}
            min="140"
            max="300"
            onchange={(e) => (high = clampInput(e, 140, 300))}
          />
        </div>
      </div>

      <div class="grid gap-3">
        <div class="flex items-center justify-between gap-4">
          <Label for="urgent-input">Urgent low</Label>
          <span class="text-sm text-muted-foreground">{formatMmol(urgentLow)}</span>
        </div>
        <div class="flex items-center gap-4">
          <Slider type="single" bind:value={urgentLow} min={40} max={69} step={1} aria-label="Urgent low threshold" />
          <Input
            id="urgent-input"
            type="number"
            class="w-24"
            value={urgentLow}
            min="40"
            max="69"
            onchange={(e) => (urgentLow = clampInput(e, 40, 69))}
          />
        </div>
        <p class="text-xs text-muted-foreground">Urgent low ignores snooze and quiet hours.</p>
      </div>

      <Separator />

      <div class="flex items-center justify-between gap-4">
        <div>
          <Label for="roc">Rate-of-change alarm</Label>
          <p class="text-sm text-muted-foreground">Alert when readings move faster than 3 mg/dL per minute.</p>
        </div>
        <Switch id="roc" bind:checked={rateOfChange} />
      </div>

      <div class="grid gap-2">
        <Label>Snooze duration</Label>
        <Select.Root type="single" bind:value={snooze}>
          <Select.Trigger class="w-full sm:w-56" aria-label="Snooze duration">{snoozeLabel}</Select.Trigger>
          <Select.Content>
            {#each snoozeOptions as o (o.value)}
              <Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="grid gap-3">
        <div class="flex items-center justify-between gap-4">
          <div>
            <Label for="quiet">Quiet hours</Label>
            <p class="text-sm text-muted-foreground">Low and high alarms are muted; urgent low still sounds.</p>
          </div>
          <Switch id="quiet" bind:checked={quietHours} />
        </div>
        <div class="grid grid-cols-2 gap-3 sm:max-w-sm">
          <div class="grid gap-1.5">
            <Label for="quiet-from" class="text-xs text-muted-foreground">From</Label>
            <Input id="quiet-from" type="time" bind:value={quietFrom} disabled={!quietHours} />
          </div>
          <div class="grid gap-1.5">
            <Label for="quiet-to" class="text-xs text-muted-foreground">To</Label>
            <Input id="quiet-to" type="time" bind:value={quietTo} disabled={!quietHours} />
          </div>
        </div>
      </div>
    </Card.Content>
    <Card.Footer>
      <Button onclick={() => toast.success('Alarm rules saved', { description: 'Synthetic: nothing was persisted.' })}>
        Save rules
      </Button>
    </Card.Footer>
  </Card.Root>

  <div class="flex flex-col gap-3 self-start">
    <h2 class="text-sm font-medium text-muted-foreground">Urgent alert example</h2>
    <div
      role="alert"
      class="rounded-lg border-2 border-destructive bg-background p-5 text-foreground shadow-lg"
    >
      <div class="flex items-start gap-3">
        <TriangleAlert class="mt-0.5 size-6 shrink-0 text-destructive" />
        <div class="min-w-0 flex-1">
          <p class="text-lg font-semibold">Urgent low: 54 mg/dL</p>
          <p class="text-sm text-muted-foreground">3.0 mmol/L, falling. Reading from 2 min ago.</p>
        </div>
      </div>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" class="flex-1" onclick={() => toast('Snoozed for 15 minutes')} disabled={acknowledged}>
          Snooze 15 min
        </Button>
        <Button variant="destructive" class="flex-1" onclick={() => (acknowledged = true)} disabled={acknowledged}>
          {acknowledged ? 'Acknowledged' : 'Acknowledge'}
        </Button>
      </div>
      {#if acknowledged}
        <Button variant="link" size="sm" class="mt-2 px-0" onclick={() => (acknowledged = false)}>Reset example</Button>
      {/if}
    </div>
    <p class="text-xs text-muted-foreground">
      Alerts render their message and actions on the first frame with no artwork and no motion.
    </p>
  </div>
</div>
