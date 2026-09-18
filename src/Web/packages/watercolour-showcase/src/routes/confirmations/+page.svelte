<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import { Button } from '@nocturne/ui/ui/button';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Wifi from '@lucide/svelte/icons/wifi';
  import Check from '@lucide/svelte/icons/check';
  import Mail from '@lucide/svelte/icons/mail';
  import Users from '@lucide/svelte/icons/users';
  import Inbox from '@lucide/svelte/icons/inbox';
  import { Artwork, ConfirmationBackground } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';

  const confirmations = [
    { id: 'restored', icon: Wifi, title: 'Connection restored', detail: 'Readings are arriving again from Dexcom.' },
    { id: 'saved', icon: Check, title: 'Preferences saved', detail: 'Your alarm rules are up to date.' },
    { id: 'sent', icon: Mail, title: 'Invitation sent', detail: 'alex@example.test will get a link by email.' },
  ];

  // Remounting the background is how a stub "replays"; the real component will expose its own control.
  let replayKeys = $state<Record<string, number>>({});
  const replay = (id: string) => (replayKeys = { ...replayKeys, [id]: (replayKeys[id] ?? 0) + 1 });
</script>

<svelte:head>
  <title>Confirmations - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Confirmations and empty states" description="Small moments of feedback. Replay is explicit; nothing plays on hover." />

<section class="flex flex-col gap-3">
  <h2 class="text-lg font-medium">Confirmations</h2>
  <div class="grid gap-4 md:grid-cols-3">
    {#each confirmations as c (c.id)}
      <div class="relative overflow-hidden rounded-xl border" role="status">
        {#key replayKeys[c.id] ?? 0}
          <ConfirmationBackground palette={showcaseSettings.palette} />
        {/key}
        <div class="relative flex flex-col gap-3 p-4">
          <div class="flex items-start gap-3">
            {#key replayKeys[c.id] ?? 0}
              <Artwork artwork="confirmation-mark" {...showcaseSettings.options} autoplay="once" class="size-10 shrink-0 rounded-full" />
            {/key}
            <div class="min-w-0 flex-1 rounded-md bg-background/90 px-2 py-1">
              <p class="flex items-center gap-1.5 font-medium">
                <c.icon class="size-4 text-muted-foreground" />
                {c.title}
              </p>
              <p class="text-sm text-muted-foreground">{c.detail}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" class="self-start bg-background" onclick={() => replay(c.id)}>
            <RotateCcw /> Replay
          </Button>
        </div>
      </div>
    {/each}
  </div>
</section>

<section class="flex flex-col gap-3">
  <h2 class="text-lg font-medium">Empty states</h2>
  <div class="grid gap-4 md:grid-cols-2">
    <Card.Root>
      <Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
        <Artwork artwork="linked-rings" {...showcaseSettings.options} class="size-24" />
        <div>
          <p class="flex items-center justify-center gap-1.5 font-medium"><Users class="size-4" /> No members yet</p>
          <p class="text-sm text-muted-foreground">Invite a carer or clinician and they will appear here.</p>
        </div>
        <Button variant="outline" size="sm" href="/invites">Invite someone</Button>
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
        <Artwork artwork="magnifying-glass" {...showcaseSettings.options} class="size-24" />
        <div>
          <p class="flex items-center justify-center gap-1.5 font-medium"><Inbox class="size-4" /> No events</p>
          <p class="text-sm text-muted-foreground">Events appear once a device is connected.</p>
        </div>
        <Button variant="outline" size="sm" href="/onboarding">Connect a device</Button>
      </Card.Content>
    </Card.Root>
  </div>
</section>
