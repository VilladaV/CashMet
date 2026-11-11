export type TipoCombustible = 'corriente' | 'diesel' | 'extra'

export type EstadoVehiculoOperativo = 'disponible' | 'en_mision' | 'mantenimiento' | 'reserva'

export type TerrenoRuta = 'pavimento' | 'trocha_moderada' | 'trocha_extrema_barrizal' | 'mixto_montaña'

export type PrioridadGeografica = 'local_manizales' | 'eje_cercano' | 'regional_caldas_risaralda' | 'nacional_extrema_urgencia'

export interface PreciosCombustible {
  corrientePorGalon: number
  dieselPorGalon: number
  extraPorGalon: number
  actualizado: string
  fuente: string
}

export interface VehiculoOperativo {
  id: string
  vehiculoId: string
  placa?: string
  marca: string
  linea: string
  modelo?: number | null
  tipo: 'carro' | 'moto' | 'camion' | 'otro'
  disponibleParaTrabajo: boolean // Solo los que están habilitados para Bear's Reserve
  investigadoIA?: boolean // Si ya se investigó su tanque y consumo oficial
  fichaInvestigadaNota?: string
  estado: EstadoVehiculoOperativo
  // Tanque y combustible
  tipoCombustible: TipoCombustible
  capacidadTanqueGalones: number
  capacidadTanqueLitros?: number
  nivelCombustiblePorc: number // 0 a 100
  consumoKmPorGalon: number // En montaña/trocha
  // Odómetro y telemetría de desgaste
  kilometrajeActual: number
  kilometrajeInicialMision?: number
  desgasteLlantasPorc: number // 0% nuevo a 100% gastado
  estadoBateriaPorc: number
  totalGalonesConsumidos: number
  totalCostoCombustibleCOP: number
}

export interface HorarioPersonalEmpleado {
  diaSemana: number // 0: Dom, 1: Lun, ..., 6: Sab
  horaInicio: string // "08:00"
  horaFin: string // "12:00"
  motivo: string // "Universidad", "Cursos", "Familiar"
}

export interface EmpleadoOperativo {
  id: string
  nominaId?: string
  nombreCompleto: string
  cargo: string
  habilidades: string[]
  horasSemanalesAsignadas: number // Meta legal: máx 42h
  maxHorasSemanales: number // 42
  activo: boolean
  horariosNoDisponibles: HorarioPersonalEmpleado[]
  enTurnoActivo: boolean
  turnoActualTexto?: string
}

export interface TurnoSemanal {
  id: string
  semanaISO: string
  empleadoId: string
  empleadoNombre: string
  esRespaldoCoordinador?: boolean
  fecha: string
  franja: 'manana' | 'tarde' | 'noche' | 'jornada_completa'
  horaInicio: string
  horaFin: string
  horas: number
  rolGuardia: string
  cumplido?: boolean
  notas?: string
}

export interface MisionComunitaria {
  id: string
  titulo: string
  tipo: 'auxilio_comunitario' | 'desvarado_rural' | 'rescate_barrizal' | 'transporte_humanitario' | 'apoyo_vial' | 'ruta_habitual'
  prioridad: 'baja' | 'media' | 'alta' | 'critica_extrema'
  origen: string
  destino: string
  departamento: 'Caldas' | 'Risaralda' | 'Tolima' | 'Antioquia' | 'Otro'
  prioridadGeografica: PrioridadGeografica
  terreno: TerrenoRuta
  distanciaKmIdaYVuelta: number
  duracionMinutos: number // Desde 15 min hasta 8 horas
  // Varios vehículos y varios tripulantes posibles
  vehiculosAsignados: Array<{ id: string; nombre: string; placa?: string }>
  tripulantesAsignados: Array<{ id: string; nombre: string }>
  galonesConsumidosEstimados: number
  costoCombustibleEstimadoCOP: number
  desgasteLlantasIncrementoPorc: number
  fecha: string
  horaInicio?: string
  horaFin?: string
  estado: 'programada' | 'en_curso' | 'completada' | 'inconclusa_repliegue'
  resultado?: 'exito' | 'parcial' | 'fallida_dificultad' | 'en_curso'
  // Crónica / historia humana de lo que ocurrió
  cronicaHistoria?: string
  impactoSocial: string
  esNoticiaWebReal?: boolean
}

export interface RutaHabitual {
  id: string
  nombre: string
  descripcion: string
  origen: string
  destino: string
  distanciaKm: number
  diasSemana: number[] // 1: Lun, 2: Mar, etc.
  vehiculoIdDefault?: string
  activa: boolean
  ultimoCumplimientoFecha?: string
}

export interface TanqueoRegistro {
  id: string
  vehiculoId: string
  vehiculoPlaca?: string
  vehiculoNombre: string
  fecha: string
  hora: string
  galones: number
  tipoCombustible: TipoCombustible
  precioPorGalon: number
  totalCOP: number
  odometroKm: number
  motivo: 'reserva_automatica' | 'preventivo_mision' | 'manual'
}

export interface TarjetaCombustibleReserva {
  id: string
  mes: string
  saldoAcumuladoCOP: number
  totalGalonesMes: number
  tanqueos: TanqueoRegistro[]
  liquidadoEnCashmet: boolean
  fechaLiquidacion?: string
  cuentaBancoIdCashmet?: string
  movimientoIdCashmet?: string
}

export interface EventoRadarLocal {
  id: string
  titulo: string
  lugar: string
  departamento: string
  fuenteNoticia: string
  resumen: string
  fecha: string
  esEmergenciaGrave: boolean
  atencionOficialPresente: boolean
  esNoticiaWebReal: boolean // True si proviene de internet (chulito discreto), False si es llamada comunitaria
  recomendacionGema: 'intervenir_urgente' | 'apoyo_logistico' | 'monitorear_sin_intervenir'
  justificacionGema: string
}
