import { DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays } from '../property/dates'
import type { Lease, PropertyData } from '../property/types'
import type { Category, HistoryEntry, MaintenanceData, MaintenanceNotification, MaintenanceRequest, Photo, RequestStatus, Technician } from './types'

export const SAMPLE_TECHNICIANS: Technician[] = [
  { id: 'tech-1', name: 'สมศักดิ์ ช่างซ่อม', phone: DEMO_TECH_PHONE },
  { id: 'tech-2', name: 'ประเสริฐ ช่างไฟ', phone: '0800000003' },
  { id: 'tech-3', name: 'วิชัย ช่างประปา', phone: '0800000004' },
]

const JURISTIC_NAME = 'สมหญิง นิติบุคคล'

/** A tiny placeholder picture (an SVG data URL) standing in for a photo of the damage. */
const picture = (name: string, color: string): Photo => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="${color}"/><circle cx="60" cy="45" r="18" fill="#ffffff" fill-opacity=".6"/></svg>`
  return { name, dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }
}

interface Spec {
  /** days before today that the request was made */
  ago: number
  who: 'demo' | number
  status: RequestStatus
  technician?: number
  category: Category
  title: string
  description: string
}

const SPECS: Spec[] = [
  { ago: 20, who: 'demo', status: 'done', technician: 0, category: 'furniture', title: 'บานพับตู้เสื้อผ้าหลุด', description: 'บานตู้เสื้อผ้าในห้องนอนหลุดจากบานพับ ปิดไม่สนิท' },
  { ago: 8, who: 'demo', status: 'inProgress', technician: 0, category: 'airConditioning', title: 'แอร์ไม่เย็น', description: 'เปิดแอร์แล้วมีแต่ลมอุ่น และมีน้ำหยดจากตัวเครื่อง' },
  { ago: 6, who: 2, status: 'inProgress', technician: 2, category: 'other', title: 'ประตูห้องน้ำฝืด', description: 'ประตูห้องน้ำเปิดปิดยากและมีเสียงดัง' },
  { ago: 5, who: 1, status: 'assigned', technician: 1, category: 'electrical', title: 'ปลั๊กไฟในครัวไม่มีไฟ', description: 'ปลั๊กไฟข้างเตาไม่มีไฟเข้า ส่วนปลั๊กอื่นปกติ' },
  { ago: 4, who: 'demo', status: 'assigned', technician: 0, category: 'plumbing', title: 'ก๊อกน้ำอ่างล้างหน้ารั่ว', description: 'น้ำหยดจากก๊อกตลอดเวลาแม้ปิดสนิทแล้ว' },
  { ago: 2, who: 0, status: 'waiting', technician: undefined, category: 'plumbing', title: 'ท่อระบายน้ำในห้องน้ำอุดตัน', description: 'น้ำในห้องน้ำระบายช้ามากและมีกลิ่น' },
  { ago: 1, who: 'demo', status: 'waiting', technician: undefined, category: 'electrical', title: 'หลอดไฟห้องนั่งเล่นดับ', description: 'หลอดไฟดวงกลางห้องนั่งเล่นดับ เปลี่ยนหลอดแล้วก็ยังไม่ติด' },
]

const COLORS = ['#cbd5e1', '#fcd34d', '#93c5fd']

/**
 * Sample maintenance data built from the property data: three technicians and seven requests of every status (the
 * demo tenant has four, tech01 has an assigned and an in-progress job), with notifications that match the history.
 * Every date is relative to `today`.
 */
export function makeMaintenanceSeed(property: PropertyData, today: string): MaintenanceData {
  const units = new Set(property.units.map((u) => u.id))
  const active: Lease[] = property.leases.filter((l) => !l.cancelledAt && l.startDate <= today && today <= l.endDate && units.has(l.unitId))
  const demo = active.find((l) => l.tenantPhone === DEMO_TENANT_PHONE)
  const others = active.filter((l) => l !== demo)
  const requests: MaintenanceRequest[] = []
  const notifications: MaintenanceNotification[] = []
  let noteSerial = 0

  const leaseFor = (who: Spec['who']): Lease | undefined => (who === 'demo' ? demo : others.length > 0 ? others[who % others.length] : demo)

  const notify = (n: Omit<MaintenanceNotification, 'id'>) => notifications.push({ id: `mn-${++noteSerial}`, ...n })

  SPECS.forEach((spec) => {
    const lease = leaseFor(spec.who)
    if (!lease) return
    const unit = property.units.find((u) => u.id === lease.unitId)!
    const n = requests.length + 1
    const at = (daysAfter: number) => addDays(today, -(spec.ago - daysAfter))
    const technician = spec.technician === undefined ? undefined : SAMPLE_TECHNICIANS[spec.technician]
    const history: HistoryEntry[] = [{ status: 'waiting', at: at(0), note: '', byName: lease.tenantName }]
    if (technician) {
      history.push({ status: 'assigned', at: at(1), note: '', byName: JURISTIC_NAME })
      if (spec.status === 'inProgress' || spec.status === 'done') history.push({ status: 'inProgress', at: at(3), note: 'เริ่มงานแล้ว', byName: technician.name })
      if (spec.status === 'done') history.push({ status: 'done', at: at(4), note: 'ซ่อมเรียบร้อย', byName: technician.name })
    }
    const request: MaintenanceRequest = {
      id: `mr-${n}`,
      code: `MR-${String(n).padStart(4, '0')}`,
      unitId: unit.id,
      unitCode: unit.code,
      leaseId: lease.id,
      tenantName: lease.tenantName,
      tenantPhone: lease.tenantPhone,
      category: spec.category,
      title: spec.title,
      description: spec.description,
      photos: [picture(`photo-${n}-1.jpg`, COLORS[n % 3]), ...(n % 2 === 0 ? [picture(`photo-${n}-2.jpg`, COLORS[(n + 1) % 3])] : [])],
      createdAt: at(0),
      status: spec.status,
      history,
      ...(technician ? { assigneeId: technician.id } : {}),
    }
    requests.push(request)

    // the juristic office hears about the newest requests first; the older ones were seen
    notify({ type: 'requestCreated', requestId: request.id, recipient: 'role:juristic', createdAt: at(0), read: spec.ago > 2 })
    if (technician) {
      notify({ type: 'assigned', requestId: request.id, recipient: technician.phone, createdAt: at(1), read: !(spec.technician === 0 && spec.status === 'assigned') })
      for (const entry of history.slice(1)) {
        const unread = spec.who === 'demo' && entry.status === 'inProgress' && spec.status === 'inProgress'
        notify({ type: 'statusChanged', requestId: request.id, recipient: request.tenantPhone, createdAt: entry.at, read: !unread, status: entry.status })
      }
    }
  })

  return { version: 1, technicians: SAMPLE_TECHNICIANS.map((t) => ({ ...t })), requests, notifications }
}
