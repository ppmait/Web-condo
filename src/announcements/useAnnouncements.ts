import { useContext } from 'react'
import { AnnouncementsContext, type AnnouncementsContextValue } from './AnnouncementsContext'

export function useAnnouncements(): AnnouncementsContextValue {
  const ctx = useContext(AnnouncementsContext)
  if (!ctx) throw new Error('useAnnouncements must be used inside <AnnouncementsProvider>')
  return ctx
}
