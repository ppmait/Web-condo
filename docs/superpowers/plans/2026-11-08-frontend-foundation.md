# Condo Management Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** โครงหน้าบ้านที่พร้อมต่อยอดทีละโมดูล: tokens, ฟอนต์ไทย, shell กลาง, router ตาม role, i18n th/en และ UI component พื้นฐาน

**Architecture:** SPA ด้วย Vite + React + TypeScript, Tailwind v4 กำหนด design tokens ใน CSS `@theme` ไฟล์เดียว, `AppShell` ตัวเดียวหุ้มทุก route ของทั้ง 3 role, role มาจาก URL prefix (ไม่มี auth), ข้อความทั้งหมดผ่าน react-i18next

**Tech Stack:** React, Vite, TypeScript, Tailwind v4 (`@tailwindcss/vite`), React Router, react-i18next, `@fontsource` (Plus Jakarta Sans, Noto Sans Thai, Material Symbols Outlined), Vitest + jsdom + React Testing Library + user-event

**Spec:** `docs/superpowers/specs/2026-11-08-frontend-foundation-design.md`

## Global Constraints

- โปรเจกต์อยู่ที่ `/Users/macbook/project/condo-management` (repo แยก, branch `main`)
- Tailwind ติดตั้งผ่าน npm เท่านั้น ห้ามใช้ `cdn.tailwindcss.com`
- ฟอนต์ self-host ด้วย `@fontsource` ห้ามโหลดจาก Google Fonts CDN; font stack: `'Plus Jakarta Sans', 'Noto Sans Thai', sans-serif`
- tokens ตามค่าใน frontmatter ของ `DESIGN.md` (`primary #001428`, `primary-container #0f2942`, `secondary #006a61`, `error #ba1a1a`, `surface #f7f9fb` ฯลฯ); ปุ่มหลักใช้ `primary-container` พื้น, hover `#1e3a8a`
- Radii: input/badge-row/checkbox 4px, card 8px, modal 12px, status pill เต็มวงเท่านั้น
- ตัวเลขเงิน รหัสห้อง และมิเตอร์ใช้ `tabular-nums`; คอลัมน์ตัวเลขในตารางชิดขวา
- status badge ต้องมีข้อความกำกับเสมอ ไม่พึ่งสีอย่างเดียว
- Breakpoints: mobile < 768px (เมนูแบบ drawer), tablet 768–1024px (icon bar 64px), desktop ≥ 1024px (sidebar 240px)
- ภาษาเริ่มต้น: ไทย; เก็บภาษาที่เลือกใน localStorage คีย์ `condo:lang`; ค่าที่ไม่ใช่ `th`/`en` ให้ใช้ `th`
- ห้ามมีข้อความ UI ฝังในโค้ด component ทุกข้อความมาจากไฟล์ i18n
- Route: `/tenant/*`, `/juristic/*`, `/technician/*`; `/` redirect ไป `/tenant`; route ที่ไม่รู้จักแสดงหน้า 404
- ไม่ทำ: หลังบ้าน, login/RBAC จริง, เนื้อหาโมดูล, PWA

## Review Focus

- localStorage `condo:lang` เป็นค่าแปลก/ว่าง/อ่านไม่ได้ ต้องไม่ทำให้แอปพัง ใช้ไทยแทน (Task 2)
- URL ที่ไม่รู้จักทั้งระดับบน (`/xyz`) และใต้ role (`/juristic/xyz`) ต้องเจอ 404 ไม่ใช่หน้าขาว (Task 6)
- เมนู drawer บนมือถือต้องปิดเมื่อกดเมนู, กด Escape หรือกดฉากหลัง และต้องไม่ค้างเปิดตอนเปลี่ยน route (Task 6)
- ป้ายภาษาไทยยาว (เมนู, badge) ต้องไม่ล้นหรือทับกันใน sidebar 240px และ icon bar (Task 4, 6)
- ตารางที่ไม่มีข้อมูล ต้องแสดงข้อความ "ไม่มีข้อมูล" แทนตารางว่างเปล่า และตัวเลขติดลบ/ศูนย์ยังชิดขวา (Task 5)

---

### Task 1: สร้างโครงโปรเจกต์ + เครื่องมือทดสอบ

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `.gitignore`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: คำสั่ง `npm run dev | build | test`; `src/App.tsx` default export component `App`; `src/test/setup.ts` โหลด `@testing-library/jest-dom` และ stub `matchMedia`/`ResizeObserver`

- [ ] **Step 1: สร้าง scaffold ใน `/Users/macbook/project/condo-management`** ด้วย template `react-ts` ของ Vite (สร้างในโฟลเดอร์ชั่วคราวว่างแล้วย้ายไฟล์เข้ามา เพราะโฟลเดอร์นี้มี `docs/` และ `.git` อยู่แล้ว ห้ามเขียนทับ `docs/`) ตั้ง `name` เป็น `condo-management`, `index.html` ใช้ `lang="th"` และ `<title>ระบบบริหารคอนโด</title>`
- [ ] **Step 2: ติดตั้ง dev deps:** `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; เพิ่มสคริปต์ `"test": "vitest run"`
- [ ] **Step 3: ตั้ง test config ใน `vite.config.ts`:** `environment: 'jsdom'`, `globals: true`, `setupFiles: ['src/test/setup.ts']`, `exclude: [...configDefaults.exclude, '.claude/**']`
- [ ] **Step 4: เขียน test ที่ fail ก่อน** `src/App.test.tsx`: render `<App />` แล้ว `expect(screen.getByRole('main')).toBeInTheDocument()`
- [ ] **Step 5: รัน** `npm test` — Expected: FAIL (App ยังเป็นหน้า template ที่ไม่มี `<main>`)
- [ ] **Step 6: แก้ `src/App.tsx`** ให้คืน `<main>` ว่างพร้อมข้อความชั่วคราว ลบ asset/CSS ของ template ที่ไม่ใช้; เพิ่ม `.superpowers/` ใน `.gitignore`
- [ ] **Step 7: รัน** `npm test` และ `npm run build` — Expected: เทสผ่าน 1/1, build สำเร็จ
- [ ] **Step 8: Commit** `chore: scaffold vite react-ts with vitest`

### Task 2: Tailwind, design tokens, ฟอนต์ และ i18n

**Files:**
- Create: `src/styles/index.css`, `src/i18n/index.ts`, `src/i18n/th.json`, `src/i18n/en.json`, `src/components/LanguageToggle.tsx`
- Modify: `vite.config.ts` (เพิ่ม `@tailwindcss/vite`), `src/main.tsx` (import css + i18n)
- Test: `src/styles/tokens.test.ts`, `src/i18n/i18n.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`npm test`, setup)
- Produces:
  - Tailwind utilities จาก tokens: `bg-primary`, `bg-primary-container`, `text-on-surface`, `bg-surface`, `bg-secondary`, `text-error` ฯลฯ ครบตามชื่อใน frontmatter ของ `DESIGN.md`
  - `src/i18n/index.ts`: `export const LANG_KEY = 'condo:lang'`, `export type Lang = 'th' | 'en'`, `export function readStoredLang(): Lang`, `export default i18n` (instance ที่ init แล้ว)
  - `LanguageToggle` (default export): ปุ่ม TH/EN `aria-pressed` ตามภาษาปัจจุบัน; กดแล้วเรียก `i18n.changeLanguage` และเก็บ `LANG_KEY`
  - คีย์ข้อความรูปแบบ `common.*`, `nav.*`, `role.*`, `status.*`, `notFound.*` (กำหนดเพิ่มในแต่ละ task ที่ใช้ ต้องมีทั้ง th และ en เท่ากัน)

- [ ] **Step 1: เขียน `tokens.test.ts` (fail ก่อน):** อ่าน `src/styles/index.css` เป็นข้อความด้วย `fs` แล้ว assert มี `--color-primary: #001428`, `--color-primary-container: #0f2942`, `--color-secondary: #006a61`, `--color-error: #ba1a1a`, `--color-surface: #f7f9fb` และ `--font-sans` มี `Noto Sans Thai` และ `Plus Jakarta Sans`
- [ ] **Step 2: เขียน `i18n.test.tsx` (fail ก่อน):** `readStoredLang()` คืน `'th'` เมื่อไม่มีค่า, เมื่อค่าเป็น `'fr'`, เมื่อเป็นสตริงว่าง และเมื่อ `localStorage.getItem` throw; คืน `'en'` เมื่อเก็บ `'en'`; `LanguageToggle` กด EN แล้ว `i18n.language === 'en'`, `localStorage['condo:lang'] === 'en'`, ปุ่ม EN `aria-pressed=true`
- [ ] **Step 3: รัน** `npm test` — Expected: FAIL ทั้งสองไฟล์ (ไฟล์ยังไม่มี)
- [ ] **Step 4: ติดตั้ง** `tailwindcss @tailwindcss/vite react-i18next i18next @fontsource-variable/plus-jakarta-sans @fontsource/noto-sans-thai @fontsource-variable/material-symbols-outlined` (ตรวจชื่อแพ็กเกจฟอนต์กับ npm ก่อน ถ้าชื่อต่างให้ใช้ตัวที่มีจริงและบันทึก ruling) แล้วเพิ่มปลั๊กอินใน `vite.config.ts`
- [ ] **Step 5: เขียน `src/styles/index.css`:** `@import "tailwindcss"` + import ฟอนต์ + `@theme { ... }` ใส่ทุก color token จาก frontmatter ของ `DESIGN.md` (ชื่อ `--color-<ชื่อเดิม>` เช่น `--color-surface-container-low`), `--font-sans`, radius `--radius-sm/DEFAULT/md/lg/xl` ตามค่า `DESIGN.md`; base: `body` พื้น `surface` ตัวอักษร `on-surface` font-sans; class `.material-symbols-outlined` ตั้ง font-family ไอคอน
- [ ] **Step 6: เขียน `src/i18n/index.ts`, `th.json`, `en.json` และ `LanguageToggle.tsx`** ตาม Interfaces (อ่านค่าเริ่มต้นด้วย try/catch ครอบ localStorage ทั้งอ่านและเขียน)
- [ ] **Step 7: รัน** `npm test` และ `npm run build` — Expected: ผ่านทั้งหมด, build ไม่มี warning เรื่อง CDN
- [ ] **Step 8: Commit** `feat: tailwind tokens, thai fonts and i18n`

### Task 3: UI พื้นฐาน — Button, StatusBadge, KpiCard

**Files:**
- Create: `src/components/Button.tsx`, `src/components/StatusBadge.tsx`, `src/components/KpiCard.tsx`
- Test: `src/components/Button.test.tsx`, `StatusBadge.test.tsx`, `KpiCard.test.tsx`

**Interfaces:**
- Consumes: Task 2 (tokens, i18n `status.*`)
- Produces:
  - `Button` default export: props `{ variant?: 'primary' | 'secondary' | 'success'; ...ButtonHTMLAttributes }`, default `primary`, `type` default `'button'`
  - `StatusBadge` default export: props `{ status: 'settled' | 'pending' | 'critical' | 'inactive'; label?: string }`; แสดงข้อความจาก `t('status.<status>')` เมื่อไม่ส่ง `label`; มี `data-status`
  - `KpiCard` default export: props `{ label: string; value: string; delta?: { text: string; trend: 'up' | 'down' | 'flat' } }`; `value` ใช้ `tabular-nums`

- [ ] **Step 1: เขียนเทสก่อน:** Button — render ตาม variant (class พื้นต่างกัน: `bg-primary-container` / `bg-secondary`...), `onClick` ทำงาน, `disabled` ไม่ยิง onClick, `type` ค่าเริ่มต้น `button`; StatusBadge — ทั้ง 4 status แสดงข้อความไทย และเปลี่ยนเป็นอังกฤษเมื่อสลับภาษา, `label` ที่ส่งมาทับค่าเริ่มต้น, มี `data-status`; KpiCard — แสดง label/value/delta, value มี class `tabular-nums`, ไม่มี delta ก็ไม่แสดงส่วน delta
- [ ] **Step 2: รัน** `npm test` — Expected: FAIL (component ยังไม่มี)
- [ ] **Step 3: Implement** ตามสเปก component ของ `DESIGN.md` (primary: พื้น `primary-container` hover `#1e3a8a` focus ring `#0d9488` offset; secondary: ขาว ขอบ `#cbd5e1`; success: `#0d9488` hover `#0f766e`; badge pill สี: settled `#ccfbf1/#0f766e`, pending `#fef3c7/#b45309`, critical `#ffe4e6/#be123c`, inactive `#f1f5f9/#475569`, ตัวอักษร 11px, padding `2px 8px`; KpiCard: การ์ด level-1 ขอบ `#e2e8f0` ตัวเลข 28px bold) และเพิ่มคีย์ `status.*` ในทั้งสองภาษา
- [ ] **Step 4: รัน** `npm test` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat: button, status badge and kpi card`

### Task 4: UI ฟอร์มและตาราง — FormField, DataTable, Modal

**Files:**
- Create: `src/components/FormField.tsx`, `src/components/DataTable.tsx`, `src/components/Modal.tsx`
- Test: `FormField.test.tsx`, `DataTable.test.tsx`, `Modal.test.tsx`

**Interfaces:**
- Consumes: Task 2 (tokens, i18n `common.*`), Task 3 (`Button`)
- Produces:
  - `FormField` default export: props `{ label: string; error?: string; children: (a: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode }`; label ผูก `htmlFor`, error แสดงใต้ช่องและเชื่อมด้วย `aria-describedby`
  - `DataTable<T>` default export: props `{ columns: { key: string; header: string; align?: 'left' | 'right'; numeric?: boolean; render: (row: T) => ReactNode }[]; rows: T[]; rowKey: (row: T) => string; emptyText?: string }`; คอลัมน์ `numeric` ชิดขวาและมี `tabular-nums`; ไม่มีแถว → แสดง `emptyText ?? t('common.noData')`
  - `Modal` default export: props `{ open: boolean; title: string; onClose: () => void; children: ReactNode }`; `role="dialog"`, `aria-modal`, `aria-labelledby`; กด Escape หรือกดฉากหลังเรียก `onClose`; โฟกัสเข้า dialog ตอนเปิดและกลับไปที่ปุ่มเดิมตอนปิด

- [ ] **Step 1: เขียนเทสก่อน:** FormField — label คลิกแล้วโฟกัส input, error แสดงและ `aria-invalid=true`; DataTable — แสดงหัวและแถว, คอลัมน์ numeric มี `text-right` และ `tabular-nums`, ค่าติดลบ `-1,200` และ `0` ยังอยู่ในคอลัมน์ชิดขวา, rows ว่างแสดง "ไม่มีข้อมูล" (และ "No data" เมื่อเป็นอังกฤษ); Modal — `open=false` ไม่ render, เปิดแล้วมี dialog พร้อมชื่อ, Escape ปิด, คลิกฉากหลังปิด แต่คลิกในเนื้อหาไม่ปิด, โฟกัสกลับไปปุ่มที่เปิด
- [ ] **Step 2: รัน** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement** ตามสเปก `DESIGN.md` (input 40px ขอบ `#cbd5e1` focus ขอบ `primary-container` + aura; ตารางหัว 40px พื้น `#f8fafc` ตัวพิมพ์ 11px แถว 48px ขอบล่าง `#f1f5f9`; modal radius 12px ฉากหลัง `#0f2942` โปร่ง 40%) และเพิ่มคีย์ `common.noData`, `common.close`
- [ ] **Step 4: รัน** `npm test` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat: form field, data table and modal`

### Task 5: ค่าคอนฟิก role และเมนู

**Files:**
- Create: `src/app/roles.ts`
- Test: `src/app/roles.test.ts`

**Interfaces:**
- Produces:
  - `export type Role = 'tenant' | 'juristic' | 'technician'`; `export const ROLES: Role[]`
  - `export interface NavItem { key: string; path: string; icon: string }` (`key` ใช้เป็น `nav.<key>` ใน i18n, `path` เป็น path เต็ม เช่น `/juristic/billing`, `icon` ชื่อ Material Symbol)
  - `export const NAV_BY_ROLE: Record<Role, NavItem[]>`: tenant = overview, billing, parcels, maintenance, facilities, announcements; juristic = dashboard, units, billing, maintenance, parcelsBookings, announcements, reports; technician = jobs (ตัวแรกของแต่ละ role คือหน้าแรก)
  - `export function roleHome(role: Role): string` (path ของเมนูแรก)
  - `export function roleFromPath(pathname: string): Role | null` (ดูจากส่วนแรกของ path)

- [ ] **Step 1: เขียนเทสก่อน:** ทุก role มีเมนู ≥ 1; `path` ของทุกเมนูขึ้นต้นด้วย `/<role>/`; ไม่มี path ซ้ำภายใน role; `roleHome('juristic') === '/juristic/dashboard'`; `roleFromPath('/tenant/billing') === 'tenant'`, `'/juristic'` → `'juristic'`, `'/xyz'` และ `'/'` → `null`, `'/tenants'` → `null`; ทุก `key` มีคีย์ `nav.<key>` ครบทั้ง th และ en (อ่านจากไฟล์ json)
- [ ] **Step 2: รัน** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement `roles.ts`** และเพิ่มคีย์ `nav.*` กับ `role.tenant|juristic|technician` ในทั้งสองภาษา (ชื่อไทยตาม SRS: ผู้เช่า, นิติบุคคล, ช่างประจำโครงการ)
- [ ] **Step 4: รัน** `npm test` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat: role and navigation config`

### Task 6: AppShell, router และหน้า placeholder

**Files:**
- Create: `src/app/AppShell.tsx`, `src/app/Sidebar.tsx`, `src/app/RoleSwitcher.tsx`, `src/app/router.tsx`, `src/features/PlaceholderPage.tsx`, `src/features/NotFoundPage.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/app/AppShell.test.tsx`, `src/app/router.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`LanguageToggle`, `i18n`), Task 5 (`NAV_BY_ROLE`, `roleFromPath`, `roleHome`, `ROLES`), Task 3 (`Button`)
- Produces:
  - `AppRoutes` (named export จาก `router.tsx`): ชุด `<Routes>` ให้ใช้ภายใต้ `MemoryRouter` ในเทสและ `BrowserRouter` ใน `App`
  - `AppShell`: header (ชื่อระบบ, `RoleSwitcher`, `LanguageToggle`) + `Sidebar` + `<main>` ที่ใส่ `<Outlet />`; mobile มีปุ่มเมนู `aria-label` เปิด/ปิด drawer
  - `RoleSwitcher`: ตัวเลือกครบ 3 role (ป้ายจาก `role.*`) เลือกแล้ว navigate ไป `roleHome(role)`; ค่าที่เลือกตรงกับ role จาก URL
  - `PlaceholderPage`: แสดงชื่อหน้าตาม `nav.<key>` ที่ตรงกับ path ปัจจุบัน
  - `NotFoundPage`: ข้อความ `notFound.*` พร้อมลิงก์กลับ `roleHome` (หรือ `/tenant` ถ้าไม่มี role)

- [ ] **Step 1: เขียนเทสก่อน:** Router — `/` redirect ไป `/tenant/overview`; แต่ละ role เห็นเมนูของตัวเองและไม่เห็นเมนูของ role อื่น; เมนูที่ active มี `aria-current="page"`; `/xyz` และ `/juristic/xyz` แสดง 404 (ไม่ใช่หน้าขาว); เลือก role ใน RoleSwitcher เปลี่ยน URL และเมนู; กด EN แล้วป้ายเมนูเป็นอังกฤษ; Shell — drawer มือถือ: ปุ่มเมนูเปิด, Escape ปิด, กดฉากหลังปิด, กดเมนูแล้วปิดและเปลี่ยนหน้า; ป้ายเมนูมี class ตัดข้อความ (`truncate`) และมี `title` เท่าป้ายเต็ม
- [ ] **Step 2: รัน** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement** — `AppRoutes`: `/` → `Navigate` ไป `roleHome('tenant')`, สร้าง route ต่อ role จาก `NAV_BY_ROLE` ใต้ `AppShell` (ใช้ `PlaceholderPage`), `*` → `NotFoundPage`; responsive ตามข้อกำหนด (≥1024px sidebar 240px แสดงข้อความ, 768–1024px icon bar 64px ซ่อนข้อความแต่คง `title`/`aria-label`, <768px drawer เลื่อนเปิด ใช้ Tailwind breakpoint `md:`/`lg:`); ไอคอนใช้ `<span class="material-symbols-outlined" aria-hidden>`; `App.tsx` ห่อด้วย `BrowserRouter`
- [ ] **Step 4: รัน** `npm test` — Expected: ผ่านทั้งหมด
- [ ] **Step 5: Commit** `feat: app shell, role routing and placeholder pages`

### Task 7: ตรวจรับรวมและเอกสาร

**Files:**
- Create: `README.md`
- Modify: `package.json` (ถ้าจำเป็น), `eslint`/lint config ตามที่ template ให้มา

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า

- [ ] **Step 1: รัน** `npm test` — Expected: ทุกไฟล์ผ่าน, 0 failed
- [ ] **Step 2: รัน** `npm run build` — Expected: สำเร็จ; `grep -r "cdn.tailwindcss.com\|fonts.googleapis.com" dist index.html src` ไม่พบอะไร
- [ ] **Step 3: รัน lint** (`npm run lint` ถ้า template มีให้) — Expected: ไม่มี error
- [ ] **Step 4: เปิด dev server** (`npm run dev`) แล้วตรวจด้วยตาในเบราว์เซอร์: shell ของทั้ง 3 role, สลับ TH/EN, ข้อความไทยเป็น Noto Sans Thai (DevTools → Computed → Rendered Fonts), เมนู drawer บนความกว้าง < 768px, icon bar ที่ ~900px; รายงานผลตามจริง ถ้าตรวจไม่ได้ให้บอกว่าไม่ได้ตรวจ
- [ ] **Step 5: เขียน `README.md`** สั้นๆ: คำสั่ง dev/test/build, โครงสร้างโฟลเดอร์, วิธีเพิ่มหน้า/เมนูของ role และข้อความ i18n, บันทึกว่า role switcher เป็นของชั่วคราวที่ต้องแทนด้วย auth
- [ ] **Step 6: Commit** `docs: readme and final verification`
