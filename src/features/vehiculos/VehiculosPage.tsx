import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { calcularGastosMensuales, listarVehiculos, type Vehiculo } from '@/lib/firebase/vehiculosRepo'
import VehiculoDetalle from './VehiculoDetalle'
import VehiculoForm from './VehiculoForm'
import {
  claseEstado,
  claseVigencia,
  diasParaVencer,
  formatoFecha,
  formatoKm,
  progresoTarea,
  vigenciaDe,
  type Vigencia,
} from './vehiculoUtils'
import {
  AlertTriangle,
  Car,
  CircleDollarSign,
  Gauge,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'

type Filtro = 'todos' | 'alertas' | 'soat' | 'tm' | 'activos' | 'vendidos'

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'activos', label: 'Activos' },
  { id: 'soat', label: 'SOAT' },
  { id: 'tm', label: 'Tecnomecánica' },
  { id: 'vendidos', label: 'Inactivos' },
]

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

function esVehiculoActivo(v: Vehiculo): boolean {
  return v.activo !== false && v.estado !== 'Vendido'
}

function proximaTarea(v: Vehiculo): { texto: string; fecha?: string; vencida?: boolean } | null {
  const tareas = v.mantenimiento?.tareas ?? []
  if (!tareas.length) return null
  const kmActual = v.mantenimiento?.kilometrajeActual

  const evaluadas = tareas
    .filter((t) => Boolean(t.proximaFecha) || t.proximoKm !== undefined)
    .map((t) => {
      const dias = diasParaVencer(t.proximaFecha)
      const prog = t.proximoKm !== undefined ? progresoTarea(t, kmActual) : 0
      const kmVencida = t.proximoKm !== undefined && prog >= 100
      const fechaVencida = dias !== null && dias < 0
      const vencida = fechaVencida || kmVencida
      const pronta = !vencida && ((dias !== null && dias <= 30) || (t.proximoKm !== undefined && prog >= 85))
      const tier = vencida ? 0 : pronta ? 1 : 2
      const kmRestantes =
        t.proximoKm !== undefined ? t.proximoKm - (kmActual ?? t.ultimoKm ?? 0) : Number.POSITIVE_INFINITY
      return { t, dias, prog, vencida, tier, kmRestantes }
    })

  if (!evaluadas.length) return null

  evaluadas.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.tier === 0) {
      if (a.dias !== null && b.dias !== null && a.dias !== b.dias) return a.dias - b.dias
      if (a.kmRestantes !== b.kmRestantes) return a.kmRestantes - b.kmRestantes
    }
    if (a.dias !== null && b.dias !== null && a.dias !== b.dias) return a.dias - b.dias
    if (a.dias !== null && b.dias === null) return -1
    if (a.dias === null && b.dias !== null) return 1
    if (a.prog !== b.prog) return b.prog - a.prog
    return a.kmRestantes - b.kmRestantes
  })

  const top = evaluadas[0]
  const mostrarKm =
    top.t.proximoKm !== undefined && (!top.t.proximaFecha || (top.prog >= 100 && (top.dias === null || top.dias >= 0)))
  return {
    texto: mostrarKm ? `${top.t.nombre} · ${formatoKm(top.t.proximoKm)}` : top.t.nombre,
    fecha: top.t.proximaFecha,
    vencida: top.vencida,
  }
}

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-mist-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-1 text-sm font-extrabold ${tone ?? 'text-white'}`}>{value}</div>
    </div>
  )
}

function BadgeDocumento({ label, vigencia, fecha }: { label: string; vigencia: Vigencia; fecha?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${claseVigencia(vigencia)}`}>
      {label}
      {fecha ? ` · ${formatoFecha(fecha)}` : ''}
    </span>
  )
}

function VehiculoCard({
  vehiculo,
  seleccionado,
  onSeleccionar,
  onEditar,
}: {
  vehiculo: Vehiculo
  seleccionado: boolean
  onSeleccionar: () => void
  onEditar: () => void
}) {
  const [imgErrorUrl, setImgErrorUrl] = useState<string | null>(null)
  const soat = vigenciaDe(vehiculo.soat?.fechaVencimiento)
  const tm = vigenciaDe(vehiculo.tecnicomecanica?.fechaVencimiento)
  const str = vigenciaDe(vehiculo.seguroTodoRiesgo?.fechaVencimiento)
  const proxima = proximaTarea(vehiculo)
  const costo = calcularGastosMensuales(vehiculo)
  const km = vehiculo.mantenimiento?.kilometrajeActual
  const estado = vehiculo.estado ?? 'Disponible'
  const tieneDocs = Boolean(vehiculo.soat || vehiculo.tecnicomecanica || vehiculo.seguroTodoRiesgo?.tiene)
  const mostrarFoto = Boolean(vehiculo.fotoUrl && imgErrorUrl !== vehiculo.fotoUrl)

  return (
    <motion.div
      layout
      className={`group relative overflow-hidden rounded-2xl border transition-all ${
        seleccionado
          ? 'border-emerald-400/45 bg-emerald-400/[0.07] shadow-[0_0_0_1px_rgba(52,211,153,0.2),0_18px_40px_-24px_rgba(16,185,129,0.5)]'
          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
      }`}
    >
      <button
        type="button"
        aria-pressed={seleccionado}
        onClick={onSeleccionar}
        className="block w-full cursor-pointer p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/60"
      >
        <div className="flex gap-3">
          <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.06] to-white/[0.01]">
            {mostrarFoto ? (
              <img
                src={vehiculo.fotoUrl}
                alt=""
                onError={() => setImgErrorUrl(vehiculo.fotoUrl ?? null)}
                className="h-full w-full object-cover"
              />
            ) : (
              <Car className="h-7 w-7 text-mist-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-white">
                  {vehiculo.marca} {vehiculo.linea}
                </div>
                <div className="truncate text-[11px] text-mist-500">
                  {vehiculo.modelo ? `${vehiculo.modelo} · ` : ''}{vehiculo.tipo}
                  {vehiculo.placa ? ` · ${vehiculo.placa}` : ''}
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${claseEstado(estado)}`}>
                {estado}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {vehiculo.soat && <BadgeDocumento label="SOAT" vigencia={soat} fecha={vehiculo.soat.fechaVencimiento} />}
              {vehiculo.tecnicomecanica && (
                <BadgeDocumento label="TM" vigencia={tm} fecha={vehiculo.tecnicomecanica.fechaVencimiento} />
              )}
              {vehiculo.seguroTodoRiesgo?.tiene && (
                <BadgeDocumento label="STR" vigencia={str} fecha={vehiculo.seguroTodoRiesgo.fechaVencimiento} />
              )}
              {!tieneDocs && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold text-mist-500">
                  Sin documentos
                </span>
              )}
            </div>
          </div>
        </div>

        {proxima && (
          <div
            className={`mt-2 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] ${
              proxima.vencida
                ? 'border-red-400/25 bg-red-500/10 text-red-200'
                : 'border-white/[0.06] bg-white/[0.02] text-mist-400'
            }`}
          >
            <Wrench className={`h-3 w-3 shrink-0 ${proxima.vencida ? 'text-red-300' : 'text-amber-300/80'}`} />
            <span className="truncate">
              {proxima.vencida ? 'Vencido: ' : 'Próximo: '}
              {proxima.texto}
            </span>
            {proxima.fecha && (
              <span className={`ml-auto shrink-0 ${proxima.vencida ? 'text-red-300' : 'text-mist-500'}`}>
                {formatoFecha(proxima.fecha)}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 pr-10 text-[11px] text-mist-500">
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            {formatoKm(km)}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
            <CircleDollarSign className="h-3 w-3" />
            {COD(costo)}/mes
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={onEditar}
        className="absolute bottom-2.5 right-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-mist-400 transition hover:bg-white/[0.08] hover:text-white"
        aria-label={`Editar ${vehiculo.marca} ${vehiculo.linea}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export default function VehiculosPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [seleccionId, setSeleccionId] = useState('')
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Vehiculo | null>(null)
  const detalleRef = useRef<HTMLDivElement | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const programarScrollDetalle = useCallback((ms: number) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, ms)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const cargar = useCallback(async () => {
    try {
      const data = await listarVehiculos()
      setError('')
      setVehiculos(data)
      setSeleccionId((actual) => (data.some((v) => v.id === actual) ? actual : data[0]?.id ?? ''))
    } catch {
      setError('No se pudieron cargar los vehículos. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void cargar()
    })
  }, [cargar])

  const activos = useMemo(() => vehiculos.filter(esVehiculoActivo), [vehiculos])

  const stats = useMemo(() => {
    const costo = activos.reduce((s, v) => s + calcularGastosMensuales(v), 0)
    const valor = activos.reduce((s, v) => s + (Number(v.valorComercial) || 0), 0)
    const alertas = activos.filter((v) => {
      const estados = [
        vigenciaDe(v.soat?.fechaVencimiento),
        vigenciaDe(v.tecnicomecanica?.fechaVencimiento),
        v.seguroTodoRiesgo?.tiene ? vigenciaDe(v.seguroTodoRiesgo.fechaVencimiento) : 'vigente',
      ]
      return estados.some((x) => x === 'vencido' || x === 'por-vencer')
    }).length
    const soatVencidos = activos.filter((v) => vigenciaDe(v.soat?.fechaVencimiento) === 'vencido').length
    const tmVencidas = activos.filter((v) => vigenciaDe(v.tecnicomecanica?.fechaVencimiento) === 'vencido').length
    return { costo, valor, alertas, soatVencidos, tmVencidas }
  }, [activos])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return vehiculos.filter((v) => {
      const texto = `${v.marca ?? ''} ${v.linea ?? ''} ${v.placa ?? ''} ${v.modelo ?? ''} ${v.color ?? ''}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      const activo = esVehiculoActivo(v)
      const soat = vigenciaDe(v.soat?.fechaVencimiento)
      const tm = vigenciaDe(v.tecnicomecanica?.fechaVencimiento)
      const str = v.seguroTodoRiesgo?.tiene ? vigenciaDe(v.seguroTodoRiesgo.fechaVencimiento) : 'vigente'
      if (filtro === 'activos') return activo
      if (filtro === 'vendidos') return !activo
      if (filtro === 'soat') return activo && (soat === 'vencido' || soat === 'por-vencer')
      if (filtro === 'tm') return activo && (tm === 'vencido' || tm === 'por-vencer')
      if (filtro === 'alertas') return activo && [soat, tm, str].some((x) => x === 'vencido' || x === 'por-vencer')
      return true
    })
  }, [vehiculos, busqueda, filtro])

  const seleccionado = useMemo(
    () => vehiculos.find((v) => v.id === seleccionId) ?? null,
    [vehiculos, seleccionId]
  )

  const abrirNuevo = () => {
    setEditando(null)
    setFormAbierto(true)
  }

  const abrirEditar = (v: Vehiculo) => {
    setEditando(v)
    setFormAbierto(true)
  }

  const cerrarForm = () => {
    setFormAbierto(false)
    setEditando(null)
  }

  const alGuardar = async (id: string) => {
    cerrarForm()
    await cargar()
    setSeleccionId(id)
    programarScrollDetalle(120)
  }

  const alEliminar = async () => {
    cerrarForm()
    setSeleccionId('')
    await cargar()
  }

  const seleccionar = (id: string) => {
    setSeleccionId(id)
    if (window.innerWidth < 1280) {
      programarScrollDetalle(60)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="glass-card overflow-hidden border-0">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400" />
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  <Car className="h-4 w-4" />
                </span>
                <div>
                  <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">Garaje</h1>
                  <p className="text-[11px] text-mist-500">
                    Documentos, costos y mantenimiento de tus vehículos.
                  </p>
                </div>
              </div>
            </div>
            <Button onClick={abrirNuevo} className="h-9 cursor-pointer">
              <Plus className="h-4 w-4" />
              Nuevo vehículo
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={Car} label="Activos" value={String(activos.length)} />
            <Stat icon={TrendingUp} label="Valor comercial" value={COD(stats.valor)} tone="text-sky-300" />
            <Stat icon={CircleDollarSign} label="Costo mensual" value={`${COD(stats.costo)}/mes`} tone="text-emerald-300" />
            <Stat
              icon={AlertTriangle}
              label="Con alertas"
              value={`${stats.alertas}`}
              tone={stats.alertas ? 'text-amber-300' : 'text-emerald-300'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-mist-500">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-1">
              <ShieldCheck className="h-3 w-3 text-sky-300" />
              SOAT vencidos: <b className="text-white">{stats.soatVencidos}</b>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-1">
              <Wrench className="h-3 w-3 text-amber-300" />
              TM vencidas: <b className="text-white">{stats.tmVencidas}</b>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] px-2 py-1">
              <Gauge className="h-3 w-3 text-emerald-300" />
              Inactivos: <b className="text-white">{vehiculos.length - activos.length}</b>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:items-start">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist-500" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por placa, marca, línea..."
                className="field-dark h-10 pl-9 pr-8 text-xs"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-mist-500 hover:bg-white/[0.06] hover:text-white"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    filtro === f.id
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                      : 'border-white/[0.07] bg-white/[0.02] text-mist-400 hover:border-white/15 hover:text-white'
                  }`}
                >
                  {f.label}
                  {f.id === 'alertas' && stats.alertas > 0 ? ` (${stats.alertas})` : ''}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <Card className="glass-card border-0">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-xs text-red-200">
                <span>{error}</span>
                <Button variant="ghost" onClick={() => void cargar()} className="h-8 cursor-pointer">
                  Reintentar
                </Button>
              </CardContent>
            </Card>
          )}

          {cargando ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <Card className="glass-card border-0">
              <CardContent className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Car className="h-8 w-8 text-mist-500" />
                <p className="text-sm font-semibold text-white">
                  {vehiculos.length === 0 ? 'Todavía no tienes vehículos registrados.' : 'No encontré vehículos con ese filtro.'}
                </p>
                <p className="max-w-sm text-[11px] text-mist-500">
                  {vehiculos.length === 0
                    ? 'Crea el primero para llevar SOAT, tecnomecánica, seguro y mantenimiento en un solo lugar.'
                    : 'Prueba con otra búsqueda o cambia el filtro.'}
                </p>
                {vehiculos.length === 0 ? (
                  <Button onClick={abrirNuevo} className="mt-2 h-9 cursor-pointer">
                    <Plus className="h-4 w-4" />
                    Crear vehículo
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBusqueda('')
                      setFiltro('todos')
                    }}
                    className="mt-2 h-8 cursor-pointer"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {filtrados.map((v) => (
                <VehiculoCard
                  key={v.id}
                  vehiculo={v}
                  seleccionado={v.id === seleccionId}
                  onSeleccionar={() => seleccionar(v.id)}
                  onEditar={() => abrirEditar(v)}
                />
              ))}
            </div>
          )}
        </div>

        <div
          ref={detalleRef}
          className="scroll-mt-24 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-1"
        >
          {seleccionado ? (
            <VehiculoDetalle
              key={seleccionado.id}
              vehiculo={seleccionado}
              onCambio={cargar}
              onEditar={() => abrirEditar(seleccionado)}
            />
          ) : (
            !cargando && (
              <Card className="glass-card border-0">
                <CardContent className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Car className="h-7 w-7 text-mist-500" />
                  <p className="text-sm font-semibold text-white">Selecciona un vehículo para ver su detalle.</p>
                  <p className="text-[11px] text-mist-500">
                    Aquí verás documentos, tarjeta de propiedad y el plan de mantenimiento.
                  </p>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>

      {formAbierto && (
        <VehiculoForm
          key={editando?.id ?? 'nuevo'}
          vehiculo={editando}
          onCerrar={cerrarForm}
          onGuardado={alGuardar}
          onEliminado={alEliminar}
        />
      )}
    </div>
  )
}
