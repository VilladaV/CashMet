import { hoyISO, isoLocal } from '@/lib/fechas'
import { resolverCoordenadasLugar } from './geo'
import { TTL_LLAMADA_COMUNITARIA_MS } from './gemaAI'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  PreciosCombustible,
  RutaHabitual,
  TipoCombustible,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

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
 * - Desvare → mecánico. Barrizal/volcamiento/derrumbe → operador de winche.
 * - Accidente/herido → primeros auxilios. Trasteo/ayudas → apoyo logístico.
 */
export function seleccionarTripulacionMision(
  mision: { titulo: string; tipo: string; impactoSocial?: string },
  vehiculosElegidos: VehiculoOperativo[],
  empleados: EmpleadoOperativo[],
  turnos: TurnoSemanal[],
  fechaISO: string,
  horaHHMM: string
): { tripulacion: Array<{ id: string; nombre: string; rol: string }>; motivo: string } {
  const texto = `${mision.titulo} ${mision.tipo} ${mision.impactoSocial || ''}`.toLowerCase()
  const incluye = (...ps: string[]) => ps.some((p) => texto.includes(p))

  const roles: Array<{ rol: RolMision; etiqueta: string }> = []
  for (const v of vehiculosElegidos) {
    const corpusV = `${v.marca} ${v.linea} ${v.tipo} ${v.carroceria || ''} ${v.notasCashmet || ''}`.toLowerCase()
    const pesado =
      v.tipo === 'camion' ||
      /camion|camión|tractomula|kodiak|volqueta|5ta rueda|quinta rueda|\bbus\b/.test(corpusV)
    roles.push({
      rol: pesado ? 'conductor_pesado' : 'conductor',
      etiqueta: `Conductor ${v.marca} ${v.linea}`,
    })
  }
  if (roles.length === 0) roles.push({ rol: 'conductor', etiqueta: 'Conductor' })
  if (incluye('desvar', 'varad', 'mecán', 'mecan', 'motor', 'llanta', 'pinch', 'batería', 'bateria'))
    roles.push({ rol: 'mecanico', etiqueta: 'Mecánico' })
  if (incluye('barrizal', 'barro', 'atasc', 'atrapad', 'volc', 'derrumbe', 'remolc', 'winche', 'zanja'))
    roles.push({ rol: 'winche', etiqueta: 'Operador de winche' })
  if (incluye('herid', 'accidente', 'lesion', 'lesión', 'enferm', 'parto', 'mordedura', 'adulto mayor'))
    roles.push({ rol: 'auxilios', etiqueta: 'Primeros auxilios' })
  if (incluye('trasteo', 'mudanza', 'mercado', 'ayudas', 'víveres', 'viveres', 'carga', 'tejas', 'donaci'))
    roles.push({ rol: 'logistica', etiqueta: 'Apoyo de carga' })

  // Pool: guardia activa en ese momento → fallback a empleados activos sin restricción horaria
  let pool = empleadosEnTurnoAhora(turnos, empleados, fechaISO, horaHHMM)
  let fuente = 'de guardia según el cuadrante'
  if (pool.length === 0) {
    // Convención JS: 0=Dom, 1=Lun, ..., 6=Sab (consistente con HorarioPersonalEmpleado)
    const [y, m, d] = fechaISO.split('-').map(Number)
    const diaSemana = new Date(y, m - 1, d, 12, 0, 0).getDay()
    const minActual = horaAMinutos(horaHHMM)
    pool = empleados.filter(
      (e) =>
        e.activo &&
        !e.horariosNoDisponibles.some((h) => {
          if (h.diaSemana !== diaSemana) return false
          const hi = horaAMinutos(h.horaInicio)
          const hf = horaAMinutos(h.horaFin, true)
          return hi <= minActual && minActual < hf
        })
    )
    fuente = 'disponibles (sin guardia específica en esa hora)'
  }

  const usados = new Set<string>()
  const tripulacion: Array<{ id: string; nombre: string; rol: string }> = []
  const faltantes: string[] = []

  for (const r of roles) {
    const candidatos = pool
      .filter((e) => !usados.has(e.id))
      .map((e) => ({
        e,
        score:
          afinidadRol(e, r.rol) * 10 +
          (r.rol === 'conductor_pesado' ? afinidadRol(e, 'conductor') * 3 : 0),
      }))
      .sort((a, b) => b.score - a.score)

    const elegido =
      candidatos.find((c) => c.score > 0) ||
      (r.rol === 'conductor' || r.rol === 'conductor_pesado' ? candidatos[0] : undefined)

    if (elegido) {
      usados.add(elegido.e.id)
      tripulacion.push({ id: elegido.e.id, nombre: elegido.e.nombreCompleto, rol: r.etiqueta })
    } else {
      faltantes.push(r.etiqueta)
    }
  }

  if (!tripulacion.some((t) => t.rol.startsWith('Conductor'))) {
    tripulacion.unshift({
      id: 'coord-user',
      nombre: 'Tú (Coordinador General)',
      rol: 'Conductor (respaldo)',
    })
  }

  let motivo = `Tripulación de ${tripulacion.length}: ${tripulacion.map((t) => `${t.nombre} (${t.rol})`).join(', ')}. Personal ${fuente}.`
  if (faltantes.length > 0) {
    motivo += ` Sin personal en turno para: ${faltantes.join(', ')} — salen sin ese apoyo.`
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

  return null
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

  // 0. Capacidad explícita declarada en notas de CashMet
  const matchGal = corpus.match(/tanque(?:\s+de)?\s+(\d+(?:\.\d+)?)\s*(?:gal|galones)\b/)
  const matchLitros = corpus.match(/tanque(?:\s+de)?\s+(\d+(?:\.\d+)?)\s*(?:l|litros|lt)\b/)

  const detectarCombustibleEnNotas = (): TipoCombustible | null => {
    if (/\b(diesel|diésel|acpm)\b/.test(n)) return 'diesel'
    if (/\b(extra|premium|98\s*oct)\b/.test(n)) return 'extra'
    if (/\b(corriente|gasolina)\b/.test(n)) return 'corriente'
    return null
  }
  const combNotas = detectarCombustibleEnNotas()

  if (matchGal && Number(matchGal[1]) >= 2 && Number(matchGal[1]) <= 600) {
    const gal = Number(matchGal[1])
    const lit = Number((gal * 3.78541).toFixed(1))
    const esDiesel =
      combNotas === 'diesel' ||
      (!combNotas &&
        (t === 'camion' ||
          /\b(diesel|acpm|camion|camión|kraz|kamaz|gaz|kenworth|scania|volvo|isuzu|hino)\b/.test(corpus)))
    const tipoComb: TipoCombustible = combNotas ?? (esDiesel ? 'diesel' : 'corriente')
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: gal > 100 ? 6.5 : gal > 50 ? 9.5 : 22,
      tipoCombustible: tipoComb,
      fichaInvestigadaNota: `Catálogo técnico (notas CashMet): Tanque ${gal} gal (${lit} L). Combustible: ${tipoComb.toUpperCase()}.`,
    }
  } else if (matchLitros && Number(matchLitros[1]) >= 8 && Number(matchLitros[1]) <= 2200) {
    const lit = Number(matchLitros[1])
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
      consumoKmPorGalon: gal > 100 ? 6.5 : gal > 50 ? 9.5 : 22,
      tipoCombustible: tipoComb,
      fichaInvestigadaNota: `Catálogo técnico (notas CashMet): Tanque ${lit} L (${gal} gal). Combustible: ${tipoComb.toUpperCase()}.`,
    }
  }

  // 1. Motocicletas
  if (
    t === 'moto' ||
    /\bmoto(cicleta)?\b/.test(corpus) ||
    /\b(xtz|dr\s*\d+|pulsar|boxer|xr\s*\d+|v-?strom|akt|nkd|fz|mt-?0|cb\s*\d+)\b/.test(l)
  ) {
    const esAltoCilindraje = /\b(600|650|700|800|900|1000|1200|1250)\b/.test(corpus)
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

  // 23. Vans y Transporte Colectivo
  if (/\b(sprinter|master|transit|urvan|hiace)\b/.test(l)) {
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
  const tipoComb: TipoCombustible =
    combNotas ?? (esPesado || esCamionMediano || esPickupOCampero ? 'diesel' : 'corriente')
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
 * Inteligencia de Selección y Asignación de Vehículos para Misiones 🧠🚚
 */
export function seleccionarVehiculosOptimosMision(
  mision: { titulo: string; tipo: string; impactoSocial?: string; terreno?: string },
  vehiculosDisponibles: VehiculoOperativo[]
): {
  vehiculoElegido: VehiculoOperativo
  motivoGema: string
  candidatosSecundarios: VehiculoOperativo[]
} {
  const aptosLibres = vehiculosDisponibles.filter(
    (v) => v.disponibleParaTrabajo && v.estado !== 'en_mision' && v.estado !== 'mantenimiento' && v.nivelCombustiblePorc > 15
  )
  const aptos =
    aptosLibres.length > 0
      ? aptosLibres
      : vehiculosDisponibles.filter((v) => v.disponibleParaTrabajo && v.estado !== 'mantenimiento')
  const pool = aptos.length > 0 ? aptos : vehiculosDisponibles

  const textoMision =
    `${mision.titulo} ${mision.tipo} ${mision.impactoSocial || ''} ${mision.terreno || ''}`.toLowerCase()

  const requierePasajeros =
    textoMision.includes('escolar') ||
    textoMision.includes('niños') ||
    textoMision.includes('colegio') ||
    textoMision.includes('estudiantes') ||
    textoMision.includes('familia')

  const requiere4x4ORescate =
    textoMision.includes('barrizal') ||
    textoMision.includes('lodo') ||
    textoMision.includes('atasco') ||
    textoMision.includes('camión') ||
    textoMision.includes('winche') ||
    textoMision.includes('remolque') ||
    textoMision.includes('derrumbe') ||
    textoMision.includes('extrema')

  const requiereCargaPesada =
    textoMision.includes('trasteo') ||
    textoMision.includes('mudanza') ||
    textoMision.includes('leche') ||
    textoMision.includes('ganado') ||
    textoMision.includes('mercado') ||
    textoMision.includes('tejas')

  const puntuados = pool.map((v) => {
    let score = 0
    const corpusV =
      `${v.marca} ${v.linea} ${v.tipo} ${v.carroceria || ''} ${v.notasCashmet || ''} ${v.capacidadTexto || ''}`.toLowerCase()

    const tiene4x4 =
      corpusV.includes('4x4') ||
      corpusV.includes('6x6') ||
      corpusV.includes('winche') ||
      corpusV.includes('trocha') ||
      corpusV.includes('land cruiser') ||
      corpusV.includes('hilux')
    const tienePasajeros =
      corpusV.includes('bus') ||
      corpusV.includes('buseta') ||
      corpusV.includes('van') ||
      corpusV.includes('pasajero') ||
      corpusV.includes('escolar') ||
      corpusV.includes('troop carrier') ||
      corpusV.includes('kavz')
    const tienePesado =
      corpusV.includes('quinta rueda') ||
      corpusV.includes('5ta rueda') ||
      corpusV.includes('tractomula') ||
      corpusV.includes('kodiak') ||
      corpusV.includes('camion') ||
      v.tipo === 'camion'

    if (requierePasajeros && tienePasajeros) score += 50
    if (requiere4x4ORescate && tiene4x4) score += 60
    if (requiereCargaPesada && tienePesado) score += 40
    if (v.estado === 'en_mision') score -= 40

    score += (v.nivelCombustiblePorc || 50) * 0.1
    return { vehiculo: v, score, tiene4x4, tienePasajeros, tienePesado }
  })

  puntuados.sort((a, b) => b.score - a.score)
  const mejor = puntuados[0]?.vehiculo || pool[0]

  let motivo = `Gema seleccionó ${mejor.marca} ${mejor.linea}`
  if (requierePasajeros && (mejor.notasCashmet || '').toLowerCase().includes('pasajero')) {
    motivo += ` porque tus notas en CashMet indican capacidad de pasajeros, ideal para la ruta escolar.`
  } else if (requiere4x4ORescate && (mejor.notasCashmet || '').toLowerCase().includes('winche')) {
    motivo += ` porque tus notas en CashMet confirman winche y tracción para terrenos de alto barro.`
  } else if (requiereCargaPesada) {
    motivo += ` por su volumen de carga y torque para transporte campesino.`
  } else {
    motivo += ` por estar listo en base con tanque al ${mejor.nivelCombustiblePorc}%.`
  }

  return {
    vehiculoElegido: mejor,
    motivoGema: motivo,
    candidatosSecundarios: puntuados.slice(1, 4).map((p) => p.vehiculo),
  }
}

// ---------------------------------------------------------------------------
// RADAR CON CADUCIDAD REAL (1–2 DÍAS) Y POOL DE LLAMADAS VEREDALES FRESCAS
// ---------------------------------------------------------------------------

const MAX_ANTIGUEDAD_EVENTO_MS = 48 * 60 * 60 * 1000 // 2 días máximo

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
    if (e.id === 'rad-sim-6' || e.titulo.toLowerCase().includes('standby')) return false
    if (typeof e.expiraEn === 'number' && Number.isFinite(e.expiraEn)) {
      if (e.expiraEn <= ahora) return false
    }
    if (typeof e.creadoEn === 'number' && Number.isFinite(e.creadoEn)) {
      if (ahora - e.creadoEn > MAX_ANTIGUEDAD_EVENTO_MS) return false
    } else if (e.fecha && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) {
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

/**
 * Respaldo local (sin internet/Gemini) para generar llamadas comunitarias frescas con caducidad de ~28h.
 * NUNCA inventa `esNoticiaWebReal: true`.
 */
export function generarLlamadasComunitariasRespaldo(
  eventosActuales: EventoRadarLocal[],
  cantidad = 2,
  ahora = Date.now()
): EventoRadarLocal[] {
  const existentes = new Set(eventosActuales.map((e) => e.titulo.toLowerCase().trim()))
  const candidatos = POOL_LLAMADAS_COMUNITARIAS_RESPALDO.filter(
    (c) => !existentes.has(c.titulo.toLowerCase().trim())
  )
  const hoy = hoyISO()
  const elegidos: EventoRadarLocal[] = []

  const mezcla = [...candidatos].sort(() => Math.random() - 0.5)
  for (let i = 0; i < Math.min(cantidad, mezcla.length); i++) {
    const item = mezcla[i]
    elegidos.push({
      ...item,
      id: `rad-com-${ahora}-${i}`,
      fecha: hoy,
      creadoEn: ahora,
      expiraEn: ahora + TTL_LLAMADA_COMUNITARIA_MS,
      esNoticiaWebReal: false,
    })
  }

  if (elegidos.length === 0 && cantidad > 0) {
    const coords = resolverCoordenadasLugar('Vereda San Peregrino', 'Caldas')
    elegidos.push({
      id: `rad-com-${ahora}`,
      titulo: `Solicitud veredal de apoyo vial en San Peregrino (#${String(ahora).slice(-3)})`,
      lugar: 'Vereda San Peregrino · Manizales',
      departamento: 'Caldas',
      lat: coords.lat,
      lng: coords.lng,
      fuenteNoticia: 'Radio frecuencia comunitaria Bear\'s Reserve',
      resumen: 'Vehículo rural con dificultad de paso en tramo destapado tras lluvias recientes.',
      fecha: hoy,
      creadoEn: ahora,
      expiraEn: ahora + TTL_LLAMADA_COMUNITARIA_MS,
      esEmergenciaGrave: false,
      atencionOficialPresente: false,
      esNoticiaWebReal: false,
      recomendacionGema: 'intervenir_urgente',
      justificacionGema: 'Evaluar despacho de unidad 4x4 desde Finca El Guadual.',
    })
  }

  return elegidos
}

/**
 * Compatibilidad: devuelve llamadas comunitarias frescas (sin noticias web falsas).
 */
export const EVENTOS_RADAR_PREDETERMINADOS: EventoRadarLocal[] =
  generarLlamadasComunitariasRespaldo([], 3)

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
  tripulantesNombres: string[]
): {
  resultado: 'exito' | 'parcial' | 'fallida_dificultad'
  factorDistanciaReal: number
  cronicaHistoria: string
} {
  // Rutas habituales (escolares / mercado) casi siempre concluyen con éxito
  if (mision.tipo === 'ruta_habitual') {
    const nombresVehs = vehiculosParticipantes.map((v) => `${v.marca} ${v.linea}`)
    return {
      resultado: 'exito',
      factorDistanciaReal: 1.0,
      cronicaHistoria: generarCronicaMisionNarrativa(mision, nombresVehs, tripulantesNombres, 'exito'),
    }
  }

  // Puntaje de idoneidad según terreno, equipo 4x4/winche, llantas y dificultad
  let riesgo = 0.08
  if (mision.terreno === 'trocha_extrema_barrizal') riesgo += 0.28
  else if (mision.terreno === 'trocha_moderada') riesgo += 0.1
  if (mision.prioridad === 'critica_extrema') riesgo += 0.12

  const tieneEquipoAdecuado = vehiculosParticipantes.some((v) => {
    const corpus = `${v.marca} ${v.linea} ${v.tipo} ${v.notasCashmet || ''}`.toLowerCase()
    return v.tipo === 'camion' || /4x4|6x6|winche|trocha|land cruiser|hilux|unimog/.test(corpus)
  })
  if (tieneEquipoAdecuado) riesgo -= 0.16
  else if (mision.terreno === 'trocha_extrema_barrizal') riesgo += 0.22

  const llantasCriticas = vehiculosParticipantes.some((v) => v.desgasteLlantasPorc >= 75)
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

  const nombresVehs = vehiculosParticipantes.map((v) => `${v.marca} ${v.linea}`)
  return {
    resultado,
    factorDistanciaReal,
    cronicaHistoria: generarCronicaMisionNarrativa(mision, nombresVehs, tripulantesNombres, resultado),
  }
}

export function generarCronicaMisionNarrativa(
  mision: MisionComunitaria,
  vehiculosNombres: string[],
  tripulantesNombres: string[],
  resultado: 'exito' | 'parcial' | 'fallida_dificultad' = 'exito'
): string {
  const duracionTexto =
    mision.duracionMinutos < 60
      ? `${mision.duracionMinutos} minutos`
      : `${(mision.duracionMinutos / 60).toFixed(1)} horas`

  const flotaTexto =
    vehiculosNombres.length > 0 ? vehiculosNombres.join(' y ') : 'vehículo de la reserva'
  const equipoTexto =
    tripulantesNombres.length > 0 ? tripulantesNombres.join(', ') : 'equipo de guardia'

  if (resultado === 'exito') {
    return (
      `Relato de Operaciones · Salida desde Finca El Guadual hacia ${mision.destino}. ` +
      `La operación duró ${duracionTexto} con un recorrido de ${mision.distanciaKmIdaYVuelta} km sobre ${mision.terreno.replace(/_/g, ' ')}. ` +
      `A cargo estuvieron ${equipoTexto}, empleando ${flotaTexto}. ` +
      `Se coordinó directamente con la comunidad en terreno y se completó el objetivo sin novedades mecánicas graves, retornando a base listos para el siguiente turno.`
    )
  }

  if (resultado === 'parcial') {
    return (
      `Bitácora de Intervención Compleja · Despliegue hacia ${mision.destino} (${duracionTexto}, ${mision.distanciaKmIdaYVuelta} km). ` +
      `Participaron ${equipoTexto} con ${flotaTexto}. El terreno presentó lodazal e inclinación exigente que requirió maniobras lentas y anclajes. ` +
      `Se aseguró y trasladó la carga principal a zona firme; el tramo final se coordinó con líderes veredales por riesgo de banca inestable. Equipo de vuelta en base sin lesionados.`
    )
  }

  return (
    `Reporte de Repliegue Táctico · Desplazamiento hacia ${mision.destino} durante ${duracionTexto}. ` +
    `La tripulación (${equipoTexto}) a bordo de ${flotaTexto} encontró condiciones críticas de derrumbe activo y piso inestable en la trocha. ` +
    `Priorizando la seguridad del personal y la integridad del vehículo, se suspendió el ingreso final, se entregó apoyo inmediato a pie a los vecinos del sector y se retornó con precaución a la base central.`
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

  const tieneConflictoHorario = (
    emp: EmpleadoOperativo,
    diaInfo: (typeof diasInfo)[number],
    franja: 'manana' | 'tarde' | 'noche'
  ): boolean => {
    return (emp.horariosNoDisponibles || []).some((h) => {
      const hIni = horaAMinutos(h.horaInicio)
      const hFin = horaAMinutos(h.horaFin, true)
      if (franja === 'noche') {
        const chocaNoche = h.diaSemana === diaInfo.diaSemanaRestriccion && hFin > 22 * 60
        const chocaMadrugada = h.diaSemana === diaInfo.diaSemanaSiguiente && hIni < 6 * 60
        return chocaNoche || chocaMadrugada
      }
      if (franja === 'manana') {
        return h.diaSemana === diaInfo.diaSemanaRestriccion && hIni < 14 * 60 && hFin > 6 * 60
      }
      return h.diaSemana === diaInfo.diaSemanaRestriccion && hIni < 22 * 60 && hFin > 14 * 60
    })
  }

  const puedeAsignarse = (
    emp: EmpleadoOperativo,
    d: number,
    franja: 'manana' | 'tarde' | 'noche',
    duracionHoras: number
  ): boolean => {
    const tope = Math.min(42, emp.maxHorasSemanales || 42)
    if ((horasAsignadas[emp.id] || 0) + duracionHoras > tope) return false
    if (diasOcupadosPorEmpleado[emp.id]?.has(d)) return false
    if (franja === 'manana' && d > 0 && nocheTrabajadaPorDia[d - 1]?.has(emp.id)) return false
    if (tieneConflictoHorario(emp, diasInfo[d], franja)) return false
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

  // =========================================================================
  // FASE 1: CONDUCTORES TRONCALES Y RUTAS HABITUALES (21 franjas L-D)
  // =========================================================================
  for (const diaInfo of diasInfo) {
    const { d, nombreDia, diaSemanaRestriccion } = diaInfo
    const rutaManana = buscarRutaParaFranja(diaSemanaRestriccion, 'manana')
    const rutaTarde = buscarRutaParaFranja(diaSemanaRestriccion, 'tarde')

    const rutaMananaId =
      rutaManana?.id ??
      (d <= 4 ? 'rut-escolar-manana' : d === 5 ? 'rut-mercado-campesino' : undefined)
    const rutaTardeId = rutaTarde?.id ?? (d <= 4 ? 'rut-escolar-tarde' : undefined)

    const horaMananaIni = rutaManana?.horaSalida === '05:30' ? '05:30' : '06:00'
    const horaMananaFin = horaMananaIni === '05:30' ? '13:30' : '14:00'

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
          : d <= 4
            ? `🚌 Conducción Ruta Escolar Matutina 06:00 + Guardia Base (${nombreDia})`
            : d === 5
              ? `🧺 Conducción Ruta Solidaria Mercado Campesino 05:30 + Guardia Base (${nombreDia})`
              : `🚗 Conductor de Guardia Matutina & Base Central (${nombreDia})`,
        rutaHabitualId: rutaMananaId,
        idSufijo: 'cond-ruta',
      },
      {
        franja: 'tarde',
        horaInicio: '14:00',
        horaFin: '22:00',
        horas: 8,
        rol: rutaTarde
          ? `🚌 Conducción ${rutaTarde.nombre} (${rutaTarde.horaSalida || '15:00'}) + Guardia Base (${nombreDia})`
          : d <= 4
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
      // Prioriza quienes tienen afinidad de conductor; si no hay ninguno libre, acepta cualquier activo disponible
      const disponibles = poolRotado.filter((emp) => puedeAsignarse(emp, d, fc.franja, fc.horas))
      const conAfinidad = disponibles.filter((emp) => afinidadConductor(emp) > 0)
      const candidatos = (conAfinidad.length > 0 ? conAfinidad : disponibles).sort((a, b) => {
        const hA = horasAsignadas[a.id] || 0
        const hB = horasAsignadas[b.id] || 0
        if (hA !== hB) return hA - hB
        return afinidadConductor(b) - afinidadConductor(a)
      })

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
    const { d, nombreDia } = diaInfo

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
        horaInicio: '14:00',
        horaFin: '22:00',
        horas: 8,
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
      const disponibles = poolRotado.filter((emp) => puedeAsignarse(emp, d, fm.franja, fm.horas))
      const conAfinidad = disponibles.filter((emp) => afinidadMecanico(emp) > 0)
      const candidatos = (conAfinidad.length > 0 ? conAfinidad : disponibles).sort((a, b) => {
        const hA = horasAsignadas[a.id] || 0
        const hB = horasAsignadas[b.id] || 0
        if (hA !== hB) return hA - hB
        return afinidadMecanico(b) - afinidadMecanico(a)
      })

      if (candidatos[0]) {
        const esMec = afinidadMecanico(candidatos[0]) > 0
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
    const pendientes = poolRotado
      .filter((e) => (turnosPorEmpleado[e.id] || 0) < 5 && (horasAsignadas[e.id] || 0) <= 34)
      .sort((a, b) => (horasAsignadas[a.id] || 0) - (horasAsignadas[b.id] || 0))

    if (pendientes.length === 0) break

    let progresoEnCiclo = false
    for (const emp of pendientes) {
      let asignado = false
      const esCond = afinidadConductor(emp) > 0
      const esMec = afinidadMecanico(emp) > 0

      for (const franja of ['manana', 'tarde', 'noche'] as const) {
        for (const diaInfo of diasInfo) {
          const { d, nombreDia } = diaInfo
          if (!puedeAsignarse(emp, d, franja, 8)) continue

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

          asignarTurno(
            emp,
            d,
            franja,
            franja === 'manana' ? '06:00' : franja === 'tarde' ? '14:00' : '22:00',
            franja === 'manana' ? '14:00' : franja === 'tarde' ? '22:00' : '06:00',
            8,
            rolTexto,
            `apoyo-${d}`
          )
          asignado = true
          progresoEnCiclo = true
          break
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
  const misionesEnCurso = misionesHoy.filter((m) => m.estado === 'en_curso')
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
      const estadoTanque = v.nivelCombustiblePorc <= 20 ? '⚠️ En reserva' : '✅ Óptimo'
      const estadoOp = v.estado === 'en_mision' ? '🚨 En misión' : 'En base'
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

  informe += `\n🏔️ **Misiones de Hoy**:\n`
  if (misionesHoy.length === 0) {
    informe += `• Sin salidas registradas hoy. Flota en guardia preventiva.\n`
  } else {
    if (misionesEnCurso.length > 0) {
      informe += `• 🚨 **En Curso**: ${misionesEnCurso.map((m) => m.titulo).join('; ')}\n`
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
 * y responde también alertas viales, precios, rutas y crónicas.
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
  const q = mensaje.toLowerCase().trim()

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

  // 2. Informe diario
  if (q.includes('informe') || q.includes('reporte') || q.includes('resumen') || q.includes('novedades')) {
    return {
      respuesta: generarInformeDiarioOperaciones(contexto),
      accion: { tipo: 'generar_informe' },
    }
  }

  // 3. Alertas viales / radar / noticias
  if (
    q.includes('alerta') ||
    q.includes('radar') ||
    q.includes('vial') ||
    q.includes('vía') ||
    q.includes('via ') ||
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

  // 4. Consulta de turnos / guardia hoy
  if (
    q.includes('quién está') ||
    q.includes('quien esta') ||
    q.includes('trabajando') ||
    q.includes('guardia') ||
    q.includes('turno')
  ) {
    const hoy = hoyISO()
    const turnosHoy = contexto.turnos.filter((t) => t.fecha === hoy)
    let detalleTurnos = ''
    if (turnosHoy.length) {
      detalleTurnos = turnosHoy
        .map(
          (t) =>
            `• 👤 **${t.empleadoNombre}**: ${t.horaInicio} a ${t.horaFin} — *${t.rolGuardia}*`
        )
        .join('\n')
    } else {
      const horasPorEmp = new Map<string, number>()
      for (const t of contexto.turnos) {
        horasPorEmp.set(t.empleadoId, (horasPorEmp.get(t.empleadoId) || 0) + t.horas)
      }
      detalleTurnos = contexto.empleados
        .filter((e) => e.activo)
        .map(
          (e) =>
            `• 👤 **${e.nombreCompleto}** (${e.cargo}): ${horasPorEmp.get(e.id) || 0}/42h asignadas`
        )
        .join('\n')
    }

    return {
      respuesta: `🐻 **Estado de guardia para hoy (${hoy}):**\n\n${detalleTurnos || '• No hay personal activo en Bear\'s Reserve.'}\n\n💎 Ningún colaborador supera las 42 horas semanales.`,
    }
  }

  // 5. Consulta de precios / flota / combustible / llantas
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
            const alertaReserva = v.nivelCombustiblePorc <= 20 ? ' ⚠️ (En reserva)' : ''
            const estadoOp = v.estado === 'en_mision' ? ' [EN MISIÓN]' : ''
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

  // 6. Rutas habituales / escolares / crónicas
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

  // 7. Saludo o consulta general
  return {
    respuesta: `💎 ¡Hola! Soy **Gema**, oficial de operaciones de **Bear's Reserve** 🐻.\n\nPuedo ayudarte en tiempo real con:\n• 📋 **Informe diario** de operaciones y novedades.\n• 📅 **Guardia de hoy y rotación de turnos** (tope 42h).\n• 🚨 **Alertas viales y radar** de Caldas y la región.\n• ⛽ **Estado de flota, combustible, llantas y precios**.\n• 🚌 **Rutas escolares y habituales** con sus conductores.\n\n*(Modo respaldo local activo mientras Gemini responde).*`,
  }
}
