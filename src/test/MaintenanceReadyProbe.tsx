import { useMaintenance } from '../maintenance/useMaintenance'

/** Test-only marker that appears once the MaintenanceProvider has loaded the data. */
export default function MaintenanceReadyProbe() {
  const { status } = useMaintenance()
  return status === 'ready' ? <span data-testid="maintenance-ready" hidden /> : null
}
