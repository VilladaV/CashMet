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
import type {
  EmpleadoOperativo,
  MisionComunitaria,
  TanqueoRegistro,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

const CLAVE_STORAGE = 'bears_reserve_data_v1'

interface EstadoPersistenteBears {
  vehiculosExtra: Record<string, Partial<VehiculoOperativo>>
  empleadosExtra: Record<string, Partial<EmpleadoOperativo>>
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
  tarjetaCombustible: TarjetaCombustibleReserva
}

const estadoInicial = (): EstadoPersistenteBears => {
  const mesActual = hoyISO().slice(0, 7)
  return {
    vehiculosExtra: {},
    empleadosExtra: {},
    turnos: [],
    misiones: [],
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
      return parsed
    }
  } catch {
    /* fallback a estado inicial */
  }
  return estadoInicial()
}

function guardarEstadoLocal(estado: EstadoPersistenteBears) {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

/**
 * Mapea un empleado de la nómina de CashMet a un EmpleadoOperativo de Bear's Reserve.
 */
function transformarEmpleado(nomina: Nomina, extra?: Partial<EmpleadoOperativo>): EmpleadoOperativo {
  const nombre = nomina.nombreCompleto || 'Colaborador'
  const cargo = nomina.cargo || 'Operador'
  const habilidadesDefault: EmpleadoOperativo['habilidades'] = []

  if (cargo.toLowerCase().includes('chofer') || cargo.toLowerCase().includes('conductor')) {
    habilidadesDefault.push('conductor_trocha_pesada', 'navegacion_rural')
  } else if (cargo.toLowerCase().includes('mecanic') || cargo.toLowerCase().includes('tecnic')) {
    habilidadesDefault.push('mecanica_emergencia', 'rescate_en_barro')
  } else {
    habilidadesDefault.push('logistica_comunitaria', 'primeros_auxilios')
  }

  return {
    id: nomina.id,
    nominaId: nomina.id,
    nombreCompleto: nombre,
    cargo,
    habilidades: extra?.habilidades || habilidadesDefault,
    horasSemanalesAsignadas: extra?.horasSemanalesAsignadas || 0,
    maxHorasSemanales: 42,
    activo: nomina.activo !== false,
    horariosNoDisponibles: extra?.horariosNoDisponibles || [],
    enTurnoActivo: extra?.enTurnoActivo ?? false,
    turnoActualTexto: extra?.turnoActualTexto,
  }
}

/**
 * Mapea un vehículo de CashMet a VehiculoOperativo de Bear's Reserve.
 */
function transformarVehiculo(v: Vehiculo, extra?: Partial<VehiculoOperativo>): VehiculoOperativo {
  const tipo = v.tipo || 'carro'
  const esCamion = tipo === 'camion'
  const esMoto = tipo === 'moto'

  const rolDefault: VehiculoOperativo['rolOperativo'] = esCamion
    ? 'rescate_pesado'
    : esMoto
      ? 'apoyo_rapido'
      : (v.linea || '').toLowerCase().includes('campero') || (v.claseVehiculo || '').toLowerCase().includes('camioneta')
        ? 'campero_trochero'
        : 'transporte_rural_escolar'

  const capacidadGalones = esCamion ? 55 : esMoto ? 3.5 : 16
  const tipoCombustible = esCamion ? 'diesel' : 'corriente'
  const consumoBase = esCamion ? 8.5 : esMoto ? 110 : 25

  return {
    id: v.id,
    vehiculoId: v.id,
    placa: v.placa,
    marca: v.marca,
    linea: v.linea,
    modelo: v.modelo,
    tipo,
    rolOperativo: extra?.rolOperativo || rolDefault,
    disponibleParaTrabajo: extra?.disponibleParaTrabajo ?? (v.activo !== false && v.estado !== 'Vendido' && v.estado !== 'Dañado'),
    estado: extra?.estado || (v.estado === 'En reparación' ? 'mantenimiento' : 'disponible'),
    tipoCombustible: extra?.tipoCombustible || tipoCombustible,
    capacidadTanqueGalones: extra?.capacidadTanqueGalones || capacidadGalones,
    nivelCombustiblePorc: extra?.nivelCombustiblePorc ?? 85,
    consumoKmPorGalon: extra?.consumoKmPorGalon || consumoBase,
    kilometrajeActual: v.mantenimiento?.kilometrajeActual ?? 0,
    desgasteLlantasPorc: extra?.desgasteLlantasPorc ?? 22,
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
    // Si todavía no hay nóminas en CashMet, creamos 2 empleados base representativos
    return [
      {
        id: 'emp-demo-1',
        nombreCompleto: 'Andrés Morales Gómez',
        cargo: 'Conductor de Rescate Rural',
        habilidades: ['conductor_trocha_pesada', 'mecanica_emergencia', 'rescate_en_barro'],
        horasSemanalesAsignadas: 28,
        maxHorasSemanales: 42,
        activo: true,
        horariosNoDisponibles: [
          { diaSemana: 2, horaInicio: '18:00', horaFin: '22:00', motivo: 'Universidad de Caldas' },
          { diaSemana: 4, horaInicio: '18:00', horaFin: '22:00', motivo: 'Universidad de Caldas' },
        ],
        enTurnoActivo: true,
        turnoActualTexto: 'Turno Mañana · Vía La Cabaña',
      },
      {
        id: 'emp-demo-2',
        nombreCompleto: 'Valentina Osorio Ríos',
        cargo: 'Coordinadora de Ruta Escolar y Primeros Auxilios',
        habilidades: ['primeros_auxilios', 'logistica_comunitaria', 'comunicacion_radio'],
        horasSemanalesAsignadas: 35,
        maxHorasSemanales: 42,
        activo: true,
        horariosNoDisponibles: [
          { diaSemana: 6, horaInicio: '08:00', horaFin: '12:00', motivo: 'Especialización' },
        ],
        enTurnoActivo: true,
        turnoActualTexto: 'Turno Mañana · Vereda El Rosario',
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
        rolOperativo: 'rescate_pesado',
        disponibleParaTrabajo: true,
        estado: 'disponible',
        tipoCombustible: 'diesel',
        capacidadTanqueGalones: 50,
        nivelCombustiblePorc: 72,
        consumoKmPorGalon: 8.5,
        kilometrajeActual: 142350,
        desgasteLlantasPorc: 34,
        estadoBateriaPorc: 90,
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
        rolOperativo: 'transporte_rural_escolar',
        disponibleParaTrabajo: true,
        estado: 'disponible',
        tipoCombustible: 'corriente',
        capacidadTanqueGalones: 22,
        nivelCombustiblePorc: 65,
        consumoKmPorGalon: 22,
        kilometrajeActual: 89400,
        desgasteLlantasPorc: 28,
        estadoBateriaPorc: 94,
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
}

export function guardarExtraEmpleado(id: string, extra: Partial<EmpleadoOperativo>) {
  const estado = leerEstadoLocal()
  estado.empleadosExtra[id] = { ...(estado.empleadosExtra[id] || {}), ...extra }
  guardarEstadoLocal(estado)
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

export function leerTarjetaCombustible(): TarjetaCombustibleReserva {
  return leerEstadoLocal().tarjetaCombustible
}

/**
 * Registra una recarga/tanqueo de combustible al 100% y lo suma a la tarjeta de combustible.
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

  // Actualizar vehículo a 100% de combustible
  guardarExtraVehiculo(v.id, {
    nivelCombustiblePorc: 100,
    totalGalonesConsumidos: (v.totalGalonesConsumidos || 0) + galonesFaltantes,
    totalCostoCombustibleCOP: (v.totalCostoCombustibleCOP || 0) + totalCOP,
  })

  // Acumular en la tarjeta mensual de combustible
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
 * Ejecuta o completa una misión comunitaria:
 * 1. Suma los km al odómetro real del vehículo en CashMet mediante `actualizarKilometraje`.
 * 2. Consume combustible según terreno de montaña.
 * 3. Si el tanque cae entre 15% y 2%, tanquea automáticamente de 0 a 100 y suma a la tarjeta.
 * 4. Incrementa el desgaste de llantas de acuerdo al terreno.
 */
export async function completarMisionComunitaria(misionId: string): Promise<{
  mision: MisionComunitaria
  kmActualizado: number
  tanqueoAutomatico?: TanqueoRegistro
}> {
  const estado = leerEstadoLocal()
  const mision = estado.misiones.find((m) => m.id === misionId)
  if (!mision) throw new Error('Misión no encontrada')

  const vehiculos = await listarVehiculosBears()
  const v = vehiculos.find((x) => x.id === mision.vehiculoId || x.vehiculoId === mision.vehiculoId)
  if (!v) throw new Error('Vehículo asignado no disponible')

  const { galones, desgasteLlantasPorc } = calcularConsumoMision(
    v.tipo,
    mision.distanciaKmIdaYVuelta,
    mision.terreno
  )

  // 1. Actualizar odómetro en CashMet directamente
  const nuevoKm = Math.round(v.kilometrajeActual + mision.distanciaKmIdaYVuelta)
  if (v.vehiculoId && !v.vehiculoId.startsWith('veh-demo')) {
    const existeEnCashmet = await obtenerVehiculo(v.vehiculoId).catch(() => null)
    if (existeEnCashmet) {
      await actualizarKilometraje(v.vehiculoId, nuevoKm)
    }
  }

  // 2. Consumir combustible del tanque
  const galonesCapacidad = v.capacidadTanqueGalones || 20
  const porcConsumido = (galones / galonesCapacidad) * 100
  let nuevoNivelCombustible = Math.max(1, Math.round(v.nivelCombustiblePorc - porcConsumido))

  // 3. Incremento de desgaste de llantas
  const nuevoDesgasteLlantas = Math.min(100, Number((v.desgasteLlantasPorc + desgasteLlantasPorc).toFixed(2)))

  let tanqueoAuto: TanqueoRegistro | undefined

  // 4. Si el tanque cae en zona de reserva (entre 15% y 2%), se activa el tanqueo automático completo
  if (nuevoNivelCombustible <= 15) {
    guardarExtraVehiculo(v.id, {
      kilometrajeActual: nuevoKm,
      nivelCombustiblePorc: nuevoNivelCombustible,
      desgasteLlantasPorc: nuevoDesgasteLlantas,
    })
    const resTanqueo = await tanquearVehiculoCompleto(v.id, 'reserva_automatica')
    tanqueoAuto = resTanqueo.tanqueo
    nuevoNivelCombustible = 100
  } else {
    guardarExtraVehiculo(v.id, {
      kilometrajeActual: nuevoKm,
      nivelCombustiblePorc: nuevoNivelCombustible,
      desgasteLlantasPorc: nuevoDesgasteLlantas,
      totalGalonesConsumidos: (v.totalGalonesConsumidos || 0) + galones,
    })
  }

  // 5. Marcar misión como completada
  mision.estado = 'completada'
  mision.galonesConsumidosEstimados = galones
  mision.desgasteLlantasIncrementoPorc = desgasteLlantasPorc
  guardarMision(mision)

  return { mision, kmActualizado: nuevoKm, tanqueoAutomatico: tanqueoAuto }
}

/**
 * Liquida la Tarjeta de Combustible mensual en CashMet:
 * Crea el movimiento de gasto y descuenta el saldo de la cuenta bancaria de CashMet seleccionada.
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
