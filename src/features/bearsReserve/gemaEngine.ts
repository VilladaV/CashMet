import { hoyISO, isoLocal } from '@/lib/fechas'
import {
  CAPACIDAD_TANQUE_FALLBACK_GAL,
  TTL_LLAMADA_COMUNITARIA_MS,
  UMBRAL_LLANTAS_CRITICO_PORC,
  UMBRAL_RESERVA_COMBUSTIBLE_PORC,
  galonesALitros,
} from './constants'
import { calcularCombustibleRalenti } from './geo'
import { FACTOR_TERRENO_CONSUMO } from './preciosCombustible'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  PreciosCombustible,
  RutaHabitual,
  TerrenoRuta,
  TipoCombustible,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

export interface CapacidadesVehiculo {
  esCamionPesado: boolean
  tiene4x4: boolean
  tienePasajeros: boolean
  esMoto: boolean
  esBusOPasajerosPesado: boolean
}

/**
 * Clasificación táctica unificada de un vehículo (compartida entre flota, tripulación y evaluación).
 */
export function clasificarCapacidadesVehiculo(v: VehiculoOperativo): CapacidadesVehiculo {
  const corpusBase = `${v.marca} ${v.linea} ${v.tipo} ${v.carroceria || ''}`.toLowerCase()
  const corpusV =
    `${corpusBase} ${v.notasCashmet || ''} ${v.fichaInvestigadaNota || ''} ${v.capacidadTexto || ''}`.toLowerCase()

  const esMoto =
    v.tipo === 'moto' ||
    /\bmoto(cicleta)?\b/.test(corpusBase) ||
    (/\bbajaj\b/.test(v.marca.toLowerCase()) && /\bboxer\b/.test(v.linea.toLowerCase()))

  const esBusOPasajerosPesado = /\b(bus|buseta|kavz|coaster)\b/.test(corpusV)

  const esCamionPesado =
    !esMoto &&
    (v.tipo === 'camion' ||
      /\b(quinta rueda|5ta rueda|tractomula|kodiak|volqueta|camion|cami[oó]n|kraz|kamaz|ural|zil|kenworth|freightliner|gazelle|gaz 3302|furg[oó]n)\b/.test(
        corpusV
      ))

  const tiene4x4 =
    !esMoto &&
    /\b(4x4|6x6|4wd|awd|winche|trocha|land cruiser|hilux|prado|fortuner|jeep|willys|patrol|montero|ranger|l200|d-?max|unimog|defender|wrangler|niva|uaz|campero|pickup)\b/.test(
      corpusV
    )

  const tienePasajeros =
    !esMoto &&
    (esBusOPasajerosPesado ||
      /\b(van|pasajero|escolar|troop carrier|suv|camioneta|campero|sed[aá]n|autom[oó]vil|station wagon|monovolumen)\b/.test(
        corpusV
      ) ||
      (v.tipo === 'carro' && !esCamionPesado))

  return {
    esCamionPesado,
    tiene4x4,
    tienePasajeros,
    esMoto,
    esBusOPasajerosPesado,
  }
}

/**
 * Calcula la autonomía real restante en km considerando capacidad real, nivel actual
 * (tratando correctamente 0%), consumo por terreno (`FACTOR_TERRENO_CONSUMO`) y ralentí.
 */
export function calcularAutonomiaRealKm(
  vehiculo: VehiculoOperativo,
  terreno?: TerrenoRuta | string,
  minutosRalenti = 0
): number {
  const capacidad =
    Number.isFinite(vehiculo.capacidadTanqueGalones) && vehiculo.capacidadTanqueGalones > 0
      ? vehiculo.capacidadTanqueGalones
      : CAPACIDAD_TANQUE_FALLBACK_GAL
  const nivelPorc = Math.max(
    0,
    Math.min(100, Number.isFinite(vehiculo.nivelCombustiblePorc) ? vehiculo.nivelCombustiblePorc : 50)
  )
  const galActuales = capacidad * (nivelPorc / 100)
  const galRalenti = calcularCombustibleRalenti(vehiculo.tipo, minutosRalenti)
  const galRodamiento = Math.max(0, galActuales - galRalenti)
  const factorTerreno = FACTOR_TERRENO_CONSUMO[terreno as TerrenoRuta] ?? 1.25
  const consumoBase =
    Number.isFinite(vehiculo.consumoKmPorGalon) && vehiculo.consumoKmPorGalon > 0
      ? vehiculo.consumoKmPorGalon
      : 20
  const rendimientoEfectivo = Math.max(1.5, consumoBase / factorTerreno)
  return Number((galRodamiento * rendimientoEfectivo).toFixed(1))
}

// ---------------------------------------------------------------------------
// TRIPULACIÓN POR ROL 👥 — Gema elige quién va a cada misión
// ---------------------------------------------------------------------------

type RolMision = 'conductor' | 'conductor_pesado' | 'mecanico' | 'winche' | 'auxilios' | 'logistica'

const PALABRAS_ROL: Record<RolMision, string[]> = {
  conductor: ['conduc', 'chofer', 'trocha', 'montaña', 'manejo', 'polivalente'],
  conductor_pesado: [
    'c2',
    'c3',
    'pesado',
    'camion',
    'camión',
    'tractomula',
    'quinta rueda',
    '5ta rueda',
    'volqueta',
  ],
  mecanico: ['mecan', 'mecán', 'tecnic', 'técnic', 'desvar', 'polivalente'],
  winche: ['winche', 'eslinga', 'remolque', 'rescate', 'barrizal', 'grua', 'grúa', 'polivalente'],
  auxilios: ['auxilio', 'primeros', 'paramédic', 'enfermer', 'aph', 'salud'],
  logistica: ['logíst', 'logist', 'carga', 'bodega', 'comunitar', 'radio', 'polivalente'],
}

export function afinidadConductor(emp: EmpleadoOperativo): number {
  const corpus = `${emp.cargo} ${emp.habilidades.join(' ')}`.toLowerCase()
  let score = 0
  if (/conduc|chofer|manejo|trocha|ruta/.test(corpus)) score += 10
  if (/c2|c3|pesado|camion|camión|quinta rueda|5ta rueda/.test(corpus)) score += 5
  if (/polivalente/.test(corpus)) score += 4
  return score
}

export function afinidadMecanico(emp: EmpleadoOperativo): number {
  const corpus = `${emp.cargo} ${emp.habilidades.join(' ')}`.toLowerCase()
  let score = 0
  if (/mecan|mecán|tecnic|técnic|desvar|motor|llantas/.test(corpus)) score += 10
  if (/polivalente/.test(corpus)) score += 4
  return score
}

function afinidadRol(emp: EmpleadoOperativo, rol: RolMision): number {
  const corpus = `${emp.cargo} ${emp.habilidades.join(' ')}`.toLowerCase()
  return PALABRAS_ROL[rol].reduce((acc, p) => (corpus.includes(p) ? acc + 1 : acc), 0)
}

function horaAMinutos(h: string, finMedianoche = false): number {
  const [hh, mm] = String(h || '00:00').split(':').map(Number)
  const mins = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0)
  if (finMedianoche && mins === 0) return 24 * 60
  return mins
}

function restarUnDiaISO(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  dt.setDate(dt.getDate() - 1)
  return isoLocal(dt)
}

/**
 * Empleados que, según el cuadrante, están de guardia en esa fecha y hora exactas.
 * Maneja correctamente los turnos nocturnos que cruzan medianoche (ej. 22:00 a 06:00):
 * entre 00:00 y 05:59 busca a quien inició el turno nocturno el día ANTERIOR.
 */
export function empleadosEnTurnoAhora(
  turnos: TurnoSemanal[],
  empleados: EmpleadoOperativo[],
  fechaISO: string,
  horaHHMM: string
): EmpleadoOperativo[] {
  const min = horaAMinutos(horaHHMM)
  const fechaAyer = restarUnDiaISO(fechaISO)

  const ids = new Set(
    turnos
      .filter((t) => {
        const ini = horaAMinutos(t.horaInicio)
        const fin = horaAMinutos(t.horaFin)
        if (ini <= fin) {
          return t.fecha === fechaISO && ini <= min && min < fin
        }
        // Turno nocturno que cruza medianoche (ej: 22:00 - 06:00)
        if (min >= ini) {
          return t.fecha === fechaISO
        }
        if (min < fin) {
          return t.fecha === fechaAyer
        }
        return false
      })
      .map((t) => t.empleadoId)
  )
  return empleados.filter((e) => e.activo && ids.has(e.id))
}

/**
 * Gema arma la tripulación de una misión según lo que exige la situación:
 * - Siempre 1 conductor por vehículo (si es pesado, prefiere licencia C2/C3).
 * - Excluye personal ya desplegado en otra misión `en_curso`.
 * - Si hay menos personal en turno que vehículos del convoy, amplía el pool con personal activo disponible.
 * - Desvare → mecánico. Barrizal/volcamiento/derrumbe → operador de winche.
 * - Accidente/herido → primeros auxilios. Trasteo/ayudas → apoyo logístico.
 */
export function seleccionarTripulacionMision(
  mision: { titulo: string; tipo: string; impactoSocial?: string },
  vehiculosElegidos: VehiculoOperativo[],
  empleados: EmpleadoOperativo[],
  turnos: TurnoSemanal[],
  fechaISO: string,
  horaHHMM: string,
  misionesActivas?: MisionComunitaria[]
): { tripulacion: Array<{ id: string; nombre: string; rol: string }>; motivo: string } {
  const texto = `${mision.titulo} ${mision.tipo} ${mision.impactoSocial || ''}`.toLowerCase()
  const incluye = (...ps: string[]) => ps.some((p) => texto.includes(p))

  const roles: Array<{ rol: RolMision; etiqueta: string }> = []
  for (const v of vehiculosElegidos) {
    const cap = clasificarCapacidadesVehiculo(v)
    const pesado = cap.esCamionPesado || cap.esBusOPasajerosPesado
    roles.push({
      rol: pesado ? 'conductor_pesado' : 'conductor',
      etiqueta: `Conductor ${v.marca} ${v.linea}`,
    })
  }
  if (roles.length === 0) roles.push({ rol: 'conductor', etiqueta: 'Conductor' })
  if (
    incluye('desvar', 'varad', 'mecán', 'mecan', 'llanta', 'pinch', 'batería', 'bateria') ||
    /\bmotor\b/.test(texto)
  )
    roles.push({ rol: 'mecanico', etiqueta: 'Mecánico' })
  if (
    incluye('barrizal', 'barro', 'atasc', 'atrapad', 'derrumbe', 'remolc', 'winche', 'zanja') ||
    /\bvolcamiento\b|\bvolcad/.test(texto)
  )
    roles.push({ rol: 'winche', etiqueta: 'Operador de winche' })
  if (incluye('herid', 'accidente', 'lesion', 'lesión', 'enferm', 'parto', 'mordedura', 'adulto mayor'))
    roles.push({ rol: 'auxilios', etiqueta: 'Primeros auxilios' })
  if (incluye('trasteo', 'mudanza', 'mercado', 'ayudas', 'víveres', 'viveres', 'carga', 'tejas', 'donaci'))
    roles.push({ rol: 'logistica', etiqueta: 'Apoyo de carga' })

  // Excluir empleados ya desplegados en misiones en_curso
  const idsEnMisionActiva = new Set<string>()
  for (const ma of misionesActivas || []) {
    if (ma.estado !== 'en_curso') continue
    for (const t of ma.tripulantesAsignados || []) {
      if (t.id && t.id !== 'coord-user') idsEnMisionActiva.add(t.id)
    }
  }

  const [y, m, d] = fechaISO.split('-').map(Number)
  const diaSemana = new Date(y, m - 1, d, 12, 0, 0).getDay()
  const diaAyer = (diaSemana + 6) % 7
  const minActual = horaAMinutos(horaHHMM)

  const sinRestriccionHoraria = (e: EmpleadoOperativo): boolean =>
    !(e.horariosNoDisponibles || []).some((h) => {
      const hi = horaAMinutos(h.horaInicio)
      const hf = horaAMinutos(h.horaFin, true)
      if (hi <= hf) {
        return h.diaSemana === diaSemana && hi <= minActual && minActual < hf
      }
      // Restricción nocturna que cruza medianoche (ej. 21:00 - 05:00)
      if (h.diaSemana === diaSemana && minActual >= hi) return true
      if (h.diaSemana === diaAyer && minActual < hf) return true
      return false
    })

  // Pool: guardia activa libre → si no alcanza para todos los vehículos, ampliar con personal activo fuera de turno
  const poolTurno = empleadosEnTurnoAhora(turnos, empleados, fechaISO, horaHHMM).filter(
    (e) => !idsEnMisionActiva.has(e.id)
  )
  const idsPoolTurno = new Set(poolTurno.map((e) => e.id))
  const poolFueraTurno = empleados.filter(
    (e) =>
      e.activo &&
      !idsEnMisionActiva.has(e.id) &&
      !idsPoolTurno.has(e.id) &&
      sinRestriccionHoraria(e)
  )

  const conductoresRequeridos = Math.max(1, vehiculosElegidos.length)
  let pool: EmpleadoOperativo[]
  let fuente: string
  if (poolTurno.length >= conductoresRequeridos) {
    pool = poolTurno
    fuente = 'de guardia según el cuadrante'
  } else if (poolTurno.length > 0 && poolFueraTurno.length > 0) {
    pool = [...poolTurno, ...poolFueraTurno]
    fuente = 'de guardia + respaldo de personal activo disponible'
  } else if (poolTurno.length > 0) {
    pool = poolTurno
    fuente = 'de guardia según el cuadrante'
  } else {
    pool = poolFueraTurno
    fuente = 'disponibles (sin guardia específica en esa hora)'
  }

  const usados = new Set<string>()
  const tripulacion: Array<{ id: string; nombre: string; rol: string }> = []
  const faltantes: string[] = []
  let coordUsado = false

  for (const r of roles) {
    const esRolConductor = r.rol === 'conductor' || r.rol === 'conductor_pesado'
    const candidatos = pool
      .filter((e) => !usados.has(e.id))
      .map((e) => ({
        e,
        score:
          afinidadRol(e, r.rol) * 10 +
          (r.rol === 'conductor_pesado' ? afinidadRol(e, 'conductor') * 3 : 0),
        enTurno: idsPoolTurno.has(e.id) ? 1 : 0,
      }))
      .sort((a, b) => {
        if (b.enTurno !== a.enTurno) return b.enTurno - a.enTurno
        return b.score - a.score
      })

    const elegido =
      candidatos.find((c) => c.score > 0) || (esRolConductor ? candidatos[0] : undefined)

    if (elegido) {
      usados.add(elegido.e.id)
      tripulacion.push({ id: elegido.e.id, nombre: elegido.e.nombreCompleto, rol: r.etiqueta })
    } else if (esRolConductor && !coordUsado) {
      coordUsado = true
      tripulacion.push({
        id: 'coord-user',
        nombre: 'Tú (Coordinador General)',
        rol: `${r.etiqueta} (respaldo)`,
      })
    } else {
      faltantes.push(r.etiqueta)
    }
  }

  let motivo = `Tripulación de ${tripulacion.length}: ${tripulacion.map((t) => `${t.nombre} (${t.rol})`).join(', ')}. Personal ${fuente}.`
  if (faltantes.length > 0) {
    motivo += ` Sin personal libre para: ${faltantes.join(', ')} — requiere ajustar tamaño de convoy o respaldo.`
  }
  return { tripulacion, motivo }
}

/**
 * Para las rutas de rutina: el conductor es el que quedó asignado en el cuadrante semanal.
 * Prioriza coincidencia exacta por `rutaHabitualId` y respalda con el conductor de la franja correspondiente.
 */
export function conductorDeRutaEnCuadrante(
  turnos: TurnoSemanal[],
  rutaId: string,
  fechaISO: string,
  tipoHorario?: RutaHabitual['tipoHorario']
): { id: string; nombre: string } | null {
  const turnosDia = turnos.filter((x) => x.fecha === fechaISO && !x.esRespaldoCoordinador)
  if (!turnosDia.length) return null

  // 1. Coincidencia exacta por rutaHabitualId
  const exacto = turnosDia.find((x) => x.rutaHabitualId === rutaId || x.notas?.includes(rutaId))
  if (exacto) return { id: exacto.empleadoId, nombre: exacto.empleadoNombre }

  // 2. Coincidencia por tipoHorario / nombre de ruta en la franja correspondiente
  const esManana =
    tipoHorario === 'manana' ||
    tipoHorario === 'mercado_sabado' ||
    /manana|matutina|mercado/.test(rutaId)
  const esTarde = tipoHorario === 'tarde' || /tarde|vespertina/.test(rutaId)
  const franjaObjetivo = esTarde ? 'tarde' : esManana ? 'manana' : undefined

  if (franjaObjetivo) {
    const porFranjaConductor = turnosDia.find(
      (x) =>
        x.franja === franjaObjetivo &&
        (x.id.includes('-cond') || x.rolGuardia.toLowerCase().includes('conduc'))
    )
    if (porFranjaConductor) {
      return { id: porFranjaConductor.empleadoId, nombre: porFranjaConductor.empleadoNombre }
    }
    const cualquieraEnFranja = turnosDia.find((x) => x.franja === franjaObjetivo)
    if (cualquieraEnFranja) {
      return { id: cualquieraEnFranja.empleadoId, nombre: cualquieraEnFranja.empleadoNombre }
    }
  }

  // 3. Soporte para rutas con `tipoHorario: 'general'` (o sin franja específica)
  const conductorGeneral = turnosDia.find(
    (x) => x.id.includes('-cond') || x.rolGuardia.toLowerCase().includes('conduc')
  )
  if (conductorGeneral) {
    return { id: conductorGeneral.empleadoId, nombre: conductorGeneral.empleadoNombre }
  }
  return { id: turnosDia[0].empleadoId, nombre: turnosDia[0].empleadoNombre }
}

/**
 * Catálogo técnico offline de respaldo (solo cuando Gemini no está disponible).
 * Usa coincidencias con límites de palabra (\b) y validación de marca para evitar falsos positivos
 * (ej. un BMW M2 o Ford F-250 jamás debe clasificarse como camión Freightliner o KrAZ).
 */
export function investigarFichaVehiculoIA(
  marca: string,
  linea: string,
  tipo: string,
  _modelo?: number | null,
  notas?: string,
  carroceria?: string,
  capacidadTexto?: string
): {
  capacidadTanqueGalones: number
  capacidadTanqueLitros: number
  consumoKmPorGalon: number
  tipoCombustible: TipoCombustible
  fichaInvestigadaNota: string
} {
  const m = (marca || '').toLowerCase().trim()
  const l = (linea || '').toLowerCase().trim()
  const t = (tipo || '').toLowerCase().trim()
  const n = (notas || '').toLowerCase().trim()
  const c = (carroceria || '').toLowerCase().trim()
  const cap = (capacidadTexto || '').toLowerCase().trim()

  const corpus = `${m} ${l} ${t} ${n} ${c} ${cap}`
  const corpusIdentidad = `${t} ${m} ${l} ${c}`

  // 0. Capacidad explícita declarada en notas de CashMet (acepta punto o coma decimal)
  const matchGal = corpus.match(/tanque(?:\s+de)?\s+(\d+(?:[.,]\d+)?)\s*(?:gal|galones)\b/)
  const matchLitros = corpus.match(/tanque(?:\s+de)?\s+(\d+(?:[.,]\d+)?)\s*(?:l|litros|lt)\b/)

  const detectarCombustibleEnNotas = (): TipoCombustible | null => {
    if (/\b(diesel|diésel|acpm)\b/.test(n)) return 'diesel'
    if (/\b((?:gasolina|combustible)\s+extra|extra\s+(?:98|oct|gasolina)|premium|98\s*oct)\b/.test(n)) {
      return 'extra'
    }
    if (/\b(corriente|gasolina)\b/.test(n)) return 'corriente'
    return null
  }
  const combNotas = detectarCombustibleEnNotas()

  const derivarRendimientoPorTipo = (gal: number): number => {
    if (t === 'moto' || /\bmoto(cicleta)?\b/.test(corpusIdentidad)) return gal >= 4.5 ? 65 : 105
    if (t === 'camion' || gal > 50) return gal > 100 ? 6.5 : gal > 50 ? 9.5 : 16
    return gal >= 20 ? 24 : 32
  }

  if (matchGal) {
    const gal = Number(matchGal[1].replace(',', '.'))
    if (Number.isFinite(gal) && gal >= 2 && gal <= 600) {
      const lit = galonesALitros(gal)
      const esDiesel =
        combNotas === 'diesel' ||
        (!combNotas &&
          (t === 'camion' ||
            /\b(diesel|acpm|camion|camión|kraz|kamaz|gaz|kenworth|scania|volvo|isuzu|hino)\b/.test(corpus)))
      const tipoComb: TipoCombustible = combNotas ?? (esDiesel ? 'diesel' : 'corriente')
      return {
        capacidadTanqueGalones: gal,
        capacidadTanqueLitros: lit,
        consumoKmPorGalon: derivarRendimientoPorTipo(gal),
        tipoCombustible: tipoComb,
        fichaInvestigadaNota: `Catálogo técnico (notas CashMet): Tanque ${gal} gal (${lit} L). Combustible: ${tipoComb.toUpperCase()}.`,
      }
    }
  }
  if (matchLitros) {
    const lit = Number(matchLitros[1].replace(',', '.'))
    if (Number.isFinite(lit) && lit >= 8 && lit <= 2200) {
      const gal = Number((lit / 3.78541).toFixed(1))
      const esDiesel =
        combNotas === 'diesel' ||
        (!combNotas &&
          (t === 'camion' ||
            /\b(diesel|acpm|camion|camión|kraz|kamaz|gaz|kenworth|scania|volvo|isuzu|hino)\b/.test(corpus)))
      const tipoComb: TipoCombustible = combNotas ?? (esDiesel ? 'diesel' : 'corriente')
      return {
        capacidadTanqueGalones: gal,
        capacidadTanqueLitros: lit,
        consumoKmPorGalon: derivarRendimientoPorTipo(gal),
        tipoCombustible: tipoComb,
        fichaInvestigadaNota: `Catálogo técnico (notas CashMet): Tanque ${lit} L (${gal} gal). Combustible: ${tipoComb.toUpperCase()}.`,
      }
    }
  }

  // 1. Motocicletas (evalúa \bmoto\b solo en tipo/marca/línea/carrocería, NO en notas; acota Boxer a Bajaj/moto)
  if (
    t === 'moto' ||
    /\bmoto(cicleta)?\b/.test(corpusIdentidad) ||
    ((/\bbajaj\b/.test(m) || t === 'moto') && /\bboxer\b/.test(l)) ||
    /\b(xtz|dr\s*\d+|pulsar|xr\s*\d+|v-?strom|akt|nkd|fz|mt-?0|cb\s*\d+)\b/.test(l)
  ) {
    const esAltoCilindraje = /\b(600|650|700|800|900|1000|1200|1250)\b/.test(corpusIdentidad)
    const gal = esAltoCilindraje ? 4.8 : 3.2
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esAltoCilindraje ? 65 : 110,
      tipoCombustible: combNotas ?? (esAltoCilindraje ? 'extra' : 'corriente'),
      fichaInvestigadaNota: `Catálogo técnico motocicleta: Tanque ${gal} gal (${lit} L). Rendimiento cordillera: ~${esAltoCilindraje ? 65 : 110} km/gal.`,
    }
  }

  // 2. GAZelle (GAZ 3302, 2705, 3221, Sobol)
  if (
    /\b(gazelle|sobol)\b/.test(l) ||
    (/\bgaz\b/.test(m) && (/\b3302\b/.test(l) || corpus.includes('ligero') || corpus.includes('pickup')))
  ) {
    return {
      capacidadTanqueGalones: 18.0,
      capacidadTanqueLitros: 68.1,
      consumoKmPorGalon: 31,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico GAZ 3302 GAZelle: Tanque 18 gal (68.1 L). Rendimiento cordillera: ~31 km/gal. Diésel/ACPM.`,
    }
  }

  // 3. KAVZ (KAVZ 685, 3976, Overlander)
  if (/\bkavz\b/.test(`${m} ${l}`) || (corpus.includes('overlander') && corpus.includes('autobús'))) {
    return {
      capacidadTanqueGalones: 27.7,
      capacidadTanqueLitros: 105.0,
      consumoKmPorGalon: 19,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico KAVZ 685 Overlander: Tanque 27.7 gal (105 L). Rendimiento rural: ~19 km/gal. Diésel/ACPM.`,
    }
  }

  // 4. KrAZ pesados
  if (/\bkraz\b/.test(`${m} ${l}`) || (corpus.includes('soviético') && corpus.includes('6x6'))) {
    return {
      capacidadTanqueGalones: 87.2,
      capacidadTanqueLitros: 330.0,
      consumoKmPorGalon: 8.2,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico KrAZ pesado: Tanques dobles 330 L (87.2 gal). Rendimiento: ~8.2 km/gal. Diésel.`,
    }
  }

  // 5. GAZ camiones medianos
  if (/\bgaz\b/.test(m) || /\bgaz[\s-]*(53|66|3307|3308|3309)\b|\bsadko\b/.test(l)) {
    const es66 = /\b66\b|\bsadko\b/.test(l)
    const gal = es66 ? 55.5 : 27.7
    const lit = es66 ? 210.0 : 105.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: es66 ? 14 : 17,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico GAZ camión todo terreno: Tanque ${gal} gal (${lit} L). Rendimiento trocha: ~${es66 ? 14 : 17} km/gal. Diésel.`,
    }
  }

  // 6. Ural pesados
  if (/\bural\b/.test(`${m} ${l}`) || (t === 'camion' && /\b4320\b/.test(l))) {
    return {
      capacidadTanqueGalones: 68.7,
      capacidadTanqueLitros: 260.0,
      consumoKmPorGalon: 10.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Ural 4320 6x6: Tanque 260 L (68.7 gal). Rendimiento trocha: ~10.5 km/gal. Diésel.`,
    }
  }

  // 7. KamAZ pesados
  if (/\bkamaz\b/.test(`${m} ${l}`)) {
    const esLargoO6x6 = /\b(43118|6520)\b/.test(l) || corpus.includes('6x6')
    const gal = esLargoO6x6 ? 92.5 : 66.0
    const lit = esLargoO6x6 ? 350.0 : 250.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 11.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico KamAZ Diésel: Tanque ${lit} L (${gal} gal). Rendimiento cordillera: ~11.5 km/gal.`,
    }
  }

  // 8. ZIL camiones (requiere marca ZIL explícita)
  if (/\bzil\b/.test(`${m} ${l}`)) {
    const es131 = /\b131\b/.test(l) || corpus.includes('6x6')
    const gal = es131 ? 89.8 : 44.9
    const lit = es131 ? 340.0 : 170.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: es131 ? 11 : 14,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico ZIL: Tanque ${lit} L (${gal} gal). Rendimiento montaña: ~${es131 ? 11 : 14} km/gal.`,
    }
  }

  // 9. MAZ camiones pesados
  if (/\bmaz\b/.test(`${m} ${l}`)) {
    return {
      capacidadTanqueGalones: 92.5,
      capacidadTanqueLitros: 350.0,
      consumoKmPorGalon: 9.8,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico MAZ: Tanque 350 L (92.5 gal). Rendimiento montaña: ~9.8 km/gal. Diésel.`,
    }
  }

  // 10. UAZ camperos y furgones
  if (/\buaz\b/.test(`${m} ${l}`) || /\bbukhanka\b/.test(l)) {
    return {
      capacidadTanqueGalones: 20.6,
      capacidadTanqueLitros: 78.0,
      consumoKmPorGalon: 26,
      tipoCombustible: combNotas ?? 'corriente',
      fichaInvestigadaNota: `Catálogo técnico UAZ 4x4: Tanques duales 78 L (20.6 gal). Rendimiento trocha: ~26 km/gal. Gasolina Corriente.`,
    }
  }

  // 11. Kenworth pesados
  if (/\bkenworth\b/.test(`${m} ${l}`) || /\b(t800|twinsteer|w900|t680)\b/.test(l)) {
    const esTwinSteer = /\btwinsteer\b/.test(l) || corpus.includes('10x10') || corpus.includes('8x4')
    const gal = esTwinSteer ? 200 : 240
    const lit = Number((gal * 3.78541).toFixed(1))
    const kmGal = esTwinSteer ? 5.8 : 6.2
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: kmGal,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Kenworth: Tanques duales ${gal} gal (${lit} L). Rendimiento cordillera: ~${kmGal} km/gal. Diésel/ACPM.`,
    }
  }

  // 12. MAN camiones europeos (palabra exacta \bman\b en marca o línea TGS/TGX/TGM/TGL)
  if (/\bman\b/.test(m) || (t === 'camion' && /\b(tgs|tgx|tgm|tgl)\b/.test(l))) {
    return {
      capacidadTanqueGalones: 105.7,
      capacidadTanqueLitros: 400.0,
      consumoKmPorGalon: 12.2,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico MAN camión: Tanque 400 L (105.7 gal). Rendimiento andino: ~12.2 km/gal. Diésel.`,
    }
  }

  // 13. Scania
  if (/\bscania\b/.test(`${m} ${l}`)) {
    const esCabezote = corpus.includes('cabezote') || corpus.includes('tractomula') || corpus.includes('quinta rueda')
    const gal = esCabezote ? 118.9 : 92.5
    const lit = esCabezote ? 450.0 : 350.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 11.8,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Scania: Tanque ${lit} L (${gal} gal). Rendimiento montaña: ~11.8 km/gal. Diésel.`,
    }
  }

  // 14. Volvo camiones (solo si es camión o modelos FH/FMX/VM con marca Volvo)
  if (/\bvolvo\b/.test(m) && (t === 'camion' || /\b(fh|fmx|vm|fm\d*)\b/.test(l))) {
    const esFmxOVolqueta = /\bfmx\b/.test(l) || corpus.includes('volqueta')
    const esVm = /\bvm\b/.test(l)
    const gal = esVm ? 72.6 : esFmxOVolqueta ? 109.6 : 118.9
    const lit = esVm ? 275.0 : esFmxOVolqueta ? 415.0 : 450.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 11.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Volvo camión: Tanque ${lit} L (${gal} gal). Rendimiento cordillera: ~11.5 km/gal. Diésel.`,
    }
  }

  // 15. Mercedes-Benz camiones / Unimog (no afecta autos Mercedes clase C/E/A)
  if (
    /\bunimog\b/.test(l) ||
    (/\bmercedes\b/.test(m) && (t === 'camion' || /\b(actros|axor|atego|arocs|1113|1620)\b/.test(l)))
  ) {
    if (/\bunimog\b/.test(l)) {
      return {
        capacidadTanqueGalones: 42.3,
        capacidadTanqueLitros: 160.0,
        consumoKmPorGalon: 16,
        tipoCombustible: combNotas ?? 'diesel',
        fichaInvestigadaNota: `Catálogo técnico Mercedes-Benz Unimog 4x4: Tanque 160 L (42.3 gal). Rendimiento trocha: ~16 km/gal. Diésel.`,
      }
    }
    const esPesado = /\b(actros|arocs|axor)\b/.test(l)
    const gal = esPesado ? 118.9 : 55.5
    const lit = esPesado ? 450.0 : 210.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esPesado ? 11.5 : 17.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Mercedes-Benz camión: Tanque ${lit} L (${gal} gal). Rendimiento: ~${esPesado ? 11.5 : 17.5} km/gal. Diésel.`,
    }
  }

  // 16. Freightliner (solo si marca Freightliner o camión Cascadia/Columbia/M2)
  if (
    /\bfreightliner\b/.test(`${m} ${l}`) ||
    (t === 'camion' && /\b(cascadia|columbia|m2)\b/.test(l))
  ) {
    const esM2 = /\bm2\b/.test(l)
    const gal = esM2 ? 65 : 200
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esM2 ? 14 : 6.2,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Freightliner ${esM2 ? 'M2' : 'Cascadia/Columbia'}: Tanque ${gal} gal (${lit} L). Diésel.`,
    }
  }

  // 17. International camiones
  if (
    /\binternational\b/.test(m) ||
    (t === 'camion' && /\b(workstar|prostar|durastar|7600|4300|9400)\b/.test(l))
  ) {
    const esDuraStar = /\b(4300|durastar)\b/.test(l)
    const esWorkStar = /\b(7600|workstar)\b/.test(l)
    const gal = esDuraStar ? 50 : esWorkStar ? 80 : 200
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esDuraStar ? 16 : esWorkStar ? 8.5 : 6.2,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico International: Tanque ${gal} gal (${lit} L). Diésel.`,
    }
  }

  // 18. Mack camiones
  if (/\bmack\b/.test(m)) {
    const esGranite = /\bgranite\b/.test(l) || corpus.includes('volqueta')
    const gal = esGranite ? 88 : 200
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esGranite ? 8.5 : 6.2,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Mack: Tanque ${gal} gal (${lit} L). Diésel.`,
    }
  }

  // 19. Camiones Isuzu / Chevrolet comerciales
  if (/\bkodiak\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 50.0,
      capacidadTanqueLitros: 189.3,
      consumoKmPorGalon: 8.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet Kodiak: Tanque 50 gal (189.3 L). Rendimiento cordillera: ~8.5 km/gal. Diésel.`,
    }
  }
  if (/\bbrigadier\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 65.0,
      capacidadTanqueLitros: 246.1,
      consumoKmPorGalon: 7.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet Brigadier: Tanque 65 gal (246.1 L). Diésel.`,
    }
  }
  if (/\bnhr\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 19.8,
      capacidadTanqueLitros: 75.0,
      consumoKmPorGalon: 34,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet NHR: Tanque 75 L (19.8 gal). Rendimiento: ~34 km/gal. Diésel.`,
    }
  }
  if (/\b(npr|nkr)\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 26.4,
      capacidadTanqueLitros: 100.0,
      consumoKmPorGalon: 24,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet NPR / NKR: Tanque 100 L (26.4 gal). Rendimiento: ~24 km/gal. Diésel.`,
    }
  }
  if (/\bnqr\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 37.0,
      capacidadTanqueLitros: 140.0,
      consumoKmPorGalon: 20,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet NQR: Tanque 140 L (37.0 gal). Rendimiento: ~20 km/gal. Diésel.`,
    }
  }
  if (/\bftr\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 52.8,
      capacidadTanqueLitros: 200.0,
      consumoKmPorGalon: 14,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet FTR: Tanque 200 L (52.8 gal). Rendimiento: ~14 km/gal. Diésel.`,
    }
  }
  if (/\b(fvr|fvz)\b/.test(corpus)) {
    return {
      capacidadTanqueGalones: 79.2,
      capacidadTanqueLitros: 300.0,
      consumoKmPorGalon: 9.5,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet FVR / FVZ: Tanque 300 L (79.2 gal). Diésel.`,
    }
  }

  // 20. Hino / Fuso / Foton / JAC camiones
  if (/\bhino\b/.test(m) || /\bdutro\b/.test(l)) {
    const es500 = /\b(500|fc9j|fg8j)\b/.test(l)
    return {
      capacidadTanqueGalones: es500 ? 52.8 : 26.4,
      capacidadTanqueLitros: es500 ? 200.0 : 100.0,
      consumoKmPorGalon: es500 ? 14 : 24,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Hino ${es500 ? '500' : '300/Dutro'}: Tanque ${es500 ? '200 L (52.8 gal)' : '100 L (26.4 gal)'}. Diésel.`,
    }
  }
  if (/\bfuso\b/.test(m) || /\bcanter\b/.test(l)) {
    return {
      capacidadTanqueGalones: 26.4,
      capacidadTanqueLitros: 100.0,
      consumoKmPorGalon: 25,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Mitsubishi Fuso Canter: Tanque 100 L (26.4 gal). Diésel.`,
    }
  }
  if (/\b(foton|jac)\b/.test(m) && t === 'camion') {
    const esPesado = corpus.includes('volqueta') || corpus.includes('6x4') || /\b(auman|gallop)\b/.test(l)
    const gal = esPesado ? 79.2 : 26.4
    const lit = esPesado ? 300.0 : 100.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esPesado ? 9.5 : 24,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico camión ${m.toUpperCase()}: Tanque ${lit} L (${gal} gal). Diésel.`,
    }
  }

  // 21. Toyota
  if (/\btoyota\b/.test(m) || /\b(land cruiser|hilux|prado|fortuner|troop carrier|coaster)\b/.test(l)) {
    if (/\btroop\b|\btropero\b/.test(corpus)) {
      return {
        capacidadTanqueGalones: 47.5,
        capacidadTanqueLitros: 180.0,
        consumoKmPorGalon: 23,
        tipoCombustible: combNotas ?? 'diesel',
        fichaInvestigadaNota: `Catálogo técnico Toyota Land Cruiser Troop Carrier: Tanques duales 180 L (47.5 gal). Diésel.`,
      }
    }
    if (/\bcoaster\b/.test(l)) {
      return {
        capacidadTanqueGalones: 25.1,
        capacidadTanqueLitros: 95.0,
        consumoKmPorGalon: 21,
        tipoCombustible: combNotas ?? 'diesel',
        fichaInvestigadaNota: `Catálogo técnico Toyota Coaster: Tanque 95 L (25.1 gal). Diésel.`,
      }
    }
    if (/\b(fj70|machito|serie 70|fzj71)\b/.test(l)) {
      return {
        capacidadTanqueGalones: 23.8,
        capacidadTanqueLitros: 90.0,
        consumoKmPorGalon: 22,
        tipoCombustible: combNotas ?? 'diesel',
        fichaInvestigadaNota: `Catálogo técnico Toyota Land Cruiser Serie 70: Tanque 90 L (23.8 gal). Diésel.`,
      }
    }
    if (/\b(corolla|yaris)\b/.test(l)) {
      return {
        capacidadTanqueGalones: 13.2,
        capacidadTanqueLitros: 50.0,
        consumoKmPorGalon: 44,
        tipoCombustible: combNotas ?? 'corriente',
        fichaInvestigadaNota: `Catálogo técnico Toyota compacto/sedán: Tanque 50 L (13.2 gal). Gasolina Corriente.`,
      }
    }
    return {
      capacidadTanqueGalones: 21.1,
      capacidadTanqueLitros: 80.0,
      consumoKmPorGalon: 30,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico Toyota 4x4 (Hilux/Prado/Fortuner): Tanque 80 L (21.1 gal). Rendimiento trocha: ~30 km/gal. Diésel.`,
    }
  }

  // 22. Ford Pickups (F-150, F-250, F-350, Ranger)
  if (/\bford\b/.test(m) && /\b(f-?150|f-?250|f-?350|ranger)\b/.test(l)) {
    const esHeavy = /\b(f-?250|f-?350)\b/.test(l)
    const esRanger = /\branger\b/.test(l)
    const gal = esHeavy ? 34.0 : esRanger ? 21.1 : 26.0
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esHeavy ? 18 : esRanger ? 29 : 22,
      tipoCombustible: combNotas ?? (esRanger || esHeavy ? 'diesel' : 'extra'),
      fichaInvestigadaNota: `Catálogo técnico Ford Pickup: Tanque ${gal} gal (${lit} L).`,
    }
  }

  // 23. Vans y Transporte Colectivo (incluye Peugeot Boxer / Fiat Ducato / Citroën Jumper)
  if (/\b(sprinter|master|transit|urvan|hiace|boxer|ducato|jumper)\b/.test(l)) {
    const esSprinter = /\bsprinter\b/.test(l)
    const gal = esSprinter ? 19.8 : 21.1
    const lit = esSprinter ? 75.0 : 80.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 29,
      tipoCombustible: combNotas ?? 'diesel',
      fichaInvestigadaNota: `Catálogo técnico transporte de pasajeros: Tanque ${lit} L (${gal} gal). Diésel.`,
    }
  }

  // 24. Camperos livianos Suzuki
  if (/\b(jimny|samurai|vitara)\b/.test(l) || (/\bsuzuki\b/.test(m) && !/\b(swift|alto)\b/.test(l))) {
    const esVitara = /\bvitara\b/.test(l)
    const gal = esVitara ? 14.5 : 10.5
    const lit = esVitara ? 55.0 : 40.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esVitara ? 34 : 38,
      tipoCombustible: combNotas ?? 'corriente',
      fichaInvestigadaNota: `Catálogo técnico Suzuki 4x4: Tanque ${lit} L (${gal} gal). Gasolina Corriente.`,
    }
  }

  // 25. Automóviles compactos y utilitarios comunes
  if (/\bcorsa\b/.test(l)) {
    return {
      capacidadTanqueGalones: 11.9,
      capacidadTanqueLitros: 45.0,
      consumoKmPorGalon: 39,
      tipoCombustible: combNotas ?? 'corriente',
      fichaInvestigadaNota: `Catálogo técnico Chevrolet Corsa: Tanque 45 L (11.9 gal). Gasolina Corriente.`,
    }
  }
  if (/\b(spark|picanto|i10|kwid)\b/.test(l) || (/\bsuzuki\b/.test(m) && /\balto\b/.test(l))) {
    return {
      capacidadTanqueGalones: 9.2,
      capacidadTanqueLitros: 35.0,
      consumoKmPorGalon: 46,
      tipoCombustible: combNotas ?? 'corriente',
      fichaInvestigadaNota: `Catálogo técnico compacto: Tanque 35 L (9.2 gal). Rendimiento: ~46 km/gal. Gasolina Corriente.`,
    }
  }
  if (/\b(duster|stepway|sandero|logan|clio|oroch)\b/.test(l)) {
    const esDuster = /\b(duster|oroch)\b/.test(l)
    return {
      capacidadTanqueGalones: 13.2,
      capacidadTanqueLitros: 50.0,
      consumoKmPorGalon: esDuster ? 32 : 36,
      tipoCombustible: combNotas ?? 'corriente',
      fichaInvestigadaNota: `Catálogo técnico Renault: Tanque 50 L (13.2 gal). Gasolina Corriente.`,
    }
  }

  // 26. Fallback genérico seguro por tipo y configuración
  const esPesado =
    corpus.includes('volqueta') ||
    corpus.includes('6x4') ||
    corpus.includes('6x6') ||
    corpus.includes('quinta rueda') ||
    corpus.includes('tractomula')
  const esCamionMediano = t === 'camion' || /\b(camion|camión)\b/.test(corpus)
  const esPickupOCampero = /\b(4x4|pickup|campero)\b/.test(corpus)

  const galonesFinal = esPesado ? 87.0 : esCamionMediano ? 36.0 : esPickupOCampero ? 21.0 : 13.2
  const litrosFinal = Number((galonesFinal * 3.78541).toFixed(1))
  const mencionaDiesel = /\b(diesel|diésel|acpm|turbodiesel|tdi)\b/.test(corpus)
  const tipoComb: TipoCombustible =
    combNotas ?? (esPesado || esCamionMediano || mencionaDiesel ? 'diesel' : 'corriente')
  const kmGalon = esPesado ? 8.5 : esCamionMediano ? 18 : esPickupOCampero ? 28 : 36

  return {
    capacidadTanqueGalones: galonesFinal,
    capacidadTanqueLitros: litrosFinal,
    consumoKmPorGalon: kmGalon,
    tipoCombustible: tipoComb,
    fichaInvestigadaNota: `Catálogo técnico preliminar (${esPesado ? 'camión pesado' : esCamionMediano ? 'camión' : 'vehículo'}): Tanque estimado ${galonesFinal} gal (${litrosFinal} L). ${tipoComb.toUpperCase()}.`,
  }
}

/**
 * Respaldo local de Selección y Asignación de Vehículo o Convoy para Misiones 🧠🚚🚙
 * Se usa cuando Gemini IA no responde o para rutas habituales.
 * NUNCA selecciona vehículos que no estén habilitados para Bear's Reserve (`disponibleParaTrabajo`).
 */
export function seleccionarVehiculosOptimosMision(
  mision: {
    titulo: string
    tipo: string
    impactoSocial?: string
    terreno?: string
    esEmergenciaGrave?: boolean
    distanciaKmTotal?: number
  },
  vehiculosDisponibles: VehiculoOperativo[],
  maxVehiculos = 2
): {
  vehiculoElegido: VehiculoOperativo | undefined
  vehiculosElegidos: VehiculoOperativo[]
  motivoGema: string
  candidatosSecundarios: VehiculoOperativo[]
} {
  const habilitados = vehiculosDisponibles.filter(
    (v) => v.disponibleParaTrabajo && v.estado !== 'mantenimiento'
  )
  // Bloquear estrictamente el despacho simultáneo de vehículos que ya están `en_mision`
  const libres = habilitados.filter((v) => v.estado !== 'en_mision')
  const aptosLibres = libres.filter(
    (v) => (v.nivelCombustiblePorc ?? 80) > UMBRAL_RESERVA_COMBUSTIBLE_PORC
  )
  const pool = aptosLibres.length > 0 ? aptosLibres : libres

  if (pool.length === 0) {
    const todosEnMision = habilitados.length > 0 && libres.length === 0
    return {
      vehiculoElegido: undefined,
      vehiculosElegidos: [],
      motivoGema: todosEnMision
        ? 'Toda la flota habilitada de Bear\'s Reserve se encuentra actualmente en misión. Espera a que retorne una unidad o programa la misión.'
        : 'No hay vehículos habilitados disponibles en Bear\'s Reserve.',
      candidatosSecundarios: [],
    }
  }

  const textoMision =
    `${mision.titulo} ${mision.tipo} ${mision.impactoSocial || ''} ${mision.terreno || ''}`.toLowerCase()

  const esTrasladoPersonasOMedico =
    /escolar|ni[ñn]os|colegio|estudiantes|adulto mayor|m[eé]dic|salud|hospital|cita|paciente|herid|evacuac|personas|familia|traslado/.test(
      textoMision
    )

  const requiere4x4ORescate =
    /barrizal|lodo|atasc|atollam|\bvolcamiento\b|suspendido|winche|remolc|derrumbe|deslizamiento|[aá]rbol|extrema|varad|inundaci|creciente|quebrada/.test(
      textoMision
    )

  const requiereCargaPesada =
    /trasteo|mudanza|leche|ganado|mercado|tejas|v[ií]veres|agua|insumos|ayudas|escombros|tractomula|cami[oó]n/.test(
      textoMision
    )

  const limiteConvoy = Math.min(3, Math.max(1, maxVehiculos))
  const ameritaConvoy =
    limiteConvoy > 1 &&
    pool.length >= 2 &&
    (Boolean(mision.esEmergenciaGrave) ||
      /\bvolcamiento\b|tractomula|derrumbe|inundaci|damnificad|alerta roja|evacuaci|avalancha|bloquea|\bbus\b/.test(
        textoMision
      ))

  const kmObjetivo = mision.distanciaKmTotal || 0

  const puntuados = pool.map((v) => {
    let score = 0
    const corpusV =
      `${v.marca} ${v.linea} ${v.tipo} ${v.carroceria || ''} ${v.notasCashmet || ''} ${v.fichaInvestigadaNota || ''} ${v.capacidadTexto || ''}`.toLowerCase()
    const { esCamionPesado, tiene4x4, tienePasajeros, esMoto, esBusOPasajerosPesado } =
      clasificarCapacidadesVehiculo(v)

    if (esTrasladoPersonasOMedico) {
      if (tienePasajeros) score += 55
      if (esCamionPesado && !esBusOPasajerosPesado) score -= 35
      if (esMoto) score -= 45
    }
    if (requiere4x4ORescate) {
      if (tiene4x4) score += 60
      if (esCamionPesado) score += 25
      if (esMoto) score -= 30
    }
    if (requiereCargaPesada) {
      if (esCamionPesado) score += 45
      if (/\b(pickup|plat[oó]n|estacas|furg[oó]n|hilux|ranger|l200|d-?max|camioneta)\b/.test(corpusV)) {
        score += 30
      }
    }

    const nivelComb = v.nivelCombustiblePorc ?? 50
    if (nivelComb <= UMBRAL_RESERVA_COMBUSTIBLE_PORC) score -= 25
    if ((v.desgasteLlantasPorc ?? 0) >= UMBRAL_LLANTAS_CRITICO_PORC) score -= 15

    // Autonomía real considerando terreno y nivel real (sin `0 || 50`)
    if (kmObjetivo > 0) {
      const autonomiaKm = calcularAutonomiaRealKm(v, mision.terreno, 0)
      if (autonomiaKm >= kmObjetivo) score += 12
      else if (autonomiaKm < kmObjetivo * 0.5) score -= 30
      else score -= 18
    }

    score += nivelComb * 0.1
    return { vehiculo: v, score, tiene4x4, tienePasajeros, esCamionPesado, esMoto }
  })

  puntuados.sort((a, b) => b.score - a.score)
  const principal = puntuados[0]
  const elegidos: VehiculoOperativo[] = [principal.vehiculo]

  // Si la emergencia amerita convoy, añadir vehículos complementarios hasta `limiteConvoy` (máx 3),
  // excluyendo motos y unidades en reserva de combustible del complemento
  if (ameritaConvoy && puntuados.length >= 2) {
    const elegiblesComplemento = puntuados
      .slice(1)
      .filter(
        (p) =>
          !p.esMoto &&
          p.vehiculo.estado !== 'en_mision' &&
          (p.vehiculo.nivelCombustiblePorc ?? 80) > UMBRAL_RESERVA_COMBUSTIBLE_PORC
      )

    while (elegidos.length < limiteConvoy) {
      const yaElegidos = new Set(elegidos.map((v) => v.id))
      const restantes = elegiblesComplemento.filter((p) => !yaElegidos.has(p.vehiculo.id))
      if (restantes.length === 0) break

      const complementario =
        restantes.find((p) =>
          principal.esCamionPesado
            ? p.tiene4x4 || p.tienePasajeros
            : p.esCamionPesado || p.tiene4x4
        ) || restantes[0]

      elegidos.push(complementario.vehiculo)
    }
  }

  const nombres = elegidos.map((v) => `${v.marca} ${v.linea}`).join(' + ')
  let motivo =
    elegidos.length > 1
      ? `Convoy sugerido (${elegidos.length} vehículos): ${nombres}`
      : `Gema seleccionó ${nombres}`

  if (esTrasladoPersonasOMedico && principal.tienePasajeros) {
    motivo += ` por ser el vehículo de pasajeros más adecuado y cómodo para este traslado.`
  } else if (requiere4x4ORescate && (principal.tiene4x4 || principal.esCamionPesado)) {
    motivo += ` por su tracción, fuerza y capacidad de rescate para la situación.`
  } else if (requiereCargaPesada) {
    motivo += ` por su capacidad de carga y autonomía disponible.`
  } else {
    motivo += ` por estar disponible en base con tanque al ${principal.vehiculo.nivelCombustiblePorc}%.`
  }

  const idsElegidos = new Set(elegidos.map((v) => v.id))
  return {
    vehiculoElegido: elegidos[0],
    vehiculosElegidos: elegidos,
    motivoGema: motivo,
    candidatosSecundarios: puntuados
      .filter((p) => !idsElegidos.has(p.vehiculo.id))
      .slice(0, 3)
      .map((p) => p.vehiculo),
  }
}

// ---------------------------------------------------------------------------
// RADAR CON CADUCIDAD REAL (1–2 DÍAS) Y POOL DE LLAMADAS VEREDALES FRESCAS
// ---------------------------------------------------------------------------

const MAX_ANTIGUEDAD_EVENTO_MS = 48 * 60 * 60 * 1000 // 2 días máximo

function normalizarTextoSimple(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Valida por código que la fecha real de publicación de una noticia web esté
 * dentro de la ventana permitida (por defecto, máximo 2 días atrás respecto a `hoy`).
 * Evita que noticias viejas de hace semanas entren como si fueran de hoy.
 */
export function esFechaNoticiaReciente(
  fechaPublicacionISO: string | undefined,
  hoy: string = hoyISO(),
  maxDiasAntiguedad = 2
): boolean {
  if (!fechaPublicacionISO) return false
  const limpia = String(fechaPublicacionISO).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return false

  const [yP, mP, dP] = limpia.split('-').map(Number)
  const [yH, mH, dH] = hoy.split('-').map(Number)
  const pub = new Date(yP, mP - 1, dP, 12, 0, 0)
  const ref = new Date(yH, mH - 1, dH, 12, 0, 0)

  if (Number.isNaN(pub.getTime()) || Number.isNaN(ref.getTime())) return false
  // Verificar que la fecha exista realmente (evita 2026-02-31)
  if (pub.getFullYear() !== yP || pub.getMonth() !== mP - 1 || pub.getDate() !== dP) return false

  const diffDias = Math.round((ref.getTime() - pub.getTime()) / (24 * 60 * 60 * 1000))
  // Permitimos -1 por diferencias de huso horario (UTC vs Colombia) hasta maxDiasAntiguedad días atrás
  return diffDias >= -1 && diffDias <= maxDiasAntiguedad
}

const TEMAS_COMUNITARIOS: Array<{ clave: string; regex: RegExp }> = [
  { clave: 'lechero', regex: /\blecher|leche|lactic/ },
  { clave: 'escuela', regex: /\bescuel|colegi|escolar|ninos|estudiantes|pupitres/ },
  { clave: 'derrumbe', regex: /\bderrumb|deslizam|talud|rocas|piedras|banca/ },
  { clave: 'trasteo', regex: /\btraste|mudanz|enseres/ },
  { clave: 'arbol', regex: /\barbol|tronco|ramas|motosierra/ },
  { clave: 'cafetero', regex: /\bcafe|cafeter|cosecha|platano/ },
  { clave: 'desvare', regex: /\bdesvar|embrague|averia|mecanica|bateria|cardan/ },
  { clave: 'agua', regex: /\bacueduct|inundac|quebrada|creciente|vado/ },
  { clave: 'salud', regex: /\b(salud|medic|hospital|cita|paciente|enferm|herid|adulto mayor|parto)/ },
]

export function detectarTemasEvento(ev: Pick<EventoRadarLocal, 'titulo' | 'resumen'>): Set<string> {
  const txt = normalizarTextoSimple(`${ev.titulo} ${ev.resumen || ''}`)
  const temas = new Set<string>()
  for (const t of TEMAS_COMUNITARIOS) {
    if (t.regex.test(txt)) temas.add(t.clave)
  }
  return temas
}

export function detectarTemaEvento(ev: Pick<EventoRadarLocal, 'titulo' | 'resumen'>): string | null {
  const temas = detectarTemasEvento(ev)
  const primero = temas.values().next()
  return primero.done ? null : primero.value
}

export function extraerClaveVereda(lugar: string): string {
  const norm = normalizarTextoSimple(lugar)
    .replace(/\b(vereda|sector|municipio de|caldas|manizales|via|antigua)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return norm.split(' ').slice(0, 2).join(' ')
}

function tokensSignificativos(texto: string): Set<string> {
  const stop = new Set([
    'para', 'como', 'tras', 'sobre', 'entre', 'desde', 'hasta', 'contra', 'hacia',
    'este', 'esta', 'estos', 'estas', 'unos', 'unas', 'pero', 'porque', 'cuando',
    'donde', 'quien', 'todo', 'toda', 'todos', 'todas', 'paso', 'zona', 'sector',
    'municipio', 'vereda', 'colombia', 'caldas', 'manizales', 'autoridades',
  ])
  return new Set(
    normalizarTextoSimple(texto)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stop.has(w))
  )
}

function similitudTitulos(a: string, b: string): number {
  const ta = tokensSignificativos(a)
  const tb = tokensSignificativos(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const w of ta) {
    if (tb.has(w)) inter++
  }
  return inter / Math.min(ta.size, tb.size)
}

/**
 * Detecta si un nuevo evento del radar es semánticamente redundante con alguno ya activo:
 * - Mismo título exacto o misma URL de fuente.
 * - En noticias web: mismo hecho cubierto por dos medios (alta similitud de palabras clave >= 55%).
 * - En llamadas comunitarias (no web): misma vereda/sector principal O misma temática ya activa.
 */
export function esEventoRedundante(
  candidato: Pick<EventoRadarLocal, 'titulo' | 'lugar' | 'resumen' | 'esNoticiaWebReal' | 'urlFuente'>,
  existentes: EventoRadarLocal[]
): boolean {
  const tituloNorm = normalizarTextoSimple(candidato.titulo)
  const urlCand = String(candidato.urlFuente || '').trim()
  const veredaCand = extraerClaveVereda(candidato.lugar)
  const temasCand = detectarTemasEvento(candidato)

  for (const ex of existentes) {
    if (normalizarTextoSimple(ex.titulo) === tituloNorm) return true
    if (urlCand && ex.urlFuente && urlCand === ex.urlFuente.trim()) return true
    if (ex.despachado) continue

    // Noticias web sobre el mismo acontecimiento
    if (candidato.esNoticiaWebReal && ex.esNoticiaWebReal) {
      if (similitudTitulos(candidato.titulo, ex.titulo) >= 0.55) {
        return true
      }
      continue
    }

    // Para llamadas comunitarias evitamos repetir vereda o temática al mismo tiempo
    if (!candidato.esNoticiaWebReal && !ex.esNoticiaWebReal) {
      const veredaEx = extraerClaveVereda(ex.lugar)
      if (
        veredaCand &&
        veredaEx &&
        (veredaCand === veredaEx ||
          (veredaCand.length >= 4 &&
            veredaEx.length >= 4 &&
            (veredaCand.includes(veredaEx) || veredaEx.includes(veredaCand))))
      ) {
        return true
      }
      if (temasCand.size > 0) {
        const temasEx = detectarTemasEvento(ex)
        for (const t of temasCand) {
          if (temasEx.has(t)) return true
        }
      }
    }
  }
  return false
}

/**
 * Elimina duplicados dentro de una lista de eventos manteniendo el más reciente.
 */
export function deduplicarEventosRadar(eventos: EventoRadarLocal[]): EventoRadarLocal[] {
  const ordenados = [...(eventos || [])].sort(
    (a, b) => (Number(b?.creadoEn) || 0) - (Number(a?.creadoEn) || 0)
  )
  const unicos: EventoRadarLocal[] = []
  for (const ev of ordenados) {
    if (!ev || !ev.id) continue
    if (esEventoRedundante(ev, unicos)) continue
    unicos.push(ev)
  }
  return unicos
}

/**
 * Filtra eventos del radar eliminando automáticamente cualquiera que haya expirado
 * (por `expiraEn <= ahora` o cuya fecha calendario tenga más de 2 días de antigüedad).
 */
export function filtrarEventosRadarVigentes(
  eventos: EventoRadarLocal[],
  ahora = Date.now()
): EventoRadarLocal[] {
  return (eventos || []).filter((e) => {
    if (!e || !e.id) return false
    if (e.id === 'rad-sim-6') return false
    if (typeof e.expiraEn === 'number' && Number.isFinite(e.expiraEn)) {
      if (e.expiraEn <= ahora) return false
    }
    if (typeof e.creadoEn === 'number' && Number.isFinite(e.creadoEn)) {
      if (ahora - e.creadoEn > MAX_ANTIGUEDAD_EVENTO_MS) return false
    }
    if (e.fecha && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) {
      const [y, m, d] = e.fecha.split('-').map(Number)
      const fechaMs = new Date(y, m - 1, d, 23, 59, 59).getTime()
      if (ahora - fechaMs > MAX_ANTIGUEDAD_EVENTO_MS) return false
    }
    return true
  })
}

const POOL_LLAMADAS_COMUNITARIAS_RESPALDO: Array<
  Omit<EventoRadarLocal, 'id' | 'fecha' | 'creadoEn' | 'expiraEn'>
> = [
  {
    titulo: 'Familia campesina en Vereda El Desquite requiere trasteo solidario en trocha',
    lugar: 'Vereda El Desquite (Trocha alta) · Manizales',
    departamento: 'Caldas',
    lat: 5.056,
    lng: -75.438,
    fuenteNoticia: 'Llamada directa a la Central Bear\'s Reserve',
    resumen:
      'Madre cabeza de hogar con tres niños y adulto mayor necesita trasladar enseres por trocha destapada antes de las lluvias de la tarde.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Camino rural donde no ingresan vehículos convencionales. Ideal unidad 4x4 de carga.',
  },
  {
    titulo: 'Camión lechero con falla de cardán atascado en vado de barro',
    lugar: 'Sector Bajo Tablazo ↔ Vereda La Linda',
    departamento: 'Caldas',
    lat: 5.0345,
    lng: -75.528,
    fuenteNoticia: 'Comité de Ganaderos Veredales WhatsApp',
    resumen:
      'Transporta 1.800 litros de leche de 9 parcelas familiares. Si no se remolca a terreno firme se pierde la producción del día.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Despliegue de vehículo con winche y eslingas de arrastre pesado.',
  },
  {
    titulo: 'Árbol derribado sobre paso peatonal escolar y manguera de acueducto veredal',
    lugar: 'Vereda San Peregrino · Manizales',
    departamento: 'Caldas',
    lat: 5.0742,
    lng: -75.581,
    fuenteNoticia: 'Junta de Acción Comunal San Peregrino',
    resumen:
      'Tronco bloquea el camino que usan los niños hacia la escuela y rompió la conducción de agua de seis viviendas.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Muy cerca de Base Finca El Guadual. Requiere motosierra, cadenas y cuadrilla de apoyo.',
  },
  {
    titulo: 'Deslizamiento menor en vía antigua a Chinchiná bloquea salida de cosecha',
    lugar: 'Vereda El Rosario (Sector La Siria) · Caldas',
    departamento: 'Caldas',
    lat: 5.0489,
    lng: -75.5684,
    fuenteNoticia: 'Radio Comunitaria Chinchiná Stereo',
    resumen:
      'Lluvia de madrugada provocó caída de talud sobre calzada veredal. Productores de plátano y café no pueden sacar carga.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Vía veredal secundaria sin maquinaria oficial. Requiere tracción 4x4 y herramientas.',
  },
  {
    titulo: 'Campero cafetero encunetado en greda húmeda en Vereda Morrogacho',
    lugar: 'Vereda Morrogacho · Manizales',
    departamento: 'Caldas',
    lat: 5.0612,
    lng: -75.534,
    fuenteNoticia: 'Llamada de vecino a la Reserva',
    resumen:
      'Campero con 12 bultos de café cereza resbaló al borde de una cuneta profunda y requiere extracción controlada.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Maniobra de polea de reenvío y winche para evitar volcamiento.',
  },
  {
    titulo: 'Avería de embrague en furgón escolar comunitario en subida de Alto Tablazo',
    lugar: 'Sector Alto Tablazo · Manizales',
    departamento: 'Caldas',
    lat: 5.043,
    lng: -75.509,
    fuenteNoticia: 'Grupo WhatsApp Veredal Tablazo',
    resumen:
      'Vehículo comunitario quedó sin tracción en plena pendiente con 7 pasajeros esperando transbordo o remolque.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'apoyo_logistico',
    justificacionGema: 'Remolque con barra rígida y apoyo mecánico de emergencia.',
  },
  {
    titulo: 'Rocas sueltas obstaculizan paso veredal en La Quiebra de Vélez',
    lugar: 'Sector La Quiebra de Vélez ↔ La Cabaña · Caldas',
    departamento: 'Caldas',
    lat: 5.1021,
    lng: -75.5645,
    fuenteNoticia: 'Comité de Cafeteros Veredal',
    resumen:
      'Tres rocas de gran volumen impiden el tránsito hacia las fincas altas. Solicitan camión con cadenas para despejar.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Arrastre pesado con vehículo de alto torque.',
  },
]

function barajarFisherYates<T>(lista: T[]): T[] {
  const arr = [...lista]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * Respaldo local (sin internet/Gemini) para generar llamadas comunitarias frescas con caducidad de ~24h.
 * Evita repetir veredas y temáticas que ya están activas en el radar.
 * NUNCA inventa `esNoticiaWebReal: true`.
 */
export function generarLlamadasComunitariasRespaldo(
  eventosActuales: EventoRadarLocal[],
  cantidad = 2,
  ahora = Date.now()
): EventoRadarLocal[] {
  const hoy = hoyISO()
  const elegidos: EventoRadarLocal[] = []
  const acumulados: EventoRadarLocal[] = [...eventosActuales]

  const mezcla = barajarFisherYates(POOL_LLAMADAS_COMUNITARIAS_RESPALDO)
  for (const item of mezcla) {
    if (elegidos.length >= cantidad) break
    if (esEventoRedundante(item, acumulados)) continue
    const sufijo = Math.random().toString(36).slice(2, 6)
    const nuevo: EventoRadarLocal = {
      ...item,
      id: `rad-com-${ahora}-${elegidos.length}-${sufijo}`,
      fecha: hoy,
      creadoEn: ahora,
      expiraEn: ahora + TTL_LLAMADA_COMUNITARIA_MS,
      esNoticiaWebReal: false,
    }
    elegidos.push(nuevo)
    acumulados.push(nuevo)
  }

  return elegidos
}

export function escanearNuevosEventosRadarIA(eventosActuales: EventoRadarLocal[]): {
  nuevosEventos: EventoRadarLocal[]
  eventoAgregado: EventoRadarLocal | null
} {
  const vigentes = filtrarEventosRadarVigentes(eventosActuales)
  const generados = generarLlamadasComunitariasRespaldo(vigentes, 1)
  const agregado = generados[0] ?? null
  return {
    nuevosEventos: agregado ? [agregado, ...vigentes] : vigentes,
    eventoAgregado: agregado,
  }
}

// ---------------------------------------------------------------------------
// EVALUACIÓN AUTÓNOMA DE MISIONES (RESPALDO LOCAL SI GEMINI NO ESTÁ DISPONIBLE)
// ---------------------------------------------------------------------------

export function evaluarDesenlaceMisionLocal(
  mision: MisionComunitaria,
  vehiculosParticipantes: VehiculoOperativo[],
  tripulantesNombres: string[],
  resultadoForzado?: 'exito' | 'parcial' | 'fallida_dificultad'
): {
  resultado: 'exito' | 'parcial' | 'fallida_dificultad'
  factorDistanciaReal: number
  cronicaHistoria: string
} {
  const nombresVehs = vehiculosParticipantes.map((v) => `${v.marca} ${v.linea}`)

  if (resultadoForzado) {
    const factorDistanciaReal =
      resultadoForzado === 'fallida_dificultad'
        ? 0.65
        : resultadoForzado === 'parcial'
          ? 0.92
          : 1.0
    const kmReales = Math.max(
      0,
      Number((mision.distanciaKmIdaYVuelta * factorDistanciaReal).toFixed(1))
    )
    return {
      resultado: resultadoForzado,
      factorDistanciaReal,
      cronicaHistoria: generarCronicaMisionNarrativa(
        mision,
        nombresVehs,
        tripulantesNombres,
        resultadoForzado,
        kmReales
      ),
    }
  }

  // Rutas habituales (escolares / mercado) casi siempre concluyen con éxito
  if (mision.tipo === 'ruta_habitual') {
    return {
      resultado: 'exito',
      factorDistanciaReal: 1.0,
      cronicaHistoria: generarCronicaMisionNarrativa(
        mision,
        nombresVehs,
        tripulantesNombres,
        'exito',
        mision.distanciaKmIdaYVuelta
      ),
    }
  }

  // Puntaje de idoneidad según terreno, equipo 4x4/winche, llantas y dificultad
  let riesgo = 0.08
  if (mision.terreno === 'trocha_extrema_barrizal') riesgo += 0.28
  else if (mision.terreno === 'trocha_moderada') riesgo += 0.1
  if (mision.prioridad === 'critica_extrema') riesgo += 0.12

  const tieneEquipoAdecuado = vehiculosParticipantes.some((v) => {
    const cap = clasificarCapacidadesVehiculo(v)
    return cap.esCamionPesado || cap.tiene4x4
  })
  if (tieneEquipoAdecuado) riesgo -= 0.16
  else if (mision.terreno === 'trocha_extrema_barrizal') riesgo += 0.22

  const llantasCriticas = vehiculosParticipantes.some(
    (v) => (v.desgasteLlantasPorc ?? 0) >= UMBRAL_LLANTAS_CRITICO_PORC
  )
  if (llantasCriticas) riesgo += 0.14

  const r = Math.random()
  let resultado: 'exito' | 'parcial' | 'fallida_dificultad' = 'exito'
  let factorDistanciaReal = 1.0

  if (r < Math.max(0.03, riesgo * 0.35)) {
    resultado = 'fallida_dificultad'
    factorDistanciaReal = 0.65
  } else if (r < Math.max(0.1, riesgo)) {
    resultado = 'parcial'
    factorDistanciaReal = 0.92
  } else {
    resultado = 'exito'
    factorDistanciaReal = 1.0
  }

  const kmReales = Math.max(
    0,
    Number((mision.distanciaKmIdaYVuelta * factorDistanciaReal).toFixed(1))
  )
  return {
    resultado,
    factorDistanciaReal,
    cronicaHistoria: generarCronicaMisionNarrativa(
      mision,
      nombresVehs,
      tripulantesNombres,
      resultado,
      kmReales
    ),
  }
}

export function generarCronicaMisionNarrativa(
  mision: MisionComunitaria,
  vehiculosNombres: string[],
  tripulantesNombres: string[],
  resultado: 'exito' | 'parcial' | 'fallida_dificultad' = 'exito',
  kmReales?: number
): string {
  const duracionTexto =
    mision.duracionMinutos < 60
      ? `${mision.duracionMinutos} minutos`
      : `${(mision.duracionMinutos / 60).toFixed(1)} horas`

  const distanciaMostrar =
    typeof kmReales === 'number' && Number.isFinite(kmReales)
      ? kmReales
      : mision.distanciaKmIdaYVuelta

  const flotaTexto =
    vehiculosNombres.length > 0 ? vehiculosNombres.join(' y ') : 'vehículo de la reserva'
  const equipoTexto =
    tripulantesNombres.length > 0 ? tripulantesNombres.join(', ') : 'equipo de guardia'

  const esPavimento = mision.terreno === 'pavimento'
  const esMixto = mision.terreno === 'mixto_montaña'

  if (resultado === 'exito') {
    return (
      `Relato de Operaciones · Salida desde Finca El Guadual hacia ${mision.destino}. ` +
      `La operación duró ${duracionTexto} con un recorrido de ${distanciaMostrar} km sobre ${mision.terreno.replace(/_/g, ' ')}. ` +
      `A cargo estuvieron ${equipoTexto}, empleando ${flotaTexto}. ` +
      `Se coordinó directamente con la comunidad en terreno y se completó el objetivo sin novedades mecánicas graves, retornando a base listos para el siguiente turno.`
    )
  }

  if (resultado === 'parcial') {
    const dificultadTerreno = esPavimento
      ? 'La vía pavimentada presentó congestión severa, paso restringido y lluvia intensa que exigieron maniobras controladas'
      : esMixto
        ? 'El tramo de montaña presentó neblina densa, calzada húmeda y reducción a un carril que exigieron avance prudente'
        : 'El terreno presentó lodazal e inclinación exigente que requirió maniobras lentas y anclajes'
    return (
      `Bitácora de Intervención Compleja · Despliegue hacia ${mision.destino} (${duracionTexto}, ${distanciaMostrar} km). ` +
      `Participaron ${equipoTexto} con ${flotaTexto}. ${dificultadTerreno}. ` +
      `Se aseguró y atendió el objetivo principal en zona segura; el tramo final se coordinó con líderes locales. Equipo de vuelta en base sin lesionados.`
    )
  }

  const motivoRepliegue = esPavimento
    ? 'cierre total de la calzada y paso bloqueado por las autoridades en carretera'
    : esMixto
      ? 'condiciones críticas de deslizamiento y bloqueo vial en la ruta de montaña'
      : 'condiciones críticas de derrumbe activo y piso inestable en la trocha'
  return (
    `Reporte de Repliegue Táctico · Desplazamiento hacia ${mision.destino} (${duracionTexto}, ${distanciaMostrar} km recorridos). ` +
    `La tripulación (${equipoTexto}) a bordo de ${flotaTexto} encontró ${motivoRepliegue}. ` +
    `Priorizando la seguridad del personal y la integridad del vehículo, se suspendió el ingreso final, se entregó apoyo inmediato posible a los vecinos del sector y se retornó con precaución a la base central.`
  )
}

// ---------------------------------------------------------------------------
// MOTOR DE TURNOS SEMANALES 24/7 (TOPE ESTRICTO 42H, SIN EXCLUSIONES POR CARGO)
// ---------------------------------------------------------------------------

/**
 * Genera el cuadrante semanal 24/7 respetando:
 * - Tope estricto <= 42 horas por colaborador (turnos continuos de 8h exactas).
 * - Usa TODOS los colaboradores marcados como `activo` en Bear's Reserve (ninguno queda en 0h por cargo).
 * - Vincula los IDs REALES de las `rutasHabituales` activas (`rut-escolar-manana`, `rut-escolar-tarde`, `rut-mercado-campesino`, etc.).
 * - Rotación circular que funciona con CUALQUIER número de empleados (incluyendo múltiplos de 3).
 * - IDs de turno únicos sin colisiones y validación correcta de horarios de estudio/medianoche.
 */
export function generarTurnosSemanalesIA(
  empleados: EmpleadoOperativo[],
  fechaLunesISO: string,
  rutasHabituales: RutaHabitual[] = [],
  rotacionOffset: number = 0
): TurnoSemanal[] {
  const turnos: TurnoSemanal[] = []
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  const partes = fechaLunesISO.split('-').map(Number)
  const baseFecha = new Date(partes[0], partes[1] - 1, partes[2], 12, 0, 0)

  const empleadosActivos = empleados.filter((e) => e.activo !== false)
  const n = empleadosActivos.length
  if (n === 0) return []

  // Rotación circular que cambia en cada clic para cualquier n > 1 (incluyendo n = 3, 6, 9)
  const shift = n > 1 ? Math.abs(rotacionOffset) % n : 0
  const poolRotado = [...empleadosActivos.slice(shift), ...empleadosActivos.slice(0, shift)]
  const indiceRotado = new Map<string, number>(poolRotado.map((e, i) => [e.id, i]))
  const afinidadCondMapa = new Map<string, number>(poolRotado.map((e) => [e.id, afinidadConductor(e)]))
  const afinidadMecMapa = new Map<string, number>(poolRotado.map((e) => [e.id, afinidadMecanico(e)]))

  // Distribuir 2 días de descanso escalonados por empleado para garantizar cobertura también sáb/dom en equipos pequeños (2-4)
  const diasDescansoPorEmpleado: Record<string, Set<number>> = {}
  const patronesDescanso = [
    [5, 6], // Sáb-Dom
    [3, 4], // Jue-Vie
    [1, 2], // Mar-Mié
    [4, 5], // Vie-Sáb
    [2, 3], // Mié-Jue
    [0, 1], // Lun-Mar
    [6, 0], // Dom-Lun
  ]
  poolRotado.forEach((e, idx) => {
    if (n >= 2) {
      const par = patronesDescanso[idx % patronesDescanso.length]
      diasDescansoPorEmpleado[e.id] = new Set(par)
    } else {
      diasDescansoPorEmpleado[e.id] = new Set([5, 6])
    }
  })

  const horasAsignadas: Record<string, number> = {}
  const turnosPorEmpleado: Record<string, number> = {}
  const diasOcupadosPorEmpleado: Record<string, Set<number>> = {}
  poolRotado.forEach((e) => {
    horasAsignadas[e.id] = 0
    turnosPorEmpleado[e.id] = 0
    diasOcupadosPorEmpleado[e.id] = new Set<number>()
  })

  const diasInfo: Array<{
    d: number
    fechaISO: string
    nombreDia: string
    diaSemanaRestriccion: number // 0=Dom, 1=Lun..6=Sab
    diaSemanaSiguiente: number
  }> = []

  for (let d = 0; d < 7; d++) {
    const fechaDia = new Date(baseFecha)
    fechaDia.setDate(baseFecha.getDate() + d)
    const fechaISO = isoLocal(fechaDia)
    const nombreDia = DIAS[d]
    const diaSemanaRestriccion = d === 6 ? 0 : d + 1
    const diaSemanaSiguiente = (diaSemanaRestriccion + 1) % 7
    diasInfo.push({ d, fechaISO, nombreDia, diaSemanaRestriccion, diaSemanaSiguiente })
  }

  const nocheTrabajadaPorDia: Record<number, Set<string>> = {
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
    5: new Set(),
    6: new Set(),
  }

  // Rutas habituales activas mapeadas por día de semana y franja
  const rutasActivas = rutasHabituales.filter((r) => r.activa !== false)
  const usarFallbackRutasPorDefecto = rutasHabituales.length === 0
  const buscarRutaParaFranja = (
    diaSemana: number,
    franja: 'manana' | 'tarde'
  ): RutaHabitual | undefined => {
    return rutasActivas.find((r) => {
      if (!r.diasSemana.includes(diaSemana)) return false
      if (franja === 'manana') {
        return (
          r.tipoHorario === 'manana' ||
          r.tipoHorario === 'mercado_sabado' ||
          (r.horaSalida ? horaAMinutos(r.horaSalida) < 12 * 60 : false)
        )
      }
      return (
        r.tipoHorario === 'tarde' ||
        (r.horaSalida ? horaAMinutos(r.horaSalida) >= 12 * 60 : false)
      )
    })
  }

  const descomponerTramo = (
    dia: number,
    ini: number,
    fin: number
  ): Array<{ dia: number; ini: number; fin: number }> => {
    if (ini <= fin) return [{ dia, ini, fin }]
    return [
      { dia, ini, fin: 24 * 60 },
      { dia: (dia + 1) % 7, ini: 0, fin },
    ]
  }

  const tieneConflictoHorario = (
    emp: EmpleadoOperativo,
    diaInfo: (typeof diasInfo)[number],
    horaInicio: string,
    horaFin: string
  ): boolean => {
    const sIni = horaAMinutos(horaInicio)
    const sFin = horaAMinutos(horaFin, true)
    const tramosTurno = descomponerTramo(diaInfo.diaSemanaRestriccion, sIni, sFin)

    return (emp.horariosNoDisponibles || []).some((h) => {
      const hIni = horaAMinutos(h.horaInicio)
      const hFin = horaAMinutos(h.horaFin, true)
      const tramosRestriccion = descomponerTramo(h.diaSemana, hIni, hFin)
      return tramosTurno.some((tt) =>
        tramosRestriccion.some((tr) => tt.dia === tr.dia && tt.ini < tr.fin && tr.ini < tt.fin)
      )
    })
  }

  const puedeAsignarse = (
    emp: EmpleadoOperativo,
    d: number,
    franja: 'manana' | 'tarde' | 'noche',
    duracionHoras: number,
    horaInicio: string,
    horaFin: string,
    respetarDescanso = false
  ): boolean => {
    const tope = Math.min(42, emp.maxHorasSemanales || 42)
    if ((horasAsignadas[emp.id] || 0) + duracionHoras > tope) return false
    if (diasOcupadosPorEmpleado[emp.id]?.has(d)) return false
    if (respetarDescanso && diasDescansoPorEmpleado[emp.id]?.has(d)) return false
    if (franja === 'manana' && d > 0 && nocheTrabajadaPorDia[d - 1]?.has(emp.id)) return false
    if (tieneConflictoHorario(emp, diasInfo[d], horaInicio, horaFin)) return false
    return true
  }

  const asignarTurno = (
    emp: EmpleadoOperativo,
    d: number,
    franja: 'manana' | 'tarde' | 'noche',
    horaInicio: string,
    horaFin: string,
    horas: number,
    rol: string,
    idSufijo: string,
    rutaHabitualId?: string
  ) => {
    horasAsignadas[emp.id] = Number(((horasAsignadas[emp.id] || 0) + horas).toFixed(1))
    turnosPorEmpleado[emp.id] = (turnosPorEmpleado[emp.id] || 0) + 1
    diasOcupadosPorEmpleado[emp.id].add(d)
    if (franja === 'noche') nocheTrabajadaPorDia[d].add(emp.id)

    const diaInfo = diasInfo[d]
    turnos.push({
      id: `tur-${diaInfo.fechaISO}-${franja}-${idSufijo}-${emp.id}`,
      semanaISO: fechaLunesISO,
      empleadoId: emp.id,
      empleadoNombre: emp.nombreCompleto,
      esRespaldoCoordinador: false,
      fecha: diaInfo.fechaISO,
      franja,
      horaInicio,
      horaFin,
      horas,
      rolGuardia: rol,
      cumplido: false,
      rutaHabitualId,
    })
  }

  const ordenarCandidatosConRotacion = (lista: EmpleadoOperativo[]): EmpleadoOperativo[] => {
    return [...lista].sort((a, b) => {
      const hA = horasAsignadas[a.id] || 0
      const hB = horasAsignadas[b.id] || 0
      if (hA !== hB) return hA - hB
      return (indiceRotado.get(a.id) ?? 0) - (indiceRotado.get(b.id) ?? 0)
    })
  }

  // =========================================================================
  // FASE 1: CONDUCTORES TRONCALES Y RUTAS HABITUALES (21 franjas L-D)
  // =========================================================================
  for (const diaInfo of diasInfo) {
    const { d, nombreDia, diaSemanaRestriccion } = diaInfo
    const rutaManana = buscarRutaParaFranja(diaSemanaRestriccion, 'manana')
    const rutaTarde = buscarRutaParaFranja(diaSemanaRestriccion, 'tarde')

    // Solo usar IDs fallback por defecto si no se pasaron rutasHabituales; nunca reinyectar rutas deshabilitadas
    const rutaMananaId =
      rutaManana?.id ??
      (usarFallbackRutasPorDefecto
        ? d <= 4
          ? 'rut-escolar-manana'
          : d === 5
            ? 'rut-mercado-campesino'
            : undefined
        : undefined)
    const rutaTardeId =
      rutaTarde?.id ?? (usarFallbackRutasPorDefecto && d <= 4 ? 'rut-escolar-tarde' : undefined)

    const horaMananaIni = rutaManana?.horaSalida === '05:30' ? '05:30' : '06:00'
    const horaMananaFin = horaMananaIni === '05:30' ? '13:30' : '14:00'
    // Cerrar la brecha de 30 min del sábado (13:30-14:00) ajustando la tarde a 13:30-22:00 (8.5h, <=42h)
    const horaTardeIni = horaMananaFin === '13:30' ? '13:30' : '14:00'
    const horasTarde = horaTardeIni === '13:30' ? 8.5 : 8

    const franjasCond: Array<{
      franja: 'manana' | 'tarde' | 'noche'
      horaInicio: string
      horaFin: string
      horas: number
      rol: string
      rutaHabitualId?: string
      idSufijo: string
    }> = [
      {
        franja: 'manana',
        horaInicio: horaMananaIni,
        horaFin: horaMananaFin,
        horas: 8,
        rol: rutaManana
          ? `🚌 Conducción ${rutaManana.nombre} (${rutaManana.horaSalida || horaMananaIni}) + Guardia Base (${nombreDia})`
          : usarFallbackRutasPorDefecto && d <= 4
            ? `🚌 Conducción Ruta Escolar Matutina 06:00 + Guardia Base (${nombreDia})`
            : usarFallbackRutasPorDefecto && d === 5
              ? `🧺 Conducción Ruta Solidaria Mercado Campesino 05:30 + Guardia Base (${nombreDia})`
              : `🚗 Conductor de Guardia Matutina & Base Central (${nombreDia})`,
        rutaHabitualId: rutaMananaId,
        idSufijo: 'cond-ruta',
      },
      {
        franja: 'tarde',
        horaInicio: horaTardeIni,
        horaFin: '22:00',
        horas: horasTarde,
        rol: rutaTarde
          ? `🚌 Conducción ${rutaTarde.nombre} (${rutaTarde.horaSalida || '15:00'}) + Guardia Base (${nombreDia})`
          : usarFallbackRutasPorDefecto && d <= 4
            ? `🚌 Conducción Ruta Escolar Vespertina 15:00 + Guardia Base (${nombreDia})`
            : `🚗 Conductor de Guardia Vespertina & Auxilio Veredal (${nombreDia})`,
        rutaHabitualId: rutaTardeId,
        idSufijo: 'cond-ruta',
      },
      {
        franja: 'noche',
        horaInicio: '22:00',
        horaFin: '06:00',
        horas: 8,
        rol: `🚗 Conductor Nocturno & Respuesta Inmediata (${nombreDia})`,
        idSufijo: 'cond-noche',
      },
    ]

    for (const fc of franjasCond) {
      // Respetar descansos escalonados para preservar cobertura sáb/dom en equipos pequeños
      const disponiblesDesc = poolRotado.filter((emp) =>
        puedeAsignarse(emp, d, fc.franja, fc.horas, fc.horaInicio, fc.horaFin, true)
      )
      const disponibles =
        disponiblesDesc.length > 0
          ? disponiblesDesc
          : fc.rutaHabitualId
            ? poolRotado.filter((emp) =>
                puedeAsignarse(emp, d, fc.franja, fc.horas, fc.horaInicio, fc.horaFin, false)
              )
            : []

      const conAfinidad = disponibles.filter((emp) => (afinidadCondMapa.get(emp.id) ?? 0) > 0)
      const candidatos = ordenarCandidatosConRotacion(
        conAfinidad.length > 0 ? conAfinidad : disponibles
      )

      if (candidatos[0]) {
        asignarTurno(
          candidatos[0],
          d,
          fc.franja,
          fc.horaInicio,
          fc.horaFin,
          fc.horas,
          fc.rol,
          fc.idSufijo,
          fc.rutaHabitualId
        )
      }
    }
  }

  // =========================================================================
  // FASE 2: MECÁNICOS / SOPORTE EN BASE (hasta 21 franjas L-D)
  // =========================================================================
  for (const diaInfo of diasInfo) {
    const { d, nombreDia, diaSemanaRestriccion } = diaInfo
    const rutaManana = buscarRutaParaFranja(diaSemanaRestriccion, 'manana')
    const horaTardeIni = rutaManana?.horaSalida === '05:30' ? '13:30' : '14:00'
    const horasTarde = horaTardeIni === '13:30' ? 8.5 : 8

    const franjasMec: Array<{
      franja: 'manana' | 'tarde' | 'noche'
      horaInicio: string
      horaFin: string
      horas: number
      rolMec: string
      rolApoyo: string
      idSufijo: string
    }> = [
      {
        franja: 'manana',
        horaInicio: '06:00',
        horaFin: '14:00',
        horas: 8,
        rolMec: `🔧 Mecánico de Base / Soporte Técnico & Alistamiento (${nombreDia})`,
        rolApoyo: `🛡️ Guardia de Base & Logística Comunitaria Matutina (${nombreDia})`,
        idSufijo: 'mec-base',
      },
      {
        franja: 'tarde',
        horaInicio: horaTardeIni,
        horaFin: '22:00',
        horas: horasTarde,
        rolMec: `🔧 Mecánico / Mantenimiento de Trocha & Winches (${nombreDia})`,
        rolApoyo: `🛡️ Guardia de Base & Apoyo Veredal Vespertino (${nombreDia})`,
        idSufijo: 'mec-tarde',
      },
      {
        franja: 'noche',
        horaInicio: '22:00',
        horaFin: '06:00',
        horas: 8,
        rolMec: `🔧 Mecánico Nocturno & Rescate Pesado (${nombreDia})`,
        rolApoyo: `🛡️ Guardia Nocturna de Radio & Coordinación (${nombreDia})`,
        idSufijo: 'mec-noche',
      },
    ]

    for (const fm of franjasMec) {
      const disponibles = poolRotado.filter((emp) =>
        puedeAsignarse(emp, d, fm.franja, fm.horas, fm.horaInicio, fm.horaFin, true)
      )
      const conAfinidad = disponibles.filter((emp) => (afinidadMecMapa.get(emp.id) ?? 0) > 0)
      const candidatos = ordenarCandidatosConRotacion(
        conAfinidad.length > 0 ? conAfinidad : disponibles
      )

      if (candidatos[0]) {
        const esMec = (afinidadMecMapa.get(candidatos[0].id) ?? 0) > 0
        asignarTurno(
          candidatos[0],
          d,
          fm.franja,
          fm.horaInicio,
          fm.horaFin,
          fm.horas,
          esMec ? fm.rolMec : fm.rolApoyo,
          fm.idSufijo
        )
      }
    }
  }

  // =========================================================================
  // FASE 3: EQUIDAD HASTA 40H SEMANALES PARA TODO EL PERSONAL ACTIVO
  // =========================================================================
  let intentos = 0
  while (intentos < n * 7) {
    intentos++
    const pendientes = ordenarCandidatosConRotacion(
      poolRotado.filter(
        (e) =>
          (turnosPorEmpleado[e.id] || 0) < 5 &&
          (horasAsignadas[e.id] || 0) + 8 <= Math.min(42, e.maxHorasSemanales || 42)
      )
    )

    if (pendientes.length === 0) break

    let progresoEnCiclo = false
    for (const emp of pendientes) {
      let asignado = false
      const esCond = (afinidadCondMapa.get(emp.id) ?? 0) > 0
      const esMec = (afinidadMecMapa.get(emp.id) ?? 0) > 0

      for (const respetarDescanso of [true, false]) {
        for (const franja of ['manana', 'tarde', 'noche'] as const) {
          const hIni = franja === 'manana' ? '06:00' : franja === 'tarde' ? '14:00' : '22:00'
          const hFin = franja === 'manana' ? '14:00' : franja === 'tarde' ? '22:00' : '06:00'
          for (const diaInfo of diasInfo) {
            const { d, nombreDia } = diaInfo
            if (!puedeAsignarse(emp, d, franja, 8, hIni, hFin, respetarDescanso)) continue

            const rolTexto =
              franja === 'noche'
                ? `🛡️ Guardia Nocturna de Apoyo (${nombreDia})`
                : esCond
                  ? franja === 'manana'
                    ? `🚗 Conductor de Apoyo / Guardia Rápida Veredal (${nombreDia})`
                    : `🚗 Conductor de Asistencia Comunitaria (${nombreDia})`
                  : esMec
                    ? `🔧 Soporte Técnico & Taller Preventivo (${nombreDia})`
                    : `🛡️ Apoyo Logístico & Enlace Comunitario (${nombreDia})`

            asignarTurno(emp, d, franja, hIni, hFin, 8, rolTexto, `apoyo-${d}`)
            asignado = true
            progresoEnCiclo = true
            break
          }
          if (asignado) break
        }
        if (asignado) break
      }
    }

    if (!progresoEnCiclo) break
  }

  turnos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.horaInicio.localeCompare(b.horaInicio)
  })

  return turnos
}

// ---------------------------------------------------------------------------
// INFORME DIARIO Y RESPALDO LOCAL DE RADIO GEMA (SI GEMINI ESTÁ OFFLINE)
// ---------------------------------------------------------------------------

export function generarInformeDiarioOperaciones(contexto: {
  empleados: EmpleadoOperativo[]
  vehiculos: VehiculoOperativo[]
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
  eventosRadar?: EventoRadarLocal[]
}): string {
  const hoy = hoyISO()
  const misionesHoy = contexto.misiones.filter((m) => m.fecha === hoy)
  const misionesCompletadas = misionesHoy.filter(
    (m) => m.estado === 'completada' || m.estado === 'inconclusa_repliegue'
  )
  // Incluir misiones en curso aunque hayan iniciado en días previos
  const misionesEnCurso = contexto.misiones.filter((m) => m.estado === 'en_curso')
  const misionesProgramadasHoy = misionesHoy.filter((m) => m.estado === 'programada')
  const turnosHoy = contexto.turnos.filter((t) => t.fecha === hoy)
  const vehiculosTrabajo = contexto.vehiculos.filter((v) => v.disponibleParaTrabajo)
  const alertasVigentes = filtrarEventosRadarVigentes(contexto.eventosRadar || [])

  let informe = `🐻💎 **INFORME DIARIO DE OPERACIONES · BEAR'S RESERVE**\n`
  informe += `📅 **Fecha**: ${hoy} · Base Finca El Guadual (Manizales)\n\n`

  informe += `👥 **Personal en Guardia Hoy (Tope 42h)**:\n`
  if (turnosHoy.length > 0) {
    turnosHoy.forEach((t) => {
      informe += `• 👤 **${t.empleadoNombre}**: ${t.horaInicio} - ${t.horaFin} (${t.rolGuardia})\n`
    })
  } else {
    informe += `• Sin turnos programados para hoy.\n`
  }

  informe += `\n🚚 **Estado de Flota Habilitada (${vehiculosTrabajo.length} vehículos)**:\n`
  if (vehiculosTrabajo.length === 0) {
    informe += `• No hay vehículos habilitados para Bear's Reserve aún.\n`
  } else {
    vehiculosTrabajo.forEach((v) => {
      const estadoTanque =
        v.nivelCombustiblePorc <= UMBRAL_RESERVA_COMBUSTIBLE_PORC ? '⚠️ En reserva' : '✅ Óptimo'
      const estadoOp =
        v.estado === 'en_mision'
          ? '🚨 En misión'
          : v.estado === 'mantenimiento'
            ? '🔧 Mantenimiento'
            : v.estado === 'reserva'
              ? '⛽ En reserva'
              : '✅ En base'
      informe += `• **${v.marca} ${v.linea}** (${v.placa || 'Sin placa'}): ${estadoOp} · Tanque ${v.nivelCombustiblePorc}% (${estadoTanque}) · Odómetro: ${v.kilometrajeActual.toLocaleString('es-CO')} km · Llantas: ${v.desgasteLlantasPorc}%\n`
    })
  }

  informe += `\n📡 **Radar Vigente (${alertasVigentes.length} alertas activas)**:\n`
  if (alertasVigentes.length === 0) {
    informe += `• Sin contingencias activas en este momento.\n`
  } else {
    alertasVigentes.slice(0, 4).forEach((ev) => {
      informe += `• ${ev.esNoticiaWebReal ? '✓ [Web]' : '📻 [Veredal]'} **${ev.titulo}** (${ev.lugar})\n`
    })
  }

  informe += `\n🏔️ **Misiones de Hoy y Activas**:\n`
  if (
    misionesEnCurso.length === 0 &&
    misionesProgramadasHoy.length === 0 &&
    misionesCompletadas.length === 0
  ) {
    informe += `• Sin salidas registradas hoy. Flota en guardia preventiva.\n`
  } else {
    if (misionesEnCurso.length > 0) {
      informe += `• 🚨 **En Curso**: ${misionesEnCurso.map((m) => m.titulo).join('; ')}\n`
    }
    if (misionesProgramadasHoy.length > 0) {
      informe += `• 🗓️ **Programadas Hoy**: ${misionesProgramadasHoy.map((m) => `${m.titulo}${m.horaInicio ? ` (${m.horaInicio})` : ''}`).join('; ')}\n`
    }
    if (misionesCompletadas.length > 0) {
      informe += `• 🏁 **Cerradas**: ${misionesCompletadas.map((m) => `${m.titulo} (${m.distanciaKmIdaYVuelta} km)`).join('; ')}\n`
    }
  }

  informe += `\n❤️ *Bear's Reserve: 0% ánimo de lucro, 100% servicio comunitario.*`
  return informe
}

/**
 * Motor local de respaldo para Radio Gema (solo cuando Gemini no está disponible).
 * Orden de prioridades corregido: "rotar" tiene prioridad sobre "turno",
 * normaliza acentos y soporta tanqueo local, alertas viales, precios, rutas y crónicas.
 */
export function responderGema(
  mensaje: string,
  contexto: {
    empleados: EmpleadoOperativo[]
    vehiculos: VehiculoOperativo[]
    turnos: TurnoSemanal[]
    misiones: MisionComunitaria[]
    eventosRadar?: EventoRadarLocal[]
    rutasHabituales?: RutaHabitual[]
    preciosCombustible?: PreciosCombustible
  }
): {
  respuesta: string
  accion?:
    | { tipo: 'rotar_turnos' }
    | { tipo: 'tanquear_vehiculo'; vehiculoId: string }
    | { tipo: 'generar_informe' }
    | { tipo: 'escanear_radar' }
    | { tipo: 'actualizar_precios' }
} {
  const q = normalizarTextoSimple(mensaje)

  // 1. Rotación de turnos (ANTES de la consulta general de "turno")
  if (
    q.includes('rotar') ||
    q.includes('reorganizar') ||
    q.includes('organizar turnos') ||
    q.includes('cuadrar turnos') ||
    q.includes('nueva semana')
  ) {
    return {
      respuesta: `💎 ¡Listo! Estoy rotando el cuadrante 24/7 para esta semana respetando el tope de 42 horas y los horarios personales de cada colaborador activo. 🐻✨`,
      accion: { tipo: 'rotar_turnos' },
    }
  }

  // 2. Tanquear vehículo explícito en modo respaldo local
  if (
    /\b(tanquear|tanquea|llenar tanque|recargar combustible|poner gasolina|poner diesel|poner acpm)\b/.test(
      q
    )
  ) {
    const habilitados = contexto.vehiculos.filter(
      (v) => v.disponibleParaTrabajo && v.estado !== 'mantenimiento'
    )
    const coincidente = habilitados.find((v) => {
      const placa = normalizarTextoSimple(v.placa || '')
      const marca = normalizarTextoSimple(v.marca)
      const linea = normalizarTextoSimple(v.linea)
      return (
        (placa.length >= 3 && q.includes(placa)) ||
        (linea.length >= 3 && q.includes(linea)) ||
        (marca.length >= 3 && q.includes(marca))
      )
    })
    if (coincidente) {
      return {
        respuesta: `⛽ Solicitando tanqueo al 100% para **${coincidente.marca} ${coincidente.linea}**${coincidente.placa ? ` (${coincidente.placa})` : ''} y cargando el consumo a la tarjeta mensual.`,
        accion: { tipo: 'tanquear_vehiculo', vehiculoId: coincidente.id },
      }
    }
    return {
      respuesta: `⛽ Indícame la placa o el modelo del vehículo habilitado que deseas tanquear (flota habilitada: ${habilitados.map((v) => `${v.marca} ${v.linea}${v.placa ? ` (${v.placa})` : ''}`).join(', ') || 'ninguno'}).`,
    }
  }

  // 3. Informe diario
  if (q.includes('informe') || q.includes('reporte') || q.includes('resumen') || q.includes('novedades')) {
    return {
      respuesta: generarInformeDiarioOperaciones(contexto),
      accion: { tipo: 'generar_informe' },
    }
  }

  // 4. Alertas viales / radar / noticias
  if (
    q.includes('alerta') ||
    q.includes('radar') ||
    q.includes('vial') ||
    /\bvia\b/.test(q) ||
    q.includes('noticia') ||
    q.includes('emergencia') ||
    q.includes('derrumbe') ||
    q.includes('escanear')
  ) {
    const vigentes = filtrarEventosRadarVigentes(contexto.eventosRadar || [])
    if (q.includes('escanear') || q.includes('actualizar radar')) {
      return {
        respuesta: `📡 Sintonizando frecuencias y buscando alertas viales recientes en Caldas y el Eje Cafetero...`,
        accion: { tipo: 'escanear_radar' },
      }
    }
    if (vigentes.length === 0) {
      return {
        respuesta: `📡 En este momento el radar no tiene alertas vigentes en Caldas ni municipios vecinos. Si quieres, dime **"escanear radar"** para buscar novedades en vivo.`,
      }
    }
    const lista = vigentes
      .map(
        (ev) =>
          `• ${ev.esNoticiaWebReal ? '✓ **Noticia Web**' : '📻 **Llamada Veredal**'}: **${ev.titulo}** — *${ev.lugar}* (${ev.departamento})`
      )
      .join('\n')
    return {
      respuesta: `🚨 **Alertas vigentes en el Radar (${vigentes.length}):**\n\n${lista}\n\nTodas caducan automáticamente tras 1–2 días para mantener el tablero al día.`,
    }
  }

  // 5. Consulta de turnos / guardia hoy
  if (
    q.includes('quien esta') ||
    q.includes('trabajando') ||
    q.includes('guardia') ||
    q.includes('turno')
  ) {
    const hoy = hoyISO()
    const turnosHoy = contexto.turnos.filter((t) => t.fecha === hoy)
    const horasPorEmp = new Map<string, number>()
    for (const t of contexto.turnos) {
      horasPorEmp.set(t.empleadoId, (horasPorEmp.get(t.empleadoId) || 0) + t.horas)
    }

    let detalleTurnos = ''
    if (turnosHoy.length) {
      detalleTurnos = turnosHoy
        .map(
          (t) =>
            `• 👤 **${t.empleadoNombre}**: ${t.horaInicio} a ${t.horaFin} — *${t.rolGuardia}*`
        )
        .join('\n')
    } else {
      detalleTurnos = contexto.empleados
        .filter((e) => e.activo)
        .map(
          (e) =>
            `• 👤 **${e.nombreCompleto}** (${e.cargo}): ${horasPorEmp.get(e.id) || 0}/${e.maxHorasSemanales || 42}h asignadas`
        )
        .join('\n')
    }

    const excedidos = contexto.empleados.filter(
      (e) => e.activo && (horasPorEmp.get(e.id) || 0) > (e.maxHorasSemanales || 42)
    )
    const notaTope =
      excedidos.length > 0
        ? `⚠️ Atención: ${excedidos.map((e) => `${e.nombreCompleto} (${horasPorEmp.get(e.id)}h)`).join(', ')} supera(n) su tope semanal.`
        : '💎 Ningún colaborador supera las 42 horas semanales.'

    return {
      respuesta: `🐻 **Estado de guardia para hoy (${hoy}):**\n\n${detalleTurnos || '• No hay personal activo en Bear\'s Reserve.'}\n\n${notaTope}`,
    }
  }

  // 6. Consulta de precios / flota / combustible / llantas
  if (
    q.includes('precio') ||
    q.includes('combustible') ||
    q.includes('gasolina') ||
    q.includes('diesel') ||
    q.includes('acpm') ||
    q.includes('tanque') ||
    q.includes('llantas') ||
    q.includes('flota')
  ) {
    if (q.includes('actualizar precio')) {
      return {
        respuesta: `⛽ Consultando precios vigentes de combustible en Colombia...`,
        accion: { tipo: 'actualizar_precios' },
      }
    }
    const habilitados = contexto.vehiculos.filter((v) => v.disponibleParaTrabajo)
    const detalleFlota = habilitados.length
      ? habilitados
          .map((v) => {
            const alertaReserva =
              v.nivelCombustiblePorc <= UMBRAL_RESERVA_COMBUSTIBLE_PORC ? ' ⚠️ (En reserva)' : ''
            const estadoOp =
              v.estado === 'en_mision'
                ? ' [EN MISIÓN]'
                : v.estado === 'mantenimiento'
                  ? ' [MANTENIMIENTO]'
                  : ''
            return `• 🚚 **${v.marca} ${v.linea}** (${v.placa || 'Sin placa'})${estadoOp}: Tanque **${v.nivelCombustiblePorc}%** (${v.capacidadTanqueGalones} gal ${v.tipoCombustible.toUpperCase()}) · Odómetro: **${v.kilometrajeActual.toLocaleString('es-CO')} km** · Llantas: **${v.desgasteLlantasPorc}%**${alertaReserva}`
          })
          .join('\n')
      : '• Aún no tienes vehículos habilitados en la pestaña Flota.'

    const preciosLinea = contexto.preciosCombustible
      ? `\n\n⛽ **Precios de referencia (${contexto.preciosCombustible.fuente}):** Corriente $${contexto.preciosCombustible.corrientePorGalon.toLocaleString('es-CO')} · ACPM $${contexto.preciosCombustible.dieselPorGalon.toLocaleString('es-CO')} · Extra $${contexto.preciosCombustible.extraPorGalon.toLocaleString('es-CO')}`
      : ''

    return {
      respuesta: `🏔️ **Estado de la flota Bear's Reserve:**\n\n${detalleFlota}${preciosLinea}`,
    }
  }

  // 7. Rutas habituales / escolares / crónicas
  if (q.includes('ruta') || q.includes('escolar') || q.includes('mercado')) {
    const rutas = contexto.rutasHabituales || []
    const hoy = hoyISO()
    const detalle = rutas
      .map((r) => {
        const cond = conductorDeRutaEnCuadrante(contexto.turnos, r.id, hoy, r.tipoHorario)
        return `• 🛣️ **${r.nombre}** (${r.distanciaKm} km · ${r.horaSalida || 'Flexible'}) — Conductor hoy: **${cond ? cond.nombre : 'Sin turno hoy'}**`
      })
      .join('\n')
    return {
      respuesta: `🚌 **Rutas Habituales de Bear's Reserve:**\n\n${detalle || '• Sin rutas configuradas.'}`,
    }
  }

  // 8. Saludo o consulta general
  return {
    respuesta: `💎 ¡Hola! Soy **Gema**, oficial de operaciones de **Bear's Reserve** 🐻.\n\nPuedo ayudarte en tiempo real con:\n• 📋 **Informe diario** de operaciones y novedades.\n• 📅 **Guardia de hoy y rotación de turnos** (tope 42h).\n• 🚨 **Alertas viales y radar** de Caldas y la región.\n• ⛽ **Estado de flota, combustible, llantas y precios** (o dime "tanquear <vehículo>").\n• 🚌 **Rutas escolares y habituales** con sus conductores.\n\n*(Modo respaldo local activo mientras Gemini responde).*`,
  }
}
