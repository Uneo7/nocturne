<script lang="ts">
  import { RANGE_HIGH, RANGE_LOW, type GlucosePoint } from '$lib/synthetic/glucose';

  let { points, class: className = '' }: { points: GlucosePoint[]; class?: string } = $props();

  const W = 720;
  const H = 240;
  const PAD = { top: 12, right: 12, bottom: 24, left: 36 };
  const MIN = 40;
  const MAX = 300;

  const x = (minute: number) => PAD.left + (minute / 1440) * (W - PAD.left - PAD.right);
  const y = (mgdl: number) =>
    PAD.top + (1 - (Math.min(MAX, Math.max(MIN, mgdl)) - MIN) / (MAX - MIN)) * (H - PAD.top - PAD.bottom);

  const path = $derived(points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minute).toFixed(1)},${y(p.mgdl).toFixed(1)}`).join(' '));
  const yTicks = [70, 180, 250];
  const xTicks = [0, 6, 12, 18, 24];
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="24 hour glucose trace, synthetic" class="h-auto w-full {className}">
  <rect
    x={PAD.left}
    y={y(RANGE_HIGH)}
    width={W - PAD.left - PAD.right}
    height={y(RANGE_LOW) - y(RANGE_HIGH)}
    class="fill-muted/60"
  />
  {#each yTicks as tick (tick)}
    <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} class="stroke-border" stroke-dasharray="3 4" />
    <text x={PAD.left - 6} y={y(tick) + 3} text-anchor="end" class="fill-muted-foreground text-[10px]">{tick}</text>
  {/each}
  {#each xTicks as hour (hour)}
    <text x={x(hour * 60)} y={H - 6} text-anchor="middle" class="fill-muted-foreground text-[10px]">
      {hour.toString().padStart(2, '0')}:00
    </text>
  {/each}
  <path d={path} fill="none" class="stroke-foreground" stroke-width="1.75" stroke-linejoin="round" />
</svg>
