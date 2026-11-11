import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { PropertyProvider } from '../property/PropertyProvider'
import { BillingProvider } from '../billing/BillingProvider'
import { FacilitiesProvider } from '../facilities/FacilitiesProvider'
import { MaintenanceProvider } from '../maintenance/MaintenanceProvider'
import { AnnouncementsProvider } from '../announcements/AnnouncementsProvider'
import LanguageToggle from '../components/LanguageToggle'
import NotificationBell from './NotificationBell'
import Sidebar from './Sidebar'
import UserMenu from './UserMenu'

export default function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const role = user?.role ?? null
  // any route change closes the drawer (adjusting state during render, not in an effect)
  const [drawer, setDrawer] = useState({ open: false, pathname })
  if (drawer.pathname !== pathname) setDrawer({ open: false, pathname })
  const drawerOpen = drawer.open
  const closeDrawer = () => setDrawer({ open: false, pathname })

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer((d) => ({ ...d, open: false }))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <PropertyProvider>
      <BillingProvider>
        <MaintenanceProvider>
          <FacilitiesProvider>
            <AnnouncementsProvider>
            <div className="min-h-screen bg-surface md:flex">
            {drawerOpen && (
              <div
                data-testid="drawer-backdrop"
                className="fixed inset-0 z-30 bg-[#0f2942]/40 md:hidden"
                onClick={closeDrawer}
              />
            )}
            <Sidebar role={role} open={drawerOpen} onNavigate={closeDrawer} />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-[#e2e8f0] bg-surface-container-lowest px-4">
                {role && (
                  <button
                    type="button"
                    aria-label={t('shell.menu')}
                    aria-expanded={drawerOpen}
                    aria-controls="app-sidebar"
                    onClick={() => setDrawer({ open: !drawerOpen, pathname })}
                    className="rounded p-1 text-primary-container hover:bg-surface-container-low md:hidden"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {drawerOpen ? 'close' : 'menu'}
                    </span>
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate font-semibold text-primary-container">
                  {t('common.appName')}
                </span>
                <div data-testid="header-actions" className="flex shrink-0 items-center gap-2">
                  <NotificationBell />
                  <LanguageToggle />
                  <UserMenu />
                </div>
              </header>
              <main className="min-w-0 flex-1 p-4 md:p-8">
                <Outlet />
              </main>
            </div>
          </div>
        </AnnouncementsProvider>
      </FacilitiesProvider>
    </MaintenanceProvider>
  </BillingProvider>
</PropertyProvider>
  )
}
