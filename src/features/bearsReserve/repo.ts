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
import { crearEvento } from '@/lib/firebase/calendarioRepo'
import { hoyISO } from '@/lib/fechas'
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
const INTERVALO_ESCANEO_RADAR_MS = 6 * 60 * 60 * 1000 // Auto-refrescar radar cada 6 horas

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
 * elimina `undefined` y `NaN`, pero conserva `false`, `0`, `""`, `[]` y `{}`.
 */
function sanitizarFirestore<T>(valor: T): T {
  if (valor === null || valor === undefined) return valor
  if (typeof valor === 'number') {
    return (Number.isFinite(valor) ? valor : 0) as unknown as T
  }
  if (Array.isArray(valor)) {
    return valor
      .filter((item) => item !== undefined)
      .map((item) => sanitizarFirestore(item)) as unknown as T
  }
  if (typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (v === undefined) continue
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
let promesaHidratacion: Promise<EstadoBearsCompleto> | null = null

export function __resetCacheBearsParaTests(): void {
  cacheEstado = null
  promesaHidratacion = null
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
  if (estado.tarjetaCombustible.mes !== mesActual) {
    const anterior = estado.tarjetaCombustible
    if (anterior.saldoAcumuladoCOP > 0 || anterior.tanqueos.length > 0) {
      const yaArchivada = estado.historialTarjetas.some((h) => h.id === anterior.id)
      if (!yaArchivada) {
        estado.historialTarjetas = [anterior, ...estado.historialTarjetas].slice(0, 24)
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

  const rotacionContador = Number(localStorage.getItem('bears_reserve_rotacion_contador_v1') || 0)

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

async function persistirDoc(docId: string, data: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(
      doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, docId),
      sanitizarFirestore({ ...data, actualizado: Date.now() })
    )
  } catch (err) {
    console.warn(`Error persistiendo ${docId} en Firestore:`, err)
  }
}

async function persistirConfig(estado: EstadoBearsCompleto): Promise<void> {
  await persistirDoc(DOC_CONFIG, {
    vehiculosExtra: estado.vehiculosExtra,
    empleadosExtra: estado.empleadosExtra,
    rutasHabituales: estado.rutasHabituales,
    rotacionContador: estado.rotacionContador,
  })
}

async function persistirOperaciones(estado: EstadoBearsCompleto): Promise<void> {
  await persistirDoc(DOC_OPERACIONES, {
    turnos: estado.turnos,
    // Limitamos historial en el doc a las últimas 250 misiones para mantener el documento ligero
    misiones: estado.misiones.slice(0, 250),
    eventosRadar: estado.eventosRadar,
    ultimoEscaneoRadarEn: estado.ultimoEscaneoRadarEn,
    ultimoDiagnosticoRadar: estado.ultimoDiagnosticoRadar,
  })
}

async function persistirCombustible(estado: EstadoBearsCompleto): Promise<void> {
  await persistirDoc(DOC_COMBUSTIBLE, {
    tarjetaCombustible: estado.tarjetaCombustible,
    historialTarjetas: estado.historialTarjetas.slice(0, 24),
    preciosCombustible: estado.preciosCombustible,
  })
}

async function persistirChat(estado: EstadoBearsCompleto): Promise<void> {
  await persistirDoc(DOC_CHAT, {
    chatMensajes: estado.chatMensajes.slice(-60),
  })
}

/**
 * Hidrata el estado completo de Bear's Reserve desde Firestore.
 * Si Firestore aún no tiene documentos, migra automáticamente cualquier estado legacy de localStorage.
 */
export async function hidratarEstadoBears(forzar = false): Promise<EstadoBearsCompleto> {
  if (cacheEstado && !forzar) return cacheEstado
  if (promesaHidratacion && !forzar) return promesaHidratacion

  promesaHidratacion = (async () => {
    const base = estadoInicialVacio()
    let existiaEnFirestore = false

    try {
      const [snapCfg, snapOp, snapComb, snapChat] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, DOC_CONFIG)),
        getDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, DOC_OPERACIONES)),
        getDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, DOC_COMBUSTIBLE)),
        getDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, DOC_CHAT)),
      ])

      if (snapCfg.exists()) {
        existiaEnFirestore = true
        const d = snapCfg.data() as Partial<EstadoBearsCompleto>
        base.vehiculosExtra = d.vehiculosExtra || {}
        base.empleadosExtra = d.empleadosExtra || {}
        base.rutasHabituales = normalizarRutas(d.rutasHabituales)
        base.rotacionContador = Number(d.rotacionContador) || 0
      }

      if (snapOp.exists()) {
        existiaEnFirestore = true
        const d = snapOp.data() as Partial<EstadoBearsCompleto>
        base.turnos = Array.isArray(d.turnos) ? d.turnos : []
        base.misiones = Array.isArray(d.misiones) ? d.misiones : []
        base.eventosRadar = filtrarEventosRadarVigentes(d.eventosRadar || [])
        base.ultimoEscaneoRadarEn = Number(d.ultimoEscaneoRadarEn) || 0
        base.ultimoDiagnosticoRadar = String(d.ultimoDiagnosticoRadar || '')
      }

      if (snapComb.exists()) {
        existiaEnFirestore = true
        const d = snapComb.data() as Partial<EstadoBearsCompleto>
        if (d.tarjetaCombustible) base.tarjetaCombustible = d.tarjetaCombustible
        base.historialTarjetas = Array.isArray(d.historialTarjetas) ? d.historialTarjetas : []
        if (d.preciosCombustible && d.preciosCombustible.corrientePorGalon > 0) {
          base.preciosCombustible = d.preciosCombustible
        }
      }

      if (snapChat.exists()) {
        existiaEnFirestore = true
        const d = snapChat.data() as Partial<EstadoBearsCompleto>
        base.chatMensajes = Array.isArray(d.chatMensajes) ? d.chatMensajes : []
      }
    } catch (err) {
      console.warn('Error leyendo Bear\'s Reserve desde Firestore:', err)
    }

    // Migración o recuperación segura desde localStorage:
    // - Si Firestore estaba vacío, migra todo.
    // - Si Firestore ya existía pero `vehiculosExtra` o `empleadosExtra` quedaron vacíos (ej. migración previa incompleta o primer ingreso desde otro navegador), recupera los registros locales sin pisar lo que ya exista en Firestore.
    const legacy = leerMigracionLegacyLocalStorage()
    if (!existiaEnFirestore) {
      if (legacy) {
        if (legacy.vehiculosExtra) base.vehiculosExtra = legacy.vehiculosExtra
        if (legacy.empleadosExtra) base.empleadosExtra = legacy.empleadosExtra
        if (legacy.rutasHabituales) base.rutasHabituales = normalizarRutas(legacy.rutasHabituales)
        if (typeof legacy.rotacionContador === 'number') base.rotacionContador = legacy.rotacionContador
        if (legacy.turnos) base.turnos = legacy.turnos
        if (legacy.misiones) base.misiones = legacy.misiones
        if (legacy.eventosRadar) base.eventosRadar = legacy.eventosRadar
        if (legacy.tarjetaCombustible) base.tarjetaCombustible = legacy.tarjetaCombustible
      }
      migrarMesTarjetaSiCambio(base)
      await Promise.all([
        persistirConfig(base),
        persistirOperaciones(base),
        persistirCombustible(base),
      ])
    } else {
      let recuperoConfig = false
      if (legacy) {
        if (
          Object.keys(base.vehiculosExtra).length === 0 &&
          legacy.vehiculosExtra &&
          Object.keys(legacy.vehiculosExtra).length > 0
        ) {
          base.vehiculosExtra = legacy.vehiculosExtra
          recuperoConfig = true
        }
        if (
          Object.keys(base.empleadosExtra).length === 0 &&
          legacy.empleadosExtra &&
          Object.keys(legacy.empleadosExtra).length > 0
        ) {
          base.empleadosExtra = legacy.empleadosExtra
          recuperoConfig = true
        }
      }
      const cambioMes = migrarMesTarjetaSiCambio(base)
      if (recuperoConfig) await persistirConfig(base)
      if (cambioMes) await persistirCombustible(base)
    }

    establecerPreciosCombustibleCache(base.preciosCombustible)
    cacheEstado = base
    return base
  })()

  try {
    return await promesaHidratacion
  } finally {
    promesaHidratacion = null
  }
}

function obtenerCacheSincrono(): EstadoBearsCompleto {
  if (!cacheEstado) {
    cacheEstado = estadoInicialVacio()
  }
  return cacheEstado
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
  turnosSemana: TurnoSemanal[]
): EmpleadoOperativo {
  const nombre = nomina.nombreCompleto || 'Colaborador'
  const cargo = nomina.cargo || 'Operador'
  const habilidadesDefault: string[] = []

  const cargoLower = cargo.toLowerCase()
  if (cargoLower.includes('chofer') || cargoLower.includes('conductor')) {
    habilidadesDefault.push('Conducción en alta montaña', 'Navegación de trochas')
  } else if (cargoLower.includes('mecanic') || cargoLower.includes('mecánic') || cargoLower.includes('tecnic')) {
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

  const horasCalculadas = turnosSemana
    .filter((t) => t.empleadoId === nomina.id)
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
        : nivelComb <= 15
          ? 'reserva'
          : 'disponible'

  const kmCashmet = v.mantenimiento?.kilometrajeActual ?? 0
  const kmFinal = esDemo
    ? Math.max(kmCashmet, extra?.kilometrajeActual ?? 0)
    : kmCashmet > 0
      ? kmCashmet
      : extra?.kilometrajeActual ?? 0

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
    capacidadTanqueGalones: extra?.capacidadTanqueGalones ?? fichaFallback.capacidadTanqueGalones,
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
  const [nominados, estado] = await Promise.all([
    listarNomina().catch(() => []),
    hidratarEstadoBears(),
  ])
  const fuente = nominados.length > 0 ? nominados : EMPLEADOS_DEMO
  return fuente.map((n) => transformarEmpleado(n, estado.empleadosExtra[n.id], estado.turnos))
}

export async function listarVehiculosBears(): Promise<VehiculoOperativo[]> {
  const [listaCashmet, estado] = await Promise.all([
    listarVehiculos().catch(() => []),
    hidratarEstadoBears(),
  ])
  const esDemo = listaCashmet.length === 0
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
  const vehiculos = await listarVehiculosBears()
  const pendientes = forzarTodos
    ? vehiculos.filter((v) => v.disponibleParaTrabajo)
    : vehiculos.filter((v) => v.disponibleParaTrabajo && !v.investigadoIA)

  const nombres: string[] = []
  let conGemini = 0
  let conCatalogoLocal = 0

  for (const v of pendientes) {
    const res = await investigarVehiculoIndividualIA(v.id)
    if (res.vehiculo) {
      nombres.push(`${v.marca} ${v.linea}`)
      if (res.usoGemini) conGemini++
      else conCatalogoLocal++
    }
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
  return obtenerCacheSincrono().turnos
}

export async function guardarTurnos(turnos: TurnoSemanal[]): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.turnos = turnos
  await persistirOperaciones(estado)
}

export function listarMisiones(): MisionComunitaria[] {
  return obtenerCacheSincrono().misiones
}

export async function guardarMision(mision: MisionComunitaria): Promise<void> {
  const estado = await hidratarEstadoBears()
  const idx = estado.misiones.findIndex((m) => m.id === mision.id)
  if (idx >= 0) {
    estado.misiones[idx] = mision
  } else {
    estado.misiones.unshift(mision)
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
    const c = calcularConsumoMision(v.tipo, km, misionBase.terreno, v.consumoKmPorGalon, v.tipoCombustible)
    const galRal = calcularCombustibleRalenti(v.tipo, misionBase.minutosRalentiEstimados || 0)
    const galVeh = Number((c.galones + galRal).toFixed(2))
    galTotal += galVeh
    costoTotal += Math.round(galVeh * obtenerPrecioGalon(v.tipoCombustible))
    desgasteMax = Math.max(desgasteMax, c.desgasteLlantasPorc)
  }

  const ahora = Date.now()
  const esEnCurso = misionBase.estado === 'en_curso'
  const horaIni = new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
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
          vehiculoId: misionBase.vehiculosAsignados[0]?.id,
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
    horaInicio: esEnCurso ? misionBase.horaInicio ?? horaIni : undefined,
    horaFin: esEnCurso ? misionBase.horaFin ?? horaFinEst : undefined,
    eventoCalendarioId,
  }

  if (mision.eventoRadarId) {
    estado.eventosRadar = estado.eventosRadar.map((ev) =>
      ev.id === mision.eventoRadarId ? { ...ev, despachado: true } : ev
    )
  }

  const idx = estado.misiones.findIndex((m) => m.id === mision.id)
  if (idx >= 0) estado.misiones[idx] = mision
  else estado.misiones.unshift(mision)

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
  m.horaInicio = new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  m.horaFin = new Date(m.finalizaEstimadaEn).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  await persistirOperaciones(estado)
  return m
}

export async function cancelarMisionProgramada(misionId: string): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.misiones = estado.misiones.filter((m) => !(m.id === misionId && m.estado === 'programada'))
  await persistirOperaciones(estado)
}

export function listarRutasHabituales(): RutaHabitual[] {
  return obtenerCacheSincrono().rutasHabituales
}

export async function guardarRutaHabitual(ruta: RutaHabitual): Promise<void> {
  const estado = await hidratarEstadoBears()
  const copia = { ...ruta }
  const idx = estado.rutasHabituales.findIndex((r) => r.id === copia.id)
  if (idx >= 0) {
    estado.rutasHabituales[idx] = copia
  } else {
    estado.rutasHabituales.push(copia)
  }
  await persistirConfig(estado)
}

// ---------------------------------------------------------------------------
// RADAR EN VIVO CON EXPIRACIÓN AUTOMÁTICA (1–2 DÍAS)
// ---------------------------------------------------------------------------

export function leerEventosRadar(): EventoRadarLocal[] {
  return filtrarEventosRadarVigentes(obtenerCacheSincrono().eventosRadar)
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

/**
 * Purga eventos expirados (> 1–2 días) y, si toca refresco periódico (cada 6h) o lo pide el usuario:
 * 1. Busca noticias viales reales recientes (<48h) con Gemini + Google Search Grounding en 2 pasos.
 * 2. Regenera llamadas comunitarias veredales frescas evitando repetir veredas ni temáticas ya activas.
 */
export async function sincronizarRadarAutomatico(forzar = false): Promise<{
  eventos: EventoRadarLocal[]
  noticiasRealesAgregadas: number
  llamadasAgregadas: number
  diagnosticoWeb: string
}> {
  const estado = await hidratarEstadoBears()
  const ahora = Date.now()

  const vigentesAntes = filtrarEventosRadarVigentes(estado.eventosRadar, ahora)
  const expiradosEliminados = vigentesAntes.length !== estado.eventosRadar.length
  estado.eventosRadar = vigentesAntes

  const debeEscanear =
    forzar ||
    ahora - (estado.ultimoEscaneoRadarEn || 0) >= INTERVALO_ESCANEO_RADAR_MS ||
    vigentesAntes.length === 0

  if (!debeEscanear) {
    if (expiradosEliminados) await persistirOperaciones(estado)
    return {
      eventos: estado.eventosRadar,
      noticiasRealesAgregadas: 0,
      llamadasAgregadas: 0,
      diagnosticoWeb: estado.ultimoDiagnosticoRadar || '',
    }
  }

  const noticiasVigentes = estado.eventosRadar.filter((e) => e.esNoticiaWebReal && !e.despachado)
  const llamadasVigentes = estado.eventosRadar.filter((e) => !e.esNoticiaWebReal && !e.despachado)

  let noticiasReales: EventoRadarLocal[] = []
  let llamadasNuevas: EventoRadarLocal[] = []
  let diagnosticoWeb = estado.ultimoDiagnosticoRadar || ''

  // 1. Buscar noticias web reales (<48h) en 2 pasos con Google Search Grounding
  if (forzar || noticiasVigentes.length < 2) {
    const resWeb = await buscarNoticiasVialesRealesAI(estado.eventosRadar)
    noticiasReales = resWeb.eventos
    diagnosticoWeb = resWeb.diagnostico
  }

  // 2. Regenerar llamadas comunitarias frescas (máx 3 activas al tiempo, sin repetir vereda ni tema)
  const faltanLlamadas = Math.max(0, 3 - llamadasVigentes.length)
  if (faltanLlamadas > 0) {
    const cantNecesaria = forzar ? 1 : Math.min(2, faltanLlamadas)
    const existentesConWeb = [...estado.eventosRadar, ...noticiasReales]
    llamadasNuevas = await generarLlamadasComunitariasIA(existentesConWeb, cantNecesaria)
    if (llamadasNuevas.length === 0) {
      llamadasNuevas = generarLlamadasComunitariasRespaldo(existentesConWeb, cantNecesaria, ahora)
    }
  }

  estado.eventosRadar = filtrarEventosRadarVigentes(
    [...noticiasReales, ...llamadasNuevas, ...estado.eventosRadar],
    ahora
  ).slice(0, 12)
  estado.ultimoEscaneoRadarEn = ahora
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
  return estado.tarjetaCombustible
}

export function leerHistorialTarjetas(): TarjetaCombustibleReserva[] {
  return obtenerCacheSincrono().historialTarjetas || []
}

export function leerPreciosCombustible(): PreciosCombustible {
  return obtenerCacheSincrono().preciosCombustible || obtenerPreciosCombustibleActuales()
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
    return { precios: reales, actualizadoDesdeWeb: true }
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
  const ahora = Date.now()
  const nuevos: PreciosCombustible = {
    corrientePorGalon: Math.max(1000, Math.round(valores.corrientePorGalon)),
    dieselPorGalon: Math.max(1000, Math.round(valores.dieselPorGalon)),
    extraPorGalon: Math.max(1000, Math.round(valores.extraPorGalon)),
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
  const estado = await hidratarEstadoBears()
  migrarMesTarjetaSiCambio(estado)

  const vehiculos = await listarVehiculosBears()
  const v = vehiculos.find((x) => x.id === vehiculoId || x.vehiculoId === vehiculoId)
  if (!v) throw new Error('Vehículo no encontrado')

  const capacidad = v.capacidadTanqueGalones || 18
  const nivelActualPorc = Math.max(0, Math.min(100, v.nivelCombustiblePorc ?? 50))
  const galonesFaltantes = Number((capacidad * (1 - nivelActualPorc / 100)).toFixed(2))
  if (galonesFaltantes <= 0.05) {
    throw new Error('El tanque ya está lleno.')
  }

  const precioGalon = obtenerPrecioGalon(v.tipoCombustible)
  const totalCOP = Math.round(galonesFaltantes * precioGalon)
  const hoy = hoyISO()
  const ahoraHora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  const tanqueo: TanqueoRegistro = {
    id: `tq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
    const tarjeta =
      tarjetaIdObjetivo && tarjetaIdObjetivo !== estado.tarjetaCombustible.id
        ? estado.historialTarjetas.find((t) => t.id === tarjetaIdObjetivo)
        : estado.tarjetaCombustible

    if (!tarjeta) throw new Error('Tarjeta de combustible no encontrada.')

    const pendiente = saldoPendienteTarjeta(tarjeta)
    if (pendiente <= 0) {
      throw new Error('No hay saldo pendiente por liquidar en esta tarjeta.')
    }

    const hoy = hoyISO()
    const movId = await crearMovimiento({
      fecha: hoy,
      tipo: 'gasto',
      concepto: `Combustible Bear's Reserve (${tarjeta.mes})`,
      descripcion: `Liquidación de combustible flota comunitaria Bear's Reserve (${tarjeta.totalGalonesMes} gal mes · ${tarjeta.tanqueos.length} tanqueos).`,
      monto: pendiente,
      categoria: 'Transporte',
      cuentaBancoId,
      fuente: 'manual',
    })

    const registro: LiquidacionCombustibleRegistro = {
      id: `liq-${Date.now()}`,
      fecha: hoy,
      montoCOP: pendiente,
      galones: tarjeta.totalGalonesMes,
      tanqueosCount: tarjeta.tanqueos.length,
      cuentaBancoId,
      movimientoId: movId,
    }

    tarjeta.saldoLiquidadoCOP = (tarjeta.saldoLiquidadoCOP || 0) + pendiente
    tarjeta.liquidaciones = [registro, ...(tarjeta.liquidaciones || [])]
    tarjeta.liquidadoEnCashmet = saldoPendienteTarjeta(tarjeta) <= 0
    tarjeta.fechaLiquidacion = hoy
    tarjeta.cuentaBancoIdCashmet = cuentaBancoId
    tarjeta.movimientoIdCashmet = movId

    await persistirCombustible(estado)
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
 * - Suma km reales al odómetro en CashMet.
 * - Consume combustible respetando `tipoCombustible` real del vehículo (sin doble conteo).
 * - Si baja a ≤15%, auto-tanquea al 100% y lo carga a la Tarjeta.
 */
export async function completarMisionComunitaria(
  misionId: string,
  resultadoManual?: 'exito' | 'parcial' | 'fallida_dificultad'
): Promise<{
  mision: MisionComunitaria
  tanqueosAutomaticos: TanqueoRegistro[]
  cronica: string
}> {
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
    const resLocal = evaluarDesenlaceMisionLocal(mision, vehiculosParticipantes, nombresTrip)
    resultado = resultadoManual
    factorDistanciaReal = resultadoManual === 'fallida_dificultad' ? 0.65 : 1.0
    cronica = resLocal.cronicaHistoria
  }

  const kmReales = Math.max(0, Number((mision.distanciaKmIdaYVuelta * factorDistanciaReal).toFixed(1)))
  const tanqueosAuto: TanqueoRegistro[] = []
  let totalGalonesMision = 0
  let totalCostoMision = 0
  let maxDesgaste = 0

  for (const v of vehiculosParticipantes) {
    const { galones: galonesRodamiento, desgasteLlantasPorc } = calcularConsumoMision(
      v.tipo,
      kmReales,
      mision.terreno,
      v.consumoKmPorGalon,
      v.tipoCombustible
    )
    const galonesRalenti = calcularCombustibleRalenti(v.tipo, mision.minutosRalentiEstimados || 0)
    const galones = Number((galonesRodamiento + galonesRalenti).toFixed(2))
    const costoVeh = Math.round(galones * obtenerPrecioGalon(v.tipoCombustible))

    totalGalonesMision += galones
    totalCostoMision += costoVeh
    maxDesgaste = Math.max(maxDesgaste, desgasteLlantasPorc)

    const nuevoKm = Math.round(v.kilometrajeActual + kmReales)
    if (v.vehiculoId && !v.vehiculoId.startsWith('veh-demo')) {
      const existe = await obtenerVehiculo(v.vehiculoId).catch(() => null)
      if (existe) {
        await actualizarKilometraje(v.vehiculoId, nuevoKm)
      }
    }

    const galonesCapacidad = v.capacidadTanqueGalones || 20
    const porcConsumido = (galones / galonesCapacidad) * 100
    const nuevoNivel = Math.max(1, Math.min(100, Math.round(v.nivelCombustiblePorc - porcConsumido)))
    const nuevoDesgaste = Math.min(
      100,
      Number((v.desgasteLlantasPorc + desgasteLlantasPorc).toFixed(2))
    )

    // Siempre sumamos `galones` una sola vez aquí (sin duplicar en tanquearVehiculoCompleto)
    await guardarExtraVehiculo(v.id, {
      kilometrajeActual: nuevoKm,
      nivelCombustiblePorc: nuevoNivel,
      desgasteLlantasPorc: nuevoDesgaste,
      totalGalonesConsumidos: Number(((v.totalGalonesConsumidos || 0) + galones).toFixed(2)),
    })

    if (nuevoNivel <= 15) {
      const resTq = await tanquearVehiculoCompleto(v.id, 'reserva_automatica')
      tanqueosAuto.push(resTq.tanqueo)
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
  mision.horaFin = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  await persistirOperaciones(estado)

  return {
    mision,
    tanqueosAutomaticos: tanqueosAuto,
    cronica,
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

  const vehiculo =
    vehiculos.find((v) => v.id === (vehiculoIdElegido || ruta.vehiculoIdDefault) && v.disponibleParaTrabajo) ||
    (vehiculos.length > 0
      ? seleccionarVehiculosOptimosMision(
          { titulo: ruta.nombre, tipo: 'ruta_habitual', impactoSocial: ruta.descripcion },
          vehiculos
        ).vehiculoElegido
      : undefined)

  const hoyStr = hoyISO()
  const conductor = obtenerConductorRuta(ruta.id, hoyStr, ruta.tipoHorario)

  const misionRuta = await crearMisionOperativa({
    id: `rut-mis-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
    minutosRalentiEstimados: ruta.minutosRalenti || 35,
    vehiculosAsignados: vehiculo
      ? [{ id: vehiculo.id, nombre: `${vehiculo.marca} ${vehiculo.linea}`, placa: vehiculo.placa }]
      : [],
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
    ultimoCumplimientoFecha: idCumplimiento || hoyStr,
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
    if (!r.diasSemana.includes(diaSemana)) continue

    // Se autoejecuta cuando ya pasó la hora de salida + duración estimada
    const horaCorte = horaSalidaADecimal(r.horaSalida, r.duracionMinutos || 75)
    if (horaActualDecimal < horaCorte) continue

    const sufijo = r.tipoHorario || r.id
    const idCumplimiento = `${hoy}-${sufijo}`
    if (r.ultimoCumplimientoFecha === idCumplimiento) continue

    await ejecutarRutaHabitual(r, idCumplimiento)
    ejecutadas.push(r.nombre)
  }

  return { rutasEjecutadas: ejecutadas }
}

// ---------------------------------------------------------------------------
// PERSISTENCIA DEL CHAT DE GEMA EN FIRESTORE
// ---------------------------------------------------------------------------

export function leerChatGema(): MensajeGema[] {
  return obtenerCacheSincrono().chatMensajes || []
}

export async function guardarChatGema(mensajes: MensajeGema[]): Promise<void> {
  const estado = await hidratarEstadoBears()
  estado.chatMensajes = mensajes.slice(-60)
  await persistirChat(estado)
}
