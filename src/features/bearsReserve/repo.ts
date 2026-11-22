import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { COLLECTIONS } from '@/lib/firebase/collections'
import { listarNomina, type Nomina } from '@/lib/firebase/nominaRepo'
import {
  actualizarKilometraje,
  listarVehiculos,
  obtenerVehiculo,
  type Vehiculo,
} from '@/lib/firebase/vehiculosRepo'
import { crearMovimiento } from '@/lib/firebase/movimientosRepo'
import { crearEvento, eliminarEvento } from '@/lib/firebase/calendarioRepo'
import { hoyISO, isoLocal } from '@/lib/fechas'
import {
  CAPACIDAD_TANQUE_FALLBACK_GAL,
  UMBRAL_RESERVA_COMBUSTIBLE_PORC,
  construirIdCumplimientoRuta,
} from './constants'
import {
  calcularConsumoMision,
  esPrecioDesactualizado,
  establecerPreciosCombustibleCache,
  obtenerPrecioGalon,
  obtenerPreciosCombustibleActuales,
  PRECIOS_COMBUSTIBLE_BASE_COLOMBIA,
} from './preciosCombustible'
import {
  calcularCombustibleRalenti,
  PARADAS_RUTA_ESCOLAR_MATUTINA,
  PARADAS_RUTA_ESCOLAR_VESPERTINA,
  PARADAS_RUTA_MERCADO_CAMPESINO,
} from './geo'
import {
  conductorDeRutaEnCuadrante,
  deduplicarEventosRadar,
  evaluarDesenlaceMisionLocal,
  filtrarEventosRadarVigentes,
  generarLlamadasComunitariasRespaldo,
  investigarFichaVehiculoIA,
  seleccionarVehiculosOptimosMision,
} from './gemaEngine'
import {
  buscarNoticiasVialesRealesAI,
  consultarPreciosCombustibleRealesAI,
  generarLlamadasComunitariasIA,
  resolverMisionConIA,
} from './gemaAI'
import { investigarVehiculoConGeminiAI } from '@/ai/gemini'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  LiquidacionCombustibleRegistro,
  MensajeGema,
  MisionComunitaria,
  PreciosCombustible,
  RutaHabitual,
  TanqueoRegistro,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

// Documentos dentro de COLLECTIONS.CONFIGURACION_SISTEMA (autorizado por firestore.rules e incluido en Backup)
const DOC_CONFIG = 'bears_reserve_config'
const DOC_OPERACIONES = 'bears_reserve_operaciones'
const DOC_COMBUSTIBLE = 'bears_reserve_combustible'
const DOC_CHAT = 'bears_reserve_chat'

const CLAVE_STORAGE_LEGACY = 'bears_reserve_data_v2'
const CLAVE_SNAPSHOT_COMPLETO = 'bears_reserve_snapshot_completo_v2'
const CLAVE_SNAPSHOT_OPERACIONES = 'bears_reserve_operaciones_snap_v1'
const INTERVALO_ESCANEO_RADAR_MS = 6 * 60 * 60 * 1000 // Auto-refrescar radar cada 6 horas

function sufijoAleatorio(): string {
  return Math.random().toString(36).slice(2, 7)
}

function lunesDeEstaSemanaISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoLocal(d)
}

export interface EstadoSyncFirestore {
  estado: 'conectando' | 'sincronizado' | 'error'
  ultimoError?: string
  ultimaEscrituraOkEn?: number
}

interface EstadoDocSync {
  estado: 'conectando' | 'sincronizado' | 'error'
  ultimoError?: string
  ultimaEscrituraOkEn?: number
}

function crearEstadoPorDocInicial(): Record<string, EstadoDocSync> {
  return {
    [DOC_CONFIG]: { estado: 'conectando' },
    [DOC_OPERACIONES]: { estado: 'conectando' },
    [DOC_COMBUSTIBLE]: { estado: 'conectando' },
    [DOC_CHAT]: { estado: 'conectando' },
  }
}

function crearHidratadoPorDocInicial(): Record<string, boolean> {
  return {
    [DOC_CONFIG]: false,
    [DOC_OPERACIONES]: false,
    [DOC_COMBUSTIBLE]: false,
    [DOC_CHAT]: false,
  }
}

let estadoPorDoc: Record<string, EstadoDocSync> = crearEstadoPorDocInicial()
let hidratadoPorDoc: Record<string, boolean> = crearHidratadoPorDocInicial()
let estadoSyncActual: EstadoSyncFirestore = { estado: 'conectando' }
const listenersSync = new Set<(st: EstadoSyncFirestore) => void>()

function emitirEstadoSync(nuevo: EstadoSyncFirestore): void {
  estadoSyncActual = nuevo
  for (const fn of listenersSync) {
    try {
      fn(nuevo)
    } catch {
      /* ignore listener error */
    }
  }
}

function actualizarEstadoDoc(docId: string, parcial: EstadoDocSync): void {
  estadoPorDoc[docId] = {
    ...estadoPorDoc[docId],
    ...parcial,
  }
  const valores = Object.values(estadoPorDoc)
  const conError = valores.find((v) => v.estado === 'error')
  const ultimaOk = valores.reduce<number | undefined>((max, v) => {
    if (typeof v.ultimaEscrituraOkEn !== 'number') return max
    return max === undefined ? v.ultimaEscrituraOkEn : Math.max(max, v.ultimaEscrituraOkEn)
  }, estadoSyncActual.ultimaEscrituraOkEn)

  if (conError) {
    emitirEstadoSync({
      estado: 'error',
      ultimoError: conError.ultimoError,
      ultimaEscrituraOkEn: ultimaOk,
    })
    return
  }

  const hayConectando = valores.some((v) => v.estado === 'conectando')
  emitirEstadoSync({
    estado: hayConectando ? 'conectando' : 'sincronizado',
    ultimaEscrituraOkEn: ultimaOk,
  })
}

export function leerEstadoSyncFirestore(): EstadoSyncFirestore {
  return estadoSyncActual
}

export function suscribirEstadoSyncFirestore(
  cb: (st: EstadoSyncFirestore) => void
): () => void {
  listenersSync.add(cb)
  cb(estadoSyncActual)
  return () => {
    listenersSync.delete(cb)
  }
}

// Colas de escritura serializadas por documento para impedir sobrescrituras fuera de orden en Firestore
const colasEscrituraDoc: Record<string, Promise<unknown>> = {}

// Locks in-flight para prevenir doble cierre de misión o doble tanqueo simultáneo
const misionesEnCierre = new Set<string>()
const vehiculosEnTanqueo = new Set<string>()

// Último caché conocido de CashMet para no activar Demo ante fallo transitorio
let ultimoCacheNomina: Nomina[] | null = null
let ultimoCacheVehiculos: Vehiculo[] | null = null

interface SnapshotLocalCompleto {
  config?: {
    vehiculosExtra: Record<string, Partial<VehiculoOperativo>>
    empleadosExtra: Record<string, Partial<EmpleadoOperativo>>
    rutasHabituales: RutaHabitual[]
    rotacionContador: number
    actualizado: number
    pendienteSync?: boolean
  }
  operaciones?: {
    turnos: TurnoSemanal[]
    misiones: MisionComunitaria[]
    eventosRadar: EventoRadarLocal[]
    ultimoEscaneoRadarEn: number
    ultimoDiagnosticoRadar: string
    actualizado: number
    pendienteSync?: boolean
  }
  combustible?: {
    tarjetaCombustible: TarjetaCombustibleReserva
    historialTarjetas: TarjetaCombustibleReserva[]
    preciosCombustible: PreciosCombustible
    actualizado: number
    pendienteSync?: boolean
  }
  chat?: {
    chatMensajes: MensajeGema[]
    actualizado: number
    pendienteSync?: boolean
  }
}

function seccionDeDoc(docId: string): keyof SnapshotLocalCompleto | null {
  if (docId === DOC_CONFIG) return 'config'
  if (docId === DOC_OPERACIONES) return 'operaciones'
  if (docId === DOC_COMBUSTIBLE) return 'combustible'
  if (docId === DOC_CHAT) return 'chat'
  return null
}

function leerSnapshotCompletoLocal(): SnapshotLocalCompleto {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CLAVE_SNAPSHOT_COMPLETO)
    if (raw) return JSON.parse(raw) as SnapshotLocalCompleto
  } catch {
    /* ignore */
  }
  // Compatibilidad con snapshot v1 de operaciones
  try {
    const rawOp = localStorage.getItem(CLAVE_SNAPSHOT_OPERACIONES)
    if (rawOp) {
      const op = JSON.parse(rawOp) as SnapshotLocalCompleto['operaciones']
      if (op) return { operaciones: op }
    }
  } catch {
    /* ignore */
  }
  return {}
}

function guardarSeccionSnapshotLocal<K extends keyof SnapshotLocalCompleto>(
  seccion: K,
  valor: NonNullable<SnapshotLocalCompleto[K]>
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const actual = leerSnapshotCompletoLocal()
    actual[seccion] = valor
    localStorage.setItem(CLAVE_SNAPSHOT_COMPLETO, JSON.stringify(actual))
  } catch {
    /* quota o navegación privada */
  }
}

function marcarSeccionSincronizadaLocal(
  seccion: keyof SnapshotLocalCompleto,
  actualizadoConfirmado: number
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const actual = leerSnapshotCompletoLocal()
    const sec = actual[seccion]
    if (sec && sec.actualizado === actualizadoConfirmado && sec.pendienteSync) {
      sec.pendienteSync = false
      localStorage.setItem(CLAVE_SNAPSHOT_COMPLETO, JSON.stringify(actual))
    }
  } catch {
    /* ignore */
  }
}

function limpiarClavesLegacyLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  const claves = [
    CLAVE_STORAGE_LEGACY,
    CLAVE_SNAPSHOT_OPERACIONES,
    'bears_reserve_habilitados_map_v1',
    'bears_reserve_empleados_habilitados_map_v1',
    'bears_reserve_rotacion_contador_v1',
  ]
  for (const clave of claves) {
    try {
      localStorage.removeItem(clave)
    } catch {
      /* ignore */
    }
  }
}

export interface EstadoBearsCompleto {
  vehiculosExtra: Record<string, Partial<VehiculoOperativo>>
  empleadosExtra: Record<string, Partial<EmpleadoOperativo>>
  rutasHabituales: RutaHabitual[]
  rotacionContador: number
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
  eventosRadar: EventoRadarLocal[]
  ultimoEscaneoRadarEn: number
  ultimoDiagnosticoRadar: string
  tarjetaCombustible: TarjetaCombustibleReserva
  historialTarjetas: TarjetaCombustibleReserva[]
  preciosCombustible: PreciosCombustible
  chatMensajes: MensajeGema[]
}

export const RUTAS_HABITUALES_INICIALES: RutaHabitual[] = [
  {
    id: 'rut-escolar-manana',
    nombre: 'Ruta Escolar Rural Matutina (Veredas ➔ Colegios)',
    descripcion:
      'Salida 06:00 AM desde Base Finca El Guadual. Recorrido por veredas San Peregrino, La Linda y La Cabaña recogiendo 14 niños campesinos (con paradas de espera al ralentí) y dejada en Escuela La Trinidad y colegios urbanos de Manizales.',
    origen: 'Base Finca El Guadual (San Peregrino)',
    destino: 'Escuela La Trinidad & Colegios Manizales',
    distanciaKm: 38.4,
    duracionMinutos: 90,
    minutosRodamiento: 55,
    minutosRalenti: 35,
    diasSemana: [1, 2, 3, 4, 5],
    tipoHorario: 'manana',
    horaSalida: '06:00',
    esAutomatica: true,
    activa: true,
    coordenadasParadas: PARADAS_RUTA_ESCOLAR_MATUTINA,
  },
  {
    id: 'rut-escolar-tarde',
    nombre: 'Ruta Escolar Rural Vespertina (Colegios ➔ Veredas)',
    descripcion:
      'Salida 15:00 (3:00 PM) desde Base Finca El Guadual. Recogida de niños en colegios de Manizales y Escuela La Trinidad, dejada puerta a puerta en sus casas en veredas La Cabaña, La Linda y San Peregrino, y retorno a Base.',
    origen: 'Base Finca El Guadual (San Peregrino)',
    destino: 'Veredas La Cabaña, La Linda & San Peregrino',
    distanciaKm: 38.4,
    duracionMinutos: 95,
    minutosRodamiento: 55,
    minutosRalenti: 40,
    diasSemana: [1, 2, 3, 4, 5],
    tipoHorario: 'tarde',
    horaSalida: '15:00',
    esAutomatica: true,
    activa: true,
    coordenadasParadas: PARADAS_RUTA_ESCOLAR_VESPERTINA,
  },
  {
    id: 'rut-mercado-campesino',
    nombre: 'Ruta Solidaria Día de Mercado (Transporte Agrícola)',
    descripcion:
      'Salida sábados 05:30 AM desde Base Finca El Guadual. Auxilio a pequeños productores campesinos de veredas para transportar plátano, café y hortalizas a la Plaza de Mercado de Manizales.',
    origen: 'Base Finca El Guadual (San Peregrino)',
    destino: 'Plaza de Mercado / Central de Manizales',
    distanciaKm: 42,
    duracionMinutos: 140,
    minutosRodamiento: 70,
    minutosRalenti: 70,
    diasSemana: [6],
    tipoHorario: 'mercado_sabado',
    horaSalida: '05:30',
    esAutomatica: false,
    activa: true,
    coordenadasParadas: PARADAS_RUTA_MERCADO_CAMPESINO,
  },
]

function nuevaTarjetaMes(mes: string): TarjetaCombustibleReserva {
  return {
    id: `tarjeta-${mes}`,
    mes,
    saldoAcumuladoCOP: 0,
    saldoLiquidadoCOP: 0,
    totalGalonesMes: 0,
    tanqueos: [],
    liquidaciones: [],
    liquidadoEnCashmet: false,
  }
}

export function saldoPendienteTarjeta(tarjeta: TarjetaCombustibleReserva): number {
  const liquidado =
    typeof tarjeta.saldoLiquidadoCOP === 'number'
      ? tarjeta.saldoLiquidadoCOP
      : tarjeta.liquidadoEnCashmet
        ? tarjeta.saldoAcumuladoCOP
        : 0
  return Math.max(0, Math.round(tarjeta.saldoAcumuladoCOP - liquidado))
}

/**
 * Compacta el historial mensual de tarjetas para mantener DOC_COMBUSTIBLE muy por debajo
 * del límite de 1 MiB de Firestore: conserva últimos 12 meses y acota los tanqueos archivados.
 */
function compactarHistorialTarjetas(
  historial: TarjetaCombustibleReserva[]
): TarjetaCombustibleReserva[] {
  if (!Array.isArray(historial)) return []
  return historial.slice(0, 12).map((h) => ({
    ...h,
    tanqueos: Array.isArray(h.tanqueos) ? h.tanqueos.slice(0, 25) : [],
    liquidaciones: Array.isArray(h.liquidaciones) ? h.liquidaciones.slice(0, 12) : [],
  }))
}

function estadoInicialVacio(): EstadoBearsCompleto {
  const mesActual = hoyISO().slice(0, 7)
  return {
    vehiculosExtra: {},
    empleadosExtra: {},
    rutasHabituales: structuredClone(RUTAS_HABITUALES_INICIALES),
    rotacionContador: 0,
    turnos: [],
    misiones: [],
    eventosRadar: [],
    ultimoEscaneoRadarEn: 0,
    ultimoDiagnosticoRadar: '',
    tarjetaCombustible: nuevaTarjetaMes(mesActual),
    historialTarjetas: [],
    preciosCombustible: { ...PRECIOS_COMBUSTIBLE_BASE_COLOMBIA },
    chatMensajes: [],
  }
}

/**
 * Sanitiza recursivamente cualquier objeto para Firestore:
 * elimina `undefined`, `NaN`, funciones y símbolos; convierte `Date` a ISO string;
 * neutraliza arrays anidados en cualquier nivel (prohibidos por Firestore),
 * conservando `false`, `0`, `""`, `[]` y `{}`.
 */
function sanitizarFirestore<T>(valor: T): T {
  if (valor === null || valor === undefined) return valor
  if (typeof valor === 'function' || typeof valor === 'symbol') return undefined as unknown as T
  if (valor instanceof Date) {
    return valor.toISOString() as unknown as T
  }
  if (typeof valor === 'number') {
    return (Number.isFinite(valor) ? valor : 0) as unknown as T
  }
  if (Array.isArray(valor)) {
    const limpio = valor
      .filter((item) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol')
      .map((item) => {
        // Firestore prohíbe arrays directamente dentro de arrays (incluso nivel 2)
        if (Array.isArray(item)) {
          return JSON.stringify(sanitizarFirestore(item))
        }
        return sanitizarFirestore(item)
      })
    return limpio as unknown as T
  }
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (!k || v === undefined || typeof v === 'function' || typeof v === 'symbol') continue
      out[k] = sanitizarFirestore(v)
    }
    return out as T
  }
  return valor
}

// ---------------------------------------------------------------------------
// CACHÉ EN MEMORIA SINCRONIZADA CON FIRESTORE + MIGRACIÓN LEGACY
// ---------------------------------------------------------------------------

let cacheEstado: EstadoBearsCompleto | null = null
let hidratadoDesdePersistencia = false
let promesaHidratacion: Promise<EstadoBearsCompleto> | null = null
let hidratacionSeq = 0

export function __resetCacheBearsParaTests(): void {
  cacheEstado = null
  hidratadoDesdePersistencia = false
  promesaHidratacion = null
  hidratacionSeq++
  estadoPorDoc = crearEstadoPorDocInicial()
  hidratadoPorDoc = crearHidratadoPorDocInicial()
  estadoSyncActual = { estado: 'conectando' }
  misionesEnCierre.clear()
  vehiculosEnTanqueo.clear()
  ultimoCacheNomina = null
  ultimoCacheVehiculos = null
  establecerPreciosCombustibleCache(null)
}

function normalizarRutas(rutas?: RutaHabitual[]): RutaHabitual[] {
  if (!Array.isArray(rutas) || rutas.length === 0) {
    return structuredClone(RUTAS_HABITUALES_INICIALES)
  }
  return rutas.map((r) => {
    if (
      r.id === 'rut-mercado-campesino' &&
      (!r.coordenadasParadas || r.coordenadasParadas.length < 2)
    ) {
      return { ...r, coordenadasParadas: PARADAS_RUTA_MERCADO_CAMPESINO }
    }
    if (
      r.id === 'rut-escolar-manana' &&
      (!r.coordenadasParadas || r.coordenadasParadas.length < 2)
    ) {
      return { ...r, coordenadasParadas: PARADAS_RUTA_ESCOLAR_MATUTINA }
    }
    if (
      r.id === 'rut-escolar-tarde' &&
      (!r.coordenadasParadas || r.coordenadasParadas.length < 2)
    ) {
      return { ...r, coordenadasParadas: PARADAS_RUTA_ESCOLAR_VESPERTINA }
    }
    return r
  })
}

function migrarMesTarjetaSiCambio(estado: EstadoBearsCompleto): boolean {
  const mesActual = hoyISO().slice(0, 7)
  if (!estado.tarjetaCombustible) {
    estado.tarjetaCombustible = nuevaTarjetaMes(mesActual)
    return true
  }
  // Usar `<` en vez de `!==` para evitar archivar el mes actual ante desfases de reloj hacia atrás
  if (estado.tarjetaCombustible.mes < mesActual) {
    const anterior = estado.tarjetaCombustible
    if (anterior.saldoAcumuladoCOP > 0 || anterior.tanqueos.length > 0) {
      const yaArchivada = estado.historialTarjetas.some((h) => h.id === anterior.id)
      if (!yaArchivada) {
        estado.historialTarjetas = compactarHistorialTarjetas([
          anterior,
          ...estado.historialTarjetas,
        ])
      }
    }
    estado.tarjetaCombustible = nuevaTarjetaMes(mesActual)
    return true
  }
  return false
}

function leerMigracionLegacyLocalStorage(): Partial<EstadoBearsCompleto> | null {
  if (typeof localStorage === 'undefined') return null

  const vehiculosExtra: Record<string, Partial<VehiculoOperativo>> = {}
  const empleadosExtra: Record<string, Partial<EmpleadoOperativo>> = {}
  let parsed: Partial<EstadoBearsCompleto> = {}
  let encontroAlgo = false

  // 1. Leer estado principal legacy (sin abortar si falla)
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE_LEGACY)
    if (raw) {
      parsed = JSON.parse(raw) as Partial<EstadoBearsCompleto>
      if (parsed.vehiculosExtra && typeof parsed.vehiculosExtra === 'object') {
        Object.assign(vehiculosExtra, parsed.vehiculosExtra)
        if (Object.keys(parsed.vehiculosExtra).length > 0) encontroAlgo = true
      }
      if (parsed.empleadosExtra && typeof parsed.empleadosExtra === 'object') {
        Object.assign(empleadosExtra, parsed.empleadosExtra)
        if (Object.keys(parsed.empleadosExtra).length > 0) encontroAlgo = true
      }
      if (Array.isArray(parsed.misiones) && parsed.misiones.length > 0) encontroAlgo = true
      if (Array.isArray(parsed.turnos) && parsed.turnos.length > 0) encontroAlgo = true
    }
  } catch {
    /* continuar con mapas independientes */
  }

  // 2. Leer mapa independiente de vehículos habilitados (incluso si bears_reserve_data_v2 faltaba)
  try {
    const rawVehHab = localStorage.getItem('bears_reserve_habilitados_map_v1')
    if (rawVehHab) {
      const map = JSON.parse(rawVehHab) as Record<string, boolean>
      for (const [id, val] of Object.entries(map)) {
        if (typeof val === 'boolean') {
          vehiculosExtra[id] = { ...(vehiculosExtra[id] || {}), disponibleParaTrabajo: val }
          encontroAlgo = true
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 3. Leer mapa independiente de empleados habilitados
  try {
    const rawEmpHab = localStorage.getItem('bears_reserve_empleados_habilitados_map_v1')
    if (rawEmpHab) {
      const map = JSON.parse(rawEmpHab) as Record<string, boolean>
      for (const [id, val] of Object.entries(map)) {
        if (typeof val === 'boolean') {
          empleadosExtra[id] = { ...(empleadosExtra[id] || {}), activo: val }
          encontroAlgo = true
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (!encontroAlgo) return null

  let rotacionContador = 0
  try {
    rotacionContador = Number(localStorage.getItem('bears_reserve_rotacion_contador_v1') || 0)
  } catch {
    rotacionContador = 0
  }

  let eventosSeguros: EventoRadarLocal[] = []
  try {
    eventosSeguros = filtrarEventosRadarVigentes(parsed.eventosRadar || [])
  } catch {
    eventosSeguros = []
  }

  return {
    vehiculosExtra,
    empleadosExtra,
    rutasHabituales: parsed.rutasHabituales,
    rotacionContador: Number.isFinite(rotacionContador) ? rotacionContador : 0,
    turnos: Array.isArray(parsed.turnos) ? parsed.turnos : [],
    misiones: Array.isArray(parsed.misiones) ? parsed.misiones : [],
    eventosRadar: eventosSeguros,
    tarjetaCombustible: parsed.tarjetaCombustible,
  }
}

function persistirDoc(
  docId: string,
  data: Record<string, unknown>,
  actualizado: number,
  estricto = false
): Promise<boolean> {
  // Bloquear escritura en Firestore si la lectura inicial de este documento falló sin espejo local válido
  if (!hidratadoPorDoc[docId]) {
    const msg = `${docId}: escritura protegida (lectura inicial incompleta)`
    actualizarEstadoDoc(docId, {
      estado: 'error',
      ultimoError: msg,
    })
    if (estricto) {
      return Promise.reject(
        new Error(
          `No se pudo guardar en Firestore porque la lectura inicial de ${docId} falló. Reintenta sincronización.`
        )
      )
    }
    return Promise.resolve(false)
  }

  // Captura inmutable ANTES de encolar para evitar que mutaciones posteriores alteren esta escritura
  const payload = sanitizarFirestore({ ...data, actualizado })
  const seccion = seccionDeDoc(docId)
  const previa = colasEscrituraDoc[docId] || Promise.resolve()
  const tarea = previa
    .catch(() => undefined)
    .then(async (): Promise<boolean> => {
      try {
        await setDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, docId), payload)
        if (seccion) {
          marcarSeccionSincronizadaLocal(seccion, actualizado)
        }
        actualizarEstadoDoc(docId, {
          estado: 'sincronizado',
          ultimoError: undefined,
          ultimaEscrituraOkEn: Date.now(),
        })
        return true
      } catch (err) {
        const codigo =
          (err as { code?: string })?.code ||
          (err instanceof Error ? err.message : 'error_desconocido')
        console.warn(`Error persistiendo ${docId} en Firestore:`, err)
        actualizarEstadoDoc(docId, {
          estado: 'error',
          ultimoError: `${docId}: ${codigo}`,
        })
        if (estricto) {
          throw new Error(`No se pudo confirmar la escritura en Firestore (${docId}: ${codigo}).`)
        }
        return false
      }
    })
  colasEscrituraDoc[docId] = tarea
  return tarea
}

async function persistirConfig(estado: EstadoBearsCompleto): Promise<boolean> {
  const ahora = Date.now()
  guardarSeccionSnapshotLocal('config', {
    vehiculosExtra: sanitizarFirestore(estado.vehiculosExtra),
    empleadosExtra: sanitizarFirestore(estado.empleadosExtra),
    rutasHabituales: sanitizarFirestore(estado.rutasHabituales),
    rotacionContador: estado.rotacionContador,
    actualizado: ahora,
    pendienteSync: true,
  })
  return await persistirDoc(
    DOC_CONFIG,
    {
      vehiculosExtra: estado.vehiculosExtra,
      empleadosExtra: estado.empleadosExtra,
      rutasHabituales: estado.rutasHabituales,
      rotacionContador: estado.rotacionContador,
    },
    ahora
  )
}

async function persistirOperaciones(estado: EstadoBearsCompleto): Promise<boolean> {
  const ahora = Date.now()
  const misionesRec = estado.misiones.slice(0, 250)
  guardarSeccionSnapshotLocal('operaciones', {
    turnos: sanitizarFirestore(estado.turnos),
    misiones: sanitizarFirestore(misionesRec),
    eventosRadar: sanitizarFirestore(estado.eventosRadar),
    ultimoEscaneoRadarEn: estado.ultimoEscaneoRadarEn,
    ultimoDiagnosticoRadar: estado.ultimoDiagnosticoRadar,
    actualizado: ahora,
    pendienteSync: true,
  })
  return await persistirDoc(
    DOC_OPERACIONES,
    {
      turnos: estado.turnos,
      misiones: misionesRec,
      eventosRadar: estado.eventosRadar,
      ultimoEscaneoRadarEn: estado.ultimoEscaneoRadarEn,
      ultimoDiagnosticoRadar: estado.ultimoDiagnosticoRadar,
    },
    ahora
  )
}

async function persistirCombustible(
  estado: EstadoBearsCompleto,
  estricto = false
): Promise<boolean> {
  const ahora = Date.now()
  const histRec = compactarHistorialTarjetas(estado.historialTarjetas)
  estado.historialTarjetas = histRec
  const tarjetaActiva: TarjetaCombustibleReserva = {
    ...estado.tarjetaCombustible,
    tanqueos: Array.isArray(estado.tarjetaCombustible.tanqueos)
      ? estado.tarjetaCombustible.tanqueos.slice(0, 200)
      : [],
  }
  estado.tarjetaCombustible = tarjetaActiva

  guardarSeccionSnapshotLocal('combustible', {
    tarjetaCombustible: sanitizarFirestore(tarjetaActiva),
    historialTarjetas: sanitizarFirestore(histRec),
    preciosCombustible: sanitizarFirestore(estado.preciosCombustible),
    actualizado: ahora,
    pendienteSync: true,
  })
  return await persistirDoc(
    DOC_COMBUSTIBLE,
    {
      tarjetaCombustible: tarjetaActiva,
      historialTarjetas: histRec,
      preciosCombustible: estado.preciosCombustible,
    },
    ahora,
    estricto
  )
}

async function persistirChat(estado: EstadoBearsCompleto): Promise<boolean> {
  const ahora = Date.now()
  const msgsRec = estado.chatMensajes.slice(-60)
  guardarSeccionSnapshotLocal('chat', {
    chatMensajes: sanitizarFirestore(msgsRec),
    actualizado: ahora,
    pendienteSync: true,
  })
  return await persistirDoc(
    DOC_CHAT,
    {
      chatMensajes: msgsRec,
    },
    ahora
  )
}

/**
 * Hidrata el estado completo de Bear's Reserve desde Firestore + espejo local de seguridad.
 * - Lee cada documento por separado (un fallo en uno no borra los demás).
 * - Si un documento falla en lectura y no tiene espejo local válido, bloquea escrituras
 *   hacia ese documento para jamás sobrescribir producción con estado vacío.
 * - Si el espejo local tiene cambios pendientes más recientes que Firestore, prevalece
 *   el estado local completo (respetando cancelaciones y listas vaciadas).
 */
export async function hidratarEstadoBears(forzar = false): Promise<EstadoBearsCompleto> {
  if (hidratadoDesdePersistencia && cacheEstado && !forzar) return cacheEstado
  if (promesaHidratacion && !forzar) return promesaHidratacion

  const miSeq = ++hidratacionSeq
  const miPromesa = (async (): Promise<EstadoBearsCompleto> => {
    const base = estadoInicialVacio()
    let existiaEnFirestore = false
    const erroresLectura: string[] = []
    const snapLocal = leerSnapshotCompletoLocal()

    const tsRemoto = { config: 0, operaciones: 0, combustible: 0, chat: 0 }

    const leerDocSeguro = async (docId: string) => {
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, docId))
        return { ok: true as const, snap }
      } catch (err) {
        const codigo =
          (err as { code?: string })?.code ||
          (err instanceof Error ? err.message : 'error_lectura')
        const detalle = `${docId}: ${codigo}`
        erroresLectura.push(detalle)
        console.warn(`Error leyendo ${docId} desde Firestore:`, err)
        return { ok: false as const, snap: null, error: detalle }
      }
    }

    const [resCfg, resOp, resComb, resChat] = await Promise.all([
      leerDocSeguro(DOC_CONFIG),
      leerDocSeguro(DOC_OPERACIONES),
      leerDocSeguro(DOC_COMBUSTIBLE),
      leerDocSeguro(DOC_CHAT),
    ])

    const snapCfg = resCfg.snap
    const snapOp = resOp.snap
    const snapComb = resComb.snap
    const snapChat = resChat.snap

    // Registrar por documento si puede persistirse con seguridad (lectura OK o espejo local válido)
    const resultadosDoc = [
      { docId: DOC_CONFIG, res: resCfg, tieneEspejo: Boolean(snapLocal.config) },
      { docId: DOC_OPERACIONES, res: resOp, tieneEspejo: Boolean(snapLocal.operaciones) },
      { docId: DOC_COMBUSTIBLE, res: resComb, tieneEspejo: Boolean(snapLocal.combustible) },
      { docId: DOC_CHAT, res: resChat, tieneEspejo: Boolean(snapLocal.chat) },
    ]
    for (const item of resultadosDoc) {
      if (item.res.ok) {
        hidratadoPorDoc[item.docId] = true
        actualizarEstadoDoc(item.docId, {
          estado: 'sincronizado',
          ultimoError: undefined,
          ultimaEscrituraOkEn: estadoPorDoc[item.docId]?.ultimaEscrituraOkEn ?? Date.now(),
        })
      } else {
        hidratadoPorDoc[item.docId] = item.tieneEspejo
        actualizarEstadoDoc(item.docId, {
          estado: 'error',
          ultimoError: item.res.error,
        })
      }
    }

    if (snapCfg?.exists()) {
      existiaEnFirestore = true
      const d = snapCfg.data() as Partial<EstadoBearsCompleto> & { actualizado?: number }
      base.vehiculosExtra = d.vehiculosExtra || {}
      base.empleadosExtra = d.empleadosExtra || {}
      base.rutasHabituales = normalizarRutas(d.rutasHabituales)
      base.rotacionContador = Number(d.rotacionContador) || 0
      tsRemoto.config = Number(d.actualizado) || 0
    }

    if (snapOp?.exists()) {
      existiaEnFirestore = true
      const d = snapOp.data() as Partial<EstadoBearsCompleto> & { actualizado?: number }
      base.turnos = Array.isArray(d.turnos) ? d.turnos : []
      base.misiones = Array.isArray(d.misiones) ? d.misiones : []
      base.eventosRadar = deduplicarEventosRadar(filtrarEventosRadarVigentes(d.eventosRadar || []))
      base.ultimoEscaneoRadarEn = Number(d.ultimoEscaneoRadarEn) || 0
      base.ultimoDiagnosticoRadar = String(d.ultimoDiagnosticoRadar || '')
      tsRemoto.operaciones = Number(d.actualizado) || 0
    }

    if (snapComb?.exists()) {
      existiaEnFirestore = true
      const d = snapComb.data() as Partial<EstadoBearsCompleto> & { actualizado?: number }
      if (d.tarjetaCombustible) base.tarjetaCombustible = d.tarjetaCombustible
      base.historialTarjetas = compactarHistorialTarjetas(
        Array.isArray(d.historialTarjetas) ? d.historialTarjetas : []
      )
      if (d.preciosCombustible && d.preciosCombustible.corrientePorGalon > 0) {
        base.preciosCombustible = d.preciosCombustible
      }
      tsRemoto.combustible = Number(d.actualizado) || 0
    }

    if (snapChat?.exists()) {
      existiaEnFirestore = true
      const d = snapChat.data() as Partial<EstadoBearsCompleto> & { actualizado?: number }
      base.chatMensajes = Array.isArray(d.chatMensajes) ? d.chatMensajes : []
      tsRemoto.chat = Number(d.actualizado) || 0
    }

    // Reconciliación con el espejo local completo por documento y sub-campo
    let debeResincConfig = false
    let debeResincOp = false
    let debeResincComb = false
    let debeResincChat = false

    if (snapLocal.config) {
      const localMasReciente = snapLocal.config.actualizado > tsRemoto.config
      const localPendiente = Boolean(snapLocal.config.pendienteSync)

      if (!snapCfg?.exists() || (localMasReciente && localPendiente)) {
        // Estado local completo prevalece (respetando listas/mapas vaciados o editados offline)
        base.vehiculosExtra = { ...(snapLocal.config.vehiculosExtra || {}) }
        base.empleadosExtra = { ...(snapLocal.config.empleadosExtra || {}) }
        if (Array.isArray(snapLocal.config.rutasHabituales)) {
          base.rutasHabituales = normalizarRutas(snapLocal.config.rutasHabituales)
        }
        base.rotacionContador = Number(snapLocal.config.rotacionContador) || 0
        debeResincConfig = true
      } else {
        // Reconciliación independiente por sub-campo (vehiculosExtra vs empleadosExtra)
        const localTieneVehiculosQueFaltan =
          Object.keys(base.vehiculosExtra).length === 0 &&
          Object.keys(snapLocal.config.vehiculosExtra || {}).length > 0
        const localTieneEmpleadosQueFaltan =
          Object.keys(base.empleadosExtra).length === 0 &&
          Object.keys(snapLocal.config.empleadosExtra || {}).length > 0

        if (
          (localMasReciente || localTieneVehiculosQueFaltan) &&
          Object.keys(snapLocal.config.vehiculosExtra || {}).length > 0
        ) {
          base.vehiculosExtra = { ...base.vehiculosExtra, ...snapLocal.config.vehiculosExtra }
          debeResincConfig = true
        }
        if (
          (localMasReciente || localTieneEmpleadosQueFaltan) &&
          Object.keys(snapLocal.config.empleadosExtra || {}).length > 0
        ) {
          base.empleadosExtra = { ...base.empleadosExtra, ...snapLocal.config.empleadosExtra }
          debeResincConfig = true
        }
        if (
          localMasReciente &&
          Array.isArray(snapLocal.config.rutasHabituales) &&
          snapLocal.config.rutasHabituales.length > 0
        ) {
          base.rutasHabituales = normalizarRutas(snapLocal.config.rutasHabituales)
          base.rotacionContador = Number(snapLocal.config.rotacionContador) || base.rotacionContador
          debeResincConfig = true
        }
      }
    }

    if (snapLocal.operaciones) {
      const localMasReciente = snapLocal.operaciones.actualizado > tsRemoto.operaciones
      const localPendiente = Boolean(snapLocal.operaciones.pendienteSync)
      const misionesLocales = Array.isArray(snapLocal.operaciones.misiones)
        ? snapLocal.operaciones.misiones
        : []

      if (!snapOp?.exists() || (localMasReciente && localPendiente)) {
        // Prevalece el estado local completo: respeta cancelaciones de misiones programadas y listas vaciadas
        base.turnos = Array.isArray(snapLocal.operaciones.turnos)
          ? snapLocal.operaciones.turnos
          : []
        base.misiones = misionesLocales
        base.eventosRadar = deduplicarEventosRadar(
          filtrarEventosRadarVigentes(snapLocal.operaciones.eventosRadar || [])
        )
        base.ultimoEscaneoRadarEn = Number(snapLocal.operaciones.ultimoEscaneoRadarEn) || 0
        base.ultimoDiagnosticoRadar = String(snapLocal.operaciones.ultimoDiagnosticoRadar || '')
        debeResincOp = true
      } else if (localMasReciente) {
        if (Array.isArray(snapLocal.operaciones.turnos)) {
          base.turnos = snapLocal.operaciones.turnos
        }
        base.misiones = misionesLocales
        base.eventosRadar = deduplicarEventosRadar(
          filtrarEventosRadarVigentes(snapLocal.operaciones.eventosRadar || [])
        )
        base.ultimoEscaneoRadarEn =
          Number(snapLocal.operaciones.ultimoEscaneoRadarEn) || base.ultimoEscaneoRadarEn
        base.ultimoDiagnosticoRadar =
          String(snapLocal.operaciones.ultimoDiagnosticoRadar || '') || base.ultimoDiagnosticoRadar
        debeResincOp = true
      } else {
        const faltantesEnCurso = misionesLocales.filter(
          (ml) => ml.estado === 'en_curso' && !base.misiones.some((mr) => mr.id === ml.id)
        )
        if (faltantesEnCurso.length > 0) {
          base.misiones = [...faltantesEnCurso, ...base.misiones]
          debeResincOp = true
        }
      }
    }

    if (snapLocal.combustible) {
      const localMasReciente = snapLocal.combustible.actualizado > tsRemoto.combustible
      const localPendiente = Boolean(snapLocal.combustible.pendienteSync)
      if (!snapComb?.exists() || (localMasReciente && localPendiente) || localMasReciente) {
        if (snapLocal.combustible.tarjetaCombustible) {
          base.tarjetaCombustible = snapLocal.combustible.tarjetaCombustible
        }
        if (Array.isArray(snapLocal.combustible.historialTarjetas)) {
          base.historialTarjetas = compactarHistorialTarjetas(snapLocal.combustible.historialTarjetas)
        }
        if (snapLocal.combustible.preciosCombustible?.corrientePorGalon > 0) {
          base.preciosCombustible = snapLocal.combustible.preciosCombustible
        }
        debeResincComb = true
      }
    }

    if (snapLocal.chat) {
      const localMasReciente = snapLocal.chat.actualizado > tsRemoto.chat
      const localPendiente = Boolean(snapLocal.chat.pendienteSync)
      if (!snapChat?.exists() || (localMasReciente && localPendiente)) {
        if (Array.isArray(snapLocal.chat.chatMensajes)) {
          base.chatMensajes = snapLocal.chat.chatMensajes
          debeResincChat = true
        }
      } else if (
        localMasReciente &&
        Array.isArray(snapLocal.chat.chatMensajes) &&
        snapLocal.chat.chatMensajes.length > 0
      ) {
        base.chatMensajes = snapLocal.chat.chatMensajes
        debeResincChat = true
      }
    }

    // Recuperación legacy desde localStorage antiguo (solo si hay datos reales; NUNCA escribe documentos vacíos)
    const legacy = leerMigracionLegacyLocalStorage()
    let migroLegacy = false
    if (legacy) {
      if (
        Object.keys(base.vehiculosExtra).length === 0 &&
        legacy.vehiculosExtra &&
        Object.keys(legacy.vehiculosExtra).length > 0
      ) {
        base.vehiculosExtra = legacy.vehiculosExtra
        debeResincConfig = true
        migroLegacy = true
      }
      if (
        Object.keys(base.empleadosExtra).length === 0 &&
        legacy.empleadosExtra &&
        Object.keys(legacy.empleadosExtra).length > 0
      ) {
        base.empleadosExtra = legacy.empleadosExtra
        debeResincConfig = true
        migroLegacy = true
      }
      if (!existiaEnFirestore && erroresLectura.length === 0) {
        if (legacy.rutasHabituales) {
          base.rutasHabituales = normalizarRutas(legacy.rutasHabituales)
          debeResincConfig = true
          migroLegacy = true
        }
        if (typeof legacy.rotacionContador === 'number' && legacy.rotacionContador > 0) {
          base.rotacionContador = legacy.rotacionContador
          debeResincConfig = true
          migroLegacy = true
        }
        if (legacy.turnos?.length && base.turnos.length === 0) {
          base.turnos = legacy.turnos
          debeResincOp = true
          migroLegacy = true
        }
        if (legacy.misiones?.length && base.misiones.length === 0) {
          base.misiones = legacy.misiones
          debeResincOp = true
          migroLegacy = true
        }
        if (legacy.eventosRadar?.length && base.eventosRadar.length === 0) {
          base.eventosRadar = legacy.eventosRadar
          debeResincOp = true
          migroLegacy = true
        }
        if (legacy.tarjetaCombustible && base.tarjetaCombustible.tanqueos.length === 0) {
          base.tarjetaCombustible = legacy.tarjetaCombustible
          debeResincComb = true
          migroLegacy = true
        }
      }
    }

    const cambioMes = migrarMesTarjetaSiCambio(base)
    if (cambioMes) debeResincComb = true

    if (erroresLectura.length === 0) {
      const tareasResinc: Array<Promise<boolean>> = []
      if (debeResincConfig) tareasResinc.push(persistirConfig(base))
      if (debeResincOp) tareasResinc.push(persistirOperaciones(base))
      if (debeResincComb) tareasResinc.push(persistirCombustible(base))
      if (debeResincChat) tareasResinc.push(persistirChat(base))
      if (tareasResinc.length > 0) {
        const resultados = await Promise.all(tareasResinc)
        if (migroLegacy && resultados.every(Boolean)) {
          limpiarClavesLegacyLocalStorage()
        }
      } else if (migroLegacy) {
        limpiarClavesLegacyLocalStorage()
      }
    }

    if (miSeq === hidratacionSeq) {
      establecerPreciosCombustibleCache(base.preciosCombustible)
      cacheEstado = base
      // Solo marcar hidratación completa si NO hubo errores de lectura
      if (erroresLectura.length === 0) {
        hidratadoDesdePersistencia = true
      }
    }
    return base
  })()

  promesaHidratacion = miPromesa
  try {
    return await miPromesa
  } finally {
    if (promesaHidratacion === miPromesa) {
      promesaHidratacion = null
    }
  }
}

/**
 * Lectura síncrona segura para estados iniciales de React (`useState`).
 * CRÍTICO: NUNCA asigna `cacheEstado` ni marca `hidratadoDesdePersistencia = true`;
 * de lo contrario el primer render de BearsReservePortal impediría que `hidratarEstadoBears()`
 * leyera Firestore y localStorage al recargar (F5).
 */
function obtenerCacheSincrono(): EstadoBearsCompleto {
  return cacheEstado ?? estadoInicialVacio()
}

// ---------------------------------------------------------------------------
// MAPEO DE EMPLEADOS Y VEHÍCULOS (SIN EXCLUSIONES POR CÓDIGO, CON MODO DEMO PERSISTENTE)
// ---------------------------------------------------------------------------

const EMPLEADOS_DEMO: Nomina[] = [
  {
    id: 'emp-demo-1',
    nombreCompleto: 'Andrés Morales Gómez',
    cargo: 'Conductor de Rescate Rural',
    activo: true,
    tipoContrato: 'indefinido',
    salarioBaseMensual: 0,
  },
  {
    id: 'emp-demo-2',
    nombreCompleto: 'Valentina Osorio Ríos',
    cargo: 'Mecánica y Enlace Veredal',
    activo: true,
    tipoContrato: 'indefinido',
    salarioBaseMensual: 0,
  },
]

const VEHICULOS_DEMO: Vehiculo[] = [
  {
    id: 'veh-demo-1',
    placa: 'WML421',
    marca: 'Chevrolet',
    linea: 'Kodiak 4x4 Rescate',
    modelo: 2018,
    tipo: 'camion',
    activo: true,
    estado: 'Disponible',
    notas: 'Camión 4x4 con winche pesado para rescate en barro y carga.',
    mantenimiento: { kilometrajeActual: 142350, tareas: [] },
  },
  {
    id: 'veh-demo-2',
    placa: 'KJR890',
    marca: 'Toyota',
    linea: 'Land Cruiser Troop Carrier',
    modelo: 2021,
    tipo: 'carro',
    activo: true,
    estado: 'Disponible',
    notas: 'Campero 4x4 con capacidad de pasajeros para ruta escolar rural.',
    mantenimiento: { kilometrajeActual: 89400, tareas: [] },
  },
]

function transformarEmpleado(
  nomina: Nomina,
  extra: Partial<EmpleadoOperativo> | undefined,
  turnosTodos: TurnoSemanal[],
  semanaActualISO: string
): EmpleadoOperativo {
  const nombre = nomina.nombreCompleto || 'Colaborador'
  const cargo = nomina.cargo || 'Operador'
  const habilidadesDefault: string[] = []

  const cargoLower = cargo.toLowerCase()
  if (cargoLower.includes('chofer') || cargoLower.includes('conductor')) {
    habilidadesDefault.push('Conducción en alta montaña', 'Navegación de trochas')
  } else if (
    cargoLower.includes('mecanic') ||
    cargoLower.includes('mecánic') ||
    cargoLower.includes('tecnic')
  ) {
    habilidadesDefault.push('Mecánica de emergencia', 'Manejo de winche y eslingas')
  } else {
    habilidadesDefault.push('Logística comunitaria', 'Primeros auxilios básicos', 'Apoyo operativo')
  }

  const activoEnCashmet = nomina.activo !== false
  // NUNCA excluimos a nadie por código según su cargo: solo manda CashMet + el switch explícito del usuario
  const activo = !activoEnCashmet
    ? false
    : typeof extra?.activo === 'boolean'
      ? extra.activo
      : true

  const horasCalculadas = turnosTodos
    .filter((t) => t.semanaISO === semanaActualISO && t.empleadoId === nomina.id)
    .reduce((acc, t) => acc + t.horas, 0)

  return {
    id: nomina.id,
    nominaId: nomina.id,
    nombreCompleto: nombre,
    cargo,
    habilidades: extra?.habilidades?.length ? extra.habilidades : habilidadesDefault,
    horasSemanalesAsignadas: Number(horasCalculadas.toFixed(1)),
    maxHorasSemanales: extra?.maxHorasSemanales || 42,
    activo,
    activoEnCashmet,
    horariosNoDisponibles: extra?.horariosNoDisponibles || [],
    enTurnoActivo: extra?.enTurnoActivo ?? false,
    turnoActualTexto: extra?.turnoActualTexto,
  }
}

function transformarVehiculo(
  v: Vehiculo,
  extra: Partial<VehiculoOperativo> | undefined,
  idsEnMision: Set<string>,
  esDemo = false
): VehiculoOperativo {
  const tipo = v.tipo || 'carro'
  const fichaFallback = investigarFichaVehiculoIA(
    v.marca,
    v.linea,
    v.tipo,
    v.modelo,
    v.notas,
    v.carroceria,
    v.capacidad
  )

  const disponibleEnCashmet = v.activo !== false && (v.estado === 'Disponible' || !v.estado)
  const disponibleParaTrabajo = !disponibleEnCashmet
    ? false
    : typeof extra?.disponibleParaTrabajo === 'boolean'
      ? extra.disponibleParaTrabajo
      : esDemo

  const nivelComb = extra?.nivelCombustiblePorc ?? 85
  const estadoCalculado: VehiculoOperativo['estado'] =
    !disponibleEnCashmet || v.estado === 'En reparación'
      ? 'mantenimiento'
      : idsEnMision.has(v.id)
        ? 'en_mision'
        : nivelComb <= UMBRAL_RESERVA_COMBUSTIBLE_PORC
          ? 'reserva'
          : 'disponible'

  const kmCashmet = v.mantenimiento?.kilometrajeActual ?? 0
  const kmFinal = Math.max(kmCashmet, extra?.kilometrajeActual ?? 0)

  const capacidadTanqueGalones =
    extra?.capacidadTanqueGalones ??
    fichaFallback.capacidadTanqueGalones ??
    CAPACIDAD_TANQUE_FALLBACK_GAL

  return {
    id: v.id,
    vehiculoId: v.id,
    placa: v.placa,
    marca: v.marca,
    linea: v.linea,
    modelo: v.modelo,
    tipo,
    notasCashmet: v.notas,
    carroceria: v.carroceria,
    claseVehiculo: v.claseVehiculo,
    capacidadTexto: v.capacidad,
    cilindraje: v.cilindraje,
    disponibleParaTrabajo,
    disponibleEnCashmet,
    estadoCashmet: v.estado || (v.activo === false ? 'Inactivo' : 'Disponible'),
    investigadoIA: extra?.investigadoIA ?? false,
    fuenteFicha: extra?.fuenteFicha,
    fichaInvestigadaNota: extra?.fichaInvestigadaNota ?? fichaFallback.fichaInvestigadaNota,
    estado: estadoCalculado,
    tipoCombustible: extra?.tipoCombustible ?? fichaFallback.tipoCombustible,
    capacidadTanqueGalones,
    capacidadTanqueLitros: extra?.capacidadTanqueLitros ?? fichaFallback.capacidadTanqueLitros,
    nivelCombustiblePorc: nivelComb,
    consumoKmPorGalon: extra?.consumoKmPorGalon ?? fichaFallback.consumoKmPorGalon,
    kilometrajeActual: kmFinal,
    desgasteLlantasPorc: extra?.desgasteLlantasPorc ?? 18,
    estadoBateriaPorc: extra?.estadoBateriaPorc ?? 95,
    totalGalonesConsumidos: extra?.totalGalonesConsumidos ?? 0,
    totalCostoCombustibleCOP: extra?.totalCostoCombustibleCOP ?? 0,
  }
}

// ---------------------------------------------------------------------------
// OPERACIONES PÚBLICAS
// ---------------------------------------------------------------------------

export async function listarEmpleadosBears(): Promise<EmpleadoOperativo[]> {
  const [resNom, estado] = await Promise.all([
    listarNomina()
      .then((lista) => ({ ok: true as const, lista }))
      .catch((err) => {
        console.warn('Error leyendo nómina de CashMet:', err)
        return { ok: false as const, lista: [] as Nomina[] }
      }),
    hidratarEstadoBears(),
  ])

  let nominados: Nomina[]
  let esDemo = false
  if (resNom.ok) {
    ultimoCacheNomina = resNom.lista
    nominados = resNom.lista
    esDemo = nominados.length === 0
  } else {
    // Nunca activar Demo por error transitorio de red/Firestore
    nominados = ultimoCacheNomina ?? []
    esDemo = false
  }

  const fuente = esDemo ? EMPLEADOS_DEMO : nominados
  const semanaActual = lunesDeEstaSemanaISO()
  return fuente.map((n) =>
    transformarEmpleado(n, estado.empleadosExtra[n.id], estado.turnos, semanaActual)
  )
}

export async function listarVehiculosBears(): Promise<VehiculoOperativo[]> {
  const [resVeh, estado] = await Promise.all([
    listarVehiculos()
      .then((lista) => ({ ok: true as const, lista }))
      .catch((err) => {
        console.warn('Error leyendo vehículos de CashMet:', err)
        return { ok: false as const, lista: [] as Vehiculo[] }
      }),
    hidratarEstadoBears(),
  ])

  let listaCashmet: Vehiculo[]
  let esDemo = false
  if (resVeh.ok) {
    ultimoCacheVehiculos = resVeh.lista
    listaCashmet = resVeh.lista
    esDemo = listaCashmet.length === 0
  } else {
    // Nunca activar Demo por error transitorio de red/Firestore
    listaCashmet = ultimoCacheVehiculos ?? []
    esDemo = false
  }

  const fuente = esDemo ? VEHICULOS_DEMO : listaCashmet

  const idsEnMision = new Set<string>()
  for (const m of estado.misiones) {
    if (m.estado === 'en_curso') {
      for (const va of m.vehiculosAsignados || []) {
        idsEnMision.add(va.id)
      }
    }
  }

  return fuente.map((v) => transformarVehiculo(v, estado.vehiculosExtra[v.id], idsEnMision, esDemo))
}

export async function guardarExtraVehiculo(
  id: string,
  extra: Partial<VehiculoOperativo>
): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.vehiculosExtra[id] = { ...(estado.vehiculosExtra[id] || {}), ...extra }
  await persistirConfig(estado)
}

export async function guardarExtraEmpleado(
  id: string,
  extra: Partial<EmpleadoOperativo>
): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.empleadosExtra[id] = { ...(estado.empleadosExtra[id] || {}), ...extra }
  await persistirConfig(estado)
}

/**
 * Investiga la ficha técnica de un vehículo usando Gemini IA (con búsqueda web).
 * Informa honestamente si la fuente fue Gemini IA o el catálogo local de respaldo.
 */
export async function investigarVehiculoIndividualIA(
  vehiculoId: string
): Promise<{ vehiculo: VehiculoOperativo | null; usoGemini: boolean }> {
  const vehiculos = await listarVehiculosBears()
  const v = vehiculos.find((x) => x.id === vehiculoId || x.vehiculoId === vehiculoId)
  if (!v) return { vehiculo: null, usoGemini: false }

  const fichaGemini = await investigarVehiculoConGeminiAI({
    marca: v.marca,
    linea: v.linea,
    tipo: v.tipo,
    modelo: v.modelo,
    notas: v.notasCashmet,
    carroceria: v.carroceria,
    cilindraje: v.cilindraje,
    capacidadTexto: v.capacidadTexto,
  })

  const usoGemini = Boolean(fichaGemini)
  const ficha =
    fichaGemini ??
    investigarFichaVehiculoIA(
      v.marca,
      v.linea,
      v.tipo,
      v.modelo,
      v.notasCashmet,
      v.carroceria,
      v.capacidadTexto
    )

  await guardarExtraVehiculo(v.id, {
    investigadoIA: true,
    fuenteFicha: usoGemini ? 'gemini' : 'catalogo_local',
    fichaInvestigadaNota: ficha.fichaInvestigadaNota,
    capacidadTanqueGalones: ficha.capacidadTanqueGalones,
    capacidadTanqueLitros: ficha.capacidadTanqueLitros,
    consumoKmPorGalon: ficha.consumoKmPorGalon,
    tipoCombustible: ficha.tipoCombustible,
  })

  const actualizados = await listarVehiculosBears()
  return {
    vehiculo: actualizados.find((x) => x.id === vehiculoId) || null,
    usoGemini,
  }
}

export async function investigarVehiculosPendientesIA(
  forzarTodos = false
): Promise<{
  procesados: number
  conGemini: number
  conCatalogoLocal: number
  nombres: string[]
}> {
  // Leer flota una sola vez y persistir config una sola vez al final
  const [vehiculos, estado] = await Promise.all([listarVehiculosBears(), hidratarEstadoBears()])
  const pendientes = forzarTodos
    ? vehiculos.filter((v) => v.disponibleParaTrabajo)
    : vehiculos.filter((v) => v.disponibleParaTrabajo && !v.investigadoIA)

  const nombres: string[] = []
  let conGemini = 0
  let conCatalogoLocal = 0

  for (const v of pendientes) {
    const fichaGemini = await investigarVehiculoConGeminiAI({
      marca: v.marca,
      linea: v.linea,
      tipo: v.tipo,
      modelo: v.modelo,
      notas: v.notasCashmet,
      carroceria: v.carroceria,
      cilindraje: v.cilindraje,
      capacidadTexto: v.capacidadTexto,
    })

    const usoGemini = Boolean(fichaGemini)
    const ficha =
      fichaGemini ??
      investigarFichaVehiculoIA(
        v.marca,
        v.linea,
        v.tipo,
        v.modelo,
        v.notasCashmet,
        v.carroceria,
        v.capacidadTexto
      )

    estado.vehiculosExtra[v.id] = {
      ...(estado.vehiculosExtra[v.id] || {}),
      investigadoIA: true,
      fuenteFicha: usoGemini ? 'gemini' : 'catalogo_local',
      fichaInvestigadaNota: ficha.fichaInvestigadaNota,
      capacidadTanqueGalones: ficha.capacidadTanqueGalones,
      capacidadTanqueLitros: ficha.capacidadTanqueLitros,
      consumoKmPorGalon: ficha.consumoKmPorGalon,
      tipoCombustible: ficha.tipoCombustible,
    }

    nombres.push(`${v.marca} ${v.linea}`)
    if (usoGemini) conGemini++
    else conCatalogoLocal++
  }

  if (nombres.length > 0) {
    await persistirConfig(estado)
  }

  return {
    procesados: nombres.length,
    conGemini,
    conCatalogoLocal,
    nombres,
  }
}

export async function reemplazarLlantasVehiculo(id: string): Promise<void> {
  await guardarExtraVehiculo(id, { desgasteLlantasPorc: 0 })
}

export function obtenerRotacionContador(): number {
  return obtenerCacheSincrono().rotacionContador || 0
}

export async function guardarRotacionContador(contador: number): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.rotacionContador = contador
  await persistirConfig(estado)
}

export function listarTurnos(): TurnoSemanal[] {
  return [...obtenerCacheSincrono().turnos]
}

/**
 * Guarda los turnos de la semana indicada (o las semanas presentes en `turnos`)
 * conservando historial de las últimas 4 semanas.
 */
export async function guardarTurnos(
  turnos: TurnoSemanal[],
  semanaObjetivo?: string
): Promise<void> {
  const estado = await hidratarEstadoBears()
  const semanasNuevas = new Set(turnos.map((t) => t.semanaISO).filter(Boolean))
  if (semanaObjetivo) {
    semanasNuevas.add(semanaObjetivo)
  }
  if (semanasNuevas.size === 0) {
    semanasNuevas.add(lunesDeEstaSemanaISO())
  }

  const turnosOtrasSemanas = (estado.turnos || []).filter((t) => !semanasNuevas.has(t.semanaISO))
  const combinados = [...turnosOtrasSemanas, ...turnos]
  const semanasRecientes = new Set(
    Array.from(new Set(combinados.map((t) => t.semanaISO).filter(Boolean)))
      .sort()
      .slice(-4)
  )

  estado.turnos = combinados.filter((t) => !t.semanaISO || semanasRecientes.has(t.semanaISO))
  await persistirOperaciones(estado)
}

export function listarMisiones(): MisionComunitaria[] {
  return [...obtenerCacheSincrono().misiones]
}

export async function guardarMision(mision: MisionComunitaria): Promise<void> {
  const estado = await hidratarEstadoBears()
  const idx = estado.misiones.findIndex((m) => m.id === mision.id)
  if (idx >= 0) {
    estado.misiones = estado.misiones.map((m, i) => (i === idx ? mision : m))
  } else {
    estado.misiones = [mision, ...estado.misiones]
  }
  await persistirOperaciones(estado)
}

/**
 * Despacha o programa una misión operativa:
 * - Calcula consumo y costo reales según los vehículos asignados y su tipoCombustible.
 * - Si es inmediata (`en_curso`), registra `iniciadaEn` y `finalizaEstimadaEn` para resolución automática.
 * - Si es programada (`programada`), crea además un evento real en el Calendario de CashMet.
 * - Si proviene de un evento de radar, marca el evento como `despachado: true`.
 */
export async function crearMisionOperativa(
  misionBase: MisionComunitaria
): Promise<MisionComunitaria> {
  const estado = await hidratarEstadoBears()
  const vehiculos = await listarVehiculosBears()

  const km = Math.max(0.5, Number(misionBase.distanciaKmIdaYVuelta) || 10)
  const durMin = Math.max(10, Math.round(Number(misionBase.duracionMinutos) || 60))

  const vehsParticipantes = vehiculos.filter((v) =>
    (misionBase.vehiculosAsignados || []).some((va) => va.id === v.id)
  )

  let galTotal = 0
  let costoTotal = 0
  let desgasteMax = 0
  for (const v of vehsParticipantes) {
    const c = calcularConsumoMision(
      v.tipo,
      km,
      misionBase.terreno,
      v.consumoKmPorGalon,
      v.tipoCombustible
    )
    const galRal = calcularCombustibleRalenti(v.tipo, misionBase.minutosRalentiEstimados || 0)
    const galVeh = Number((c.galones + galRal).toFixed(2))
    galTotal += galVeh
    costoTotal += Math.round(galVeh * obtenerPrecioGalon(v.tipoCombustible))
    desgasteMax = Math.max(desgasteMax, c.desgasteLlantasPorc)
  }

  const ahora = Date.now()
  const esEnCurso = misionBase.estado === 'en_curso'
  const horaIni = new Date(ahora).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const horaFinEst = new Date(ahora + durMin * 60_000).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  let eventoCalendarioId = misionBase.eventoCalendarioId
  if (misionBase.estado === 'programada' && !eventoCalendarioId) {
    try {
      eventoCalendarioId = await crearEvento({
        titulo: `🐻 Bear's Reserve: ${misionBase.titulo}`,
        descripcion: `Destino: ${misionBase.destino} (${km} km · ~${durMin} min). ${misionBase.impactoSocial}`,
        tipo: 'personal',
        fechaInicio: misionBase.fecha,
        allDay: true,
        recurrente: false,
        recordatorios: [{ minutosAntes: 1440 }, { minutosAntes: 60 }],
        relacionado: {
          vehiculoId: misionBase.vehiculosAsignados?.[0]?.id,
        },
      })
    } catch {
      /* si calendario falla, la misión igual se guarda */
    }
  }

  const mision: MisionComunitaria = {
    ...misionBase,
    distanciaKmIdaYVuelta: km,
    duracionMinutos: durMin,
    galonesConsumidosEstimados: Number(galTotal.toFixed(2)),
    costoCombustibleEstimadoCOP: costoTotal,
    desgasteLlantasIncrementoPorc: Number(desgasteMax.toFixed(2)),
    iniciadaEn: esEnCurso ? misionBase.iniciadaEn ?? ahora : undefined,
    finalizaEstimadaEn: esEnCurso
      ? misionBase.finalizaEstimadaEn ?? ahora + durMin * 60_000
      : undefined,
    horaInicio: esEnCurso ? misionBase.horaInicio ?? horaIni : misionBase.horaInicio,
    horaFin: esEnCurso ? misionBase.horaFin ?? horaFinEst : undefined,
    eventoCalendarioId,
  }

  if (mision.eventoRadarId) {
    estado.eventosRadar = estado.eventosRadar.map((ev) =>
      ev.id === mision.eventoRadarId ? { ...ev, despachado: true } : ev
    )
  }

  const idx = estado.misiones.findIndex((m) => m.id === mision.id)
  if (idx >= 0) {
    estado.misiones = estado.misiones.map((m, i) => (i === idx ? mision : m))
  } else {
    estado.misiones = [mision, ...estado.misiones]
  }

  await persistirOperaciones(estado)
  return mision
}

export async function iniciarMisionProgramada(misionId: string): Promise<MisionComunitaria | null> {
  const estado = await hidratarEstadoBears()
  const m = estado.misiones.find((x) => x.id === misionId)
  if (!m || m.estado !== 'programada') return null

  const ahora = Date.now()
  const durMin = Math.max(10, m.duracionMinutos || 60)
  m.estado = 'en_curso'
  m.iniciadaEn = ahora
  m.finalizaEstimadaEn = ahora + durMin * 60_000
  m.horaInicio = new Date(ahora).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
  m.horaFin = new Date(m.finalizaEstimadaEn).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  await persistirOperaciones(estado)
  return m
}

export async function cancelarMisionProgramada(misionId: string): Promise<void> {
  const estado = await hidratarEstadoBears()
  const objetivo = estado.misiones.find((m) => m.id === misionId && m.estado === 'programada')
  if (!objetivo) return

  estado.misiones = estado.misiones.filter(
    (m) => !(m.id === misionId && m.estado === 'programada')
  )

  if (objetivo.eventoCalendarioId) {
    await eliminarEvento(objetivo.eventoCalendarioId).catch((err) => {
      console.warn('No se pudo eliminar el evento asociado en Calendario:', err)
    })
  }

  if (objetivo.eventoRadarId) {
    const hayOtraMisionActiva = estado.misiones.some(
      (m) =>
        m.eventoRadarId === objetivo.eventoRadarId &&
        (m.estado === 'en_curso' || m.estado === 'programada')
    )
    if (!hayOtraMisionActiva) {
      estado.eventosRadar = estado.eventosRadar.map((ev) =>
        ev.id === objetivo.eventoRadarId ? { ...ev, despachado: false } : ev
      )
    }
  }

  await persistirOperaciones(estado)
}

export function listarRutasHabituales(): RutaHabitual[] {
  return [...obtenerCacheSincrono().rutasHabituales]
}

export async function guardarRutaHabitual(ruta: RutaHabitual): Promise<void> {
  const estado = await hidratarEstadoBears()
  const copia = { ...ruta }
  const idx = estado.rutasHabituales.findIndex((r) => r.id === copia.id)
  if (idx >= 0) {
    estado.rutasHabituales = estado.rutasHabituales.map((r, i) => (i === idx ? copia : r))
  } else {
    estado.rutasHabituales = [...estado.rutasHabituales, copia]
  }
  await persistirConfig(estado)
}

// ---------------------------------------------------------------------------
// RADAR EN VIVO CON EXPIRACIÓN AUTOMÁTICA (1–2 DÍAS)
// ---------------------------------------------------------------------------

export function leerEventosRadar(): EventoRadarLocal[] {
  return deduplicarEventosRadar(filtrarEventosRadarVigentes(obtenerCacheSincrono().eventosRadar))
}

export function leerDiagnosticoRadar(): string {
  return obtenerCacheSincrono().ultimoDiagnosticoRadar || ''
}

export async function guardarEventosRadar(eventos: EventoRadarLocal[]): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.eventosRadar = filtrarEventosRadarVigentes(eventos)
  await persistirOperaciones(estado)
}

export async function descartarEventoRadar(eventoId: string): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.eventosRadar = estado.eventosRadar.filter((e) => e.id !== eventoId)
  await persistirOperaciones(estado)
}

export async function agregarEventoRadarManual(evento: EventoRadarLocal): Promise<void> {
  const estado = await hidratarEstadoBears()
  const ahora = Date.now()
  const conVigencia: EventoRadarLocal = {
    ...evento,
    creadoEn: evento.creadoEn ?? ahora,
    expiraEn: evento.expiraEn ?? ahora + 36 * 60 * 60 * 1000,
  }
  estado.eventosRadar = [
    conVigencia,
    ...filtrarEventosRadarVigentes(estado.eventosRadar).filter((e) => e.id !== conVigencia.id),
  ]
  await persistirOperaciones(estado)
}

// Cola para serializar escaneos del radar (evita duplicados si el auto-escaneo y el botón corren al mismo tiempo)
let colaEscaneoRadar: Promise<unknown> = Promise.resolve()

/**
 * Purga eventos expirados (> 1–2 días), deduplica y, si toca refresco periódico (cada 6h) o lo pide el usuario:
 * 1. Busca noticias reales de TODO COLOMBIA (<48h) filtradas por Gemini IA según capacidad real de apoyo de Bear's Reserve.
 * 2. Regenera llamadas comunitarias veredales frescas evitando repetir veredas ni temáticas ya activas.
 */
export function sincronizarRadarAutomatico(forzar = false): Promise<{
  eventos: EventoRadarLocal[]
  noticiasRealesAgregadas: number
  llamadasAgregadas: number
  diagnosticoWeb: string
}> {
  const ejecucion = colaEscaneoRadar.then(
    () => ejecutarSincronizacionRadar(forzar),
    () => ejecutarSincronizacionRadar(forzar)
  )
  colaEscaneoRadar = ejecucion.then(
    () => undefined,
    () => undefined
  )
  return ejecucion
}

async function ejecutarSincronizacionRadar(forzar = false): Promise<{
  eventos: EventoRadarLocal[]
  noticiasRealesAgregadas: number
  llamadasAgregadas: number
  diagnosticoWeb: string
}> {
  const estado = await hidratarEstadoBears()
  const ahora = Date.now()

  const vigentesAntes = deduplicarEventosRadar(
    filtrarEventosRadarVigentes(estado.eventosRadar, ahora)
  )
  const cambioLimpieza = vigentesAntes.length !== estado.eventosRadar.length
  estado.eventosRadar = vigentesAntes

  const debeEscanear =
    forzar ||
    ahora - (estado.ultimoEscaneoRadarEn || 0) >= INTERVALO_ESCANEO_RADAR_MS ||
    vigentesAntes.length === 0

  if (!debeEscanear) {
    if (cambioLimpieza) await persistirOperaciones(estado)
    return {
      eventos: estado.eventosRadar,
      noticiasRealesAgregadas: 0,
      llamadasAgregadas: 0,
      diagnosticoWeb: estado.ultimoDiagnosticoRadar || '',
    }
  }

  // Si el usuario fuerza un escaneo manual, solo reemplazamos noticias web anteriores si la consulta web nueva responde OK
  const llamadasVigentes = estado.eventosRadar.filter((e) => !e.esNoticiaWebReal && !e.despachado)
  const noticiasVigentes = estado.eventosRadar.filter((e) => e.esNoticiaWebReal && !e.despachado)
  const baseSinWebActiva = estado.eventosRadar.filter((e) => !e.esNoticiaWebReal || e.despachado)

  let noticiasReales: EventoRadarLocal[] = []
  let llamadasNuevas: EventoRadarLocal[] = []
  let diagnosticoWeb = estado.ultimoDiagnosticoRadar || ''
  let baseConservar = estado.eventosRadar
  let busquedaWebActiva = false

  // 1. Buscar noticias web reales de TODO Colombia (<48h) curadas por Gemini IA
  if (forzar || noticiasVigentes.length < 2) {
    const resWeb = await buscarNoticiasVialesRealesAI(
      forzar ? baseSinWebActiva : estado.eventosRadar
    )
    diagnosticoWeb = resWeb.diagnostico
    if (resWeb.busquedaWebActiva) {
      busquedaWebActiva = true
      noticiasReales = resWeb.eventos
      if (forzar) baseConservar = baseSinWebActiva
    }
  }

  // 2. Mantener máximo 2 llamadas comunitarias veredales vigentes (evita acumular llamadas IA en cada escaneo o recarga)
  const faltanLlamadas = Math.max(0, 2 - llamadasVigentes.length)
  if (faltanLlamadas > 0) {
    const existentesConWeb = [...baseConservar, ...noticiasReales]
    llamadasNuevas = await generarLlamadasComunitariasIA(existentesConWeb, faltanLlamadas)
    if (llamadasNuevas.length === 0) {
      llamadasNuevas = generarLlamadasComunitariasRespaldo(existentesConWeb, faltanLlamadas, ahora)
    }
  }

  estado.eventosRadar = deduplicarEventosRadar(
    filtrarEventosRadarVigentes([...noticiasReales, ...llamadasNuevas, ...baseConservar], ahora)
  ).slice(0, 12)
  // Solo avanzar la ventana de cooldown si la búsqueda web respondió activamente
  if (busquedaWebActiva) {
    estado.ultimoEscaneoRadarEn = ahora
  }
  estado.ultimoDiagnosticoRadar = diagnosticoWeb

  await persistirOperaciones(estado)
  return {
    eventos: estado.eventosRadar,
    noticiasRealesAgregadas: noticiasReales.length,
    llamadasAgregadas: llamadasNuevas.length,
    diagnosticoWeb,
  }
}

// ---------------------------------------------------------------------------
// PRECIOS DE COMBUSTIBLE EN VIVO + TARJETA MENSUAL CON HISTORIAL
// ---------------------------------------------------------------------------

export function leerTarjetaCombustible(): TarjetaCombustibleReserva {
  const estado = obtenerCacheSincrono()
  return { ...estado.tarjetaCombustible }
}

export function leerHistorialTarjetas(): TarjetaCombustibleReserva[] {
  return [...(obtenerCacheSincrono().historialTarjetas || [])]
}

export function leerPreciosCombustible(): PreciosCombustible {
  return { ...(obtenerCacheSincrono().preciosCombustible || obtenerPreciosCombustibleActuales()) }
}

export async function sincronizarPreciosCombustibleReales(
  forzar = false
): Promise<{ precios: PreciosCombustible; actualizadoDesdeWeb: boolean }> {
  const estado = await hidratarEstadoBears()
  if (!forzar && !esPrecioDesactualizado(estado.preciosCombustible)) {
    establecerPreciosCombustibleCache(estado.preciosCombustible)
    return { precios: estado.preciosCombustible, actualizadoDesdeWeb: false }
  }

  const reales = await consultarPreciosCombustibleRealesAI()
  if (reales) {
    estado.preciosCombustible = reales
    establecerPreciosCombustibleCache(reales)
    await persistirCombustible(estado)
    return { precios: reales, actualizadoDesdeWeb: Boolean(reales.esFuenteReal) }
  }

  establecerPreciosCombustibleCache(estado.preciosCombustible)
  return { precios: estado.preciosCombustible, actualizadoDesdeWeb: false }
}

export async function guardarPreciosCombustibleManuales(valores: {
  corrientePorGalon: number
  dieselPorGalon: number
  extraPorGalon: number
}): Promise<PreciosCombustible> {
  const estado = await hidratarEstadoBears()
  const actual = estado.preciosCombustible || PRECIOS_COMBUSTIBLE_BASE_COLOMBIA
  const sanitizarPrecio = (val: number, fallback: number): number => {
    if (!Number.isFinite(val)) return fallback
    return Math.max(1000, Math.min(100_000, Math.round(val)))
  }

  const ahora = Date.now()
  const nuevos: PreciosCombustible = {
    corrientePorGalon: sanitizarPrecio(
      valores.corrientePorGalon,
      actual.corrientePorGalon || PRECIOS_COMBUSTIBLE_BASE_COLOMBIA.corrientePorGalon
    ),
    dieselPorGalon: sanitizarPrecio(
      valores.dieselPorGalon,
      actual.dieselPorGalon || PRECIOS_COMBUSTIBLE_BASE_COLOMBIA.dieselPorGalon
    ),
    extraPorGalon: sanitizarPrecio(
      valores.extraPorGalon,
      actual.extraPorGalon || PRECIOS_COMBUSTIBLE_BASE_COLOMBIA.extraPorGalon
    ),
    actualizado: `${hoyISO()} · Editado manualmente`,
    fuente: 'Configuración manual del coordinador',
    consultadoEn: ahora,
    esFuenteReal: false,
    editadoManualmente: true,
  }
  estado.preciosCombustible = nuevos
  establecerPreciosCombustibleCache(nuevos)
  await persistirCombustible(estado)
  return nuevos
}

/**
 * Tanqueo de combustible al 100% que se acumula en la Tarjeta mensual de Bear's Reserve.
 * No duplica `totalGalonesConsumidos` (ese contador suma únicamente el consumo en misiones).
 */
export async function tanquearVehiculoCompleto(
  vehiculoId: string,
  motivo: TanqueoRegistro['motivo'] = 'reserva_automatica'
): Promise<{ tanqueo: TanqueoRegistro; tarjeta: TarjetaCombustibleReserva }> {
  if (vehiculosEnTanqueo.has(vehiculoId)) {
    throw new Error('Ya hay un tanqueo en curso para este vehículo. Espera un momento.')
  }
  vehiculosEnTanqueo.add(vehiculoId)
  try {
    const estado = await hidratarEstadoBears()
    migrarMesTarjetaSiCambio(estado)

    const vehiculos = await listarVehiculosBears()
    const v = vehiculos.find((x) => x.id === vehiculoId || x.vehiculoId === vehiculoId)
    if (!v) throw new Error('Vehículo no encontrado')

    const capacidad = v.capacidadTanqueGalones || CAPACIDAD_TANQUE_FALLBACK_GAL
    const nivelActualPorc = Math.max(0, Math.min(100, v.nivelCombustiblePorc ?? 50))
    const galonesFaltantes = Number((capacidad * (1 - nivelActualPorc / 100)).toFixed(2))
    if (galonesFaltantes <= 0.05) {
      throw new Error('El tanque ya está lleno.')
    }

    const precioGalon = obtenerPrecioGalon(v.tipoCombustible)
    const totalCOP = Math.round(galonesFaltantes * precioGalon)
    const hoy = hoyISO()
    const ahoraHora = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const tanqueo: TanqueoRegistro = {
      id: `tq-${Date.now()}-${sufijoAleatorio()}`,
      vehiculoId: v.id,
      vehiculoPlaca: v.placa,
      vehiculoNombre: `${v.marca} ${v.linea}`,
      fecha: hoy,
      hora: ahoraHora,
      galones: galonesFaltantes,
      tipoCombustible: v.tipoCombustible,
      precioPorGalon: precioGalon,
      totalCOP,
      odometroKm: v.kilometrajeActual,
      motivo,
    }

    estado.vehiculosExtra[v.id] = {
      ...(estado.vehiculosExtra[v.id] || {}),
      nivelCombustiblePorc: 100,
      totalCostoCombustibleCOP: (v.totalCostoCombustibleCOP || 0) + totalCOP,
    }

    estado.tarjetaCombustible.saldoAcumuladoCOP += totalCOP
    estado.tarjetaCombustible.totalGalonesMes = Number(
      (estado.tarjetaCombustible.totalGalonesMes + galonesFaltantes).toFixed(2)
    )
    estado.tarjetaCombustible.tanqueos.unshift(tanqueo)
    // Al acumular un nuevo tanqueo vuelve a existir saldo pendiente por liquidar
    estado.tarjetaCombustible.liquidadoEnCashmet =
      saldoPendienteTarjeta(estado.tarjetaCombustible) <= 0

    await Promise.all([persistirConfig(estado), persistirCombustible(estado)])

    return { tanqueo, tarjeta: estado.tarjetaCombustible }
  } finally {
    vehiculosEnTanqueo.delete(vehiculoId)
  }
}

// Lock contra doble clic en liquidación
let liquidacionEnCurso = false

/**
 * Liquida el saldo PENDIENTE de la Tarjeta de Combustible en CashMet (soporta múltiples
 * liquidaciones en el mismo mes si luego vuelven a hacerse tanqueos, o liquidar un mes archivado).
 */
export async function liquidarTarjetaEnCashmet(
  cuentaBancoId: string,
  tarjetaIdObjetivo?: string
): Promise<TarjetaCombustibleReserva> {
  if (liquidacionEnCurso) {
    throw new Error('Ya hay una liquidación en proceso. Espera un momento.')
  }
  liquidacionEnCurso = true
  try {
    const estado = await hidratarEstadoBears()
    migrarMesTarjetaSiCambio(estado)

    const tarjeta =
      tarjetaIdObjetivo && tarjetaIdObjetivo !== estado.tarjetaCombustible.id
        ? estado.historialTarjetas.find((t) => t.id === tarjetaIdObjetivo)
        : estado.tarjetaCombustible

    if (!tarjeta) throw new Error('Tarjeta de combustible no encontrada.')

    const pendiente = saldoPendienteTarjeta(tarjeta)
    if (pendiente <= 0) {
      throw new Error('No hay saldo pendiente por liquidar en esta tarjeta.')
    }

    const prevLiquidaciones = tarjeta.liquidaciones || []
    const galonesYaLiquidados = prevLiquidaciones.reduce(
      (acc, l) => acc + (Number(l.galones) || 0),
      0
    )
    const tanqueosYaLiquidados = prevLiquidaciones.reduce(
      (acc, l) => acc + (Number(l.tanqueosCount) || 0),
      0
    )
    const galonesTramo = Number(
      Math.max(0, (tarjeta.totalGalonesMes || 0) - galonesYaLiquidados).toFixed(2)
    )
    const tanqueosTramo = Math.max(0, (tarjeta.tanqueos?.length || 0) - tanqueosYaLiquidados)

    const hoy = hoyISO()
    const movId = await crearMovimiento({
      fecha: hoy,
      tipo: 'gasto',
      concepto: `Combustible Bear's Reserve (${tarjeta.mes})`,
      descripcion: `Liquidación de combustible flota comunitaria Bear's Reserve (${galonesTramo} gal · ${tanqueosTramo} tanqueo(s) del tramo).`,
      monto: pendiente,
      categoria: 'Transporte',
      cuentaBancoId,
      fuente: 'manual',
    })

    const registro: LiquidacionCombustibleRegistro = {
      id: `liq-${Date.now()}-${sufijoAleatorio()}`,
      fecha: hoy,
      montoCOP: pendiente,
      galones: galonesTramo,
      tanqueosCount: tanqueosTramo,
      cuentaBancoId,
      movimientoId: movId,
    }

    tarjeta.saldoLiquidadoCOP = (tarjeta.saldoLiquidadoCOP || 0) + pendiente
    tarjeta.liquidaciones = [registro, ...prevLiquidaciones]
    tarjeta.liquidadoEnCashmet = saldoPendienteTarjeta(tarjeta) <= 0
    tarjeta.fechaLiquidacion = hoy
    tarjeta.cuentaBancoIdCashmet = cuentaBancoId
    tarjeta.movimientoIdCashmet = movId

    // Modo estricto: si Firestore falla tras crearMovimiento, reportar el error explícitamente
    await persistirCombustible(estado, true)
    return tarjeta
  } finally {
    liquidacionEnCurso = false
  }
}

// ---------------------------------------------------------------------------
// COMPLETAR MISIONES + AUTO-RESOLUCIÓN CON IA AL CUMPLIR TIEMPO ESTIMADO
// ---------------------------------------------------------------------------

/**
 * Completa una misión comunitaria (usado por el motor automático con IA y por rutas habituales):
 * - Si no se fuerza `resultadoManual`, usa Gemini IA (o respaldo realista) para decidir resultado,
 *   factor de distancia real y crónica narrativa humana.
 * - Suma km reales al odómetro en CashMet (tolerante a fallos por vehículo).
 * - Consume combustible respetando `tipoCombustible` real del vehículo (sin doble conteo),
 *   soportando consumos > 1 tanque con auto-tanqueo en ruta.
 * - Si baja a ≤ UMBRAL_RESERVA_COMBUSTIBLE_PORC, auto-tanquea al 100% y lo carga a la Tarjeta.
 */
export async function completarMisionComunitaria(
  misionId: string,
  resultadoManual?: 'exito' | 'parcial' | 'fallida_dificultad'
): Promise<{
  mision: MisionComunitaria
  tanqueosAutomaticos: TanqueoRegistro[]
  cronica: string
}> {
  if (misionesEnCierre.has(misionId)) {
    const estadoEnCurso = await hidratarEstadoBears()
    const mActual = estadoEnCurso.misiones.find((m) => m.id === misionId)
    if (mActual) {
      return {
        mision: mActual,
        tanqueosAutomaticos: [],
        cronica: mActual.cronicaHistoria ?? '',
      }
    }
    throw new Error('La misión ya se encuentra en proceso de cierre.')
  }

  misionesEnCierre.add(misionId)
  try {
    const estado = await hidratarEstadoBears()
    const mision = estado.misiones.find((m) => m.id === misionId)
    if (!mision) throw new Error('Misión no encontrada')

    // Idempotencia estricta
    if (mision.estado === 'completada' || mision.estado === 'inconclusa_repliegue') {
      return {
        mision,
        tanqueosAutomaticos: [],
        cronica: mision.cronicaHistoria ?? '',
      }
    }

    const todosVehiculos = await listarVehiculosBears()
    const vehiculosIds = (mision.vehiculosAsignados || []).map((x) => x.id)
    const vehiculosParticipantes = todosVehiculos.filter(
      (v) => vehiculosIds.includes(v.id) || vehiculosIds.includes(v.vehiculoId)
    )
    const nombresTrip = (mision.tripulantesAsignados || []).map((t) => t.nombre)

    // Evaluar desenlace con Gemini IA (o respaldo determinista realista)
    let resultado: 'exito' | 'parcial' | 'fallida_dificultad' = resultadoManual || 'exito'
    let factorDistanciaReal = 1.0
    let cronica = ''
    let resueltaPorIA = false

    if (!resultadoManual) {
      const resIA = await resolverMisionConIA(mision, vehiculosParticipantes, nombresTrip)
      if (resIA) {
        resultado = resIA.resultado
        factorDistanciaReal = resIA.factorDistanciaReal
        cronica = resIA.cronicaHistoria
        resueltaPorIA = true
      } else {
        const resLocal = evaluarDesenlaceMisionLocal(mision, vehiculosParticipantes, nombresTrip)
        resultado = resLocal.resultado
        factorDistanciaReal = resLocal.factorDistanciaReal
        cronica = resLocal.cronicaHistoria
      }
    } else {
      const resLocal = evaluarDesenlaceMisionLocal(
        mision,
        vehiculosParticipantes,
        nombresTrip,
        resultadoManual
      )
      resultado = resultadoManual
      factorDistanciaReal =
        resultadoManual === 'fallida_dificultad'
          ? 0.65
          : resultadoManual === 'parcial'
            ? 0.92
            : 1.0
      cronica = resLocal.cronicaHistoria
    }

    const kmReales = Math.max(
      0,
      Number((mision.distanciaKmIdaYVuelta * factorDistanciaReal).toFixed(1))
    )
    const tanqueosAuto: TanqueoRegistro[] = []
    let totalGalonesMision = 0
    let totalCostoMision = 0
    let maxDesgaste = 0
    const hoy = hoyISO()
    const ahoraHora = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const registrarAutoTanqueoEnMemoria = (
      v: VehiculoOperativo,
      galRepuestos: number,
      odometroKm: number
    ): number => {
      if (galRepuestos <= 0.05) return 0
      migrarMesTarjetaSiCambio(estado)
      const precioGalon = obtenerPrecioGalon(v.tipoCombustible)
      const totalCOP = Math.round(galRepuestos * precioGalon)
      const tq: TanqueoRegistro = {
        id: `tq-${Date.now()}-${sufijoAleatorio()}`,
        vehiculoId: v.id,
        vehiculoPlaca: v.placa,
        vehiculoNombre: `${v.marca} ${v.linea}`,
        fecha: hoy,
        hora: ahoraHora,
        galones: galRepuestos,
        tipoCombustible: v.tipoCombustible,
        precioPorGalon: precioGalon,
        totalCOP,
        odometroKm,
        motivo: 'reserva_automatica',
      }
      estado.tarjetaCombustible.saldoAcumuladoCOP += totalCOP
      estado.tarjetaCombustible.totalGalonesMes = Number(
        (estado.tarjetaCombustible.totalGalonesMes + galRepuestos).toFixed(2)
      )
      estado.tarjetaCombustible.tanqueos.unshift(tq)
      estado.tarjetaCombustible.liquidadoEnCashmet =
        saldoPendienteTarjeta(estado.tarjetaCombustible) <= 0
      tanqueosAuto.push(tq)
      return totalCOP
    }

    for (const v of vehiculosParticipantes) {
      const { galones: galonesRodamiento, desgasteLlantasPorc } = calcularConsumoMision(
        v.tipo,
        kmReales,
        mision.terreno,
        v.consumoKmPorGalon,
        v.tipoCombustible
      )
      const galonesRalenti = calcularCombustibleRalenti(
        v.tipo,
        mision.minutosRalentiEstimados || 0
      )
      const galones = Number((galonesRodamiento + galonesRalenti).toFixed(2))
      const costoVeh = Math.round(galones * obtenerPrecioGalon(v.tipoCombustible))

      totalGalonesMision += galones
      totalCostoMision += costoVeh
      maxDesgaste = Math.max(maxDesgaste, desgasteLlantasPorc)

      const nuevoKm = Math.round(v.kilometrajeActual + kmReales)
      if (v.vehiculoId && !v.vehiculoId.startsWith('veh-demo')) {
        try {
          const existe = await obtenerVehiculo(v.vehiculoId)
          if (existe) {
            await actualizarKilometraje(v.vehiculoId, nuevoKm)
          }
        } catch (err) {
          console.warn(`No se pudo actualizar odómetro en CashMet para ${v.vehiculoId}:`, err)
        }
      }

      const galonesCapacidad = v.capacidadTanqueGalones || CAPACIDAD_TANQUE_FALLBACK_GAL
      const nivelInicialPorc = Math.max(0, Math.min(100, v.nivelCombustiblePorc ?? 85))
      let galEnTanque = galonesCapacidad * (nivelInicialPorc / 100)
      let restantePorConsumir = galones
      let costoTanqueosVeh = 0
      const galReserva = galonesCapacidad * (UMBRAL_RESERVA_COMBUSTIBLE_PORC / 100)

      // Manejo de consumo > 1 tanque: auto-tanqueo en ruta cuantas veces sea necesario
      let iteraciones = 0
      while (restantePorConsumir > galEnTanque && iteraciones < 20) {
        iteraciones++
        const galDisponiblesTramo =
          galEnTanque > galReserva ? galEnTanque - galReserva : galEnTanque
        if (galDisponiblesTramo > 0) {
          restantePorConsumir = Math.max(0, restantePorConsumir - galDisponiblesTramo)
          galEnTanque = Math.max(0, galEnTanque - galDisponiblesTramo)
        }
        const galRepuestosRuta = Number(Math.max(0, galonesCapacidad - galEnTanque).toFixed(2))
        costoTanqueosVeh += registrarAutoTanqueoEnMemoria(v, galRepuestosRuta, nuevoKm)
        galEnTanque = galonesCapacidad
      }

      const galFinal = Math.max(0, galEnTanque - restantePorConsumir)
      let nuevoNivel = Math.max(1, Math.min(100, Math.round((galFinal / galonesCapacidad) * 100)))

      if (nuevoNivel <= UMBRAL_RESERVA_COMBUSTIBLE_PORC) {
        const galRepuestosFinal = Number((galonesCapacidad * (1 - nuevoNivel / 100)).toFixed(2))
        const copFinal = registrarAutoTanqueoEnMemoria(v, galRepuestosFinal, nuevoKm)
        if (copFinal > 0) {
          costoTanqueosVeh += copFinal
          nuevoNivel = 100
        }
      }

      const nuevoDesgaste = Math.min(
        100,
        Number((v.desgasteLlantasPorc + desgasteLlantasPorc).toFixed(2))
      )

      // Agrupar mutaciones de DOC_CONFIG en memoria (sin escribir por vehículo en cada iteración)
      // Siempre sumamos `galones` una sola vez aquí (sin duplicar con los tanqueos)
      estado.vehiculosExtra[v.id] = {
        ...(estado.vehiculosExtra[v.id] || {}),
        kilometrajeActual: nuevoKm,
        nivelCombustiblePorc: nuevoNivel,
        desgasteLlantasPorc: nuevoDesgaste,
        totalGalonesConsumidos: Number(((v.totalGalonesConsumidos || 0) + galones).toFixed(2)),
        totalCostoCombustibleCOP: (v.totalCostoCombustibleCOP || 0) + costoTanqueosVeh,
      }
    }

    mision.distanciaKmIdaYVuelta = kmReales
    mision.estado = resultado === 'fallida_dificultad' ? 'inconclusa_repliegue' : 'completada'
    mision.resultado = resultado
    mision.cronicaHistoria = cronica
    mision.resueltaPorIA = resueltaPorIA
    mision.galonesConsumidosEstimados = Number(totalGalonesMision.toFixed(2))
    mision.costoCombustibleEstimadoCOP = totalCostoMision
    mision.desgasteLlantasIncrementoPorc = Number(maxDesgaste.toFixed(2))
    mision.horaFin = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const escrituras: Array<Promise<boolean>> = [persistirOperaciones(estado)]
    if (vehiculosParticipantes.length > 0) {
      escrituras.push(persistirConfig(estado))
    }
    if (tanqueosAuto.length > 0) {
      escrituras.push(persistirCombustible(estado))
    }
    await Promise.all(escrituras)

    return {
      mision,
      tanqueosAutomaticos: tanqueosAuto,
      cronica,
    }
  } finally {
    misionesEnCierre.delete(misionId)
  }
}

let colaMisionesAutomaticas: Promise<unknown> = Promise.resolve()

/**
 * Motor autónomo de ciclo de vida de misiones ⏱️🤖:
 * 1. Arranca misiones `'programada'` cuya fecha ya llegó (`fecha <= hoy`).
 * 2. Finaliza automáticamente cualquier misión `'en_curso'` cuyo `finalizaEstimadaEn <= Date.now()`
 *    (o misiones heredadas de días anteriores), evaluando su desenlace y crónica con IA.
 */
export function verificarYCompletarMisionesVencidas(): Promise<{
  misionesFinalizadas: MisionComunitaria[]
  misionesIniciadas: MisionComunitaria[]
  tanqueosAutomaticos: TanqueoRegistro[]
}> {
  const ejecucion = colaMisionesAutomaticas.then(
    () => ejecutarVerificacionMisionesVencidas(),
    () => ejecutarVerificacionMisionesVencidas()
  )
  colaMisionesAutomaticas = ejecucion.then(
    () => undefined,
    () => undefined
  )
  return ejecucion
}

async function ejecutarVerificacionMisionesVencidas(): Promise<{
  misionesFinalizadas: MisionComunitaria[]
  misionesIniciadas: MisionComunitaria[]
  tanqueosAutomaticos: TanqueoRegistro[]
}> {
  const estado = await hidratarEstadoBears()
  const ahora = Date.now()
  const hoy = hoyISO()

  const misionesIniciadas: MisionComunitaria[] = []
  const misionesFinalizadas: MisionComunitaria[] = []
  const tanqueosAutomaticos: TanqueoRegistro[] = []

  // 1. Activar programadas cuya fecha ya llegó
  for (const m of estado.misiones) {
    if (m.estado === 'programada' && m.fecha <= hoy) {
      const iniciada = await iniciarMisionProgramada(m.id)
      if (iniciada) misionesIniciadas.push(iniciada)
    }
  }

  // 2. Auto-finalizar las que ya cumplieron su tiempo estimado (o quedaron de un día anterior)
  const vencidas = estado.misiones.filter((m) => {
    if (m.estado !== 'en_curso') return false
    if (typeof m.finalizaEstimadaEn === 'number' && Number.isFinite(m.finalizaEstimadaEn)) {
      return ahora >= m.finalizaEstimadaEn
    }
    return m.fecha < hoy
  })

  for (const m of vencidas) {
    const res = await completarMisionComunitaria(m.id)
    misionesFinalizadas.push(res.mision)
    tanqueosAutomaticos.push(...res.tanqueosAutomaticos)
  }

  return { misionesFinalizadas, misionesIniciadas, tanqueosAutomaticos }
}

// ---------------------------------------------------------------------------
// RUTAS HABITUALES Y MOTOR AUTOMÁTICO (RESPETA DÍAS, HORAS Y CONDUCTOR REAL)
// ---------------------------------------------------------------------------

export function obtenerConductorRuta(
  rutaId: string,
  fechaISO: string,
  tipoHorario?: RutaHabitual['tipoHorario']
): { id: string; nombre: string } {
  const turnos = obtenerCacheSincrono().turnos || []
  return (
    conductorDeRutaEnCuadrante(turnos, rutaId, fechaISO, tipoHorario) || {
      id: 'coord-user',
      nombre: 'Tú (Coordinador General)',
    }
  )
}

export async function ejecutarRutaHabitual(
  ruta: RutaHabitual,
  idCumplimiento?: string,
  vehiculoIdElegido?: string
): Promise<{ mision: MisionComunitaria }> {
  const vehiculos = await listarVehiculosBears()
  const disponiblesEnBase = vehiculos.filter(
    (v) => v.disponibleParaTrabajo && v.estado === 'disponible'
  )

  const vehiculo =
    disponiblesEnBase.find((v) => v.id === (vehiculoIdElegido || ruta.vehiculoIdDefault)) ||
    (disponiblesEnBase.length > 0
      ? seleccionarVehiculosOptimosMision(
          { titulo: ruta.nombre, tipo: 'ruta_habitual', impactoSocial: ruta.descripcion },
          disponiblesEnBase
        ).vehiculoElegido
      : undefined)

  if (!vehiculo) {
    throw new Error(
      'No hay vehículos habilitados y disponibles en base para ejecutar esta ruta habitual.'
    )
  }

  const hoyStr = hoyISO()
  const conductor = obtenerConductorRuta(ruta.id, hoyStr, ruta.tipoHorario)
  const idCumplimientoFinal = idCumplimiento || construirIdCumplimientoRuta(ruta, hoyStr)

  const misionRuta = await crearMisionOperativa({
    id: `rut-mis-${Date.now()}-${sufijoAleatorio()}`,
    titulo: ruta.nombre,
    tipo: 'ruta_habitual',
    prioridad: 'media',
    origen: ruta.origen,
    destino: ruta.destino,
    departamento: 'Caldas',
    prioridadGeografica: 'local_manizales',
    terreno: 'trocha_moderada',
    distanciaKmIdaYVuelta: ruta.distanciaKm,
    duracionMinutos: ruta.duracionMinutos || 90,
    minutosRodamientoEstimados: ruta.minutosRodamiento || 55,
    minutosRalentiEstimados: ruta.minutosRalenti ?? 35,
    vehiculosAsignados: [
      { id: vehiculo.id, nombre: `${vehiculo.marca} ${vehiculo.linea}`, placa: vehiculo.placa },
    ],
    tripulantesAsignados: [{ id: conductor.id, nombre: conductor.nombre }],
    galonesConsumidosEstimados: 0,
    costoCombustibleEstimadoCOP: 0,
    desgasteLlantasIncrementoPorc: 0,
    fecha: hoyStr,
    estado: 'en_curso',
    impactoSocial: `${ruta.descripcion} · Conductor según cuadrante: ${conductor.nombre}`,
    esNoticiaWebReal: false,
  })

  // Guardar cumplimiento sin mutar el objeto recibido desde el estado React
  await guardarRutaHabitual({
    ...ruta,
    ultimoCumplimientoFecha: idCumplimientoFinal,
  })

  // La ruta habitual se cierra de inmediato generando su crónica y telemetría
  const res = await completarMisionComunitaria(misionRuta.id, 'exito')
  return { mision: res.mision }
}

let colaRutasAutomaticas: Promise<unknown> = Promise.resolve()

export function verificarYCumplirRutasAutomaticas(): Promise<{ rutasEjecutadas: string[] }> {
  const ejecucion = colaRutasAutomaticas.then(
    () => ejecutarVerificacionRutasAutomaticas(),
    () => ejecutarVerificacionRutasAutomaticas()
  )
  colaRutasAutomaticas = ejecucion.then(
    () => undefined,
    () => undefined
  )
  return ejecucion
}

function horaSalidaADecimal(horaSalida?: string, duracionMinutos = 75): number {
  if (!horaSalida || !/^\d{1,2}:\d{2}$/.test(horaSalida)) return 7.25
  const [h, m] = horaSalida.split(':').map(Number)
  return h + (m + duracionMinutos) / 60
}

async function ejecutarVerificacionRutasAutomaticas(): Promise<{
  rutasEjecutadas: string[]
}> {
  const estado = await hidratarEstadoBears()
  const hoy = hoyISO()
  const fechaObj = new Date()
  const diaSemana = fechaObj.getDay() // 0=Dom, 1=Lun, ..., 6=Sab
  const horaActualDecimal = fechaObj.getHours() + fechaObj.getMinutes() / 60

  const ejecutadas: string[] = []

  for (const r of [...estado.rutasHabituales]) {
    if (!r.activa || !r.esAutomatica) continue

    // Se autoejecuta cuando ya pasó la hora de salida + duración estimada (incluyendo cruce de medianoche)
    const horaCorte = horaSalidaADecimal(r.horaSalida, r.duracionMinutos || 75)
    let fechaReferencia = hoy

    if (horaCorte >= 24) {
      const corteDiaSiguiente = horaCorte - 24
      if (horaActualDecimal < corteDiaSiguiente) continue
      const ayerObj = new Date(fechaObj)
      ayerObj.setDate(ayerObj.getDate() - 1)
      if (!r.diasSemana.includes(ayerObj.getDay())) continue
      fechaReferencia = isoLocal(ayerObj)
    } else {
      if (!r.diasSemana.includes(diaSemana)) continue
      if (horaActualDecimal < horaCorte) continue
    }

    const idCumplimiento = construirIdCumplimientoRuta(r, fechaReferencia)
    if (r.ultimoCumplimientoFecha === idCumplimiento) continue

    try {
      await ejecutarRutaHabitual(r, idCumplimiento)
      ejecutadas.push(r.nombre)
    } catch {
      // Si no hay vehículo disponible en base en este instante, reintentará en el siguiente ciclo
    }
  }

  return { rutasEjecutadas: ejecutadas }
}

// ---------------------------------------------------------------------------
// PERSISTENCIA DEL CHAT DE GEMA EN FIRESTORE
// ---------------------------------------------------------------------------

export function leerChatGema(): MensajeGema[] {
  return [...(obtenerCacheSincrono().chatMensajes || [])]
}

export async function guardarChatGema(mensajes: MensajeGema[]): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.chatMensajes = mensajes.slice(-60)
  await persistirChat(estado)
}
