# Condo Management (frontend)

โครงหน้าบ้านของระบบบริหารคอนโด/นิติบุคคล: React + Vite + TypeScript + Tailwind v4

สถานะ: โครงพื้นฐาน + **login/สมัครสมาชิก/สิทธิ์ตาม role แบบจำลอง** ยังไม่มีหลังบ้านจริง และยังไม่มีเนื้อหาของแต่ละโมดูล (หน้าหลังล็อกอินเป็น placeholder)

## คำสั่ง

```bash
npm install
npm run dev     # เปิดเซิร์ฟเวอร์พัฒนา
npm test        # vitest (jsdom)
npm run build   # tsc + vite build
npm run lint    # oxlint
```

## โครงสร้าง

```
src/
  app/         router, AppShell, Sidebar, UserMenu, roles.ts (เมนูของแต่ละ role)
  auth/        AuthApi (interface), localAuthApi (ตัวจำลอง), AuthProvider/useAuth, guards
  features/    หน้าของแต่ละโมดูล (ตอนนี้มี auth/ = login+สมัคร, PlaceholderPage, NotFoundPage)
  components/  Button, StatusBadge, KpiCard, FormField, DataTable, Modal, LanguageToggle
  i18n/        config + th.json / en.json
  styles/      index.css (Tailwind + design tokens ใน @theme)
```

- Design tokens มาจาก `DESIGN.md` ของ Juristic Core และอยู่ที่ `src/styles/index.css` ที่เดียว
- ฟอนต์ self-host ด้วย `@fontsource` (Plus Jakarta Sans, Noto Sans Thai, Material Symbols) ไม่พึ่ง CDN
- ตัวเลขเงิน/รหัสห้อง/มิเตอร์ใช้คลาส `tabular-nums`

## เพิ่มหน้าหรือเมนูใหม่ของ role

1. เพิ่มรายการใน `NAV_BY_ROLE` ที่ `src/app/roles.ts` (`key`, `path` ขึ้นต้นด้วย `/<role>/`, `icon`)
2. เพิ่มป้ายชื่อ `nav.<key>` ใน `src/i18n/th.json` และ `en.json` (เทสจะ fail ถ้าขาดภาษาใดภาษาหนึ่ง)
3. เปลี่ยน element ของ route นั้นใน `src/app/router.tsx` จาก `PlaceholderPage` เป็นหน้าจริง

## ข้อความ (i18n)

ห้ามฝังข้อความ UI ในโค้ด ใช้ `useTranslation()` และ `t('กลุ่ม.คีย์')` ภาษาเริ่มต้นคือไทย ค่าที่ผู้ใช้เลือกเก็บใน localStorage คีย์ `condo:lang`

## ระบบ login (แบบจำลอง)

ไม่มีหลังบ้าน ข้อมูลทั้งหมดอยู่ใน localStorage ของเบราว์เซอร์ (`condo:users`, `condo:session`)

- **บัญชีทดลอง** (รหัสผ่านทุกบัญชี `demo1234`): `tenant01` ผู้เช่า, `staff01` นิติบุคคล, `tech01` ช่าง หน้า login มีปุ่มกรอกให้
- **สมัครสมาชิก** ได้เฉพาะผู้เช่า (`/register`) ตาม FR1; บัญชีนิติบุคคลและช่างมีแค่บัญชีทดลอง
- **สิทธิ์:** ยังไม่ล็อกอินจะถูกพาไป `/login`; เข้า URL ของ role อื่นจะถูกพากลับหน้าแรกของ role ตัวเอง
- รหัสผ่านเก็บเป็น hash SHA-256 ไม่เก็บ plain text แต่ localStorage แก้ได้เองในเบราว์เซอร์
- **ตัวจำลองนี้ไม่ปลอดภัยจริงและไม่ตรง NFR1 (PDPA/การเข้ารหัส)** ใช้เพื่อพัฒนาหน้าจอเท่านั้น

### เปลี่ยนเป็นหลังบ้านจริง

หน้าจอทั้งหมดเรียกผ่าน `useAuth()` ซึ่งอ่านจาก `AuthApi` (`src/auth/types.ts`: `register`, `login`, `logout`, `currentUser`) ถ้ามีหลังบ้านให้เขียน `AuthApi` ตัวใหม่ที่เรียก HTTP แล้วส่งให้ `<AuthProvider api={...}>` ที่ `src/App.tsx` แล้วลบ `localAuthApi.ts`, `demoAccounts.ts` และแผง "บัญชีทดลอง" ใน `LoginPage.tsx`

### ในเทส

`renderApp(path, { as: 'tenant' })` จาก `src/test/renderApp.tsx` เรนเดอร์ทั้งแอปที่ path นั้นโดยล็อกอินเป็น role ที่ระบุไว้แล้ว (หรือไม่ล็อกอินถ้าไม่ส่ง `as`)

## หมายเหตุ

- เอกสารออกแบบและแผนงานอยู่ที่ `docs/superpowers/`
