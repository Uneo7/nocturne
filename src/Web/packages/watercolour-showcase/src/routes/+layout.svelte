<script lang="ts">
  import '../app.css';
  import { ModeWatcher } from 'mode-watcher';
  import { page } from '$app/state';
  import { Toaster } from '@nocturne/ui/ui/sonner';
  import * as Tooltip from '@nocturne/ui/ui/tooltip';
  import * as Sheet from '@nocturne/ui/ui/sheet';
  import { Button } from '@nocturne/ui/ui/button';
  import Menu from '@lucide/svelte/icons/menu';
  import Info from '@lucide/svelte/icons/info';
  import { NAV_PAGES } from '$lib/nav';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';

  let { children } = $props();
  let menuOpen = $state(false);

  const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<ModeWatcher />
<Toaster />

<Tooltip.Provider>
  <div class="min-h-screen bg-background text-foreground">
    <header class="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div class="flex h-14 items-center gap-2 px-4">
        <Button variant="ghost" size="icon" class="md:hidden" onclick={() => (menuOpen = true)} aria-label="Open menu">
          <Menu />
        </Button>
        <a href="/" class="truncate font-semibold tracking-tight">Watercolour showcase</a>
        <span class="ml-auto flex items-center gap-1">
          <ModeToggle />
          <SettingsDrawer />
        </span>
      </div>
      <div
        role="note"
        class="flex items-center gap-2 border-t bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground"
      >
        <Info class="size-3.5 shrink-0" />
        <span>Showcase with synthetic data. Not medical advice.</span>
      </div>
    </header>

    <div class="md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside class="hidden border-r md:block">
        <nav class="sticky top-[5.25rem] flex flex-col gap-0.5 p-3" aria-label="Pages">
          {#each NAV_PAGES as item (item.href)}
            <a
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium"
            >
              <item.icon class="size-4 shrink-0 text-muted-foreground" />
              {item.label}
            </a>
          {/each}
        </nav>
      </aside>

      <main class="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {@render children()}
        </div>
      </main>
    </div>
  </div>

  <Sheet.Root bind:open={menuOpen}>
    <Sheet.Content side="left" class="w-72">
      <Sheet.Header>
        <Sheet.Title>Pages</Sheet.Title>
        <Sheet.Description>Every screen in the showcase.</Sheet.Description>
      </Sheet.Header>
      <nav class="flex flex-col gap-0.5 px-2" aria-label="Pages">
        {#each NAV_PAGES as item (item.href)}
          <a
            href={item.href}
            onclick={() => (menuOpen = false)}
            aria-current={isActive(item.href) ? 'page' : undefined}
            class="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
          >
            <item.icon class="size-4 shrink-0 text-muted-foreground" />
            {item.label}
          </a>
        {/each}
      </nav>
    </Sheet.Content>
  </Sheet.Root>
</Tooltip.Provider>
