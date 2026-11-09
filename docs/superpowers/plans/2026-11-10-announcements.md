# Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** นิติบุคคลสร้าง/แก้ไข/ลบประกาศ ผู้เช่าดูประกาศที่ยังเผยแพร่ มีป้าย "ใหม่" และแจ้งเตือนในกระดิ่งรวม — FR26–27 ด้วยข้อมูลจำลองใน localStorage

**Architecture:** เหมือนโมดูลส่วนกลาง/พัสดุ: กฎล้วน (`src/announcements/rules.ts`) → `createLocalAnnouncementsApi` (คีย์เดียว `condo:announcements` อ่านใหม่ทุกครั้ง เขียนบนสำเนาแบบเคร่งครัด ไม่พึ่ง `condo:property`) หลัง interface `AnnouncementsApi` → `AnnouncementsProvider`/`useAnnouncements` (ห่อใน `AppShell`) → หน้าจอ 2 หน้า กระดิ่งรวมขยายเป็นสี่ที่มาผ่าน `useNotifications` โดยแจ้งเตือนของประกาศ **คำนวณจากสถานะการอ่าน** ไม่เก็บเป็นระเบียนแยก

**Tech Stack:** เดิม (React 19, Vite, TS, Tailwind v4, react-router, react-i18next, Vitest + RTL + user-event) ไม่เพิ่มแพ็กเกจ

**Spec:** `docs/superpowers/specs/2026-11-10-announcements-design.md`
**Requirement:** PDF ITDS262 FR26–27

## Global Constraints

- ไม่มีหลังบ้าน ไม่เพิ่มแพ็กเกจ ห้ามเรียกเครือข่าย; `/tenant/announcements` เข้าได้เฉพาะ `tenant`, `/juristic/announcements` เฉพาะ `juristic` (guard prefix เดิม); ช่างไม่มีหน้านี้; ทั้งสองเส้นทางเลิกเป็น placeholder
- localStorage คีย์ `condo:announcements` = `{ version: 1, announcements }`; ว่าง/เสีย/รูปผิด/ผิดกฎ → seed ใหม่ไม่ throw; **อ่านจากที่เก็บเสมอเมื่อข้อมูลในที่เก็บใช้ได้** แม้แท็บนี้เคยบันทึกไม่สำเร็จ (ถอยไปใช้หน่วยความจำเฉพาะเมื่อที่เก็บไม่มีข้อมูลที่ใช้ได้และแท็บนี้บันทึกไม่ได้); การเขียนที่คนพึ่งพา (สร้าง แก้ ลบ) ทำบนสำเนาและเขียนแบบเคร่งครัด: storage เขียนไม่ได้ → throw `storage_failed` และไม่เปลี่ยนอะไรทั้งในหน่วยความจำและที่เก็บ; `markRead`/`markAllRead` ใช้หน่วยความจำสำรอง; ความล้มเหลวไม่ถูกจำ; **ไม่มี `await` ระหว่างอ่านใหม่กับเขียน**
- "วันนี้" ฉีดได้ (`today: () => string`), วันที่ `YYYY-MM-DD` คำนวณ UTC (`src/property/dates.ts`); **`updatedAt` = `max(createdAt, updatedAt เดิม, วันนี้)`** (นาฬิกาถอยหลังแล้วต้องไม่ทำให้ข้อมูลเสีย)
- ประกาศ: `title` 1–100 ตัวอักษร และ `body` 1–2000 ตัวอักษรหลัง trim; `category` ∈ `general | maintenance | event | urgent`; `pinned` boolean; `expiresOn` ไม่บังคับ (สตริงว่าง = ไม่มี) ต้องเป็นวันที่จริงและ `≥ วันนี้`; รหัส `AN-0001`… = ค่ามากสุดที่มี + 1 (ไม่ซ้ำแม้มีสองแท็บ); `authorName` = ชื่อบัญชีที่สร้าง; `readBy` = เบอร์โทรไม่ซ้ำ
- หมดอายุ **คำนวณ ไม่เก็บ:** `expiresOn < วันนี้`; วันหมดอายุพอดียังเผยแพร่อยู่; ผู้เช่าเห็นเฉพาะที่ยังเผยแพร่ นิติบุคคลเห็นทั้งหมด; ลำดับ: ปักหมุดก่อน แล้ว `createdAt` ใหม่ไปเก่า แล้วรหัสมากไปน้อย
- แก้ไข: แก้หัวข้อหรือเนื้อหา (หลัง trim) → ล้าง `readBy`; แก้เฉพาะหมวด/ปักหมุด/วันหมดอายุไม่ล้าง; **ไม่มีอะไรเปลี่ยน → ไม่เขียนอะไรและไม่เปลี่ยน `updatedAt`**; ลบถาวร; ประกาศไม่มี → `not_found`
- การอ่าน: `markRead(id, phone)` ครั้งเดียวต่อเบอร์ (ซ้ำไม่เปลี่ยนอะไรและไม่เขียน); ประกาศไม่มี → ไม่ทำอะไร ไม่ throw
- แจ้งเตือนของประกาศ (ผู้เช่าเท่านั้น): หนึ่งรายการต่อประกาศที่ยังเผยแพร่และเบอร์ของผู้ใช้ไม่อยู่ใน `readBy`; ข้อความ "ประกาศใหม่: {{title}}"; ปลายทาง `/tenant/announcements?announcement=<id>`; กดแล้วทำเครื่องหมายอ่าน; "อ่านทั้งหมด" ของกระดิ่งครอบประกาศที่ยังเผยแพร่; นิติบุคคลและช่างไม่ได้แจ้งเตือนจากแหล่งนี้
- `?announcement=<id>` ฝั่งผู้เช่าที่ไม่มี/หมดอายุแล้ว → เพิกเฉยและล้างพารามิเตอร์; ฝั่งนิติบุคคลไม่ใช้พารามิเตอร์
- ข้อความ UI ทั้งหมดผ่าน i18n ครบ th และ en (เทสเทียบคีย์); วันที่ พ.ศ./ค.ศ. ตามภาษา; ป้ายสถานะ/หมวดมีข้อความเสมอ; ฟอร์มใน `Modal` + `FormField`; กันกดซ้ำ (ปุ่ม disabled + ref กัน); ผิดแล้วโฟกัสช่องแรกที่ผิด; ตารางอยู่ในกล่องเลื่อนข้างที่ `relative` (`DataTable` เดิม); รหัสใช้ `whitespace-nowrap`; ไม่ล้นจอที่ 320px; Modal เลื่อนได้บนจอเตี้ย; **ไม่มีกล่องซ้อนกัน** (แก้/ลบทำจากแถวในตารางโดยตรง) แต่ถ้ามีกล่องที่ซ้อนกันที่ใดต้องใช้ `key` ไม่ซ้ำและมีเทส Tab/Escape กับ spy `console.error`
- เทสของ Provider ต้องรอให้ `holder` เป็น `ready` จริงก่อนอ่านค่า (ดู `FacilitiesProvider.test.tsx`)
- ข้อจำกัดเดิม: ไม่มี CDN, tokens จาก `@theme`, lint ต้องสะอาด, `useBilling`/`useMaintenance`/`useFacilities` ต้องทำงานเหมือนเดิม

## Review Focus

- แท็บที่เคยบันทึกไม่สำเร็จ (พื้นที่เต็ม) กับแท็บอื่นที่บันทึกทีหลัง: ต้องไม่ซ่อนหรือเขียนทับประกาศของกันและกัน; นาฬิกาเครื่องถอยหลังแล้วสร้าง/แก้/อ่านต้องไม่ทำให้ข้อมูลเสียจนถูก seed ทับ (Task 2)
- พื้นที่เก็บเต็มทุกการเขียน (สร้าง แก้ ลบ): ผู้ใช้เห็นข้อความและไม่เสียข้อมูลเดิม; ข้อมูลใหญ่/เสียต้องไม่ทำให้แอปเปิดไม่ได้ (Task 2, 5)
- การหมดอายุที่ขอบ: วันหมดอายุพอดี/เมื่อวาน/พรุ่งนี้, ข้ามเดือน/ปี/วันที่ 29 กุมภาพันธ์, แก้ขยายวันของประกาศที่หมดอายุแล้ว, ประกาศหมดอายุระหว่างที่ผู้เช่าเปิดอ่านอยู่ (Task 1, 2, 4)
- การอ่านและแจ้งเตือน: แก้เนื้อหาแล้วต้องล้างการอ่านแต่แก้ปักหมุดไม่ล้าง; ผู้เช่าสองคนอ่านพร้อมกันต้องไม่ทับกัน; แจ้งเตือนต้องไม่ค้างหลังลบ/หมดอายุ; นิติบุคคลและช่างต้องไม่ได้แจ้งเตือนประกาศ; "อ่านทั้งหมด" ต้องไม่แตะแหล่งอื่น/คนอื่น (Task 2, 4, 6)
- การมองเห็นและสิทธิ์: ผู้เช่าเห็นประกาศหมดอายุผ่าน `?announcement=`/กระดิ่ง; ผู้เช่าเรียก api ของนิติบุคคลได้ผ่าน UI หรือไม่; ลบประกาศที่อีกคนเปิดค้างอยู่ (Task 4, 5, 6)

---

### Task 1: ชนิดข้อมูลและกฎล้วน

**Files:**
- Create: `src/announcements/types.ts`, `src/announcements/rules.ts`
- Modify: `src/i18n/th.json`, `src/i18n/en.json` (กลุ่ม `announcements.category.*`, `announcements.errors.*`, `announcements.status.*`)
- Test: `src/announcements/rules.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Category = 'general'|'maintenance'|'event'|'urgent'`, `Announcement { id; code; title; body; category; pinned; expiresOn?; createdAt; updatedAt; authorName; readBy: string[] }`, `AnnouncementInput { title; body; category; pinned; expiresOn: string }`, `AnnouncementsData { version: 1; announcements }`, `AnnouncementsError(code, fieldErrors?)` codes `invalid_input|not_found|storage_failed`, `AnnouncementsApi { load; create(input, authorName: string): Promise<Announcement>; update(id, input): Promise<Announcement>; remove(id): Promise<void>; markRead(id, phone: string): Promise<void>; markAllRead(phone: string): Promise<void> }`
- Produces (`rules.ts`): `FieldErrors`; `CATEGORIES`, `TITLE_MAX = 100`, `BODY_MAX = 2000`, `PREVIEW_MAX = 120`; `validateAnnouncement(input: AnnouncementInput, today: string): FieldErrors`; `isExpired(a: Announcement, today: string): boolean`; `isLive(a, today): boolean`; `sortAnnouncements(list: Announcement[]): Announcement[]` (สำเนาใหม่ ไม่แก้ต้นฉบับ); `isUnreadBy(a, phone, today): boolean` (ยังเผยแพร่ และเบอร์ไม่อยู่ใน `readBy`; เบอร์ว่างหลัง trim → false); `contentChanged(before: Announcement, input: AnnouncementInput): boolean` (หัวข้อหรือเนื้อหาหลัง trim ต่างจากเดิม); `nextCode(items: {code:string}[]): string`; `categoryBadge(category): 'critical'|'pending'|'settled'|'inactive'`; `preview(body: string, max?: number): string` (ยุบช่องว่าง/ขึ้นบรรทัดเป็นช่องว่างเดียว, trim, ตัดที่ `max` จุดรหัส (code point) ต่อด้วย `…` เมื่อยาวกว่า; ไม่ตัดกลางอักขระประกอบของไทย — ตัดตามกลุ่มอักขระ (grapheme) ด้วย `Intl.Segmenter` เมื่อมี)

- [ ] **Step 1: เขียนเทสก่อน (fail)** `rules.test.ts`: `validateAnnouncement` — หัวข้อว่าง/ช่องว่าง/100 ผ่าน/101 ผิด (หลัง trim), เนื้อหาว่าง/2000 ผ่าน/2001 ผิด, หมวดผิด, `expiresOn` ว่างผ่าน/วันนี้ผ่าน/เมื่อวานผิด/พรุ่งนี้ผ่าน/ไม่ใช่วันที่จริง (2026-02-30, รูปแบบผิด)/ข้ามเดือนและปี (วันนี้ 2026-12-31 กับ 2027-01-01 ผ่าน)/29 กุมภาพันธ์ 2028 ผ่านและ 2027-02-29 ผิด, รายงานทุกปัญหาพร้อมกัน; `isExpired`/`isLive` — ไม่มีวันหมดอายุ ไม่หมดอายุ, วันหมดอายุ = วันนี้ ยังเผยแพร่, เมื่อวาน หมดอายุ; `sortAnnouncements` — ปักหมุดก่อน, `createdAt` ใหม่ก่อน, เท่ากันเรียงรหัสมากก่อน, ไม่แก้อาร์เรย์ต้นฉบับ, ปักหมุดเก่ากับไม่ปักใหม่ → ปักหมุดก่อน; `isUnreadBy` — อ่านแล้ว/ยังไม่อ่าน/หมดอายุ (ไม่นับ)/เบอร์ว่าง/เบอร์มีช่องว่างหน้าหลัง (trim); `contentChanged` — เปลี่ยนหัวข้อ, เนื้อหา, แค่ปักหมุดหรือหมวดหรือวันหมดอายุ (ไม่เปลี่ยน), ต่างแค่ช่องว่างหัวท้าย (ไม่เปลี่ยน); `nextCode` — ว่าง → `AN-0001`, ค่ามากสุด + 1 ไม่ใช่จำนวน, ข้ามรหัสรูปแบบอื่น, เกินสี่หลัก; `categoryBadge` ครบ 4; `preview` — เนื้อหาสั้นไม่ต่อ `…`, ยาว 120 พอดีไม่ตัด และ 121 ตัดพร้อม `…`, ยุบบรรทัดใหม่/ช่องว่างซ้อน, ข้อความไทยที่มีสระ/วรรณยุกต์ไม่ถูกตัดกลางกลุ่ม, ว่างได้ ""; คีย์ i18n ที่เกี่ยวข้องมีทั้งสองภาษาและแตกต่างกัน
- [ ] **Step 2: รัน** `npm test -- src/announcements` — Expected: FAIL (ยังไม่มีไฟล์)
- [ ] **Step 3: Implement** ตาม Interfaces; ข้อความผิดพลาดรายช่อง `title`, `body`, `category`, `expiresOn` พร้อม `incomplete` ("กรุณากรอกข้อมูลให้ครบถ้วน") `notFound`, `storageFailed`, `failed`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(announcements): types and pure rules`

### Task 2: ข้อมูลตัวอย่างและ api จำลอง

**Files:**
- Create: `src/announcements/seed.ts`, `src/announcements/localAnnouncementsApi.ts`
- Test: `src/announcements/seed.test.ts`, `src/announcements/localAnnouncementsApi.test.ts`

**Interfaces:**
- Consumes: Task 1, `MemoryStorage`/`UnwritableStorage`/`UnreadableStorage`, `DEMO_TENANT_PHONE`, `addDays`
- Produces: `ANNOUNCEMENTS_KEY = 'condo:announcements'`; `makeAnnouncementsSeed(today: string): AnnouncementsData` (5 รายการอิงวันนี้: ปักหมุด `general` 1, `urgent` 1 (งดน้ำ มีวันหมดอายุพรุ่งนี้), `event` 1, `general` 1, และ 1 รายการที่หมดอายุแล้ว (`expiresOn` = เมื่อวาน); ผู้เช่า demo `0810000001` อยู่ใน `readBy` ของบางรายการและมี **อย่างน้อย 2 รายการที่ยังเผยแพร่และยังไม่อ่าน**; `readBy` ของรายการอื่นมีเบอร์ตัวอย่างอื่นบ้างเพื่อให้จำนวนอ่านแล้วไม่เป็นศูนย์; ทุกวันที่ไม่อยู่ในอนาคต (`createdAt`/`updatedAt` ≤ วันนี้); รหัสเรียง `AN-0001`…ตามวันที่สร้าง); `createLocalAnnouncementsApi(opts: { storage?: Storage | null; today?: () => string }): AnnouncementsApi`; `localAnnouncementsApi`; `isAnnouncementsData(v)` (ไม่มีพารามิเตอร์ `property` เพราะไม่อ้างห้อง)

- [ ] **Step 1: เขียนเทสก่อน (fail)** seed: ผ่าน `isAnnouncementsData`, ครบเงื่อนไขที่ระบุ, รหัสไม่ซ้ำ, ทดสอบวันนี้ต่าง ๆ (2026-11-08, 2028-02-29, 2031-01-03); api: `load` seed เมื่อว่าง/ไม่ใช่ JSON/รูปผิด และ **ต้องเท่ากับ seed พอดี**, ส่งสำเนา; `create` — สำเร็จ (รหัสถัดไป, trim หัวข้อ/เนื้อหา, `readBy: []`, `createdAt = updatedAt = วันนี้`, `authorName`), ข้อมูลไม่ถูก → `invalid_input` พร้อมคีย์และไม่สร้าง, วันหมดอายุเมื่อวานผิด; `update` — เปลี่ยนหัวข้อ/เนื้อหา → ล้าง `readBy` และ `updatedAt` = `max(createdAt, updatedAt เดิม, วันนี้)`; เปลี่ยนเฉพาะปักหมุด/หมวด/วันหมดอายุ → คง `readBy`; **ไม่มีอะไรเปลี่ยน → คืนค่าเดิมและ `load` ก่อน/หลังเท่ากันทุกไบต์ (ไม่เขียน)**; ขยายวันหมดอายุของประกาศที่หมดอายุแล้วได้ (ทำให้กลับมาเผยแพร่); ล้างวันหมดอายุได้ (สตริงว่าง); ไม่มี → `not_found`; `remove` — ลบแล้วหาย, ลบซ้ำ/ไม่มี → `not_found`; `markRead` — เพิ่มเบอร์ครั้งเดียว (ซ้ำและเบอร์ที่มีช่องว่างหัวท้ายไม่เพิ่มซ้ำ), ประกาศไม่มีไม่ throw, เบอร์ว่างไม่เพิ่ม, ซ้ำไม่เขียน; `markAllRead(phone)` — ทุกประกาศที่ยังเผยแพร่เท่านั้น (ที่หมดอายุไม่แตะ) และเฉพาะเบอร์นั้น; **สองแท็บ `Promise.all` สร้างพร้อมกัน → รหัสไม่ซ้ำและมีทั้งสองรายการ; สองเบอร์ `markRead` ประกาศเดียวกันพร้อมกัน → ทั้งสองเบอร์อยู่ใน `readBy`**; **พื้นที่เก็บเต็ม** (storage ที่ `setItem` throw หลัง seed): `create`/`update`/`remove` → `storage_failed` และ `load` เท่ากับก่อนทำ แล้วทำงานได้อีกเมื่อมีที่ว่าง; `UnwritableStorage` → สามเมธอดนั้นล้มด้วย `storage_failed` (ไม่เก็บในหน่วยความจำเงียบ ๆ), `markRead`/`markAllRead` ใช้ความจำสำรองได้; `UnreadableStorage`/`null` ทำงานได้; **แท็บที่เคย seed ไม่สำเร็จ (พื้นที่เต็ม) แล้วมีที่ว่าง: เห็นสิ่งที่แท็บอื่นสร้างทีหลัง และการสร้างของตนไม่ทับของอีกแท็บ**; **นาฬิกาถอยหลัง: สร้างวันที่ 2026-11-10 แล้ว `update`/`markRead` ด้วย api ที่วันนี้ = 2026-11-09 → สำเร็จ, `updatedAt` ไม่ย้อน, `load` ถัดไปไม่ถูก seed ทับ**; ข้อมูลที่ไว้ใจไม่ได้ (ตาราง: ไม่ใช่ JSON/วัตถุว่าง/version อื่น/id ซ้ำ/รหัสซ้ำ/รหัสรูปแบบผิด/หมวดผิด/หัวข้อว่าง/หัวข้อเกิน 100/เนื้อหาเกิน 2000/วันที่ไม่จริง/`updatedAt < createdAt`/`readBy` ซ้ำหรือไม่ใช่สตริง/`expiresOn` ไม่ใช่วันที่) → เท่ากับ seed; **ข้อมูลที่ `expiresOn` เป็นอดีต (ประกาศหมดอายุไปแล้ว) ต้องยังถูกไว้ใจ ไม่ถูก seed ทับ**; ความล้มเหลวชั่วคราวของนาฬิกาไม่ถูกจำ
- [ ] **Step 2: รัน** `npm test -- src/announcements` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; แบบเดียวกับ `localFacilitiesApi.ts` (อ่านใหม่ทุกครั้ง; `fresh()` ใช้ที่เก็บเสมอเมื่อข้อมูลใช้ได้; `persistStrict` สำหรับ create/update/remove บนสำเนา; `persist` สำรองสำหรับ markRead/markAllRead; `updatedAt` ผ่านตัวช่วย `stamp`)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(announcements): seed data and local api`

### Task 3: Provider และตัวช่วยเทส

**Files:**
- Create: `src/announcements/AnnouncementsContext.ts`, `useAnnouncements.ts`, `AnnouncementsProvider.tsx`, `src/test/AnnouncementsReadyProbe.tsx`, `src/test/testAnnouncements.ts`, `src/test/renderAnnouncements.tsx`
- Modify: `src/app/AppShell.tsx` (ห่อ `AnnouncementsProvider` ชั้นเดียวกับ provider อื่น)
- Test: `src/announcements/AnnouncementsProvider.test.tsx`

**Interfaces:**
- Consumes: Task 2
- Produces: `useAnnouncements(): { status: 'loading'|'ready'|'error'; data: AnnouncementsData; today: string; reload() } & Omit<AnnouncementsApi,'load'>` (เหมือน `useFacilities`); `makeTestAnnouncements(opts?: { today? }): { announcements: AnnouncementsApi }`; `renderAnnouncements(ui, { api?, today?, route?, as? })` (AuthProvider + AnnouncementsProvider + MemoryRouter; รอ `announcements-ready`; ไม่ต้องมี PropertyProvider)

- [ ] **Step 1: เขียนเทสก่อน (fail)** Provider (แบบเดียวกับ `FacilitiesProvider.test.tsx` และ **ใช้ `ready()` ที่รอ `holder.value?.status === 'ready'`**): loading→ready พร้อมข้อมูลและ today, รีโหลดหลังเขียน (`create`), ข้อผิดพลาดส่งต่อและข้อมูลไม่เปลี่ยน, `update`/`remove`/`markRead`/`markAllRead` สะท้อนในข้อมูล, โหลดล้มเหลว/รีโหลดล้มเหลว → `error`, ไม่ set state หลัง unmount, `storage` event ของคีย์ตนเท่านั้น, ใช้นอก Provider → throw; เทส `AppShell` เดิมต้องผ่าน
- [ ] **Step 2: รัน** `npm test -- src/announcements` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(announcements): provider and test helpers`

### Task 4: หน้าผู้เช่า — ประกาศ

**Files:**
- Create: `src/features/announcements/TenantAnnouncementsPage.tsx`, `AnnouncementDetailModal.tsx`, `categoryBadges.ts`
- Modify: `src/app/router.tsx` (`/tenant/announcements`)
- Test: `TenantAnnouncementsPage.test.tsx`, `categoryBadges.test.ts`

**Interfaces:**
- Consumes: Task 1–3, `useAuth().user`, `Modal`, `StatusBadge`, `formatDate`
- Produces: `TenantAnnouncementsPage`: การ์ดประกาศที่ยังเผยแพร่เรียงด้วย `sortAnnouncements` (ป้ายหมวด, ป้าย "ปักหมุด" เป็นข้อความ, หัวข้อ, วันที่, `preview(body)`, ป้าย "ใหม่" เมื่อ `isUnreadBy(a, phone, today)`); ข้อความว่างเมื่อไม่มี; กดการ์ด `aria-label` "เปิดประกาศ {{code}}" เปิด `AnnouncementDetailModal({ announcementId, onClose, children? })` (หมวด, วันที่ประกาศ, วันหมดอายุถ้ามี, ผู้ประกาศ, เนื้อหาเต็มรักษาการขึ้นบรรทัดด้วย `whitespace-pre-line` แสดงเป็นข้อความธรรมดา ไม่ตีความ HTML); เปิดรายละเอียดแล้วเรียก `markRead(id, phone)` ครั้งเดียวต่อการเปิด; ประกาศที่หายไป/หมดอายุระหว่างเปิดอ่าน → กล่องแสดง "ไม่พบประกาศนี้แล้ว" พร้อมปุ่มปิด; อ่าน `?announcement=<id>` (ไม่มี/หมดอายุ → ล้างพารามิเตอร์ ไม่เปิด); `categoryBadges.ts`: `announcementBadge(category)` ให้ `Status` ของ `StatusBadge` และข้อความ `announcements.category.<key>`

- [ ] **Step 1: เขียนเทสก่อน (fail)** ด้วย `renderAnnouncements(<TenantAnnouncementsPage />, { as: 'tenant' })`: เห็นเฉพาะประกาศที่ยังเผยแพร่ ไม่เห็นที่หมดอายุแม้อยู่ในข้อมูล; ลำดับปักหมุดก่อนแล้วใหม่ไปเก่า; การ์ดมีป้ายหมวดเป็นข้อความ, ป้ายปักหมุดเป็นข้อความ, วันที่ตามภาษา, ตัวอย่างตัดตามกฎ; ป้าย "ใหม่" เฉพาะที่ยังไม่อ่านของเบอร์ `0810000001`; เปิดอ่านแล้วป้ายหายและ api ถูกเรียก `markRead` ครั้งเดียว (เปิดซ้ำไม่เรียกซ้ำสำหรับที่อ่านแล้ว); เนื้อหาเต็มรักษาการขึ้นบรรทัด และ `<b>x</b>` ในเนื้อหาแสดงเป็นข้อความตรง ๆ ไม่เป็นแท็ก; วันหมดอายุแสดงเมื่อมี; ข้อความว่างเมื่อไม่มีประกาศ (ใช้ api ที่ตัดทุกรายการ); ประกาศถูกลบ/หมดอายุจากอีกแท็บระหว่างเปิดอ่าน (เทียบผ่าน `storage` event) → "ไม่พบประกาศนี้แล้ว" และปิดได้; `?announcement=` ของประกาศที่ยังเผยแพร่เปิดและล้างพารามิเตอร์เมื่อปิด, ของที่หมดอายุ/ไม่มีไม่เปิดและล้างพารามิเตอร์; Escape ปิดและโฟกัสกลับการ์ด; สลับภาษา (วันที่ ค.ศ., ชื่อหมวด); การ์ดอยู่ในกริดที่ไม่ล้นที่ 320px (ตรวจจริงใน Task 8); นิติบุคคล/ช่างเข้า `/tenant/announcements` ไม่ได้ (`renderApp` พากลับ), เมนูข้าง active; `categoryBadges` ครบ 4 หมวด มีข้อความสองภาษา
- [ ] **Step 2: รัน** `npm test -- src/features/announcements` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; เพิ่มคีย์ `announcements.*` ทั้งสองภาษา; ปรับ `router.tsx` (เส้นทางผู้เช่าออกจาก placeholder)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(announcements): tenant announcements page`

### Task 5: หน้านิติบุคคล — สร้าง แก้ไข ลบ

**Files:**
- Create: `src/features/announcements/JuristicAnnouncementsPage.tsx`, `AnnouncementFormModal.tsx`, `DeleteAnnouncementDialog.tsx`
- Modify: `src/app/router.tsx` (`/juristic/announcements`)
- Test: `JuristicAnnouncementsPage.test.tsx`, `AnnouncementFormModal.test.tsx`

**Interfaces:**
- Consumes: Task 1–4, `DataTable`, `ConfirmDialog`, `FormField`, `Button`
- Produces: `JuristicAnnouncementsPage`: ตัวกรอง `สถานะ` (ทั้งหมด/กำลังเผยแพร่/หมดอายุแล้ว), ปุ่ม "สร้างประกาศ", ตาราง (รหัส, หมวด, หัวข้อ, วันที่ประกาศ, หมดอายุ, ปักหมุด, อ่านแล้ว = `readBy.length`, สถานะ กำลังเผยแพร่/หมดอายุแล้ว เป็นป้ายมีข้อความ, ปุ่มแก้ไข/ลบ `aria-label` "แก้ไข {{code}}" / "ลบ {{code}}") เรียงด้วย `sortAnnouncements`; `AnnouncementFormModal({ announcement?, onClose })` (สร้างเมื่อไม่มี `announcement`): หัวข้อ, เนื้อหา (textarea พร้อมตัวนับ `{{n}}/2000`), หมวด (select), ปักหมุด (checkbox), วันหมดอายุ (`type="date"`, ไม่บังคับ); ตรวจด้วย `validateAnnouncement` ก่อนเรียก api, โฟกัสช่องแรกที่ผิด, กันกดซ้ำ, `storage_failed` → ข้อความเฉพาะ, `not_found` (ถูกลบจากอีกแท็บระหว่างแก้) → ข้อความ + ปิดได้; แก้ไม่เปลี่ยนอะไรปิดกล่องโดยไม่เรียกเขียน; `DeleteAnnouncementDialog({ announcement, onClose })` ผ่าน `ConfirmDialog` (กันกดซ้ำ, `not_found` ถือว่าลบแล้ว → ปิดและโหลดใหม่, `storage_failed` → ข้อความ); ไม่มีกล่องซ้อนกัน

- [ ] **Step 1: เขียนเทสก่อน (fail)** ด้วย `renderAnnouncements(<JuristicAnnouncementsPage />, { as: 'juristic' })`: ตารางครบทุกประกาศรวมที่หมดอายุ, ปักหมุดก่อน, จำนวนอ่านแล้วตรงข้อมูล, ป้ายสถานะมีข้อความ, วันที่ตามภาษา, กรองครบทั้งสามตัวเลือกและข้อความว่างเมื่อไม่มี, ตารางเลื่อนข้างในกรอบ `relative`; **สร้าง** — ฟอร์มว่างกดส่งแล้ว api ไม่ถูกเรียก, ข้อความ "กรุณากรอกข้อมูลให้ครบถ้วน", `aria-invalid` + โฟกัสช่องแรกที่ผิด, หัวข้อ 101/เนื้อหา 2001 ผิดใต้ช่อง (วางข้อความด้วย `user.paste`), วันหมดอายุเมื่อวานผิด, สำเร็จ → api เรียกครั้งเดียวด้วยค่าที่ถูกและ `authorName` ของบัญชี, แถวใหม่ขึ้นทันที, กล่องปิด; กดส่งซ้ำระหว่างรอเรียกครั้งเดียวและปุ่ม disabled; `storage_failed` → ข้อความและฟอร์มค้างค่า; **แก้ไข** — เปิดด้วยค่าเดิม, แก้หัวข้อแล้ว `readBy` ล้าง (ตรวจด้วย api), แก้แค่ปักหมุด `readBy` คงอยู่, ไม่เปลี่ยนอะไรปิดโดยไม่เรียก `update`, ขยายวันหมดอายุของประกาศที่หมดอายุแล้ว → สถานะเปลี่ยนเป็นกำลังเผยแพร่, ถูกลบจากอีกแท็บระหว่างแก้ → ข้อความ; **ลบ** — ถามก่อน (ยกเลิกไม่เรียก api), ยืนยันแล้วแถวหาย, เรียก api ครั้งเดียวเมื่อกดซ้ำ, ลบซ้ำจากอีกแท็บ → ปิดโดยไม่ค้าง, `storage_failed` → ข้อความและแถวยังอยู่; Escape ปิดกล่องและโฟกัสกลับปุ่มที่เปิด; ผู้เช่า/ช่างเข้า `/juristic/announcements` ไม่ได้ (พากลับ), เมนูข้าง active, ไม่มี `console.error` ตลอดการสร้าง/แก้/ลบ (spy), สลับภาษา
- [ ] **Step 2: รัน** `npm test -- src/features/announcements` — Expected: FAIL (เทสใหม่)
- [ ] **Step 3: Implement**; เพิ่มคีย์ `announcements.*`; ปรับ `router.tsx` (เส้นทางนิติบุคคลออกจาก placeholder)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(announcements): juristic announcements page`

### Task 6: กระดิ่งรวมสี่ที่มา

**Files:**
- Modify: `src/notifications/useNotifications.ts` (+ `AppNotice.source` เพิ่ม `'announcements'`)
- Test: `src/notifications/useNotifications.test.tsx`, `src/app/NotificationBell.test.tsx` (ขยายจากเดิม ไม่ลดการตรวจ)

**Interfaces:**
- Consumes: Task 3, `useAnnouncements`
- Produces: `useNotifications()` เดิมแต่รวมประกาศ: **เฉพาะผู้เช่า** ได้หนึ่งรายการต่อประกาศที่ `isUnreadBy(a, user.phone, today)` (key `announcements:<id>`, `createdAt` = `updatedAt` ของประกาศ, `read: false` เสมอเพราะเฉพาะที่ยังไม่อ่าน, ข้อความ "ประกาศใหม่: {{title}}", ปลายทาง `/tenant/announcements?announcement=<id>`, `markRead` = `announcements.markRead(id, phone)`); นิติบุคคล/ช่างไม่ได้อะไรจากแหล่งนี้; `markAllRead` ของผู้เช่าเรียก `announcements.markAllRead(user.phone)` เพิ่มจากแหล่งเดิม; นับยังไม่อ่านรวมสี่แหล่ง; เรียงใหม่ไปเก่าเหมือนเดิม

- [ ] **Step 1: เขียนเทสก่อน (fail)** hook: ผู้เช่าได้บิล+งานซ่อม+ส่วนกลาง/พัสดุ+ประกาศที่ยังไม่อ่านรวมกันเรียงถูก; ประกาศที่อ่านแล้ว/หมดอายุไม่ขึ้น; อ่านประกาศแล้วรายการหายและจำนวนลด; นิติบุคคลและช่างไม่ได้แจ้งเตือนประกาศ (แม้เบอร์โทรตรงกับผู้เช่า); ประกาศที่ถูกแก้หัวข้อ (ล้างการอ่าน) กลับมาเป็นแจ้งเตือนใหม่; `markAllRead` ของผู้เช่าครอบทั้งสี่แหล่งเฉพาะของผู้ใช้ และ **ไม่ทำให้ประกาศที่หมดอายุกลายเป็นอ่านแล้ว**; ข้อความตามภาษา; ปลายทางถูก; กระดิ่ง: กดแจ้งเตือนประกาศ → `/tenant/announcements?announcement=<id>` และกล่องรายการนั้นเปิด และทำเครื่องหมายอ่านครั้งเดียว, `99+` นับรวมสี่แหล่ง, แจ้งเตือนจากอีกแท็บ (`storage` event ของ `condo:announcements`) ปรากฏโดยไม่รีเฟรช; เทสกระดิ่ง/hook เดิมทั้งหมดยังผ่าน (ปรับ `seed` ของเทสให้เริ่มด้วยประกาศที่ผู้เช่า demo อ่านครบ เพื่อให้เทสเก่านับเหมือนเดิม และเทสใหม่ seed เอง)
- [ ] **Step 2: รัน** `npm test -- src/notifications src/app/NotificationBell.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; เพิ่มคีย์ `announcements.notifications.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(announcements): announcements in the notification bell`

### Task 7: ตรวจรับรวมและเอกสาร

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า

- [ ] **Step 1: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด, lint 0 warning, ไม่มี CDN (`grep -rlE "cdn.tailwindcss.com|fonts.googleapis.com" dist index.html src`)
- [ ] **Step 2: ตรวจแบบ end-to-end ในเบราว์เซอร์จริง** (`npm run dev` + Playwright ในโฟลเดอร์ชั่วคราวนอกโปรเจกต์ ใช้ Chrome ในเครื่อง; 1280, 390 และ 320px และจอเตี้ย 480px ใช้ iframe ที่ความกว้างจริงเมื่อวัดความกว้าง; **ระวัง `cd ../..` ในสคริปต์ shell — ใช้ path เต็ม**; **เปิดคอนโซลดูและทำให้ `console error` ทุกข้อความเป็นความล้มเหลว**): ล้าง localStorage (แล้วรีเฟรชก่อนล็อกอินเพื่อให้ seed บัญชีใหม่); `tenant01` เห็นประกาศตัวอย่าง (ปักหมุดก่อน, ป้ายหมวดมีข้อความ, ป้าย "ใหม่" ของที่ยังไม่อ่าน, ไม่เห็นที่หมดอายุ) และกระดิ่งมีตัวเลขรวมประกาศ; เปิดอ่านประกาศแล้วป้ายและแจ้งเตือนหายและตัวเลขลด; `staff01` เห็นประกาศทั้งหมดรวมที่หมดอายุและจำนวนอ่านแล้ว สร้างประกาศใหม่ (ฟอร์มว่าง/หัวข้อยาวเกิน/วันหมดอายุเมื่อวานถูกปฏิเสธใต้ช่อง แล้วสร้างจริง) แก้ไขหัวข้อ (การอ่านถูกล้าง) แก้เฉพาะปักหมุด (การอ่านคงอยู่) ขยายวันหมดอายุของประกาศที่หมดอายุแล้ว และลบประกาศหนึ่งรายการผ่านกล่องยืนยัน; `tenant01` เห็นประกาศใหม่และกระดิ่ง กดไปเปิดประกาศได้ และประกาศที่แก้หัวข้อกลับเป็น "ใหม่"; นิติบุคคลและช่าง (`tech01`) ไม่มีแจ้งเตือนประกาศในกระดิ่ง; ทำให้พื้นที่เก็บเต็มจริงแล้วสร้าง/แก้/ลบ ต้องเห็นข้อความและข้อมูลเดิมไม่หาย; รีเฟรชแล้วข้อมูลอยู่; ลบ `condo:announcements` แล้วรีเฟรชได้ข้อมูลตัวอย่าง; ข้อมูลเสียแล้วรีเฟรชไม่พัง; **เลื่อนนาฬิกาของเบราว์เซอร์ถอยหลังหนึ่งวัน (Playwright `page.clock`) แล้วแก้/อ่านประกาศ ต้องไม่ถูก seed ทับ**; ผู้เช่าเปิด `/juristic/announcements` และช่างเปิด `/tenant/announcements` ถูกพากลับ; ผู้เช่าที่สมัครเองเบอร์ไม่ตรงสัญญายังอ่านประกาศได้ (ประกาศไม่ผูกกับสัญญา); สลับ TH/EN; ไม่ล้นจอที่ 390/320px (header มีกระดิ่ง) และ Modal/ตารางใช้งานได้ที่จอเตี้ย; ถ่ายภาพหน้าจอและดูจริง รายงานตามจริง ถ้าตรวจข้อใดไม่ได้ให้บอก
- [ ] **Step 3: อัปเดต `README.md`:** หัวข้อ "ประกาศข่าวสาร (FR26–27)" (ไฟล์: `src/announcements/`, `src/features/announcements/`; หมวดและป้าย; กฎหมดอายุที่คำนวณและวันหมดอายุพอดี; การอ่านเก็บเป็นเบอร์โทร แก้หัวข้อ/เนื้อหาแล้วล้างการอ่าน; แจ้งเตือนคำนวณจากการอ่าน; ข้อจำกัด: ไม่มีเอกสารแนบ/กลุ่มผู้รับ/ตั้งเวลาเผยแพร่/ความคิดเห็น/รายชื่อผู้ยังไม่อ่าน, ลบถาวร, ตรวจฝั่งไคลเอนต์, เนื้อหาเป็นข้อความธรรมดา; วิธีเปลี่ยนเป็นหลังบ้านจริงโดยเขียน `AnnouncementsApi` ตัวใหม่แล้วส่งให้ `AnnouncementsProvider api`), ปรับสถานะโปรเจกต์ให้ตรง
- [ ] **Step 4: Commit** `docs: announcements readme and final verification`
