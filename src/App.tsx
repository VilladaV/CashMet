import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { logout } from '@/lib/firebase/auth'
import ChatPage from './features/chat/ChatPage'
import CalendarioPage from './features/calendario/CalendarioPage'
import DashboardPage from './features/dashboard/DashboardPage'
import CuentasPage from './features/cuentas/CuentasPage'
import DeudasPage from './features/deudas/DeudasPage'
import VehiculosPage from './features/vehiculos/VehiculosPage'
import PropiedadesPage from './features/propiedades/PropiedadesPage'
import NominaPage from './features/nomina/NominaPage'
import RecurrentesPage from './features/recurrentes/RecurrentesPage'

type Tab =
  | 'chat'
  | 'dashboard'
  | 'cuentas'
  | 'calendario'
  | 'deudas'
  | 'vehiculos'
  | 'propiedades'
  | 'nomina'
  | 'recurrentes'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'chat', label: 'Chat IA' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'deudas', label: 'Deudas' },
  { id: 'vehiculos', label: 'Vehículos' },
  { id: 'propiedades', label: 'Propiedades' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'recurrentes', label: 'Recurrentes' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')

  const cambiar = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto max-w-4xl flex items-center justify-between p-3 gap-2">
          <div className="font-semibold shrink-0">CashMet</div>
          <div className="flex items-center gap-1 overflow-x-auto flex-nowrap">
            {TABS.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? 'default' : 'ghost'}
                onClick={() => cambiar(t.id)}
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
        {tab === 'deudas' && <DeudasPage />}
        {tab === 'vehiculos' && <VehiculosPage />}
        {tab === 'propiedades' && <PropiedadesPage />}
        {tab === 'nomina' && <NominaPage />}
        {tab === 'recurrentes' && <RecurrentesPage />}
      </main>
    </div>
  )
}