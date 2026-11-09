# Maintenance Requests & Technician Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้เช่าแจ้งซ่อมพร้อมรูป นิติบุคคลมอบหมายช่าง ช่างอัปเดตสถานะ ผู้เช่าติดตามสถานะ พร้อมกระดิ่งแจ้งเตือนรวมทุกบทบาท — FR18–21 ด้วยข้อมูลจำลองใน localStorage

**Architecture:** เหมือนระบบบิล: กฎล้วน (`src/maintenance/rules.ts`) → `createLocalMaintenanceApi` (คีย์เดียว `condo:maintenance` อ่านใหม่ทุกครั้ง อ้าง `condo:property` ผ่าน `PropertyApi`) หลัง interface `MaintenanceApi` → `MaintenanceProvider`/`useMaintenance` (ห่อใน `AppShell`) → หน้าจอ 3 บทบาท การย่อรูปเป็นฟังก์ชันฉีดได้ (`photos.ts`) กระดิ่งรวมผ่าน hook `useNotifications()` ที่รวมแจ้งเตือนบิลกับงานซ่อม

**Tech Stack:** เดิม (React 19, Vite, TS, Tailwind v4, react-router, react-i18next, Vitest + RTL + user-event) ไม่เพิ่มแพ็กเกจ

**Spec:** `docs/superpowers/specs/2026-11-09-maintenance-design.md`
**Requirement:** PDF ITDS262 FR18–21

## Global Constraints

- ไม่มีหลังบ้าน ไม่เพิ่มแพ็กเกจ ห้ามเรียกเครือข่าย; หน้าผู้เช่า `/tenant/maintenance`, นิติบุคคล `/juristic/maintenance`, ช่าง `/technician/jobs` เข้าได้เฉพาะ role ของตน (guard prefix เดิม); เส้นทางทั้งสามเลิกเป็น placeholder
- localStorage คีย์ `condo:maintenance` = `{ version: 1, technicians, requests, notifications }`; ข้อมูลว่าง/เสีย/รูปผิด/ผิดกฎ → seed ใหม่ไม่ throw; **อ้างห้องบางส่วนหายต้องไม่ล้าง** ล้างเฉพาะเมื่อไม่มีห้องที่อ้างอยู่เลยสักห้อง (บทเรียนจากบิล); storage อ่านไม่ได้ทำงานในหน่วยความจำได้ แต่ **เขียนสร้างรายการไม่สำเร็จต้อง throw `storage_failed` และไม่สร้างรายการ**; ความล้มเหลวไม่ถูกจำ; ไม่มี `await` ระหว่างอ่านใหม่กับเขียน
- "วันนี้" ฉีดได้ (`today: () => string`), วันที่ `YYYY-MM-DD` UTC (`src/property/dates.ts`); เวลาเหตุการณ์ในประวัติเก็บเป็น `YYYY-MM-DD`
- รายการ: `code` = `MR-` + เลขสี่หลัก = (เลขมากสุดที่มี + 1) ไม่ซ้ำ; `category` ∈ `electrical | plumbing | airConditioning | furniture | other`; `title` 1–80 ตัวอักษรหลัง trim; `description` 1–1000; รูป 1–3 รูป ชนิด `.jpg/.jpeg/.png/.webp` ต้นฉบับ ≤ 10 MB (10 × 1024 × 1024 ไบต์ พอดีผ่าน) เก็บ `{ name, dataUrl }` (JPEG ด้านยาวสุด 300px คุณภาพ 0.7); ข้อความผิดพลาดรูป "กรุณาแนบรูปภาพประกอบอย่างน้อย 1 รูป (ไม่เกิน 3 รูป)" ; ข้อมูลไม่ครบ "กรุณากรอกข้อมูลและแนบรูปภาพประกอบให้ครบถ้วน"
- ห้องของผู้เช่า = สัญญาที่ใช้งานอยู่วันนี้ของเบอร์โทรบัญชี (ไม่ยกเลิก, `startDate ≤ วันนี้ ≤ endDate`); ไม่มี → `no_lease`; รายการเก็บ snapshot `unitId`, `unitCode`, `leaseId`, `tenantName`, `tenantPhone`
- สถานะเก็บ ไม่คำนวณ: `waiting` → `assigned` → `inProgress` → `done` ไปหน้าเดียว ไม่ข้าม ไม่ย้อน; `history[0]` = `waiting` ตอนสร้าง; ทุกการเปลี่ยนต่อท้ายประวัติ `{ status, at, note, byName }`; มอบหมายได้เมื่อ `waiting` และเปลี่ยนช่างได้เมื่อ `assigned` (มอบหมายซ้ำช่างคนเดิมไม่ทำอะไรและไม่แจ้งเตือนซ้ำ); `inProgress`/`done` เปลี่ยนช่างไม่ได้; ช่างอัปเดตได้เฉพาะงานที่ `assigneeId` เป็นตน และเฉพาะขั้นถัดไป (`assigned → inProgress → done`) หมายเหตุไม่บังคับ ≤ 300 ตัวอักษร
- ช่าง: `Technician { id, name, phone }` 3 คน (`tech01` = `0800000002` ชื่อ "สมศักดิ์ ช่างซ่อม" + ตัวอย่างอีก 2 คนเบอร์ต่างกัน); `DEMO_TECH_PHONE = '0800000002'` ใน `demoAccounts.ts` ส่วน `staff01` คง `0800000000`; ผู้ใช้ช่างจับคู่ด้วยเบอร์โทร ไม่เจอ → ไม่เห็นงานใด
- แจ้งเตือน: `recipient` = เบอร์โทร หรือ `role:juristic`; ชนิด `requestCreated` (→ `role:juristic`), `assigned` (→ เบอร์ช่าง), `statusChanged` (→ เบอร์ผู้เช่า; เกิดตอนมอบหมายและทุกครั้งที่ช่างเปลี่ยนสถานะ); ปลายทางเมื่อกด = `/<role>/maintenance?request=<id>` (ช่าง `/technician/jobs?request=<id>`); `?request=` ที่ไม่ใช่ของผู้ใช้/ไม่มี → เพิกเฉยและล้างพารามิเตอร์
- กระดิ่งรวม: ผู้เช่าเห็นแจ้งเตือนบิล (เบอร์ตรง) + งานซ่อมของเบอร์ตน; นิติบุคคลเห็น `role:juristic`; ช่างเห็นของเบอร์ตน; เรียงใหม่ไปเก่า; ตัวเลขยังไม่อ่านรวมทั้งสองที่มา `99+` เมื่อเกิน; "อ่านทั้งหมด" ทำเครื่องหมายทั้งสองที่มาเฉพาะของผู้ใช้
- ข้อความ UI ทั้งหมดผ่าน i18n ครบ th และ en (เทสเทียบคีย์); วันที่ พ.ศ./ค.ศ. ตามภาษา; รูปมี `alt`; ป้ายสถานะมีข้อความเสมอ; ฟอร์มใน `Modal` + `FormField`; กันกดซ้ำ; ผิดแล้วโฟกัสช่องแรกที่ผิด; ตารางเลื่อนข้างในกรอบที่ **เป็น `relative`**; Modal เลื่อนได้บนจอเตี้ย; ไม่ล้นจอที่ 320px
- ข้อจำกัดเดิม: ไม่มี CDN, tokens จาก `@theme`, lint ต้องสะอาด, ผู้ที่ใช้ `useBilling` ต้องยังทำงานเหมือนเดิม

## Review Focus

- ย่อรูปไม่ได้/ไฟล์ผิดชนิด/เกิน 10 MB/เกิน 3 รูป/ไม่แนบรูป: ต้องบอกชัดและบันทึกไม่ได้ ไม่มีรายการครึ่ง ๆ กลาง ๆ (Task 2, 4)
- พื้นที่เก็บเต็มตอนสร้างรายการ: ผู้ใช้ต้องเห็นข้อความและไม่เสียข้อมูลเดิม; ข้อมูล `condo:maintenance` ใหญ่/เสียแล้วแอปยังเปิดได้ (Task 2)
- เปลี่ยนสถานะ: ข้ามขั้น/ย้อน/ช่างผิดคน/เปลี่ยนช่างหลังเริ่มงาน/สองแท็บทำพร้อมกัน ต้องไม่ได้สถานะเพี้ยนหรือแจ้งเตือนซ้ำ (Task 1, 2, 5, 6)
- การมองเห็น: ผู้เช่าเห็นรายการผู้เช่าอื่นผ่าน `?request=`/กระดิ่ง; ช่างเห็นงานที่ไม่ใช่ของตน; แจ้งเตือนถึงผู้รับผิดคน (Task 2, 4, 6, 7)
- แก้ข้อมูลห้อง/สัญญา (ย้ายสัญญา, ลบห้อง, seed ใหม่ของ `condo:property`) แล้วงานซ่อมต้องไม่ถูกล้างและไม่พัง; ผู้เช่าที่สัญญาหมดอายุแจ้งซ่อมไม่ได้ (Task 2)

---

### Task 1: ชนิดข้อมูลและกฎล้วน

**Files:**
- Create: `src/maintenance/types.ts`, `src/maintenance/rules.ts`
- Modify: `src/i18n/th.json`, `src/i18n/en.json` (กลุ่ม `maintenance.errors.*`, `maintenance.category.*`, `maintenance.status.*`)
- Test: `src/maintenance/rules.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Category`, `RequestStatus = 'waiting'|'assigned'|'inProgress'|'done'`, `Photo { name; dataUrl }`, `HistoryEntry { status; at; note; byName }`, `Technician { id; name; phone }`, `MaintenanceRequest` (ฟิลด์ตาม spec §4), `RequestInput { category; title; description; photos: Photo[] }`, `MaintenanceNotification { id; type: 'requestCreated'|'assigned'|'statusChanged'; requestId; recipient: string; createdAt; read; status?: RequestStatus }`, `MaintenanceData { version: 1; technicians; requests; notifications }`, `MaintenanceError(code, fieldErrors?)` codes `invalid_input|not_found|invalid_transition|not_assigned|no_lease|storage_failed`, `MaintenanceApi { load; createRequest(input: RequestInput): Promise<MaintenanceRequest>; assign(requestId, technicianId); updateStatus(requestId, status: RequestStatus, note: string); markRead(id); markAllRead(recipient) }` (ทุกเมธอดรู้ผู้เรียกจากพารามิเตอร์ที่ UI ส่ง: `createRequest` ใช้เบอร์ผู้เช่าที่ส่งมาใน `RequestInput.tenantPhone`; `updateStatus` ใช้ `actorPhone`; ระบุไว้ใน Task 2)
- Produces (`rules.ts`): `CATEGORIES`, `validateRequest(input): FieldErrors`, `validatePhotoFile(file: {name; type; size}): string | null`, `nextCode(requests): string`, `canAssign(request): boolean`, `nextStatus(status): RequestStatus | null`, `canTechnicianUpdate(request, technician): boolean`, `statusBadge(status): 'pending'|'settled'|'critical'|'inactive'`, `FieldErrors`

- [ ] **Step 1: เขียนเทสก่อน (fail)** `rules.test.ts`: `validateRequest` — หมวดหมู่ผิด, หัวข้อว่าง/มีแต่ช่องว่าง/ยาว 80 ผ่านและ 81 ไม่ผ่าน, รายละเอียด 1000 ผ่านและ 1001 ไม่ผ่าน, รูป 0 รูปผิด (`photos`), 1 และ 3 รูปผ่าน, 4 รูปผิด; `validatePhotoFile` — `.jpg/.jpeg/.png/.webp` ผ่านโดยชนิดต้องตรงนามสกุล, `.gif`/`.pdf`/ไม่มีนามสกุล/ชนิดไม่ตรงผิด, ขนาด 0 ผิด, 10 × 1024 × 1024 ผ่านและ +1 ผิด; `nextCode` — ว่าง → `MR-0001`, มี `MR-0009` และ `MR-0002` → `MR-0010`, รหัสแปลกปลอมถูกข้าม; `nextStatus` ครบสี่สถานะ (`done` → null); `canAssign` เฉพาะ `waiting`/`assigned`; `canTechnicianUpdate` — งานตนและมีขั้นถัดไปเท่านั้น (ไม่ใช่งานคนอื่น, ไม่ใช่ `waiting`, ไม่ใช่ `done`); `statusBadge` ครบ; คีย์ i18n ที่เกี่ยวข้องมีทั้งสองภาษาและแตกต่างกัน
- [ ] **Step 2: รัน** `npm test -- src/maintenance` — Expected: FAIL (ยังไม่มีไฟล์)
- [ ] **Step 3: Implement** ตาม Interfaces; ข้อความผิดพลาดตาม Global Constraints
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): types and pure rules`

### Task 2: ข้อมูลตัวอย่าง, api จำลอง, เบอร์ช่าง

**Files:**
- Create: `src/maintenance/seed.ts`, `src/maintenance/localMaintenanceApi.ts`
- Modify: `src/auth/demoAccounts.ts` (`DEMO_TECH_PHONE`, `tech01.phone`), `src/auth/localAuthApi.test.ts`
- Test: `src/maintenance/seed.test.ts`, `src/maintenance/localMaintenanceApi.test.ts`

**Interfaces:**
- Consumes: Task 1, `PropertyApi` (`load`), `createLocalPropertyApi`, `todayISO`, `MemoryStorage`
- Produces: `MAINTENANCE_KEY = 'condo:maintenance'`; `makeMaintenanceSeed(property: PropertyData, today: string): MaintenanceData` (ช่าง 3 คน; ~7 รายการครบทุกสถานะ รวมของผู้เช่า demo ที่เบอร์ `0810000001` อย่างน้อย 3 รายการต่างสถานะ และอย่างน้อย 1 รายการที่ `tech01` รับงานในแต่ละสถานะ `assigned`/`inProgress`; รูปตัวอย่างเป็น data URL SVG เล็ก; แจ้งเตือนตัวอย่างสอดคล้องกับประวัติ; id และวันที่อิงจากวันนี้); `createLocalMaintenanceApi(opts: { storage?: Storage | null; today?: () => string; property?: PropertyApi }): MaintenanceApi`; `localMaintenanceApi` (ตัวเริ่มต้น); `isMaintenanceData(v, property)` ภายใน
- พารามิเตอร์เพิ่มของ api (ตัดสินที่นี่ ใช้ใน Task 3–7): `RequestInput` มี `tenantPhone: string; tenantName: string`; `assign(requestId, technicianId, actorName: string)`; `updateStatus(requestId, status, note, actor: { phone: string; name: string })`

- [ ] **Step 1: เขียนเทสก่อน (fail)** seed: ครบสถานะ, รหัสไม่ซ้ำ, ประวัติเรียงตามเวลาและสอดคล้องกับสถานะปัจจุบัน, ช่างที่อ้างมีจริง, แจ้งเตือนมีผู้รับถูกต้อง, ผ่าน `isMaintenanceData`, วันที่ถูกที่วันนี้ต่าง ๆ (รวม 2028-02-29); api: `load` seed เมื่อว่าง/ไม่ใช่ JSON/รูปผิดและ **ต้องเท่ากับ seed พอดี** (ไม่ใช่แค่นับแถว); สร้างรายการ — ได้รหัสถัดไป, สถานะ `waiting`, ประวัติหนึ่งรายการ, snapshot ห้อง/ผู้เช่าจากสัญญาที่ใช้งาน, แจ้งเตือน `requestCreated` ถึง `role:juristic` หนึ่งรายการ; ผู้เช่าไม่มีสัญญาที่ใช้งาน (หมดอายุ/ยกเลิก/ยังไม่เริ่ม) → `no_lease`; ข้อมูลไม่ครบ/ไม่มีรูป → `invalid_input` พร้อมคีย์; มอบหมาย — `waiting → assigned`, แจ้งเตือน `assigned` ถึงช่าง + `statusChanged` ถึงผู้เช่า, มอบหมายซ้ำช่างคนเดิมไม่แจ้งเตือนซ้ำ, เปลี่ยนช่างตอน `assigned` ได้, ตอน `inProgress`/`done` → `invalid_transition`, ช่างที่ไม่มีอยู่ → `not_found`; `updateStatus` — ช่างผิดคน → `not_assigned`, ข้ามขั้น/ย้อน → `invalid_transition`, ถูกขั้น → ประวัติเพิ่มพร้อมหมายเหตุที่ trim และแจ้งเตือนผู้เช่า, หมายเหตุยาวเกิน → `invalid_input`; `markRead`/`markAllRead` เฉพาะของผู้รับ; **พื้นที่เก็บเต็ม** (storage ที่ `setItem` throw ตอนสร้าง) → `storage_failed` และ `load` ถัดไปไม่มีรายการนั้นและข้อมูลเดิมครบ; สองแท็บสร้างพร้อมกัน (`Promise.all`) ได้รหัสไม่ซ้ำ; อ่านใหม่ก่อนเขียนเห็นรายการของอีกแท็บ; ข้อมูลที่ไว้ใจไม่ได้ (ตารางกรณีเสียแต่ละแบบ) → เท่ากับ seed; **ย้ายสัญญาไปห้องอื่น/ลบห้อง → ข้อมูลเดิมยังอยู่ครบ**, ห้องที่อ้างไม่มีเลยสักห้อง → seed ใหม่; storage ล้มเหลวอ่าน/เขียน (ที่ไม่ใช่สร้างรายการ) ยังทำงานในหน่วยความจำ; `localAuthApi.test`: `tech01` มี `DEMO_TECH_PHONE` และ `staff01` ยัง `0800000000`
- [ ] **Step 2: รัน** `npm test -- src/maintenance src/auth` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; แบบเดียวกับ `localBillingApi.ts` (อ่านใหม่ทุกครั้ง, เขียนซิงโครนัสหลัง `await property.load()`, `persist` คืนค่าสำเร็จ/ล้มเหลวเพื่อให้ `createRequest` ย้อนกลับและ throw `storage_failed`)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): seed data, local api and technician phone`

### Task 3: Provider, ตัวช่วยเทส, การย่อรูป

**Files:**
- Create: `src/maintenance/MaintenanceContext.ts`, `useMaintenance.ts`, `MaintenanceProvider.tsx`, `src/maintenance/photos.ts`, `src/test/MaintenanceReadyProbe.tsx`, `src/test/testMaintenance.ts`, `src/test/renderMaintenance.tsx`
- Modify: `src/app/AppShell.tsx` (ห่อ `MaintenanceProvider`)
- Test: `src/maintenance/MaintenanceProvider.test.tsx`, `src/maintenance/photos.test.ts`

**Interfaces:**
- Consumes: Task 2
- Produces: `useMaintenance(): { status: 'loading'|'ready'|'error'; data: MaintenanceData; today: string; reload(): Promise<void> } & Omit<MaintenanceApi,'load'>` (เหมือน `useBilling`: เมธอดเขียนแล้วรีโหลด ข้อผิดพลาดส่งต่อให้ผู้เรียก, รีโหลดเมื่อเกิด `storage` event ของ `MAINTENANCE_KEY`, ไม่ set state หลัง unmount); `type PhotoProcessor = (file: File) => Promise<Photo>`; `processPhoto: PhotoProcessor` (ค่าเริ่มต้นใช้ `createImageBitmap` + canvas ย่อด้านยาวสุด 300px → JPEG 0.7 → data URL; ไฟล์ที่ถอดรหัสไม่ได้ → throw `Error('photo_unsupported')`); `makeTestMaintenance(opts?: { today? }): { maintenance: MaintenanceApi; property: PropertyApi }`; `renderMaintenance(ui, { api?, property?, today?, route?, as? })` (เหมือน `renderBilling` และรอ `maintenance-ready`); `fakePhoto(name): Photo` ใน `testMaintenance.ts`

- [ ] **Step 1: เขียนเทสก่อน (fail)** Provider: loading→ready, รีโหลดหลังเขียน, ข้อผิดพลาดส่งต่อและข้อมูลไม่เปลี่ยน, โหลดล้มเหลว/รีโหลดล้มเหลว → `error` (ไม่ค้าง loading), ไม่ set state หลัง unmount, `storage` event ของคีย์ตนเท่านั้น, ใช้นอก Provider → throw; `photos.test.ts` ฉีด canvas/`createImageBitmap` ปลอมผ่าน `vi.stubGlobal`: ย่อด้านยาวสุดเหลือ 300 โดยรักษาสัดส่วน (รูปที่เล็กกว่า 300 ไม่ขยาย), ได้ `dataUrl` ขึ้นต้น `data:image/jpeg`, ถอดรหัสไม่ได้ → `photo_unsupported`; เทส `AppShell` เดิมต้องผ่าน (ถ้าพังเพราะ provider ให้ปรับเทสโดยไม่ลดการตรวจ)
- [ ] **Step 2: รัน** `npm test -- src/maintenance` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; ห่อ `AppShell` ด้วย `MaintenanceProvider` ในชั้นเดียวกับ `BillingProvider`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): provider, test helpers and photo processing`

### Task 4: หน้าผู้เช่า — แจ้งซ่อม รายการ รายละเอียด

**Files:**
- Create: `src/features/maintenance/TenantMaintenancePage.tsx`, `RequestFormModal.tsx`, `RequestDetailModal.tsx`, `Timeline.tsx`, `statusBadges.ts`
- Modify: `src/app/router.tsx` (`/tenant/maintenance` หน้าจริง)
- Test: `TenantMaintenancePage.test.tsx`, `RequestFormModal.test.tsx`, `statusBadges.test.ts`

**Interfaces:**
- Consumes: Task 1–3, `useAuth().user`, `Modal`, `FormField`, `Button`, `StatusBadge`, `formatDate`, `validateRequest`, `validatePhotoFile`, `processPhoto`
- Produces: `TenantMaintenancePage`: การ์ดรายการของเบอร์ผู้ใช้ (ใหม่ไปเก่า: รหัส, หัวข้อ, หมวดหมู่, ป้ายสถานะ, วันที่), ปุ่ม "แจ้งซ่อมใหม่", ข้อความว่าง, ผู้เช่าไม่มีสัญญาที่ใช้งาน → ข้อความอธิบายแทนปุ่ม, อ่าน `?request=<id>` (ไม่ใช่ของผู้ใช้/ไม่มี → ล้างพารามิเตอร์ ไม่พัง); `RequestFormModal({ processor?: PhotoProcessor; onClose })`: หมวดหมู่, หัวข้อ, รายละเอียด, ช่องเลือกรูปหลายไฟล์ + ตัวอย่างพร้อมปุ่มลบรูป (ตรวจชนิด/ขนาด/จำนวนทันทีที่เลือก ข้อความใต้ช่อง ไม่ย่อไฟล์ที่ผิด), ปุ่มส่ง ตรวจด้วย `validateRequest` ก่อนเรียก api; ผิดแล้วโฟกัสช่องแรกที่ผิด; กันกดซ้ำ; `storage_failed` → ข้อความเฉพาะ; `no_lease` → ข้อความเฉพาะ; `RequestDetailModal({ requestId; onClose })`: ข้อมูล, ช่างที่รับงาน, รูป (`alt` = ชื่อไฟล์, กดดูขนาดใหญ่ได้), `Timeline` (ประวัติทั้งหมด: สถานะ, วันที่, หมายเหตุ, ผู้ทำ); `invoiceBadge`-คู่ขนาน `requestBadge(status)` ใน `statusBadges.ts` ใช้ร่วมกับ Task 5–6

- [ ] **Step 1: เขียนเทสก่อน (fail)** ด้วย `renderMaintenance(<TenantMaintenancePage />, { as: 'tenant' })`: เห็นเฉพาะรายการของเบอร์ `0810000001` เรียงใหม่ไปเก่า (ไม่เห็นของผู้เช่าอื่นแม้อยู่ใน storage เดียวกัน); ฟอร์ม — ไม่แนบรูปกดส่งแล้ว api ไม่ถูกเรียก, ข้อความ "กรุณากรอกข้อมูลและแนบรูปภาพประกอบให้ครบถ้วน", `aria-invalid` + โฟกัสช่องแรกที่ผิด; ไฟล์ `.gif`/ใหญ่เกิน 10 MB (ขอบพอดีผ่าน)/ครบสามแล้วเลือกเพิ่ม → ข้อความใต้ช่องและไม่เพิ่มรูป; ลบรูปแล้วนับถูก; ส่งสำเร็จ (ฉีด `processor` ปลอม) → api ถูกเรียกครั้งเดียวด้วยรูปที่ย่อแล้ว, รายการใหม่ขึ้นที่หัวรายการสถานะ "รอการมอบหมาย", กล่องปิด; ย่อรูปไม่ได้ (`photo_unsupported`) → ข้อความไฟล์ไม่รองรับและไม่เพิ่มรูป; กดส่งซ้ำระหว่างรอเรียกครั้งเดียวและปุ่ม disabled; `storage_failed` → ข้อความ + ฟอร์มยังอยู่ค่าไม่หาย; ไม่มีสัญญาที่ใช้งาน → ไม่มีปุ่ม + ข้อความ; รายละเอียด — เส้นเวลาครบตามประวัติ, ช่างที่รับงาน, รูปมี `alt`; `?request=` ของตนเปิดรายละเอียด ของคนอื่น/ไม่มีไม่เปิดและล้างพารามิเตอร์; ว่างแสดงข้อความ; สลับภาษา; `statusBadges` ครบ 4 สถานะ มีข้อความ
- [ ] **Step 2: รัน** `npm test -- src/features/maintenance` — Expected: FAIL
- [ ] **Step 3: Implement** ตาม Interfaces; เพิ่มคีย์ `maintenance.*` ทั้งสองภาษา; ปรับ `router.tsx` (เส้นทางผู้เช่าออกจาก placeholder)
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): tenant maintenance page with photo upload`

### Task 5: หน้านิติบุคคล — ตาราง กรอง มอบหมาย

**Files:**
- Create: `src/features/maintenance/JuristicMaintenancePage.tsx`, `AssignDialog.tsx`
- Modify: `src/app/router.tsx`
- Test: `JuristicMaintenancePage.test.tsx`

**Interfaces:**
- Consumes: Task 1–4 (`RequestDetailModal` ใช้ร่วม, ขยายให้แสดงปุ่ม "มอบหมาย/เปลี่ยนช่าง" ผ่าน prop `actions?: ReactNode` ไม่ผูกบทบาทในตัวมัน), `KpiCard`, `DataTable`, `ConfirmDialog`, `canAssign`
- Produces: `JuristicMaintenancePage`: การ์ดนับตามสถานะ 4 ใบ, ตัวกรองสถานะ, ตาราง (รหัส, ห้อง, ผู้เช่า, หมวดหมู่, หัวข้อ, ช่าง, ป้ายสถานะ, วันที่; แถวละปุ่ม "ดูรายละเอียด"), รายละเอียดมีรูป/เส้นเวลา/ปุ่มมอบหมาย; `AssignDialog({ request; onClose })`: เลือกช่างจากรายชื่อ (ต้องเลือก), ยืนยัน, กันกดซ้ำ, `invalid_transition` (อีกแท็บเปลี่ยนไปแล้ว) → ข้อความ + รีโหลด; อ่าน `?request=`

- [ ] **Step 1: เขียนเทสก่อน (fail)** `renderApp('/juristic/maintenance', { as: 'juristic' })` และ `renderMaintenance`: การ์ดเลขตรงข้อมูล, ตารางครบทุกรายการ ตัวเลขวันที่ตามภาษา, กรองสถานะครบทุกตัวเลือกและข้อความว่างเมื่อไม่มี, เปิดรายละเอียดเห็นรูป/เส้นเวลา, มอบหมาย `waiting` → ยืนยัน → สถานะ `assigned` ช่างขึ้นในตารางและมีแจ้งเตือนถึงช่างกับผู้เช่า (ตรวจด้วย api), ไม่เลือกช่างผิดใต้ช่องและไม่เรียก api, เปลี่ยนช่างตอน `assigned` ได้, ไม่มีปุ่มมอบหมายตอน `inProgress`/`done`, กดยืนยันซ้ำเรียกครั้งเดียว, สถานะเปลี่ยนจากอีกแท็บ (`invalid_transition`) → ข้อความและรายการโหลดใหม่, ผู้เช่า/ช่างเข้า `/juristic/maintenance` ไม่ได้ (พากลับ), เมนูข้าง active, ตารางเลื่อนข้างในกรอบ `relative`, สลับภาษา
- [ ] **Step 2: รัน** `npm test -- src/features/maintenance/JuristicMaintenancePage.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; เพิ่มคีย์ `maintenance.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): juristic maintenance page with technician assignment`

### Task 6: หน้าช่าง — งานของฉัน

**Files:**
- Create: `src/features/maintenance/TechnicianJobsPage.tsx`, `StatusUpdateDialog.tsx`
- Modify: `src/app/router.tsx`
- Test: `TechnicianJobsPage.test.tsx`

**Interfaces:**
- Consumes: Task 1–5, `useAuth().user.phone`, `nextStatus`, `canTechnicianUpdate`
- Produces: `TechnicianJobsPage`: การ์ดงานที่ `assigneeId` ตรงกับช่างที่มีเบอร์ = เบอร์ผู้ใช้ (เรียงงานยังไม่เสร็จก่อน แล้วใหม่ไปเก่า), ข้อความว่าง, ผู้ใช้ที่ไม่ตรงช่างคนใด → ข้อความ "ยังไม่มีงานที่ได้รับมอบหมาย"; รายละเอียดใช้ `RequestDetailModal` พร้อม `actions` เป็นปุ่มขั้นถัดไปปุ่มเดียว ("เริ่มซ่อม" / "ซ่อมเสร็จ"); `StatusUpdateDialog({ request; onClose })`: ช่องหมายเหตุไม่บังคับ ≤ 300 ตัวอักษร (ผิดแล้วโฟกัส), ยืนยัน, กันกดซ้ำ, `invalid_transition`/`not_assigned` → ข้อความ + รีโหลด; อ่าน `?request=` (ไม่ใช่งานของตน → ล้างพารามิเตอร์)

- [ ] **Step 1: เขียนเทสก่อน (fail)** ด้วย `renderApp('/technician/jobs', { as: 'technician' })` และ `renderMaintenance`: เห็นเฉพาะงานของ `tech01` (ไม่เห็นงานช่างคนอื่น), `assigned` มีเฉพาะปุ่ม "เริ่มซ่อม", ทำแล้วเป็น `inProgress` ประวัติเพิ่มพร้อมหมายเหตุ และผู้เช่าได้แจ้งเตือน `statusChanged`, `inProgress` มีเฉพาะ "ซ่อมเสร็จ", `done` ไม่มีปุ่ม, หมายเหตุ 300 ผ่าน/301 ผิดและโฟกัส, กดยืนยันซ้ำเรียกครั้งเดียว, สถานะเปลี่ยนจากอีกแท็บ → ข้อความ + โหลดใหม่ ไม่ค้างแถวเดิม, `?request=` ของงานช่างคนอื่นไม่เปิดและล้างพารามิเตอร์, ผู้เช่า/นิติบุคคลเข้า `/technician/jobs` ไม่ได้, ว่าง, สลับภาษา
- [ ] **Step 2: รัน** `npm test -- src/features/maintenance/TechnicianJobsPage.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; เพิ่มคีย์ `maintenance.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): technician jobs page with status updates`

### Task 7: กระดิ่งรวมทุกบทบาท

**Files:**
- Create: `src/notifications/useNotifications.ts`
- Modify: `src/app/NotificationBell.tsx` (ใช้ hook, แสดงทุกบทบาท), `src/app/AppShell.tsx` (ไม่ซ่อนกระดิ่งตามบทบาทอีก)
- Test: `src/notifications/useNotifications.test.tsx`, `src/app/NotificationBell.test.tsx` (ขยายจากเดิม ไม่ลดการตรวจ)

**Interfaces:**
- Consumes: `useBilling`, `useMaintenance`, `useAuth`
- Produces: `type AppNotice = { key: string; source: 'billing'|'maintenance'; text: string; reason?: string; createdAt: string; read: boolean; to: string; markRead(): Promise<void> }`; `useNotifications(): { notices: AppNotice[]; unread: number; markAllRead(): Promise<void> }` (ข้อความผ่าน i18n จากชนิด+เลขที่/รหัสรายการ: งานซ่อมใหม่ "มีแจ้งซ่อมใหม่ {{code}} ห้อง {{unit}}", มอบหมาย "ได้รับมอบหมายงาน {{code}}", เปลี่ยนสถานะ "งานซ่อม {{code}} เปลี่ยนเป็น {{status}}"; ผู้เช่าได้ทั้งสองที่มา นิติบุคคลเฉพาะ `role:juristic` ช่างเฉพาะเบอร์ตน; เรียงใหม่ไปเก่า เท่ากันเรียงตาม key); `NotificationBell` เดิมทุกพฤติกรรม (Modal, `99+`, อ่านทั้งหมด, โฟกัสกลับปุ่ม) แต่ใช้ `useNotifications` และกดแล้ว `navigate(notice.to)`

- [ ] **Step 1: เขียนเทสก่อน (fail)** hook: ผู้เช่าเห็นแจ้งเตือนบิลของเบอร์ตัวเองและงานซ่อมของเบอร์ตัวเองรวมกันเรียงถูก ไม่เห็นของเบอร์อื่น, นิติบุคคลเห็นเฉพาะ `role:juristic` (ไม่เห็นแจ้งเตือนบิลของผู้เช่า), ช่างเห็นเฉพาะ `assigned` ถึงเบอร์ตน, นับยังไม่อ่านรวมสองที่มา, `markAllRead` ทำเครื่องหมายทั้งสองที่มาเฉพาะของผู้ใช้และไม่แตะของคนอื่น, ข้อความเปลี่ยนตามภาษา, ปลายทางถูกตามบทบาท; กระดิ่ง: เห็นทุกบทบาท (เดิมซ่อนนิติบุคคล/ช่าง → ปรับเทสเดิมข้อนั้น), นิติบุคคลกดแจ้งเตือนแล้วไป `/juristic/maintenance?request=<id>` และกล่องรายการนั้นเปิด, ช่างไป `/technician/jobs?request=<id>`, ผู้เช่าไปงานซ่อมหรือบิลตามชนิด, เทสกระดิ่งเดิมของผู้เช่ายังผ่านทั้งหมด
- [ ] **Step 2: รัน** `npm test -- src/notifications src/app/NotificationBell.test.tsx` — Expected: FAIL
- [ ] **Step 3: Implement**; เพิ่มคีย์ `maintenance.notifications.*`
- [ ] **Step 4: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat(maintenance): one notification bell for every role`

### Task 8: ตรวจรับรวมและเอกสาร

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า

- [ ] **Step 1: รัน** `npm test`, `npm run lint`, `npm run build` — Expected: ผ่านทั้งหมด, lint 0 warning, ไม่มี CDN (`grep -rlE "cdn.tailwindcss.com|fonts.googleapis.com" dist index.html src`)
- [ ] **Step 2: ตรวจแบบ end-to-end ในเบราว์เซอร์จริง** (`npm run dev` + Playwright ในโฟลเดอร์ชั่วคราวนอกโปรเจกต์ ใช้ Chrome ในเครื่อง; ที่ 1280, 390 และ 320px และจอเตี้ย 480px ใช้ iframe ที่ความกว้างจริงเมื่อวัดความกว้าง): ล้าง localStorage; `tenant01` เห็นรายการตัวอย่างและแจ้งซ่อมใหม่ด้วยรูปจริง (ไฟล์ JPG/PNG ที่ย่อจริง ตรวจว่าเก็บได้ ≤ 300px) ไม่แนบรูป/ไฟล์ผิดชนิดถูกปฏิเสธ; `staff01` เห็นกระดิ่งมีแจ้งซ่อมใหม่ กดไปที่รายการ มอบหมายให้ `tech01`; `tech01` เห็นแจ้งเตือนและงาน เริ่มซ่อมแล้วซ่อมเสร็จพร้อมหมายเหตุ; `tenant01` เห็นแจ้งเตือนสถานะและเส้นเวลาครบ; อีกช่าง (ตัวอย่าง) ไม่ปรากฏเป็นผู้ใช้ แต่งานที่มอบหมายให้เขาไม่ขึ้นที่ `tech01`; ทำให้พื้นที่เก็บเต็มจริง (เติม localStorage ให้เกือบเต็มแล้วแจ้งซ่อมรูปใหญ่) ต้องเห็นข้อความและข้อมูลเดิมไม่หาย; รีเฟรชแล้วข้อมูลอยู่; ลบ `condo:maintenance` แล้วรีเฟรชได้ข้อมูลตัวอย่าง; ข้อมูลเสียแล้วรีเฟรชไม่พัง; ลบ/ย้ายสัญญาใน `/juristic/units` แล้วงานซ่อมเดิมยังอยู่; ผู้เช่าเปิด `/juristic/maintenance` และ `/technician/jobs` ถูกพากลับ; ผู้เช่าที่สมัครเองเบอร์ไม่ตรงสัญญาเห็นข้อความแจ้งซ่อมไม่ได้; สลับ TH/EN; ไม่ล้นจอที่ 390/320px (ตรวจ header ที่มีกระดิ่งทุกบทบาท) และ Modal/ตารางใช้งานได้ที่จอเตี้ย; ถ่ายภาพหน้าจอและดูจริง รายงานตามจริง ถ้าตรวจข้อใดไม่ได้ให้บอก
- [ ] **Step 3: อัปเดต `README.md`:** หัวข้อ "แจ้งซ่อมและงานช่าง (FR18–21)" (ไฟล์: `src/maintenance/`, `src/features/maintenance/`, `src/notifications/`; สถานะและกฎการเปลี่ยน; ผู้เช่าเห็นตามเบอร์โทร/ช่างจับคู่ตามเบอร์ `0800000002`; รูปย่อเก็บในเครื่องและข้อจำกัดพื้นที่; กระดิ่งรวมทุกบทบาท; ข้อจำกัด: ไม่แก้/ยกเลิกรายการ, ไม่มี push, **ต้องล้าง `condo:users` เดิมเพื่อให้ `tech01` ได้เบอร์ใหม่**; วิธีเปลี่ยนเป็นหลังบ้านจริงโดยเขียน `MaintenanceApi` ตัวใหม่แล้วส่งให้ `MaintenanceProvider api`), ปรับสถานะโปรเจกต์ให้ตรง
- [ ] **Step 4: Commit** `docs: maintenance readme and final verification`
