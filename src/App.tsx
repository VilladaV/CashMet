import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
  Compass,
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

const SUBTITULO: Record<Tab, string> = {
  chat: 'Habla con Lucía, tu contadora',
  dashboard: 'Tu dinero de un vistazo',
  calendario: 'Vencimientos y recordatorios',
  cuentas: 'Dinero en bancos y efectivo',
  deudas: 'Créditos, tarjetas y préstamos',
  vehiculos: 'SOAT, técnico-mecánica y seguros',
  propiedades: 'Patrimonio e inmuebles',
  nomina: 'Equipo, salarios y primas',
  recurrentes: 'Gastos fijos automáticos',
  impuestos: 'Predial, vehicular y renta',
  backup: 'Respaldo de tu información',
}

function transicionar(aplicar: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
  if (typeof doc.startViewTransition === 'function') doc.startViewTransition(aplicar)
  else aplicar()
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [menuGestionAbierto, setMenuGestionAbierto] = useState(false)
  const [burbujas, setBurbujas] = useState(false)

  const cambiar = (t: Tab) => {
    setBurbujas(false)
    if (t === tab) {
      setMenuGestionAbierto(false)
      return
    }
    setMenuGestionAbierto(false)
    transicionar(() => {
      setTab(t)
      window.scrollTo({ top: 0 })
    })
  }

  const primaryTabs = TABS.filter((t) => t.category === 'primary')
  const gestionTabs = TABS.filter((t) => t.category === 'gestion')
  const tabActual = TABS.find((t) => t.id === tab)
  const esGestionActual = gestionTabs.some((t) => t.id === tab)

  return (
    <div className="min-h-screen bg-mesh-pattern font-sans text-mist-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="animate-drift absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-emerald-500/[0.07] blur-[130px]" />
        <div className="animate-drift absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-sky-500/[0.08] blur-[130px] [animation-delay:-8s]" />
      </div>

      {/* BARRA SUPERIOR FLOTANTE */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-night-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => cambiar('chat')} className="shrink-0 cursor-pointer md:hidden" title="Ir al chat">
              <CashMetLogo size="sm" showText={false} showSubtitle={false} variant="dark" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold tracking-tight text-white sm:text-base">
                {tabActual?.label}
              </h1>
              <p className="hidden truncate text-[11px] text-mist-500 sm:block">{SUBTITULO[tab]}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              <span className="animate-pulse-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>COP · En vivo</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2.5 text-xs text-mist-500 hover:bg-white/5 hover:text-red-300"
              onClick={() => logout()}
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <div className={`relative mx-auto flex max-w-[1500px] items-start gap-5 sm:px-6 md:pb-10 ${tab === 'chat' ? 'px-0 pb-0' : 'px-4 pb-24'}`}>
        {/* SIDEBAR ESCRITORIO */}
        <aside className="sticky top-14 hidden max-h-[calc(100dvh-76px)] w-60 shrink-0 flex-col overflow-y-auto py-5 pr-1 no-scrollbar md:flex xl:w-64">
          <button onClick={() => cambiar('chat')} className="mb-6 cursor-pointer px-2 text-left">
            <CashMetLogo size="md" showText={true} showSubtitle={true} variant="dark" />
          </button>

          <nav className="space-y-1">
            {primaryTabs.map((t) => {
              const Icon = t.icon
              const activo = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => cambiar(t.id)}
                  className={`relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                    activo ? 'text-white' : 'text-mist-500 hover:bg-white/[0.04] hover:text-mist-100'
                  }`}
                >
                  {activo && (
                    <motion.span
                      layoutId="nav-pill"
                      className="surface-glow absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/[0.22] to-sky-500/[0.1]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon className={`relative h-[18px] w-[18px] ${activo ? 'text-emerald-300' : 'text-mist-600'}`} />
                  <span className="relative">{t.label}</span>
                  {t.badge && (
                    <span className="relative ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black tracking-wide text-emerald-300">
                      {t.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="mb-2 mt-7 px-3 text-[10px] font-black tracking-[0.22em] text-mist-600 uppercase">
            Gestión
          </div>
          <nav className="space-y-0.5">
            {gestionTabs.map((t) => {
              const Icon = t.icon
              const activo = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => cambiar(t.id)}
                  className={`relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
                    activo ? 'text-white' : 'text-mist-500 hover:bg-white/[0.04] hover:text-mist-100'
                  }`}
                >
                  {activo && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-lg bg-white/[0.08]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon className={`relative h-4 w-4 ${activo ? 'text-emerald-300' : 'text-mist-600'}`} />
                  <span className="relative">{t.label}</span>
                  {activo && <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
              )
            })}
          </nav>

          <div className="mt-auto px-2 pt-8">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5">
              <div className="text-xs font-bold text-white">Lucía · IA contable</div>
              <p className="mt-1 text-[11px] leading-relaxed text-mist-500">
                Registra, convierte monedas y analiza tu estado real.
              </p>
              <button
                onClick={() => cambiar('chat')}
                className="mt-2.5 w-full cursor-pointer rounded-xl bg-emerald-400/15 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-400/25"
              >
                Hablar con Lucía
              </button>
            </div>
          </div>
        </aside>

        {/* CONTENIDO */}
        <main className={`min-w-0 flex-1 ${tab === 'chat' ? 'py-0 sm:py-5' : 'py-4 sm:py-5'}`}>
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
      </div>

      {/* DOCK MÓVIL (se oculta en el chat: ahí mandan las burbujas) */}
      <nav className={`fixed right-0 bottom-0 left-0 z-40 h-[68px] items-center justify-around border-t border-white/[0.07] bg-night-950/85 px-2 backdrop-blur-xl md:hidden ${tab === 'chat' ? 'hidden' : 'flex'}`}>
        {primaryTabs.map((t) => {
          const Icon = t.icon
          const activo = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => cambiar(t.id)}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl px-3 py-1 text-[10px] font-bold transition-colors ${
                activo ? 'text-white' : 'text-mist-600'
              }`}
            >
              <span className={`rounded-xl p-1.5 transition-all ${activo ? 'bg-emerald-400/20 text-emerald-300' : ''}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-0.5">{t.label}</span>
            </button>
          )
        })}
        <button
          onClick={() => setMenuGestionAbierto(true)}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl px-3 py-1 text-[10px] font-bold transition-colors ${
            esGestionActual ? 'text-emerald-300' : 'text-mist-600'
          }`}
        >
          <span className={`rounded-xl p-1.5 transition-all ${esGestionActual ? 'bg-emerald-400/20' : ''}`}>
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </span>
          <span className="mt-0.5">Gestión</span>
        </button>
      </nav>

      {/* BURBUJAS MÓVILES DEL CHAT */}
      {tab === 'chat' && (
        <div className="fixed right-3 bottom-5 z-40 flex flex-col items-end gap-2 md:hidden">
          <AnimatePresence>
            {burbujas && (
              <>
                {[
                  { id: 'dashboard' as Tab, label: 'Dashboard', Icon: LayoutDashboard },
                  { id: 'calendario' as Tab, label: 'Calendario', Icon: Calendar },
                ].map(({ id, label, Icon }, i) => (
                  <motion.button
                    key={id}
                    initial={{ opacity: 0, x: 24, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30, delay: i * 0.06 }}
                    onClick={() => cambiar(id)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <span className="rounded-full border border-white/10 bg-night-800/90 px-2.5 py-1 text-[11px] font-bold text-mist-100 backdrop-blur-xl">
                      {label}
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-night-800/90 text-mist-100 backdrop-blur-xl">
                      <Icon className="h-4 w-4" />
                    </span>
                  </motion.button>
                ))}
                <motion.button
                  initial={{ opacity: 0, x: 24, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.12 }}
                  onClick={() => {
                    setBurbujas(false)
                    setMenuGestionAbierto(true)
                  }}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <span className="rounded-full border border-white/10 bg-night-800/90 px-2.5 py-1 text-[11px] font-bold text-mist-100 backdrop-blur-xl">
                    Gestión
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-night-800/90 text-mist-100 backdrop-blur-xl">
                    <SlidersHorizontal className="h-4 w-4" />
                  </span>
                </motion.button>
              </>
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => setBurbujas((v) => !v)}
            whileTap={{ scale: 0.88 }}
            title="Ir a otras secciones"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-emerald-400/35 bg-gradient-to-br from-emerald-500/30 to-sky-500/20 text-emerald-200 shadow-[0_10px_30px_-8px_rgba(16,185,129,0.7)] backdrop-blur-xl"
          >
            <motion.span animate={{ rotate: burbujas ? 45 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Compass className="h-5 w-5" />
            </motion.span>
          </motion.button>
        </div>
      )}

      {/* SHEET GESTIÓN MÓVIL */}
      <AnimatePresence>
        {menuGestionAbierto && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setMenuGestionAbierto(false)}
          >
            <motion.div
              className="glass-card w-full max-w-sm space-y-4 rounded-t-3xl p-5 sm:rounded-3xl"
              initial={{ y: 120, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 120, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-300" />
                  <span>Módulos de gestión</span>
                </div>
                <button
                  onClick={() => setMenuGestionAbierto(false)}
                  className="cursor-pointer rounded-full p-1.5 text-mist-500 hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
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
                      className={`flex cursor-pointer items-center gap-2.5 rounded-2xl border p-3 text-left font-bold transition-all ${
                        activo
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-white'
                          : 'border-white/[0.07] text-mist-300 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className={`rounded-xl p-1.5 ${activo ? 'bg-emerald-400/25 text-emerald-200' : 'bg-white/[0.06] text-mist-500'}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
