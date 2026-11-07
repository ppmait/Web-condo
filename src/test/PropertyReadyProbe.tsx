import { useProperty } from '../property/useProperty'

/** Test-only marker that appears once the PropertyProvider has loaded the data. */
export default function PropertyReadyProbe() {
  const { status } = useProperty()
  return status === 'ready' ? <span data-testid="property-ready" hidden /> : null
}
