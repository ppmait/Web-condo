# Common-Area Booking & Parcels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้เช่าดูส่วนกลาง จอง และติดตามการจอง นิติบุคคลยืนยัน/ปฏิเสธและลงทะเบียนพัสดุ ผู้เช่าเห็นพัสดุและได้รับแจ้งเตือน — FR22–25 ด้วยข้อมูลจำลองใน localStorage

**Architecture:** เหมือนโมดูลงานซ่อม: กฎล้วน (`src/facilities/rules.ts`) → `createLocalFacilitiesApi` (คีย์เดียว `condo:facilities` อ่านใหม่ทุกครั้ง อ้าง `condo:property` ผ่าน `PropertyApi` เขียนบนสำเนาแบบเคร่งครัด) หลัง interface `FacilitiesApi` → `FacilitiesProvider`/`useFacilities` (ห่อใน `AppShell`) → หน้าจอ 3 หน้า กระดิ่งรวมขยายเป็นสามที่มาผ่าน `useNotifications`

**Tech Stack:** เดิม (React 19, Vite, TS, Tailwind v4, react-router, react-i18next, Vitest + RTL + user-event) ไม่เพิ่มแพ็กเกจ

**Spec:** `docs/superpowers/specs/2026-11-09-facilities-parcels-design.md`
**Requirement:** PDF ITDS262 FR22–25

## Global Constraints

- ไม่มีหลังบ้าน ไม่เพิ่มแพ็กเกจ ห้ามเรียกเครือข่าย; `/tenant/facilities`, `/tenant/parcels` เข้าได้เฉพาะ `tenant`, `/juristic/parcels-bookings` (+ `/parcels`) เฉพาะ `juristic` (guard prefix เดิม); ทั้งสามเส้นทางเลิกเป็น placeholder
- localStorage คีย์ `condo:facilities` = `{ version: 1, facilities, bookings, parcels, notifications }`; ว่าง/เสีย/รูปผิด/ผิดกฎ → seed ใหม่ไม่ throw; **อ้างห้องบางส่วนหายต้องไม่ล้าง** ล้างเฉพาะเมื่อไม่มีห้องที่อ้างเหลือเลยสักห้อง; การเขียนที่คนพึ่งพา (จอง, ตัดสิน, ยกเลิก, ปิด-เปิดส่วนกลาง, ลงทะเบียนพัสดุ, ทำเครื่องหมายรับพัสดุ) ทำบนสำเนาและเขียนแบบเคร่งครัด: storage เขียนไม่ได้ → throw `storage_failed` และไม่เปลี่ยนอะไรทั้งในหน่วยความจำและที่เก็บ; `markRead`/`markAllRead` ใช้หน่วยความจำสำรอง; ความล้มเหลวไม่ถูกจำ; **ไม่มี `await` ระหว่างอ่านใหม่กับเขียน**
- "วันนี้" ฉีดได้ (`today: () => string`), วันที่ `YYYY-MM-DD` คำนวณ UTC (`src/property/dates.ts`)
- ส่วนกลาง 4 แห่ง (ข้อมูลตั้งต้น): `pool` ความจุ 20 เปิด 6–22, `fitness` 15 เปิด 6–22, `meeting` 10 เปิด 8–20, `bbq` 12 เปิด 10–21; `Facility { id, key, openHour, closeHour, capacity, closed, closedNote? }`; ชื่อแสดงผ่าน i18n ตาม `key`
- การจอง: `date` ระหว่าง วันนี้+1 ถึง วันนี้+14 (รวมปลาย; วันนี้และวันที่ 15 ผิด); `startHour`/`endHour` จำนวนเต็ม `openHour ≤ start < end ≤ closeHour` และ `end − start` ∈ 1–3; `people` จำนวนเต็ม 1–5; **ความจุ:** ทุกชั่วโมงในช่วงที่ขอ ผลรวม `people` ของ `pending`+`confirmed` ของส่วนกลางและวันเดียวกัน + `people` ที่ขอ ≤ `capacity` (พอดีผ่าน เกิน 1 → `no_capacity`); **โควตา:** ห้องละไม่เกิน 2 การจอง `pending`+`confirmed` ในสัปดาห์เดียวกัน (จันทร์–อาทิตย์ ตามวัน `date` ของการจอง; ที่ 3 → `quota_exceeded`; `cancelled`/`rejected` ไม่นับ); ส่วนกลางที่ `closed` → `closed`; ลำดับตรวจ: ข้อมูลไม่ถูก → สัญญา → ปิด → โควตา → ความจุ
- ห้องของผู้เช่า = สัญญาที่ใช้งานอยู่วันนี้ของเบอร์โทรบัญชี (ไม่ยกเลิก, `startDate ≤ วันนี้ ≤ endDate`, ถ้ามีหลายสัญญาใช้ที่เริ่มทีหลัง); ไม่มี → `no_lease`; เก็บ snapshot `unitId`, `unitCode`, `leaseId`, `tenantName`, `tenantPhone`
- สถานะการจองเก็บ ไม่คำนวณ: `pending` → `confirmed` | `rejected` (เหตุผลบังคับ 1–300 ตัวอักษรหลัง trim); ผู้เช่าเจ้าของยกเลิกได้เมื่อ `pending`/`confirmed` และ `date > วันนี้` (→ `cancelled`; ไม่ใช่เจ้าของ → `not_owner`); นิติบุคคลตัดสินได้เฉพาะ `pending` ที่ `date ≥ วันนี้`; สถานะปลายทาง (`rejected`/`cancelled`) เปลี่ยนต่อไม่ได้ และ `confirmed` ยกเลิกได้โดยผู้เช่าเท่านั้น; ผิดกฎ → `invalid_transition`; `history[0]` = `pending` ตอนสร้าง; ทุกการเปลี่ยนต่อท้าย `{ status, at, note, byName }`; รหัส `BK-0001`… = ค่ามากสุดที่มี + 1
- พัสดุ: `Parcel { id, code (PK-0001…), unitId, unitCode, leaseId, tenantName, tenantPhone, carrier (1–40 หลัง trim), trackingNo? (≤ 40), location ('frontDesk'|'locker'), status ('waiting'|'pickedUp'), registeredAt, history[] }`; ลงทะเบียนได้เฉพาะห้องที่มีสัญญาที่ใช้งานอยู่วันนี้ (ไม่มี → `no_lease`); ผู้รับ = ผู้เช่าของสัญญานั้น; `waiting → pickedUp` ครั้งเดียว (หมายเหตุ ≤ 300; ทำซ้ำ → `invalid_transition`); ไม่มีแก้ไข/ลบ
- แจ้งเตือน: `FacilitiesNotification { id, type: 'bookingCreated'|'bookingDecided'|'bookingCancelled'|'parcelArrived', refId, recipient (เบอร์ หรือ role:juristic), createdAt, read, status? }`; จองใหม่ → `role:juristic`; ยืนยัน/ปฏิเสธ → ผู้เช่า (`status`); ผู้เช่ายกเลิก → `role:juristic`; พัสดุมาถึง → ผู้เช่า; ปลายทางเมื่อกด: `/tenant/facilities?booking=<id>`, `/tenant/parcels?parcel=<id>`, `/juristic/parcels-bookings?booking=<id>`, `/juristic/parcels-bookings/parcels?parcel=<id>`; `?booking=`/`?parcel=` ที่ไม่ใช่ของผู้ใช้/ไม่มี → เพิกเฉยและล้างพารามิเตอร์
- ข้อความ UI ทั้งหมดผ่าน i18n ครบ th และ en (เทสเทียบคีย์); วันที่ พ.ศ./ค.ศ. ตามภาษา; ป้ายสถานะมีข้อความเสมอ; ฟอร์มใน `Modal` + `FormField`; กันกดซ้ำ (ปุ่ม disabled + ref กัน); ผิดแล้วโฟกัสช่องแรกที่ผิด; ตารางอยู่ในกล่องเลื่อนข้างที่ `relative` (`DataTable` เดิม); รหัสและรหัสห้องใช้ `whitespace-nowrap`; ไม่ล้นจอที่ 320px; Modal เลื่อนได้บนจอเตี้ย; **กล่องที่ซ้อนกันใช้ `key` ไม่ซ้ำกัน (นำหน้าด้วยชนิด เช่น `detail-<id>`, `decide-<id>`) และมีเทสที่ spy `console.error` ว่าไม่มี warning**; `Modal` ที่ซ้อนกันรับคีย์บอร์ดเฉพาะอันบนสุด (แก้แล้ว) ทุกกล่องการกระทำที่ซ้อนบนรายละเอียดต้องมีเทส Tab/Escape
- เทสของ Provider ต้องรอให้ `holder` เป็น `ready` จริงก่อนอ่านค่า (ดู `MaintenanceProvider.test.tsx`)
- ข้อจำกัดเดิม: ไม่มี CDN, tokens จาก `@theme`, lint ต้องสะอาด, `useBilling`/`useMaintenance` ต้องทำงานเหมือนเดิม

## Review Focus

- จองพร้อมกันสองแท็บ/สองห้อง: ต้องไม่เกินความจุและไม่เกินโควตา; ความจุที่ขอบพอดี (เต็มพอดีผ่าน เกิน 1 คนไม่ผ่าน), ช่วงทับซ้อนบางชั่วโมง, สัปดาห์ที่ข้ามเดือน/ปี (Task 1, 2)
- ตัดสิน/ยกเลิกซ้ำและสถานะปลายทาง: ยืนยันซ้ำ ปฏิเสธแล้วยืนยัน ยกเลิกวันนี้หรือย้อนหลัง ยกเลิกของคนอื่น ต้องไม่ได้สถานะเพี้ยนหรือแจ้งเตือนซ้ำ (Task 1, 2, 4, 6)
- พื้นที่เก็บเต็มทุกการเขียน: ผู้ใช้เห็นข้อความและไม่เสียข้อมูลเดิม; ข้อมูลใหญ่/เสียต้องไม่ทำให้แอปเปิดไม่ได้ (Task 2)
- การมองเห็นและผู้รับแจ้งเตือน: ผู้เช่าเห็นการจอง/พัสดุของห้องอื่นผ่าน `?booking=`/`?parcel=`/กระดิ่ง; พัสดุถึงผู้เช่าผิดคน; แจ้งเตือนข้ามบทบาท (Task 2, 4, 5, 7)
- แก้ข้อมูลห้อง/สัญญา (ย้ายสัญญา ลบห้อง seed ใหม่) แล้วการจอง/พัสดุเดิมต้องไม่ถูกล้างและไม่พัง; ผู้เช่าสัญญาหมดอายุจองไม่ได้ ห้องไม่มีสัญญาลงทะเบียนพัสดุไม่ได้ (Task 2, 6)

---

### Task 1: ชนิดข้อมูลและกฎล้วน

**Files:**
- Create: `src/facilities/types.ts`, `src/facilities/rules.ts`
- Modify: `src/i18n/th.json`, `src/i18n/en.json` (กลุ่ม `facilities.names.*`, `facilities.status.booking.*`, `facilities.status.parcel.*`, `facilities.location.*`, `facilities.errors.*`)
- Test: `src/facilities/rules.test.ts`

**Interfaces:**
- Produces (`types.ts`): `FacilityKey = 'pool'|'fitness'|'meeting'|'bbq'`, `Facility`, `BookingStatus = 'pending'|'confirmed'|'rejected'|'cancelled'`, `ParcelStatus`, `ParcelLocation`, `HistoryEntry<S> { status: S; at; note; byName }`, `Booking`, `Parcel`, `BookingInput { facilityId; date; startHour; endHour; people }`, `CreateBookingInput = BookingInput & { tenantPhone; tenantName }`, `ParcelInput { unitId; carrier; trackingNo; location }`, `FacilitiesNotification`, `FacilitiesData`, `FacilitiesError(code, fieldErrors?)` codes `invalid_input|not_found|invalid_transition|no_lease|no_capacity|quota_exceeded|closed|not_owner|storage_failed`, `Recipient = string`, `FacilitiesApi { load; createBooking(input: CreateBookingInput); cancelBooking(bookingId, actorPhone: string); decideBooking(bookingId, decision: 'confirmed'|'rejected', reason: string, actorName: string); setFacilityClosed(facilityId, closed: boolean, note: string); registerParcel(input: ParcelInput, actorName: string); markPickedUp(parcelId, note: string, actorName: string); markRead(id); markAllRead(recipient) }`
- Produces (`rules.ts`): `FieldErrors`; `MAX_PEOPLE = 5`, `MAX_HOURS = 3`, `MAX_AHEAD_DAYS = 14`, `WEEKLY_QUOTA = 2`; `validateBooking(input: BookingInput, facility: Facility | undefined, today: string): FieldErrors`; `hourlyLoad(bookings: Booking[], facilityId: string, date: string): Map<number, number>` (นับ `pending`+`confirmed`); `freeAt(facility, bookings, date, hour): number` (ที่ว่างคงเหลือของชั่วโมงนั้น ไม่ติดลบ); `fits(facility, bookings, input: BookingInput): boolean`; `weekStart(date: string): string` (วันจันทร์ของสัปดาห์); `quotaUsed(bookings, unitId, date): number`; `canCancel(booking, today): boolean`; `canDecide(booking, today): boolean`; `validateReason(text): string | null`; `validateParcel(input: ParcelInput): FieldErrors`; `validateNote(note): string | null`; `nextCode(items: {code:string}[], prefix: 'BK'|'PK'): string`; `bookingBadge(status)`/`parcelBadge(status)` → `'pending'|'settled'|'critical'|'inactive'`

- [ ] **Step 1: เขียนเทสก่อน (fail)** `rules.test.ts`: `validateBooking` — ส่วนกลางไม่มี, วันที่ไม่จริง, วันนี้ผิด/พรุ่งนี้ผ่าน/วันนี้+14 ผ่าน/+15 ผิด, ชั่วโมงไม่ใช่จำนวนเต็ม, เริ่มก่อนเปิด/จบหลังปิด/เริ่มเท่ากับจบ/จบก่อนเริ่ม, ระยะเวลา 3 ผ่านและ 4 ผิด, `people` 0/1/5/6/1.5; `hourlyLoad` นับเฉพาะ `pending`+`confirmed` ของส่วนกลางและวันนั้น (ไม่นับ `rejected`/`cancelled`, ส่วนกลางอื่น, วันอื่น) และคืนทุกชั่วโมงที่ถูกครอบ; `freeAt`/`fits` — เต็มพอดีผ่าน เกิน 1 ไม่ผ่าน ทับซ้อนบางชั่วโมง (การจองใหม่ 9–12 ชนกับที่มีอยู่ 11–13 เฉพาะชั่วโมง 11) ตรวจทุกชั่วโมง; `weekStart` — จันทร์→ตัวเอง, อาทิตย์→จันทร์ก่อนหน้า, ข้ามเดือน (2026-12-31 → 2026-12-28), ข้ามปี (2027-01-01 → 2026-12-28), 2028-02-29; `quotaUsed` — นับเฉพาะห้องและสัปดาห์เดียวกัน (วันอาทิตย์กับจันทร์ถัดไปคนละสัปดาห์) และเฉพาะ `pending`+`confirmed`; `canCancel` — `pending`/`confirmed` ที่ `date > today` เท่านั้น (วันนี้/ย้อนหลัง/สถานะปลายทางไม่ได้); `canDecide` — `pending` ที่ `date ≥ today` เท่านั้น; `validateReason` — ว่าง/ช่องว่างผิด, 300 ผ่าน, 301 ผิด; `validateParcel` — ห้องว่าง, ขนส่งว่าง/ช่องว่าง/40 ผ่าน/41 ผิด, เลขติดตามว่างผ่าน/40 ผ่าน/41 ผิด, `location` ผิด; `validateNote` 300/301; `nextCode` ว่าง → `BK-0001`/`PK-0001`, ใช้ค่ามากสุด+1, ข้ามรหัสรูปแบบอื่น, เกินสี่หลัก; badge ครบทุกสถานะ; คีย์ i18n ทั้งหมดที่เกี่ยวข้องมีทั้งสองภาษาและแตกต่างกัน
- [ ] **Step 2: รัน** `npm test -- src/facilities` — Expected: FAIL (ยังไม่มีไฟล์)
- [ ] **Step 3: Implement** ตาม Interfaces; ข้อความผิดพลาด: ข้อมูลไม่ครบ "กรุณากรอกข้อมูลให้ครบถ้วน" (`facilities.errors.incomplete`) และรายช่อง (`date`, `time`, `people`, `reason`, `carrier`, `tracking`, `unit`, `note`) พร้อมข้อความของ `no_capacity`, `quota_exceeded`, `closed`, `no_lease`, `storage_failed`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): types and pure rules`

### Task 2: ข้อมูลตัวอย่างและ api จำลอง

**Files:**
- Create: `src/facilities/seed.ts`, `src/facilities/localFacilitiesApi.ts`
- Test: `src/facilities/seed.test.ts`, `src/facilities/localFacilitiesApi.test.ts`

**Interfaces:**
- Consumes: Task 1, `PropertyApi`, `createLocalPropertyApi`, `MemoryStorage`/`UnwritableStorage`/`UnreadableStorage`, `DEMO_TENANT_PHONE`
- Produces: `FACILITIES_KEY = 'condo:facilities'`; `SAMPLE_FACILITIES: Facility[]` (4 แห่งตาม Global Constraints, `closed: false` ยกเว้นให้ seed มี `bbq` ปิดปรับปรุงพร้อม `closedNote` เพื่อให้เห็นสถานะ "ปิด"); `makeFacilitiesSeed(property: PropertyData, today: string): FacilitiesData` (การจอง ~7 รายการครบ `pending`/`confirmed`/`rejected`/`cancelled` รวมของผู้เช่า demo `0810000001` อย่างน้อย 3 รายการต่างสถานะ และการจองในอนาคตที่ยกเลิกได้; พัสดุ ~5 รายการทั้ง `waiting` และ `pickedUp` รวมของห้อง A-1204 อย่างน้อย 1 `waiting` และ 1 `pickedUp`; แจ้งเตือนสอดคล้องกับประวัติ มีที่ยังไม่อ่านของผู้เช่า demo และของ `role:juristic`; ทุกวันที่อิงจากวันนี้ ประวัติไม่อยู่ในอนาคต การจองในอนาคตไม่เกิน +14 ไม่ละเมิดความจุ/โควตา); `createLocalFacilitiesApi(opts: { storage?; today?; property? }): FacilitiesApi`; `localFacilitiesApi`; `isFacilitiesData(v, property)`

- [ ] **Step 1: เขียนเทสก่อน (fail)** seed: ผ่าน `isFacilitiesData`, ครบสถานะ, รหัสไม่ซ้ำ, ประวัติเรียงตามเวลาและปลายทางตรงกับสถานะ, ไม่เกินความจุ/โควตาเมื่อนับด้วยกฎของ Task 1, แจ้งเตือนผู้รับถูกต้อง, ครบเงื่อนไขของผู้เช่า demo, ทดสอบที่วันนี้ต่าง ๆ (2026-11-08, 2028-02-29, 2031-01-03); api: `load` seed เมื่อว่าง/ไม่ใช่ JSON/รูปผิด และ **ต้องเท่ากับ seed พอดี** (ไม่ใช่แค่นับแถว), ส่งสำเนา; `createBooking` — สำเร็จ (รหัสถัดไป, `pending`, snapshot จากสัญญา, ประวัติหนึ่งรายการ, แจ้งเตือน `bookingCreated` ถึง `role:juristic` หนึ่งรายการ), ข้อมูลไม่ครบ → `invalid_input` พร้อมคีย์ และไม่สร้างอะไร, ไม่มีสัญญาที่ใช้งาน (ไม่มีเลย/หมดอายุ/ยกเลิก/ยังไม่เริ่ม) → `no_lease`, ส่วนกลางปิด → `closed`, โควตา — ที่ 2 ผ่าน ที่ 3 → `quota_exceeded` และการยกเลิก/ปฏิเสธคืนโควตา, ความจุ — พอดีผ่าน เกิน 1 → `no_capacity`, ช่วงทับซ้อนบางชั่วโมง, ห้องอื่นแย่งความจุ; **สองแท็บ `Promise.all` จองช่วงที่เหลือที่ว่างพอที่เดียว → สำเร็จหนึ่ง `no_capacity` หนึ่ง; สองแท็บจองให้ห้องเดียวกันตอนโควตาเหลือหนึ่ง → สำเร็จหนึ่ง `quota_exceeded` หนึ่ง; รหัสไม่ซ้ำ**; `cancelBooking` — เจ้าของยกเลิก `pending`/`confirmed` ที่ `date > today` ได้ (แจ้งเตือน `bookingCancelled` ถึงนิติบุคคล), วันนี้/ย้อนหลัง/ปลายทาง → `invalid_transition`, ไม่ใช่เจ้าของ → `not_owner`, ไม่มี → `not_found`; `decideBooking` — ยืนยัน/ปฏิเสธ `pending` (แจ้งเตือน `bookingDecided` ถึงผู้เช่าพร้อม `status`; เหตุผลถูก trim; ปฏิเสธไม่มีเหตุผล → `invalid_input`), ตัดสินซ้ำ/ตัดสินหลังยกเลิก/วันที่ผ่านแล้ว → `invalid_transition` **และไม่เพิ่มแจ้งเตือน** สองแท็บตัดสินพร้อมกันได้ผลเดียว; `setFacilityClosed` — ปิดแล้วจองใหม่ไม่ได้ เปิดแล้วจองได้ การจองเดิมไม่ถูกแตะ ส่วนกลางไม่มี → `not_found`; `registerParcel` — สำเร็จ (รหัสถัดไป `waiting` snapshot ผู้เช่าจากสัญญาที่ใช้งานของห้อง แจ้งเตือน `parcelArrived` ถึงเบอร์ผู้เช่าที่ถูกต้องเท่านั้น), ห้องไม่มีสัญญาที่ใช้งาน/ไม่มีห้อง → `no_lease`/`not_found`, ข้อมูลไม่ถูก → `invalid_input`; `markPickedUp` — `waiting → pickedUp` พร้อมหมายเหตุ trim, ซ้ำ → `invalid_transition`, หมายเหตุ 301 → `invalid_input`; `markRead`/`markAllRead` เฉพาะของผู้รับ; **พื้นที่เก็บเต็ม** (storage ที่ `setItem` throw หลัง seed): ทุกเมธอดที่เขียนแบบเคร่งครัด → `storage_failed` และ `load` เท่ากับก่อนทำ แล้วทำงานได้อีกเมื่อมีที่ว่าง; `UnwritableStorage` → เมธอดเขียนล้มด้วย `storage_failed`, `UnreadableStorage`/`null` ทำงานได้; ข้อมูลที่ไว้ใจไม่ได้ (ตารางกรณีเสียแต่ละแบบ: ไม่ใช่ JSON/วัตถุว่าง/ version อื่น/id ซ้ำ/รหัสซ้ำ/รหัสรูปแบบผิด/สถานะผิด/ประวัติว่างหรือเริ่มไม่ถูกหรือกระโดดขั้น/ชั่วโมงผิดกฎ/`people` เกิน/ความจุเกิน/แจ้งเตือนอ้างรายการที่ไม่มี/ผู้รับผิดชนิด/ทุกการอ้างห้องไม่มีเลย) → เท่ากับ seed; **ย้ายสัญญา/ลบห้อง → ข้อมูลเดิมครบ**; ความล้มเหลวชั่วคราวของ property ไม่ถูกจำ
- [ ] **Step 2: รัน** `npm test -- src/facilities` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; แบบเดียวกับ `localMaintenanceApi.ts` (อ่านใหม่ทุกครั้ง; เขียนซิงโครนัสหลัง `await property.load()`; `persistStrict` สำหรับทุกเมธอดที่เขียนยกเว้น `markRead`/`markAllRead` ที่ใช้ `persist` สำรอง); ตรวจความจุ/โควตาจากข้อมูลที่อ่านใหม่ ณ ตอนเขียน
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): seed data and local api`

### Task 3: Provider และตัวช่วยเทส

**Files:**
- Create: `src/facilities/FacilitiesContext.ts`, `useFacilities.ts`, `FacilitiesProvider.tsx`, `src/test/FacilitiesReadyProbe.tsx`, `src/test/testFacilities.ts`, `src/test/renderFacilities.tsx`
- Modify: `src/app/AppShell.tsx` (ห่อ `FacilitiesProvider` ชั้นเดียวกับ `BillingProvider`/`MaintenanceProvider`)
- Test: `src/facilities/FacilitiesProvider.test.tsx`

**Interfaces:**
- Consumes: Task 2
- Produces: `useFacilities(): { status: 'loading'|'ready'|'error'; data: FacilitiesData; today: string; reload() } & Omit<FacilitiesApi,'load'>` (เหมือน `useMaintenance`); `makeTestFacilities(opts?: { today? }): { facilities: FacilitiesApi; property: PropertyApi }`; `renderFacilities(ui, { api?, property?, today?, route?, as? })` (เหมือน `renderMaintenance` รอ `facilities-ready`)

- [ ] **Step 1: เขียนเทสก่อน (fail)** Provider (แบบเดียวกับ `MaintenanceProvider.test.tsx` และ **ใช้ `ready()` ที่รอ `holder.value?.status === 'ready'`**): loading→ready พร้อมข้อมูลและ today, รีโหลดหลังเขียน (`createBooking`), ข้อผิดพลาดส่งต่อและข้อมูลไม่เปลี่ยน, โหลดล้มเหลว/รีโหลดล้มเหลว → `error`, ไม่ set state หลัง unmount, `storage` event ของคีย์ตนเท่านั้น, ใช้นอก Provider → throw; เทส `AppShell` เดิมต้องผ่าน
- [ ] **Step 2: รัน** `npm test -- src/facilities` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): provider and test helpers`

### Task 4: หน้าผู้เช่า — ส่วนกลางและการจอง

**Files:**
- Create: `src/features/facilities/TenantFacilitiesPage.tsx`, `BookingFormModal.tsx`, `BookingDetailModal.tsx`, `AvailabilityBar.tsx`, `statusBadges.ts`
- Modify: `src/app/router.tsx` (`/tenant/facilities`)
- Test: `TenantFacilitiesPage.test.tsx`, `BookingFormModal.test.tsx`, `statusBadges.test.ts`

**Interfaces:**
- Consumes: Task 1–3, `useAuth().user`, `Modal`, `FormField`, `Button`, `ConfirmDialog`, `StatusBadge`, `formatDate`, `useProperty` (ห่อ `PropertyProvider` ในหน้า เหมือน `TenantMaintenancePage`; props `api`/`today`)
- Produces: `TenantFacilitiesPage`: การ์ดส่วนกลาง 4 ใบ (ชื่อ, เวลาเปิด-ปิด, ป้าย เปิดให้จอง/ปิดปรับปรุง พร้อมหมายเหตุ), ตัวเลือกวัน (พรุ่งนี้–+14) ที่ใช้ร่วมกับ `AvailabilityBar` (แถบรายชั่วโมงแสดงที่ว่าง/ความจุเป็นตัวเลขและข้อความ ไม่พึ่งสีอย่างเดียว), ปุ่ม "จองส่วนกลาง" (ไม่แสดงเมื่อไม่มีสัญญาที่ใช้งาน → ข้อความอธิบาย), โควตาที่เหลือของสัปดาห์ของวันที่เลือก ("ใช้ x / 2 ครั้ง"), ประวัติการจองของเบอร์ผู้ใช้ (ใหม่ไปเก่า: รหัส, ส่วนกลาง, วัน-เวลา, ผู้ใช้, ป้ายสถานะ) กดเปิด `BookingDetailModal` (ข้อมูล, เส้นเวลา, เหตุผลที่ปฏิเสธ, ปุ่มยกเลิกเมื่อ `canCancel` ผ่าน `ConfirmDialog`), อ่าน `?booking=<id>`; `BookingFormModal({ facilityId?, date?, onClose })`: เลือกส่วนกลาง/วัน/เวลาเริ่ม/ระยะเวลา (1–3 ชม.)/จำนวนผู้ใช้, แสดงที่ว่างของช่วงที่เลือกก่อนส่ง, ตรวจด้วย `validateBooking` ก่อนเรียก api, โฟกัสช่องแรกที่ผิด, กันกดซ้ำ, ข้อความเฉพาะของ `no_capacity`/`quota_exceeded`/`closed`/`no_lease`/`storage_failed`, ข้อความทั่วไปของความล้มเหลวอื่น; `requestBadge`-คู่ขนาน `bookingBadge`/`parcelBadge` ใน `statusBadges.ts` ใช้ร่วม Task 5–6

- [ ] **Step 1: เขียนเทสก่อน (fail)** ด้วย `renderFacilities(<TenantFacilitiesPage api={property} today={today} />, { as: 'tenant' })` — เห็นเฉพาะการจองของเบอร์ `0810000001` ใหม่ไปเก่า ไม่เห็นของห้องอื่น; การ์ดครบ 4 แห่งและส่วนกลางที่ปิดมีป้ายพร้อมหมายเหตุและเปิดฟอร์มจองส่วนกลางนั้นไม่ได้; `AvailabilityBar` แสดงที่ว่างตรงกับ `freeAt` ทุกชั่วโมง และเปลี่ยนตามวันที่เลือก; ฟอร์ม — ว่างทั้งหมดกดส่งแล้ว api ไม่ถูกเรียก, ข้อความ "กรุณากรอกข้อมูลให้ครบถ้วน", `aria-invalid` + โฟกัสช่องแรกที่ผิด; วันนี้/ย้อนหลัง/เกิน 14 วัน/ช่วงนอกเวลาเปิด/เกิน 3 ชม./`people` ผิด → ข้อความใต้ช่องและไม่เรียก api; ส่งสำเร็จ → api เรียกครั้งเดียวด้วยค่าที่ถูกและ `tenantPhone`/`tenantName`, รายการใหม่ขึ้นหัวรายการสถานะ "รอยืนยันการจองส่วนกลาง", กล่องปิด; โควตา — จองที่ 3 ในสัปดาห์เดียวกัน → ข้อความ `quota_exceeded` ฟอร์มค้างค่าไม่หาย; ความจุเต็ม → `no_capacity` (ฉีดการจองที่ทำให้เต็มผ่าน api ก่อนกดส่ง); ส่วนกลางถูกปิดจากอีกแท็บ → `closed`; `storage_failed` → ข้อความและฟอร์มอยู่; กดส่งซ้ำระหว่างรอเรียกครั้งเดียวและปุ่ม disabled; ไม่มีสัญญาที่ใช้งาน → ไม่มีปุ่มจอง + ข้อความ; รายละเอียด — เส้นเวลาครบ เหตุผลที่ปฏิเสธ; ยกเลิก — ยืนยันก่อน, เรียกครั้งเดียว, ปุ่มหายเมื่อ `date` เป็นวันนี้/ผ่านแล้ว/ปลายทาง; อีกแท็บตัดสินระหว่างเปิดกล่องยกเลิก → ข้อความและโหลดใหม่; `?booking=` ของตนเปิดรายละเอียด ของคนอื่น/ไม่มีไม่เปิดและล้างพารามิเตอร์; **เปิดรายละเอียดแล้วกดยกเลิก (กล่องซ้อน) — Tab อยู่ในกล่องบน, Escape ปิดเฉพาะกล่องบน, ไม่มี `console.error`**; สลับภาษา; ตาราง/รายการเลื่อนข้างในกรอบ `relative`; `statusBadges` ครบทุกสถานะมีข้อความ
- [ ] **Step 2: รัน** `npm test -- src/features/facilities` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; เพิ่มคีย์ `facilities.*` ทั้งสองภาษา; ปรับ `router.tsx` (เส้นทางผู้เช่าออกจาก placeholder)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): tenant facilities page with booking`

### Task 5: หน้าผู้เช่า — พัสดุของฉัน

**Files:**
- Create: `src/features/facilities/TenantParcelsPage.tsx`, `ParcelDetailModal.tsx`
- Modify: `src/app/router.tsx` (`/tenant/parcels`)
- Test: `TenantParcelsPage.test.tsx`

**Interfaces:**
- Consumes: Task 1–4, `parcelBadge`
- Produces: `TenantParcelsPage`: การ์ด "รอรับ" (ขนส่ง, เลขติดตามถ้ามี, วางที่ไหน, วันที่มาถึง, ป้ายสถานะ) และตาราง/รายการ "รับแล้ว" (วันที่รับ, หมายเหตุ) ของเบอร์ผู้ใช้เท่านั้น ใหม่ไปเก่า; กดเปิด `ParcelDetailModal({ parcelId, onClose, actions? })` (ข้อมูล + เส้นเวลา; `actions` ให้ Task 6 ใช้); อ่าน `?parcel=<id>`; ข้อความว่างของแต่ละกลุ่ม; จำนวนรอรับขึ้นหัวข้อ

- [ ] **Step 1: เขียนเทสก่อน (fail)** `renderFacilities(<TenantParcelsPage />, { as: 'tenant' })`: เห็นเฉพาะพัสดุของเบอร์ `0810000001` (ไม่เห็นของห้องอื่น), แยกรอรับ/รับแล้ว, เรียงใหม่ไปเก่า, การ์ดมีขนส่ง/ที่วาง/วันที่/ป้ายข้อความ, ตัวเลขรอรับถูก, ข้อความว่างเมื่อไม่มี (ใช้ api ที่ตัดพัสดุของผู้เช่า demo ออก), รายละเอียดเปิดได้และมีเส้นเวลา, `?parcel=` ของตนเปิด ของห้องอื่น/ไม่มีไม่เปิดและล้างพารามิเตอร์, พัสดุที่ลงทะเบียนใหม่ผ่าน api ขึ้นหลังรีโหลด, สลับภาษา (วันที่ ค.ศ.), ผู้เช่าไม่มีสัญญา (บัญชีเบอร์อื่น) เห็นข้อความว่างไม่พัง, นิติบุคคล/ช่างเข้า `/tenant/parcels` ไม่ได้ (พากลับ), เมนูข้าง active
- [ ] **Step 2: รัน** `npm test -- src/features/facilities/TenantParcelsPage.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; เพิ่มคีย์ `facilities.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): tenant parcels page`

### Task 6: หน้านิติบุคคล — การจองและพัสดุ

**Files:**
- Create: `src/features/facilities/JuristicFacilitiesPage.tsx`, `BookingsTab.tsx`, `ParcelsTab.tsx`, `DecideDialog.tsx`, `ParcelFormModal.tsx`, `PickupDialog.tsx`, `FacilityStatusPanel.tsx`
- Modify: `src/app/router.tsx` (`/juristic/parcels-bookings` + เส้นทางย่อย index → การจอง, `parcels` → พัสดุ)
- Test: `JuristicFacilitiesPage.test.tsx`, `BookingsTab.test.tsx`, `ParcelsTab.test.tsx`

**Interfaces:**
- Consumes: Task 1–5, `KpiCard`, `DataTable`, `ConfirmDialog`, `useProperty` (ห่อ `PropertyProvider` ในหน้า)
- Produces: `JuristicFacilitiesPage`: หัวข้อ `nav.parcelsBookings`, แถบแท็บ 2 ลิงก์ (`aria-current`), `Outlet`; `BookingsTab`: การ์ดนับตามสถานะ 4 ใบ (ถ้อยคำไม่ซ้ำกับป้ายสถานะ), `FacilityStatusPanel` (แต่ละแห่ง: เปิด/ปิด + ปุ่ม ปิดชั่วคราว/เปิดให้จอง พร้อมช่องหมายเหตุตอนปิด ผ่าน `ConfirmDialog`), ตัวกรองสถานะ, ตาราง (รหัส, ส่วนกลาง, ห้อง, ผู้จอง, วัน-เวลา, คน, ป้ายสถานะ, ปุ่มดูรายละเอียด), รายละเอียด (`BookingDetailModal` ใช้ร่วมกับ Task 4 ผ่าน `actions`) มีปุ่ม "ยืนยัน" (ผ่าน `ConfirmDialog`) และ "ปฏิเสธ" (`DecideDialog` ช่องเหตุผลบังคับ โฟกัสเมื่อผิด) เฉพาะเมื่อ `canDecide`; `ParcelsTab`: ปุ่ม "ลงทะเบียนพัสดุ" → `ParcelFormModal` (เลือกห้องจากห้องที่มีสัญญาที่ใช้งานอยู่วันนี้พร้อมชื่อผู้เช่า, ขนส่ง, เลขติดตาม, ที่วาง; ผิดแล้วโฟกัส, กันกดซ้ำ, ข้อความ `no_lease`/`storage_failed`), ตารางพัสดุ + ตัวกรองสถานะ, รายละเอียด (`ParcelDetailModal` + `actions`) มีปุ่ม "ทำเครื่องหมายว่ารับแล้ว" (`PickupDialog` หมายเหตุไม่บังคับ ≤ 300) เฉพาะ `waiting`; อ่าน `?booking=`/`?parcel=`; ทุกกล่องที่ซ้อนบนรายละเอียดใช้ `key` นำหน้าชนิด

- [ ] **Step 1: เขียนเทสก่อน (fail)** `renderApp('/juristic/parcels-bookings', { as: 'juristic' })` และ `renderFacilities`: การ์ดนับตรงข้อมูล, 2 แท็บ + `aria-current` + เมนูข้าง active บนทั้งสองเส้นทาง, ตารางการจองครบและกรองสถานะครบทุกตัวเลือกพร้อมข้อความว่าง, **ยืนยัน `pending` หลังยืนยันกล่อง → `confirmed` + แจ้งเตือนผู้เช่า (`bookingDecided`/`confirmed`) ตรวจผ่าน api**, ปฏิเสธไม่ใส่เหตุผล → ข้อความ + `aria-invalid` + โฟกัส + api ไม่ถูกเรียก, ปฏิเสธพร้อมเหตุผล → `rejected` และผู้เช่าเห็นเหตุผล และโควตาคืน (จองใหม่ได้), ไม่มีปุ่มตัดสินเมื่อสถานะไม่ใช่ `pending` หรือวันที่ผ่านแล้ว, กดยืนยันซ้ำเรียก api ครั้งเดียวและปุ่ม disabled, อีกแท็บตัดสินไปแล้ว (`invalid_transition`) → ข้อความและรายการโหลดใหม่ **ไม่เพิ่มแจ้งเตือนซ้ำ**, ปิดส่วนกลาง → การ์ด/แถบสถานะเปลี่ยน, ผู้เช่าจองส่วนกลางนั้นไม่ได้ (`closed`), เปิดกลับแล้วจองได้, การจองเดิมของส่วนกลางที่ปิดไม่ถูกแตะ; แท็บพัสดุ — ลงทะเบียนสำเร็จ (ห้องที่มีสัญญาเท่านั้นในตัวเลือก, รหัสถัดไป, `waiting`, แจ้งเตือน `parcelArrived` ถึงเบอร์ผู้เช่าห้องนั้นเท่านั้น), ฟอร์มไม่ครบ/ขนส่ง 41 ตัว/เลขติดตาม 41 ตัว → ข้อความ + โฟกัส + ไม่เรียก api, `no_lease` (สัญญาหมดอายุระหว่างเปิดฟอร์ม), กดซ้ำเรียกครั้งเดียว, `storage_failed` ฟอร์มค้างค่า, ทำเครื่องหมายรับแล้ว (หมายเหตุ trim, 301 ผิดและโฟกัส, ซ้ำจากอีกแท็บ → ข้อความและโหลดใหม่, ไม่มีปุ่มเมื่อ `pickedUp`), **เปิดรายละเอียดแล้วกดการกระทำ (กล่องซ้อน) ทั้งฝั่งการจองและพัสดุ: Tab อยู่ในกล่องบน, Escape ปิดเฉพาะกล่องบน, ไม่มี `console.error`**, ผู้เช่า/ช่างเข้าไม่ได้ (พากลับ), เส้นทางย่อยที่ไม่มี → 404, `?booking=`/`?parcel=` ที่ไม่มีเพิกเฉยและล้าง, ตารางเลื่อนข้างในกรอบ `relative`, สลับภาษา
- [ ] **Step 2: รัน** `npm test -- src/features/facilities` — Expected: FAIL (เทสใหม่)
- [ ] **Step 3: Implement**; เพิ่มคีย์ `facilities.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): juristic bookings and parcels pages`

### Task 7: กระดิ่งรวมสามที่มา

**Files:**
- Modify: `src/notifications/useNotifications.ts` (+ `AppNotice.source` เพิ่ม `'facilities'`), `src/app/NotificationBell.tsx` (ถ้าต้อง)
- Test: `src/notifications/useNotifications.test.tsx`, `src/app/NotificationBell.test.tsx` (ขยายจากเดิม ไม่ลดการตรวจ)

**Interfaces:**
- Consumes: Task 3, `useFacilities`
- Produces: `useNotifications()` เดิม แต่รวมแจ้งเตือนจาก `useFacilities` ด้วย: ผู้เช่าได้ `bookingDecided`/`parcelArrived` ของเบอร์ตน, นิติบุคคลได้ `bookingCreated`/`bookingCancelled` ของ `role:juristic` เท่านั้น, ช่างไม่ได้อะไรจากแหล่งนี้; **กรองชนิดตามบทบาท** (ผู้เช่าไม่เห็น `bookingCreated`/`bookingCancelled` แม้เบอร์ตรง; นิติบุคคลไม่เห็นของเบอร์โทรอื่น) ข้อความ i18n: "มีคำขอจอง {{code}} {{facility}} วันที่ {{date}}", "การจอง {{code}} {{status}}", "ผู้เช่ายกเลิกการจอง {{code}}", "มีพัสดุมาส่งถึงห้อง {{unit}} ({{carrier}})"; ปลายทางตาม Global Constraints; `markAllRead` ครอบทั้งสามแหล่งเฉพาะของผู้ใช้; เรียงใหม่ไปเก่า (วันเดียวกันเรียงตาม key)

- [ ] **Step 1: เขียนเทสก่อน (fail)** hook: ผู้เช่าได้บิล+งานซ่อม+ส่วนกลาง/พัสดุของเบอร์ตนเรียงถูก ไม่เห็นของเบอร์อื่นและไม่เห็นชนิดของนิติบุคคล, นิติบุคคลได้เฉพาะ `role:juristic` ของส่วนกลาง (ไม่เห็นบิลของผู้เช่า), ช่างไม่ได้ของส่วนกลาง, นับยังไม่อ่านรวมสามแหล่ง, `markAllRead` ของผู้เช่า/นิติบุคคลครอบทั้งสามแหล่งและไม่แตะของคนอื่น, ข้อความตามภาษา, ปลายทางตามบทบาท; กระดิ่ง: กดแจ้งเตือนพัสดุของผู้เช่า → `/tenant/parcels?parcel=<id>` และกล่องรายการนั้นเปิด, ยืนยันการจอง → `/tenant/facilities?booking=<id>` เปิด, นิติบุคคลกดคำขอจอง → `/juristic/parcels-bookings?booking=<id>` เปิด, ทำเครื่องหมายอ่านเมื่อกด, `99+` นับรวมสามแหล่ง, แจ้งเตือนจากอีกแท็บ (`storage` event ของ `condo:facilities`) ปรากฏโดยไม่รีเฟรช; เทสกระดิ่ง/hook เดิมทั้งหมดยังผ่าน (ปรับ `seedStorage` ให้เริ่มด้วยแจ้งเตือนส่วนกลางว่างเพื่อให้เทสเก่านับเหมือนเดิม และเทสใหม่ seed เอง)
- [ ] **Step 2: รัน** `npm test -- src/notifications src/app/NotificationBell.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; เพิ่มคีย์ `facilities.notifications.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(facilities): facilities and parcels in the notification bell`

### Task 8: ตรวจรับรวมและเอกสาร

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า

- [ ] **Step 1: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด, lint 0 warning, ไม่มี CDN (`grep -rlE "cdn.tailwindcss.com|fonts.googleapis.com" dist index.html src`)
- [ ] **Step 2: ตรวจแบบ end-to-end ในเบราว์เซอร์จริง** (`npm run dev` + Playwright ในโฟลเดอร์ชั่วคราวนอกโปรเจกต์ ใช้ Chrome ในเครื่อง; 1280, 390, 320px และจอเตี้ย 480px ใช้ iframe ที่ความกว้างจริงเมื่อวัดความกว้าง; **ระวัง `cd ../..` ในสคริปต์ shell — ใช้ path เต็ม**; **เปิดคอนโซลดูและทำให้ `console error` ทุกข้อความเป็นความล้มเหลว**): ล้าง localStorage; `tenant01` เห็นการ์ดส่วนกลาง 4 แห่ง (บาร์บีคิวปิดปรับปรุง) แถบที่ว่างเปลี่ยนตามวัน, จองได้ (ฟอร์มว่างผิด, วันนี้ผิด, ครบแล้วขึ้น "รอยืนยัน"), จองจนโควตา 2 ครั้งแล้วครั้งที่ 3 ถูกปฏิเสธด้วยข้อความ, ทำความจุเต็มแล้วจองเพิ่มไม่ได้ (เติมผ่านบัญชีอื่นหรือ api), ยกเลิกการจองของตน; `staff01` เห็นกระดิ่งมีคำขอจอง กดไปที่รายการ ยืนยันหนึ่งรายการ ปฏิเสธหนึ่งรายการพร้อมเหตุผล ปิด-เปิดส่วนกลาง ลงทะเบียนพัสดุให้ห้อง A-1204 และทำเครื่องหมายรับแล้ว; `tenant01` เห็นแจ้งเตือนการจองที่ถูกยืนยัน/ปฏิเสธและพัสดุมาถึง กดไปที่รายการ และเห็นพัสดุของตนใน "พัสดุของฉัน"; **กล่องซ้อน (รายละเอียด + ยืนยัน/ปฏิเสธ/รับพัสดุ/ยกเลิก) ใช้คีย์บอร์ดล้วนได้: Tab ไม่ติด, Escape ปิดทีละกล่อง**; ทำให้พื้นที่เก็บเต็มจริงแล้วจอง/ลงทะเบียนพัสดุ/ยืนยัน ต้องเห็นข้อความและข้อมูลเดิมไม่หาย; รีเฟรชแล้วข้อมูลอยู่; ลบ `condo:facilities` แล้วรีเฟรชได้ข้อมูลตัวอย่าง; ข้อมูลเสียแล้วรีเฟรชไม่พัง; ยกเลิกสัญญาของ `tenant01` ใน `condo:property` (ตั้ง `cancelledAt` ไม่ลบสัญญา เพราะมีบันทึกตรวจอ้างอยู่) แล้วการจอง/พัสดุเดิมยังอยู่แต่จองใหม่ไม่ได้; ผู้เช่าเปิด `/juristic/parcels-bookings` ถูกพากลับ และช่างเปิด `/tenant/facilities` ถูกพากลับ; ผู้เช่าที่สมัครเองเบอร์ไม่ตรงสัญญาเห็นข้อความจองไม่ได้และไม่มีพัสดุ; สลับ TH/EN; ไม่ล้นจอที่ 390/320px (header มีกระดิ่ง) และ Modal/ตารางใช้งานได้ที่จอเตี้ย; ถ่ายภาพหน้าจอและดูจริง รายงานตามจริง ถ้าตรวจข้อใดไม่ได้ให้บอก
- [ ] **Step 3: อัปเดต `README.md`:** หัวข้อ "จองส่วนกลางและพัสดุ (FR22–25)" (ไฟล์: `src/facilities/`, `src/features/facilities/`; ส่วนกลาง 4 แห่งและความจุ/เวลาเปิด; กฎการจอง: ล่วงหน้า 1–14 วัน, ชั่วโมงละ 1–3, ผู้ใช้ 1–5, ความจุรายชั่วโมง, โควตา 2 ครั้ง/สัปดาห์/ห้อง; สถานะและการยกเลิก; พัสดุและผู้รับตามสัญญาที่ใช้งาน; กระดิ่งรวมสามแหล่ง; ข้อจำกัด: ไม่มี QR/ตู้ล็อกเกอร์จริง, ไม่มีหน้าตั้งค่า, ไม่มีจองแทน, ไม่แก้/ลบพัสดุ, ความจุตรวจฝั่งไคลเอนต์ในเบราว์เซอร์เดียว; วิธีเปลี่ยนเป็นหลังบ้านจริงโดยเขียน `FacilitiesApi` ตัวใหม่แล้วส่งให้ `FacilitiesProvider api`), ปรับสถานะโปรเจกต์ให้ตรง
- [ ] **Step 4: Commit** `docs: facilities and parcels readme and final verification`
