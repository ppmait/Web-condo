# Condo Management — Frontend Foundation Design

วันที่: 2026-11-08
แหล่งอ้างอิง: `stitch_condominium_management_system.zip` (SRS, `DESIGN.md`, ภาพร่าง 14 หน้า)

## 1. เป้าหมาย

สร้างโครงหน้าบ้านของระบบบริหารคอนโด/นิติบุคคลให้พร้อมต่อยอดทีละโมดูล โดยแก้ปัญหาที่พบในภาพร่าง: Tailwind CDN, ไม่มีฟอนต์ไทย, shell ซ้ำทุกหน้า, token สีไม่ตรงกัน, ปุ่ม TH/EN ไม่ทำงาน

เกณฑ์ความสำเร็จ:
- `npm run dev` เปิดแล้วเห็น shell (sidebar + header) ของแต่ละ role พร้อมหน้า placeholder
- กดปุ่ม TH/EN แล้วข้อความใน shell เปลี่ยนภาษาจริง และจำค่าที่เลือก
- ข้อความไทยแสดงด้วย Noto Sans Thai ทุกเครื่อง ตัวเลขเงิน/รหัสห้องใช้ tabular figures
- `npm test` และ `npm run build` ผ่าน

## 2. ขอบเขต

**ทำ:** โครงโปรเจกต์, design tokens, ฟอนต์, layout กลาง, router ตาม role, i18n th/en, ชุด UI component พื้นฐาน, ตั้ง lint/test

**ไม่ทำรอบนี้:** หลังบ้าน/ฐานข้อมูล, login/register/RBAC จริง, เนื้อหาของแต่ละโมดูล (บิล, แจ้งซ่อม, พัสดุ ฯลฯ), PWA/push, แอป native

## 3. การตัดสินใจ

| หัวข้อ | ตัดสินใจ |
|---|---|
| ที่อยู่โปรเจกต์ | `/Users/macbook/project/condo-management` repo แยก |
| Stack | React + Vite + TypeScript |
| CSS | Tailwind v4 ผ่าน npm (`@tailwindcss/vite`) tokens อยู่ใน CSS `@theme` ไฟล์เดียว |
| ฟอนต์ | Plus Jakarta Sans + Noto Sans Thai แบบ self-host ด้วย `@fontsource` (ไม่พึ่ง Google CDN) stack: `'Plus Jakarta Sans', 'Noto Sans Thai', sans-serif` |
| ไอคอน | Material Symbols Outlined แบบ self-host (ตามภาพร่าง) |
| Router | React Router |
| i18n | react-i18next, ไฟล์ `th.json` / `en.json`, ค่าเริ่มต้นไทย, เก็บภาษาที่เลือกใน localStorage |
| ทดสอบ | Vitest + jsdom + React Testing Library (เหมือนโปรเจกต์ save-my-money) |

**Ruling เรื่อง token:** `DESIGN.md` ขัดกันเอง (primary frontmatter `#001428` แต่เนื้อหาเขียน `#0F2942`) และไฟล์ภาพร่างมี 2 ชุดค่า ใช้ **ค่าใน frontmatter ของ `DESIGN.md`** เป็นหลัก (ตรงกับ 10 จาก 14 ไฟล์) แล้วกำหนด `#0F2942` เป็น `primary-container` ซึ่งเป็นสีที่ปุ่มหลักใช้ตามเนื้อหา ถ้าผิดแก้ที่ไฟล์เดียว

## 4. โครงสร้าง

```
src/
  app/        router, providers, main layout (AppShell)
  features/   tenant/ juristic/ technician/  (placeholder pages ต่อ role)
  components/ ui พื้นฐาน: Button, StatusBadge, KpiCard, DataTable, Modal, FormField
  i18n/       config, th.json, en.json
  styles/     index.css (@theme tokens, base, tabular-nums utility)
```

## 5. พฤติกรรม

- **Route:** `/tenant/*`, `/juristic/*`, `/technician/*` ใช้ `AppShell` ตัวเดียว เมนู sidebar มาจาก config ของ role
- **Role (ชั่วคราว):** ยังไม่มี auth ใช้ตัวสลับ role แบบ dev ใน header เก็บใน state/localStorage จะถูกแทนที่เมื่อทำระบบ login
- **เมนูต่อ role** ตาม SRS: ผู้เช่า (ภาพรวมห้อง, บิล, พัสดุ, แจ้งซ่อม, จองส่วนกลาง, ประกาศ), นิติบุคคล (แดชบอร์ด, ห้อง/สัญญา, บิลน้ำไฟ, งานซ่อม, พัสดุ/จอง, ประกาศ, รายงาน), ช่าง (งานของฉัน)
- **Responsive:** ตาม `DESIGN.md`: desktop sidebar 240px, tablet 64px icon bar, mobile ใช้เมนูแบบเลื่อนเปิด
- **Component:** สี/ขนาด/radius ตามหัวข้อ Components ของ `DESIGN.md`, status badge เป็น pill และมีข้อความกำกับ ไม่พึ่งสีอย่างเดียว

## 6. การทดสอบ

- i18n: สลับภาษาแล้วข้อความ shell เปลี่ยน, จำค่าหลังโหลดใหม่
- Router/shell: แต่ละ role เห็นเมนูของตัวเอง, route ที่ไม่มีไป placeholder/404
- Component: Button, StatusBadge (ข้อความ + variant), KpiCard, DataTable (คอลัมน์ตัวเลขชิดขวา + tabular-nums)
- Build ผ่าน

## 7. ความเสี่ยง

- ภาพร่างไม่ใช่ source of truth ของพฤติกรรม ใช้อ้างอิงหน้าตาเท่านั้น
- ภาพร่าง 3 หน้าไม่มี screenshot และมี portal 2 เวอร์ชัน ยังไม่ตัดสินว่าหน้าไหนเป็นหลัก ไม่กระทบรอบนี้เพราะยังไม่ทำเนื้อหาโมดูล
- Role switcher ชั่วคราวต้องถูกลบเมื่อทำ auth
