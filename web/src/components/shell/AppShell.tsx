import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Stepper } from './Stepper'
import { PATHS, PHASES } from '@/routes/paths'

export function AppShell() {
  const { pathname } = useLocation()
  const isPhase = PHASES.some((p) => pathname.startsWith(PATHS[p]))

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      {isPhase && <Stepper />}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
