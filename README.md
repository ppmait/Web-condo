# Condo Management (frontend)

โครงหน้าบ้านของระบบบริหารคอนโด/นิติบุคคล: React + Vite + TypeScript + Tailwind v4

สถานะ: **โครงพื้นฐานเท่านั้น** ยังไม่มีหลังบ้าน, login จริง หรือเนื้อหาของแต่ละโมดูล (ทุกหน้าเป็น placeholder)

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
  app/         router, AppShell, Sidebar, RoleSwitcher, roles.ts (เมนูของแต่ละ role)
  features/    หน้าของแต่ละโมดูล (ตอนนี้มี PlaceholderPage, NotFoundPage)
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

## หมายเหตุ

- **Role switcher ใน header เป็นของชั่วคราว** role มาจาก prefix ของ URL (`/tenant`, `/juristic`, `/technician`) ต้องแทนด้วยระบบ login/RBAC จริงเมื่อทำหลังบ้าน
- เอกสารออกแบบและแผนงานอยู่ที่ `docs/superpowers/`
