import type { Photo } from './types'

export const PHOTO_MAX_SIDE = 300
export const PHOTO_QUALITY = 0.7

/** Turns a chosen file into the small photo that is stored. Injectable so tests need no real canvas. */
export type PhotoProcessor = (file: File) => Promise<Photo>

/** The size that fits the longest side into `max` pixels, never enlarging and never below 1px. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const unsupported = () => new Error('photo_unsupported')

export const processPhoto: PhotoProcessor = async (file) => {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw unsupported()
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw unsupported()
    context.fillStyle = '#ffffff' // JPEG has no transparency: a transparent PNG would turn black
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
    if (!dataUrl.startsWith('data:image/jpeg')) throw unsupported()
    return { name: file.name, dataUrl }
  } finally {
    bitmap.close?.()
  }
}
