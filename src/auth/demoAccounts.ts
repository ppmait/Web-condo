import type { Role } from '../app/roles'

/** Demo accounts for the frontend-only build. Remove together with localAuthApi when a real backend exists. */
export const DEMO_PASSWORD = 'demo1234'

export interface DemoAccount {
  username: string
  role: Role
  fullName: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'tenant01', role: 'tenant', fullName: 'สมชาย ผู้เช่า' },
  { username: 'staff01', role: 'juristic', fullName: 'สมหญิง นิติบุคคล' },
  { username: 'tech01', role: 'technician', fullName: 'สมศักดิ์ ช่างซ่อม' },
]
