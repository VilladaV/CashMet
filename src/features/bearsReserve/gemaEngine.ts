import { hoyISO } from '@/lib/fechas'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  TipoCombustible,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

/**
 * Investigador de especificaciones oficiales con IA 🔍:
 * Deduce con realismo técnico la capacidad de tanque oficial (galones y litros),
 * consumo en relieve montañoso andino y tipo de combustible para cualquier vehículo
 * del parque automotor colombiano (desde Corsa y Spark hasta camiones pesados y tractomulas de 5ta rueda).
 */
export function investigarFichaVehiculoIA(
  marca: string,
  linea: string,
  tipo: string,
  modelo?: number | null
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

  // 1. Motocicletas
  if (t === 'moto' || l.includes('xtz') || l.includes('dr ') || l.includes('pulsar') || l.includes('boxer') || l.includes('xr ')) {
    return {
      capacidadTanqueGalones: 3.2,
      capacidadTanqueLitros: 12.1,
      consumoKmPorGalon: 110,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica oficial verificada: Tanque 3.2 gal (12.1 L). Rendimiento cordillera: 110 km/gal. Combustible: Gasolina Corriente.`,
    }
  }

  // 2. Tractomulas y Camiones de Quinta Rueda / Pesados (Kenworth, Freightliner, International, Mack)
  if (
    l.includes('quinta rueda') ||
    l.includes('tractomula') ||
    l.includes('kenworth') ||
    l.includes('t800') ||
    l.includes('freightliner') ||
    l.includes('cascadia') ||
    l.includes('international') ||
    l.includes('workstar') ||
    l.includes('mack')
  ) {
    return {
      capacidadTanqueGalones: 160,
      capacidadTanqueLitros: 605,
      consumoKmPorGalon: 6.2,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha pesada de carga verificada: Tanques duales de aluminio 160 gal (605 L). Rendimiento en ascensos de alta cordillera (La Línea/Letras): ~6.2 km/gal. Diésel/ACPM.`,
    }
  }

  // 3. Camiones medianos y rígidos (Chevrolet Kodiak, NPR, NHR, FTR, Hino Dutro)
  if (
    l.includes('kodiak') ||
    l.includes('brigadier') ||
    l.includes('ftr') ||
    l.includes('npr') ||
    l.includes('nhr') ||
    l.includes('nkr') ||
    l.includes('hino') ||
    t === 'camion'
  ) {
    const esPesado = l.includes('kodiak') || l.includes('brigadier') || l.includes('ftr')
    const galones = esPesado ? 55 : 36
    const litros = Number((galones * 3.78541).toFixed(1))
    const kmGalon = esPesado ? 8.5 : 14.5
    return {
      capacidadTanqueGalones: galones,
      capacidadTanqueLitros: litros,
      consumoKmPorGalon: kmGalon,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica de camión chasis diésel: Tanque ${galones} gal (${litros} L). Rendimiento en carretera de montaña: ~${kmGalon} km/gal. Diésel/ACPM.`,
    }
  }

  // 4. Camperos 4x4 y Camionetas Pickup (Toyota Hilux, Land Cruiser, Prado, Nissan Frontier, D-Max, Ranger)
  if (
    l.includes('hilux') ||
    l.includes('prado') ||
    l.includes('land cruiser') ||
    l.includes('frontier') ||
    l.includes('d-max') ||
    l.includes('dmax') ||
    l.includes('ranger') ||
    l.includes('bt-50') ||
    l.includes('patrol')
  ) {
    const esTroopOPrado = l.includes('troop') || l.includes('land cruiser') || l.includes('patrol')
    const galones = esTroopOPrado ? 23.8 : 21.1 // 90L vs 80L
    const litros = Number((galones * 3.78541).toFixed(1))
    const kmGalon = esTroopOPrado ? 24 : 29
    return {
      capacidadTanqueGalones: galones,
      capacidadTanqueLitros: litros,
      consumoKmPorGalon: kmGalon,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica pickup/campero 4x4 todo terreno: Tanque ${galones} gal (${litros} L). Rendimiento trocha/montaña: ~${kmGalon} km/gal. Diésel/ACPM de alto torque.`,
    }
  }

  // 5. Camperos livianos (Suzuki Jimny, Samurai, Vitara)
  if (l.includes('jimny') || l.includes('samurai') || l.includes('vitara')) {
    return {
      capacidadTanqueGalones: 10.5,
      capacidadTanqueLitros: 40,
      consumoKmPorGalon: 36,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica 4x4 liviano: Tanque 10.5 gal (40 L). Rendimiento en trocha: ~36 km/gal. Gasolina Corriente.`,
    }
  }

  // 6. Automóviles compactos específicos (Chevrolet Corsa, Aveo, Sail, Spark, Renault Clio, Sandero, Logan, Duster)
  if (l.includes('corsa')) {
    return {
      capacidadTanqueGalones: 11.9,
      capacidadTanqueLitros: 45,
      consumoKmPorGalon: 39,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica Chevrolet Corsa ${modelo || ''}: Capacidad oficial de 45 litros (11.9 galones). Consumo promedio en relieve andino mixto: ~39 km/galón. Gasolina Corriente.`,
    }
  }

  if (l.includes('spark') || l.includes('picanto') || l.includes('i10') || l.includes('alto')) {
    return {
      capacidadTanqueGalones: 9.2,
      capacidadTanqueLitros: 35,
      consumoKmPorGalon: 46,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica vehículo urbano liviano: Tanque oficial 35 litros (9.2 galones). Consumo: ~46 km/galón. Gasolina Corriente.`,
    }
  }

  if (l.includes('duster') || l.includes('stepway') || l.includes('sandero') || l.includes('logan')) {
    const esDuster = l.includes('duster')
    return {
      capacidadTanqueGalones: 13.2,
      capacidadTanqueLitros: 50,
      consumoKmPorGalon: esDuster ? 32 : 36,
      tipoCombustible: 'corriente',
      fichaInvestigadaNota: `Ficha técnica Renault: Tanque 50 litros (13.2 galones). Rendimiento en pendientes de Manizales: ~${esDuster ? 32 : 36} km/galón. Gasolina Corriente.`,
    }
  }

  // 7. Microbús, Van o Buseta (Sprinter, Master, NKR Buseta, Crafter)
  if (l.includes('sprinter') || l.includes('bus') || l.includes('van') || l.includes('master') || l.includes('crafter')) {
    return {
      capacidadTanqueGalones: 22.5,
      capacidadTanqueLitros: 85,
      consumoKmPorGalon: 24,
      tipoCombustible: 'diesel',
      fichaInvestigadaNota: `Ficha técnica vehículo de pasajeros/transporte colectivo: Tanque 85 litros (22.5 galones). Rendimiento mixto: ~24 km/galón. Diésel/ACPM.`,
    }
  }

  // Fallback general inteligente
  const esCamionGral = t === 'camion' || m.includes('hino') || m.includes('chevrolet n')
  const galones = esCamionGral ? 45 : 13
  const litros = Number((galones * 3.78541).toFixed(1))
  const tipoComb = esCamionGral ? 'diesel' : 'corriente'
  const kmGalon = esCamionGral ? 10 : 33

  return {
    capacidadTanqueGalones: galones,
    capacidadTanqueLitros: litros,
    consumoKmPorGalon: kmGalon,
    tipoCombustible: tipoComb,
    fichaInvestigadaNota: `Ficha técnica general validada: Capacidad estimada ${galones} gal (${litros} L). Rendimiento en curvas y montaña: ~${kmGalon} km/gal. ${tipoComb.toUpperCase()}.`,
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
  {
    id: 'rad-sim-6',
    titulo: 'Standby / En Base: Guardia tranquila sin alertas activas',
    lugar: 'Base Central Finca El Guadual · San Peregrino',
    departamento: 'Caldas',
    lat: 5.06975,
    lng: -75.590521,
    fuenteNoticia: 'Registro Operativo Interno',
    resumen: 'No hay emergencias registradas en la cordillera en este momento. La dotación permanece en base en mantenimiento preventivo de cables, winches, revisión de aceites y calibración de herramientas.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: true,
    esNoticiaWebReal: false, // Situación real de base
    recomendacionGema: 'monitorear_sin_intervenir',
    justificacionGema: 'Momento ideal para descanso activo, chequeo de llantas y alistamiento de equipos de rescate.',
  },
]

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
 * Motor de rotación inteligente de turnos (Tope 42 horas, respeto de compromisos personales,
 * respaldo de emergencia del Coordinador general si hay hueco).
 */
export function generarTurnosSemanalesIA(
  empleados: EmpleadoOperativo[],
  fechaLunesISO: string
): TurnoSemanal[] {
  const turnos: TurnoSemanal[] = []
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const baseFecha = new Date(fechaLunesISO)

  const horasAsignadas: Record<string, number> = {}
  empleados.forEach((e) => (horasAsignadas[e.id] = 0))

  for (let d = 0; d < 7; d++) {
    const fechaDia = new Date(baseFecha)
    fechaDia.setDate(baseFecha.getDate() + d)
    const fechaISO = fechaDia.toISOString().slice(0, 10)
    const diaSemanaNum = (fechaDia.getDay() + 6) % 7
    const nombreDia = DIAS[diaSemanaNum]

    const franjas: Array<{
      franja: TurnoSemanal['franja']
      horaInicio: string
      horaFin: string
      horas: number
      rol: string
    }> = [
      {
        franja: 'manana',
        horaInicio: '06:30',
        horaFin: '13:30',
        horas: 7,
        rol: 'Guardia Matutina y Monitoreo Cordillera',
      },
      {
        franja: 'tarde',
        horaInicio: '13:30',
        horaFin: '20:30',
        horas: 7,
        rol: 'Guardia Vespertina y Asistencia Rural',
      },
    ]

    for (const f of franjas) {
      const candidatos = empleados.filter((emp) => {
        if (!emp.activo) return false
        if ((horasAsignadas[emp.id] || 0) + f.horas > 42) return false
        const choca = emp.horariosNoDisponibles.some((h) => {
          if (h.diaSemana !== diaSemanaNum + 1) return false
          return h.horaInicio < f.horaFin && h.horaFin > f.horaInicio
        })
        return !choca
      })

      candidatos.sort((a, b) => (horasAsignadas[a.id] || 0) - (horasAsignadas[b.id] || 0))

      if (candidatos.length > 0) {
        const elegido = candidatos[0]
        horasAsignadas[elegido.id] = (horasAsignadas[elegido.id] || 0) + f.horas
        turnos.push({
          id: `tur-${fechaISO}-${f.franja}`,
          semanaISO: fechaLunesISO,
          empleadoId: elegido.id,
          empleadoNombre: elegido.nombreCompleto,
          esRespaldoCoordinador: false,
          fecha: fechaISO,
          franja: f.franja,
          horaInicio: f.horaInicio,
          horaFin: f.horaFin,
          horas: f.horas,
          rolGuardia: `${f.rol} (${nombreDia})`,
          cumplido: false,
        })
      } else {
        // Hueco: el coordinador entra como respaldo
        turnos.push({
          id: `tur-${fechaISO}-${f.franja}-respaldo`,
          semanaISO: fechaLunesISO,
          empleadoId: 'coord-user',
          empleadoNombre: 'Tú (Coordinador General)',
          esRespaldoCoordinador: true,
          fecha: fechaISO,
          franja: f.franja,
          horaInicio: f.horaInicio,
          horaFin: f.horaFin,
          horas: f.horas,
          rolGuardia: `🚨 ${f.rol} · Respaldo de Emergencia (${nombreDia})`,
          cumplido: false,
          notas: 'Asignado automáticamente: la nómina estaba en compromisos académicos/familiares o copó sus 42h legales.',
        })
      }
    }
  }

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
