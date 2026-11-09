import { useTranslation } from 'react-i18next'
import { formatBaht } from '../../lib/format'

const SIZE = 21

/** A fixed, deterministic pattern: three finder squares plus a scattering of cells. It is a picture, not a code. */
const CELLS: [number, number][] = (() => {
  const cells: [number, number][] = []
  const finder = (x0: number, y0: number) => {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || j === 0 || i === 6 || j === 6
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4
        if (edge || core) cells.push([x0 + i, y0 + j])
      }
  }
  finder(0, 0)
  finder(SIZE - 7, 0)
  finder(0, SIZE - 7)
  let seed = 7
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= SIZE - 8 && y < 8) || (x < 8 && y >= SIZE - 8)
      seed = (seed * 31 + 11) % 97
      if (!inFinder && seed % 3 === 0) cells.push([x, y])
    }
  return cells
})()

interface Props {
  amount: number
  invoiceNumber: string
}

export default function SampleQr({ amount, invoiceNumber }: Props) {
  const { t } = useTranslation()
  return (
    <figure className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#cbd5e1] p-4 text-center">
      <svg role="img" aria-label={t('billing.qr.alt')} viewBox={`-1 -1 ${SIZE + 2} ${SIZE + 2}`} className="h-40 w-40 bg-white">
        {CELLS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0f2942" />
        ))}
      </svg>
      <figcaption className="text-sm">
        <p className="font-semibold tabular-nums text-primary-container">{formatBaht(amount)}</p>
        <p className="text-on-surface-variant">{t('billing.qr.reference', { number: invoiceNumber })}</p>
        <p className="mt-1 text-xs font-medium text-[#b45309]">{t('billing.qr.sample')}</p>
      </figcaption>
    </figure>
  )
}
