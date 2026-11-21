import { useEffect, useState, useCallback, useRef } from 'react'
import {
  agregarEventoRadarManual,
  cancelarMisionProgramada,
  crearMisionOperativa,
  descartarEventoRadar,
  ejecutarRutaHabitual,
  guardarChatGema,
  guardarEventosRadar,
  guardarExtraEmpleado,
  guardarExtraVehiculo,
  guardarPreciosCombustibleManuales,
  guardarRotacionContador,
  guardarRutaHabitual,
  guardarTurnos,
  hidratarEstadoBears,
  iniciarMisionProgramada,
  investigarVehiculoIndividualIA,
  investigarVehiculosPendientesIA,
  leerChatGema,
  leerEventosRadar,
  leerHistorialTarjetas,
  leerPreciosCombustible,
  leerTarjetaCombustible,
  liquidarTarjetaEnCashmet,
  listarEmpleadosBears,
  listarMisiones,
  listarRutasHabituales,
  listarTurnos,
  listarVehiculosBears,
  obtenerRotacionContador,
  reemplazarLlantasVehiculo,
  sincronizarPreciosCombustibleReales,
  sincronizarRadarAutomatico,
  tanquearVehiculoCompleto,
  verificarYCompletarMisionesVencidas,
  verificarYCumplirRutasAutomaticas,
} from './repo'
import { BASE_BEARS_RESERVE } from './geo'
import { generarTurnosSemanalesIA } from './gemaEngine'
import { hoyISO, isoLocal } from '@/lib/fechas'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { geminiDisponible } from '@/ai/gemini'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MensajeGema,
  MisionComunitaria,
  PreciosCombustible,
  RutaHabitual,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

import TarjetaCombustibleWidget from './TarjetaCombustibleWidget'
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
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

/** Lunes de la semana actual (en domingo devuelve el lunes anterior, no el siguiente). */
function lunesDeEstaSemanaISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoLocal(d)
}

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
  const [tarjetaCombustible, setTarjetaCombustible] =
    useState<TarjetaCombustibleReserva>(leerTarjetaCombustible)
  const [historialTarjetas, setHistorialTarjetas] = useState<TarjetaCombustibleReserva[]>([])
  const [preciosCombustible, setPreciosCombustible] =
    useState<PreciosCombustible>(leerPreciosCombustible)
  const [chatMensajes, setChatMensajes] = useState<MensajeGema[]>([])
  const [cuentasCashmet, setCuentasCashmet] = useState<CuentaBanco[]>([])
  const [cargando, setCargando] = useState(true)
  const [liquidando, setLiquidando] = useState(false)
  const [actualizandoPrecios, setActualizandoPrecios] = useState(false)
  const [avisoGlobal, setAvisoGlobal] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null
  )
  const inicializadoRef = useRef(false)

  const mostrarAviso = useCallback((tipo: 'ok' | 'error', texto: string, ms = 5500) => {
    setAvisoGlobal({ tipo, texto })
    window.setTimeout(() => {
      setAvisoGlobal((prev) => (prev?.texto === texto ? null : prev))
    }, ms)
  }, [])

  const refrescarDesdeCacheYCashmet = useCallback(async () => {
    await hidratarEstadoBears()
    const [emps, vehs, cuentas] = await Promise.all([
      listarEmpleadosBears(),
      listarVehiculosBears(),
      listarCuentasBanco().catch(() => []),
    ])

    const rutas = listarRutasHabituales()
    let turnosExistentes = listarTurnos()
    const lunesActual = lunesDeEstaSemanaISO()
    const semanaActual = turnosExistentes.filter((t) => t.semanaISO === lunesActual)
    const activos = emps.filter((e) => e.activo !== false)

    // Solo generamos automáticamente si no existe el cuadrante de esta semana
    // o si hay algún activo sin turnos cuando el equipo sí tiene franjas posibles
    const requiereGenerar =
      activos.length > 0 &&
      (semanaActual.length === 0 ||
        semanaActual.some((t) => t.esRespaldoCoordinador) ||
        semanaActual.some((t) => !activos.some((a) => a.id === t.empleadoId)))

    if (requiereGenerar) {
      const contadorActual = obtenerRotacionContador()
      turnosExistentes = generarTurnosSemanalesIA(emps, lunesActual, rutas, contadorActual)
      await guardarTurnos(turnosExistentes)
    }

    // Recalcular horas reales por empleado según los turnos de la semana actual
    const turnosSemanaFinal = turnosExistentes.filter((t) => t.semanaISO === lunesActual)
    const empsConHoras = emps.map((e) => ({
      ...e,
      horasSemanalesAsignadas: Number(
        turnosSemanaFinal
          .filter((t) => t.empleadoId === e.id)
          .reduce((acc, t) => acc + t.horas, 0)
          .toFixed(1)
      ),
    }))

    setEmpleados(empsConHoras)
    setVehiculos(vehs)
    setCuentasCashmet(cuentas)
    setTurnos(turnosSemanaFinal)
    setMisiones(listarMisiones())
    setRutasHabituales(rutas)
    setEventosRadar(leerEventosRadar())
    setTarjetaCombustible(leerTarjetaCombustible())
    setHistorialTarjetas(leerHistorialTarjetas())
    setPreciosCombustible(leerPreciosCombustible())
    setChatMensajes(leerChatGema())
  }, [])

  // Carga inicial ordenada (Firestore → Turnos → Rutas automáticas → Misiones vencidas → Precios & Radar)
  useEffect(() => {
    let cancelado = false

    const iniciar = async () => {
      try {
        await refrescarDesdeCacheYCashmet()
        if (cancelado) return
        setCargando(false)

        if (inicializadoRef.current) return
        inicializadoRef.current = true

        // 1. Rutas automáticas escolares (ya con los turnos semanales garantizados)
        const resRutas = await verificarYCumplirRutasAutomaticas()
        if (!cancelado && resRutas.rutasEjecutadas.length > 0) {
          await refrescarDesdeCacheYCashmet()
          mostrarAviso(
            'ok',
            `🚌 Ruta automática cumplida: ${resRutas.rutasEjecutadas.join(', ')}.`
          )
        }

        // 2. Verificar misiones programadas y misiones en curso que ya cumplieron su tiempo
        const resMis = await verificarYCompletarMisionesVencidas()
        if (
          !cancelado &&
          (resMis.misionesFinalizadas.length > 0 || resMis.misionesIniciadas.length > 0)
        ) {
          await refrescarDesdeCacheYCashmet()
          if (resMis.misionesFinalizadas.length > 0) {
            const nombres = resMis.misionesFinalizadas.map((m) => m.titulo).join(', ')
            mostrarAviso(
              'ok',
              `🤖 Gema IA cerró automáticamente ${resMis.misionesFinalizadas.length} misión(es): ${nombres}. Revisa la Bitácora de Crónicas.`
            )
          }
        }

        // 3. Sincronizar precios reales de combustible y radar (noticias reales + caducidad 1–2 días)
        const [resPrecios, resRadar] = await Promise.all([
          sincronizarPreciosCombustibleReales(false),
          sincronizarRadarAutomatico(false),
        ])
        if (!cancelado) {
          if (resPrecios.actualizadoDesdeWeb) {
            setPreciosCombustible(resPrecios.precios)
          }
          setEventosRadar(resRadar.eventos)
        }
      } catch (err) {
        console.warn('Error inicializando Bear\'s Reserve:', err)
        if (!cancelado) {
          setCargando(false)
          mostrarAviso('error', 'Hubo un problema sincronizando algunos datos con Firestore.')
        }
      }
    }

    void iniciar()
    return () => {
      cancelado = true
    }
  }, [refrescarDesdeCacheYCashmet, mostrarAviso])

  // Temporizador autónomo cada 30s para finalizar misiones en curso al vencer su duración estimada
  useEffect(() => {
    const id = window.setInterval(() => {
      void verificarYCompletarMisionesVencidas().then((res) => {
        if (res.misionesFinalizadas.length > 0 || res.misionesIniciadas.length > 0) {
          void refrescarDesdeCacheYCashmet()
          if (res.misionesFinalizadas.length > 0) {
            mostrarAviso(
              'ok',
              `🤖 Misión finalizada automáticamente por Gema IA: ${res.misionesFinalizadas.map((m) => m.titulo).join(', ')}.`
            )
          }
        }
      })
    }, 30_000)

    return () => window.clearInterval(id)
  }, [refrescarDesdeCacheYCashmet, mostrarAviso])

  // Rotar turnos con Gema
  const rotarTurnos = async () => {
    const siguiente = obtenerRotacionContador() + 1
    await guardarRotacionContador(siguiente)
    const nuevosTurnos = generarTurnosSemanalesIA(
      empleados,
      lunesDeEstaSemanaISO(),
      rutasHabituales,
      siguiente
    )
    await guardarTurnos(nuevosTurnos)
    await refrescarDesdeCacheYCashmet()
  }

  // Actualizar empleado (toggle activo u horarios de estudio) + reajustar cuadrante automáticamente
  const actualizarEmpleadoYCuadrante = async (id: string, parcial: Partial<EmpleadoOperativo>) => {
    await guardarExtraEmpleado(id, parcial)
    const empsActualizados = await listarEmpleadosBears()
    const nuevosTurnos = generarTurnosSemanalesIA(
      empsActualizados,
      lunesDeEstaSemanaISO(),
      rutasHabituales,
      obtenerRotacionContador()
    )
    await guardarTurnos(nuevosTurnos)
    await refrescarDesdeCacheYCashmet()
  }

  // Tanqueo manual completo
  const tanquear = async (vehiculoId: string) => {
    try {
      const res = await tanquearVehiculoCompleto(vehiculoId, 'manual')
      setTarjetaCombustible({ ...res.tarjeta })
      await refrescarDesdeCacheYCashmet()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo registrar el tanqueo.'
      mostrarAviso('error', msg)
      throw e
    }
  }

  // Liquidar en CashMet (con lock `busy` y recarga de cuentas bancarias)
  const liquidarCombustible = async (cuentaBancoId: string, tarjetaIdObjetivo?: string) => {
    setLiquidando(true)
    try {
      await liquidarTarjetaEnCashmet(cuentaBancoId, tarjetaIdObjetivo)
      await refrescarDesdeCacheYCashmet()
    } finally {
      setLiquidando(false)
    }
  }

  // Actualizar precios reales de combustible desde Web (Gemini + Google Search)
  const actualizarPreciosWeb = async () => {
    setActualizandoPrecios(true)
    try {
      const res = await sincronizarPreciosCombustibleReales(true)
      setPreciosCombustible(res.precios)
      if (res.actualizadoDesdeWeb) {
        mostrarAviso('ok', `⛽ Precios actualizados en vivo (${res.precios.fuente}).`)
      } else {
        mostrarAviso(
          'error',
          'No se pudo consultar la fuente web en este momento (verifica VITE_GEMINI_API_KEY). Puedes editar los precios manualmente.'
        )
      }
    } finally {
      setActualizandoPrecios(false)
    }
  }

  const guardarPreciosManuales = async (vals: {
    corrientePorGalon: number
    dieselPorGalon: number
    extraPorGalon: number
  }) => {
    const nuevos = await guardarPreciosCombustibleManuales(vals)
    setPreciosCombustible(nuevos)
    mostrarAviso('ok', '⛽ Precios de combustible actualizados manualmente y guardados en Firestore.')
  }

  // Investigar fichas de flota con IA
  const ejecutarInvestigacionFichasIA = async (forzarTodos = false) => {
    const res = await investigarVehiculosPendientesIA(forzarTodos)
    await refrescarDesdeCacheYCashmet()
    return res
  }

  const ejecutarInvestigacionVehiculoIndividual = async (id: string) => {
    const res = await investigarVehiculoIndividualIA(id)
    await refrescarDesdeCacheYCashmet()
    return res
  }

  const ejecutarReemplazoLlantas = async (id: string) => {
    await reemplazarLlantasVehiculo(id)
    await refrescarDesdeCacheYCashmet()
  }

  // Crear misión operativa (en curso con timer automático o programada en calendario)
  const despacharMision = async (m: MisionComunitaria) => {
    await crearMisionOperativa(m)
    await refrescarDesdeCacheYCashmet()
  }

  const arrancarMisionProgramada = async (id: string) => {
    await iniciarMisionProgramada(id)
    await refrescarDesdeCacheYCashmet()
    mostrarAviso('ok', '🚨 Misión programada iniciada. Gema IA la cerrará automáticamente al cumplir su duración estimada.')
  }

  const eliminarMisionProgramada = async (id: string) => {
    await cancelarMisionProgramada(id)
    await refrescarDesdeCacheYCashmet()
    mostrarAviso('ok', 'Misión programada cancelada.')
  }

  // Cumplir ruta habitual manualmente
  const cumplirRutaHabitual = async (ruta: RutaHabitual, vehiculoId?: string) => {
    const hoy = hoyISO()
    const idCumplimiento = ruta.tipoHorario ? `${hoy}-${ruta.tipoHorario}` : hoy
    const res = await ejecutarRutaHabitual(ruta, idCumplimiento, vehiculoId)
    await refrescarDesdeCacheYCashmet()
    mostrarAviso(
      'ok',
      `🚌 Ruta "${ruta.nombre}" registrada (${res.mision.distanciaKmIdaYVuelta} km · ${res.mision.galonesConsumidosEstimados} gal). Odómetro y crónica actualizados.`
    )
  }

  // Escanear radar real (Web + llamadas comunitarias frescas)
  const escanearRadarReal = async () => {
    const res = await sincronizarRadarAutomatico(true)
    setEventosRadar(res.eventos)
    return res
  }

  const guardarMensajesChat = async (nuevos: MensajeGema[]) => {
    setChatMensajes(nuevos)
    await guardarChatGema(nuevos)
  }

  const misionesEnCursoCount = misiones.filter((m) => m.estado === 'en_curso').length

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
                  Base Central: {BASE_BEARS_RESERVE.nombre} · {BASE_BEARS_RESERVE.sector} (
                  {BASE_BEARS_RESERVE.municipio})
                </p>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              <Radio className="h-3 w-3 animate-pulse" />
              Firestore Sync
            </span>
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">
              {geminiDisponible ? 'Gema 💎 Gemini IA' : 'Gema 💎 Respaldo Local'}
            </span>
          </div>
        </div>
      </header>

      {/* Contenedor central */}
      <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        {avisoGlobal && (
          <div
            className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-xs font-bold shadow-lg ${
              avisoGlobal.tipo === 'error'
                ? 'border-red-400/40 bg-red-500/15 text-red-200'
                : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {avisoGlobal.tipo === 'error' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              )}
              <span>{avisoGlobal.texto}</span>
            </div>
            <button
              type="button"
              onClick={() => setAvisoGlobal(null)}
              className="cursor-pointer opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Widget superior de combustible con precios reales Colombia y liquidaciones */}
        <TarjetaCombustibleWidget
          tarjeta={tarjetaCombustible}
          historialTarjetas={historialTarjetas}
          precios={preciosCombustible}
          cuentasCashmet={cuentasCashmet}
          onLiquidar={liquidarCombustible}
          onActualizarPreciosWeb={actualizarPreciosWeb}
          onGuardarPreciosManuales={guardarPreciosManuales}
          busy={liquidando}
          actualizandoPrecios={actualizandoPrecios}
        />

        {/* Barra de pestañas */}
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
            {misionesEnCursoCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                {misionesEnCursoCount}
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
            Sincronizando Bear&apos;s Reserve con Firestore y CashMet...
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
                onCrearMision={despacharMision}
                onIniciarMisionProgramada={arrancarMisionProgramada}
                onCancelarMisionProgramada={eliminarMisionProgramada}
                onCumplirRutaHabitual={cumplirRutaHabitual}
                onActualizarRuta={async (r) => {
                  await guardarRutaHabitual(r)
                  await refrescarDesdeCacheYCashmet()
                }}
                onDescartarEventoRadar={async (id) => {
                  await descartarEventoRadar(id)
                  setEventosRadar(leerEventosRadar())
                }}
                onEscanearRadarReal={escanearRadarReal}
                onActualizarEventosRadar={async (nuevos) => {
                  await guardarEventosRadar(nuevos)
                  setEventosRadar(leerEventosRadar())
                }}
                onAgregarEventoRadar={async (ev) => {
                  await agregarEventoRadarManual(ev)
                  setEventosRadar(leerEventosRadar())
                }}
              />
            )}

            {tab === 'flota' && (
              <FlotaTab
                vehiculos={vehiculos}
                onActualizarVehiculo={async (id, parcial) => {
                  await guardarExtraVehiculo(id, parcial)
                  await refrescarDesdeCacheYCashmet()
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
                onActualizarEmpleado={actualizarEmpleadoYCuadrante}
              />
            )}

            {tab === 'gema' && (
              <GemaChatTab
                empleados={empleados}
                vehiculos={vehiculos}
                turnos={turnos}
                misiones={misiones}
                rutasHabituales={rutasHabituales}
                eventosRadar={eventosRadar}
                tarjetaCombustible={tarjetaCombustible}
                preciosCombustible={preciosCombustible}
                mensajesPersistidos={chatMensajes}
                onGuardarMensajes={guardarMensajesChat}
                onRotarTurnos={rotarTurnos}
                onTanquearVehiculo={tanquear}
                onEscanearRadar={async () => {
                  await escanearRadarReal()
                }}
                onActualizarPrecios={actualizarPreciosWeb}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
