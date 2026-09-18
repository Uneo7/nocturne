<script lang="ts">
  import * as Card from '@nocturne/ui/ui/card';
  import * as Select from '@nocturne/ui/ui/select';
  import * as Table from '@nocturne/ui/ui/table';
  import { Button } from '@nocturne/ui/ui/button';
  import { Input } from '@nocturne/ui/ui/input';
  import { Label } from '@nocturne/ui/ui/label';
  import { Badge } from '@nocturne/ui/ui/badge';
  import { Textarea } from '@nocturne/ui/ui/textarea';
  import { toast } from 'svelte-sonner';
  import Mail from '@lucide/svelte/icons/mail';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Artwork, AvatarWash } from '$lib/artwork';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { showcaseSettings } from '$lib/showcase-settings.svelte';
  import { MEMBERS, PENDING_INVITES, ROLES, type MemberRole, type PendingInvite } from '$lib/synthetic/members';

  let email = $state('');
  let role = $state<MemberRole>('viewer');
  let message = $state('');
  let pending = $state<PendingInvite[]>([...PENDING_INVITES]);

  const roleLabel = $derived(ROLES.find((r) => r.value === role)?.label ?? '');
  const roleVariant = (r: MemberRole) => (r === 'clinician' ? 'default' : r === 'carer' ? 'secondary' : 'outline');

  function send(e: SubmitEvent) {
    e.preventDefault();
    if (!email) return;
    pending = [{ id: `p-${Date.now()}`, email, role, sentAgo: 'just now' }, ...pending];
    toast.success(`Invitation sent to ${email}`, { description: 'Synthetic: nothing was actually sent.' });
    email = '';
    message = '';
  }

  function revoke(id: string) {
    pending = pending.filter((p) => p.id !== id);
    toast('Invitation revoked');
  }
</script>

<svelte:head>
  <title>Invites - Watercolour showcase</title>
</svelte:head>

<PageHeader title="Members and invitations" description="Who can see these readings, and who has been asked." />

<div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
  <Card.Root class="self-start">
    <Card.Header class="flex flex-row items-center gap-3">
      <Artwork artwork="overlapping-shapes" {...showcaseSettings.options} class="size-12 shrink-0" />
      <div>
        <Card.Title>Invite someone</Card.Title>
        <Card.Description>They receive a link; nothing is shared until they accept.</Card.Description>
      </div>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-4" onsubmit={send}>
        <div class="grid gap-2">
          <Label for="invite-email">Email</Label>
          <Input id="invite-email" type="email" required placeholder="name@example.test" bind:value={email} />
        </div>
        <div class="grid gap-2">
          <Label>Role</Label>
          <Select.Root type="single" bind:value={role}>
            <Select.Trigger class="w-full" aria-label="Role">{roleLabel}</Select.Trigger>
            <Select.Content>
              {#each ROLES as r (r.value)}
                <Select.Item value={r.value} label={r.label}>
                  <span class="flex flex-col">
                    <span>{r.label}</span>
                    <span class="text-xs text-muted-foreground">{r.description}</span>
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="grid gap-2">
          <Label for="invite-message">Message <span class="text-muted-foreground">(optional)</span></Label>
          <Textarea id="invite-message" rows={3} placeholder="A note to go with the invitation" bind:value={message} />
        </div>
        <Button type="submit" class="justify-self-start"><Mail /> Send invitation</Button>
      </form>
    </Card.Content>
  </Card.Root>

  <div class="flex flex-col gap-6">
    <Card.Root>
      <Card.Header>
        <Card.Title>Members</Card.Title>
        <Card.Description>{MEMBERS.length} people currently have access.</Card.Description>
      </Card.Header>
      <Card.Content class="px-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="pl-6">Name</Table.Head>
              <Table.Head>Role</Table.Head>
              <Table.Head class="pr-6 text-right">Last active</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each MEMBERS as m (m.id)}
              <Table.Row>
                <Table.Cell class="pl-6">
                  <span class="flex items-center gap-3">
                    <AvatarWash name={m.name} size={32} palette={showcaseSettings.palette} />
                    <span class="flex min-w-0 flex-col">
                      <span class="truncate font-medium">{m.name}</span>
                      <span class="truncate text-xs text-muted-foreground">{m.email}</span>
                    </span>
                  </span>
                </Table.Cell>
                <Table.Cell><Badge variant={roleVariant(m.role)} class="capitalize">{m.role}</Badge></Table.Cell>
                <Table.Cell class="pr-6 text-right text-muted-foreground">{m.lastActive}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Pending invitations</Card.Title>
        <Card.Description>Sent but not yet accepted.</Card.Description>
      </Card.Header>
      <Card.Content>
        {#if pending.length === 0}
          <p class="text-sm text-muted-foreground">No pending invitations.</p>
        {:else}
          <ul class="divide-y">
            {#each pending as p (p.id)}
              <li class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate font-medium">{p.email}</span>
                  <span class="text-xs text-muted-foreground">Sent {p.sentAgo}</span>
                </span>
                <Badge variant={roleVariant(p.role)} class="capitalize">{p.role}</Badge>
                <Button variant="ghost" size="sm" onclick={() => revoke(p.id)} aria-label="Revoke invitation to {p.email}">
                  <Trash2 /> Revoke
                </Button>
              </li>
            {/each}
          </ul>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</div>
