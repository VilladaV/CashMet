import { useEffect, useState, useCallback } from 'react'
import {
  completarMisionComunitaria,
  ejecutarRutaHabitual,
  guardarExtraEmpleado,
  guardarExtraVehiculo,
  guardarMision,
  guardarRutaHabitual,
  guardarTurnos,
  guardarEventosRadar,
  descartarEventoRadar,
  agregarEventoRadarManual,
  investigarVehiculosPendientesIA,
  investigarVehiculoIndividualIA,
  leerEventosRadar,
  leerTarjetaCombustible,
  liquidarTarjetaEnCashmet,
  listarEmpleadosBears,
  listarMisiones,
  listarRutasHabituales,
  listarTurnos,
  listarVehiculosBears,
  reemplazarLlantasVehiculo,
  tanquearVehiculoCompleto,
  verificarYCumplirRutasAutomaticas,
  obtenerRotacionContador,
  guardarRotacionContador,
} from './repo'
import { BASE_BEARS_RESERVE } from './geo'
import { generarTurnosSemanalesIA } from './gemaEngine'
import { hoyISO } from '@/lib/fechas'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  RutaHabitual,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

import TarjetaCombustibleWidget from './TarjetaCombustibleWidget'

/** Lunes de la semana actual (en domingo devuelve el lunes anterior, no el siguiente). */
function lunesDeEstaSemanaISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
import FlotaTab from './FlotaTab'
import TurnosTab from './TurnosTab'
import MisionesTab from './MisionesTab'
import GemaChatTab from './GemaChatTab'

import {
  Compass,
  Truck,
  Calendar,
  Sparkles,
  ArrowLeft,
  Radio,
} from 'lucide-react'

interface Props {
  onVolverACashmet: () => void
}

type TabActual = 'misiones' | 'flota' | 'turnos' | 'gema'

export default function BearsReservePortal({ onVolverACashmet }: Props) {
  const [tab, setTab] = useState<TabActual>('misiones')
  const [empleados, setEmpleados] = useState<EmpleadoOperativo[]>([])
  const [vehiculos, setVehiculos] = useState<VehiculoOperativo[]>([])
  const [turnos, setTurnos] = useState<TurnoSemanal[]>([])
  const [misiones, setMisiones] = useState<MisionComunitaria[]>([])
  const [rutasHabituales, setRutasHabituales] = useState<RutaHabitual[]>([])
  const [eventosRadar, setEventosRadar] = useState<EventoRadarLocal[]>([])
  const [tarjetaCombustible, setTarjetaCombustible] = useState<TarjetaCombustibleReserva>(leerTarjetaCombustible)
  const [cuentasCashmet, setCuentasCashmet] = useState<CuentaBanco[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarTodo = useCallback(async () => {
    try {
      const [emps, vehs, cuentas] = await Promise.all([
        listarEmpleadosBears(),
        listarVehiculosBears(),
        listarCuentasBanco().catch(() => []),
      ])
      setEmpleados(emps)
      setVehiculos(vehs)
      setCuentasCashmet(cuentas)
      // Cuadrante semanal 24/7: si no existe el de esta semana, faltan turnos o algún activo quedó en 0h, Gema lo arma
      const rutas = listarRutasHabituales()
      let turnosExistentes = listarTurnos()
      const lunesActual = lunesDeEstaSemanaISO()
      const semanaActual = turnosExistentes.filter((t) => t.semanaISO === lunesActual)
      const algunActivoSinHoras = emps
        .filter((e) => e.activo !== false)
        .some((e) => !semanaActual.some((t) => t.empleadoId === e.id))
      const tieneRespaldoCoordinadorInnecesario = semanaActual.some((t) => t.esRespaldoCoordinador)
      const faltaNocheOIncompleto =
        !semanaActual.some((t) => t.franja === 'noche') ||
        semanaActual.length < 21 ||
        algunActivoSinHoras ||
        tieneRespaldoCoordinadorInnecesario
      if (emps.length > 0 && (semanaActual.length === 0 || faltaNocheOIncompleto)) {
        const contadorActual = obtenerRotacionContador()
        turnosExistentes = generarTurnosSemanalesIA(emps, lunesActual, rutas, contadorActual)
        guardarTurnos(turnosExistentes)
      }
      setTurnos(turnosExistentes)
      setMisiones(listarMisiones())
      setRutasHabituales(listarRutasHabituales())
      setEventosRadar(leerEventosRadar())
      setTarjetaCombustible(leerTarjetaCombustible())
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargarTodo()
    // Verificación autónoma de rutas escolares programadas
    void verificarYCumplirRutasAutomaticas().then((res) => {
      if (res.rutasEjecutadas.length > 0) {
        void cargarTodo()
      }
    })
  }, [cargarTodo])

  // Rotar turnos con Gema (reorganiza equitativamente alternando roles y días en cada clic)
  const rotarTurnos = () => {
    const siguiente = obtenerRotacionContador() + 1
    guardarRotacionContador(siguiente)
    const nuevosTurnos = generarTurnosSemanalesIA(empleados, lunesDeEstaSemanaISO(), rutasHabituales, siguiente)
    guardarTurnos(nuevosTurnos)
    setTurnos(nuevosTurnos)
  }

  // Tanqueo manual completo
  const tanquear = async (vehiculoId: string) => {
    const res = await tanquearVehiculoCompleto(vehiculoId, 'manual')
    setTarjetaCombustible({ ...res.tarjeta })
    await cargarTodo()
  }

  // Liquidar en CashMet
  const liquidarCombustible = async (cuentaBancoId: string) => {
    const res = await liquidarTarjetaEnCashmet(cuentaBancoId)
    setTarjetaCombustible({ ...res })
  }

  // Investigar con IA fichas de flota (Gemini en vivo)
  const ejecutarInvestigacionFichasIA = async (forzarTodos = false) => {
    const res = await investigarVehiculosPendientesIA(forzarTodos)
    await cargarTodo()
    return res
  }

  // Investigar un vehículo individual con IA
  const ejecutarInvestigacionVehiculoIndividual = async (id: string) => {
    await investigarVehiculoIndividualIA(id)
    await cargarTodo()
  }

  // Reemplazar llantas (discreto)
  const ejecutarReemplazoLlantas = (id: string) => {
    reemplazarLlantasVehiculo(id)
    void cargarTodo()
  }

  // Completar misión con desenlace realista
  const completarMision = async (
    misionId: string,
    resultado: 'exito' | 'parcial' | 'fallida_dificultad' = 'exito'
  ) => {
    const res = await completarMisionComunitaria(misionId, resultado)
    await cargarTodo()
    return res
  }

  // Cumplir ruta habitual: conductor = el del cuadrante; vehículo = el fijado o el que elija Gema
  const cumplirRutaHabitual = async (ruta: RutaHabitual, vehiculoId?: string) => {
    // Mismo id de cumplimiento que el motor automático, para que no la vuelva a ejecutar hoy
    const hoy = hoyISO()
    const idCumplimiento = ruta.tipoHorario ? `${hoy}-${ruta.tipoHorario}` : hoy
    await ejecutarRutaHabitual(ruta, idCumplimiento, vehiculoId)
    await cargarTodo()
  }

  return (
    <div className="min-h-screen bg-[#070e17] text-slate-100 selection:bg-amber-400 selection:text-black">
      {/* Barra superior de mando de Bear's Reserve */}
      <header className="sticky top-0 z-50 border-b border-amber-400/20 bg-night-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onVolverACashmet}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-mist-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a CashMet</span>
            </button>

            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/30 to-emerald-500/10 text-xl shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                🐻
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-tight text-white sm:text-lg">
                    Bear&apos;s Reserve
                  </h1>
                  <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-black text-amber-300 uppercase">
                    Comunitario 0% Ganancia
                  </span>
                </div>
                <p className="text-[11px] text-mist-400">
                  Base Central: {BASE_BEARS_RESERVE.nombre} · {BASE_BEARS_RESERVE.sector} ({BASE_BEARS_RESERVE.municipio})
                </p>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              <Radio className="h-3 w-3 animate-pulse" />
              Guardia Comunitaria Activa
            </span>
            <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-mist-400">
              Gema 💎 en línea
            </span>
          </div>
        </div>
      </header>

      {/* Contenedor central */}
      <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        {/* Widget superior de combustible con precios Colombia */}
        <TarjetaCombustibleWidget
          tarjeta={tarjetaCombustible}
          cuentasCashmet={cuentasCashmet}
          onLiquidar={liquidarCombustible}
        />

        {/* Barra de pestañas de navegación interna */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setTab('misiones')}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              tab === 'misiones'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#2a1702] shadow-md'
                : 'text-mist-400 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Radar & Misiones</span>
            {misiones.filter((m) => m.estado === 'en_curso').length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                {misiones.filter((m) => m.estado === 'en_curso').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('flota')}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              tab === 'flota'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#2a1702] shadow-md'
                : 'text-mist-400 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Flota & Combustible</span>
            <span className="text-[10px] opacity-75">({vehiculos.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('turnos')}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              tab === 'turnos'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#2a1702] shadow-md'
                : 'text-mist-400 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Turnos & Personal (42h)</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('gema')}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              tab === 'gema'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-[#04241a] shadow-md'
                : 'text-sky-300 hover:bg-sky-400/10'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Radio con Gema 💎</span>
          </button>
        </div>

        {/* Contenido de la pestaña activa */}
        {cargando ? (
          <div className="p-12 text-center text-xs text-mist-500">
            Conectando con la flota y la base de CashMet...
          </div>
        ) : (
          <>
            {tab === 'misiones' && (
              <MisionesTab
                misiones={misiones}
                vehiculos={vehiculos}
                empleados={empleados}
                turnos={turnos}
                rutasHabituales={rutasHabituales}
                eventosRadar={eventosRadar}
                onCrearMision={(m) => {
                  guardarMision(m)
                  setMisiones(listarMisiones())
                }}
                onCompletarMision={completarMision}
                onCumplirRutaHabitual={cumplirRutaHabitual}
                onActualizarRuta={(r) => {
                  guardarRutaHabitual(r)
                  setRutasHabituales((prev) => prev.map((x) => (x.id === r.id ? r : x)))
                  void cargarTodo()
                }}
                onDescartarEventoRadar={(id) => {
                  descartarEventoRadar(id)
                  setEventosRadar((prev) => prev.filter((e) => e.id !== id))
                }}
                onActualizarEventosRadar={(nuevos) => {
                  guardarEventosRadar(nuevos)
                  setEventosRadar(nuevos)
                }}
                onAgregarEventoRadar={(ev) => {
                  agregarEventoRadarManual(ev)
                  setEventosRadar((prev) => [ev, ...prev.filter((e) => e.id !== ev.id)])
                }}
              />
            )}

            {tab === 'flota' && (
              <FlotaTab
                vehiculos={vehiculos}
                onActualizarVehiculo={(id, parcial) => {
                  guardarExtraVehiculo(id, parcial)
                  void cargarTodo()
                }}
                onTanquearVehiculo={tanquear}
                onInvestigarFichasPendientesIA={ejecutarInvestigacionFichasIA}
                onInvestigarVehiculoIndividualIA={ejecutarInvestigacionVehiculoIndividual}
                onReemplazarLlantas={ejecutarReemplazoLlantas}
              />
            )}

            {tab === 'turnos' && (
              <TurnosTab
                empleados={empleados}
                turnos={turnos}
                onRotarTurnosPorIA={rotarTurnos}
                onActualizarEmpleado={(id, parcial) => {
                  guardarExtraEmpleado(id, parcial)
                  void cargarTodo()
                }}
              />
            )}

            {tab === 'gema' && (
              <GemaChatTab
                empleados={empleados}
                vehiculos={vehiculos}
                turnos={turnos}
                misiones={misiones}
                onRotarTurnos={rotarTurnos}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
