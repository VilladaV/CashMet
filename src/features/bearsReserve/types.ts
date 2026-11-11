export type TipoCombustible = 'corriente' | 'diesel' | 'extra'

export type EstadoVehiculoOperativo = 'disponible' | 'en_mision' | 'mantenimiento' | 'reserva'

export type TerrenoRuta = 'pavimento' | 'trocha_moderada' | 'trocha_extrema_barrizal' | 'mixto_montaña'

export type PrioridadGeografica = 'local_manizales' | 'eje_cercano' | 'regional_caldas_risaralda' | 'nacional_extrema_urgencia'

export interface PreciosCombustible {
  corrientePorGalon: number
  dieselPorGalon: number
  extraPorGalon: number
  actualizado: string
}

export interface VehiculoOperativo {
  id: string
  vehiculoId: string
  placa?: string
  marca: string
  linea: string
  modelo?: number | null
  tipo: 'carro' | 'moto' | 'camion' | 'otro'
  rolOperativo: 'rescate_pesado' | 'transporte_rural_escolar' | 'apoyo_rapido' | 'logistica_ayudas' | 'campero_trochero'
  disponibleParaTrabajo: boolean
  estado: EstadoVehiculoOperativo
  // Tanque y combustible
  tipoCombustible: TipoCombustible
  capacidadTanqueGalones: number
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
  habilidades: Array<
    | 'conductor_trocha_pesada'
    | 'mecanica_emergencia'
    | 'primeros_auxilios'
    | 'rescate_en_barro'
    | 'logistica_comunitaria'
    | 'comunicacion_radio'
    | 'navegacion_rural'
  >
  horasSemanalesAsignadas: number // Meta legal: máx 42h
  maxHorasSemanales: number // 42
  activo: boolean
  horariosNoDisponibles: HorarioPersonalEmpleado[]
  enTurnoActivo: boolean
  turnoActualTexto?: string
}

export interface TurnoSemanal {
  id: string
  semanaISO: string // ej. "2026-W46"
  empleadoId: string
  empleadoNombre: string
  esRespaldoCoordinador?: boolean // Para cuando tú quedas asignado de emergencia
  fecha: string // YYYY-MM-DD
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
  tipo: 'escolar_rural' | 'derrumbe_via_tapada' | 'desvarado_auxilio' | 'rescate_barrizal' | 'entrega_ayudas' | 'contingencia_vial'
  prioridad: 'baja' | 'media' | 'alta' | 'critica_extrema'
  origen: string
  destino: string
  departamento: 'Caldas' | 'Risaralda' | 'Tolima' | 'Antioquia' | 'Otro'
  prioridadGeografica: PrioridadGeografica
  justificacionSalidaLejana?: string
  terreno: TerrenoRuta
  distanciaKmIdaYVuelta: number
  duracionEstimadaHoras: number
  empleadosAsignados: Array<{ id: string; nombre: string }>
  vehiculoId: string
  vehiculoNombre: string
  galonesConsumidosEstimados: number
  costoCombustibleEstimadoCOP: number
  desgasteLlantasIncrementoPorc: number
  fecha: string
  estado: 'programada' | 'en_curso' | 'completada' | 'cancelada'
  impactoSocial: string
  esProgramadaCalendario?: boolean
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
  mes: string // YYYY-MM
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
  recomendacionGema: 'intervenir_urgente' | 'apoyo_logistico' | 'ruta_escolar_rutinaria' | 'monitorear_sin_intervenir'
  justificacionGema: string
}
