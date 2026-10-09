import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { logout } from '@/lib/firebase/auth'
import ChatPage from './features/chat/ChatPage'
import CalendarioPage from './features/calendario/CalendarioPage'
import DashboardPage from './features/dashboard/DashboardPage'
import CuentasPage from './features/cuentas/CuentasPage'

type Tab = 'chat' | 'calendario' | 'dashboard' | 'cuentas'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'chat', label: 'Chat IA' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'calendario', label: 'Calendario' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto max-w-4xl flex items-center justify-between p-3">
          <div className="font-semibold">CashMet</div>
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? 'default' : 'ghost'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => logout()}>
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main>
        {tab === 'chat' && <ChatPage />}
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'cuentas' && <CuentasPage />}
        {tab === 'calendario' && <CalendarioPage />}
      </main>
    </div>
  )
}
