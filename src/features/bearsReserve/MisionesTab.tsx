import { useState } from 'react'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  RutaHabitual,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'
import {
  Radio,
  Compass,
  CheckCircle2,
  MapPin,
  Truck,
  Sparkles,
  Calendar,
  Check,
  BookOpen,
  Route,
  Clock,
  Navigation,
  Map as MapIcon,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  RefreshCw,
} from 'lucide-react'
import MapaOperaciones from './MapaOperaciones'
import {
  calcularDistanciaRealDesdeBase,
  BASE_BEARS_RESERVE,
  PUNTOS_REFERENCIA_CALDAS,
} from './geo'
import {
  seleccionarVehiculosOptimosMision,
  seleccionarTripulacionMision,
  escanearNuevosEventosRadarIA,
} from './gemaEngine'
import { obtenerConductorRuta } from './repo'

let counterMision = 1
function crearMisionId(): string {
  return `mis-${Date.now()}-${counterMision++}`
}

function horaActualHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function hoyFechaISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  misiones: MisionComunitaria[]
  vehiculos: VehiculoOperativo[]
  empleados: EmpleadoOperativo[]
  turnos?: TurnoSemanal[]
  rutasHabituales: RutaHabitual[]
  eventosRadar: EventoRadarLocal[]
  onCrearMision: (mision: MisionComunitaria) => void
  onCompletarMision: (
    misionId: string,
    resultado?: 'exito' | 'parcial' | 'fallida_dificultad'
  ) => Promise<{ cronica: string; tanqueosAutomaticos: any[] }>
  onCumplirRutaHabitual: (ruta: RutaHabitual, vehiculoId?: string) => void
  onActualizarRuta?: (ruta: RutaHabitual) => void
  onDescartarEventoRadar?: (id: string) => void
  onActualizarEventosRadar?: (eventos: EventoRadarLocal[]) => void
  onAgregarEventoRadar?: (ev: EventoRadarLocal) => void
}

type SubVistaMisiones = 'radar' | 'mapa' | 'cronicas' | 'rutas_habituales'

export default function MisionesTab({
  misiones,
  vehiculos,
  empleados,
  turnos = [],
  rutasHabituales,
  eventosRadar,
  onCrearMision,
  onCompletarMision,
  onCumplirRutaHabitual,
  onActualizarRuta,
  onDescartarEventoRadar,
  onActualizarEventosRadar,
  onAgregarEventoRadar,
}: Props) {
  const [subVista, setSubVista] = useState<SubVistaMisiones>('radar')
  const [filtroRadar, setFiltroRadar] = useState<'todos' | 'caldas' | 'otros'>('todos')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string>('')

  // Estados para radar dinámico
  const [escaneandoRadar, setEscaneandoRadar] = useState(false)
  const [modalReportarAbierto, setModalReportarAbierto] = useState(false)
  const [reporteTitulo, setReporteTitulo] = useState('')
  const [reporteLugar, setReporteLugar] = useState('Vereda San Peregrino · Caldas')
  const [reporteDepartamento, setReporteDepartamento] = useState('Caldas')
  const [reporteResumen, setReporteResumen] = useState('')
  const [reporteGrave, setReporteGrave] = useState(false)

  const ejecutarEscaneoRadar = () => {
    setEscaneandoRadar(true)
    setTimeout(() => {
      const res = escanearNuevosEventosRadarIA(eventosRadar)
      if (res.eventoAgregado && onActualizarEventosRadar) {
        onActualizarEventosRadar(res.nuevosEventos)
        setFeedback(`📡 ¡Frecuencias escaneadas! Se captó reporte: "${res.eventoAgregado.titulo}".`)
      } else {
        setFeedback(`📡 Frecuencias escaneadas. No hay alertas adicionales reportadas en la cordillera por ahora.`)
      }
      setEscaneandoRadar(false)
      setTimeout(() => setFeedback(''), 5000)
    }, 700)
  }

  const guardarNuevoReporte = () => {
    if (!reporteTitulo.trim()) return
    const nuevo: EventoRadarLocal = {
      id: `rad-man-${Date.now()}`,
      titulo: reporteTitulo.trim(),
      lugar: reporteLugar.trim(),
      departamento: reporteDepartamento.trim(),
      lat: BASE_BEARS_RESERVE.lat + (Math.random() - 0.5) * 0.03,
      lng: BASE_BEARS_RESERVE.lng + (Math.random() - 0.5) * 0.03,
      fuenteNoticia: 'Llamada telefónica a Guardia Bear\'s Reserve',
      resumen: reporteResumen.trim() || 'Llamada comunitaria solicitando apoyo.',
      fecha: hoyFechaISO(),
      esEmergenciaGrave: reporteGrave,
      atencionOficialPresente: false,
      esNoticiaWebReal: false,
      recomendacionGema: reporteGrave ? 'intervenir_urgente' : 'apoyo_logistico',
      justificacionGema: 'Situación reportada directamente por la comunidad veredal. Se requiere evaluar disponibilidad y alistar dotación.',
    }
    if (onAgregarEventoRadar) {
      onAgregarEventoRadar(nuevo)
    }
    setModalReportarAbierto(false)
    setReporteTitulo('')
    setReporteResumen('')
    setFeedback(`📻 ¡Llamada veredal "${nuevo.titulo}" registrada en el Radar!`)
    setTimeout(() => setFeedback(''), 5000)
  }

  // Formulario de nueva misión manual o programada
  const [modalAbierto, setModalAbierto] = useState(false)
  const [titulo, setTitulo] = useState('Apoyo Comunitario y Traslado de Víveres')
  const [destino, setDestino] = useState('Vereda La Cabaña · Manizales')
  const [distanciaKm, setDistanciaKm] = useState('28')
  const [duracionMinutos, setDuracionMinutos] = useState('180') // 3 horas
  const [terreno, setTerreno] = useState<MisionComunitaria['terreno']>('trocha_moderada')
  const [vehiculosSeleccionados, setVehiculosSeleccionados] = useState<string[]>([
    vehiculos.find((v) => v.disponibleParaTrabajo)?.id || vehiculos[0]?.id || '',
  ])
  const [tripulantesSeleccionados, setTripulantesSeleccionados] = useState<string[]>([
    empleados.find((e) => e.activo)?.id || empleados[0]?.id || '',
  ])
  const [esProgramada, setEsProgramada] = useState(false)
  const [fechaMision, setFechaMision] = useState(hoyFechaISO)

  // Estado para el editor de trazado de rutas habituales
  const [modalEditarRutaAbierto, setModalEditarRutaAbierto] = useState(false)
  const [rutaEditando, setRutaEditando] = useState<RutaHabitual | null>(null)
  const [paradasEditando, setParadasEditando] = useState<
    Array<{ nombre: string; lat: number; lng: number }>
  >([])
  const [nuevoPuntoRefKey, setNuevoPuntoRefKey] = useState('la_cabana')
  const [nuevoPuntoNombreManual, setNuevoPuntoNombreManual] = useState('')
  const [minutosRalentiEditando, setMinutosRalentiEditando] = useState('35')

  const abrirEditorRuta = (r: RutaHabitual) => {
    setRutaEditando(r)
    setParadasEditando(
      r.coordenadasParadas && r.coordenadasParadas.length > 0
        ? [...r.coordenadasParadas]
        : [{ ...BASE_BEARS_RESERVE, nombre: 'Base Finca El Guadual' }]
    )
    setMinutosRalentiEditando(String(r.minutosRalenti || 35))
    setModalEditarRutaAbierto(true)
  }

  const moverParada = (index: number, direccion: -1 | 1) => {
    const nuevoIndex = index + direccion
    if (nuevoIndex < 0 || nuevoIndex >= paradasEditando.length) return
    const copia = [...paradasEditando]
    const temp = copia[index]
    copia[index] = copia[nuevoIndex]
    copia[nuevoIndex] = temp
    setParadasEditando(copia)
  }

  const eliminarParada = (index: number) => {
    if (paradasEditando.length <= 2) {
      alert('Una ruta debe tener al menos 2 puntos (origen y destino).')
      return
    }
    setParadasEditando(paradasEditando.filter((_, i) => i !== index))
  }

  const agregarParada = () => {
    const ref = PUNTOS_REFERENCIA_CALDAS[nuevoPuntoRefKey]
    if (!ref) return
    const nombre = nuevoPuntoNombreManual.trim() || ref.nombre
    setParadasEditando([...paradasEditando, { nombre, lat: ref.lat, lng: ref.lng }])
    setNuevoPuntoNombreManual('')
  }

  const guardarCambiosRuta = () => {
    if (!rutaEditando) return
    const minutosRalentiNum = Number(minutosRalentiEditando) || 30
    const rutaActualizada: RutaHabitual = {
      ...rutaEditando,
      coordenadasParadas: paradasEditando,
      minutosRalenti: minutosRalentiNum,
    }
    if (onActualizarRuta) {
      onActualizarRuta(rutaActualizada)
    }
    setModalEditarRutaAbierto(false)
    setFeedback(
      `✅ Trazado y paradas de "${rutaActualizada.nombre}" guardados. La ruta GPS en el mapa se actualizó.`
    )
    window.setTimeout(() => setFeedback(''), 4500)
  }

  // Despacho desde evento del Radar con Selección Inteligente de Gema
  const despacharDesdeEvento = (ev: EventoRadarLocal) => {
    const tipoDeducido =
      ev.titulo.toLowerCase().includes('camión') || ev.titulo.toLowerCase().includes('barrizal')
        ? 'rescate_barrizal'
        : ev.titulo.toLowerCase().includes('trasteo')
          ? 'transporte_humanitario'
          : 'auxilio_comunitario'

    // Gema analiza el evento cruzándolo con las notas de CashMet (4x4, winche, 5ta rueda, pasajeros)
    const seleccionGema = seleccionarVehiculosOptimosMision(
      {
        titulo: ev.titulo,
        tipo: tipoDeducido,
        impactoSocial: ev.resumen,
        terreno: 'trocha_moderada',
      },
      vehiculos
    )
    const vehiculoElegido = seleccionGema.vehiculoElegido

    // Gema arma la tripulación por rol entre quienes están de guardia en este momento
    const seleccionTripulacion = seleccionarTripulacionMision(
      { titulo: ev.titulo, tipo: tipoDeducido, impactoSocial: ev.resumen },
      vehiculoElegido ? [vehiculoElegido] : [],
      empleados,
      turnos,
      hoyFechaISO(),
      horaActualHHMM()
    )

    const geo =
      ev.lat && ev.lng
        ? calcularDistanciaRealDesdeBase(ev.lat, ev.lng, true)
        : { distanciaKmTotalIdaYVuelta: 32, tiempoMinutosRodamientoIdaYVuelta: 60 }

    const nueva: MisionComunitaria = {
      id: crearMisionId(),
      titulo: ev.titulo,
      tipo: tipoDeducido,
      prioridad: ev.esEmergenciaGrave ? 'critica_extrema' : 'alta',
      origen: BASE_BEARS_RESERVE.nombre,
      destino: ev.lugar,
      departamento: (ev.departamento as any) || 'Caldas',
      prioridadGeografica: ev.departamento === 'Caldas' ? 'local_manizales' : 'eje_cercano',
      terreno: 'trocha_moderada',
      distanciaKmIdaYVuelta: geo.distanciaKmTotalIdaYVuelta,
      duracionMinutos: geo.tiempoMinutosRodamientoIdaYVuelta + 90, // Desplazamiento + maniobra
      minutosRodamientoEstimados: geo.tiempoMinutosRodamientoIdaYVuelta,
      minutosRalentiEstimados: 35, // Maniobra con motor encendido
      latDestino: ev.lat,
      lngDestino: ev.lng,
      vehiculosAsignados: vehiculoElegido
        ? [{ id: vehiculoElegido.id, nombre: `${vehiculoElegido.marca} ${vehiculoElegido.linea}`, placa: vehiculoElegido.placa }]
        : [],
      tripulantesAsignados: seleccionTripulacion.tripulacion.map((t) => ({ id: t.id, nombre: t.nombre })),
      galonesConsumidosEstimados: Number((geo.distanciaKmTotalIdaYVuelta / 20).toFixed(1)),
      costoCombustibleEstimadoCOP: Math.round((geo.distanciaKmTotalIdaYVuelta / 20) * 15850),
      desgasteLlantasIncrementoPorc: 0.6,
      fecha: hoyFechaISO(),
      estado: 'en_curso',
      impactoSocial: ev.resumen,
      esNoticiaWebReal: ev.esNoticiaWebReal,
    }

    onCrearMision(nueva)
    setFeedback(`🚨 ¡Misión activada! ${seleccionGema.motivoGema} ${seleccionTripulacion.motivo} (${geo.distanciaKmTotalIdaYVuelta} km reales desde Finca El Guadual).`)
    window.setTimeout(() => setFeedback(''), 5500)
  }

  // Despachar misión manual
  const crearMisionManual = () => {
    const kmNum = Number(distanciaKm) || 25
    const minNum = Number(duracionMinutos) || 120

    const vehsObj = vehiculos
      .filter((v) => vehiculosSeleccionados.includes(v.id))
      .map((v) => ({ id: v.id, nombre: `${v.marca} ${v.linea}`, placa: v.placa }))

    const empsObj = empleados
      .filter((e) => tripulantesSeleccionados.includes(e.id))
      .map((e) => ({ id: e.id, nombre: e.nombreCompleto }))

    const nueva: MisionComunitaria = {
      id: crearMisionId(),
      titulo: titulo.trim(),
      tipo: esProgramada ? 'transporte_humanitario' : 'auxilio_comunitario',
      prioridad: 'alta',
      origen: 'Base Central Bear\'s Reserve',
      destino: destino.trim(),
      departamento: 'Caldas',
      prioridadGeografica: 'local_manizales',
      terreno,
      distanciaKmIdaYVuelta: kmNum,
      duracionMinutos: minNum,
      vehiculosAsignados: vehsObj,
      tripulantesAsignados: empsObj,
      galonesConsumidosEstimados: Number((kmNum / 20).toFixed(1)),
      costoCombustibleEstimadoCOP: Math.round((kmNum / 20) * 15850),
      desgasteLlantasIncrementoPorc: 0.5,
      fecha: fechaMision,
      estado: esProgramada ? 'programada' : 'en_curso',
      impactoSocial: 'Asistencia y apoyo directo a familias campesinas sin ánimo de lucro.',
      esNoticiaWebReal: false,
    }

    onCrearMision(nueva)
    setModalAbierto(false)
    setFeedback(`✅ Misión ${esProgramada ? 'agendada en el calendario' : 'despachada'}: "${nueva.titulo}"`)
    window.setTimeout(() => setFeedback(''), 4000)
  }

  // Completar misión con desenlace realista
  const finalizarMision = async (
    id: string,
    resultado: 'exito' | 'parcial' | 'fallida_dificultad' = 'exito'
  ) => {
    setBusyId(id)
    try {
      const res = await onCompletarMision(id, resultado)
      let msg = `🏁 Misión finalizada (${resultado.toUpperCase()}). Se actualizó el odómetro en CashMet y se archivó la crónica de campo.`
      if (res.tanqueosAutomaticos && res.tanqueosAutomaticos.length > 0) {
        msg += ` ⛽ Se activó auto-tanqueo al 100% por entrar en reserva y se cargó a la tarjeta de combustible.`
      }
      setFeedback(msg)
    } finally {
      setBusyId(null)
    }
  }

  const eventosFiltrados = eventosRadar
    .filter((ev) => !ev.id.includes('standby') && !ev.titulo.toLowerCase().includes('standby'))
    .filter((ev) => {
      if (filtroRadar === 'caldas') return ev.departamento === 'Caldas'
      if (filtroRadar === 'otros') return ev.departamento !== 'Caldas'
      return true
    })

  const misionesCompletadas = misiones.filter((m) => m.estado === 'completada')
  const misionesActivas = misiones.filter((m) => m.estado !== 'completada')

  return (
    <div className="space-y-4 text-xs">
      {feedback && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 font-bold text-emerald-200 shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Sub-navegación: Radar vs Crónicas vs Rutas Habituales */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSubVista('mapa')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-extrabold transition ${
              subVista === 'mapa'
                ? 'bg-gradient-to-r from-amber-500/30 to-emerald-500/20 text-white border border-amber-400/40 shadow-md'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            <MapIcon className="h-4 w-4 text-amber-300" />
            <span>Mapa Táctico de Rutas</span>
          </button>

          <button
            type="button"
            onClick={() => setSubVista('radar')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-extrabold transition ${
              subVista === 'radar'
                ? 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            <Radio className="h-4 w-4" />
            <span>Radar & Contingencias</span>
            {misionesActivas.length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white">
                {misionesActivas.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubVista('cronicas')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-extrabold transition ${
              subVista === 'cronicas'
                ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Bitácora de Crónicas ({misionesCompletadas.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubVista('rutas_habituales')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-extrabold transition ${
              subVista === 'rutas_habituales'
                ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30'
                : 'bg-white/[0.04] text-mist-400 hover:text-white'
            }`}
          >
            <Route className="h-4 w-4" />
            <span>Rutas Habituales Fijas ({rutasHabituales.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1.5 font-black text-[#2a1702] transition hover:brightness-110"
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>+ Despachar / Programar Salida</span>
        </button>
      </div>

      {/* ----------------- VISTA 0: MAPA TÁCTICO DE OPERACIONES ----------------- */}
      {subVista === 'mapa' && (
        <MapaOperaciones
          eventosRadar={eventosRadar}
          misiones={misiones}
          rutasHabituales={rutasHabituales}
          misionSeleccionada={misionesActivas[0] || null}
          onActualizarRuta={onActualizarRuta}
        />
      )}

      {/* ----------------- VISTA 1: RADAR DE EVENTOS ----------------- */}
      {subVista === 'radar' && (
        <div className="space-y-4">
          {/* Misiones en curso si las hay */}
          {misionesActivas.length > 0 && (
            <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/[0.06] p-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Compass className="h-4 w-4 text-emerald-300 animate-spin" />
                <h3 className="font-extrabold text-white">Misiones en Desarrollo ({misionesActivas.length})</h3>
              </div>

              <div className="mt-3 space-y-3">
                {misionesActivas.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-400/25 bg-black/40 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-sm">{m.titulo}</span>
                        <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-black text-emerald-300 uppercase animate-pulse">
                          {m.estado}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-mist-400">
                        <span>Destino: <b className="text-white">{m.destino}</b></span>
                        <span>· Distancia: <b className="text-white">{m.distanciaKmIdaYVuelta} km</b></span>
                        <span>
                          · Flota:{' '}
                          <b className="text-amber-300">
                            {m.vehiculosAsignados?.map((v) => v.nombre).join(', ') || 'Flota general'}
                          </b>
                        </span>
                      </div>
                      <p className="text-mist-300 text-[11px]">{m.impactoSocial}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => finalizarMision(m.id, 'exito')}
                        className="cursor-pointer rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1.5 font-black text-[#04241a] transition hover:brightness-110 disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5 inline mr-1" />
                        <span>Éxito</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => finalizarMision(m.id, 'parcial')}
                        className="cursor-pointer rounded-xl border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 font-bold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-40"
                      >
                        <span>Parcial (Barro)</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => finalizarMision(m.id, 'fallida_dificultad')}
                        className="cursor-pointer rounded-xl border border-red-400/30 bg-red-400/10 px-2.5 py-1.5 font-bold text-red-300 transition hover:bg-red-400/20 disabled:opacity-40"
                      >
                        <span>Repliegue</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Radar principal */}
          <div className="rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] via-black/30 to-night-900 p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
                  <Radio className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-black text-white">Radar de Eventos, Llamadas y Contingencias</h2>
                  <p className="text-[11px] text-mist-400">
                    Monitoreo en vivo de Manizales y municipios vecinos.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFiltroRadar('todos')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    filtroRadar === 'todos' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroRadar('caldas')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    filtroRadar === 'caldas' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400'
                  }`}
                >
                  Manizales & Caldas
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroRadar('otros')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    filtroRadar === 'otros' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400'
                  }`}
                >
                  Vecinos
                </button>

                <button
                  type="button"
                  onClick={ejecutarEscaneoRadar}
                  disabled={escaneandoRadar}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-200 hover:bg-sky-500/25 transition disabled:opacity-50"
                  title="Escanear frecuencias de radio y boletines viales para captar nuevas emergencias con Gema"
                >
                  <RefreshCw className={`h-3 w-3 ${escaneandoRadar ? 'animate-spin' : ''}`} />
                  <span>{escaneandoRadar ? 'Escaneando...' : 'Escanear con Gema'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalReportarAbierto(true)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25 transition"
                  title="Registrar llamada veredal recibida"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ Llamada Veredal</span>
                </button>
              </div>
            </div>

            {eventosFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-mist-400 my-4 space-y-2">
                <span className="text-3xl">📻</span>
                <div className="font-extrabold text-white text-xs">
                  Sin contingencias activas en este filtro
                </div>
                <p className="text-[11px] text-mist-400 max-w-sm mx-auto">
                  La guardia comunitaria está tranquila en base. Usa "Escanear con Gema" para sintonizar nuevas frecuencias o pulsa "+ Llamada Veredal" para reportar un auxilio.
                </p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {eventosFiltrados.map((ev) => {
                  const esCaldas = ev.departamento === 'Caldas'
                  const estaEnCurso = misionesActivas.some((m) => m.titulo === ev.titulo)

                  return (
                    <div
                      key={ev.id}
                      className={`space-y-2.5 rounded-2xl border p-3.5 ${
                        ev.recomendacionGema === 'intervenir_urgente'
                          ? 'border-red-400/40 bg-red-500/10'
                          : 'border-white/[0.08] bg-black/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-extrabold text-white sm:text-sm flex items-start gap-1.5">
                          {ev.esNoticiaWebReal ? (
                            <span
                              title="Acontecimiento real extraído de internet / prensa"
                              className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-sky-400/20 text-sky-300 text-[10px] font-black shrink-0 mt-0.5 border border-sky-400/30"
                            >
                              ✓
                            </span>
                          ) : (
                            <span
                              title="Llamada comunitaria veredal"
                              className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-black shrink-0 mt-0.5"
                            >
                              📻
                            </span>
                          )}
                          <span>{ev.titulo}</span>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                            esCaldas
                              ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                              : 'border border-amber-400/30 bg-amber-400/15 text-amber-300'
                          }`}
                        >
                          {ev.departamento}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-mist-400">
                        <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>{ev.lugar}</span>
                        <span className="text-mist-600">· {ev.fuenteNoticia}</span>
                      </div>

                      <p className="text-[11px] leading-relaxed text-mist-300">{ev.resumen}</p>

                      <div className="rounded-xl border border-white/[0.06] bg-black/40 p-2 text-[11px]">
                        <div className="flex items-center gap-1 font-bold text-amber-300">
                          <Sparkles className="h-3 w-3" />
                          <span>Criterio de Gema:</span>
                        </div>
                        <p className="text-mist-300">{ev.justificacionGema}</p>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                        <div className="flex items-center gap-2 text-[10px] text-mist-500">
                          <span>{ev.fecha}</span>
                          {onDescartarEventoRadar && (
                            <button
                              type="button"
                              onClick={() => onDescartarEventoRadar(ev.id)}
                              className="cursor-pointer text-mist-500 hover:text-rose-400 transition ml-1"
                              title="Descartar este evento del radar"
                            >
                              <Trash2 className="h-3 w-3 inline mr-0.5" /> Descartar
                            </button>
                          )}
                        </div>

                        {estaEnCurso ? (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-400/15 border border-emerald-400/30 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                            <Check className="h-3 w-3" /> Misión en desarrollo
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => despacharDesdeEvento(ev)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1 font-black text-[#2a1702] transition hover:brightness-110 active:scale-95"
                            title={
                              ev.departamento !== 'Caldas'
                                ? 'Misión fuera de Caldas: Es decisión tuya despachar el auxilio.'
                                : 'Despachar auxilio comunitario'
                            }
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span>Despachar Misión</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- VISTA 2: BITÁCORA DE CRÓNICAS (HISTORIAL HUMANO) ----------------- */}
      {subVista === 'cronicas' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-500/[0.06] via-black/40 to-night-900 p-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/20 text-sky-300">
                <BookOpen className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Bitácora de Crónicas y Relatos de Campo ({misionesCompletadas.length})
                </h3>
                <p className="text-[11px] text-mist-400">
                  Historial narrado de forma humana: duración, kilómetros, flota participante y desenlace real de cada servicio comunitario.
                </p>
              </div>
            </div>

            {misionesCompletadas.length === 0 ? (
              <div className="p-8 text-center text-mist-500">
                <p className="font-bold text-mist-300">Aún no hay crónicas archivadas.</p>
                <p className="text-[11px]">Cuando completes una misión, se redactará aquí su relato operativo.</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {misionesCompletadas.map((m) => {
                  const horasMin =
                    m.duracionMinutos < 60
                      ? `${m.duracionMinutos} min`
                      : `${(m.duracionMinutos / 60).toFixed(1)} h`

                  return (
                    <div
                      key={m.id}
                      className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs shadow-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-white">{m.titulo}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                              m.resultado === 'exito'
                                ? 'bg-emerald-400/20 text-emerald-300'
                                : m.resultado === 'parcial'
                                  ? 'bg-amber-400/20 text-amber-300'
                                  : 'bg-red-400/20 text-red-300'
                            }`}
                          >
                            {m.resultado === 'exito' ? 'Éxito' : m.resultado === 'parcial' ? 'Parcial' : 'Repliegue'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-mist-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-amber-300" />
                            {horasMin}
                          </span>
                          <span className="flex items-center gap-1">
                            <Navigation className="h-3 w-3 text-emerald-300" />
                            {m.distanciaKmIdaYVuelta} km
                          </span>
                          <span className="text-mist-500">{m.fecha}</span>
                        </div>
                      </div>

                      {/* Crónica narrativa humana */}
                      <p className="leading-relaxed text-slate-200 text-[11.5px] italic bg-black/30 rounded-xl p-3 border border-white/[0.04]">
                        &ldquo;{m.cronicaHistoria || m.impactoSocial}&rdquo;
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-mist-400 border-t border-white/[0.04] pt-2">
                        <div>
                          Flota:{' '}
                          <span className="text-white font-medium">
                            {m.vehiculosAsignados?.map((v) => v.nombre).join(', ') || 'General'}
                          </span>
                        </div>
                        <div>
                          Tripulación:{' '}
                          <span className="text-amber-200 font-medium">
                            {m.tripulantesAsignados?.map((t) => t.nombre).join(', ') || 'Guardia de turno'}
                          </span>
                        </div>
                        <div>
                          Consumo estimado:{' '}
                          <span className="text-emerald-300 font-medium">
                            ~{m.galonesConsumidosEstimados} galones
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- VISTA 3: RUTAS HABITUALES FIJAS ----------------- */}
      {subVista === 'rutas_habituales' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.06] via-black/40 to-night-900 p-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300">
                <Route className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-white">Rutas Habituales y Servicios Recurrentes</h3>
                <p className="text-[11px] text-mist-400">
                  Separadas del radar para no saturarlo. Incluye transporte de niños veredales a escuelas rurales y apoyo fijo a campesinos.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rutasHabituales.map((r) => {
                return (
                  <div
                    key={r.id}
                    className="space-y-2.5 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold text-white">{r.nombre}</div>
                        {r.esAutomatica && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-300">
                            ⚡ Autoejecutable a las {r.horaSalida || '06:00'} (Lunes a Viernes)
                          </span>
                        )}
                      </div>
                      <span className="rounded-full bg-emerald-400/15 border border-emerald-400/30 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                        {r.distanciaKm} km
                      </span>
                    </div>

                    <p className="text-mist-300 text-[11px] leading-relaxed">{r.descripcion}</p>

                    <div className="flex flex-wrap gap-2 text-[10px] text-mist-400">
                      <span>Rodamiento: <b className="text-white">{r.minutosRodamiento || 55} min</b></span>
                      <span>· Ralentí en paradas: <b className="text-amber-300">{r.minutosRalenti || 35} min</b></span>
                      <span>· Total tiempo: <b className="text-sky-300">~{r.duracionMinutos || 90} min</b></span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-mist-400">
                      <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span>
                        {r.origen} ↔ {r.destino}
                      </span>
                    </div>

                    {/* Selector y cambio de vehículo asignado para la ruta habitual */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                      <span className="text-[10px] font-bold text-mist-400">Vehículo asignado a esta ruta:</span>
                      <select
                        value={r.vehiculoIdDefault || ''}
                        onChange={(e) => {
                          const nuevoId = e.target.value
                          const rutaActualizada: RutaHabitual = {
                            ...r,
                            vehiculoIdDefault: nuevoId || undefined,
                          }
                          if (onActualizarRuta) onActualizarRuta(rutaActualizada)
                        }}
                        className="field-dark h-7 rounded-lg px-2 text-[10px] font-semibold text-amber-200"
                      >
                        <option value="">Auto-asignar por IA (Gema según capacidad)</option>
                        {vehiculos
                          .filter((v) => v.disponibleParaTrabajo)
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.marca} {v.linea} {v.placa ? `(${v.placa})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Conductor: lo fija el cuadrante semanal que arma Gema */}
                    {(() => {
                      const conductor = obtenerConductorRuta(r.id, hoyFechaISO())
                      const esHueco = conductor.id === 'coord-user'
                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                          <span className="text-[10px] font-bold text-mist-400">👤 Conductor hoy (cuadrante):</span>
                          <span className={`text-[10px] font-bold ${esHueco ? 'text-rose-300' : 'text-sky-200'}`}>
                            {conductor.nombre}
                            {esHueco && ' · hueco en el cuadrante'}
                          </span>
                        </div>
                      )
                    })()}

                    <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                      <span className="text-[10px] text-mist-500">
                        {r.ultimoCumplimientoFecha
                          ? `Último registro: ${r.ultimoCumplimientoFecha}`
                          : 'Ruta activa diaria'}
                      </span>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => abrirEditorRuta(r)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-mist-300 hover:bg-white/10 hover:text-white transition"
                        >
                          <Pencil className="h-3 w-3 text-amber-300" />
                          <span>Definir / Editar Paradas</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onCumplirRutaHabitual(r, r.vehiculoIdDefault)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1 font-black text-[#04241a] transition hover:brightness-110"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{r.esAutomatica ? 'Despacho Manual Anticipado' : 'Cumplir Ruta'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal para agendar misión programada o manual */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="surface-glow w-full max-w-lg rounded-3xl border border-white/15 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-extrabold text-white">Despachar o Programar Misión Comunitaria</h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-mist-400 font-bold">Título de la misión o llamado</span>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="field-dark h-9 rounded-xl px-2.5 text-xs"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-mist-400 font-bold">Destino (Vereda / Sector rural)</span>
                <input
                  type="text"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className="field-dark h-9 rounded-xl px-2.5 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-mist-400 font-bold">Distancia ida y vuelta (km)</span>
                  <input
                    type="number"
                    value={distanciaKm}
                    onChange={(e) => setDistanciaKm(e.target.value)}
                    className="field-dark h-9 rounded-xl px-2.5 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-mist-400 font-bold">Duración estimada (minutos)</span>
                  <input
                    type="number"
                    value={duracionMinutos}
                    onChange={(e) => setDuracionMinutos(e.target.value)}
                    className="field-dark h-9 rounded-xl px-2.5 text-xs"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-mist-400 font-bold">Terreno de montaña</span>
                <select
                  value={terreno}
                  onChange={(e) => setTerreno(e.target.value as any)}
                  className="field-dark h-9 rounded-xl px-2 text-xs"
                >
                  <option value="trocha_moderada">Trocha moderada (Vereda destapada)</option>
                  <option value="trocha_extrema_barrizal">Barrizal extremo / Trocha pesada con winche</option>
                  <option value="mixto_montaña">Mixto montaña / Curvas pavimentadas</option>
                  <option value="pavimento">Pavimento troncal</option>
                </select>
              </label>

              {/* Selección de vehículos habilitados */}
              <div className="flex flex-col gap-1">
                <span className="text-mist-400 font-bold">Vehículo(s) participante(s)</span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-2">
                  {vehiculos
                    .filter((v) => v.disponibleParaTrabajo)
                    .map((v) => {
                      const sel = vehiculosSeleccionados.includes(v.id)
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            if (sel) {
                              setVehiculosSeleccionados(vehiculosSeleccionados.filter((x) => x !== v.id))
                            } else {
                              setVehiculosSeleccionados([...vehiculosSeleccionados, v.id])
                            }
                          }}
                          className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                            sel ? 'bg-amber-400/20 text-amber-200 border border-amber-400/30' : 'bg-white/[0.04] text-mist-400'
                          }`}
                        >
                          {sel ? '✓ ' : ''}{v.marca} {v.linea}
                        </button>
                      )
                    })}
                </div>
              </div>

              {/* Selección de personal asignado */}
              <div className="flex flex-col gap-1">
                <span className="text-mist-400 font-bold">Tripulante(s) asignado(s)</span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-2">
                  {empleados
                    .filter((e) => e.activo)
                    .map((e) => {
                      const sel = tripulantesSeleccionados.includes(e.id)
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            if (sel) {
                              setTripulantesSeleccionados(tripulantesSeleccionados.filter((x) => x !== e.id))
                            } else {
                              setTripulantesSeleccionados([...tripulantesSeleccionados, e.id])
                            }
                          }}
                          className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                            sel ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' : 'bg-white/[0.04] text-mist-400'
                          }`}
                        >
                          {sel ? '✓ ' : ''}{e.nombreCompleto}
                        </button>
                      )
                    })}
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-white/[0.08] pt-2">
                <label className="flex cursor-pointer items-center gap-1.5 font-bold text-mist-300">
                  <input
                    type="checkbox"
                    checked={esProgramada}
                    onChange={(e) => setEsProgramada(e.target.checked)}
                    className="h-4 w-4 accent-emerald-400"
                  />
                  <span>Es un trabajo programado en el calendario</span>
                </label>

                {esProgramada && (
                  <input
                    type="date"
                    value={fechaMision}
                    onChange={(e) => setFechaMision(e.target.value)}
                    className="field-dark h-8 rounded-lg px-2 text-xs"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={crearMisionManual}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2 font-black text-[#2a1702]"
              >
                {esProgramada ? 'Agendar Misión' : 'Despachar Inmediatamente'}
              </button>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor de Trazado de Rutas Habituales */}
      {modalEditarRutaAbierto && rutaEditando && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="surface-glow w-full max-w-lg rounded-3xl border border-sky-400/25 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Definir Trazado y Paradas: {rutaEditando.nombre}
                </h3>
                <p className="text-[11px] text-mist-400">
                  Organiza el orden de paradas por donde debe pasar el vehículo. El mapa calculará el recorrido exacto por carretera.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalEditarRutaAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-3">
              {/* Lista de paradas actuales */}
              <div>
                <div className="text-[11px] font-bold text-mist-300 mb-1.5 flex items-center justify-between">
                  <span>Secuencia de Paradas ({paradasEditando.length} puntos)</span>
                  <span className="text-[10px] text-mist-500">Usa ▲ y ▼ para cambiar el orden</span>
                </div>

                <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {paradasEditando.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/40 p-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-[10px] font-black text-sky-300">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-white truncate">{p.nombre}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moverParada(idx, -1)}
                          className="cursor-pointer rounded-lg bg-white/[0.06] p-1 text-mist-300 hover:text-white disabled:opacity-20"
                          title="Subir parada"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === paradasEditando.length - 1}
                          onClick={() => moverParada(idx, 1)}
                          className="cursor-pointer rounded-lg bg-white/[0.06] p-1 text-mist-300 hover:text-white disabled:opacity-20"
                          title="Bajar parada"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarParada(idx)}
                          className="cursor-pointer rounded-lg bg-red-400/10 p-1 text-red-300 hover:bg-red-400/20"
                          title="Eliminar parada"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agregar nueva parada a la secuencia */}
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-2">
                <span className="text-[10px] font-bold text-amber-300 uppercase">
                  + Agregar Parada o Vereda a la Ruta:
                </span>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={nuevoPuntoRefKey}
                    onChange={(e) => setNuevoPuntoRefKey(e.target.value)}
                    className="field-dark h-8 rounded-xl px-2 text-[11px]"
                  >
                    {Object.entries(PUNTOS_REFERENCIA_CALDAS).map(([key, ref]) => (
                      <option key={key} value={key}>
                        {ref.nombre}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Nombre o indicación personalizada..."
                    value={nuevoPuntoNombreManual}
                    onChange={(e) => setNuevoPuntoNombreManual(e.target.value)}
                    className="field-dark h-8 rounded-xl px-2.5 text-[11px]"
                  />
                </div>

                <button
                  type="button"
                  onClick={agregarParada}
                  className="w-full cursor-pointer rounded-xl border border-sky-400/40 bg-sky-400/10 py-1.5 font-bold text-sky-200 hover:bg-sky-400/20 transition flex items-center justify-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Insertar Parada al Final de la Secuencia</span>
                </button>
              </div>

              {/* Ajuste de tiempo al ralentí */}
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-2">
                <span className="text-mist-400 font-bold">Minutos de espera / ralentí en paradas:</span>
                <input
                  type="number"
                  value={minutosRalentiEditando}
                  onChange={(e) => setMinutosRalentiEditando(e.target.value)}
                  className="field-dark h-8 w-20 rounded-lg px-2 text-center text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={guardarCambiosRuta}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-sky-400 to-teal-400 py-2 font-black text-[#04241a] hover:brightness-110"
              >
                Guardar Trazado de Ruta
              </button>
              <button
                type="button"
                onClick={() => setModalEditarRutaAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para reportar nueva llamada o contingencia al Radar */}
      {modalReportarAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="surface-glow w-full max-w-lg rounded-3xl border border-amber-400/25 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Registrar Nueva Contingencia o Llamada Veredal
                </h3>
                <p className="text-[11px] text-mist-400">
                  Agrega una situación reportada por radio, teléfono o vecinos al Radar activo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalReportarAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-2.5">
              <label className="flex flex-col gap-1">
                <span className="font-bold text-mist-400">Título o motivo de la emergencia</span>
                <input
                  type="text"
                  value={reporteTitulo}
                  onChange={(e) => setReporteTitulo(e.target.value)}
                  placeholder="Ej: Camión lechero atascado en barro cerca a escuela"
                  className="field-dark h-8 rounded-xl px-2.5 text-xs text-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-400">Lugar / Vereda</span>
                  <input
                    type="text"
                    value={reporteLugar}
                    onChange={(e) => setReporteLugar(e.target.value)}
                    placeholder="Vereda o sector específico"
                    className="field-dark h-8 rounded-xl px-2.5 text-xs text-white"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-400">Departamento</span>
                  <input
                    type="text"
                    value={reporteDepartamento}
                    onChange={(e) => setReporteDepartamento(e.target.value)}
                    placeholder="Caldas, Antioquia, Tolima..."
                    className="field-dark h-8 rounded-xl px-2.5 text-xs text-white"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-bold text-mist-400">Detalles de la situación / llamada</span>
                <textarea
                  value={reporteResumen}
                  onChange={(e) => setReporteResumen(e.target.value)}
                  placeholder="Describe lo que reportan los campesinos o conductores (daños, personas, necesidad de winche o carga)..."
                  rows={3}
                  className="field-dark rounded-xl p-2 text-xs text-white"
                />
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/40 p-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reporteGrave}
                  onChange={(e) => setReporteGrave(e.target.checked)}
                  className="h-4 w-4 rounded accent-red-500"
                />
                <span className="font-bold text-white text-[11px]">
                  Emergencia crítica / requiere intervención urgente
                </span>
              </label>
            </div>

            <div className="flex gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={guardarNuevoReporte}
                disabled={!reporteTitulo.trim()}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2 font-black text-[#2a1702] hover:brightness-110 disabled:opacity-40"
              >
                Agregar al Radar de Operaciones
              </button>
              <button
                type="button"
                onClick={() => setModalReportarAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
