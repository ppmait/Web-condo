import { useFacilities } from '../facilities/useFacilities'

/** Test-only marker that appears once the FacilitiesProvider has loaded the data. */
export default function FacilitiesReadyProbe() {
  const { status } = useFacilities()
  return status === 'ready' ? <span data-testid="facilities-ready" hidden /> : null
}
