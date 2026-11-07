export type Role = 'tenant' | 'juristic' | 'technician'

export const ROLES: Role[] = ['tenant', 'juristic', 'technician']

export interface NavItem {
  /** i18n key: label is `nav.<key>` */
  key: string
  path: string
  /** Material Symbols Outlined icon name */
  icon: string
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  tenant: [
    { key: 'overview', path: '/tenant/overview', icon: 'dashboard' },
    { key: 'billing', path: '/tenant/billing', icon: 'receipt_long' },
    { key: 'parcels', path: '/tenant/parcels', icon: 'package_2' },
    { key: 'maintenance', path: '/tenant/maintenance', icon: 'build' },
    { key: 'facilities', path: '/tenant/facilities', icon: 'event_available' },
    { key: 'announcements', path: '/tenant/announcements', icon: 'campaign' },
  ],
  juristic: [
    { key: 'dashboard', path: '/juristic/dashboard', icon: 'dashboard' },
    { key: 'units', path: '/juristic/units', icon: 'apartment' },
    { key: 'billing', path: '/juristic/billing', icon: 'receipt_long' },
    { key: 'maintenance', path: '/juristic/maintenance', icon: 'build' },
    { key: 'parcelsBookings', path: '/juristic/parcels-bookings', icon: 'package_2' },
    { key: 'announcements', path: '/juristic/announcements', icon: 'campaign' },
    { key: 'reports', path: '/juristic/reports', icon: 'analytics' },
  ],
  technician: [{ key: 'jobs', path: '/technician/jobs', icon: 'engineering' }],
}

export function roleHome(role: Role): string {
  return NAV_BY_ROLE[role][0].path
}

export function roleFromPath(pathname: string): Role | null {
  const first = pathname.split('/')[1]
  return ROLES.find((r) => r === first) ?? null
}
