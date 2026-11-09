import { useTranslation } from 'react-i18next'
import { formatBaht } from '../../lib/format'
import type { Invoice } from '../../billing/types'

/** Water, electricity and common fee lines with the net total, as the rules computed them. */
export default function InvoiceBreakdown({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const lines = [
    { key: 'water', calc: t('billing.detail.usage', { units: invoice.water.units, rate: invoice.water.rate }), amount: invoice.water.amount },
    { key: 'electric', calc: t('billing.detail.usage', { units: invoice.electric.units, rate: invoice.electric.rate }), amount: invoice.electric.amount },
    { key: 'common', calc: t('billing.detail.commonUsage', { area: invoice.common.areaSqm, rate: invoice.common.rate }), amount: invoice.common.amount },
  ]
  return (
    <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="h-9 border-b border-[#e2e8f0] bg-[#f8fafc] text-[11px] font-semibold text-[#64748b]">
            <th scope="col" className="px-3 text-left">{t('billing.columns.item')}</th>
            <th scope="col" className="px-3 text-left">{t('billing.columns.calculation')}</th>
            <th scope="col" className="px-3 text-right">{t('billing.columns.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className="h-10 border-b border-[#f1f5f9]">
              <td className="px-3">{t(`billing.detail.${line.key}`)}</td>
              <td className="px-3 tabular-nums text-on-surface-variant">{line.calc}</td>
              <td className="px-3 text-right tabular-nums">{formatBaht(line.amount)}</td>
            </tr>
          ))}
          <tr className="h-11 bg-[#f8fafc] font-semibold text-primary-container">
            <td className="px-3" colSpan={2}>{t('billing.detail.netTotal')}</td>
            <td className="px-3 text-right tabular-nums">{formatBaht(invoice.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
