import type { Component } from 'svelte';
import House from '@lucide/svelte/icons/house';
import Plug from '@lucide/svelte/icons/plug';
import UserPlus from '@lucide/svelte/icons/user-plus';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import History from '@lucide/svelte/icons/history';
import FileText from '@lucide/svelte/icons/file-text';
import Bell from '@lucide/svelte/icons/bell';
import Settings from '@lucide/svelte/icons/settings';
import CircleCheck from '@lucide/svelte/icons/circle-check';
import FlaskConical from '@lucide/svelte/icons/flask-conical';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import Code from '@lucide/svelte/icons/code';

export interface NavPage {
  href: string;
  label: string;
  description: string;
  icon: Component;
}

export const NAV_PAGES: readonly NavPage[] = [
  { href: '/', label: 'Overview', description: 'What this showcase covers', icon: House },
  { href: '/onboarding', label: 'Onboarding', description: 'Device connection and first steps', icon: Plug },
  { href: '/invites', label: 'Invites', description: 'Members, roles and pending invitations', icon: UserPlus },
  { href: '/dashboard', label: 'Dashboard', description: 'Current reading, stats and a 24 h chart', icon: LayoutDashboard },
  { href: '/history', label: 'History', description: 'Filtered, paginated event rows', icon: History },
  { href: '/reports', label: 'Reports', description: 'Weekly summaries and export', icon: FileText },
  { href: '/alarms', label: 'Alarms', description: 'Thresholds, snooze and an urgent alert', icon: Bell },
  { href: '/settings', label: 'Settings', description: 'Theme, palette and animation', icon: Settings },
  { href: '/confirmations', label: 'Confirmations', description: 'Toasts, saved states and empty states', icon: CircleCheck },
  { href: '/playground', label: 'Playground', description: 'Engine controls and canvas', icon: FlaskConical },
  { href: '/gallery', label: 'Gallery', description: 'Every artwork at three sizes', icon: LayoutGrid },
  { href: '/integration', label: 'Integration', description: 'Using the components in the app', icon: Code },
];
