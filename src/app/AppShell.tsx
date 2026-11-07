import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import LanguageToggle from '../components/LanguageToggle'
import RoleSwitcher from './RoleSwitcher'
import Sidebar from './Sidebar'
import { roleFromPath } from './roles'

export default function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const role = roleFromPath(pathname)
  // the drawer is open only for the route it was opened on, so a route change closes it
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const drawerOpen = openedAt === pathname
  const closeDrawer = () => setOpenedAt(null)

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenedAt(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-screen bg-surface md:flex">
      {drawerOpen && (
        <div
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-30 bg-[#0f2942]/40 md:hidden"
          onClick={closeDrawer}
        />
      )}
      <Sidebar role={role} open={drawerOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-[#e2e8f0] bg-surface-container-lowest px-4">
          {role && (
            <button
              type="button"
              aria-label={t('shell.menu')}
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
              onClick={() => setOpenedAt(drawerOpen ? null : pathname)}
              className="rounded p-1 text-primary-container hover:bg-surface-container-low md:hidden"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {drawerOpen ? 'close' : 'menu'}
              </span>
            </button>
          )}
          <span className="truncate font-semibold text-primary-container">{t('common.appName')}</span>
          <div className="ml-auto flex items-center gap-2">
            <RoleSwitcher role={role} />
            <LanguageToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
