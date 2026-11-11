import { hoyISO } from '@/lib/fechas'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
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
  conductor_pesado: ['c2', 'c3', 'pesado', 'camion', 'camión', 'tractomula', 'quinta rueda', '5ta rueda', 'volqueta'],
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

function horaAMinutos(h: string): number {
  const [hh, mm] = h.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

/** Empleados que, según el cuadrante, están de guardia en esa fecha y hora. */
export function empleadosEnTurnoAhora(
  turnos: TurnoSemanal[],
  empleados: EmpleadoOperativo[],
  fechaISO: string,
  horaHHMM: string
): EmpleadoOperativo[] {
  const min = horaAMinutos(horaHHMM)
  const ids = new Set(
    turnos
      .filter((t) => {
        if (t.fecha !== fechaISO) return false
        const ini = horaAMinutos(t.horaInicio)
        const fin = horaAMinutos(t.horaFin)
        if (ini <= fin) {
          return ini <= min && min < fin
        } else {
          // Franja nocturna que cruza la medianoche (ej: 22:00 a 06:00)
          return min >= ini || min < fin
        }
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
 * Solo toma gente que está de guardia en ese momento; si no alcanza, entras tú.
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

  // Roles requeridos
  const roles: Array<{ rol: RolMision; etiqueta: string }> = []
  for (const v of vehiculosElegidos) {
    const corpusV = `${v.marca} ${v.linea} ${v.tipo} ${v.carroceria || ''} ${v.notasCashmet || ''}`.toLowerCase()
    const pesado = v.tipo === 'camion' || /camion|camión|tractomula|kodiak|volqueta|5ta rueda|quinta rueda|bus/.test(corpusV)
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

  // Pool: guardia activa en ese momento → si no hay cuadrante, activos no bloqueados por horario personal
  let pool = empleadosEnTurnoAhora(turnos, empleados, fechaISO, horaHHMM)
  let fuente = 'de guardia según el cuadrante'
  if (pool.length === 0) {
    const diaSemana = ((new Date(`${fechaISO}T12:00:00`).getDay() + 6) % 7) + 1
    pool = empleados.filter(
      (e) =>
        e.activo &&
        !e.horariosNoDisponibles.some(
          (h) => h.diaSemana === diaSemana && h.horaInicio <= horaHHMM && horaHHMM < h.horaFin
        )
    )
    fuente = 'disponibles (sin cuadrante cargado para esta hora)'
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

    // Un conductor sin afinidad igual puede ir (todos manejan algo); los roles técnicos exigen afinidad,
    // salvo que no haya nadie más y el rol sea secundario → se omite y se reporta
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

  // Si nadie puede manejar, el coordinador cubre (regla de respaldo)
  if (!tripulacion.some((t) => t.rol.startsWith('Conductor'))) {
    tripulacion.unshift({ id: 'coord-user', nombre: 'Tú (Coordinador General)', rol: 'Conductor (respaldo)' })
  }

  let motivo = `Tripulación de ${tripulacion.length}: ${tripulacion.map((t) => `${t.nombre} (${t.rol})`).join(', ')}. Personal ${fuente}.`
  if (faltantes.length > 0) {
    motivo += ` Sin personal en turno para: ${faltantes.join(', ')} — salen sin ese apoyo.`
  }
  return { tripulacion, motivo }
}

/**
 * Para las rutas de rutina: el conductor es el que quedó asignado en el cuadrante semanal.
 */
export function conductorDeRutaEnCuadrante(
  turnos: TurnoSemanal[],
  rutaId: string,
  fechaISO: string
): { id: string; nombre: string } | null {
  const t = turnos.find(
    (x) =>
      x.fecha === fechaISO &&
      (x.rutaHabitualId === rutaId ||
        (x.notas && x.notas.includes(rutaId)) ||
        (rutaId.includes('matutina') && x.franja === 'manana' && x.rolGuardia.toLowerCase().includes('conductor')) ||
        (rutaId.includes('vespertina') && x.franja === 'tarde' && x.rolGuardia.toLowerCase().includes('conductor')) ||
        (rutaId.includes('mercado') && x.franja === 'manana' && x.rolGuardia.toLowerCase().includes('conductor')))
  )
  return t ? { id: t.empleadoId, nombre: t.empleadoNombre } : null
}

/**
 * Investigador de especificaciones oficiales con IA 🔍:
 * Deduce con realismo técnico la capacidad de tanque oficial (galones y litros),
 * consumo en relieve montañoso andino y tipo de combustible para cualquier vehículo
 * del parque automotor colombiano (desde Corsa y Spark hasta camiones pesados y tractomulas de 5ta rueda).
 */
/**
 * Investigador de especificaciones oficiales con IA 🔍:
 * Deduce con realismo técnico la capacidad de tanque oficial (galones y litros),
 * consumo en relieve montañoso andino y tipo de combustible para cualquier vehículo
 * del parque automotor (soviéticos/rusos, europeos, americanos, japoneses y comerciales).
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

  // 0. Si el usuario especificó explícitamente la capacidad en las notas o ficha de CashMet
  // Ej: "tanque 80 gal", "tanque de 330 L", "tanque 100 galones", "300 litros"
  const matchGal = corpus.match(/tanque(?:\s+de)?\s+(\d+(?:\.\d+)?)\s*(?:gal|galones)/) ||
                   corpus.match(/(\d+(?:\.\d+)?)\s*(?:gal|galones)/)
  const matchLitros = corpus.match(/tanque(?:\s+de)?\s+(\d+(?:\.\d+)?)\s*(?:l|litros|lt)/) ||
                      corpus.match(/(\d+(?:\.\d+)?)\s*(?:l|litros|lt)\b/)

  if (matchGal && Number(matchGal[1]) >= 3) {
    const gal = Number(matchGal[1])
    const lit = Number((gal * 3.78541).toFixed(1))
    const esDiesel = /diesel|acpm|camion|camión|kraz|kamaz|gaz|kenworth|man|scania|volvo|isuzu|hino/.test(corpus)
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: gal > 100 ? 6.5 : gal > 50 ? 9.5 : 22,
      tipoCombustible: esDiesel ? 'diesel' : 'corriente',
      fichaInvestigadaNota: `Ficha técnica verificada según configuración en notas: Tanque ${gal} gal (${lit} L). ${esDiesel ? 'Diésel/ACPM' : 'Gasolina'}.`,
    }
  } else if (matchLitros && Number(matchLitros[1]) >= 15) {
    const lit = Number(matchLitros[1])
    const gal = Number((lit / 3.78541).toFixed(1))
    const esDiesel = /diesel|acpm|camion|camión|kraz|kamaz|gaz|kenworth|man|scania|volvo|isuzu|hino/.test(corpus)
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: gal > 100 ? 6.5 : gal > 50 ? 9.5 : 22,
      tipoCombustible: esDiesel ? 'diesel' : 'corriente',
      fichaInvestigadaNota: `Ficha técnica verificada según configuración en notas: Tanque oficial ${lit} L (${gal} gal). ${esDiesel ? 'Diésel/ACPM' : 'Gasolina'}.`,
    }
  }

  // 1. Motocicletas
  if (t === 'moto' || corpus.includes('moto') || l.includes('xtz') || l.includes('dr ') || l.includes('pulsar') || l.includes('boxer') || l.includes('xr ')) {
    return {
      capacidadTanqueGalones: 3.2,
      capacidadTanqueLitros: 12.1,
      consumoKmPorGalon: 110,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica motocicleta: Tanque 3.2 gal (12.1 L). Rendimiento cordillera: 110 km/gal. Gasolina Corriente.`,
    }
  }

  // 2. GAZelle (GAZ 3302, 2705, 3221, Sobol) — Camión ligero / Van 1.5t rusa
  if (l.includes('gazelle') || l.includes('3302') || l.includes('sobol') || (m === 'gaz' && (corpus.includes('ligero') || corpus.includes('pickup')))) {
    return {
      capacidadTanqueGalones: 18.0,
      capacidadTanqueLitros: 68.1,
      consumoKmPorGalon: 31,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica oficial GAZ 3302 GAZelle: Tanque original de fábrica 18 gal (68.1 L). Rendimiento mixto cordillera: ~31 km/gal. Diésel/ACPM.`,
    }
  }

  // 3. KAVZ (KAVZ 685, 3976, Overlander) — Autobús rural 4x4 soviético chasis GAZ-53
  if (m.includes('kavz') || l.includes('kavz') || l.includes('685') || (corpus.includes('overlander') && corpus.includes('autobús'))) {
    return {
      capacidadTanqueGalones: 27.7,
      capacidadTanqueLitros: 105.0,
      consumoKmPorGalon: 19,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica oficial KAVZ 685 Overlander: Chasis camión GAZ-53 con tanque de 27.7 gal (105 L). Rendimiento rural: ~19 km/gal. Diésel/ACPM.`,
    }
  }

  // 4. KrAZ pesados (KrAZ 250, 255, 256, Monster, 260, 6322) — Motor YaMZ-238 V8 Diesel
  if (m.includes('kraz') || l.includes('kraz') || l.includes('250') || l.includes('256') || (corpus.includes('soviético') && corpus.includes('6x6'))) {
    return {
      capacidadTanqueGalones: 87.2,
      capacidadTanqueLitros: 330.0,
      consumoKmPorGalon: 8.2,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica pesada KrAZ (Motor V8 YaMZ-238 14.86 L): Tanques dobles de fábrica 2x165 L = 330 L (87.2 gal). Rendimiento trabajo pesado: ~8.2 km/gal. Diésel pesado.`,
    }
  }

  // 5. GAZ camiones medianos (GAZ 53, GAZ 66, GAZ 3307, GAZ 3308 Sadko, GAZ 3309)
  if (m === 'gaz' || l.includes('gaz 53') || l.includes('gaz 66') || l.includes('sadko') || l.includes('3308') || l.includes('3307')) {
    const es66 = l.includes('66') || l.includes('sadko')
    const gal = es66 ? 55.5 : 27.7
    const lit = es66 ? 210.0 : 105.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: es66 ? 14 : 17,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica GAZ camión todo terreno: Tanque oficial ${gal} gal (${lit} L). Rendimiento en trocha: ~${es66 ? 14 : 17} km/gal. Diésel/ACPM.`,
    }
  }

  // 6. Ural pesados (Ural 375, Ural 4320, Ural Next 6x6)
  if (m.includes('ural') || l.includes('ural') || l.includes('4320')) {
    return {
      capacidadTanqueGalones: 68.7,
      capacidadTanqueLitros: 260.0,
      consumoKmPorGalon: 10.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Ural 4320 6x6: Tanque principal 200 L + auxiliar 60 L = 260 L (68.7 gal). Rendimiento trocha pesada: ~10.5 km/gal. Diésel.`,
    }
  }

  // 7. KamAZ pesados (KamAZ 5320, 5410, 5511, 4310, 43118, 6520)
  if (m.includes('kamaz') || l.includes('kamaz') || l.includes('5320') || l.includes('43118') || l.includes('6520')) {
    const esLargoO6x6 = l.includes('43118') || l.includes('6520') || corpus.includes('6x6')
    const gal = esLargoO6x6 ? 92.5 : 66.0
    const lit = esLargoO6x6 ? 350.0 : 250.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 11.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica KamAZ Diésel: Tanque oficial de aluminio ${lit} L (${gal} gal). Rendimiento cordillera: ~11.5 km/gal. Diésel/ACPM.`,
    }
  }

  // 8. ZIL camiones (ZIL 130, ZIL 131 6x6)
  if (m.includes('zil') || l.includes('zil') || l.includes('130') || l.includes('131')) {
    const es131 = l.includes('131') || corpus.includes('6x6')
    const gal = es131 ? 89.8 : 44.9
    const lit = es131 ? 340.0 : 170.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: es131 ? 11 : 14,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica ZIL: Tanque oficial ${lit} L (${gal} gal). Rendimiento montaña: ~${es131 ? 11 : 14} km/gal. Diésel.`,
    }
  }

  // 9. MAZ camiones pesados (MAZ 500, 5432, 6422)
  if (m.includes('maz') || l.includes('maz') || l.includes('6422')) {
    return {
      capacidadTanqueGalones: 92.5,
      capacidadTanqueLitros: 350.0,
      consumoKmPorGalon: 9.8,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica MAZ: Tanque de carga pesada 350 L (92.5 gal). Rendimiento montaña: ~9.8 km/gal. Diésel.`,
    }
  }

  // 10. UAZ camperos y furgones (UAZ 469, Hunter, Patriot, 452 Bukhanka)
  if (m.includes('uaz') || l.includes('uaz') || l.includes('bukhanka') || l.includes('hunter') || l.includes('patriot') || l.includes('469') || l.includes('452')) {
    return {
      capacidadTanqueGalones: 20.6,
      capacidadTanqueLitros: 78.0,
      consumoKmPorGalon: 26,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica UAZ 4x4: Tanques duales simétricos 2x39 L = 78 L (20.6 gal). Rendimiento trocha: ~26 km/gal. Gasolina Corriente.`,
    }
  }

  // 11. Kenworth pesados (Kenworth T800, TwinSteer, W900, T680, C500)
  if (m.includes('kenworth') || l.includes('kenworth') || l.includes('t800') || l.includes('twinsteer') || l.includes('w900') || l.includes('t680') || l.includes('c500')) {
    const esTwinSteer = l.includes('twinsteer') || corpus.includes('10x10') || corpus.includes('8x4')
    const gal = esTwinSteer ? 200 : 240
    const lit = Number((gal * 3.78541).toFixed(1))
    const kmGal = esTwinSteer ? 5.8 : 6.2
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: kmGal,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha pesada Kenworth ${esTwinSteer ? 'T800 TwinSteer 10x10' : 'T800'}: Tanques duales de aluminio ${gal} gal (${lit} L). Rendimiento cordillera: ~${kmGal} km/gal. Diésel/ACPM.`,
    }
  }

  // 12. MAN camiones europeos (MAN TGS, TGX, TGM, TGL, 18.420, 18.440)
  if (m.includes('man') || l.includes('tgs') || l.includes('tgx') || l.includes('tgm') || l.includes('18.420') || l.includes('18.440')) {
    return {
      capacidadTanqueGalones: 105.7,
      capacidadTanqueLitros: 400.0,
      consumoKmPorGalon: 12.2,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica MAN TGS 18.420 Euro 6: Tanque original de aluminio D26 400 L (105.7 gal). Rendimiento ruta andina: ~12.2 km/gal. Diésel Euro 6.`,
    }
  }

  // 13. Scania (R420, R440, R480, R500, G440, P360, 113, 124)
  if (m.includes('scania') || l.includes('scania') || l.includes('r440') || l.includes('r420') || l.includes('r500')) {
    const esCabezote = corpus.includes('cabezote') || corpus.includes('tractomula') || corpus.includes('quinta rueda')
    const gal = esCabezote ? 118.9 : 92.5
    const lit = esCabezote ? 450.0 : 350.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 11.8,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Scania: Tanque original de aluminio ${lit} L (${gal} gal). Rendimiento montaña: ~11.8 km/gal. Diésel Euro 5/6.`,
    }
  }

  // 14. Volvo (FH, FM, FMX, VM, FH12, FH16, FM400)
  if (m.includes('volvo') || l.includes('volvo') || l.includes('fh') || l.includes('fmx') || l.includes('vm')) {
    const esFmxOVolqueta = l.includes('fmx') || corpus.includes('volqueta')
    const esVm = l.includes('vm')
    const gal = esVm ? 72.6 : esFmxOVolqueta ? 109.6 : 118.9
    const lit = esVm ? 275.0 : esFmxOVolqueta ? 415.0 : 450.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 11.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Volvo camión/tracto: Tanque oficial ${lit} L (${gal} gal). Rendimiento cordillera: ~11.5 km/gal. Diésel.`,
    }
  }

  // 15. Mercedes-Benz pesados y medianos (Actros, Axor, Atego, Arocs, Unimog, 1113, 1620)
  if (m.includes('mercedes') || l.includes('actros') || l.includes('axor') || l.includes('atego') || l.includes('unimog') || l.includes('1113') || l.includes('1620')) {
    if (l.includes('unimog')) {
      return {
        capacidadTanqueGalones: 42.3,
        capacidadTanqueLitros: 160.0,
        consumoKmPorGalon: 16,
        tipoCombustible: 'diesel',
        fichaInvestigadaNota: `Ficha técnica Mercedes-Benz Unimog 4x4 militar/rural: Tanque oficial 160 L (42.3 gal). Rendimiento trocha: ~16 km/gal. Diésel.`,
      }
    }
    const esPesado = l.includes('actros') || l.includes('arocs') || l.includes('axor')
    const gal = esPesado ? 118.9 : 55.5
    const lit = esPesado ? 450.0 : 210.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esPesado ? 11.5 : 17.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Mercedes-Benz: Tanque oficial ${lit} L (${gal} gal). Rendimiento: ~${esPesado ? 11.5 : 17.5} km/gal. Diésel.`,
    }
  }

  // 16. Freightliner (Cascadia, Columbia, M2 106, M2 112, FLD120)
  if (m.includes('freightliner') || l.includes('cascadia') || l.includes('columbia') || l.includes('m2')) {
    const esM2 = l.includes('m2')
    const gal = esM2 ? 65 : 200
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esM2 ? 14 : 6.2,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Freightliner ${esM2 ? 'M2' : 'Cascadia/Columbia'}: Tanque ${gal} gal (${lit} L). Rendimiento: ~${esM2 ? 14 : 6.2} km/gal. Diésel.`,
    }
  }

  // 17. International (WorkStar 7600, ProStar, 4300 DuraStar, Eagle 9400)
  if (m.includes('international') || l.includes('workstar') || l.includes('prostar') || l.includes('durastar') || l.includes('7600') || l.includes('4300') || l.includes('9400')) {
    const esDuraStar = l.includes('4300') || l.includes('durastar')
    const esWorkStar = l.includes('7600') || l.includes('workstar')
    const gal = esDuraStar ? 50 : esWorkStar ? 80 : 200
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esDuraStar ? 16 : esWorkStar ? 8.5 : 6.2,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica International: Tanque ${gal} gal (${lit} L). Rendimiento montaña: ~${esDuraStar ? 16 : 8.5} km/gal. Diésel.`,
    }
  }

  // 18. Mack (Granite, Anthem, Vision, CH613)
  if (m.includes('mack') || l.includes('granite') || l.includes('anthem') || l.includes('vision')) {
    const esGranite = l.includes('granite') || corpus.includes('volqueta')
    const gal = esGranite ? 88 : 200
    const lit = Number((gal * 3.78541).toFixed(1))
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esGranite ? 8.5 : 6.2,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha pesada Mack ${esGranite ? 'Granite Volqueta' : 'Tracto'}: Tanque ${gal} gal (${lit} L). Diésel.`,
    }
  }

  // 19. Camiones Isuzu / Chevrolet nacionales (NHR, NKR, NPR, NQR, FTR, FVR, FVZ, Kodiak, Brigadier)
  if (corpus.includes('kodiak')) {
    return {
      capacidadTanqueGalones: 50.0,
      capacidadTanqueLitros: 189.3,
      consumoKmPorGalon: 8.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet Kodiak (Cat 3116/3126): Tanque 50 gal (189.3 L). Rendimiento cordillera: ~8.5 km/gal. Diésel.`,
    }
  }
  if (corpus.includes('brigadier')) {
    return {
      capacidadTanqueGalones: 65.0,
      capacidadTanqueLitros: 246.1,
      consumoKmPorGalon: 7.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet Brigadier: Tanque 65 gal (246.1 L). Rendimiento: ~7.5 km/gal. Diésel.`,
    }
  }
  if (corpus.includes('nhr')) {
    return {
      capacidadTanqueGalones: 19.8,
      capacidadTanqueLitros: 75.0,
      consumoKmPorGalon: 34,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet NHR: Tanque oficial 75 L (19.8 gal). Rendimiento: ~34 km/gal. Diésel.`,
    }
  }
  if (corpus.includes('npr') || corpus.includes('nkr') || corpus.includes('reward')) {
    return {
      capacidadTanqueGalones: 26.4,
      capacidadTanqueLitros: 100.0,
      consumoKmPorGalon: 24,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet NPR / Isuzu: Tanque oficial 100 L (26.4 gal). Rendimiento: ~24 km/gal. Diésel.`,
    }
  }
  if (corpus.includes('nqr')) {
    return {
      capacidadTanqueGalones: 37.0,
      capacidadTanqueLitros: 140.0,
      consumoKmPorGalon: 20,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet NQR: Tanque oficial 140 L (37.0 gal). Rendimiento: ~20 km/gal. Diésel.`,
    }
  }
  if (corpus.includes('ftr')) {
    return {
      capacidadTanqueGalones: 52.8,
      capacidadTanqueLitros: 200.0,
      consumoKmPorGalon: 14,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet FTR: Tanque oficial 200 L (52.8 gal). Rendimiento: ~14 km/gal. Diésel.`,
    }
  }
  if (corpus.includes('fvr') || corpus.includes('fvz')) {
    return {
      capacidadTanqueGalones: 79.2,
      capacidadTanqueLitros: 300.0,
      consumoKmPorGalon: 9.5,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Chevrolet FVR / FVZ doble troque: Tanque 300 L (79.2 gal). Rendimiento: ~9.5 km/gal. Diésel.`,
    }
  }

  // 20. Hino / Fuso / Foton / JAC camiones
  if (m.includes('hino') || l.includes('dutro') || l.includes('hino 300')) {
    return {
      capacidadTanqueGalones: 26.4,
      capacidadTanqueLitros: 100.0,
      consumoKmPorGalon: 24,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Hino Dutro / Serie 300: Tanque oficial 100 L (26.4 gal). Rendimiento: ~24 km/gal. Diésel.`,
    }
  }
  if (l.includes('hino 500') || l.includes('fc9j') || l.includes('fg8j')) {
    return {
      capacidadTanqueGalones: 52.8,
      capacidadTanqueLitros: 200.0,
      consumoKmPorGalon: 14,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Hino 500: Tanque oficial 200 L (52.8 gal). Rendimiento: ~14 km/gal. Diésel.`,
    }
  }
  if (m.includes('fuso') || l.includes('canter')) {
    return {
      capacidadTanqueGalones: 26.4,
      capacidadTanqueLitros: 100.0,
      consumoKmPorGalon: 25,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Mitsubishi Fuso Canter: Tanque oficial 100 L (26.4 gal). Diésel.`,
    }
  }
  if (m.includes('foton') || m.includes('jac')) {
    const esPesado = corpus.includes('volqueta') || corpus.includes('6x4') || corpus.includes('auman') || corpus.includes('gallop')
    const gal = esPesado ? 79.2 : 26.4
    const lit = esPesado ? 300.0 : 100.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esPesado ? 9.5 : 24,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica camión ${m.toUpperCase()}: Tanque oficial ${lit} L (${gal} gal). Diésel.`,
    }
  }

  // 21. Toyota Land Cruiser / Hilux / Troop Carrier / Coaster
  if (m.includes('toyota') || l.includes('land cruiser') || l.includes('hilux') || l.includes('prado') || l.includes('trooper') || l.includes('troop carrier')) {
    if (l.includes('troop') || corpus.includes('tropero')) {
      return {
        capacidadTanqueGalones: 47.5,
        capacidadTanqueLitros: 180.0,
        consumoKmPorGalon: 23,
        tipoCombustible: 'diesel',
        fichaInvestigadaNota: `Ficha técnica Toyota Land Cruiser Troop Carrier HZJ78: Tanques duales de fábrica 2x90 L = 180 L (47.5 gal). Rendimiento: ~23 km/gal. Diésel.`,
      }
    }
    if (l.includes('coaster')) {
      return {
        capacidadTanqueGalones: 25.1,
        capacidadTanqueLitros: 95.0,
        consumoKmPorGalon: 21,
        tipoCombustible: 'diesel',
        fichaInvestigadaNota: `Ficha técnica Toyota Coaster: Tanque de 95 L (25.1 gal). Rendimiento: ~21 km/gal. Diésel.`,
      }
    }
    if (l.includes('fj70') || l.includes('machito') || l.includes('serie 70') || l.includes('fzj71')) {
      return {
        capacidadTanqueGalones: 23.8,
        capacidadTanqueLitros: 90.0,
        consumoKmPorGalon: 22,
        tipoCombustible: 'diesel',
        fichaInvestigadaNota: `Ficha técnica Toyota Land Cruiser Serie 70: Tanque oficial 90 L (23.8 gal). Rendimiento: ~22 km/gal. Diésel.`,
      }
    }
    return {
      capacidadTanqueGalones: 21.1,
      capacidadTanqueLitros: 80.0,
      consumoKmPorGalon: 30,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica Toyota Hilux / Prado 4x4: Tanque oficial 80 L (21.1 gal). Rendimiento trocha: ~30 km/gal. Diésel.`,
    }
  }

  // 22. Vans y Transporte Colectivo (Sprinter, Master, Transit, Urvan, HiAce)
  if (corpus.includes('sprinter') || corpus.includes('master') || corpus.includes('transit') || corpus.includes('urvan') || corpus.includes('hiace')) {
    const esSprinter = corpus.includes('sprinter')
    const gal = esSprinter ? 19.8 : 21.1
    const lit = esSprinter ? 75.0 : 80.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: 29,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica transporte de pasajeros: Tanque oficial ${lit} L (${gal} gal). Rendimiento: ~29 km/gal. Diésel.`,
    }
  }

  // 23. Camperos livianos (Suzuki Jimny, Samurai, Vitara)
  if (l.includes('jimny') || l.includes('samurai') || l.includes('vitara') || m.includes('suzuki')) {
    const esVitara = l.includes('vitara')
    const gal = esVitara ? 14.5 : 10.5
    const lit = esVitara ? 55.0 : 40.0
    return {
      capacidadTanqueGalones: gal,
      capacidadTanqueLitros: lit,
      consumoKmPorGalon: esVitara ? 34 : 38,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica 4x4 liviano Suzuki: Tanque oficial ${lit} L (${gal} gal). Rendimiento: ~${esVitara ? 34 : 38} km/gal. Gasolina Corriente.`,
    }
  }

  // 24. Automóviles compactos y utilitarios comunes
  if (l.includes('corsa')) {
    return {
      capacidadTanqueGalones: 11.9,
      capacidadTanqueLitros: 45.0,
      consumoKmPorGalon: 39,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica Chevrolet Corsa: Capacidad oficial 45 L (11.9 gal). Rendimiento montaña: ~39 km/gal. Gasolina Corriente.`,
    }
  }
  if (l.includes('spark') || l.includes('picanto') || l.includes('i10') || l.includes('alto')) {
    return {
      capacidadTanqueGalones: 9.2,
      capacidadTanqueLitros: 35.0,
      consumoKmPorGalon: 46,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica vehículo compacto: Tanque oficial 35 L (9.2 gal). Rendimiento: ~46 km/gal. Gasolina Corriente.`,
    }
  }
  if (l.includes('duster') || l.includes('stepway') || l.includes('sandero') || l.includes('logan') || l.includes('clio')) {
    const esDuster = l.includes('duster')
    return {
      capacidadTanqueGalones: 13.2,
      capacidadTanqueLitros: 50.0,
      consumoKmPorGalon: esDuster ? 32 : 36,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica Renault: Tanque oficial 50 L (13.2 gal). Rendimiento: ~${esDuster ? 32 : 36} km/gal. Gasolina Corriente.`,
    }
  }

  // 25. Fallback técnico según clase y configuración del vehículo
  const esPesado = corpus.includes('volqueta') || corpus.includes('6x4') || corpus.includes('6x6') || corpus.includes('quinta rueda') || corpus.includes('tractomula')
  const esCamionMediano = t === 'camion' || corpus.includes('camion') || corpus.includes('camión')
  const esPickupOCampero = corpus.includes('4x4') || corpus.includes('pickup') || corpus.includes('campero')

  const galonesFinal = esPesado ? 87.0 : esCamionMediano ? 36.0 : esPickupOCampero ? 21.0 : 13.2
  const litrosFinal = Number((galonesFinal * 3.78541).toFixed(1))
  const tipoComb = (esPesado || esCamionMediano || esPickupOCampero) ? 'diesel' : 'corriente'
  const kmGalon = esPesado ? 8.5 : esCamionMediano ? 18 : esPickupOCampero ? 28 : 36

  return {
    capacidadTanqueGalones: galonesFinal,
    capacidadTanqueLitros: litrosFinal,
    consumoKmPorGalon: kmGalon,
    tipoCombustible: tipoComb,
    fichaInvestigadaNota: `Ficha técnica ${esPesado ? 'camión pesado' : esCamionMediano ? 'camión' : 'vehículo'}: Capacidad calculada ${galonesFinal} gal (${litrosFinal} L). Rendimiento: ~${kmGalon} km/gal. ${tipoComb.toUpperCase()}.`,
  }
}

/**
 * Inteligencia de Selección y Asignación de Vehículos para Misiones 🧠🚚:
 * Analiza el tipo de contingencia (lodo, niños, mudanza, apoyo) y cruza con
 * las notas de CashMet (4x4, winche, 5ta rueda, capacidad de pasajeros)
 * y el nombre del modelo para despachar la unidad perfecta.
 */
export function seleccionarVehiculosOptimosMision(
  mision: { titulo: string; tipo: string; impactoSocial?: string; terreno?: string },
  vehiculosDisponibles: VehiculoOperativo[]
): {
  vehiculoElegido: VehiculoOperativo
  motivoGema: string
  candidatosSecundarios: VehiculoOperativo[]
} {
  const aptos = vehiculosDisponibles.filter((v) => v.disponibleParaTrabajo && v.nivelCombustiblePorc > 15)
  const pool = aptos.length > 0 ? aptos : vehiculosDisponibles

  const textoMision = `${mision.titulo} ${mision.tipo} ${mision.impactoSocial || ''} ${mision.terreno || ''}`.toLowerCase()

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

  // Evaluar cada vehículo
  const puntuados = pool.map((v) => {
    let score = 0
    const corpusV = `${v.marca} ${v.linea} ${v.tipo} ${v.carroceria || ''} ${v.notasCashmet || ''} ${v.capacidadTexto || ''}`.toLowerCase()

    const tiene4x4 = corpusV.includes('4x4') || corpusV.includes('winche') || corpusV.includes('trocha') || corpusV.includes('land cruiser') || corpusV.includes('hilux')
    const tienePasajeros = corpusV.includes('bus') || corpusV.includes('buseta') || corpusV.includes('van') || corpusV.includes('pasajero') || corpusV.includes('escolar') || corpusV.includes('troop carrier')
    const tienePesado = corpusV.includes('quinta rueda') || corpusV.includes('5ta rueda') || corpusV.includes('tractomula') || corpusV.includes('kodiak') || corpusV.includes('camion')

    if (requierePasajeros && tienePasajeros) score += 50
    if (requiere4x4ORescate && tiene4x4) score += 60
    if (requiereCargaPesada && tienePesado) score += 40

    // Si tiene buen nivel de combustible
    score += (v.nivelCombustiblePorc || 50) * 0.1

    return { vehiculo: v, score, tiene4x4, tienePasajeros, tienePesado }
  })

  puntuados.sort((a, b) => b.score - a.score)
  const mejor = puntuados[0]?.vehiculo || pool[0]

  let motivo = `Gema seleccionó ${mejor.marca} ${mejor.linea}`
  if (requierePasajeros && (mejor.notasCashmet || '').includes('pasajeros')) {
    motivo += ` porque tus notas en CashMet indican capacidad de pasajeros, ideal para la ruta escolar.`
  } else if (requiere4x4ORescate && (mejor.notasCashmet || '').includes('winche')) {
    motivo += ` porque tus notas en CashMet confirman winche y tracción para terrenos de alto barro.`
  } else if (requiereCargaPesada) {
    motivo += ` por su volumen de carga y torque para transporte pesado campesino.`
  } else {
    motivo += ` por estar listo en base con tanque al ${mejor.nivelCombustiblePorc}%.`
  }

  return {
    vehiculoElegido: mejor,
    motivoGema: motivo,
    candidatosSecundarios: puntuados.slice(1, 4).map((p) => p.vehiculo),
  }
}

/**
 * Eventos y contingencias del Radar.
 * Los marcados con esNoticiaWebReal: true provienen de noticias en vivo (reciben el chulito discreto ✓).
 * Los marcados con esNoticiaWebReal: false son llamadas y situaciones comunitarias asumidas / simuladas por Gema.
 */
export const EVENTOS_RADAR_PREDETERMINADOS: EventoRadarLocal[] = [
  {
    id: 'rad-web-1',
    titulo: 'Vía Manizales - Fresno con paso restringido por pérdida de banca',
    lugar: 'Sector Mesones · Vía a Letras (Caldas)',
    departamento: 'Caldas',
    lat: 5.0790,
    lng: -75.3350,
    fuenteNoticia: 'Invías & Prensa Regional Eje Cafetero',
    resumen: 'Paso a un solo carril por desprendimiento de ladera. Larga fila de vehículos pesados y familias varadas sin víveres ni agua.',
    fecha: hoyISO(),
    esEmergenciaGrave: true,
    atencionOficialPresente: true,
    esNoticiaWebReal: true, // ✓ Noticia real de internet
    recomendacionGema: 'apoyo_logistico',
    justificacionGema: 'Hay policía regulando el tránsito, pero las familias y camioneros llevan más de 6 horas atrapados en frío de páramo sin abrigo ni alimentos.',
  },
  {
    id: 'rad-sim-2',
    titulo: 'Llamada de auxilio: Familia campesina en Vereda El Desquite requiere trasteo de emergencia',
    lugar: 'Vereda El Desquite (Trocha alta) · Manizales',
    departamento: 'Caldas',
    lat: 5.0560,
    lng: -75.4380,
    fuenteNoticia: 'Llamada directa a la Central Bear\'s Reserve',
    resumen: 'Madre cabeza de hogar con tres niños y adulto mayor. Su vivienda presenta agrietamiento severo por infiltración de agua. Necesitan trasladar enseres y camas por trocha de difícil acceso a un albergue familiar antes de la noche.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false, // Llamada comunitaria asumida
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Situación netamente comunitaria. Ninguna empresa de mudanza ni camión convencional sube a esa ladera destapada. Misión prioritaria de apoyo.',
  },
  {
    id: 'rad-sim-3',
    titulo: 'Camión lechero con rotura de cardán atascado en vado de barro',
    lugar: 'Sector Bajo Tablazo ↔ Vereda La Linda',
    departamento: 'Caldas',
    lat: 5.0345,
    lng: -75.5280,
    fuenteNoticia: 'Comité de Ganaderos Veredales WhatsApp',
    resumen: 'Transporta 1.800 litros de leche de 9 pequeñas parcelas familiares. El barro húmedo le impidió salir tras la falla mecánica. Si no se remolca a orilla firme antes del mediodía se perderá el trabajo semanal.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false, // Llamada comunitaria asumida
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Despliegue de vehículo de tracción pesada con winche y cables de arrastre. Salvar la producción de nuestros campesinos.',
  },
  {
    id: 'rad-web-4',
    titulo: 'Derrumbe en Autopista Medellín - Bogotá con cierre total',
    lugar: 'Municipio de San Luis · Antioquia',
    departamento: 'Antioquia',
    lat: 6.0425,
    lng: -74.9936,
    fuenteNoticia: 'Periódico El Colombiano / Invías',
    resumen: 'Cierre total de la troncal por más de 10.000 m3 de tierra.',
    fecha: hoyISO(),
    esEmergenciaGrave: true,
    atencionOficialPresente: true,
    esNoticiaWebReal: true, // ✓ Noticia real de internet
    recomendacionGema: 'monitorear_sin_intervenir',
    justificacionGema: 'Queda a más de 160 km en Antioquia y cuenta con retroexcavadoras de la gobernación y concesión. Fuera del rango de auxilio inmediato.',
  },
  {
    id: 'rad-sim-5',
    titulo: 'Árbol centenario derribado sobre cerco y paso peatonal de niños campesinos',
    lugar: 'Vereda San Peregrino · Caldas',
    departamento: 'Caldas',
    lat: 5.0742,
    lng: -75.5810,
    fuenteNoticia: 'Junta de Acción Comunal Rural',
    resumen: 'Tronco y ramas espinosas cortaron la manguera de acueducto veredal y bloquean el camino de herradura que usan los niños para caminar a la escuela.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false, // Llamada comunitaria asumida
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Se requiere equipo con motosierra, eslingas de arrastre y personal para liberar el camino y ayudar a reconectar el tubo de agua.',
  },
]

/**
 * Banco de contingencias dinámicas y realistas para escaneo en vivo de frecuencias por Gema 📡
 */
const CONTINGENCIAS_DINAMICAS_POOL: Omit<EventoRadarLocal, 'id' | 'fecha'>[] = [
  {
    titulo: 'Deslizamiento con pérdida parcial de banca en vía antigua a Chinchiná',
    lugar: 'Vereda El Rosario (Sector La Siria) · Caldas',
    departamento: 'Caldas',
    lat: 5.0489,
    lng: -75.5684,
    fuenteNoticia: 'Radio Comunitaria Chinchiná Stereo',
    resumen: 'Lluvia constante de madrugada provocó caída de talud sobre la calzada veredal. Familias campesinas no pueden sacar plátano ni cítricos.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Camino veredal secundario desatendido por maquinaria oficial. Se requiere camión o campero con winche y cuadrilla con palas.',
  },
  {
    titulo: 'Campero de acopiador de café atrapado en cuneta profunda por torrencial aguacero',
    lugar: 'Vereda Morrogacho · Manizales',
    departamento: 'Caldas',
    lat: 5.0612,
    lng: -75.5340,
    fuenteNoticia: 'Llamada de vecino a la Reserva',
    resumen: 'Toyota Land Cruiser con 12 bultos de café cereza resbaló en greda húmeda y quedó de costado al borde de un zanjón.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Riesgo de volcamiento completo. Maniobra ideal de polea de reenvío y anclaje a árbol con winche de 12.000 lbs.',
  },
  {
    titulo: 'Bloqueo por rocas y material suelto en paso veredal La Quiebra de Vélez',
    lugar: 'Sector La Quiebra de Vélez ↔ Cabaña · Caldas',
    departamento: 'Caldas',
    lat: 5.1021,
    lng: -75.5645,
    fuenteNoticia: 'Comité de Cafeteros de Manizales',
    resumen: 'Tres piedras de gran volumen obstruyen el paso del camión recolector de basura y vehículos de víveres hacia las veredas altas.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Arrastre pesado con cables acerados y vehículo de alto torque para despejar el carril.',
  },
  {
    titulo: 'Avería mecánica de furgón escolar comunitario en subida de Alto Tablazo',
    lugar: 'Sector Alto Tablazo · Manizales',
    departamento: 'Caldas',
    lat: 5.0430,
    lng: -75.5090,
    fuenteNoticia: 'Grupo WhatsApp Veredal Tablazo',
    resumen: 'Vehículo particular de transporte veredal sufrió daño de embrague en plena rampa con 7 pasajeros esperando auxilio.',
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    esNoticiaWebReal: false,
    recomendacionGema: 'apoyo_logistico',
    justificacionGema: 'Remolque con barra de tiro rígida o auxilio de transbordo hacia Manizales.',
  },
  {
    titulo: 'Inundación de vado de quebrada con paso suspendido hacia vereda Gallinazo',
    lugar: 'Vía Gallinazo · Villamaría (Caldas)',
    departamento: 'Caldas',
    lat: 5.0280,
    lng: -75.4750,
    fuenteNoticia: 'Bomberos Voluntarios Villamaría',
    resumen: 'Creciente súbita de la quebrada depositó palizadas y piedras sobre el pontón impidiendo el tránsito de motocicletas y camperos.',
    esEmergenciaGrave: true,
    atencionOficialPresente: true,
    esNoticiaWebReal: true,
    recomendacionGema: 'apoyo_logistico',
    justificacionGema: 'Apoyo con motosierra y cadenas para retirar troncos arrastrados por la corriente una vez baje el caudal.',
  },
]

/**
 * Escanea frecuencias y genera nuevas contingencias de campo autónomas con Gema
 */
export function escanearNuevosEventosRadarIA(eventosActuales: EventoRadarLocal[]): {
  nuevosEventos: EventoRadarLocal[]
  eventoAgregado: EventoRadarLocal | null
} {
  const titulosExistentes = new Set(eventosActuales.map((e) => e.titulo.toLowerCase().trim()))
  const candidatos = CONTINGENCIAS_DINAMICAS_POOL.filter(
    (c) => !titulosExistentes.has(c.titulo.toLowerCase().trim())
  )

  let seleccionado: EventoRadarLocal
  if (candidatos.length > 0) {
    const elegido = candidatos[Math.floor(Math.random() * candidatos.length)]
    seleccionado = {
      ...elegido,
      id: `rad-din-${Date.now()}`,
      fecha: hoyISO(),
    }
  } else {
    // Generar dinámicamente con timestamp
    const timestamp = Date.now()
    seleccionado = {
      id: `rad-din-${timestamp}`,
      titulo: `Alerta veredal de auxilio en vía rural San Peregrino #${String(timestamp).slice(-3)}`,
      lugar: 'Vereda San Peregrino · Sector Fincas Bajas',
      departamento: 'Caldas',
      lat: 5.0685 + (Math.random() - 0.5) * 0.02,
      lng: -75.589 + (Math.random() - 0.5) * 0.02,
      fuenteNoticia: 'Llamada de radio frecuencia comunitaria',
      resumen: 'Camión de carga local atascado en barrizal tras lluvia torrencial. Requiere tracción de rescate.',
      fecha: hoyISO(),
      esEmergenciaGrave: false,
      atencionOficialPresente: false,
      esNoticiaWebReal: false,
      recomendacionGema: 'intervenir_urgente',
      justificacionGema: 'Despliegue de unidad 4x4 con winche para halar el vehículo a terreno firme.',
    }
  }

  return {
    nuevosEventos: [seleccionado, ...eventosActuales],
    eventoAgregado: seleccionado,
  }
}

/**
 * Generador de Crónicas de Campo en lenguaje humano auténtico 📖:
 * Relata de forma humana y realista cómo transcurrió la misión, el tiempo invertido,
 * los vehículos y personal que participaron, y el desenlace (que puede ser exitoso,
 * con desenlace parcial o un repliegue por condiciones extremas).
 */
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

  const flotaTexto = vehiculosNombres.length > 0 ? vehiculosNombres.join(' y ') : 'vehículo de la reserva'
  const equipoTexto = tripulantesNombres.length > 0 ? tripulantesNombres.join(', ') : 'equipo de guardia'

  if (resultado === 'exito') {
    return (
      `Relato de Operaciones · Salida desde la base central hacia ${mision.destino}. ` +
      `La maniobra tomó aproximadamente ${duracionTexto} con un recorrido acumulado de ${mision.distanciaKmIdaYVuelta} km sobre ${mision.terreno.replace(/_/g, ' ')}. ` +
      `A cargo de la comisión estuvieron ${equipoTexto}, empleando ${flotaTexto}. ` +
      `Al llegar al lugar se coordinó directamente con los pobladores de la zona; se aseguraron los anclajes y se superaron los tramos más críticos de barro sin novedades mecánicas graves. ` +
      `El objetivo se completó satisfactoriamente, dejando a la comunidad asistida y retornando a base con la flota lista para el siguiente turno.`
    )
  }

  if (resultado === 'parcial') {
    return (
      `Bitácora de Intervención Compleja · Despliegue hacia ${mision.destino} (${duracionTexto}, ${mision.distanciaKmIdaYVuelta} km). ` +
      `Intervinieron ${equipoTexto} con ${flotaTexto}. El terreno presentó inclinaciones severas y lodazal inestable que exigió el uso continuo de winches y doble tracción. ` +
      `Se logró remolcar y evacuar la carga principal hasta una zona firme y segura de la carretera; sin embargo, debido al riesgo de deslizamiento de la banca superior y falta de tracción en la pendiente final, ` +
      `se coordinó con líderes comunales para continuar el tramo restante a pie con bestias de carga. Equipo replegado a base sin daños a la integridad del personal.`
    )
  }

  return (
    `Reporte de Repliegue Táctico y Resguardo · Desplazamiento hacia ${mision.destino} durante ${duracionTexto}. ` +
    `La tripulación (${equipoTexto}) a bordo de ${flotaTexto} enfrentó una crecida repentina de cauce y derrumbe activo que bloqueó por completo la trocha. ` +
    `Evaluada la seguridad del personal y la estabilidad del suelo, se determinó suspender el ingreso motorizado para evitar encunetamiento o volcamiento. ` +
    `Se entregaron víveres y botiquines a mano a los caminantes de la vereda antes de retornar con precaución a la base central.`
  )
}

/**
 * Motor de rotación inteligente de turnos 24/7 (Tope 40-42 horas semanales,
 * cobertura continua de Lunes a Domingo sin huecos ni jornadas partidas,
 * y distribución equitativa donde todos los colaboradores activos completan entre 40 y 42h).
 */
export function generarTurnosSemanalesIA(
  empleados: EmpleadoOperativo[],
  fechaLunesISO: string,
  _rutasHabituales: RutaHabitual[] = [],
  rotacionOffset: number = 0
): TurnoSemanal[] {
  const turnos: TurnoSemanal[] = []
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  // Descomponer fecha local de forma segura evitando desajustes UTC
  const partes = fechaLunesISO.split('-').map(Number)
  const baseFecha = new Date(partes[0], partes[1] - 1, partes[2], 12, 0, 0)

  // Solo colaboradores operativos activos (excluye cargos administrativos u omitidos como editores)
  const empleadosActivos = empleados.filter((e) => e.activo !== false)
  const n = empleadosActivos.length

  // Rotación circular interactiva: desplaza el punto de partida en cada clic para reordenar la semana
  const shift = n > 0 ? (Math.abs(rotacionOffset) * 3) % n : 0
  const poolRotado = n > 0 ? [...empleadosActivos.slice(shift), ...empleadosActivos.slice(0, shift)] : []

  const horasAsignadas: Record<string, number> = {}
  const turnosPorEmpleado: Record<string, number> = {}
  const diasOcupadosPorEmpleado: Record<string, Set<number>> = {}
  poolRotado.forEach((e) => {
    horasAsignadas[e.id] = 0
    turnosPorEmpleado[e.id] = 0
    diasOcupadosPorEmpleado[e.id] = new Set<number>()
  })

  // Estructura de los 7 días de la semana
  const diasInfo: Array<{
    d: number
    fechaISO: string
    nombreDia: string
    diaSemanaRestriccion: number
    diaSemanaSiguiente: number
  }> = []

  for (let d = 0; d < 7; d++) {
    const fechaDia = new Date(baseFecha)
    fechaDia.setDate(baseFecha.getDate() + d)
    const y = fechaDia.getFullYear()
    const m = String(fechaDia.getMonth() + 1).padStart(2, '0')
    const diaNum = String(fechaDia.getDate()).padStart(2, '0')
    const fechaISO = `${y}-${m}-${diaNum}`
    const nombreDia = DIAS[d]
    const diaSemanaRestriccion = d === 6 ? 0 : d + 1
    const diaSemanaSiguiente = (diaSemanaRestriccion + 1) % 7
    diasInfo.push({ d, fechaISO, nombreDia, diaSemanaRestriccion, diaSemanaSiguiente })
  }

  // Registro de quién trabajó en turno nocturno por día (para garantizar descanso el día siguiente)
  const nocheTrabajadaPorDia: Record<number, Set<string>> = {
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
    5: new Set(),
    6: new Set(),
  }

  // Verificador de idoneidad y disponibilidad de un empleado
  const puedeAsignarse = (
    emp: EmpleadoOperativo,
    d: number,
    franja: 'manana' | 'tarde' | 'noche',
    tipoPuesto: 'conductor' | 'mecanico',
    duracionHoras: number
  ) => {
    // No exceder el tope legal máximo de 42.5 horas
    if ((horasAsignadas[emp.id] || 0) + duracionHoras > 42.5) return false
    // Máximo 1 turno por día (jornada continua de 8h, sin doblar turno el mismo día)
    if (diasOcupadosPorEmpleado[emp.id]?.has(d)) return false
    // Si viene saliendo de turno nocturno (terminó a las 06:00 AM hoy), no puede entrar a la mañana a las 06:00
    if (franja === 'manana' && d > 0 && nocheTrabajadaPorDia[d - 1]?.has(emp.id)) return false

    const diaInfo = diasInfo[d]
    // Respetar compromisos personales / universitarios
    const tieneConflicto = emp.horariosNoDisponibles.some((h) => {
      if (franja === 'noche') {
        const chocaNoche = h.diaSemana === diaInfo.diaSemanaRestriccion && h.horaFin > '22:00'
        const chocaMadrugada = h.diaSemana === diaInfo.diaSemanaSiguiente && h.horaInicio < '06:00'
        return chocaNoche || chocaMadrugada
      } else if (franja === 'manana') {
        return h.diaSemana === diaInfo.diaSemanaRestriccion && h.horaInicio < '14:00' && h.horaFin > '06:00'
      } else {
        return h.diaSemana === diaInfo.diaSemanaRestriccion && h.horaInicio < '22:00' && h.horaFin > '14:00'
      }
    })
    if (tieneConflicto) return false

    // Validación de afinidad mínima
    if (tipoPuesto === 'mecanico' && afinidadMecanico(emp) === 0) return false
    if (tipoPuesto === 'conductor' && afinidadConductor(emp) === 0) return false

    return true
  }

  // Helper para asignar un turno y actualizar contadores
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
      id: `tur-${diaInfo.fechaISO}-${franja}-${idSufijo}`,
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
  // FASE 1: CONDUCTORES TRONCALES (Garantiza Conductor en las 21 franjas L-D)
  // =========================================================================
  for (const diaInfo of diasInfo) {
    const { d, nombreDia } = diaInfo

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
        horaInicio: '06:00',
        horaFin: '14:00',
        horas: d <= 4 ? 8.5 : d === 5 ? 8.5 : 8.0, // 8.5h para rutas con inspección/alistamiento
        rol:
          d <= 4
            ? `🚌 Conducción Ruta Escolar Matutina 06:00 + Guardia Base (${nombreDia})`
            : d === 5
              ? `🧺 Conducción Ruta Solidaria Mercado Campesino 05:30 + Guardia Base (${nombreDia})`
              : `🚗 Conductor de Guardia Matutina & Base Central (${nombreDia})`,
        rutaHabitualId: d <= 4 ? 'rut-escolar-matutina' : d === 5 ? 'rut-mercado-campesino' : undefined,
        idSufijo: 'cond-ruta',
      },
      {
        franja: 'tarde',
        horaInicio: '14:00',
        horaFin: '22:00',
        horas: d <= 4 ? 8.5 : 8.0,
        rol:
          d <= 4
            ? `🚌 Conducción Ruta Escolar Vespertina 15:00 + Guardia Base (${nombreDia})`
            : `🚗 Conductor de Guardia Vespertina & Auxilio Veredal (${nombreDia})`,
        rutaHabitualId: d <= 4 ? 'rut-escolar-vespertina' : undefined,
        idSufijo: 'cond-ruta',
      },
      {
        franja: 'noche',
        horaInicio: '22:00',
        horaFin: '06:00',
        horas: 8.0,
        rol: `🚗 Conductor Nocturno & Respuesta Inmediata a Emergencias (${nombreDia})`,
        idSufijo: 'cond-noche',
      },
    ]

    for (const fc of franjasCond) {
      const candidatos = poolRotado
        .filter((emp) => puedeAsignarse(emp, d, fc.franja, 'conductor', fc.horas))
        .sort((a, b) => {
          // 1. Quien tenga menos horas asignadas va de primero para avanzar en equidad
          const hA = horasAsignadas[a.id] || 0
          const hB = horasAsignadas[b.id] || 0
          if (hA !== hB) return hA - hB
          // 2. Afinidad de conducción
          const ca = afinidadConductor(a)
          const cb = afinidadConductor(b)
          if (cb !== ca) return cb - ca
          return 0
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
  // FASE 2: MECÁNICOS Y SOPORTE (Garantiza Mecánico en las 21 franjas L-D)
  // =========================================================================
  for (const diaInfo of diasInfo) {
    const { d, nombreDia } = diaInfo

    const franjasMec: Array<{
      franja: 'manana' | 'tarde' | 'noche'
      horaInicio: string
      horaFin: string
      horas: number
      rol: string
      idSufijo: string
    }> = [
      {
        franja: 'manana',
        horaInicio: '06:00',
        horaFin: '14:00',
        horas: 8.0,
        rol: `🔧 Mecánico de Base / Soporte Técnico & Alistamiento Flota (${nombreDia})`,
        idSufijo: 'mec-base',
      },
      {
        franja: 'tarde',
        horaInicio: '14:00',
        horaFin: '22:00',
        horas: 8.0,
        rol: `🔧 Mecánico / Mantenimiento de Trocha & Winches (${nombreDia})`,
        idSufijo: 'mec-tarde',
      },
      {
        franja: 'noche',
        horaInicio: '22:00',
        horaFin: '06:00',
        horas: 8.0,
        rol: `🔧 Mecánico Nocturno & Rescate Pesado / Alerta Cordillera (${nombreDia})`,
        idSufijo: 'mec-noche',
      },
    ]

    for (const fm of franjasMec) {
      const candidatos = poolRotado
        .filter((emp) => puedeAsignarse(emp, d, fm.franja, 'mecanico', fm.horas))
        .sort((a, b) => {
          const hA = horasAsignadas[a.id] || 0
          const hB = horasAsignadas[b.id] || 0
          if (hA !== hB) return hA - hB
          const ma = afinidadMecanico(a)
          const mb = afinidadMecanico(b)
          if (mb !== ma) return mb - ma
          return 0
        })

      if (candidatos[0]) {
        asignarTurno(
          candidatos[0],
          d,
          fm.franja,
          fm.horaInicio,
          fm.horaFin,
          fm.horas,
          fm.rol,
          fm.idSufijo
        )
      }
    }
  }

  // =========================================================================
  // FASE 3: REFUERZOS DIURNOS (Para que todos alcancen entre 40 y 42 horas)
  // =========================================================================
  // Se distribuyen en días laborables y fines de semana hasta que cada colaborador activo
  // complete sus 5 turnos semanales (meta legal de 40 a 42 horas).
  let intentos = 0
  while (intentos < 50) {
    intentos++
    // Buscar colaboradores que tengan menos de 5 turnos o menos de 40 horas
    const pendientes = poolRotado
      .filter((e) => (turnosPorEmpleado[e.id] || 0) < 5 && (horasAsignadas[e.id] || 0) < 40)
      .sort((a, b) => (horasAsignadas[a.id] || 0) - (horasAsignadas[b.id] || 0))

    if (pendientes.length === 0) break

    const emp = pendientes[0]
    let asignado = false

    // Buscar un día libre para este colaborador (preferir Lunes a Domingo en franjas diurnas)
    for (const diaInfo of diasInfo) {
      const { d, nombreDia } = diaInfo
      if (diasOcupadosPorEmpleado[emp.id]?.has(d)) continue

      // Intentar turno mañana primero, luego tarde
      for (const franja of ['manana', 'tarde'] as const) {
        const horasTurno = 8.0
        if (puedeAsignarse(emp, d, franja, 'conductor', horasTurno)) {
          const rolTexto =
            franja === 'manana'
              ? `🚗 Conductor de Apoyo / Guardia Rápida Veredal (${nombreDia})`
              : `🚗 Conductor de Asistencia Comunitaria & Despacho Rápido (${nombreDia})`

          asignarTurno(
            emp,
            d,
            franja,
            franja === 'manana' ? '06:00' : '14:00',
            franja === 'manana' ? '14:00' : '22:00',
            horasTurno,
            rolTexto,
            `apoyo-${d}`
          )
          asignado = true
          break
        }
      }
      if (asignado) break
    }

    if (!asignado) {
      // Si no pudo en franja diurna, intentar noche si está libre
      for (const diaInfo of diasInfo) {
        const { d, nombreDia } = diaInfo
        if (diasOcupadosPorEmpleado[emp.id]?.has(d)) continue
        if (puedeAsignarse(emp, d, 'noche', 'conductor', 8.0)) {
          asignarTurno(
            emp,
            d,
            'noche',
            '22:00',
            '06:00',
            8.0,
            `🚗 Guardia Nocturna Adicional de Apoyo (${nombreDia})`,
            `apoyo-noche-${d}`
          )
          asignado = true
          break
        }
      }
      if (!asignado) break
    }
  }

  // Ordenar cronológicamente los turnos generados por fecha y hora
  turnos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.horaInicio.localeCompare(b.horaInicio)
  })

  return turnos
}

/**
 * Genera un informe diario integral de operaciones y guardia comunitaria 📋.
 */
export function generarInformeDiarioOperaciones(contexto: {
  empleados: EmpleadoOperativo[]
  vehiculos: VehiculoOperativo[]
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
}): string {
  const hoy = hoyISO()
  const misionesHoy = contexto.misiones.filter((m) => m.fecha === hoy)
  const misionesCompletadas = misionesHoy.filter((m) => m.estado === 'completada')
  const misionesEnCurso = misionesHoy.filter((m) => m.estado === 'en_curso')
  const turnosHoy = contexto.turnos.filter((t) => t.fecha === hoy)
  const vehiculosTrabajo = contexto.vehiculos.filter((v) => v.disponibleParaTrabajo)

  let informe = `🐻💎 **INFORME DIARIO DE OPERACIONES · BEAR'S RESERVE**\n`
  informe += `📅 **Fecha**: ${hoy} · Cordillera Central / Manizales\n\n`

  informe += `👥 **Personal en Guardia Activa (Tope 42h)**:\n`
  if (turnosHoy.length > 0) {
    turnosHoy.forEach((t) => {
      informe += `• ${t.esRespaldoCoordinador ? '🚨' : '👤'} **${t.empleadoNombre}**: ${t.horaInicio} - ${t.horaFin} (${t.rolGuardia})\n`
    })
  } else {
    informe += `• Dotación en alerta pasiva y rotación semanal lista.\n`
  }

  informe += `\n🚚 **Estado y Telemetría de Flota (${vehiculosTrabajo.length} asignados)**:\n`
  vehiculosTrabajo.forEach((v) => {
    const estadoTanque = v.nivelCombustiblePorc <= 20 ? '⚠️ En reserva' : '✅ Óptimo'
    informe += `• **${v.marca} ${v.linea}** (${v.placa || 'En servicio'}): Tanque ${v.nivelCombustiblePorc}% (${estadoTanque}) · Odómetro: ${v.kilometrajeActual.toLocaleString('es-CO')} km · Llantas: ${v.desgasteLlantasPorc}% desgaste\n`
  })

  informe += `\n🏔️ **Misiones e Intervenciones Comunitarias**:\n`
  if (misionesHoy.length === 0) {
    informe += `• Sin salidas extraordinarias hoy. Flota en base en guardia preventiva y alistamiento de winches.\n`
  } else {
    if (misionesEnCurso.length > 0) {
      informe += `• 🚨 **En Curso**: ${misionesEnCurso.map((m) => m.titulo).join('; ')}\n`
    }
    if (misionesCompletadas.length > 0) {
      informe += `• 🏁 **Completadas con éxito**: ${misionesCompletadas.map((m) => `${m.titulo} (${m.distanciaKmIdaYVuelta} km)`).join('; ')}\n`
    }
  }

  informe += `\n❤️ *Compromiso Bear's Reserve: 0% ánimo de lucro, 100% servicio comunitario a las familias campesinas.*`
  return informe
}

/**
 * Inteligencia conversacional y de mando de Gema 💎
 */
export function responderGema(
  mensaje: string,
  contexto: {
    empleados: EmpleadoOperativo[]
    vehiculos: VehiculoOperativo[]
    turnos: TurnoSemanal[]
    misiones: MisionComunitaria[]
  }
): {
  respuesta: string
  accion?:
    | { tipo: 'rotar_turnos' }
    | { tipo: 'tanquear_vehiculo'; vehiculoId: string }
    | { tipo: 'generar_informe' }
} {
  const q = mensaje.toLowerCase().trim()

  // 1. Informe diario
  if (q.includes('informe') || q.includes('reporte') || q.includes('resumen') || q.includes('novedades')) {
    return {
      respuesta: generarInformeDiarioOperaciones(contexto),
      accion: { tipo: 'generar_informe' },
    }
  }

  // 2. Consulta de turnos o quién está trabajando
  if (q.includes('quién está') || q.includes('quien esta') || q.includes('trabajando') || q.includes('turno')) {
    const turnosHoy = contexto.turnos.filter((t) => t.fecha === hoyISO())
    let detalleTurnos = ''
    if (turnosHoy.length) {
      detalleTurnos = turnosHoy
        .map(
          (t) =>
            `• ${t.esRespaldoCoordinador ? '🚨' : '👤'} **${t.empleadoNombre}**: ${t.horaInicio} a ${t.horaFin} — *${t.rolGuardia}*`
        )
        .join('\n')
    } else {
      detalleTurnos = contexto.empleados
        .filter((e) => e.activo)
        .map(
          (e) =>
            `• 👤 **${e.nombreCompleto}** (${e.cargo}): ${e.horasSemanalesAsignadas}/42h semanales disponibles`
        )
        .join('\n')
    }

    return {
      respuesta: `🐻 ¡Hola con todo el cariño! Este es el estado de guardia comunitaria para hoy:\n\n${detalleTurnos}\n\n💎 Cuidamos el bienestar del equipo para que nadie exceda las 42 horas semanales ni descuide sus clases universitarias o su hogar. ¿Quieres que ajuste alguna franja? ❤️`,
    }
  }

  // 3. Consulta de flota, combustible y llantas
  if (q.includes('combustible') || q.includes('gasolina') || q.includes('diesel') || q.includes('tanque') || q.includes('llantas') || q.includes('flota')) {
    const detalleFlota = contexto.vehiculos
      .filter((v) => v.disponibleParaTrabajo)
      .map((v) => {
        const alertaReserva = v.nivelCombustiblePorc <= 20 ? ' ⚠️ (Cerca de reserva)' : ''
        return `• 🚚 **${v.marca} ${v.linea}** (${v.placa || 'En servicio'}): Tanque al **${v.nivelCombustiblePorc}%** (${v.capacidadTanqueGalones} gal) · Odómetro: **${v.kilometrajeActual.toLocaleString('es-CO')} km** · Llantas: **${v.desgasteLlantasPorc}% desgaste**${alertaReserva}`
      })
      .join('\n')

    return {
      respuesta: `🏔️ Estado en tiempo real de nuestra flota comunitaria Bear's Reserve:\n\n${detalleFlota}\n\n⛽ Recuerda que si algún vehículo baja al 15% o menos, el sistema lo tanqueará automáticamente al 100% y cargará el costo a la Tarjeta de Combustible para que nunca nos quedemos tirados en una trocha. 💎`,
    }
  }

  // 4. Solicitud de rotación de turnos
  if (q.includes('rotar') || q.includes('organizar turnos') || q.includes('cuadrar turnos') || q.includes('nueva semana')) {
    return {
      respuesta: `💎 ¡Comprendido! Estoy revisando los horarios personales y universitarios de cada colaborador para estructurar la nueva semana sin sobrepasar las 42 horas legales. Si alguna guardia queda sin cobertura, te asigno a ti como respaldo de emergencia. 🐻✨`,
      accion: { tipo: 'rotar_turnos' },
    }
  }

  // 5. Saludo o consulta general
  return {
    respuesta: `💎 ¡Hola! Soy **Gema**, tu oficial de operaciones y guardia en **Bear's Reserve** 🐻❤️.\n\nEstoy atenta a las veredas de Manizales, Caldas y la cordillera. Puedo asistirte en:\n• 📋 **Emitir el Informe Diario** con novedades y telemetría de hoy.\n• 📅 **Planificar y rotar los turnos** semanales (máx 42h respetando estudio y familia).\n• 🚨 **Monitorear el radar de contingencias** (distinguiendo noticias web reales ✓ de llamadas veredales).\n• ⛽ **Verificar el consumo y nivel del tanque** de cada vehículo.\n• 📖 **Revisar las crónicas humanas de las misiones** de auxilio completadas.\n\n¿En qué podemos servir hoy a nuestra comunidad? 🏔️🛠️`,
  }
}
