import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { logout } from '@/lib/firebase/auth'
import CashMetLogo from '@/components/brand/CashMetLogo'
import ChatPage from './features/chat/ChatPage'
import CalendarioPage from './features/calendario/CalendarioPage'
import DashboardPage from './features/dashboard/DashboardPage'
import CuentasPage from './features/cuentas/CuentasPage'
import DeudasPage from './features/deudas/DeudasPage'
import VehiculosPage from './features/vehiculos/VehiculosPage'
import PropiedadesPage from './features/propiedades/PropiedadesPage'
import NominaPage from './features/nomina/NominaPage'
import RecurrentesPage from './features/recurrentes/RecurrentesPage'
import BackupPage from './features/backup/BackupPage'
import ImpuestosPage from './features/impuestos/ImpuestosPage'
import {
  MessageSquare,
  LayoutDashboard,
  Calendar,
  Wallet,
  CreditCard,
  Car,
  Building2,
  Users,
  Repeat,
  Receipt,
  Database,
  LogOut,
  SlidersHorizontal,
  X,
} from 'lucide-react'

export type Tab =
  | 'chat'
  | 'dashboard'
  | 'calendario'
  | 'cuentas'
  | 'deudas'
  | 'vehiculos'
  | 'propiedades'
  | 'nomina'
  | 'recurrentes'
  | 'impuestos'
  | 'backup'

interface TabDef {
  id: Tab
  label: string
  icon: typeof MessageSquare
  category: 'primary' | 'gestion'
  badge?: string
}

const TABS: TabDef[] = [
  { id: 'chat', label: 'Chat IA', icon: MessageSquare, category: 'primary', badge: 'Auto' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'primary' },
  { id: 'calendario', label: 'Calendario', icon: Calendar, category: 'primary' },
  { id: 'cuentas', label: 'Cuentas', icon: Wallet, category: 'gestion' },
  { id: 'deudas', label: 'Deudas', icon: CreditCard, category: 'gestion' },
  { id: 'vehiculos', label: 'Vehículos', icon: Car, category: 'gestion' },
  { id: 'propiedades', label: 'Propiedades', icon: Building2, category: 'gestion' },
  { id: 'nomina', label: 'Nómina', icon: Users, category: 'gestion' },
  { id: 'recurrentes', label: 'Recurrentes', icon: Repeat, category: 'gestion' },
  { id: 'impuestos', label: 'Impuestos', icon: Receipt, category: 'gestion' },
  { id: 'backup', label: 'Backup', icon: Database, category: 'gestion' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [menuGestionAbierto, setMenuGestionAbierto] = useState(false)

  const cambiar = (t: Tab) => {
    setTab(t)
    setMenuGestionAbierto(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const primaryTabs = TABS.filter((t) => t.category === 'primary')
  const gestionTabs = TABS.filter((t) => t.category === 'gestion')
  const tabActual = TABS.find((t) => t.id === tab)
  const esGestionActual = gestionTabs.some((t) => t.id === tab)

  return (
    <div className="min-h-screen bg-mesh-pattern flex flex-col font-sans text-slate-900 pb-20 md:pb-8">
      {/* HEADER PRINCIPAL */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="container mx-auto max-w-5xl flex items-center justify-between px-4 py-2.5">
          {/* Logo con marca */}
          <div className="cursor-pointer" onClick={() => cambiar('chat')}>
            <CashMetLogo size="md" showText={true} showSubtitle={true} />
          </div>

          {/* Indicador en vivo + Salir */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-live" />
              <span>COP · En vivo</span>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2.5 text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
              onClick={() => logout()}
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>

        {/* BARRA DE NAVEGACIÓN DESKTOP & TABLET */}
        <div className="border-t border-slate-100 bg-slate-50/70 hidden md:block">
          <div className="container mx-auto max-w-5xl flex items-center justify-between px-4 py-1.5">
            {/* Pestañas Principales (Chat, Dashboard, Calendario) */}
            <div className="flex items-center gap-1">
              {primaryTabs.map((t) => {
                const Icon = t.icon
                const activo = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => cambiar(t.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activo
                        ? 'gradient-brand-navy text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${activo ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>{t.label}</span>
                    {t.badge && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        activo ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Pestañas de Gestión (Sub-menú segmentado con pills) */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mr-1">
                Gestión:
              </span>
              {gestionTabs.map((t) => {
                const Icon = t.icon
                const activo = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => cambiar(t.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      activo
                        ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Icon className={`w-3 h-3 ${activo ? 'text-white' : 'text-slate-600'}`} />
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {/* TITULO DE SECCIÓN EN MÓVIL SI ESTÁ EN GESTIÓN */}
      {esGestionActual && (
        <div className="md:hidden bg-emerald-50/80 border-b border-emerald-200/80 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
            {tabActual && <tabActual.icon className="w-3.5 h-3.5 text-emerald-600" />}
            <span>Gestión · {tabActual?.label}</span>
          </div>
          <button
            onClick={() => setMenuGestionAbierto(true)}
            className="text-[11px] font-medium text-emerald-700 underline"
          >
            Cambiar módulo
          </button>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full">
        {tab === 'chat' && <ChatPage />}
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'calendario' && <CalendarioPage />}
        {tab === 'cuentas' && <CuentasPage />}
        {tab === 'deudas' && <DeudasPage />}
        {tab === 'vehiculos' && <VehiculosPage />}
        {tab === 'propiedades' && <PropiedadesPage />}
        {tab === 'nomina' && <NominaPage />}
        {tab === 'recurrentes' && <RecurrentesPage />}
        {tab === 'impuestos' && <ImpuestosPage />}
        {tab === 'backup' && <BackupPage />}
      </main>

      {/* DOCK INFERIOR PARA MÓVIL (PWA MOBILE EXPERIENCE) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-3 py-1.5 shadow-lg flex items-center justify-around">
        {primaryTabs.map((t) => {
          const Icon = t.icon
          const activo = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => cambiar(t.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-semibold transition-all ${
                activo ? 'text-[#0A2540]' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <div
                className={`p-1.5 rounded-lg transition-all ${
                  activo ? 'bg-[#0A2540] text-emerald-400 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="mt-0.5">{t.label}</span>
            </button>
          )
        })}

        {/* Botón Gestión en Móvil */}
        <button
          onClick={() => setMenuGestionAbierto(true)}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-semibold transition-all ${
            esGestionActual ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <div
            className={`p-1.5 rounded-lg transition-all ${
              esGestionActual ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <span className="mt-0.5">Gestión</span>
        </button>
      </nav>

      {/* MODAL / SHEET RÁPIDO DE GESTIÓN EN MÓVIL */}
      {menuGestionAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-bottom-6">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                <span>Módulos de Gestión Financiera</span>
              </div>
              <button
                onClick={() => setMenuGestionAbierto(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {gestionTabs.map((t) => {
                const Icon = t.icon
                const activo = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => cambiar(t.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left font-semibold transition-all ${
                      activo
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-2xs'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${activo ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}