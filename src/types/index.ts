export type TimestampLike = any;

export interface User {
  email: string;
  nombre: string;
  pais: 'CO';
  moneda: 'COP';
  preferencias: {
    tema: 'light' | 'dark';
    notificaciones: boolean;
    zonaHoraria: 'America/Bogota';
  };
  configCalendario: {
    conectado: boolean;
    calendarId?: string;
    syncEnabled: boolean;
  };
  fcmTokens: string[];
  creado: TimestampLike;
  actualizado: TimestampLike;
}

export interface CuentaBanco {
  nombre: string;
  tipo: 'ahorros' | 'corriente' | 'digital' | 'efectivo' | 'inversion';
  saldoActual: number;
  moneda: 'COP';
  activa: boolean;
  orden: number;
  actualizado: TimestampLike;
}

export interface Deuda {
  nombre: string;
  tipo: 'hipoteca' | 'consumo' | 'tarjeta' | 'vehiculo' | 'otro';
  entidad: string;
  montoInicial: number;
  saldoPendiente: number;
  cuotaMensual: number;
  tasaInteres: number;
  tipoTasa: 'nominal_mensual' | 'EA' | 'nominal_anual';
  fechaInicio: string | Date;
  plazoMeses: number;
  fechaVencimientoCuota: number;
  estado: 'activa' | 'pagada' | 'congelada';
  incluyeSeguro?: boolean;
  gastosAsociadosMensuales?: number;
  amortizacion: 'frances' | 'aleman' | 'libre';
  notas: string;
  actualizado: TimestampLike;
}

export interface VehiculoSOAT {
  vigente: boolean;
  aseguradora: string;
  numeroPoliza: string;
  fechaVencimiento: string;
  valorPrimaAnual: number;
  cobertura: string;
  fuente: 'investigado_IA' | 'manual';
}

export interface VehiculoTecnicomecanica {
  vigente: boolean;
  centroRevision: string;
  fechaVencimiento: string;
  costoRevision: number;
  tipo: 'vigente';
  fuente: 'investigado_IA' | 'manual';
}

export interface VehiculoSeguroTR {
  tiene: boolean;
  vigente: boolean;
  aseguradora: string;
  numeroPoliza: string;
  fechaVencimiento: string;
  valorPrimaAnual: number;
  periodicidad: 'anual' | 'mensual' | 'semestral';
  deducible?: number;
  cobertura: string;
  fuente: 'investigado_IA' | 'manual';
}

export interface Vehiculo {
  placa: string;
  marca: string;
  linea: string;
  modelo: number;
  tipo: 'carro' | 'moto' | 'camion' | 'otro';
  cilindraje?: number;
  claseVehiculo?: string;
  valorComercial: number;
  valorPatrimonial?: number;
  propietario: string;
  activo: boolean;
  soat: VehiculoSOAT;
  tecnicomecanica: VehiculoTecnicomecanica;
  seguroTodoRiesgo: VehiculoSeguroTR;
  otrosGastos: Array<{ concepto: string; periodicidad: 'mensual' | 'trimestral' | 'anual'; valor: number }>;
  gastosMensualesCalculados: number;
  notas: string;
  actualizado: TimestampLike;
  investigadoIA?: TimestampLike;
}

export interface Propiedad {
  nombre: string;
  direccion: string;
  tipo: 'vivienda' | 'comercial' | 'terreno' | 'otro';
  valorCatastral?: number;
  valorComercialEstimado: number;
  valorPatrimonial: number;
  avaluoFecha?: string;
  hipotecaAsociadaId?: string;
  gastosMensualesFijos: Array<{ concepto: string; valor: number }>;
  impuestos: {
    predial: {
      vigente: boolean;
      fechaVencimiento?: string;
      valorAnual?: number;
      municipio: string;
      fuente: 'investigado_IA' | 'manual';
    };
  };
  intereses?: Array<{ concepto: string; tipo: 'mensual' | 'anual'; valor: number; descripcion: string }>;
  gastosMensualesCalculados: number;
  notas: string;
  actualizado: TimestampLike;
}

export interface Nomina {
  nombreCompleto: string;
  cargo: string;
  activo: boolean;
  tipoContrato: 'indefinido' | 'fijo' | 'obra' | 'aprendiz';
  salarioBaseMensual: number;
  moneda: 'COP';
  asignacion: {
    vehiculoId?: string;
    propiedadId?: string;
    otros?: string;
  };
  primaServicios: {
    aplica: boolean;
    mitadJulio: boolean;
    mitadDiciembre: boolean;
  };
  otrosConceptos: Array<{ concepto: string; tipo: 'devengo' | 'deduccion'; valorMensual: number; periodicidad: 'mensual' | 'anual' }>;
  salarioTotalMensualEstimado: number;
  fechaPago: { dia: number; tipo: 'mensual' | 'quincenal' | 'semanal' };
  notas: string;
  creado: TimestampLike;
  actualizado: TimestampLike;
}

export interface GastoRecurrente {
  concepto: string;
  categoria: 'hogar' | 'transporte' | 'salud' | 'educacion' | 'servicios' | 'otro';
  valor: number;
  periodicidad: 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
  diaVencimiento?: number;
  fechaInicio: string;
  fechaFin?: string;
  activo: boolean;
  autoGenerarEnChat: boolean;
  notas: string;
  actualizado: TimestampLike;
}

export interface Movimiento {
  fecha: string;
  hora?: string;
  tipo: 'gasto' | 'ingreso' | 'transferencia' | 'pago_deuda' | 'pago_nomina' | 'impuesto' | 'seguro' | 'mantenimiento' | 'otro';
  concepto: string;
  descripcion: string;
  monto: number;
  categoria: string;
  subcategoria?: string;
  cuentaBancoId?: string;
  deudaId?: string;
  vehiculoId?: string;
  propiedadId?: string;
  nominaId?: string;
  recurrenteId?: string;
  etiquetas: string[];
  fuente: 'chat_IA' | 'manual' | 'automatico';
  estado: 'confirmado' | 'pendiente' | 'anulado';
  notasIA?: string;
  creado: TimestampLike;
  actualizado: TimestampLike;
}

export interface CalendarioEvento {
  googleEventId?: string;
  titulo: string;
  descripcion: string;
  tipo: 'pago_sueldo' | 'nomina_trabajador' | 'prima_julio' | 'prima_diciembre' | 'soat' | 'tecnicomecanica' | 'seguro_tr' | 'predial' | 'impuesto' | 'cuota_deuda' | 'recurrente' | 'personal';
  fechaInicio: string;
  fechaFin?: string;
  allDay: boolean;
  recurrente: boolean;
  reglaRecurrencia?: string;
  recordatorios: Array<{ minutosAntes: number }>;
  relacionado: {
    vehiculoId?: string;
    deudaId?: string;
    propiedadId?: string;
    nominaId?: string;
    recurrenteId?: string;
  };
  sincronizadoGoogle: boolean;
  activo: boolean;
  creado: TimestampLike;
  actualizado: TimestampLike;
}

export interface ConfigSistema {
  version: string;
  pais: 'CO';
  moneda: 'COP';
  googleCalendarSync: boolean;
  fcmEnabled: boolean;
  mantenimiento: boolean;
  actualizado: TimestampLike;
}

export interface ResumenMensual {
  ingresos: number;
  gastos: number;
  balance: number;
  porCategoria: Record<string, number>;
  porCuenta: Record<string, number>;
  generadoIA: boolean;
  actualizado: TimestampLike;
}
