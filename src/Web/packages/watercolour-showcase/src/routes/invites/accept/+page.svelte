<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import { Button } from '@nocturne/ui/ui/button';
  import { Badge } from '@nocturne/ui/ui/badge';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { Artwork, AvatarWash } from '$lib/artwork';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';

  let decision = $state<'pending' | 'accepted' | 'declined'>('pending');
</script>

<svelte:head>
  <title>Accept invitation - Watercolour showcase</title>
</svelte:head>

<div class="mx-auto w-full max-w-lg">
  <Card.Root>
    <Artwork artwork="connected-shores" {...showcaseSettings.options} class="mx-6 aspect-[3/1] w-auto" />
    <Card.Header class="text-center">
      <div class="mx-auto mb-2 flex items-center gap-2">
        <AvatarWash name="Sam Okafor" size={40} palette={showcaseSettings.palette} />
        <AvatarWash name="You" size={40} palette={showcaseSettings.palette} />
      </div>
      <Card.Title class="text-xl">Sam Okafor invited you to follow their readings</Card.Title>
      <Card.Description>
        You would join as a <Badge variant="secondary">Carer</Badge>: you can see readings and history and
        acknowledge alarms. You can leave at any time.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <div class="rounded-lg border bg-muted/30 p-3 text-sm">
        <p class="font-medium">Message from Sam</p>
        <p class="text-muted-foreground">"Would be good to have you on this for the school trip week."</p>
      </div>
    </Card.Content>
    <Card.Footer class="flex flex-col gap-3">
      {#if decision === 'pending'}
        <div class="flex w-full flex-col gap-2 sm:flex-row">
          <Button class="flex-1" onclick={() => (decision = 'accepted')}><Check /> Accept</Button>
          <Button class="flex-1" variant="outline" onclick={() => (decision = 'declined')}><X /> Decline</Button>
        </div>
      {:else}
        <p role="status" class="text-sm font-medium">
          {decision === 'accepted' ? 'Invitation accepted. You now follow Sam.' : 'Invitation declined.'}
        </p>
        <Button variant="ghost" size="sm" onclick={() => (decision = 'pending')}>Reset example</Button>
      {/if}
      <a href="/invites" class="text-sm text-muted-foreground underline-offset-4 hover:underline">Back to invites</a>
    </Card.Footer>
  </Card.Root>
</div>
