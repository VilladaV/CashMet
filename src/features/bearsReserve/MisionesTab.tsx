import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ExternalLink,
  Play,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import MapaOperaciones from './MapaOperaciones'
import { construirIdCumplimientoRuta } from './constants'
import {
  calcularDistanciaRutaParadas,
  estimarLogisticaMisionDesdeBase,
  formatearDuracionCorta,
  BASE_BEARS_RESERVE,
  PUNTOS_REFERENCIA_CALDAS,
  resolverCoordenadasLugar,
} from './geo'
import { trazarRutaCarreteraGps } from './ruteoGps'
import { seleccionarConvoyMisionConIA } from './gemaAI'
import {
  conductorDeRutaEnCuadrante,
  seleccionarVehiculosOptimosMision,
  seleccionarTripulacionMision,
} from './gemaEngine'
import { hoyISO, isoLocal } from '@/lib/fechas'

let counterMision = 1
function crearMisionId(): string {
  const rand = Math.random().toString(36).slice(2, 6)
  return `mis-${Date.now()}-${counterMision++}-${rand}`
}

function horaActualHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function mananaISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return isoLocal(d)
}

function textoVigenciaRestante(expiraEn?: number, ahora = Date.now()): string {
  if (!expiraEn) return 'Vigente hoy'
  const diff = expiraEn - ahora
  if (diff <= 0) return 'Vencida'
  const horas = Math.max(1, Math.ceil(diff / (60 * 60 * 1000)))
  if (horas >= 24) {
    const dias = Math.floor(horas / 24)
    const rem = horas % 24
    return rem > 0 ? `Caduca en ${dias}d ${rem}h` : `Caduca en ${dias}d`
  }
  return `Caduca en ${horas}h`
}

interface Props {
  misiones: MisionComunitaria[]
  vehiculos: VehiculoOperativo[]
  empleados: EmpleadoOperativo[]
  turnos?: TurnoSemanal[]
  rutasHabituales: RutaHabitual[]
  eventosRadar: EventoRadarLocal[]
  diagnosticoRadar?: string
  onCrearMision: (mision: MisionComunitaria) => Promise<void> | void
  onIniciarMisionProgramada?: (id: string) => Promise<void>
  onCancelarMisionProgramada?: (id: string) => Promise<void>
  onCumplirRutaHabitual: (ruta: RutaHabitual, vehiculoId?: string) => Promise<void>
  onActualizarRuta?: (ruta: RutaHabitual) => Promise<void> | void
  onDescartarEventoRadar?: (id: string) => Promise<void> | void
  onEscanearRadarReal?: () => Promise<{
    eventos: EventoRadarLocal[]
    noticiasRealesAgregadas: number
    llamadasAgregadas: number
    diagnosticoWeb?: string
  }>
  onAgregarEventoRadar?: (ev: EventoRadarLocal) => Promise<void> | void
}

type SubVistaMisiones = 'radar' | 'mapa' | 'cronicas' | 'rutas_habituales'

export default function MisionesTab({
  misiones,
  vehiculos,
  empleados,
  turnos = [],
  rutasHabituales,
  eventosRadar,
  diagnosticoRadar,
  onCrearMision,
  onIniciarMisionProgramada,
  onCancelarMisionProgramada,
  onCumplirRutaHabitual,
  onActualizarRuta,
  onDescartarEventoRadar,
  onEscanearRadarReal,
  onAgregarEventoRadar,
}: Props) {
  const [subVista, setSubVista] = useState<SubVistaMisiones>('radar')
  const [filtroRadar, setFiltroRadar] = useState<'todos' | 'caldas' | 'otros'>('todos')
  const [busyRutaId, setBusyRutaId] = useState<string | null>(null)
  const [busyMisionId, setBusyMisionId] = useState<string | null>(null)
  const [busyDescartarId, setBusyDescartarId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const feedbackTimerRef = useRef<number | null>(null)

  // Memoizar arreglos pasados a MapaOperaciones para evitar reconstrucción innecesaria del mapa
  const misionesEnCurso = useMemo(
    () => misiones.filter((m) => m.estado === 'en_curso'),
    [misiones]
  )
  const misionesProgramadas = useMemo(
    () => misiones.filter((m) => m.estado === 'programada'),
    [misiones]
  )
  const misionesCerradas = useMemo(
    () =>
      misiones.filter(
        (m) => m.estado === 'completada' || m.estado === 'inconclusa_repliegue'
      ),
    [misiones]
  )
  const eventosMapa = useMemo(
    () =>
      eventosRadar.filter(
        (ev) => !ev.id.includes('standby') && !ev.titulo.toLowerCase().includes('standby')
      ),
    [eventosRadar]
  )

  const tieneTemporizadoresEnRadar = useMemo(
    () => misionesEnCurso.length > 0 || eventosMapa.some((ev) => Boolean(ev.expiraEn)),
    [misionesEnCurso, eventosMapa]
  )

  // Actualizar reloj cada 15s SOLO cuando la vista radar está activa y hay misiones en curso o eventos con vigencia
  useEffect(() => {
    if (subVista !== 'radar' || !tieneTemporizadoresEnRadar) return
    const id = window.setInterval(() => setAhoraMs(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [subVista, tieneTemporizadoresEnRadar])

  // Limpiar timeout de feedback al desmontar
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  const mostrarFeedback = useCallback((tipo: 'ok' | 'error', texto: string, ms = 5500) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current)
    }
    setFeedback({ tipo, texto })
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback((prev) => (prev?.texto === texto ? null : prev))
      feedbackTimerRef.current = null
    }, ms)
  }, [])

  // Estados para radar dinámico
  const [escaneandoRadar, setEscaneandoRadar] = useState(false)
  const [despachandoEventoId, setDespachandoEventoId] = useState<string | null>(null)
  const [modalReportarAbierto, setModalReportarAbierto] = useState(false)
  const [guardandoReporte, setGuardandoReporte] = useState(false)
  const [reporteTitulo, setReporteTitulo] = useState('')
  const [reporteLugar, setReporteLugar] = useState('Vereda San Peregrino · Caldas')
  const [reporteDepartamento, setReporteDepartamento] = useState('Caldas')
  const [reporteResumen, setReporteResumen] = useState('')
  const [reporteGrave, setReporteGrave] = useState(false)

  // Formulario de nueva misión manual o programada
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardandoMision, setGuardandoMision] = useState(false)
  const [titulo, setTitulo] = useState('Apoyo Comunitario y Traslado de Víveres')
  const [destino, setDestino] = useState('Vereda La Cabaña · Manizales')
  const [distanciaKm, setDistanciaKm] = useState('28')
  const [duracionMinutos, setDuracionMinutos] = useState('90')
  const [terreno, setTerreno] = useState<MisionComunitaria['terreno']>('trocha_moderada')
  const [vehiculosSeleccionados, setVehiculosSeleccionados] = useState<string[]>([])
  const [tripulantesSeleccionados, setTripulantesSeleccionados] = useState<string[]>([])
  const [esProgramada, setEsProgramada] = useState(false)
  const [fechaMision, setFechaMision] = useState(hoyISO)
  const [errorModal, setErrorModal] = useState('')

  // Editor de trazado de rutas habituales
  const [modalEditarRutaAbierto, setModalEditarRutaAbierto] = useState(false)
  const [guardandoRuta, setGuardandoRuta] = useState(false)
  const [rutaEditando, setRutaEditando] = useState<RutaHabitual | null>(null)
  const [paradasEditando, setParadasEditando] = useState<
    Array<{ nombre: string; lat: number; lng: number }>
  >([])
  const [nuevoPuntoRefKey, setNuevoPuntoRefKey] = useState('la_cabana')
  const [nuevoPuntoNombreManual, setNuevoPuntoNombreManual] = useState('')
  const [minutosRalentiEditando, setMinutosRalentiEditando] = useState('35')

  // Cerrar modales con Escape
  useEffect(() => {
    if (!modalAbierto && !modalEditarRutaAbierto && !modalReportarAbierto) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (modalReportarAbierto && !guardandoReporte) setModalReportarAbierto(false)
      else if (modalEditarRutaAbierto && !guardandoRuta) setModalEditarRutaAbierto(false)
      else if (modalAbierto && !guardandoMision) setModalAbierto(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    modalAbierto,
    modalEditarRutaAbierto,
    modalReportarAbierto,
    guardandoReporte,
    guardandoRuta,
    guardandoMision,
  ])

  const ejecutarEscaneoRadar = async () => {
    if (!onEscanearRadarReal || escaneandoRadar) return
    setEscaneandoRadar(true)
    try {
      const res = await onEscanearRadarReal()
      const partes: string[] = []
      if (res.noticiasRealesAgregadas > 0) {
        partes.push(`${res.noticiasRealesAgregadas} noticia(s) web real(es)`)
      }
      if (res.llamadasAgregadas > 0) {
        partes.push(`${res.llamadasAgregadas} llamada(s) comunitaria(s) fresca(s)`)
      }
      if (partes.length > 0) {
        mostrarFeedback(
          'ok',
          `📡 Radar actualizado: ${partes.join(' y ')}. ${res.diagnosticoWeb || ''}`.trim()
        )
      } else {
        mostrarFeedback(
          'ok',
          res.diagnosticoWeb ||
            '📡 Frecuencias escaneadas. Se purgaron eventos vencidos; no hay alertas nuevas adicionales por ahora.'
        )
      }
    } catch {
      mostrarFeedback('error', 'No se pudo completar el escaneo del radar en este momento.')
    } finally {
      setEscaneandoRadar(false)
    }
  }

  const guardarNuevoReporte = async () => {
    if (!reporteTitulo.trim() || guardandoReporte) return
    setGuardandoReporte(true)
    try {
      const coords = resolverCoordenadasLugar(reporteLugar, reporteDepartamento)
      const ahora = Date.now()
      const rand = Math.random().toString(36).slice(2, 6)
      const nuevo: EventoRadarLocal = {
        id: `rad-man-${ahora}-${rand}`,
        titulo: reporteTitulo.trim(),
        lugar: reporteLugar.trim() || 'Manizales · Caldas',
        departamento: reporteDepartamento.trim() || 'Caldas',
        lat: coords.lat,
        lng: coords.lng,
        fuenteNoticia: "Llamada directa a Guardia Bear's Reserve",
        resumen: reporteResumen.trim() || 'Llamada comunitaria solicitando apoyo.',
        fecha: hoyISO(),
        creadoEn: ahora,
        expiraEn: ahora + 36 * 60 * 60 * 1000,
        esEmergenciaGrave: reporteGrave,
        atencionOficialPresente: false,
        esNoticiaWebReal: false,
        recomendacionGema: reporteGrave ? 'intervenir_urgente' : 'apoyo_logistico',
        justificacionGema:
          'Situación reportada directamente por la comunidad veredal. Evaluar disponibilidad y alistar dotación.',
      }
      if (onAgregarEventoRadar) {
        await onAgregarEventoRadar(nuevo)
      }
      setModalReportarAbierto(false)
      setReporteTitulo('')
      setReporteLugar('Vereda San Peregrino · Caldas')
      setReporteDepartamento('Caldas')
      setReporteResumen('')
      setReporteGrave(false)
      mostrarFeedback('ok', `📻 ¡Llamada veredal "${nuevo.titulo}" registrada en el Radar!`)
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudo registrar la llamada veredal.'
      )
    } finally {
      setGuardandoReporte(false)
    }
  }

  const abrirModalNuevaMision = () => {
    setErrorModal('')
    const libre = vehiculos.find(
      (v) => v.disponibleParaTrabajo && v.estado !== 'en_mision' && v.estado !== 'mantenimiento'
    )
    const empActivo = empleados.find((e) => e.activo)
    setVehiculosSeleccionados(libre ? [libre.id] : [])
    setTripulantesSeleccionados(empActivo ? [empActivo.id] : [])
    setFechaMision(hoyISO())
    setEsProgramada(false)
    setModalAbierto(true)
  }

  const abrirEditorRuta = (r: RutaHabitual) => {
    setRutaEditando(r)
    setParadasEditando(
      r.coordenadasParadas && r.coordenadasParadas.length > 0
        ? [...r.coordenadasParadas]
        : [{ ...BASE_BEARS_RESERVE, nombre: 'Base Finca El Guadual' }]
    )
    setMinutosRalentiEditando(String(r.minutosRalenti ?? 35))
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
      mostrarFeedback('error', 'Una ruta debe tener al menos 2 puntos (origen y destino).')
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

  const guardarCambiosRuta = async () => {
    if (!rutaEditando || guardandoRuta) return
    if (paradasEditando.length < 2) {
      mostrarFeedback('error', 'Una ruta debe tener al menos 2 paradas (origen y destino).')
      return
    }

    const parsedRalenti = Number(minutosRalentiEditando)
    const minutosRalentiNum = Number.isFinite(parsedRalenti)
      ? Math.max(0, Math.round(parsedRalenti))
      : 30

    const paradasOriginales = rutaEditando.coordenadasParadas || []
    const paradasCambiaron =
      paradasOriginales.length !== paradasEditando.length ||
      paradasEditando.some(
        (p, idx) =>
          p.lat !== paradasOriginales[idx]?.lat ||
          p.lng !== paradasOriginales[idx]?.lng ||
          p.nombre !== paradasOriginales[idx]?.nombre
      )

    setGuardandoRuta(true)
    try {
      let kmFinal = rutaEditando.distanciaKm
      let minRodamiento = rutaEditando.minutosRodamiento || 55

      if (paradasCambiaron) {
        const gps = await trazarRutaCarreteraGps(paradasEditando).catch(() => null)
        if (gps && gps.distanciaKm > 0) {
          kmFinal = gps.distanciaKm
          minRodamiento = gps.duracionMinutos > 0 ? gps.duracionMinutos : minRodamiento
        } else {
          const calc = calcularDistanciaRutaParadas(paradasEditando, true)
          if (calc.distanciaKm > 0) kmFinal = calc.distanciaKm
          if (calc.minutosRodamiento > 0) minRodamiento = calc.minutosRodamiento
        }
      }

      const rutaActualizada: RutaHabitual = {
        ...rutaEditando,
        coordenadasParadas: paradasEditando,
        distanciaKm: kmFinal,
        minutosRodamiento: minRodamiento,
        minutosRalenti: minutosRalentiNum,
        duracionMinutos: minRodamiento + minutosRalentiNum,
      }
      if (onActualizarRuta) {
        await onActualizarRuta(rutaActualizada)
      }
      setModalEditarRutaAbierto(false)
      mostrarFeedback(
        'ok',
        `✅ Trazado de "${rutaActualizada.nombre}" guardado en Firestore (${kmFinal} km · ~${minRodamiento + minutosRalentiNum} min).`
      )
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudieron guardar los cambios de la ruta.'
      )
    } finally {
      setGuardandoRuta(false)
    }
  }

  // Despacho desde evento del Radar
  const despacharDesdeEvento = async (ev: EventoRadarLocal) => {
    if (despachandoEventoId) return

    const habilitadosLibres = vehiculos.filter(
      (v) => v.disponibleParaTrabajo && v.estado !== 'en_mision' && v.estado !== 'mantenimiento'
    )
    if (habilitadosLibres.length === 0) {
      const hayHabilitados = vehiculos.some((v) => v.disponibleParaTrabajo)
      mostrarFeedback(
        'error',
        hayHabilitados
          ? 'Todos tus vehículos habilitados están en misión o mantenimiento ahora mismo. Espera a que regrese uno o habilita otro en Flota.'
          : "No tienes vehículos habilitados para Bear's Reserve. Activa al menos uno en la pestaña Flota & Combustible."
      )
      return
    }

    setDespachandoEventoId(ev.id)
    try {
      const textoEv = `${ev.titulo} ${ev.resumen}`.toLowerCase()
      const tipoFallback: MisionComunitaria['tipo'] =
        /cami[oó]n|barrizal|barro|volcamiento|atascad|atollam|suspendido/.test(textoEv)
          ? 'rescate_barrizal'
          : /trasteo|traslado|m[eé]dic|v[ií]veres|agua|insumos/.test(textoEv)
            ? 'transporte_humanitario'
            : 'auxilio_comunitario'

      const coordsDestino =
        typeof ev.lat === 'number' &&
        Number.isFinite(ev.lat) &&
        typeof ev.lng === 'number' &&
        Number.isFinite(ev.lng)
          ? { lat: ev.lat, lng: ev.lng }
          : resolverCoordenadasLugar(ev.lugar, ev.departamento || 'Caldas')

      // 1. Consultar distancia/tiempo reales por carretera (OSRM) con respaldo cordillera si falla
      const rutaOsrmIda = await trazarRutaCarreteraGps([
        { lat: BASE_BEARS_RESERVE.lat, lng: BASE_BEARS_RESERVE.lng },
        coordsDestino,
      ]).catch(() => null)

      const logistica = estimarLogisticaMisionDesdeBase(
        {
          lat: coordsDestino.lat,
          lng: coordsDestino.lng,
          lugar: ev.lugar,
          departamento: ev.departamento,
          titulo: ev.titulo,
          esEmergenciaGrave: ev.esEmergenciaGrave,
          tipoMision: tipoFallback,
        },
        rutaOsrmIda
      )

      // 2. Gemini IA interpreta la situación y compara toda la flota habilitada libre (1 a 3 vehículos)
      const personalActivoCount = Math.max(1, empleados.filter((e) => e.activo).length)
      const seleccionIA = await seleccionarConvoyMisionConIA(
        ev,
        vehiculos,
        logistica,
        personalActivoCount
      )

      let vehiculosConvoy: VehiculoOperativo[] = []
      let motivoFlota = ''
      let tipoFinal: MisionComunitaria['tipo'] = tipoFallback
      let terrenoCalculado: MisionComunitaria['terreno'] =
        tipoFallback === 'rescate_barrizal'
          ? 'trocha_extrema_barrizal'
          : logistica.categoriaDistancia === 'nacional'
            ? 'mixto_montaña'
            : 'trocha_moderada'
      let usoGeminiFlota = false

      if (seleccionIA && seleccionIA.vehiculosElegidos.length > 0) {
        vehiculosConvoy = seleccionIA.vehiculosElegidos.filter(
          (v) => v.disponibleParaTrabajo && v.estado !== 'en_mision' && v.estado !== 'mantenimiento'
        )
        motivoFlota = seleccionIA.motivoGema
        tipoFinal = seleccionIA.tipoMision
        terrenoCalculado = seleccionIA.terrenoSugerido
        usoGeminiFlota = true
      }

      if (vehiculosConvoy.length === 0) {
        const seleccionLocal = seleccionarVehiculosOptimosMision(
          {
            titulo: ev.titulo,
            tipo: tipoFallback,
            impactoSocial: ev.resumen,
            terreno: terrenoCalculado,
            esEmergenciaGrave: ev.esEmergenciaGrave,
            distanciaKmTotal: logistica.distanciaKmTotalIdaYVuelta,
          },
          habilitadosLibres,
          Math.min(2, personalActivoCount)
        )
        vehiculosConvoy = seleccionLocal.vehiculosElegidos.filter(
          (v) => v.disponibleParaTrabajo && v.estado !== 'en_mision' && v.estado !== 'mantenimiento'
        )
        motivoFlota = seleccionLocal.motivoGema
        usoGeminiFlota = false
      }

      if (vehiculosConvoy.length === 0) {
        mostrarFeedback(
          'error',
          'No hay vehículos habilitados y disponibles para despachar esta misión (todos están en misión o mantenimiento).'
        )
        return
      }

      // 3. Tripulación por vehículo elegido (excluye personal ya en misiones activas)
      const seleccionTripulacion = seleccionarTripulacionMision(
        { titulo: ev.titulo, tipo: tipoFinal, impactoSocial: ev.resumen },
        vehiculosConvoy,
        empleados,
        turnos,
        hoyISO(),
        horaActualHHMM(),
        misionesEnCurso
      )

      const prioridadGeo: MisionComunitaria['prioridadGeografica'] =
        logistica.categoriaDistancia === 'local'
          ? 'local_manizales'
          : logistica.categoriaDistancia === 'regional'
            ? 'eje_cercano'
            : 'nacional_extrema_urgencia'

      const nueva: MisionComunitaria = {
        id: crearMisionId(),
        titulo: ev.titulo,
        tipo: tipoFinal,
        prioridad: ev.esEmergenciaGrave ? 'critica_extrema' : 'alta',
        origen: BASE_BEARS_RESERVE.nombre,
        destino: ev.lugar,
        departamento: (ev.departamento as MisionComunitaria['departamento']) || 'Caldas',
        prioridadGeografica: prioridadGeo,
        terreno: terrenoCalculado,
        distanciaKmIdaYVuelta: Math.max(4, logistica.distanciaKmTotalIdaYVuelta),
        duracionMinutos: logistica.duracionTotalMinutos,
        minutosRodamientoEstimados: logistica.minutosRodamientoTotal,
        minutosRalentiEstimados: logistica.minutosRalenti,
        latDestino: coordsDestino.lat,
        lngDestino: coordsDestino.lng,
        vehiculosAsignados: vehiculosConvoy.map((v) => ({
          id: v.id,
          nombre: `${v.marca} ${v.linea}`,
          placa: v.placa,
        })),
        tripulantesAsignados: seleccionTripulacion.tripulacion.map((t) => ({
          id: t.id,
          nombre: t.nombre,
        })),
        galonesConsumidosEstimados: 0,
        costoCombustibleEstimadoCOP: 0,
        desgasteLlantasIncrementoPorc: 0,
        fecha: hoyISO(),
        estado: 'en_curso',
        eventoRadarId: ev.id,
        impactoSocial: `${ev.resumen} · ${usoGeminiFlota ? '✨ Gema IA:' : 'Flota:'} ${motivoFlota}`,
        esNoticiaWebReal: ev.esNoticiaWebReal,
      }

      await onCrearMision(nueva)
      const tagRuta =
        logistica.fuenteCalculo === 'gps_carretera' ? 'GPS carretera' : 'estimado cordillera'
      const tagFlota = usoGeminiFlota ? '✨ Gemini IA' : 'Respaldo local'
      mostrarFeedback(
        'ok',
        `🚨 ¡Misión despachada (${tagFlota} · ${vehiculosConvoy.length} vehículo${vehiculosConvoy.length > 1 ? 's' : ''} · ${tagRuta})! ${logistica.distanciaKmTotalIdaYVuelta} km total (~${formatearDuracionCorta(logistica.duracionTotalMinutos)}). ${motivoFlota}`,
        8500
      )
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudo despachar la misión desde el radar.'
      )
    } finally {
      setDespachandoEventoId(null)
    }
  }

  // Despachar misión manual o programada con validación estricta
  const crearMisionManual = async () => {
    if (guardandoMision) return

    const tituloLimpio = titulo.trim()
    const destinoLimpio = destino.trim()
    const kmNum = Number(distanciaKm)
    const minNum = Number(duracionMinutos)
    const hoyStr = hoyISO()

    if (!tituloLimpio || !destinoLimpio) {
      setErrorModal('Completa el título y el destino de la misión.')
      return
    }
    if (!Number.isFinite(kmNum) || kmNum <= 0 || kmNum > 3000) {
      setErrorModal('La distancia ida y vuelta debe estar entre 1 y 3000 km.')
      return
    }
    if (!Number.isFinite(minNum) || minNum < 10 || minNum > 1440) {
      setErrorModal('La duración estimada debe estar entre 10 y 1440 minutos (24h).')
      return
    }
    if (esProgramada && fechaMision <= hoyStr) {
      setErrorModal('Para programar una misión futura, selecciona una fecha a partir de mañana.')
      return
    }
    if (vehiculosSeleccionados.length === 0) {
      setErrorModal('Selecciona al menos un vehículo disponible.')
      return
    }
    if (tripulantesSeleccionados.length === 0) {
      setErrorModal('Selecciona al menos un tripulante activo.')
      return
    }

    const vehsObj = vehiculos
      .filter(
        (v) =>
          vehiculosSeleccionados.includes(v.id) &&
          v.disponibleParaTrabajo &&
          v.estado !== 'mantenimiento' &&
          (esProgramada || v.estado !== 'en_mision')
      )
      .map((v) => ({ id: v.id, nombre: `${v.marca} ${v.linea}`, placa: v.placa }))

    if (vehsObj.length === 0) {
      setErrorModal('Los vehículos seleccionados no están disponibles para este despacho.')
      return
    }

    const empsObj = empleados
      .filter((e) => tripulantesSeleccionados.includes(e.id) && e.activo)
      .map((e) => ({ id: e.id, nombre: e.nombreCompleto }))

    if (empsObj.length === 0) {
      setErrorModal('Selecciona al menos un tripulante activo.')
      return
    }

    setErrorModal('')
    setGuardandoMision(true)
    try {
      const coords = resolverCoordenadasLugar(destinoLimpio, 'Caldas')
      const quedaProgramada = esProgramada && fechaMision > hoyStr
      const minutosRalentiEstimados = Math.round(Math.min(minNum * 0.2, 60))

      const nueva: MisionComunitaria = {
        id: crearMisionId(),
        titulo: tituloLimpio,
        tipo: quedaProgramada ? 'transporte_humanitario' : 'auxilio_comunitario',
        prioridad: 'alta',
        origen: BASE_BEARS_RESERVE.nombre,
        destino: destinoLimpio,
        departamento: 'Caldas',
        prioridadGeografica: 'local_manizales',
        terreno,
        distanciaKmIdaYVuelta: Number(kmNum.toFixed(1)),
        duracionMinutos: Math.round(minNum),
        minutosRalentiEstimados,
        minutosRodamientoEstimados: Math.max(5, Math.round(minNum) - minutosRalentiEstimados),
        latDestino: coords.lat,
        lngDestino: coords.lng,
        vehiculosAsignados: vehsObj,
        tripulantesAsignados: empsObj,
        galonesConsumidosEstimados: 0,
        costoCombustibleEstimadoCOP: 0,
        desgasteLlantasIncrementoPorc: 0,
        fecha: quedaProgramada ? fechaMision : hoyStr,
        estado: quedaProgramada ? 'programada' : 'en_curso',
        impactoSocial: 'Asistencia y apoyo directo a familias campesinas sin ánimo de lucro.',
        esNoticiaWebReal: false,
      }

      await onCrearMision(nueva)
      setModalAbierto(false)
      mostrarFeedback(
        'ok',
        quedaProgramada
          ? `📅 Misión agendada para el ${fechaMision} y sincronizada en el Calendario de CashMet.`
          : `🚨 Misión despachada: "${nueva.titulo}". Se cerrará automáticamente por Gema IA en ~${formatearDuracionCorta(nueva.duracionMinutos)}.`
      )
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : 'No se pudo registrar la misión.')
    } finally {
      setGuardandoMision(false)
    }
  }

  const ejecutarCumplimientoRuta = async (r: RutaHabitual) => {
    if (busyRutaId) return
    setBusyRutaId(r.id)
    try {
      await onCumplirRutaHabitual(r, r.vehiculoIdDefault)
    } catch (e: unknown) {
      mostrarFeedback('error', e instanceof Error ? e.message : 'No se pudo ejecutar la ruta.')
    } finally {
      setBusyRutaId(null)
    }
  }

  const manejarIniciarProgramada = async (m: MisionComunitaria) => {
    if (!onIniciarMisionProgramada || busyMisionId) return
    setBusyMisionId(m.id)
    try {
      await onIniciarMisionProgramada(m.id)
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudo iniciar la misión programada.'
      )
    } finally {
      setBusyMisionId(null)
    }
  }

  const manejarCancelarProgramada = async (m: MisionComunitaria) => {
    if (!onCancelarMisionProgramada || busyMisionId) return
    const ok = window.confirm(
      `¿Confirmas cancelar la misión programada "${m.titulo}" (${m.fecha})? También se eliminará del Calendario.`
    )
    if (!ok) return
    setBusyMisionId(m.id)
    try {
      await onCancelarMisionProgramada(m.id)
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudo cancelar la misión programada.'
      )
    } finally {
      setBusyMisionId(null)
    }
  }

  const manejarDescartarEvento = async (ev: EventoRadarLocal) => {
    if (!onDescartarEventoRadar || busyDescartarId) return
    const ok = window.confirm(`¿Descartar la alerta "${ev.titulo}" del radar?`)
    if (!ok) return
    setBusyDescartarId(ev.id)
    try {
      await onDescartarEventoRadar(ev.id)
    } catch (e: unknown) {
      mostrarFeedback(
        'error',
        e instanceof Error ? e.message : 'No se pudo descartar el evento del radar.'
      )
    } finally {
      setBusyDescartarId(null)
    }
  }

  const eventosFiltrados = useMemo(
    () =>
      eventosMapa.filter((ev) => {
        if (filtroRadar === 'caldas') return ev.departamento === 'Caldas'
        if (filtroRadar === 'otros') return ev.departamento !== 'Caldas'
        return true
      }),
    [eventosMapa, filtroRadar]
  )

  const hoy = hoyISO()
  const manana = mananaISO()

  return (
    <div className="space-y-4 text-xs">
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-2xl border p-3 font-bold shadow-lg ${
            feedback.tipo === 'error'
              ? 'border-red-400/35 bg-red-500/15 text-red-200'
              : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          {feedback.tipo === 'error' ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* Sub-navegación */}
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
            {misionesEnCurso.length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white">
                {misionesEnCurso.length}
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
            <span>Bitácora de Crónicas ({misionesCerradas.length})</span>
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
            <span>Rutas Habituales ({rutasHabituales.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={abrirModalNuevaMision}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1.5 font-black text-[#2a1702] transition hover:brightness-110"
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>+ Despachar / Programar Salida</span>
        </button>
      </div>

      {/* ----------------- VISTA 0: MAPA TÁCTICO DE OPERACIONES ----------------- */}
      {subVista === 'mapa' && (
        <MapaOperaciones
          eventosRadar={eventosMapa}
          misiones={misionesEnCurso}
          rutasHabituales={rutasHabituales}
          onActualizarRuta={onActualizarRuta}
        />
      )}

      {/* ----------------- VISTA 1: RADAR Y MISIONES EN CURSO ----------------- */}
      {subVista === 'radar' && (
        <div className="space-y-4">
          {/* Misiones en curso con temporizador automático y resolución IA */}
          {misionesEnCurso.length > 0 && (
            <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/[0.06] p-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-emerald-300 animate-spin" />
                  <h3 className="font-extrabold text-white">
                    Misiones en Desarrollo ({misionesEnCurso.length})
                  </h3>
                </div>
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
                  🤖 Resolución y crónica automáticas por Gema IA al cumplir tiempo estimado
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {misionesEnCurso.map((m) => {
                  const totalMs = Math.max(60_000, (m.duracionMinutos || 60) * 60_000)
                  const tieneInicio =
                    typeof m.iniciadaEn === 'number' && Number.isFinite(m.iniciadaEn)
                  const tieneFin =
                    typeof m.finalizaEstimadaEn === 'number' &&
                    Number.isFinite(m.finalizaEstimadaEn)
                  const tieneTemporizador = tieneInicio || tieneFin
                  const inicio = tieneInicio
                    ? m.iniciadaEn!
                    : tieneFin
                      ? m.finalizaEstimadaEn! - totalMs
                      : ahoraMs
                  const fin = tieneFin ? m.finalizaEstimadaEn! : inicio + totalMs
                  const transcurrido = Math.max(0, ahoraMs - inicio)
                  const progreso = tieneTemporizador
                    ? Math.min(99, Math.round((transcurrido / totalMs) * 100))
                    : 50
                  const minRestantes = Math.max(0, Math.ceil((fin - ahoraMs) / 60_000))

                  return (
                    <div
                      key={m.id}
                      className="space-y-2.5 rounded-2xl border border-emerald-400/25 bg-black/40 p-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-white text-sm">{m.titulo}</span>
                            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-black text-emerald-300 uppercase animate-pulse">
                              En curso
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-mist-400">
                            <span>
                              Destino: <b className="text-white">{m.destino}</b>
                            </span>
                            <span>
                              · Distancia:{' '}
                              <b className="text-white">{m.distanciaKmIdaYVuelta} km (ida y vuelta)</b>
                            </span>
                            {typeof m.minutosRodamientoEstimados === 'number' && (
                              <span>
                                · Plan:{' '}
                                <b className="text-sky-200">
                                  {formatearDuracionCorta(m.minutosRodamientoEstimados)} ruta +{' '}
                                  {formatearDuracionCorta(
                                    Math.max(0, (m.duracionMinutos || 60) - m.minutosRodamientoEstimados)
                                  )}{' '}
                                  en sitio
                                </b>
                              </span>
                            )}
                            <span>
                              · Flota:{' '}
                              <b className="text-amber-300">
                                {m.vehiculosAsignados?.map((v) => v.nombre).join(', ') || 'Flota general'}
                              </b>
                            </span>
                            <span>
                              · Tripulación:{' '}
                              <b className="text-sky-200">
                                {m.tripulantesAsignados?.map((t) => t.nombre).join(', ') || 'Guardia'}
                              </b>
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono text-xs font-black text-emerald-300">
                            {!tieneTemporizador
                              ? 'En operación activa'
                              : minRestantes > 0
                                ? `~${formatearDuracionCorta(minRestantes)} restantes`
                                : 'Cerrando con Gema IA...'}
                          </div>
                          <div className="text-[10px] text-mist-500">
                            {m.horaInicio ? `Salida ${m.horaInicio}` : ''}
                            {m.horaFin ? ` · ETA ${m.horaFin}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 transition-all duration-700 ${
                              !tieneTemporizador ? 'animate-pulse' : ''
                            }`}
                            style={{ width: `${Math.max(4, progreso)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-mist-400">
                          <span>{m.impactoSocial}</span>
                          <span className="font-mono font-bold text-mist-300 shrink-0 ml-2">
                            {tieneTemporizador ? `${progreso}%` : 'Activa'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Misiones Programadas */}
          {misionesProgramadas.length > 0 && (
            <div className="rounded-3xl border border-sky-400/25 bg-sky-500/[0.05] p-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Calendar className="h-4 w-4 text-sky-300" />
                <h3 className="font-extrabold text-white">
                  Misiones Programadas ({misionesProgramadas.length})
                </h3>
              </div>
              <div className="mt-3 space-y-2">
                {misionesProgramadas.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col justify-between gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{m.titulo}</span>
                        <span className="rounded-full border border-sky-400/30 bg-sky-400/15 px-2 py-0.5 text-[9px] font-black text-sky-200">
                          📅 {m.fecha}
                        </span>
                      </div>
                      <div className="text-[11px] text-mist-400">
                        {m.destino} · {m.distanciaKmIdaYVuelta} km · ~
                        {formatearDuracionCorta(m.duracionMinutos)} ·{' '}
                        {m.vehiculosAsignados.map((v) => v.nombre).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {onIniciarMisionProgramada && (
                        <button
                          type="button"
                          disabled={Boolean(busyMisionId)}
                          onClick={() => void manejarIniciarProgramada(m)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-45"
                        >
                          <Play className="h-3 w-3" />{' '}
                          {busyMisionId === m.id ? 'Iniciando...' : 'Iniciar ahora'}
                        </button>
                      )}
                      {onCancelarMisionProgramada && (
                        <button
                          type="button"
                          disabled={Boolean(busyMisionId)}
                          onClick={() => void manejarCancelarProgramada(m)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-red-500/15 border border-red-400/30 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-45"
                        >
                          <XCircle className="h-3 w-3" /> Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Radar principal con noticias web reales + llamadas veredales */}
          <div className="rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] via-black/30 to-night-900 p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
                  <Radio className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-black text-white">
                    Radar de Eventos, Noticias Reales y Llamadas Veredales
                  </h2>
                  <p className="text-[11px] text-mist-400">
                    Cobertura: Manizales, Caldas y todo Colombia · Curado por Gema IA según capacidad real de apoyo · Caducidad máx. 48h.
                  </p>
                  {diagnosticoRadar && (
                    <p className="mt-0.5 text-[10px] font-semibold text-sky-300/90">
                      {diagnosticoRadar}
                    </p>
                  )}
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
                  Resto del País
                </button>

                <button
                  type="button"
                  onClick={() => void ejecutarEscaneoRadar()}
                  disabled={escaneandoRadar}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-200 hover:bg-sky-500/25 transition disabled:opacity-50"
                  title="Buscar noticias viales reales en internet y refrescar llamadas comunitarias con Gema IA"
                >
                  <RefreshCw className={`h-3 w-3 ${escaneandoRadar ? 'animate-spin' : ''}`} />
                  <span>{escaneandoRadar ? 'Escaneando web...' : 'Escanear con Gema'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalReportarAbierto(true)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25 transition"
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
                  Sin contingencias vigentes en este filtro
                </div>
                <p className="text-[11px] text-mist-400 max-w-sm mx-auto">
                  Las alertas caducan automáticamente después de 1–2 días. Pulsa &ldquo;Escanear con Gema&rdquo; para
                  buscar noticias reales recientes o registra una llamada veredal.
                </p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {eventosFiltrados.map((ev) => {
                  const esCaldas = ev.departamento === 'Caldas'
                  const yaDespachado =
                    Boolean(ev.despachado) ||
                    misiones.some(
                      (m) =>
                        m.eventoRadarId === ev.id ||
                        (m.estado === 'en_curso' && m.fecha === hoy && m.titulo === ev.titulo)
                    )
                  const est = estimarLogisticaMisionDesdeBase({
                    lat: ev.lat,
                    lng: ev.lng,
                    lugar: ev.lugar,
                    departamento: ev.departamento,
                    titulo: ev.titulo,
                    esEmergenciaGrave: ev.esEmergenciaGrave,
                  })
                  const badgeDistColor =
                    est.categoriaDistancia === 'local'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                      : est.categoriaDistancia === 'regional'
                        ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                        : 'border-rose-400/35 bg-rose-500/10 text-rose-200'
                  const etiquetaDist =
                    est.categoriaDistancia === 'local'
                      ? 'Cerca'
                      : est.categoriaDistancia === 'regional'
                        ? 'Regional'
                        : 'Larga distancia'

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
                              title="Noticia web real consultada en internet"
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

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-mist-400">
                        <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>{ev.lugar}</span>
                        <span className="text-mist-500">· {ev.fuenteNoticia}</span>
                        {ev.urlFuente && (
                          <a
                            href={ev.urlFuente}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-sky-300 hover:underline"
                          >
                            <span>Fuente</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>

                      <div
                        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-2.5 py-1.5 text-[10.5px] font-semibold ${badgeDistColor}`}
                      >
                        <span className="inline-flex items-center gap-1 font-extrabold">
                          <Navigation className="h-3 w-3 shrink-0" />
                          A ~{est.distanciaKmIda} km de base ({etiquetaDist})
                        </span>
                        <span className="opacity-80">
                          · {est.distanciaKmTotalIdaYVuelta} km ida y vuelta
                        </span>
                        <span className="opacity-85">
                          · ~{formatearDuracionCorta(est.minutosRodamientoTotal)} ruta +{' '}
                          {formatearDuracionCorta(est.minutosServicioEnSitio)} en sitio ={' '}
                          <b>~{formatearDuracionCorta(est.duracionTotalMinutos)}</b>
                        </span>
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
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-mist-500">
                          <span>{ev.fecha}</span>
                          <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-mist-300">
                            ⏱️ {textoVigenciaRestante(ev.expiraEn, ahoraMs)}
                          </span>
                          {onDescartarEventoRadar && (
                            <button
                              type="button"
                              disabled={Boolean(busyDescartarId)}
                              onClick={() => void manejarDescartarEvento(ev)}
                              className="cursor-pointer text-mist-500 hover:text-rose-400 transition disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3 inline mr-0.5" />{' '}
                              {busyDescartarId === ev.id ? 'Descartando...' : 'Descartar'}
                            </button>
                          )}
                        </div>

                        {yaDespachado ? (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-400/15 border border-emerald-400/30 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                            <Check className="h-3 w-3" /> Atendida / Despachada
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(despachandoEventoId)}
                            onClick={() => void despacharDesdeEvento(ev)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1 font-black text-[#2a1702] transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span>
                              {despachandoEventoId === ev.id
                                ? 'Gema IA eligiendo flota...'
                                : 'Despachar Misión'}
                            </span>
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

      {/* ----------------- VISTA 2: BITÁCORA DE CRÓNICAS ----------------- */}
      {subVista === 'cronicas' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-500/[0.06] via-black/40 to-night-900 p-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/20 text-sky-300">
                <BookOpen className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Bitácora de Crónicas y Relatos de Campo ({misionesCerradas.length})
                </h3>
                <p className="text-[11px] text-mist-400">
                  Cada misión se cierra automáticamente al cumplir su duración estimada y Gema IA evalúa el resultado y redacta la crónica.
                </p>
              </div>
            </div>

            {misionesCerradas.length === 0 ? (
              <div className="p-8 text-center text-mist-500">
                <p className="font-bold text-mist-300">Aún no hay crónicas archivadas.</p>
                <p className="text-[11px]">
                  Cuando una misión cumpla su tiempo estimado o se complete una ruta habitual, aparecerá aquí automáticamente.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {misionesCerradas.map((m) => {
                  const esRepliegue =
                    m.resultado === 'fallida_dificultad' || m.estado === 'inconclusa_repliegue'
                  const esParcial = !esRepliegue && m.resultado === 'parcial'
                  const esExito = !esRepliegue && !esParcial && m.resultado === 'exito'
                  const badgeClase = esExito
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : esParcial
                      ? 'bg-amber-400/20 text-amber-300'
                      : esRepliegue
                        ? 'bg-red-400/20 text-red-300'
                        : 'bg-sky-400/20 text-sky-200'
                  const badgeTexto = esExito
                    ? 'Éxito'
                    : esParcial
                      ? 'Parcial'
                      : esRepliegue
                        ? 'Repliegue'
                        : 'Completada'

                  return (
                    <div
                      key={m.id}
                      className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs shadow-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-white">{m.titulo}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${badgeClase}`}>
                            {badgeTexto}
                          </span>
                          {m.resueltaPorIA && (
                            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[9px] font-bold text-sky-300">
                              ✨ Evaluada por Gema IA
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-mist-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-amber-300" />
                            {formatearDuracionCorta(m.duracionMinutos)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Navigation className="h-3 w-3 text-emerald-300" />
                            {m.distanciaKmIdaYVuelta} km
                          </span>
                          <span className="text-mist-500">{m.fecha}</span>
                        </div>
                      </div>

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
                          Consumo real:{' '}
                          <span className="text-emerald-300 font-medium">
                            {m.galonesConsumidosEstimados} gal
                            {m.costoCombustibleEstimadoCOP > 0
                              ? ` ($${m.costoCombustibleEstimadoCOP.toLocaleString('es-CO')})`
                              : ''}
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
                <h3 className="text-sm font-extrabold text-white">
                  Rutas Habituales y Servicios Recurrentes
                </h3>
                <p className="text-[11px] text-mist-400">
                  El conductor sale automáticamente del cuadrante semanal de Bear&apos;s Reserve.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rutasHabituales.map((r) => {
                const idEsperadoHoy = construirIdCumplimientoRuta(r, hoy)
                const yaCumplidaHoy = r.ultimoCumplimientoFecha === idEsperadoHoy
                const conductor = conductorDeRutaEnCuadrante(turnos, r.id, hoy, r.tipoHorario) || {
                  id: 'coord-user',
                  nombre: 'Tú (Coordinador General)',
                }
                const esHueco = conductor.id === 'coord-user'
                const vehiculosHabilitados = vehiculos.filter((v) => v.disponibleParaTrabajo)
                const vehDefaultInhabilitado =
                  Boolean(r.vehiculoIdDefault) &&
                  !vehiculosHabilitados.some((v) => v.id === r.vehiculoIdDefault)
                const vehDefaultInfo = r.vehiculoIdDefault
                  ? vehiculos.find((v) => v.id === r.vehiculoIdDefault)
                  : undefined

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
                            ⚡ Autoejecutable a las {r.horaSalida || '06:00'}
                          </span>
                        )}
                      </div>
                      <span className="rounded-full bg-emerald-400/15 border border-emerald-400/30 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                        {r.distanciaKm} km
                      </span>
                    </div>

                    <p className="text-mist-300 text-[11px] leading-relaxed">{r.descripcion}</p>

                    <div className="flex flex-wrap gap-2 text-[10px] text-mist-400">
                      <span>
                        Rodamiento: <b className="text-white">{r.minutosRodamiento || 55} min</b>
                      </span>
                      <span>
                        · Ralentí en paradas:{' '}
                        <b className="text-amber-300">{r.minutosRalenti ?? 35} min</b>
                      </span>
                      <span>
                        · Total: <b className="text-sky-300">~{r.duracionMinutos || 90} min</b>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-mist-400">
                      <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span>
                        {r.origen} ↔ {r.destino}
                      </span>
                    </div>

                    {/* Selector de vehículo */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                      <span className="text-[10px] font-bold text-mist-400">
                        Vehículo asignado:
                      </span>
                      <select
                        value={r.vehiculoIdDefault || ''}
                        onChange={(e) => {
                          const nuevoId = e.target.value
                          if (onActualizarRuta) {
                            void Promise.resolve(
                              onActualizarRuta({
                                ...r,
                                vehiculoIdDefault: nuevoId || undefined,
                              })
                            ).catch(() => {})
                          }
                        }}
                        className="field-dark h-7 rounded-lg px-2 text-[10px] font-semibold text-amber-200"
                      >
                        <option value="">Auto-asignar por Gema IA</option>
                        {vehDefaultInhabilitado && r.vehiculoIdDefault && (
                          <option value={r.vehiculoIdDefault}>
                            ⚠️ No habilitado:{' '}
                            {vehDefaultInfo
                              ? `${vehDefaultInfo.marca} ${vehDefaultInfo.linea}`
                              : r.vehiculoIdDefault}
                          </option>
                        )}
                        {vehiculosHabilitados.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.marca} {v.linea} {v.placa ? `(${v.placa})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Conductor real del cuadrante */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                      <span className="text-[10px] font-bold text-mist-400">
                        👤 Conductor hoy (cuadrante):
                      </span>
                      <span
                        className={`text-[10px] font-bold ${esHueco ? 'text-amber-300' : 'text-sky-200'}`}
                      >
                        {conductor.nombre}
                        {esHueco && ' (sin guardia en esa franja hoy)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                      <span className="text-[10px] text-mist-500">
                        {r.ultimoCumplimientoFecha
                          ? `Último registro: ${r.ultimoCumplimientoFecha}`
                          : 'Sin registros aún'}
                      </span>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => abrirEditorRuta(r)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-mist-300 hover:bg-white/10 hover:text-white transition"
                        >
                          <Pencil className="h-3 w-3 text-amber-300" />
                          <span>Editar Paradas</span>
                        </button>

                        <button
                          type="button"
                          disabled={busyRutaId === r.id || yaCumplidaHoy}
                          onClick={() => void ejecutarCumplimientoRuta(r)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3 py-1 font-black text-[#04241a] transition hover:brightness-110 disabled:opacity-45"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>
                            {busyRutaId === r.id
                              ? 'Registrando...'
                              : yaCumplidaHoy
                                ? 'Cumplida hoy'
                                : r.esAutomatica
                                  ? 'Despacho Manual Anticipado'
                                  : 'Cumplir Ruta'}
                          </span>
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

      {/* Modal para nueva misión manual o programada */}
      {modalAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div className="surface-glow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-extrabold text-white">
                Despachar o Programar Misión Comunitaria
              </h3>
              <button
                type="button"
                disabled={guardandoMision}
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white disabled:opacity-40"
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
                    min={1}
                    max={3000}
                    step="0.5"
                    value={distanciaKm}
                    onChange={(e) => setDistanciaKm(e.target.value)}
                    className="field-dark h-9 rounded-xl px-2.5 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-mist-400 font-bold">Duración estimada (minutos)</span>
                  <input
                    type="number"
                    min={10}
                    max={1440}
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
                  onChange={(e) => setTerreno(e.target.value as MisionComunitaria['terreno'])}
                  className="field-dark h-9 rounded-xl px-2 text-xs"
                >
                  <option value="trocha_moderada">Trocha moderada (Vereda destapada)</option>
                  <option value="trocha_extrema_barrizal">
                    Barrizal extremo / Trocha pesada con winche
                  </option>
                  <option value="mixto_montaña">Mixto montaña / Curvas pavimentadas</option>
                  <option value="pavimento">Pavimento troncal</option>
                </select>
              </label>

              {/* Vehículos disponibles */}
              <div className="flex flex-col gap-1">
                <span className="text-mist-400 font-bold">
                  Vehículo(s) disponible(s){esProgramada ? ' (para fecha futura)' : ''}
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-2">
                  {vehiculos
                    .filter((v) => v.disponibleParaTrabajo && v.estado !== 'mantenimiento')
                    .map((v) => {
                      const ocupado = !esProgramada && v.estado === 'en_mision'
                      const sel = vehiculosSeleccionados.includes(v.id)
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={ocupado}
                          onClick={() => {
                            if (sel) {
                              setVehiculosSeleccionados(
                                vehiculosSeleccionados.filter((x) => x !== v.id)
                              )
                            } else {
                              setVehiculosSeleccionados([...vehiculosSeleccionados, v.id])
                            }
                          }}
                          className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            sel
                              ? 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                              : 'bg-white/[0.04] text-mist-400'
                          }`}
                        >
                          {sel ? '✓ ' : ''}
                          {v.marca} {v.linea}{' '}
                          {v.estado === 'en_mision'
                            ? esProgramada
                              ? '(En misión hoy)'
                              : '(En misión)'
                            : ''}
                        </button>
                      )
                    })}
                </div>
              </div>

              {/* Personal activo */}
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
                              setTripulantesSeleccionados(
                                tripulantesSeleccionados.filter((x) => x !== e.id)
                              )
                            } else {
                              setTripulantesSeleccionados([...tripulantesSeleccionados, e.id])
                            }
                          }}
                          className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                            sel
                              ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30'
                              : 'bg-white/[0.04] text-mist-400'
                          }`}
                        >
                          {sel ? '✓ ' : ''}
                          {e.nombreCompleto}
                        </button>
                      )
                    })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-2">
                <label className="flex cursor-pointer items-center gap-1.5 font-bold text-mist-300">
                  <input
                    type="checkbox"
                    checked={esProgramada}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setEsProgramada(checked)
                      if (checked) {
                        if (fechaMision <= hoy) setFechaMision(manana)
                      } else {
                        setFechaMision(hoy)
                        setVehiculosSeleccionados((prev) =>
                          prev.filter((id) => {
                            const v = vehiculos.find((x) => x.id === id)
                            return v && v.estado !== 'en_mision'
                          })
                        )
                      }
                    }}
                    className="h-4 w-4 accent-emerald-400"
                  />
                  <span>Programar para fecha futura (se guarda en Calendario CashMet)</span>
                </label>

                {esProgramada && (
                  <input
                    type="date"
                    min={manana}
                    value={fechaMision}
                    onChange={(e) => setFechaMision(e.target.value)}
                    className="field-dark h-8 rounded-lg px-2 text-xs"
                  />
                )}
              </div>

              {errorModal && <p className="text-[11px] font-bold text-red-400">{errorModal}</p>}
            </div>

            <div className="flex gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                disabled={guardandoMision}
                onClick={() => void crearMisionManual()}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2 font-black text-[#2a1702] disabled:opacity-50"
              >
                {guardandoMision
                  ? 'Guardando...'
                  : esProgramada && fechaMision > hoy
                    ? 'Agendar Misión'
                    : 'Despachar Inmediatamente'}
              </button>
              <button
                type="button"
                disabled={guardandoMision}
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor de Trazado de Rutas Habituales */}
      {modalEditarRutaAbierto && rutaEditando && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div className="surface-glow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-sky-400/25 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Definir Trazado y Paradas: {rutaEditando.nombre}
                </h3>
                <p className="text-[11px] text-mist-400">
                  Al guardar se recalcula automáticamente la distancia y duración si modificas las paradas.
                </p>
              </div>
              <button
                type="button"
                disabled={guardandoRuta}
                onClick={() => setModalEditarRutaAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-3">
              <div>
                <div className="text-[11px] font-bold text-mist-300 mb-1.5 flex items-center justify-between">
                  <span>Secuencia de Paradas ({paradasEditando.length} puntos)</span>
                  <span className="text-[10px] text-mist-500">Usa ▲ y ▼ para ordenar</span>
                </div>

                <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {paradasEditando.map((p, idx) => (
                    <div
                      key={`${p.lat}-${p.lng}-${idx}`}
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
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === paradasEditando.length - 1}
                          onClick={() => moverParada(idx, 1)}
                          className="cursor-pointer rounded-lg bg-white/[0.06] p-1 text-mist-300 hover:text-white disabled:opacity-20"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarParada(idx)}
                          className="cursor-pointer rounded-lg bg-red-400/10 p-1 text-red-300 hover:bg-red-400/20"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-2">
                <span className="text-[10px] font-bold text-amber-300 uppercase">
                  + Agregar Parada o Vereda:
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
                    placeholder="Nombre personalizado..."
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
                  <span>Insertar Parada al Final</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-2">
                <span className="text-mist-400 font-bold">Minutos de espera / ralentí:</span>
                <input
                  type="number"
                  min={0}
                  value={minutosRalentiEditando}
                  onChange={(e) => setMinutosRalentiEditando(e.target.value)}
                  className="field-dark h-8 w-20 rounded-lg px-2 text-center text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                disabled={guardandoRuta || paradasEditando.length < 2}
                onClick={() => void guardarCambiosRuta()}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-sky-400 to-teal-400 py-2 font-black text-[#04241a] hover:brightness-110 disabled:opacity-45"
              >
                {guardandoRuta ? 'Calculando y guardando...' : 'Guardar Trazado de Ruta'}
              </button>
              <button
                type="button"
                disabled={guardandoRuta}
                onClick={() => setModalEditarRutaAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para reportar nueva llamada veredal */}
      {modalReportarAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div className="surface-glow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-amber-400/25 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Registrar Nueva Contingencia o Llamada Veredal
                </h3>
                <p className="text-[11px] text-mist-400">
                  Las coordenadas en el mapa se ubican según el municipio/vereda indicado (vigencia 36h).
                </p>
              </div>
              <button
                type="button"
                disabled={guardandoReporte}
                onClick={() => setModalReportarAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white disabled:opacity-40"
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
                    placeholder="Ej: Vereda La Cabaña, Neira, Chinchiná..."
                    className="field-dark h-8 rounded-xl px-2.5 text-xs text-white"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-bold text-mist-400">Departamento</span>
                  <input
                    type="text"
                    value={reporteDepartamento}
                    onChange={(e) => setReporteDepartamento(e.target.value)}
                    placeholder="Caldas, Risaralda, Tolima..."
                    className="field-dark h-8 rounded-xl px-2.5 text-xs text-white"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-bold text-mist-400">Detalles de la llamada</span>
                <textarea
                  value={reporteResumen}
                  onChange={(e) => setReporteResumen(e.target.value)}
                  placeholder="Describe lo que reportan los campesinos o conductores..."
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
                onClick={() => void guardarNuevoReporte()}
                disabled={!reporteTitulo.trim() || guardandoReporte}
                className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2 font-black text-[#2a1702] hover:brightness-110 disabled:opacity-40"
              >
                {guardandoReporte ? 'Registrando...' : 'Agregar al Radar de Operaciones'}
              </button>
              <button
                type="button"
                disabled={guardandoReporte}
                onClick={() => setModalReportarAbierto(false)}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-mist-300 hover:text-white disabled:opacity-40"
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
