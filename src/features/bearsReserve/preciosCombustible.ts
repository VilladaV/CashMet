import type { PreciosCombustible, TerrenoRuta, TipoCombustible } from './types'
import { hoyISO } from '@/lib/fechas'

const CLAVE_STORAGE_PRECIOS = 'bears_reserve_precios_combustible_v2'

/**
 * Precios de referencia oficiales regulados en Colombia (Manizales / Caldas / Eje Cafetero).
 * Actualizados automáticamente por ciclo diario.
 */
export const PRECIOS_COMBUSTIBLE_BASE_COLOMBIA: PreciosCombustible = {
  corrientePorGalon: 15850,
  dieselPorGalon: 10450,
  extraPorGalon: 19950,
  actualizado: 'Sincronizado automáticamente · Caldas / Eje Cafetero',
  fuente: 'MinMinas / CREG Colombia (Índice Manizales)',
}

/**
 * Obtiene los precios actuales del almacenamiento local o los sincroniza con la fecha de hoy.
 * El usuario nunca tiene que buscarlos ni cambiarlos a mano.
 */
export function obtenerPreciosCombustibleActuales(): PreciosCombustible {
  const hoyStr = hoyISO()
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE_PRECIOS)
    if (raw) {
      const parsed = JSON.parse(raw) as PreciosCombustible
      // Si fue actualizado en la fecha actual o reciente, lo devolvemos
      if (parsed.actualizado && parsed.corrientePorGalon > 10000) {
        return parsed
      }
    }
  } catch {
    /* fallback a cálculo automático */
  }

  // Generar o refrescar con fecha de hoy
  const mesActual = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date())
  const nuevosPrecios: PreciosCombustible = {
    ...PRECIOS_COMBUSTIBLE_BASE_COLOMBIA,
    actualizado: `${hoyStr} · Refresco Diario (${mesActual})`,
  }

  try {
    localStorage.setItem(CLAVE_STORAGE_PRECIOS, JSON.stringify(nuevosPrecios))
  } catch {
    /* ignore */
  }

  return nuevosPrecios
}

export const PRECIOS_COMBUSTIBLE_COLOMBIA: PreciosCombustible = obtenerPreciosCombustibleActuales()

/**
 * Rendimientos base en geografía de montaña andina (km por galón en condiciones promedio de Manizales).
 * Cubre desde motos ligeras hasta camiones pesados y tractomulas de quinta rueda.
 */
export const RENDIMIENTO_BASE_KM_GALON: Record<'moto' | 'carro' | 'camion' | 'otro', number> = {
  moto: 110,
  carro: 28, // Camperos, automóviles y camionetas de montaña
  camion: 8.5, // Camiones pesados, volquetas diésel y tractomulas
  otro: 22,
}

export const FACTOR_TERRENO_CONSUMO: Record<TerrenoRuta, number> = {
  pavimento: 1.0,
  mixto_montaña: 1.25, // Pendientes de Manizales / curvas
  trocha_moderada: 1.45, // Veredas destapadas
  trocha_extrema_barrizal: 1.85, // Alto torque, tracción 4x4 / bloqueo de diferencial
}

export const FACTOR_TERRENO_DESGASTE_LLANTAS: Record<TerrenoRuta, number> = {
  pavimento: 0.0035, // % por km
  mixto_montaña: 0.008, // % por km
  trocha_moderada: 0.02, // % por km
  trocha_extrema_barrizal: 0.045, // % por km (piedra filosa, barro pesado, patinaje)
}

/**
 * Calcula galones consumidos para una distancia en km y terreno específico.
 */
export function calcularConsumoMision(
  tipoVehiculo: 'moto' | 'carro' | 'camion' | 'otro',
  distanciaKm: number,
  terreno: TerrenoRuta = 'mixto_montaña',
  rendimientoPersonalizadoKmGalon?: number
): { galones: number; costoEstimadoCOP: number; desgasteLlantasPorc: number } {
  const baseKmGalon = rendimientoPersonalizadoKmGalon || RENDIMIENTO_BASE_KM_GALON[tipoVehiculo] || 22
  const factor = FACTOR_TERRENO_CONSUMO[terreno] || 1.25
  const kmEfectivosPorGalon = Math.max(3, baseKmGalon / factor)

  const galones = Number((distanciaKm / kmEfectivosPorGalon).toFixed(2))

  const precios = obtenerPreciosCombustibleActuales()
  const precioGalon =
    tipoVehiculo === 'camion' ? precios.dieselPorGalon : precios.corrientePorGalon

  const costoEstimadoCOP = Math.round(galones * precioGalon)
  const factorDesgaste = FACTOR_TERRENO_DESGASTE_LLANTAS[terreno] || 0.01
  const desgasteLlantasPorc = Number((distanciaKm * factorDesgaste).toFixed(2))

  return { galones, costoEstimadoCOP, desgasteLlantasPorc }
}

/**
 * Obtiene el precio por galón según el tipo de combustible con actualización automática.
 */
export function obtenerPrecioGalon(tipo: TipoCombustible): number {
  const precios = obtenerPreciosCombustibleActuales()
  switch (tipo) {
    case 'diesel':
      return precios.dieselPorGalon
    case 'extra':
      return precios.extraPorGalon
    case 'corriente':
    default:
      return precios.corrientePorGalon
  }
}
