import type { Role } from '../app/roles'

/** Demo accounts for the frontend-only build. Remove together with localAuthApi when a real backend exists. */
export const DEMO_PASSWORD = 'demo1234'

/** The tenant of unit A-1204 in the sample property data: tenant01 sees that unit's invoices. */
export const DEMO_TENANT_PHONE = '0810000001'

export interface DemoAccount {
  username: string
  role: Role
  fullName: string
  phone: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'tenant01', role: 'tenant', fullName: 'สมชาย ผู้เช่า', phone: DEMO_TENANT_PHONE },
  { username: 'staff01', role: 'juristic', fullName: 'สมหญิง นิติบุคคล', phone: '0800000000' },
  { username: 'tech01', role: 'technician', fullName: 'สมศักดิ์ ช่างซ่อม', phone: '0800000000' },
]
