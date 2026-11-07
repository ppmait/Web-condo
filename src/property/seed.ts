import { addDays } from './dates'
import {
  CHECK_ITEMS,
  type Condition,
  type Inspection,
  type Lease,
  type PropertyData,
  type Unit,
  type UnitType,
  type Ownership,
} from './types'

type UnitRow = [code: string, floor: number, area: number, type: UnitType, owner: string, ownership: Ownership, rent: number, closed?: true]

// Fictional names and numbers only.
const UNIT_ROWS: UnitRow[] = [
  ['A-0501', 5, 30, 'studio', 'คุณวรา ใจเย็น', 'forRent', 12000],
  ['A-0502', 5, 30, 'studio', 'คุณธีร์ สายลม', 'forRent', 12000],
  ['A-0801', 8, 35, 'studio', 'คุณกานดา เรืองศรี', 'ownerOccupied', 0],
  ['A-0802', 8, 35, 'studio', 'คุณปฏิภาณ ทองดี', 'forRent', 13000],
  ['A-1201', 12, 40, 'oneBed', 'คุณมาลี สุขสม', 'forRent', 18000],
  ['A-1202', 12, 40, 'oneBed', 'คุณนที พรหมวงศ์', 'ownerOccupied', 0],
  ['A-1204', 12, 40, 'oneBed', 'คุณรินทร์ ศรีสุข', 'forRent', 18000],
  ['A-1205', 12, 53.3, 'twoBed', 'คุณพิมพ์ ลิขิต', 'forRent', 26000],
  ['A-1901', 19, 46.5, 'oneBed', 'คุณอนันต์ ดวงจันทร์', 'ownerOccupied', 0],
  ['A-1902', 19, 46.5, 'oneBed', 'คุณวิชุดา เมฆา', 'forRent', 19500],
  ['A-2001', 20, 60, 'twoBed', 'คุณศักดิ์ ทิพย์เนตร', 'forRent', 28000],
  ['A-2002', 20, 60, 'twoBed', 'คุณจิตรา ภูผา', 'ownerOccupied', 0],
  ['B-0301', 3, 28, 'studio', 'คุณเอก ลมโชย', 'forRent', 11000],
  ['B-0302', 3, 28, 'studio', 'คุณสุดา ธารา', 'forRent', 11000, true],
  ['B-0801', 8, 42, 'oneBed', 'คุณภัทร สายน้ำ', 'forRent', 17000],
  ['B-0802', 8, 42, 'oneBed', 'คุณนลิน ฟ้าใส', 'forRent', 17000],
  ['B-1201', 12, 55, 'twoBed', 'คุณปวีณ แก้วมณี', 'forRent', 24000],
  ['B-1202', 12, 55, 'twoBed', 'คุณมนัส ใบไม้', 'ownerOccupied', 0],
  ['B-1601', 16, 70, 'threeBed', 'คุณสิริ บุญมา', 'forRent', 35000],
  ['B-1602', 16, 70, 'threeBed', 'คุณธนา ชัยมงคล', 'forRent', 35000],
  ['B-2101', 21, 53.3, 'twoBed', 'คุณพรรณ ศิลาทอง', 'forRent', 26000],
  ['B-2102', 21, 53.3, 'twoBed', 'คุณกฤษ รุ่งเรือง', 'forRent', 26000],
  ['B-2501', 25, 90, 'threeBed', 'คุณวัลลภ เกษมสุข', 'ownerOccupied', 0],
  ['B-2502', 25, 90, 'threeBed', 'คุณอรอุมา พัฒนา', 'forRent', 42000],
]

const items = (problems: Partial<Record<(typeof CHECK_ITEMS)[number], [Condition, string]>> = {}) =>
  CHECK_ITEMS.map((key) => {
    const p = problems[key]
    return { key, condition: p ? p[0] : ('ok' as Condition), note: p ? p[1] : '' }
  })

/** Sample data. Every date is relative to `today`, so the screens always look "live". */
export function makeSeed(today: string): PropertyData {
  const d = (n: number) => addDays(today, n)

  const units: Unit[] = UNIT_ROWS.map(([code, floor, areaSqm, type, ownerName, ownership, listRent, closed], i) => ({
    id: `u-${i + 1}`,
    code,
    tower: code[0],
    floor,
    areaSqm,
    type,
    ownerName,
    ownership,
    listRent,
    closed: closed === true,
  }))
  const unitId = (code: string) => units.find((u) => u.code === code)!.id

  const lease = (id: string, code: string, tenantName: string, tenantPhone: string, start: number, end: number, rent: number, extra: Partial<Lease> = {}): Lease => ({
    id,
    unitId: unitId(code),
    tenantName,
    tenantPhone,
    startDate: d(start),
    endDate: d(end),
    monthlyRent: rent,
    deposit: rent * 2,
    ...extra,
  })

  const leases: Lease[] = [
    lease('l-1', 'A-1204', 'คุณอลิสา ชัยวงศ์', '0810000001', -307, 58, 18000), // active, expiring
    lease('l-2', 'A-0502', 'คุณกมล วงศ์ดี', '0810000002', -120, 245, 12000), // active
    lease('l-3', 'A-1205', 'คุณสุพรรษา บวรเวช', '0810000003', -343, 22, 26000), // active, expiring
    lease('l-4', 'B-0801', 'คุณธนากร มีสุข', '0810000004', -420, -30, 17000), // ended
    lease('l-5', 'B-0802', 'คุณชนาภร ทองคำ', '0810000005', -200, 165, 17000, { cancelledAt: d(-40), cancelReason: 'ผู้เช่าย้ายงานต่างจังหวัด' }), // cancelled
    lease('l-6', 'B-1201', 'คุณณัฐ พงษ์สุวรรณ', '0810000006', 15, 380, 24000), // upcoming
    lease('l-7', 'A-1902', 'คุณปริญญา สุดใจ', '0810000007', -60, 305, 19500), // active, no move-in yet
    lease('l-8', 'B-1601', 'คุณฟ้าใส ใจงาม', '0810000008', -200, 165, 35000), // active, no move-in yet
    lease('l-9', 'A-0802', 'คุณเมธี ศรีสวัสดิ์', '0810000009', -500, -135, 13000), // ended
  ]
  const startOf = (id: string) => leases.find((l) => l.id === id)!.startDate
  const endOf = (id: string) => leases.find((l) => l.id === id)!.endDate

  const inspection = (id: string, leaseId: string, type: Inspection['type'], date: string, inspector: string, its = items(), meters: Pick<Inspection, 'waterMeter' | 'electricMeter'> = {}, note = ''): Inspection => ({
    id,
    leaseId,
    type,
    date,
    inspector,
    items: its,
    note,
    ...meters,
  })

  const inspections: Inspection[] = [
    inspection('i-1', 'l-1', 'moveIn', addDays(startOf('l-1'), 1), 'สมหญิง นิติบุคคล', items({ bathroom: ['damaged', 'ก๊อกอ่างล้างหน้ารั่วเล็กน้อย'] }), { waterMeter: 142, electricMeter: 2140 }),
    inspection('i-2', 'l-2', 'moveIn', addDays(startOf('l-2'), 1), 'สมหญิง นิติบุคคล', items(), { waterMeter: 88, electricMeter: 1310 }),
    inspection('i-3', 'l-3', 'moveIn', addDays(startOf('l-3'), 2), 'สมศักดิ์ ฝ่ายอาคาร', items({ keyCards: ['missing', 'คีย์การ์ดมีเพียง 2 จาก 3 ใบ'] }), { waterMeter: 20, electricMeter: 400 }),
    inspection('i-4', 'l-4', 'moveIn', addDays(startOf('l-4'), 1), 'สมศักดิ์ ฝ่ายอาคาร', items(), { waterMeter: 10, electricMeter: 90 }),
    inspection('i-5', 'l-4', 'moveOut', endOf('l-4'), 'สมหญิง นิติบุคคล', items({ kitchen: ['damaged', 'เตาไฟฟ้ามีรอยไหม้'], balcony: ['damaged', 'ราวระเบียงหลวม'] }), { waterMeter: 160, electricMeter: 2900 }, 'รอคืนเงินมัดจำหลังหักค่าซ่อม'),
    inspection('i-6', 'l-5', 'moveIn', addDays(startOf('l-5'), 1), 'สมศักดิ์ ฝ่ายอาคาร', items(), { waterMeter: 33, electricMeter: 510 }),
  ]

  return { version: 1, units, leases, inspections }
}
