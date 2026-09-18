export type MemberRole = 'viewer' | 'carer' | 'clinician';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  lastActive: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: MemberRole;
  sentAgo: string;
}

export const ROLES: readonly { value: MemberRole; label: string; description: string }[] = [
  { value: 'viewer', label: 'Viewer', description: 'Sees readings and history' },
  { value: 'carer', label: 'Carer', description: 'Viewer plus alarm acknowledgement' },
  { value: 'clinician', label: 'Clinician', description: 'Viewer plus reports export' },
];

export const MEMBERS: readonly Member[] = [
  { id: 'm1', name: 'Sam Okafor', email: 'sam@example.test', role: 'carer', lastActive: '4 min ago' },
  { id: 'm2', name: 'Priya Natarajan', email: 'priya@example.test', role: 'clinician', lastActive: '2 days ago' },
  { id: 'm3', name: 'Jonas Lindqvist', email: 'jonas@example.test', role: 'viewer', lastActive: '3 hours ago' },
  { id: 'm4', name: 'Mei Tanaka', email: 'mei@example.test', role: 'viewer', lastActive: 'yesterday' },
];

export const PENDING_INVITES: readonly PendingInvite[] = [
  { id: 'p1', email: 'alex@example.test', role: 'viewer', sentAgo: '2 hours ago' },
  { id: 'p2', email: 'dr.cho@example.test', role: 'clinician', sentAgo: '5 days ago' },
];
