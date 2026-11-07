interface Props {
  label: string
  value: string
  delta?: { text: string; trend: 'up' | 'down' | 'flat' }
}

const ARROWS = { up: 'arrow_upward', down: 'arrow_downward', flat: 'remove' } as const

export default function KpiCard({ label, value, delta }: Props) {
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-4 shadow-[0_1px_3px_0_rgba(15,41,66,0.04)]">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="mt-1 text-[28px] font-bold leading-9 tabular-nums text-primary-container">{value}</p>
      {delta && (
        <p data-testid="kpi-delta" className="mt-2 flex items-center gap-1 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            {ARROWS[delta.trend]}
          </span>
          <span>{delta.text}</span>
        </p>
      )}
    </div>
  )
}
