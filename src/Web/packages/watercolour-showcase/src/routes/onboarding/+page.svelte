<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as RadioGroup from '@nocturne/ui/ui/radio-group';
  import { Button } from '@nocturne/ui/ui/button';
  import { Label } from '@nocturne/ui/ui/label';
  import { Badge } from '@nocturne/ui/ui/badge';
  import { Switch } from '@nocturne/ui/ui/switch';
  import { Input } from '@nocturne/ui/ui/input';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Check from '@lucide/svelte/icons/check';
  import { Artwork } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';

  type DeviceId = 'dexcom' | 'libre' | 'nightscout' | 'manual';

  const devices: { id: DeviceId; label: string; description: string }[] = [
    { id: 'dexcom', label: 'Dexcom', description: 'Sign in to Dexcom Share and readings follow every five minutes.' },
    { id: 'libre', label: 'Libre', description: 'Connect LibreLinkUp; readings arrive each minute.' },
    { id: 'nightscout', label: 'Nightscout import', description: 'Point at an existing Nightscout site and bring its history over.' },
    { id: 'manual', label: 'Manual', description: 'Enter readings by hand or from a meter.' },
  ];

  const steps = [
    { id: 'connect', label: 'Connect', description: 'Choose where readings come from.' },
    { id: 'share', label: 'Share', description: 'Decide who else can see them.' },
    { id: 'alarms', label: 'Alarms', description: 'Set the thresholds that should wake you.' },
  ] as const;

  let device = $state<DeviceId>('dexcom');
  let step = $state(0);
  let shareEmail = $state('');
  let alarmsOn = $state(true);

  const deviceLabel = $derived(devices.find((d) => d.id === device)?.label ?? '');
</script>

<svelte:head>
  <title>Onboarding - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Get set up" description="Three short steps. Every control works from the first frame; the artwork is only a welcome." />

<section class="grid items-center gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
  <Card.Root>
    <Card.Header>
      <div class="flex items-center gap-2">
        <Card.Title>Step {step + 1} of {steps.length}: {steps[step].label}</Card.Title>
        <Badge variant="secondary" class="ml-auto">Synthetic</Badge>
      </div>
      <Card.Description>{steps[step].description}</Card.Description>
      <ol class="mt-2 flex gap-2" aria-label="Progress">
        {#each steps as s, i (s.id)}
          <li
            class="h-1.5 flex-1 rounded-full {i <= step ? 'bg-primary' : 'bg-muted'}"
            aria-current={i === step ? 'step' : undefined}
          >
            <span class="sr-only">{s.label}{i < step ? ', done' : i === step ? ', current' : ''}</span>
          </li>
        {/each}
      </ol>
    </Card.Header>

    <Card.Content>
      {#if step === 0}
        <RadioGroup.Root bind:value={device} class="grid gap-3 sm:grid-cols-2" aria-label="Data source">
          {#each devices as d (d.id)}
            <Label
              for="device-{d.id}"
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40"
            >
              <RadioGroup.Item value={d.id} id="device-{d.id}" class="mt-0.5" />
              <span class="flex flex-col gap-1">
                <span class="font-medium">{d.label}</span>
                <span class="text-sm font-normal text-muted-foreground">{d.description}</span>
              </span>
            </Label>
          {/each}
        </RadioGroup.Root>
      {:else if step === 1}
        <div class="grid gap-4">
          <p class="text-sm text-muted-foreground">
            Readings from <span class="font-medium text-foreground">{deviceLabel}</span> will be visible to you.
            Invite someone else now, or skip and do it later from Invites.
          </p>
          <div class="grid gap-2">
            <Label for="share-email">Invite by email</Label>
            <Input id="share-email" type="email" placeholder="name@example.test" bind:value={shareEmail} />
          </div>
        </div>
      {:else}
        <div class="grid gap-4">
          <div class="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label for="alarms-on" class="text-base">Alarms on</Label>
              <p class="text-sm text-muted-foreground">Low below 70 mg/dL (3.9 mmol/L), high above 180 mg/dL (10.0 mmol/L). Adjust later in Alarms.</p>
            </div>
            <Switch id="alarms-on" bind:checked={alarmsOn} />
          </div>
        </div>
      {/if}
    </Card.Content>

    <Card.Footer class="flex justify-between gap-2">
      <Button variant="outline" onclick={() => (step = Math.max(0, step - 1))} disabled={step === 0}>
        <ArrowLeft /> Back
      </Button>
      {#if step < steps.length - 1}
        <Button onclick={() => (step = Math.min(steps.length - 1, step + 1))}>Next <ArrowRight /></Button>
      {:else}
        <Button onclick={() => (step = 0)}><Check /> Finish</Button>
      {/if}
    </Card.Footer>
  </Card.Root>

  <Artwork artwork="crescent-moon" {...showcaseSettings.options} class="mx-auto aspect-square w-full max-w-[240px]" />
</section>
