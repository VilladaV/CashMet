import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { logout } from '@/lib/firebase/auth'
import CashMetLogo from '@/components/brand/CashMetLogo'
import ChatPage from './features/chat/ChatPage'
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

const CalendarioPage = lazy(() => import('./features/calendario/CalendarioPage'))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const CuentasPage = lazy(() => import('./features/cuentas/CuentasPage'))
const DeudasPage = lazy(() => import('./features/deudas/DeudasPage'))
const VehiculosPage = lazy(() => import('./features/vehiculos/VehiculosPage'))
const PropiedadesPage = lazy(() => import('./features/propiedades/PropiedadesPage'))
const NominaPage = lazy(() => import('./features/nomina/NominaPage'))
const RecurrentesPage = lazy(() => import('./features/recurrentes/RecurrentesPage'))
const BackupPage = lazy(() => import('./features/backup/BackupPage'))
const ImpuestosPage = lazy(() => import('./features/impuestos/ImpuestosPage'))
const BearsReservePortal = lazy(() => import('./features/bearsReserve/BearsReservePortal'))

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

const PRIMARY_TABS = TABS.filter((t) => t.category === 'primary')
const GESTION_TABS = TABS.filter((t) => t.category === 'gestion')
const TAB_IDS = new Set<string>(TABS.map((t) => t.id))

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

function leerRutaHash(): { tab: Tab; modoBears: boolean } {
  if (typeof window === 'undefined') return { tab: 'chat', modoBears: false }
  const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase()
  if (raw === 'bears') return { tab: 'chat', modoBears: true }
  if (TAB_IDS.has(raw)) return { tab: raw as Tab, modoBears: false }
  return { tab: 'chat', modoBears: false }
}

function escribirHash(destino: string) {
  if (typeof window === 'undefined') return
  const nuevoHash = `#${destino}`
  if (window.location.hash !== nuevoHash) {
    window.location.hash = nuevoHash
  }
}

function CargandoModulo({ pantallaCompleta = false }: { pantallaCompleta?: boolean }) {
  return (
    <div
      className={
        pantallaCompleta
          ? 'bg-mesh-pattern flex min-h-screen items-center justify-center p-6 text-mist-300'
          : 'glass-card flex min-h-[260px] items-center justify-center rounded-3xl p-8 text-mist-300'
      }
    >
      <div className="flex flex-col items-center gap-3">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-400/25 border-t-emerald-400" />
        <span className="text-xs font-semibold text-mist-500">Cargando módulo...</span>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => leerRutaHash().tab)
  const [menuGestionAbierto, setMenuGestionAbierto] = useState(false)
  const [burbujas, setBurbujas] = useState(false)
  const [modoBears, setModoBears] = useState(() => leerRutaHash().modoBears)

  useEffect(() => {
    const onHashChange = () => {
      const ruta = leerRutaHash()
      setModoBears(ruta.modoBears)
      if (!ruta.modoBears) {
        setTab(ruta.tab)
      }
      setMenuGestionAbierto(false)
      setBurbujas(false)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!menuGestionAbierto) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuGestionAbierto(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuGestionAbierto])

  const cambiar = useCallback(
    (t: Tab) => {
      setBurbujas(false)
      setMenuGestionAbierto(false)
      setModoBears(false)
      escribirHash(t)
      if (t === tab) return
      setTab(t)
      window.scrollTo({ top: 0 })
    },
    [tab]
  )

  const abrirBears = useCallback(() => {
    setBurbujas(false)
    setMenuGestionAbierto(false)
    setModoBears(true)
    escribirHash('bears')
  }, [])

  const volverACashmet = useCallback(() => {
    setModoBears(false)
    escribirHash(tab)
  }, [tab])

  if (modoBears) {
    return (
      <Suspense fallback={<CargandoModulo pantallaCompleta />}>
        <BearsReservePortal onVolverACashmet={volverACashmet} />
      </Suspense>
    )
  }

  const tabActual = TABS.find((t) => t.id === tab)
  const esGestionActual = GESTION_TABS.some((t) => t.id === tab)

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
            <button
              type="button"
              onClick={() => cambiar('chat')}
              className="shrink-0 cursor-pointer md:hidden"
              title="Ir al chat"
              aria-label="Ir al chat"
            >
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
            <button
              type="button"
              onClick={abrirBears}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 transition hover:border-amber-400/40 hover:bg-amber-400/20"
              title="Entrar a Bear's Reserve · Flota y Guardia Comunitaria"
              aria-label="Entrar a Bear's Reserve"
            >
              <span aria-hidden="true">🐻</span>
              <span className="hidden sm:inline">Bear&apos;s Reserve</span>
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              <span className="animate-pulse-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>COP · En vivo</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2.5 text-xs text-mist-500 hover:bg-white/5 hover:text-red-300"
              onClick={() => void logout().catch(() => {})}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
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
          <button
            type="button"
            onClick={() => cambiar('chat')}
            className="mb-6 cursor-pointer px-2 text-left"
            aria-label="Ir al inicio de CashMet"
          >
            <CashMetLogo size="md" showText={true} showSubtitle={true} variant="dark" />
          </button>

          <nav className="space-y-1" aria-label="Navegación principal">
            {PRIMARY_TABS.map((t) => {
              const Icon = t.icon
              const activo = tab === t.id
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => cambiar(t.id)}
                  aria-current={activo ? 'page' : undefined}
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
          <nav className="space-y-0.5" aria-label="Módulos de gestión">
            {GESTION_TABS.map((t) => {
              const Icon = t.icon
              const activo = tab === t.id
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => cambiar(t.id)}
                  aria-current={activo ? 'page' : undefined}
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
                type="button"
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
          {tab !== 'chat' && (
            <Suspense fallback={<CargandoModulo />}>
              {tab === 'dashboard' && <DashboardPage onAbrirBears={abrirBears} />}
              {tab === 'calendario' && <CalendarioPage />}
              {tab === 'cuentas' && <CuentasPage />}
              {tab === 'deudas' && <DeudasPage />}
              {tab === 'vehiculos' && <VehiculosPage />}
              {tab === 'propiedades' && <PropiedadesPage />}
              {tab === 'nomina' && <NominaPage />}
              {tab === 'recurrentes' && <RecurrentesPage />}
              {tab === 'impuestos' && <ImpuestosPage />}
              {tab === 'backup' && <BackupPage />}
            </Suspense>
          )}
        </main>
      </div>

      {/* DOCK MÓVIL (se oculta en el chat: ahí mandan las burbujas) */}
      <nav
        aria-label="Navegación móvil"
        className={`fixed right-0 bottom-0 left-0 z-40 h-[68px] items-center border-t border-white/[0.07] bg-night-950/85 px-1 backdrop-blur-xl md:hidden ${tab === 'chat' ? 'hidden' : 'flex'}`}
      >
        {PRIMARY_TABS.map((t) => {
          const Icon = t.icon
          const activo = tab === t.id
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => cambiar(t.id)}
              aria-current={activo ? 'page' : undefined}
              className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-1 text-[10px] font-bold transition-colors ${
                activo ? 'text-white' : 'text-mist-600'
              }`}
            >
              <span className={`rounded-xl p-1.5 transition-all ${activo ? 'bg-emerald-400/20 text-emerald-300' : ''}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-0.5 max-w-full truncate">{t.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMenuGestionAbierto(true)}
          aria-expanded={menuGestionAbierto}
          className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-1 text-[10px] font-bold transition-colors ${
            esGestionActual ? 'text-emerald-300' : 'text-mist-600'
          }`}
        >
          <span className={`rounded-xl p-1.5 transition-all ${esGestionActual ? 'bg-emerald-400/20' : ''}`}>
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </span>
          <span className="mt-0.5 max-w-full truncate">Gestión</span>
        </button>
      </nav>

      {/* BURBUJAS MÓVILES DEL CHAT */}
      {tab === 'chat' && (
        <div className="fixed right-3 bottom-20 z-40 flex flex-col items-end gap-2 md:hidden">
          <AnimatePresence>
            {burbujas &&
              [
                { id: 'dashboard' as Tab, label: 'Dashboard', Icon: LayoutDashboard },
                { id: 'calendario' as Tab, label: 'Calendario', Icon: Calendar },
              ].map(({ id, label, Icon }, i) => (
                <motion.button
                  type="button"
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
            {burbujas && (
              <motion.button
                type="button"
                key="gestion"
                initial={{ opacity: 0, x: 24, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.12 }}
                onClick={() => {
                  setBurbujas(false)
                  setMenuGestionAbierto(true)
                }}
                aria-expanded={menuGestionAbierto}
                className="flex cursor-pointer items-center gap-2"
              >
                <span className="rounded-full border border-white/10 bg-night-800/90 px-2.5 py-1 text-[11px] font-bold text-mist-100 backdrop-blur-xl">
                  Gestión
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-night-800/90 text-mist-100 backdrop-blur-xl">
                  <SlidersHorizontal className="h-4 w-4" />
                </span>
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button
            type="button"
            onClick={() => setBurbujas((v) => !v)}
            whileTap={{ scale: 0.88 }}
            title="Ir a otras secciones"
            aria-label="Abrir accesos rápidos"
            aria-expanded={burbujas}
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-gestion-titulo"
              className="glass-card w-full max-w-sm space-y-4 rounded-t-3xl p-5 sm:rounded-3xl"
              initial={{ y: 120, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 120, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                <div id="modal-gestion-titulo" className="flex items-center gap-2 text-sm font-bold text-white">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-300" />
                  <span>Módulos de gestión</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuGestionAbierto(false)}
                  aria-label="Cerrar módulos de gestión"
                  className="cursor-pointer rounded-full p-1.5 text-mist-500 hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {GESTION_TABS.map((t) => {
                  const Icon = t.icon
                  const activo = tab === t.id
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => cambiar(t.id)}
                      aria-current={activo ? 'page' : undefined}
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
