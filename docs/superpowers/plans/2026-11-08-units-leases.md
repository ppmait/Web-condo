# Units, Leases & Inspections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า `/juristic/units` ให้นิติบุคคลจัดการห้องชุด สัญญาเช่า และบันทึกตรวจสภาพเข้า/ออก (FR3–10) ด้วยข้อมูลจำลองใน localStorage

**Architecture:** กฎธุรกิจเป็นฟังก์ชันล้วน (`rules.ts`) → `localPropertyApi` (ข้อมูลก้อนเดียว `condo:property`) หลัง interface `PropertyApi` → `PropertyProvider`/`useProperty()` → หน้า 3 แท็บใต้ `UnitsPage` หน้าจอไม่แตะ storage โดยตรง

**Tech Stack:** เดิม (React 19, Vite, TS, Tailwind v4, react-router, react-i18next, Vitest + RTL + user-event) ไม่เพิ่มแพ็กเกจ

**Spec:** `docs/superpowers/specs/2026-11-08-units-leases-design.md`
**Requirement:** PDF ITDS262 FR3–10

## Global Constraints

- ไม่มีหลังบ้าน ไม่เพิ่มแพ็กเกจ ห้ามเรียกเครือข่าย; เข้าได้เฉพาะ role `juristic` (guard เดิมของ `/juristic/*`)
- localStorage คีย์เดียว `condo:property` = `{ version: 1, units, leases, inspections }`; ข้อมูลว่าง/JSON เสีย/รูปผิด/อ้างอิงข้ามกันไม่ตรง (สัญญาชี้ห้องที่ไม่มี, บันทึกตรวจชี้สัญญาที่ไม่มี) → seed ใหม่ทั้งก้อน ไม่ throw; storage อ่าน/เขียนไม่ได้ต้องทำงานในหน่วยความจำ; ความล้มเหลวชั่วคราวห้ามถูกแคช
- สถานะห้องและสัญญา **คำนวณ ไม่เก็บ** ด้วย "วันนี้" ที่ฉีดเข้าได้ (`today: () => string` รูป `YYYY-MM-DD`; ค่าเริ่มต้นจากวันที่เครื่องตามเวลาท้องถิ่น); ข้อมูลตัวอย่างผูกกับ "วันนี้" แบบสัมพัทธ์ ห้ามฝังวันที่ตายตัว
- Unit: `code` `^[A-Z]-\d{3,4}$` ไม่ซ้ำ (tower = ตัวอักษรหน้า code), `floor` จำนวนเต็ม 1–99, `areaSqm` > 0 และ ≤ 999, `type` ∈ studio|oneBed|twoBed|threeBed, `ownership` ∈ ownerOccupied|forRent, `listRent` จำนวนเต็ม ≥ 0, `closed` boolean
- สถานะห้องที่แสดง: `closed` → closed; มีสัญญาใช้งานอยู่ → rented; `ownerOccupied` → ownerOccupied; อื่นๆ → vacant
- ลบห้องไม่ได้ถ้ามีสัญญาใดๆ (`unit_has_leases`); ห้องที่มีสัญญาแก้ `code`/`ownership` ไม่ได้
- Lease: ชื่อผู้เช่าไม่ว่าง, เบอร์ `^0\d{9}$`, `startDate` < `endDate` (วันที่จริงที่มีอยู่ในปฏิทิน), `monthlyRent` จำนวนเต็ม > 0, `deposit` จำนวนเต็ม ≥ 0; ห้องต้องมี ไม่ปิดปรับปรุง และ `forRent`; ช่วงวันที่ห้ามซ้อนกับสัญญาที่ไม่ถูกยกเลิกของห้องเดียวกัน โดยวันสิ้นสุดของสัญญาหนึ่งกับวันเริ่มของอีกสัญญา **ห้ามเป็นวันเดียวกัน** (นับว่าซ้อน); แก้ได้เฉพาะที่ยังไม่ยกเลิกและยังไม่หมดอายุ (`lease_locked`); ยกเลิกได้ครั้งเดียว
- สถานะสัญญาที่แสดง: cancelled (`cancelledAt`) > ended (`endDate` < วันนี้) > upcoming (`startDate` > วันนี้) > active; active ที่ `endDate` ≤ วันนี้ + 60 วัน (นับวันนี้ด้วย) ได้ป้าย "ใกล้หมดอายุ"
- Inspection: 8 หมวดคงที่ (livingRoom, bedroom, bathroom, kitchen, balcony, airConditioner, appliances, keyCards) แต่ละหมวด `condition` ok|damaged|missing และ `note` (บังคับเมื่อไม่ใช่ ok); ต่อสัญญามี moveIn ≤ 1 และ moveOut ≤ 1; วันตรวจเข้า ≥ `startDate`; วันตรวจออก ≥ วันตรวจเข้า (ถ้ามี); ตรวจออกกับสัญญาที่ยกเลิกแล้วได้; แก้ได้ ลบไม่ได้; มิเตอร์เป็นจำนวนไม่ติดลบ (ไม่บังคับ)
- ข้อความ UI ทั้งหมดผ่าน i18n ครบ th และ en (เทสเทียบคีย์ของ `i18n.test.tsx` จะ fail ถ้าขาด); เงินบาทจำนวนเต็ม `฿1,234` ชิดขวา `tabular-nums`; วันที่แสดงปี พ.ศ. เมื่อภาษาไทย (`th-TH-u-ca-buddhist`, UTC) และ ค.ศ. เมื่ออังกฤษ
- ฟอร์มใน `Modal` ใช้ `FormField`; กดส่งซ้ำระหว่างรอไม่ได้ (ปุ่ม disabled + ref กัน); ผิดแล้วโฟกัสช่องแรกที่ผิด; ลบ/ยกเลิกต้องยืนยัน; ตารางต้องเลื่อนในแนวนอนภายในกรอบของตาราง ไม่ให้หน้าเลื่อนข้าง
- ข้อผิดพลาดของชั้นข้อมูล: `PropertyError(code, fieldErrors?)` โดย `invalid_input` พก `fieldErrors` (ช่อง → คีย์ i18n `property.errors.*`) ครอบคลุมทุกปัญหาที่ผูกกับช่อง; `unit_has_leases`, `lease_locked`, `not_found` ไม่ผูกช่อง
- ข้อจำกัดเดิมยังใช้: ไม่มี CDN, tokens จาก `@theme`, breakpoints เดิม, lint ต้องสะอาด

## Review Focus

- ช่วงสัญญาซ้อนกัน: วันชิดกัน (สิ้นสุด = เริ่ม), สัญญาที่ยกเลิกแล้วต้องไม่นับ, การแก้ไขต้องไม่ชนกับตัวเอง (Task 1, 2)
- `condo:property` เป็น JSON ถูกแต่รูปผิด หรืออ้างอิงข้ามกันไม่ตรง ต้อง seed ใหม่ ไม่พัง (Task 2)
- ขอบวันที่: สัญญาสิ้นสุดวันนี้/เมื่อวาน/อีก 60 และ 61 วัน, วันที่ไม่มีในปฏิทิน (`2026-02-30`), ข้ามปีและปีอธิกสุรทิน (Task 1)
- ลบห้องที่มีสัญญา, ยกเลิกสัญญาซ้ำ, แก้สัญญาที่ยกเลิกแล้ว, กดส่งฟอร์มซ้ำ ต้องถูกปฏิเสธพร้อมข้อความ ไม่ทำข้อมูลเสีย (Task 5, 6)
- ข้อความไทยยาวและตารางบนจอ 390px/320px ต้องไม่ทำให้หน้าเลื่อนข้าง และ Modal บนจอเตี้ยต้องเลื่อนได้ (Task 5–7)

---

### Task 1: ชนิดข้อมูล, ตัวช่วยวันที่ และกฎธุรกิจ (ฟังก์ชันล้วน)

**Files:**
- Create: `src/property/types.ts`, `src/property/dates.ts`, `src/property/rules.ts`
- Test: `src/property/dates.test.ts`, `src/property/rules.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `UnitType`, `Ownership`, `Unit { id; code; tower; floor; areaSqm; type; ownerName; ownership; listRent; closed }`, `UnitInput = Omit<Unit, 'id' | 'tower'>`, `Lease { id; unitId; tenantName; tenantPhone; startDate; endDate; monthlyRent; deposit; cancelledAt?: string; cancelReason?: string }`, `LeaseInput = Omit<Lease, 'id' | 'cancelledAt' | 'cancelReason'>`, `Condition`, `CHECK_ITEMS` (tuple ของ 8 key) และ `CheckItemKey`, `InspectionItem { key; condition; note }`, `InspectionType = 'moveIn' | 'moveOut'`, `Inspection { id; leaseId; type; date; inspector; items: InspectionItem[]; waterMeter?: number; electricMeter?: number; note: string }`, `InspectionInput = Omit<Inspection, 'id'>`, `PropertyData { version: 1; units: Unit[]; leases: Lease[]; inspections: Inspection[] }`, `PropertyErrorCode = 'invalid_input' | 'unit_has_leases' | 'lease_locked' | 'not_found'`, `class PropertyError extends Error { code; fieldErrors?: Record<string, string> }`, `interface PropertyApi { load(): Promise<PropertyData>; createUnit(input: UnitInput): Promise<Unit>; updateUnit(id: string, input: UnitInput): Promise<Unit>; deleteUnit(id: string): Promise<void>; createLease(input: LeaseInput): Promise<Lease>; updateLease(id: string, input: LeaseInput): Promise<Lease>; cancelLease(id: string, reason: string): Promise<Lease>; saveInspection(input: InspectionInput, id?: string): Promise<Inspection> }`
  - `dates.ts`: `todayISO(): string` (วันที่เครื่อง เวลาท้องถิ่น); `isValidDate(iso: string): boolean` (รูป `YYYY-MM-DD` และมีอยู่จริง); `addDays(iso: string, n: number): string`; `daysBetween(from: string, to: string): number` (to − from เป็นวัน)
  - `rules.ts`: `unitStatus(unit, leases, today): 'closed' | 'rented' | 'ownerOccupied' | 'vacant'`; `leaseStatus(lease, today): 'cancelled' | 'ended' | 'upcoming' | 'active'`; `isExpiringSoon(lease, today): boolean`; `isLeaseEditable(lease, today): boolean`; `unitHasLeases(unitId, leases): boolean`; `damagedCount(inspection): number` (จำนวนหมวดที่ไม่ใช่ ok); `validateUnit(input: UnitInput, units: Unit[], leases: Lease[], selfId?: string): FieldErrors`; `validateLease(input: LeaseInput, ctx: { units: Unit[]; leases: Lease[]; selfId?: string }): FieldErrors`; `validateInspection(input: InspectionInput, ctx: { leases: Lease[]; inspections: Inspection[]; selfId?: string }): FieldErrors`; `summarize(data: PropertyData, today: string): { totalUnits; vacantUnits; expiringLeases; awaitingMoveIn }` (awaitingMoveIn = สัญญา upcoming/active ที่ยังไม่มี moveIn); `type FieldErrors = Record<string, string>` (ช่อง → คีย์ i18n; `{}` = ถูกต้อง)
  - คีย์ข้อผิดพลาดที่ใช้: `property.errors.code`, `.codeTaken`, `.floor`, `.area`, `.owner`, `.rent`, `.codeLocked`, `.tenantName`, `.tenantPhone`, `.dates`, `.leaseOverlap`, `.deposit`, `.unitRequired`, `.unitNotRentable`, `.inspectionDate`, `.inspector`, `.itemNote`, `.meter`, `.inspectionExists`, `.leaseRequired`; ช่อง `items` ของหมวดที่ขาดหมายเหตุใช้คีย์ช่อง `item:<key>`

- [ ] **Step 1: เขียนเทสก่อน (fail):**
  - `dates.test.ts`: `isValidDate` ผ่าน `2026-02-28`, `2028-02-29`; ไม่ผ่าน `2026-02-30`, `2026-13-01`, `2026-1-1`, `''`; `addDays('2026-12-31', 1) === '2027-01-01'`, `addDays('2028-02-28', 1) === '2028-02-29'`, ลบวันข้ามเดือนได้; `daysBetween('2026-11-08', '2027-01-07') === 60`
  - `rules.test.ts`: `unitStatus` ครบทั้ง 4 (closed ชนะทุกอย่าง, active lease → rented, ownerOccupied ไม่มีสัญญา, forRent ไม่มีสัญญา → vacant, สัญญาที่ยกเลิก/หมดอายุไม่นับว่า rented); `leaseStatus` ลำดับ cancelled > ended > upcoming > active และขอบ: `endDate = today` ยัง active, `endDate = today − 1` ended, `startDate = today` active, `startDate = today + 1` upcoming; `isExpiringSoon` true ที่ `endDate = today + 60` และ `today`, false ที่ `today + 61`, false เมื่อ cancelled/ended/upcoming; `validateUnit` ทุกฟิลด์ผิด (code ผิดรูป, floor 0/100/1.5, area 0/1000/ติดลบ, owner ว่าง, rent ติดลบ/ทศนิยม), code ซ้ำ (ไม่สนตัวพิมพ์เล็ก-ใหญ่และเว้นวรรคหัวท้ายหลัง trim) แต่แก้ตัวเองด้วย `selfId` ไม่ซ้ำ, ห้องที่มีสัญญาเปลี่ยน code/ownership ไม่ได้ (`codeLocked`) แต่เปลี่ยนเจ้าของ/ค่าเช่า/ปิดปรับปรุงได้; `validateLease` ครบเกณฑ์ใน Global Constraints, วันที่ `2026-02-30` ผิด, สิ้นสุดก่อนเริ่ม และเท่ากันผิด, ห้องไม่มี/ปิดปรับปรุง/`ownerOccupied` → `unitNotRentable`, ซ้อนช่วง: ซ้อนบางส่วน, ครอบทั้งช่วง, อยู่ข้างใน, **สิ้นสุด = เริ่มของอีกสัญญา → ซ้อน**, ห่างกัน 1 วัน → ไม่ซ้อน, สัญญาที่ยกเลิกแล้วไม่นับ, แก้ตัวเองด้วย `selfId` ไม่ชนตัวเอง; `validateInspection` วันตรวจเข้าก่อนเริ่มสัญญา, ตรวจออกก่อนตรวจเข้า, moveIn/moveOut ซ้ำในสัญญาเดียวกัน (แก้ตัวเองได้), หมวดที่ไม่ใช่ ok ไม่มีหมายเหตุ, ผู้ตรวจว่าง, มิเตอร์ติดลบ/ไม่ใช่ตัวเลข, ไม่ระบุสัญญา; `damagedCount`; `summarize` นับถูกต้องกับชุดข้อมูลเล็กๆ และใช้ `today` ที่ส่งเข้ามา
- [ ] **Step 2: รัน** `npm test -- src/property` — Expected: FAIL (ไฟล์ยังไม่มี)
- [ ] **Step 3: Implement** `types.ts`, `dates.ts` (คำนวณวันด้วย UTC ไม่ใช้เวลาท้องถิ่น), `rules.ts` ตาม Interfaces และ Global Constraints
- [ ] **Step 4: เพิ่มคีย์ `property.errors.*` ที่ใช้ใน th.json/en.json** (ข้อความสั้น ชัด เช่น th: รหัสห้องต้องเป็นรูปแบบ A-1204 / รหัสห้องนี้ถูกใช้แล้ว / ช่วงสัญญาซ้อนกับสัญญาอื่นของห้องนี้ ฯลฯ)
- [ ] **Step 5: รัน** `npm test` และ `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 6: Commit** `feat(property): types, date helpers and business rules`

### Task 2: ข้อมูลตัวอย่างและ `localPropertyApi`

**Files:**
- Create: `src/property/seed.ts`, `src/property/localPropertyApi.ts`
- Test: `src/property/seed.test.ts`, `src/property/localPropertyApi.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `seed.ts`: `makeSeed(today: string): PropertyData` — ห้อง 24 (Tower A, B หลายชั้น/ประเภท; มีทั้ง forRent, ownerOccupied และ 1 ห้อง closed), สัญญา 9 (อย่างน้อย: ใช้งานปกติ, ใกล้หมด ≤ 60 วัน, หมดอายุแล้ว, ยกเลิกแล้ว, ยังไม่เริ่ม), บันทึกตรวจ 6 (มีทั้ง moveIn และ moveOut, บางรายการมีหมวดที่ไม่ปกติ) วันที่ทั้งหมดคำนวณจาก `today` ด้วย `addDays`; id คงที่ (`u-1`, `l-1`, `i-1`…); ผ่าน validator ของ Task 1 ทั้งหมด; ชื่อ/เบอร์เป็นข้อมูลสมมติ
  - `localPropertyApi.ts`: `PROPERTY_KEY = 'condo:property'`; `createLocalPropertyApi(opts?: { storage?: Storage | null; today?: () => string }): PropertyApi` (ค่าเริ่มต้น `localStorage`, `todayISO`); `export const localPropertyApi`; ทุกเมธอดตรวจด้วย `rules.ts` แล้วโยน `PropertyError('invalid_input', fieldErrors)` เมื่อมีข้อผิดพลาด; `deleteUnit` มีสัญญา → `PropertyError('unit_has_leases')`; `updateLease`/`cancelLease` ที่แก้ไม่ได้ → `PropertyError('lease_locked')` (ยกเลิกซ้ำก็เช่นกัน); id ไม่พบ → `PropertyError('not_found')`; `cancelLease` เก็บ `cancelledAt` = วันนี้ และ `cancelReason`; `load()` คืนสำเนา (แก้ผลลัพธ์แล้วไม่กระทบข้อมูลในอินสแตนซ์); code ห้องถูก trim และเก็บเป็นตัวพิมพ์ใหญ่

- [ ] **Step 1: เขียนเทสก่อน (fail):**
  - `seed.test.ts`: ใช้ `today` สองค่า (`2026-11-08`, `2031-02-14`) → ทุกห้อง/สัญญา/บันทึกตรวจผ่าน validator, จำนวน 24/9/6, ครบประเภทสถานะสัญญาที่ระบุ และครบสถานะห้อง closed/rented/ownerOccupied/vacant, `summarize` ให้ expiringLeases ≥ 1 และ awaitingMoveIn ≥ 1 ทั้งสองค่า `today`, ไม่มีวันที่ซ้ำกับค่าตายตัว (ผลต่างตาม `today`)
  - `localPropertyApi.test.ts` (storage in-memory + `today` คงที่): seed เมื่อว่าง; CRUD ห้อง (`createUnit` → ปรากฏใน `load`, `updateUnit`, `deleteUnit`); code ซ้ำ → `invalid_input` พร้อม `fieldErrors.code = 'property.errors.codeTaken'`; ลบห้องที่มีสัญญา → `unit_has_leases`; สร้างสัญญาบนห้อง ownerOccupied/closed → `fieldErrors.unitId`; ซ้อนช่วง/ชิดกัน → `fieldErrors.startDate`; แก้สัญญาไม่ชนตัวเอง; แก้สัญญาที่ยกเลิก/หมดอายุ → `lease_locked`; `cancelLease` เก็บวันที่/เหตุผลและยกเลิกซ้ำ → `lease_locked`; ตรวจเข้า/ออกซ้ำ → `fieldErrors.type`; `saveInspection` ที่มี id แก้ของเดิม; id ไม่มี → `not_found`; ข้อมูลอยู่ข้ามอินสแตนซ์บน storage เดิม; **ข้อมูลเสียหลายแบบ seed ใหม่ได้ทุกแบบ**: `'not json'`, `'{}'`, `'null'`, `{"version":2,...}`, เป็น JSON ที่ units ไม่ใช่อาร์เรย์, unit ขาดฟิลด์/ชนิดผิด, **สัญญาชี้ `unitId` ที่ไม่มี**, **บันทึกตรวจชี้ `leaseId` ที่ไม่มี**, **รหัสห้องซ้ำในข้อมูลที่เก็บ**; storage อ่านไม่ได้/เขียนไม่ได้/ไม่มี storage ยังทำงานในหน่วยความจำ; ความล้มเหลวชั่วคราว (เช่น `today` throw ครั้งแรก) ไม่ถูกแคช; ผลของ `load()` ถูกแก้แล้วไม่กระทบข้อมูลภายใน
- [ ] **Step 2: รัน** `npm test -- src/property` — Expected: FAIL
- [ ] **Step 3: Implement** `seed.ts` และ `localPropertyApi.ts` (ตรวจรูปร่างและความสัมพันธ์ของข้อมูลที่อ่านมาด้วยฟังก์ชันเดียว; สร้าง id ใหม่ด้วย `crypto.randomUUID()` มี fallback เหมือน `localAuthApi`)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(property): seed data and local property api`

### Task 3: `PropertyProvider` และ `useProperty`

**Files:**
- Create: `src/property/PropertyContext.ts`, `src/property/PropertyProvider.tsx`, `src/property/useProperty.ts`, `src/test/renderProperty.tsx`
- Test: `src/property/PropertyProvider.test.tsx`

**Interfaces:**
- Consumes: Task 1–2
- Produces:
  - `PropertyProvider` (named export) props `{ api?: PropertyApi; today?: () => string; children: ReactNode }` (ค่าเริ่มต้น `localPropertyApi`, `todayISO`)
  - `useProperty(): { status: 'loading' | 'ready' | 'error'; data: PropertyData; today: string; summary: ReturnType<typeof summarize>; createUnit; updateUnit; deleteUnit; createLease; updateLease; cancelLease; saveInspection; reload(): Promise<void> }` — เมธอดตัวแก้ไขเรียก api แล้วโหลดข้อมูลใหม่เข้า state ก่อนคืนค่า; ข้อผิดพลาดจาก api ถูกโยนต่อ ไม่กลืน; `today` ถูกอ่านใหม่ทุกครั้งที่โหลด; ใช้นอก provider → throw ข้อความชัดเจน; `load()` ล้มเหลว → `status = 'error'` (ไม่ค้าง loading)
  - `src/test/renderProperty.tsx`: `makeTestApi(opts?: { today?: string })` (ตัวจำลองบน storage in-memory พร้อมข้อมูลตัวอย่างและวันนี้คงที่ `2026-11-08`) และ `renderProperty(ui: ReactElement, opts?: { api?: PropertyApi; today?: string; route?: string; as?: Role })` ห่อด้วย `AuthProvider` (ล็อกอินเป็น role ที่ระบุ ค่าเริ่มต้น juristic), `PropertyProvider`, `MemoryRouter`; คืนหลังข้อมูลโหลดเสร็จ

- [ ] **Step 1: เขียนเทสก่อน (fail):** loading → ready พร้อมข้อมูลและ `summary`; สร้างห้องแล้ว `data.units` เพิ่มและ `summary.totalUnits` เปลี่ยน; ข้อผิดพลาด `PropertyError` ถูกโยนต่อและ state ไม่เปลี่ยน; `load()` reject → `status = 'error'`; ใช้นอก provider throw; ไม่มี setState หลัง unmount (ไม่มีคำเตือน)
- [ ] **Step 2: รัน** `npm test -- src/property/PropertyProvider.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement** ทั้งสี่ไฟล์ (แยก context/hook ออกจากไฟล์คอมโพเนนต์เพื่อไม่ให้ lint เตือน)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(property): property provider and hook`

### Task 4: โครงหน้า, แท็บ, ตัวช่วยจัดรูปแบบ และ route

**Files:**
- Create: `src/lib/format.ts`, `src/features/units/UnitsPage.tsx`, `src/features/units/UnitsTab.tsx`, `LeasesTab.tsx`, `InspectionsTab.tsx` (ช่วงนี้เป็นตัวแทนที่แสดงชื่อแท็บ), `src/components/ConfirmDialog.tsx`, `src/components/Pager.tsx`
- Modify: `src/app/router.tsx`
- Test: `src/lib/format.test.ts`, `src/features/units/UnitsPage.test.tsx`, `src/components/ConfirmDialog.test.tsx`, `src/components/Pager.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`useProperty`, `PropertyProvider`, `renderProperty`), `KpiCard`, `Modal`, `Button`, `renderApp`
- Produces:
  - `format.ts`: `formatBaht(n: number): string` (`฿1,234`, ศูนย์และติดลบถูกต้อง); `formatDate(iso: string, lang: 'th' | 'en'): string` (พ.ศ./ค.ศ., UTC, วันที่ผิดรูปคืนสตริงเดิม ไม่ throw)
  - `UnitsPage`: ห่อ `PropertyProvider` (props ค่าเริ่มต้น), แสดง `h1` `nav.units`, การ์ดสรุป 4 ใบ (`property.summary.*`: ห้องทั้งหมด, ห้องว่าง, สัญญาใกล้หมดอายุ, รอตรวจเข้า), แถบแท็บ 3 ลิงก์ (ห้องชุด `/juristic/units`, สัญญาเช่า `/juristic/units/leases`, ตรวจสภาพ `/juristic/units/inspections`) ที่ `aria-current="page"` ตรงแท็บปัจจุบัน และ `<Outlet />`; สถานะ loading/error มีข้อความ `role="status"`/`role="alert"`
  - `router.tsx`: `/juristic/units` เป็น route แม่ที่ใช้ `UnitsPage` มี index = `UnitsTab`, `leases` = `LeasesTab`, `inspections` = `InspectionsTab` และเอา `/juristic/units` ออกจากลูป `PlaceholderPage`
  - `ConfirmDialog` (default export): props `{ open; title; message?; confirmLabel; cancelLabel?; danger?; pending?; onConfirm(): void; onCancel(): void; children?: ReactNode }` ใช้ `Modal`; ปุ่มยืนยัน disabled เมื่อ `pending`
  - `Pager` (default export): props `{ page: number; pageCount: number; onChange(page: number): void }`; ปุ่มก่อนหน้า/ถัดไป disabled ที่ขอบ แสดง "หน้า X จาก Y" (i18n); `pageCount ≤ 1` ไม่ render

- [ ] **Step 1: เขียนเทสก่อน (fail):** `format.test.ts` (฿ ปกติ/0/ติดลบ/ล้าน, `2026-11-08` → `8 พ.ย. 2569` และ `Nov 8, 2026`, ผิดรูปไม่ throw); `Pager`; `ConfirmDialog` (ยืนยัน/ยกเลิก/Escape/pending); `UnitsPage` ผ่าน `renderApp('/juristic/units', { as: 'juristic' })`: เห็นการ์ด 4 ใบและตัวเลขของข้อมูลตัวอย่าง, 3 แท็บ, `aria-current` ตามแท็บ, กดแท็บแล้วเปลี่ยน URL/เนื้อหา, เมนูข้าง "ห้องชุดและสัญญาเช่า" ยัง active ทั้งสามเส้นทาง, **ผู้เช่าเปิด `/juristic/units` ถูกพากลับ `/tenant/overview` และไม่เห็นหน้านี้**, สลับ EN แล้วหัวข้อและแท็บเป็นอังกฤษ
- [ ] **Step 2: รัน** `npm test` — Expected: FAIL (เทสใหม่)
- [ ] **Step 3: Implement** ตาม Interfaces; เพิ่มคีย์ `property.*` ที่ใช้ (หัวข้อ, ป้ายการ์ด, ป้ายแท็บ, `property.pager.*`, `property.loading`, `property.loadFailed`, ปุ่มยืนยัน/ยกเลิกทั่วไป)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(property): units page shell, tabs and shared dialogs`

### Task 5: แท็บห้องชุด (รายการ, ค้นหา/กรอง, ฟอร์ม, ลบ)

**Files:**
- Create: `src/features/units/UnitFormModal.tsx`
- Modify: `src/features/units/UnitsTab.tsx`
- Test: `src/features/units/UnitsTab.test.tsx`

**Interfaces:**
- Consumes: Task 3–4, `DataTable`, `StatusBadge`, `FormField`, `ConfirmDialog`, `Pager`, `formatBaht`, `unitStatus`
- Produces: `UnitsTab` แสดงตาราง (รหัส, อาคาร/ชั้น, ประเภท/ขนาด, เจ้าของ, สถานะ, ค่าเช่า ชิดขวา, ปุ่มแก้ไข/ลบ) แบ่งหน้า 10 แถว เรียงตามรหัสห้อง; ค้นหา (รหัสห้อง/ชื่อเจ้าของ ไม่สนตัวพิมพ์และเว้นวรรคหัวท้าย), กรองอาคารและสถานะ (เปลี่ยนตัวกรอง/คำค้นแล้วกลับหน้า 1); ป้ายสถานะ: rented→settled, vacant→pending, ownerOccupied→inactive, closed→critical พร้อมข้อความ; `UnitFormModal` (เพิ่ม/แก้ไข) ฟิลด์ตามชนิด `UnitInput` (รหัสห้อง, ชั้น, ขนาด, ประเภท, เจ้าของ, การใช้งาน, ค่าเช่าตั้งต้น, ปิดปรับปรุง); ห้องที่มีสัญญา: ช่องรหัสห้องและการใช้งานถูก `disabled` พร้อมคำอธิบาย; ลบผ่าน `ConfirmDialog`; `unit_has_leases` แสดง `role="alert"` ในกล่องยืนยัน ไม่ปิดกล่อง

- [ ] **Step 1: เขียนเทสก่อน (fail)** ด้วย `renderProperty` + `makeTestApi`: แสดง 10 แถวแรกกับ pager 3 หน้า, ไปหน้า 2/3, ค้นหา `a-12` (ตัวพิมพ์ต่าง) ได้ห้องที่ตรงและกลับหน้า 1, กรองอาคาร/สถานะ, ผลว่างแสดง "ไม่มีข้อมูล", เพิ่มห้องสำเร็จแล้วปรากฏในตารางและการ์ดสรุปอัปเดต, ฟอร์มว่าง/ผิดทุกช่องแสดงข้อผิดพลาดใต้ช่องและโฟกัสช่องแรกที่ผิด และไม่เรียก api, code ซ้ำแสดงใต้ช่อง code, กดส่งซ้ำขณะรอเรียก api ครั้งเดียว (ใช้ api ที่ resolve ช้า) และปุ่ม disabled, แก้ไขห้อง (ค่าเดิมถูกเติม), ห้องที่มีสัญญา: ช่องรหัสห้อง disabled, ลบห้องที่ไม่มีสัญญาสำเร็จหลังยืนยัน และยกเลิกการลบไม่ลบ, ลบห้องที่มีสัญญาแสดงข้อความไม่ลบ, ป้ายสถานะทุกแบบมีข้อความ, ภาษาอังกฤษ, ค่าเช่าอยู่ในคอลัมน์ชิดขวา `tabular-nums`, ตารางอยู่ในกรอบที่เลื่อนข้างได้ (`overflow-x-auto`)
- [ ] **Step 2: รัน** `npm test -- src/features/units/UnitsTab.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement** `UnitsTab.tsx` และ `UnitFormModal.tsx` ตาม Interfaces; เพิ่มคีย์ `property.units.*`, `property.fields.*` (ใช้ร่วมกับแท็บอื่น), `property.unitStatus.*`, `property.unitType.*`, `property.ownership.*` ทั้งสองภาษา
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(property): units tab with search, filters and unit form`

### Task 6: แท็บสัญญาเช่า (รายการ, ฟอร์ม, ยกเลิก)

**Files:**
- Create: `src/features/units/LeaseFormModal.tsx`
- Modify: `src/features/units/LeasesTab.tsx`
- Test: `src/features/units/LeasesTab.test.tsx`

**Interfaces:**
- Consumes: Task 3–5 (`leaseStatus`, `isExpiringSoon`, `isLeaseEditable`, `formatDate`, `formatBaht`, `ConfirmDialog`)
- Produces: `LeasesTab` ตาราง (ห้อง, ผู้เช่า/เบอร์, ช่วงสัญญา, ค่าเช่า ชิดขวา, สถานะ + ป้าย "ใกล้หมดอายุ" เมื่อเข้าเกณฑ์, ปุ่ม แก้ไข / ยกเลิก / บันทึกตรวจ) กรองสถานะ (ทั้งหมด/ใช้งาน/ยังไม่เริ่ม/หมดอายุ/ยกเลิก); ป้ายสถานะ: active→settled, upcoming→pending, ended→inactive, cancelled→critical; ปุ่มแก้ไข/ยกเลิก disabled เมื่อสัญญาแก้ไม่ได้ (มี `title` อธิบาย); `LeaseFormModal` (สร้าง/แก้ไข: เลือกห้อง — แสดงเฉพาะห้อง forRent ไม่ปิดปรับปรุง, ผู้เช่า, เบอร์, วันเริ่ม/สิ้นสุด `type="date"`, ค่าเช่า (เติมค่าเช่าตั้งต้นของห้องเมื่อเลือกห้อง), มัดจำ); ยกเลิกผ่าน `ConfirmDialog` พร้อมช่องเหตุผล (ไม่บังคับ); ปุ่ม "บันทึกตรวจ" นำทางไป `/juristic/units/inspections?lease=<id>&type=<moveIn|moveOut>` (type = moveIn ถ้ายังไม่มีตรวจเข้า ไม่งั้น moveOut; disabled เมื่อตรวจครบสองครั้ง)

- [ ] **Step 1: เขียนเทสก่อน (fail):** แสดงสัญญาตัวอย่างครบทุกสถานะพร้อมป้ายและข้อความ, ป้าย "ใกล้หมดอายุ" เฉพาะที่เข้าเกณฑ์, กรองสถานะ, สร้างสัญญาสำเร็จ (ห้องในตัวเลือกไม่มีห้อง ownerOccupied/closed), ฟอร์มผิดทุกช่องและโฟกัสช่องแรก, **ช่วงซ้อน/ชิดกันแสดงข้อผิดพลาดใต้ช่อง**, วันที่สิ้นสุดก่อนเริ่ม, แก้ไขสัญญา (ค่าเดิมถูกเติม, ไม่ชนตัวเอง), สัญญาที่ยกเลิก/หมดอายุปุ่มแก้ไขและยกเลิก disabled, ยกเลิกสัญญาผ่านการยืนยันพร้อมเหตุผลแล้วสถานะเปลี่ยนเป็น "ยกเลิก", ยกเลิกซ้ำไม่ได้, กดส่งซ้ำเรียก api ครั้งเดียว, ปุ่มบันทึกตรวจนำทางถูก URL และ type, สลับภาษาแล้ววันที่เป็น ค.ศ., ตารางเลื่อนข้างในกรอบ
- [ ] **Step 2: รัน** `npm test -- src/features/units/LeasesTab.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; เพิ่มคีย์ `property.leases.*`, `property.leaseStatus.*` ทั้งสองภาษา
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(property): leases tab with lease form and cancellation`

### Task 7: แท็บตรวจสภาพ (รายการ, ฟอร์มตรวจเข้า/ออก)

**Files:**
- Create: `src/features/units/InspectionFormModal.tsx`
- Modify: `src/features/units/InspectionsTab.tsx`
- Test: `src/features/units/InspectionsTab.test.tsx`

**Interfaces:**
- Consumes: Task 3–6 (`validateInspection`, `damagedCount`, `useAuth().user.fullName` เป็นค่าตั้งต้นของผู้ตรวจ), `useSearchParams`
- Produces: `InspectionsTab` ตาราง (ห้อง, ผู้เช่า, ประเภทตรวจ, วันที่, ผู้ตรวจ, จำนวนจุดที่ไม่ปกติ พร้อมป้าย) กรองประเภท; คลิกแถว/ปุ่ม "ดู/แก้ไข" เปิดฟอร์มค่าเดิม; ปุ่ม "บันทึกการตรวจ" เปิดฟอร์มใหม่ (เลือกสัญญาและประเภทเฉพาะที่ยังไม่เคยตรวจ; ไม่มีสัญญาที่ตรวจได้ → ปุ่ม disabled พร้อมคำอธิบาย); อ่านพารามิเตอร์ `?lease=&type=` แล้วเปิดฟอร์มเติมค่าให้ (พารามิเตอร์ที่ไม่ถูกต้อง/สัญญาไม่มี/ประเภทที่ตรวจแล้วถูกเพิกเฉยโดยไม่พัง) และล้างพารามิเตอร์หลังปิดฟอร์ม; `InspectionFormModal`: วันที่ (ค่าตั้งต้น = วันนี้), ผู้ตรวจ, 8 หมวดแต่ละหมวดเลือก ok/damaged/missing + หมายเหตุ (ช่องหมายเหตุบังคับเมื่อไม่ใช่ ok), มิเตอร์น้ำ/ไฟ (ไม่บังคับ), หมายเหตุรวม; เนื้อหาเลื่อนได้เมื่อจอเตี้ย

- [ ] **Step 1: เขียนเทสก่อน (fail):** แสดงบันทึกตัวอย่างพร้อมจำนวนจุดที่ไม่ปกติ, กรองประเภท, สร้างตรวจเข้าสำเร็จ (ผู้ตรวจตั้งต้นเป็นชื่อผู้ใช้), หมวดที่ไม่ใช่ ok ไม่มีหมายเหตุ → ข้อผิดพลาดใต้ช่องและโฟกัสช่องนั้น, ตรวจเข้าก่อนวันเริ่มสัญญา, ตรวจออกก่อนตรวจเข้า, ตรวจซ้ำถูกกันไว้ (ตัวเลือกไม่มีสัญญา/ประเภทที่ตรวจแล้ว), มิเตอร์ติดลบ, แก้ไขบันทึกเดิมแล้วค่าเปลี่ยน (ไม่เกิดบันทึกซ้ำ), ไม่มีปุ่มลบ, ตรวจออกกับสัญญาที่ยกเลิกแล้วได้, เปิดด้วย `?lease=<id>&type=moveIn` เติมค่าให้, พารามิเตอร์ผิด/ไม่มีสัญญาไม่พัง, กดส่งซ้ำเรียก api ครั้งเดียว, สลับภาษา, ตารางเลื่อนข้างในกรอบ
- [ ] **Step 2: รัน** `npm test -- src/features/units/InspectionsTab.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; เพิ่มคีย์ `property.inspections.*`, `property.checkItems.*`, `property.condition.*`, `property.inspectionType.*` ทั้งสองภาษา
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(property): inspections tab with move-in and move-out form`

### Task 8: ตรวจรับรวมและเอกสาร

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า

- [ ] **Step 1: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด, lint 0 warning, ไม่มี CDN เหลือ (`grep -rlE "cdn.tailwindcss.com|fonts.googleapis.com" dist index.html src`)
- [ ] **Step 2: ตรวจแบบ end-to-end ในเบราว์เซอร์จริง** (`npm run dev` + Playwright ที่ติดตั้งในโฟลเดอร์ชั่วคราวนอกโปรเจกต์ ใช้ Chrome ในเครื่อง; ที่ 1280, 900, 390 และ 320px): ล็อกอิน `staff01`; เห็นการ์ดและตารางตัวอย่าง; เพิ่ม/แก้/ลบห้อง; ลบห้องที่มีสัญญาถูกปฏิเสธ; สร้างสัญญาที่ซ้อนช่วงถูกปฏิเสธ แล้วสร้างช่วงที่ถูกต้องสำเร็จ; ยกเลิกสัญญา; ตรวจเข้าและตรวจออก; รีเฟรชแล้วข้อมูลยังอยู่; ลบ `condo:property` ใน localStorage แล้วรีเฟรชได้ข้อมูลตัวอย่างใหม่; ผู้เช่า (`tenant01`) เข้า `/juristic/units` ถูกพากลับ; สลับ TH/EN; หน้าไม่เลื่อนข้างที่ 390/320px (ตารางเลื่อนข้างในกรอบของตัวเอง) และ Modal เปิด/ปิดได้ที่จอเตี้ย (ความสูง 480px) ถ่ายภาพหน้าจอและดูจริง รายงานตามจริง ถ้าตรวจข้อใดไม่ได้ให้บอก
- [ ] **Step 3: อัปเดต `README.md`:** หัวข้อ "ห้องชุด/สัญญา/ตรวจสภาพ" (ที่ไฟล์: `src/property/`, `src/features/units/`; กฎสถานะที่คำนวณ; ข้อมูลตัวอย่างอยู่ใน `seed.ts`; วิธีเปลี่ยนเป็นหลังบ้านจริงโดยเขียน `PropertyApi` ตัวใหม่แล้วส่งให้ `PropertyProvider api`), ปรับสถานะโปรเจกต์ให้ตรง
- [ ] **Step 4: Commit** `docs: units readme and final verification`
