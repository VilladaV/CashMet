import { listarNomina, type Nomina } from '@/lib/firebase/nominaRepo'
import {
  actualizarKilometraje,
  listarVehiculos,
  obtenerVehiculo,
  type Vehiculo,
} from '@/lib/firebase/vehiculosRepo'
import { crearMovimiento } from '@/lib/firebase/movimientosRepo'
import { hoyISO } from '@/lib/fechas'
import { calcularConsumoMision, obtenerPrecioGalon } from './preciosCombustible'
import {
  calcularCombustibleRalenti,
  PARADAS_RUTA_ESCOLAR_MATUTINA,
  PARADAS_RUTA_ESCOLAR_VESPERTINA,
} from './geo'
import {
  conductorDeRutaEnCuadrante,
  EVENTOS_RADAR_PREDETERMINADOS,
  generarCronicaMisionNarrativa,
  investigarFichaVehiculoIA,
  seleccionarVehiculosOptimosMision,
} from './gemaEngine'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  RutaHabitual,
  TanqueoRegistro,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

const CLAVE_STORAGE = 'bears_reserve_data_v2'

interface EstadoPersistenteBears {
  vehiculosExtra: Record<string, Partial<VehiculoOperativo>>
  empleadosExtra: Record<string, Partial<EmpleadoOperativo>>
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
  rutasHabituales: RutaHabitual[]
  eventosRadar: EventoRadarLocal[]
  tarjetaCombustible: TarjetaCombustibleReserva
}

const RUTAS_HABITUALES_INICIALES: RutaHabitual[] = [
  {
    id: 'rut-escolar-manana',
    nombre: 'Ruta Escolar Rural Matutina (Veredas ➔ Colegios)',
    descripcion: 'Salida 06:00 AM desde Base Finca El Guadual. Recorrido por veredas San Peregrino, La Linda y La Cabaña recogiendo 14 niños campesinos (con paradas de espera al ralentí) y dejada en Escuela La Trinidad y colegios urbanos de Manizales.',
    origen: 'Base Finca El Guadual (San Peregrino)',
    destino: 'Escuela La Trinidad & Colegios Manizales',
    distanciaKm: 38.4,
    duracionMinutos: 90,
    minutosRodamiento: 55,
    minutosRalenti: 35, // 8 paradas x 3-4 min esperando niños con morrales
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
    descripcion: 'Salida 15:00 (3:00 PM) desde Base Finca El Guadual. Recogida de niños en colegios de Manizales y Escuela La Trinidad, dejada puerta a puerta en sus casas en veredas La Cabaña, La Linda y San Peregrino, y retorno a Base.',
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
    descripcion: 'Salida sábados 05:30 AM desde Base Finca El Guadual. Auxilio a pequeños productores campesinos de veredas para transportar plátano, café y hortalizas a la Plaza de Mercado de Manizales.',
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
  },
]

const estadoInicial = (): EstadoPersistenteBears => {
  const mesActual = hoyISO().slice(0, 7)
  return {
    vehiculosExtra: {},
    empleadosExtra: {},
    turnos: [],
    misiones: [],
    rutasHabituales: RUTAS_HABITUALES_INICIALES,
    eventosRadar: EVENTOS_RADAR_PREDETERMINADOS,
    tarjetaCombustible: {
      id: `tarjeta-${mesActual}`,
      mes: mesActual,
      saldoAcumuladoCOP: 0,
      totalGalonesMes: 0,
      tanqueos: [],
      liquidadoEnCashmet: false,
    },
  }
}

function leerEstadoLocal(): EstadoPersistenteBears {
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE)
    if (raw) {
      const parsed = JSON.parse(raw) as EstadoPersistenteBears
      const mesActual = hoyISO().slice(0, 7)
      if (parsed.tarjetaCombustible?.mes !== mesActual) {
        parsed.tarjetaCombustible = {
          id: `tarjeta-${mesActual}`,
          mes: mesActual,
          saldoAcumuladoCOP: 0,
          totalGalonesMes: 0,
          tanqueos: [],
          liquidadoEnCashmet: false,
        }
      }
      if (!parsed.rutasHabituales || parsed.rutasHabituales.length === 0) {
        parsed.rutasHabituales = RUTAS_HABITUALES_INICIALES
      }
      if (parsed.eventosRadar && Array.isArray(parsed.eventosRadar)) {
        parsed.eventosRadar = parsed.eventosRadar.filter(
          (e) => e.id !== 'rad-sim-6' && !e.titulo.toLowerCase().includes('standby')
        )
      }
      if (!parsed.eventosRadar || parsed.eventosRadar.length === 0) {
        parsed.eventosRadar = EVENTOS_RADAR_PREDETERMINADOS
      }
      return parsed
    }
  } catch {
    /* fallback */
  }
  return estadoInicial()
}

function guardarEstadoLocal(estado: EstadoPersistenteBears) {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado))
  } catch {
    /* error storage */
  }
}

function obtenerHabilitadoGuardado(vehiculoId: string): boolean | undefined {
  try {
    const raw = localStorage.getItem('bears_reserve_habilitados_map_v1')
    if (raw) {
      const map = JSON.parse(raw) as Record<string, boolean>
      if (typeof map[vehiculoId] === 'boolean') {
        return map[vehiculoId]
      }
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export function obtenerEmpleadoHabilitadoGuardado(empId: string): boolean | undefined {
  try {
    const raw = localStorage.getItem('bears_reserve_empleados_habilitados_map_v1')
    if (raw) {
      const map = JSON.parse(raw) as Record<string, boolean>
      if (typeof map[empId] === 'boolean') {
        return map[empId]
      }
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export function guardarEmpleadoHabilitado(empId: string, habilitado: boolean) {
  try {
    const raw = localStorage.getItem('bears_reserve_empleados_habilitados_map_v1')
    const map: Record<string, boolean> = raw ? JSON.parse(raw) : {}
    map[empId] = habilitado
    localStorage.setItem('bears_reserve_empleados_habilitados_map_v1', JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/**
 * Mapea un empleado de la nómina de CashMet a un EmpleadoOperativo de Bear's Reserve.
 */
function transformarEmpleado(nomina: Nomina, extra?: Partial<EmpleadoOperativo>): EmpleadoOperativo {
  const nombre = nomina.nombreCompleto || 'Colaborador'
  const cargo = nomina.cargo || 'Operador'
  const habilidadesDefault: string[] = []

  const cargoLower = cargo.toLowerCase()
  if (cargoLower.includes('chofer') || cargoLower.includes('conductor')) {
    habilidadesDefault.push('Conducción en alta montaña', 'Navegación de trochas')
  } else if (cargoLower.includes('mecanic') || cargoLower.includes('tecnic')) {
    habilidadesDefault.push('Mecánica de emergencia', 'Manejo de winche y eslingas')
  } else {
    habilidadesDefault.push('Logística comunitaria', 'Primeros auxilios básicos')
  }

  const activo = (() => {
    // Si en CashMet está inactivo, en Bear's Reserve también
    if (nomina.activo === false) return false
    // Si se especificó explícitamente en el extra
    if (typeof extra?.activo === 'boolean') return extra.activo
    // Si está en el mapa persistente de habilitados de Bear's Reserve
    const guardado = obtenerEmpleadoHabilitadoGuardado(nomina.id)
    if (typeof guardado === 'boolean') return guardado
    // Por defecto: excluir cargos netamente de oficina o que nada tienen que ver (ej: Editor)
    if (cargoLower.includes('editor') || cargoLower.includes('audiovisual')) return false
    return true
  })()

  return {
    id: nomina.id,
    nominaId: nomina.id,
    nombreCompleto: nombre,
    cargo,
    habilidades: extra?.habilidades || habilidadesDefault,
    horasSemanalesAsignadas: extra?.horasSemanalesAsignadas || 0,
    maxHorasSemanales: 42,
    activo,
    horariosNoDisponibles: extra?.horariosNoDisponibles || [],
    enTurnoActivo: extra?.enTurnoActivo ?? false,
    turnoActualTexto: extra?.turnoActualTexto,
  }
}

/**
 * Mapea un vehículo de CashMet a VehiculoOperativo de Bear's Reserve (sin categorías rígidas).
 */
function transformarVehiculo(v: Vehiculo, extra?: Partial<VehiculoOperativo>): VehiculoOperativo {
  const tipo = v.tipo || 'carro'
  const esCamion = tipo === 'camion'
  const esMoto = tipo === 'moto'

  const capacidadGalones = esCamion ? 45 : esMoto ? 3.2 : 13
  const tipoCombustible = esCamion ? 'diesel' : 'corriente'
  const consumoBase = esCamion ? 9 : esMoto ? 110 : 32

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
    disponibleParaTrabajo: (() => {
      const disponibleEnCashmet = v.activo !== false && (v.estado === 'Disponible' || !v.estado)
      if (!disponibleEnCashmet) return false

      if (typeof extra?.disponibleParaTrabajo === 'boolean') {
        return extra.disponibleParaTrabajo
      }
      const persistente = obtenerHabilitadoGuardado(v.id)
      if (typeof persistente === 'boolean') {
        return persistente
      }
      return false
    })(),
    investigadoIA: extra?.investigadoIA ?? false,
    fichaInvestigadaNota: extra?.fichaInvestigadaNota,
    estado: extra?.estado || (v.estado === 'En reparación' ? 'mantenimiento' : 'disponible'),
    tipoCombustible: extra?.tipoCombustible || tipoCombustible,
    capacidadTanqueGalones: extra?.capacidadTanqueGalones || capacidadGalones,
    capacidadTanqueLitros:
      extra?.capacidadTanqueLitros || Number(((extra?.capacidadTanqueGalones || capacidadGalones) * 3.78541).toFixed(1)),
    nivelCombustiblePorc: extra?.nivelCombustiblePorc ?? 85,
    consumoKmPorGalon: extra?.consumoKmPorGalon || consumoBase,
    kilometrajeActual: v.mantenimiento?.kilometrajeActual ?? 0,
    desgasteLlantasPorc: extra?.desgasteLlantasPorc ?? 18,
    estadoBateriaPorc: extra?.estadoBateriaPorc ?? 95,
    totalGalonesConsumidos: extra?.totalGalonesConsumidos ?? 0,
    totalCostoCombustibleCOP: extra?.totalCostoCombustibleCOP ?? 0,
  }
}

// -------------------------------------------------------------
// OPERACIONES PÚBLICAS
// -------------------------------------------------------------

export async function listarEmpleadosBears(): Promise<EmpleadoOperativo[]> {
  const nominados = await listarNomina().catch(() => [])
  const estado = leerEstadoLocal()
  if (!nominados.length) {
    return [
      {
        id: 'emp-demo-1',
        nombreCompleto: 'Andrés Morales Gómez',
        cargo: 'Conductor de Rescate Rural',
        habilidades: ['Conducción en barrizal', 'Mecánica de emergencia', 'Winche pesado'],
        horasSemanalesAsignadas: 28,
        maxHorasSemanales: 42,
        activo: true,
        horariosNoDisponibles: [
          { diaSemana: 2, horaInicio: '18:00', horaFin: '22:00', motivo: 'Universidad de Caldas' },
          { diaSemana: 4, horaInicio: '18:00', horaFin: '22:00', motivo: 'Universidad de Caldas' },
        ],
        enTurnoActivo: true,
        turnoActualTexto: 'Guardia Matutina Activa',
      },
      {
        id: 'emp-demo-2',
        nombreCompleto: 'Valentina Osorio Ríos',
        cargo: 'Coordinadora de Enlace Veredal',
        habilidades: ['Primeros auxilios', 'Logística comunitaria', 'Radio comunicaciones'],
        horasSemanalesAsignadas: 35,
        maxHorasSemanales: 42,
        activo: true,
        horariosNoDisponibles: [
          { diaSemana: 6, horaInicio: '08:00', horaFin: '12:00', motivo: 'Formación de posgrado' },
        ],
        enTurnoActivo: true,
        turnoActualTexto: 'Guardia Matutina Activa',
      },
    ]
  }
  return nominados.map((n) => transformarEmpleado(n, estado.empleadosExtra[n.id]))
}

export async function listarVehiculosBears(): Promise<VehiculoOperativo[]> {
  const listaCashmet = await listarVehiculos().catch(() => [])
  const estado = leerEstadoLocal()
  if (!listaCashmet.length) {
    return [
      {
        id: 'veh-demo-1',
        vehiculoId: 'veh-demo-1',
        placa: 'WML421',
        marca: 'Chevrolet',
        linea: 'Kodiak 4x4 Rescate',
        modelo: 2018,
        tipo: 'camion',
        disponibleParaTrabajo: true,
        investigadoIA: true,
        fichaInvestigadaNota: 'Ficha técnica validada con IA: Tanque 55 gal (208.2 L). Rendimiento cordillera: 8.5 km/gal. Diésel/ACPM.',
        estado: 'disponible',
        tipoCombustible: 'diesel',
        capacidadTanqueGalones: 55,
        capacidadTanqueLitros: 208,
        nivelCombustiblePorc: 78,
        consumoKmPorGalon: 8.5,
        kilometrajeActual: 142350,
        desgasteLlantasPorc: 24,
        estadoBateriaPorc: 92,
        totalGalonesConsumidos: 120,
        totalCostoCombustibleCOP: 1254000,
      },
      {
        id: 'veh-demo-2',
        vehiculoId: 'veh-demo-2',
        placa: 'KJR890',
        marca: 'Toyota',
        linea: 'Land Cruiser Troop Carrier',
        modelo: 2021,
        tipo: 'carro',
        disponibleParaTrabajo: true,
        investigadoIA: true,
        fichaInvestigadaNota: 'Ficha técnica validada con IA: Tanque 23.8 gal (90 L). Rendimiento trocha: 24 km/gal. Diésel de alto torque.',
        estado: 'disponible',
        tipoCombustible: 'diesel',
        capacidadTanqueGalones: 23.8,
        capacidadTanqueLitros: 90,
        nivelCombustiblePorc: 68,
        consumoKmPorGalon: 24,
        kilometrajeActual: 89400,
        desgasteLlantasPorc: 22,
        estadoBateriaPorc: 95,
        totalGalonesConsumidos: 84,
        totalCostoCombustibleCOP: 1331400,
      },
    ]
  }
  return listaCashmet.map((v) => transformarVehiculo(v, estado.vehiculosExtra[v.id]))
}

export function guardarExtraVehiculo(id: string, extra: Partial<VehiculoOperativo>) {
  const estado = leerEstadoLocal()
  estado.vehiculosExtra[id] = { ...(estado.vehiculosExtra[id] || {}), ...extra }
  guardarEstadoLocal(estado)

  if (typeof extra.disponibleParaTrabajo === 'boolean') {
    try {
      const raw = localStorage.getItem('bears_reserve_habilitados_map_v1')
      const map = raw ? JSON.parse(raw) : {}
      map[id] = extra.disponibleParaTrabajo
      localStorage.setItem('bears_reserve_habilitados_map_v1', JSON.stringify(map))
    } catch {
      /* ignore */
    }
  }
}

export function guardarExtraEmpleado(id: string, extra: Partial<EmpleadoOperativo>) {
  const estado = leerEstadoLocal()
  estado.empleadosExtra[id] = { ...(estado.empleadosExtra[id] || {}), ...extra }
  guardarEstadoLocal(estado)
  if (typeof extra.activo === 'boolean') {
    guardarEmpleadoHabilitado(id, extra.activo)
  }
}

/**
 * Investigar con IA las fichas técnicas solo de los vehículos que:
 * 1. Están habilitados para Bear's Reserve (`disponibleParaTrabajo === true`)
 * 2. Aún NO han sido investigados (`!investigadoIA`).
 */
export async function investigarVehiculosPendientesIA(): Promise<{
  procesados: number
  nombres: string[]
}> {
  const vehiculos = await listarVehiculosBears()
  const pendientes = vehiculos.filter((v) => v.disponibleParaTrabajo && !v.investigadoIA)

  const procesadosNombres: string[] = []

  for (const v of pendientes) {
    const ficha = investigarFichaVehiculoIA(
      v.marca,
      v.linea,
      v.tipo,
      v.modelo,
      v.notasCashmet,
      v.carroceria,
      v.capacidadTexto
    )
    guardarExtraVehiculo(v.id, {
      investigadoIA: true,
      fichaInvestigadaNota: ficha.fichaInvestigadaNota,
      capacidadTanqueGalones: ficha.capacidadTanqueGalones,
      capacidadTanqueLitros: ficha.capacidadTanqueLitros,
      consumoKmPorGalon: ficha.consumoKmPorGalon,
      tipoCombustible: ficha.tipoCombustible,
    })
    procesadosNombres.push(`${v.marca} ${v.linea}`)
  }

  return {
    procesados: pendientes.length,
    nombres: procesadosNombres,
  }
}

/**
 * Restablece discretamente el desgaste de llantas de un vehículo al 0% (llantas nuevas instaladas).
 */
export function reemplazarLlantasVehiculo(id: string) {
  guardarExtraVehiculo(id, { desgasteLlantasPorc: 0 })
}

export function obtenerRotacionContador(): number {
  try {
    return Number(localStorage.getItem('bears_reserve_rotacion_contador_v1') || 0)
  } catch {
    return 0
  }
}

export function guardarRotacionContador(contador: number): void {
  try {
    localStorage.setItem('bears_reserve_rotacion_contador_v1', String(contador))
  } catch {
    /* ignore */
  }
}

export function listarTurnos(): TurnoSemanal[] {
  return leerEstadoLocal().turnos
}

export function guardarTurnos(turnos: TurnoSemanal[]) {
  const estado = leerEstadoLocal()
  estado.turnos = turnos
  guardarEstadoLocal(estado)
}

export function listarMisiones(): MisionComunitaria[] {
  return leerEstadoLocal().misiones
}

export function guardarMision(mision: MisionComunitaria) {
  const estado = leerEstadoLocal()
  const idx = estado.misiones.findIndex((m) => m.id === mision.id)
  if (idx >= 0) {
    estado.misiones[idx] = mision
  } else {
    estado.misiones.unshift(mision)
  }
  guardarEstadoLocal(estado)
}

export function listarRutasHabituales(): RutaHabitual[] {
  return leerEstadoLocal().rutasHabituales
}

export function guardarRutaHabitual(ruta: RutaHabitual) {
  const estado = leerEstadoLocal()
  const idx = estado.rutasHabituales.findIndex((r) => r.id === ruta.id)
  if (idx >= 0) {
    estado.rutasHabituales[idx] = ruta
  } else {
    estado.rutasHabituales.push(ruta)
  }
  guardarEstadoLocal(estado)
}

export function leerEventosRadar(): EventoRadarLocal[] {
  return leerEstadoLocal().eventosRadar
}

export function guardarEventosRadar(eventos: EventoRadarLocal[]) {
  const estado = leerEstadoLocal()
  estado.eventosRadar = eventos.filter(
    (e) => e.id !== 'rad-sim-6' && !e.titulo.toLowerCase().includes('standby')
  )
  guardarEstadoLocal(estado)
}

export function descartarEventoRadar(eventoId: string) {
  const estado = leerEstadoLocal()
  estado.eventosRadar = estado.eventosRadar.filter((e) => e.id !== eventoId)
  guardarEstadoLocal(estado)
}

export function agregarEventoRadarManual(evento: EventoRadarLocal) {
  const estado = leerEstadoLocal()
  estado.eventosRadar = [evento, ...estado.eventosRadar.filter((e) => e.id !== evento.id)]
  guardarEstadoLocal(estado)
}

export function leerTarjetaCombustible(): TarjetaCombustibleReserva {
  return leerEstadoLocal().tarjetaCombustible
}

/**
 * Tanqueo de combustible al 100% que se acumula en la Tarjeta mensual de Bear's Reserve.
 */
export async function tanquearVehiculoCompleto(
  vehiculoId: string,
  motivo: TanqueoRegistro['motivo'] = 'reserva_automatica'
): Promise<{ tanqueo: TanqueoRegistro; tarjeta: TarjetaCombustibleReserva }> {
  const vehiculos = await listarVehiculosBears()
  const v = vehiculos.find((x) => x.id === vehiculoId || x.vehiculoId === vehiculoId)
  if (!v) throw new Error('Vehículo no encontrado')

  const capacidad = v.capacidadTanqueGalones || 18
  const nivelActualPorc = v.nivelCombustiblePorc ?? 50
  const galonesFaltantes = Number((capacidad * (1 - nivelActualPorc / 100)).toFixed(2))

  const precioGalon = obtenerPrecioGalon(v.tipoCombustible)
  const totalCOP = Math.round(galonesFaltantes * precioGalon)
  const hoy = hoyISO()
  const ahoraHora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  const tanqueo: TanqueoRegistro = {
    id: `tq-${Date.now()}`,
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

  guardarExtraVehiculo(v.id, {
    nivelCombustiblePorc: 100,
    totalGalonesConsumidos: (v.totalGalonesConsumidos || 0) + galonesFaltantes,
    totalCostoCombustibleCOP: (v.totalCostoCombustibleCOP || 0) + totalCOP,
  })

  const estado = leerEstadoLocal()
  estado.tarjetaCombustible.saldoAcumuladoCOP += totalCOP
  estado.tarjetaCombustible.totalGalonesMes = Number(
    (estado.tarjetaCombustible.totalGalonesMes + galonesFaltantes).toFixed(2)
  )
  estado.tarjetaCombustible.tanqueos.unshift(tanqueo)
  guardarEstadoLocal(estado)

  return { tanqueo, tarjeta: estado.tarjetaCombustible }
}

/**
 * Completa una misión comunitaria soportando múltiples vehículos y tripulantes:
 * - Suma los km al odómetro real de CashMet de cada vehículo asignado.
 * - Consume combustible según terreno andino.
 * - Si baja a reserva (15% o menos), auto-tanquea al 100% y lo carga a la Tarjeta.
 * - Incrementa desgaste de llantas de cada vehículo.
 * - Genera la crónica humana en `cronicaHistoria`.
 */
export async function completarMisionComunitaria(
  misionId: string,
  resultado: 'exito' | 'parcial' | 'fallida_dificultad' = 'exito'
): Promise<{
  mision: MisionComunitaria
  tanqueosAutomaticos: TanqueoRegistro[]
  cronica: string
}> {
  const estado = leerEstadoLocal()
  const mision = estado.misiones.find((m) => m.id === misionId)
  if (!mision) throw new Error('Misión no encontrada')

  const todosVehiculos = await listarVehiculosBears()

  // Determinar vehículos asignados
  const vehiculosIds =
    mision.vehiculosAsignados?.length > 0
      ? mision.vehiculosAsignados.map((x) => x.id)
      : []

  const vehiculosParticipantes = todosVehiculos.filter((v) =>
    vehiculosIds.includes(v.id) || vehiculosIds.includes(v.vehiculoId)
  )

  const tanqueosAuto: TanqueoRegistro[] = []
  let totalGalonesConsumidosMision = 0

  for (const v of vehiculosParticipantes) {
    const { galones: galonesRodamiento, desgasteLlantasPorc } = calcularConsumoMision(
      v.tipo,
      mision.distanciaKmIdaYVuelta,
      mision.terreno,
      v.consumoKmPorGalon
    )
    const galonesRalenti = calcularCombustibleRalenti(v.tipo, mision.minutosRalentiEstimados || 0)
    const galones = Number((galonesRodamiento + galonesRalenti).toFixed(2))
    totalGalonesConsumidosMision += galones

    // Actualizar odómetro en CashMet
    const nuevoKm = Math.round(v.kilometrajeActual + mision.distanciaKmIdaYVuelta)
    if (v.vehiculoId && !v.vehiculoId.startsWith('veh-demo')) {
      const existe = await obtenerVehiculo(v.vehiculoId).catch(() => null)
      if (existe) {
        await actualizarKilometraje(v.vehiculoId, nuevoKm)
      }
    }

    // Combustible y llantas
    const galonesCapacidad = v.capacidadTanqueGalones || 20
    const porcConsumido = (galones / galonesCapacidad) * 100
    let nuevoNivel = Math.max(1, Math.round(v.nivelCombustiblePorc - porcConsumido))
    const nuevoDesgaste = Math.min(100, Number((v.desgasteLlantasPorc + desgasteLlantasPorc).toFixed(2)))

    if (nuevoNivel <= 15) {
      guardarExtraVehiculo(v.id, {
        kilometrajeActual: nuevoKm,
        nivelCombustiblePorc: nuevoNivel,
        desgasteLlantasPorc: nuevoDesgaste,
      })
      const resTq = await tanquearVehiculoCompleto(v.id, 'reserva_automatica')
      tanqueosAuto.push(resTq.tanqueo)
      nuevoNivel = 100
    } else {
      guardarExtraVehiculo(v.id, {
        kilometrajeActual: nuevoKm,
        nivelCombustiblePorc: nuevoNivel,
        desgasteLlantasPorc: nuevoDesgaste,
        totalGalonesConsumidos: (v.totalGalonesConsumidos || 0) + galones,
      })
    }
  }

  // Generar crónica humana
  const nombresVehs = vehiculosParticipantes.map((x) => `${x.marca} ${x.linea}`)
  const nombresTrip = (mision.tripulantesAsignados || []).map((t) => t.nombre)
  const cronica = generarCronicaMisionNarrativa(mision, nombresVehs, nombresTrip, resultado)

  mision.estado = 'completada'
  mision.resultado = resultado
  mision.cronicaHistoria = cronica
  mision.galonesConsumidosEstimados = Number(totalGalonesConsumidosMision.toFixed(2))

  guardarMision(mision)

  return {
    mision,
    tanqueosAutomaticos: tanqueosAuto,
    cronica,
  }
}

/**
 * Liquida la Tarjeta de Combustible en CashMet.
 */
export async function liquidarTarjetaEnCashmet(cuentaBancoId: string): Promise<TarjetaCombustibleReserva> {
  const estado = leerEstadoLocal()
  const tarjeta = estado.tarjetaCombustible

  if (tarjeta.saldoAcumuladoCOP <= 0) {
    throw new Error('No hay saldo acumulado para liquidar este mes.')
  }
  if (tarjeta.liquidadoEnCashmet) {
    throw new Error('La tarjeta de combustible ya fue liquidada para este mes.')
  }

  const hoy = hoyISO()
  const movId = await crearMovimiento({
    fecha: hoy,
    tipo: 'gasto',
    concepto: `Combustible Bear's Reserve (${tarjeta.totalGalonesMes} gal · ${tarjeta.mes})`,
    descripcion: `Liquidación mensual de combustible flota comunitaria Bear's Reserve. ${tarjeta.tanqueos.length} tanqueos registrados.`,
    monto: tarjeta.saldoAcumuladoCOP,
    categoria: 'Transporte',
    cuentaBancoId,
    fuente: 'manual',
  })

  tarjeta.liquidadoEnCashmet = true
  tarjeta.fechaLiquidacion = hoy
  tarjeta.cuentaBancoIdCashmet = cuentaBancoId
  tarjeta.movimientoIdCashmet = movId

  guardarEstadoLocal(estado)
  return tarjeta
}

/**
 * Conductor de una ruta de rutina: sale del cuadrante semanal armado por Gema.
 * Si el cuadrante no tiene a nadie para esa ruta ese día, la cubre el coordinador.
 */
export function obtenerConductorRuta(rutaId: string, fechaISO: string): { id: string; nombre: string } {
  const turnos = leerEstadoLocal().turnos || []
  return (
    conductorDeRutaEnCuadrante(turnos, rutaId, fechaISO) || {
      id: 'coord-user',
      nombre: 'Tú (Coordinador General)',
    }
  )
}

/**
 * Ejecuta una ruta habitual (escolar o comunitaria):
 * Calcula km reales, rodamiento y ralentí. El conductor es el del cuadrante semanal;
 * el vehículo es el fijado en la ruta o, si no hay, el que Gema considere más apto.
 */
export async function ejecutarRutaHabitual(
  ruta: RutaHabitual,
  idCumplimiento?: string,
  vehiculoIdElegido?: string
): Promise<{ mision: MisionComunitaria }> {
  const vehiculos = await listarVehiculosBears()

  const vehiculo =
    vehiculos.find((v) => v.id === (vehiculoIdElegido || ruta.vehiculoIdDefault)) ||
    (vehiculos.length > 0
      ? seleccionarVehiculosOptimosMision(
          { titulo: ruta.nombre, tipo: 'ruta_habitual', impactoSocial: ruta.descripcion },
          vehiculos
        ).vehiculoElegido
      : undefined)

  const hoyStr = hoyISO()
  const conductor = obtenerConductorRuta(ruta.id, hoyStr)

  const misionRuta: MisionComunitaria = {
    id: `rut-mis-${Date.now()}`,
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
    desgasteLlantasIncrementoPorc: 0.3,
    fecha: hoyStr,
    estado: 'en_curso',
    impactoSocial: `${ruta.descripcion} · Conductor según cuadrante: ${conductor.nombre}`,
    esNoticiaWebReal: false,
  }

  guardarMision(misionRuta)
  ruta.ultimoCumplimientoFecha = idCumplimiento || hoyStr
  guardarRutaHabitual(ruta)

  const res = await completarMisionComunitaria(misionRuta.id, 'exito')
  return { mision: res.mision }
}

/**
 * Motor Autónomo de Verificación de Rutas Escolares ⏰:
 * Si es día de semana (lunes a viernes) y la hora actual sobrepasa el horario programado,
 * se ejecuta automáticamente la ruta escolar (mañana o tarde) con sus kilómetros y ralentí reales.
 */
export async function verificarYCumplirRutasAutomaticas(): Promise<{
  rutasEjecutadas: string[]
}> {
  const hoy = hoyISO()
  const fechaObj = new Date()
  const diaSemana = fechaObj.getDay() // 0=Dom, 1=Lun, ..., 5=Vie, 6=Sab
  const horaActualDecimal = fechaObj.getHours() + fechaObj.getMinutes() / 60

  const estado = leerEstadoLocal()
  const ejecutadas: string[] = []

  // De lunes a viernes (1 a 5)
  if (diaSemana >= 1 && diaSemana <= 5) {
    for (const r of estado.rutasHabituales) {
      if (!r.activa || !r.esAutomatica) continue

      // Ruta de la mañana: si ya pasaron las 07:15 AM y no se ha ejecutado hoy
      if (r.tipoHorario === 'manana' && horaActualDecimal >= 7.25) {
        const idCumplimiento = `${hoy}-manana`
        if (r.ultimoCumplimientoFecha !== idCumplimiento) {
          await ejecutarRutaHabitual(r, idCumplimiento)
          ejecutadas.push(`${r.nombre} (Automática Mañana)`)
        }
      }

      // Ruta de la tarde: si ya pasaron las 16:45 (4:45 PM) y no se ha ejecutado hoy
      if (r.tipoHorario === 'tarde' && horaActualDecimal >= 16.75) {
        const idCumplimiento = `${hoy}-tarde`
        if (r.ultimoCumplimientoFecha !== idCumplimiento) {
          await ejecutarRutaHabitual(r, idCumplimiento)
          ejecutadas.push(`${r.nombre} (Automática Tarde)`)
        }
      }
    }
  }

  return { rutasEjecutadas: ejecutadas }
}
