import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitWithin, processPhoto } from './photos'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fitWithin', () => {
  it.each([
    [600, 400, 300, 200],
    [400, 600, 200, 300],
    [300, 300, 300, 300],
    [3000, 3000, 300, 300],
    [200, 100, 200, 100], // smaller than the limit: never enlarged
    [301, 301, 300, 300],
    [1, 1000, 1, 300], // a thin picture keeps at least one pixel
  ])('fits %sx%s into %sx%s', (w, h, ew, eh) => {
    expect(fitWithin(w, h, 300)).toEqual({ width: ew, height: eh })
  })
})

describe('processPhoto', () => {
  const file = new File([new Uint8Array(10)], 'wall.png', { type: 'image/png' })

  function fakeCanvas(dataUrl = 'data:image/jpeg;base64,QUJD', context: object | null = {}) {
    const ctx = context === null ? null : { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), ...context }
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx), toDataURL: vi.fn(() => dataUrl) }
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => (tag === 'canvas' ? (canvas as unknown as HTMLElement) : original(tag)))
    return { canvas, ctx }
  }

  it('shrinks the longest side to 300px, keeps the proportions, paints white behind it and returns a JPEG data URL', async () => {
    const bitmap = { width: 1200, height: 800, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const { canvas, ctx } = fakeCanvas()
    const photo = await processPhoto(file)
    expect(photo).toEqual({ name: 'wall.png', dataUrl: 'data:image/jpeg;base64,QUJD' })
    expect([canvas.width, canvas.height]).toEqual([300, 200])
    expect(ctx!.fillRect).toHaveBeenCalledWith(0, 0, 300, 200)
    expect(ctx!.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 300, 200)
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('does not enlarge a small picture', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 50, close: vi.fn() })))
    const { canvas } = fakeCanvas()
    await processPhoto(file)
    expect([canvas.width, canvas.height]).toEqual([100, 50])
  })

  it('says the file is not supported when the browser cannot decode it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('decode'))))
    fakeCanvas()
    await expect(processPhoto(file)).rejects.toThrow('photo_unsupported')
  })

  it('says the file is not supported when there is no drawing context, or no JPEG comes out', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })))
    fakeCanvas('data:image/jpeg;base64,QUJD', null)
    await expect(processPhoto(file)).rejects.toThrow('photo_unsupported')
    vi.restoreAllMocks()
    fakeCanvas('data:,')
    await expect(processPhoto(file)).rejects.toThrow('photo_unsupported')
  })
})
