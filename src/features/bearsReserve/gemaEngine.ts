import { hoyISO } from '@/lib/fechas'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MisionComunitaria,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'

export const EVENTOS_RADAR_PREDETERMINADOS: EventoRadarLocal[] = [
  {
    id: 'rad-1',
    titulo: 'Vía rural La Cabaña tapada por deslizamiento de lodo',
    lugar: 'Vereda La Cabaña · Manizales',
    departamento: 'Caldas',
    fuenteNoticia: 'Alerta Comunitaria WhatsApp Verdes',
    resumen: 'Caída de tierra y árboles tapando el paso hacia 3 fincas y la escuela veredal. No hay maquinaria oficial en el sector.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Comunidad incomunicada sin atención oficial. Ideal para el camión o campero con winche y herramientas de despeje.',
  },
  {
    id: 'rad-2',
    titulo: 'Ruta escolar rural diaria: Vereda El Rosario hacia Escuela Rural',
    lugar: 'Vereda El Rosario ↔ Escuela Rural La Trinidad',
    departamento: 'Caldas',
    fuenteNoticia: 'Plan Escolar Comunitario Bear\'s Reserve',
    resumen: '14 niños de veredas de difícil acceso necesitan transporte diario matutino y vespertino por camino destapado.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    recomendacionGema: 'ruta_escolar_rutinaria',
    justificacionGema: 'Misión sagrada de la reserva. Transporte seguro de los niños en campero de alta tracción.',
  },
  {
    id: 'rad-3',
    titulo: 'Camión ganadero atascado en barrizal profundo',
    lugar: 'Sector Bajo Tablazo · Manizales',
    departamento: 'Caldas',
    fuenteNoticia: 'Red de Apoyo Vial Rural',
    resumen: 'Camión con carga atascado hasta el eje en barrizal por lluvias recientes. Bloquea el paso de campesinos locales.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: false,
    recomendacionGema: 'intervenir_urgente',
    justificacionGema: 'Auxilio directo a campesinos. Se requiere el camión de rescate pesado 4x4 con cables de arrastre.',
  },
  {
    id: 'rad-4',
    titulo: 'Congestión por choque leve en Autopista Medellín - Bogotá',
    lugar: 'Municipio de Cocorná · Antioquia',
    departamento: 'Antioquia',
    fuenteNoticia: 'Noticias Antioquia Movilidad',
    resumen: 'Colisión simple de dos vehículos particulares generando fila de 2 km.',
    fecha: hoyISO(),
    esEmergenciaGrave: false,
    atencionOficialPresente: true,
    recomendacionGema: 'monitorear_sin_intervenir',
    justificacionGema: 'Queda en Antioquia y cuenta con Policía de Tránsito y grúas de concesión vial. No amerita despliegue lejano.',
  },
  {
    id: 'rad-5',
    titulo: 'Crecida de quebrada afectando paso hacia vereda rural',
    lugar: 'Vereda San Peregrino · Límites Caldas - Risaralda',
    departamento: 'Risaralda',
    fuenteNoticia: 'Comité de Gestión Comunitaria',
    resumen: 'Paso de vado inundado, incomunica a familias campesinas para sacar productos agrícolas y acceder a víveres.',
    fecha: hoyISO(),
    esEmergenciaGrave: true,
    atencionOficialPresente: false,
    recomendacionGema: 'apoyo_logistico',
    justificacionGema: 'Límites cercanos con Risaralda. Justificado llevar asistencia y víveres con campero alto.',
  },
]

/**
 * Motor de rotación inteligente de turnos:
 * 1. Respeta horarios no disponibles de cada trabajador (universidad, familia).
 * 2. Asigna un tope de 42 horas semanales.
 * 3. Si queda algún hueco de guardia sin cubrir, asigna al Coordinador (tú) como respaldo de emergencia.
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
    const diaSemanaNum = (fechaDia.getDay() + 6) % 7 // 0=Lunes, ..., 6=Domingo
    const nombreDia = DIAS[diaSemanaNum]

    // Definición de franjas de guardia
    const franjas: Array<{
      franja: TurnoSemanal['franja']
      horaInicio: string
      horaFin: string
      horas: number
      rol: string
      requiereTrocha?: boolean
    }> = [
      {
        franja: 'manana',
        horaInicio: '06:00',
        horaFin: '13:00',
        horas: 7,
        rol: 'Guardia Matutina y Ruta Escolar Rural',
        requiereTrocha: true,
      },
      {
        franja: 'tarde',
        horaInicio: '13:00',
        horaFin: '20:00',
        horas: 7,
        rol: 'Guardia Vespertina y Despeje de Vías',
      },
    ]

    for (const f of franjas) {
      // Buscar el mejor candidato disponible
      const candidatos = empleados.filter((emp) => {
        if (!emp.activo) return false
        // No superar 42h
        if ((horasAsignadas[emp.id] || 0) + f.horas > 42) return false
        // Revisar si choca con horario no disponible
        const choca = emp.horariosNoDisponibles.some((h) => {
          if (h.diaSemana !== diaSemanaNum + 1) return false
          // Si hay traslape de horas
          return h.horaInicio < f.horaFin && h.horaFin > f.horaInicio
        })
        return !choca
      })

      // Ordenar por quien tiene menos horas acumuladas para rotar equitativamente
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
        // HUECO DETECTADO: El usuario (coordinador general) queda asignado como respaldo de emergencia
        turnos.push({
          id: `tur-${fechaISO}-${f.franja}-respaldo`,
          semanaISO: fechaLunesISO,
          empleadoId: 'coord-user',
          empleadoNombre: 'Tú (Coordinador de Respaldo)',
          esRespaldoCoordinador: true,
          fecha: fechaISO,
          franja: f.franja,
          horaInicio: f.horaInicio,
          horaFin: f.horaFin,
          horas: f.horas,
          rolGuardia: `🚨 ${f.rol} · Respaldo de Emergencia (${nombreDia})`,
          cumplido: false,
          notas: 'Asignado automáticamente por Gema: todos los empleados tenían compromisos personales o coparon sus 42 horas.',
        })
      }
    }
  }

  return turnos
}

/**
 * Chat e Inteligencia de Gema 💎
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
    | { tipo: 'completar_mision'; misionId: string }
} {
  const q = mensaje.toLowerCase().trim()

  // 1. Consulta de turnos o quién está trabajando
  if (q.includes('quién está') || q.includes('quien esta') || q.includes('trabajando') || q.includes('turno')) {
    const activos = contexto.empleados.filter((e) => e.enTurnoActivo || e.activo)
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
      detalleTurnos = activos
        .map(
          (e) =>
            `• 👤 **${e.nombreCompleto}** (${e.cargo}): ${e.horasSemanalesAsignadas}/42h semanales · *${e.turnoActualTexto || 'Guardia activa'}*`
        )
        .join('\n')
    }

    return {
      respuesta: `🐻 ¡Hola de corazón! Te cuento el estado de guardia comunitaria para hoy:\n\n${detalleTurnos}\n\n💎 Todos listos para apoyar a las veredas y atender contingencias en la montaña. ¿Deseas reasignar alguna franja o verificar la ruta escolar? ❤️`,
    }
  }

  // 2. Consulta de flota y combustible
  if (q.includes('combustible') || q.includes('gasolina') || q.includes('diesel') || q.includes('tanque') || q.includes('flota')) {
    const detalleFlota = contexto.vehiculos
      .map((v) => {
        const alertaReserva = v.nivelCombustiblePorc <= 20 ? ' ⚠️ (Cerca de reserva)' : ''
        return `• 🚚 **${v.marca} ${v.linea}** (${v.placa || 'En servicio'}): Tanque al **${v.nivelCombustiblePorc}%** · ${v.tipoCombustible.toUpperCase()} · Odómetro: **${v.kilometrajeActual.toLocaleString('es-CO')} km** · Llantas: **${v.desgasteLlantasPorc}% desgaste**${alertaReserva}`
      })
      .join('\n')

    return {
      respuesta: `🏔️ Estado de nuestra flota comunitaria Bear's Reserve:\n\n${detalleFlota}\n\n⛽ Recuerda que si algún vehículo baja del 15%, nuestro sistema tanqueará automáticamente al 100% y cargará el costo a la tarjeta mensual para que no nos quedemos varados en plena cordillera. 💎`,
    }
  }

  // 3. Solicitud de rotación de turnos
  if (q.includes('rotar') || q.includes('organizar turnos') || q.includes('cuadrar turnos') || q.includes('nueva semana')) {
    return {
      respuesta: `💎 ¡Entendido! He verificado los horarios universitarios y personales del equipo, cuidando el límite legal de 42 horas semanales. Si alguna franja queda desierta por compromisos médicos o académicos, te dejaré a ti como respaldo de emergencia. Procedo a recalcular la rotación. 🐻✨`,
      accion: { tipo: 'rotar_turnos' },
    }
  }

  // 4. Saludo o consulta general
  return {
    respuesta: `💎 ¡Hola! Soy **Gema**, tu oficial de operaciones de **Bear's Reserve** 🐻❤️.\n\nEstoy atenta a las veredas de Manizales y los municipios vecinos. Puedo ayudarte a:\n• 📅 **Planificar y rotar los turnos** semanales (máx 42h cuidando estudios y familia).\n• 🚨 **Monitorear el radar de eventos** en trochas y vías de Caldas/Risaralda/Tolima.\n• ⛽ **Verificar el combustible y desgaste** de camiones y camionetas 4x4.\n• 🎒 **Asignar la ruta escolar rural** o misiones de rescate en barrizales.\n\n¿En qué misión o servicio a la comunidad nos enfocamos hoy? 🏔️🛠️`,
  }
}
