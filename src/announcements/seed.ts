import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays, isValidDate } from '../property/dates'
import { CATEGORIES, TITLE_MAX, BODY_MAX } from './rules'
import type { Announcement, AnnouncementsData, Category } from './types'

export const ANNOUNCEMENTS_KEY = 'condo:announcements'

const JURISTIC_NAME = 'สมหญิง นิติบุคคล'

export function makeAnnouncementsSeed(today: string): AnnouncementsData {
  return {
    version: 1,
    announcements: [
      {
        id: 'ann-1',
        code: 'AN-0001',
        title: 'ยินดีต้อนรับสู่ระบบบริหารจัดการคอนโดมิเนียม',
        body: 'ระบบบริการออนไลน์สำหรับลูกบ้านและผู้พักอาศัย สามารถตรวจสอบใบแจ้งหนี้ แจ้งซ่อม จองสิ่งอำนวยความสะดวก และติดตามพัสดุได้ตลอด 24 ชั่วโมง',
        category: 'general',
        pinned: true,
        createdAt: addDays(today, -10),
        updatedAt: addDays(today, -10),
        authorName: JURISTIC_NAME,
        readBy: [DEMO_TENANT_PHONE, '0891112233'],
      },
      {
        id: 'ann-2',
        code: 'AN-0002',
        title: 'แจ้งหยุดจ่ายน้ำประปาชั่วคราวเพื่อซ่อมท่อเมนหลัก',
        body: 'นิติบุคคลขอแจ้งปิดระบบจ่ายน้ำประปาชั่วคราวเพื่อดำเนินการซ่อมแซมท่อส่งน้ำหลัก ขอความกรุณาลูกบ้านสำรองน้ำไว้ใช้งานล่วงหน้า',
        category: 'urgent',
        pinned: false,
        expiresOn: addDays(today, 1),
        createdAt: addDays(today, -2),
        updatedAt: addDays(today, -2),
        authorName: JURISTIC_NAME,
        readBy: ['0891112233'],
      },
      {
        id: 'ann-3',
        code: 'AN-0003',
        title: 'กิจกรรมทำบุญตักบาตรและ Big Cleaning Day ประจำปี',
        body: 'ขอเชิญลูกบ้านทุกท่านร่วมกิจกรรมทำบุญตักบาตรพระสงฆ์ และร่วมกิจกรรม Big Cleaning Day บริเวณพื้นที่ส่วนกลางชั้น 1 ในวันหยุดสุดสัปดาห์นี้',
        category: 'event',
        pinned: false,
        expiresOn: addDays(today, 7),
        createdAt: addDays(today, -1),
        updatedAt: addDays(today, -1),
        authorName: JURISTIC_NAME,
        readBy: [],
      },
      {
        id: 'ann-4',
        code: 'AN-0004',
        title: 'ประกาศระเบียบและข้อปฏิบัติการใช้พื้นที่ลานจอดรถ',
        body: 'ขอความร่วมมือลูกบ้านและผู้พักอาศัยทุกท่านจอดรถในช่องที่กำหนด และติดสติกเกอร์อนุญาตจอดรถบริเวณหน้ารถให้เห็นชัดเจนเพื่อความปลอดภัย',
        category: 'general',
        pinned: false,
        createdAt: today,
        updatedAt: today,
        authorName: JURISTIC_NAME,
        readBy: [DEMO_TENANT_PHONE],
      },
      {
        id: 'ann-5',
        code: 'AN-0005',
        title: 'แจ้งตรวจสอบระบบสัญญาณเตือนอัคคีภัยประจำปี',
        body: 'เจ้าหน้าที่จะเข้าดำเนินการทดสอบระบบสัญญาณเตือนอัคคีภัยตามอาคาร ระหว่างเวลา 10:00 - 15:00 น. ขออภัยในเสียงรบกวน',
        category: 'maintenance',
        pinned: false,
        expiresOn: addDays(today, -1),
        createdAt: addDays(today, -5),
        updatedAt: addDays(today, -5),
        authorName: JURISTIC_NAME,
        readBy: [],
      },
    ],
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
const isDate = (v: unknown): v is string => typeof v === 'string' && isValidDate(v)

function isAnnouncement(v: unknown): v is Announcement {
  if (!isRecord(v)) return false
  if (!isString(v.id) || !v.id.trim()) return false
  if (!isString(v.code) || !/^AN-\d+$/.test(v.code)) return false
  if (!isString(v.title) || !v.title.trim() || v.title.trim().length > TITLE_MAX) return false
  if (!isString(v.body) || !v.body.trim() || v.body.trim().length > BODY_MAX) return false
  if (!CATEGORIES.includes(v.category as Category)) return false
  if (!isBoolean(v.pinned)) return false
  if (v.expiresOn !== undefined && (!isString(v.expiresOn) || !isDate(v.expiresOn))) return false
  if (!isDate(v.createdAt)) return false
  if (!isDate(v.updatedAt)) return false
  if (v.updatedAt < v.createdAt) return false
  if (!isString(v.authorName) || !v.authorName.trim()) return false
  if (!Array.isArray(v.readBy)) return false
  const phones = new Set<string>()
  for (const phone of v.readBy) {
    if (!isString(phone) || !phone.trim() || phones.has(phone)) return false
    phones.add(phone)
  }
  return true
}

export function isAnnouncementsData(v: unknown): v is AnnouncementsData {
  if (!isRecord(v)) return false
  if (v.version !== 1) return false
  if (!Array.isArray(v.announcements)) return false

  const ids = new Set<string>()
  const codes = new Set<string>()

  for (const a of v.announcements) {
    if (!isAnnouncement(a)) return false
    if (ids.has(a.id)) return false
    if (codes.has(a.code)) return false
    ids.add(a.id)
    codes.add(a.code)
  }

  return true
}
