import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import type { PhotoProcessor } from '../../maintenance/photos'
import { MaintenanceError } from '../../maintenance/types'
import { renderMaintenance } from '../../test/renderMaintenance'
import { fakePhoto, makeTestMaintenance } from '../../test/testMaintenance'
import RequestFormModal from './RequestFormModal'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const MB10 = 10 * 1024 * 1024
const file = (name = 'a.jpg', type = 'image/jpeg', size = 1000) => new File([new Uint8Array(size)], name, { type })
const setup = () => userEvent.setup({ applyAccept: false })

async function open(processor?: PhotoProcessor) {
  const { maintenance, property } = makeTestMaintenance()
  const onClose = vi.fn()
  const p = processor ?? vi.fn<PhotoProcessor>(async (f) => fakePhoto(f.name))
  await renderMaintenance(<RequestFormModal processor={p} onClose={onClose} />, { api: maintenance, property, as: 'tenant' })
  return { api: maintenance, onClose, processor: p, dialog: screen.getByRole('dialog') }
}

const fields = (dialog: HTMLElement) => ({
  category: within(dialog).getByLabelText('หมวดหมู่'),
  title: within(dialog).getByLabelText('หัวข้อ'),
  description: within(dialog).getByLabelText('รายละเอียด'),
  photos: within(dialog).getByLabelText(/รูปภาพประกอบ/),
  submit: within(dialog).getByRole('button', { name: 'ส่งแจ้งซ่อม' }),
})

async function fill(user: ReturnType<typeof setup>, dialog: HTMLElement, over: { photos?: File[] } = {}) {
  const f = fields(dialog)
  await user.selectOptions(f.category, 'plumbing')
  await user.type(f.title, '  ก๊อกน้ำรั่ว  ')
  await user.type(f.description, 'น้ำหยดตลอดเวลา')
  const photos = over.photos ?? [file('a.jpg'), file('b.png', 'image/png')]
  if (photos.length) await user.upload(f.photos, photos)
}

describe('RequestFormModal: checking before sending', () => {
  it('sends nothing when the form is empty: the required message, every field marked, focus on the first', async () => {
    const user = setup()
    const { api, dialog } = await open()
    const create = vi.spyOn(api, 'createRequest')
    await user.click(fields(dialog).submit)
    expect(create).not.toHaveBeenCalled()
    expect(within(dialog).getByText('กรุณากรอกข้อมูลและแนบรูปภาพประกอบให้ครบถ้วน')).toBeInTheDocument()
    expect(dialog.querySelectorAll('[aria-invalid="true"]')).toHaveLength(4)
    expect(fields(dialog).category).toHaveFocus()
  })

  it('needs a photo: everything else filled in, the message is under the photo field and the focus is there', async () => {
    const user = setup()
    const { api, dialog } = await open()
    const create = vi.spyOn(api, 'createRequest')
    await fill(user, dialog, { photos: [] })
    await user.click(fields(dialog).submit)
    expect(create).not.toHaveBeenCalled()
    expect(fields(dialog).photos).toHaveAttribute('aria-invalid', 'true')
    expect(fields(dialog).photos).toHaveFocus()
    expect(within(dialog).getByText('กรุณาแนบรูปภาพประกอบอย่างน้อย 1 รูป (ไม่เกิน 3 รูป)')).toBeInTheDocument()
  })

  it('clears a field error as soon as that field is edited', async () => {
    const user = setup()
    const { dialog } = await open()
    await user.click(fields(dialog).submit)
    await user.type(fields(dialog).title, 'ก')
    expect(fields(dialog).title).not.toHaveAttribute('aria-invalid', 'true')
  })
})

describe('RequestFormModal: choosing photos', () => {
  it.each([
    ['a gif', file('a.gif', 'image/gif')],
    ['a pdf', file('a.pdf', 'application/pdf')],
    ['a file over 10 MB', file('big.jpg', 'image/jpeg', MB10 + 1)],
  ])('refuses %s with a message under the field, without processing it', async (_name, bad) => {
    const user = setup()
    const { dialog, processor } = await open()
    await user.upload(fields(dialog).photos, bad)
    expect(within(dialog).getByText('รูปภาพต้องเป็นไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB')).toBeInTheDocument()
    expect(processor).not.toHaveBeenCalled()
    expect(within(dialog).queryAllByRole('img')).toHaveLength(0)
  })

  it('takes a file of exactly 10 MB', async () => {
    const user = setup()
    const { dialog, processor } = await open()
    await user.upload(fields(dialog).photos, file('edge.jpg', 'image/jpeg', MB10))
    await within(dialog).findByRole('img', { name: 'edge.jpg' })
    expect(processor).toHaveBeenCalledTimes(1)
  })

  it('shows a preview of each photo and lets one be removed, making room for another', async () => {
    const user = setup()
    const { dialog } = await open()
    await user.upload(fields(dialog).photos, [file('a.jpg'), file('b.jpg'), file('c.jpg')])
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(3))
    await user.click(within(dialog).getByRole('button', { name: 'ลบรูป b.jpg' }))
    expect(within(dialog).getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['a.jpg', 'c.jpg'])
    await user.upload(fields(dialog).photos, file('d.jpg'))
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(3))
  })

  it('keeps at most three: extra files are dropped with a message', async () => {
    const user = setup()
    const { dialog, processor } = await open()
    await user.upload(fields(dialog).photos, [file('1.jpg'), file('2.jpg'), file('3.jpg'), file('4.jpg')])
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(3))
    expect(processor).toHaveBeenCalledTimes(3)
    expect(within(dialog).getByText('แนบได้ไม่เกิน 3 รูป')).toBeInTheDocument()
    await user.upload(fields(dialog).photos, file('5.jpg'))
    expect(within(dialog).getAllByRole('img')).toHaveLength(3)
    expect(processor).toHaveBeenCalledTimes(3)
  })

  it('says so when a file cannot be decoded, and adds nothing', async () => {
    const user = setup()
    const failing = vi.fn<PhotoProcessor>(async () => Promise.reject(new Error('photo_unsupported')))
    const { dialog } = await open(failing)
    await user.upload(fields(dialog).photos, file('odd.jpg'))
    expect(await within(dialog).findByText('ไม่รองรับไฟล์ odd.jpg ลองใช้ไฟล์ JPG หรือ PNG')).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('img')).toHaveLength(0)
  })
})

describe('RequestFormModal: sending', () => {
  it('sends a complete request once, with the processed photos and who is asking, then closes', async () => {
    const user = setup()
    const { api, dialog, onClose } = await open()
    const create = vi.spyOn(api, 'createRequest')
    await fill(user, dialog)
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(2))
    await user.click(fields(dialog).submit)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      category: 'plumbing',
      title: '  ก๊อกน้ำรั่ว  ',
      description: 'น้ำหยดตลอดเวลา',
      photos: [fakePhoto('a.jpg'), fakePhoto('b.png')],
      tenantPhone: DEMO_TENANT_PHONE,
      tenantName: 'สมชาย ผู้เช่า',
    })
    const created = (await api.load()).requests.at(-1)!
    expect(created).toMatchObject({ title: 'ก๊อกน้ำรั่ว', status: 'waiting', tenantPhone: DEMO_TENANT_PHONE })
  })

  it('calls the api once when send is pressed twice quickly, and disables the button meanwhile', async () => {
    const user = setup()
    const { api, dialog, onClose } = await open()
    const original = api.createRequest.bind(api)
    let release!: () => void
    const create = vi.spyOn(api, 'createRequest').mockImplementation((i) => new Promise((resolve) => (release = () => resolve(original(i)))))
    await fill(user, dialog)
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(2))
    await user.click(fields(dialog).submit)
    await user.click(fields(dialog).submit)
    expect(create).toHaveBeenCalledTimes(1)
    expect(fields(dialog).submit).toBeDisabled()
    release()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['storage_failed', 'บันทึกไม่ได้เพราะพื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม ลองลดจำนวนรูปหรือลบข้อมูลเก่า'],
    ['no_lease', 'บัญชีนี้ยังไม่มีสัญญาเช่าที่ใช้งานอยู่ จึงแจ้งซ่อมไม่ได้'],
  ] as const)('shows the message for %s, keeps what was typed and stays open', async (code, text) => {
    const user = setup()
    const { api, dialog, onClose } = await open()
    vi.spyOn(api, 'createRequest').mockRejectedValueOnce(new MaintenanceError(code))
    await fill(user, dialog)
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(2))
    await user.click(fields(dialog).submit)
    expect(await within(dialog).findByText(new RegExp(text))).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(fields(dialog).title).toHaveValue('  ก๊อกน้ำรั่ว  ')
    expect(within(dialog).getAllByRole('img')).toHaveLength(2)
    expect(fields(dialog).submit).toBeEnabled()
  })

  it('shows a general message for an unexpected failure, and lets the user try again', async () => {
    const user = setup()
    const { api, dialog, onClose } = await open()
    vi.spyOn(api, 'createRequest').mockRejectedValueOnce(new Error('boom'))
    await fill(user, dialog)
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(2))
    await user.click(fields(dialog).submit)
    expect(await within(dialog).findByText('ส่งแจ้งซ่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
    await user.click(fields(dialog).submit)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    await open()
    expect(screen.getByRole('dialog', { name: 'New repair request' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument()
  })
})
