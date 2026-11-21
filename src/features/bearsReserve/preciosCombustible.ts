import type { PreciosCombustible, TerrenoRuta, TipoCombustible } from './types'
import { hoyISO } from '@/lib/fechas'

export const TTL_PRECIOS_MS = 24 * 60 * 60 * 1000 // Refresco automático cada 24 horas

/**
 * Precios de referencia base en Colombia (Manizales / Caldas / Eje Cafetero).
 * Se utilizan solo como respaldo inicial antes de sincronizar con fuente real web (CREG / MinMinas).
 */
export const PRECIOS_COMBUSTIBLE_BASE_COLOMBIA: PreciosCombustible = {
  corrientePorGalon: 15850,
  dieselPorGalon: 10550,
  extraPorGalon: 19950,
  actualizado: 'Referencia local inicial (sin sincronizar aún)',
  fuente: 'Referencia base MinMinas / CREG (Manizales)',
  consultadoEn: 0,
  esFuenteReal: false,
  editadoManualmente: false,
}

let preciosEnCache: PreciosCombustible | null = null

export function establecerPreciosCombustibleCache(precios: PreciosCombustible | null): void {
  preciosEnCache = precios ? { ...precios } : null
}

export function esPrecioDesactualizado(precios?: PreciosCombustible | null, ahora = Date.now()): boolean {
  if (!precios) return true
  if (precios.editadoManualmente) return false
  if (!precios.consultadoEn || !Number.isFinite(precios.consultadoEn)) return true
  return ahora - precios.consultadoEn >= TTL_PRECIOS_MS
}

/**
 * Devuelve los precios actuales en memoria (sincronizados desde Firestore / web).
 * Si aún no se han cargado desde Firestore, devuelve la referencia base sin simular que está auto-actualizada.
 */
export function obtenerPreciosCombustibleActuales(): PreciosCombustible {
  if (preciosEnCache && preciosEnCache.corrientePorGalon > 0) {
    return preciosEnCache
  }
  return {
    ...PRECIOS_COMBUSTIBLE_BASE_COLOMBIA,
    actualizado: `${hoyISO()} · Referencia local (pendiente sincronizar)`,
  }
}

export const PRECIOS_COMBUSTIBLE_COLOMBIA: PreciosCombustible = obtenerPreciosCombustibleActuales()

/**
 * Rendimientos base en geografía de montaña andina (km por galón en condiciones promedio de Manizales).
 */
export const RENDIMIENTO_BASE_KM_GALON: Record<'moto' | 'carro' | 'camion' | 'otro', number> = {
  moto: 110,
  carro: 28,
  camion: 8.5,
  otro: 22,
}

export const FACTOR_TERRENO_CONSUMO: Record<TerrenoRuta, number> = {
  pavimento: 1.0,
  mixto_montaña: 1.25,
  trocha_moderada: 1.45,
  trocha_extrema_barrizal: 1.85,
}

export const FACTOR_TERRENO_DESGASTE_LLANTAS: Record<TerrenoRuta, number> = {
  pavimento: 0.0035,
  mixto_montaña: 0.008,
  trocha_moderada: 0.02,
  trocha_extrema_barrizal: 0.045,
}

/**
 * Calcula galones consumidos, costo real (respetando el tipoCombustible real del vehículo)
 * y desgaste de llantas para una distancia en km y terreno específico.
 */
export function calcularConsumoMision(
  tipoVehiculo: 'moto' | 'carro' | 'camion' | 'otro',
  distanciaKm: number,
  terreno: TerrenoRuta = 'mixto_montaña',
  rendimientoPersonalizadoKmGalon?: number,
  tipoCombustible?: TipoCombustible
): { galones: number; costoEstimadoCOP: number; desgasteLlantasPorc: number } {
  const km = Number.isFinite(distanciaKm) ? Math.max(0, distanciaKm) : 0
  const baseKmGalon =
    rendimientoPersonalizadoKmGalon && rendimientoPersonalizadoKmGalon > 0
      ? rendimientoPersonalizadoKmGalon
      : RENDIMIENTO_BASE_KM_GALON[tipoVehiculo] || 22
  const factor = FACTOR_TERRENO_CONSUMO[terreno] || 1.25
  const kmEfectivosPorGalon = Math.max(3, baseKmGalon / factor)

  const galones = km > 0 ? Number((km / kmEfectivosPorGalon).toFixed(2)) : 0

  const combEfectivo: TipoCombustible =
    tipoCombustible ?? (tipoVehiculo === 'camion' ? 'diesel' : 'corriente')
  const precioGalon = obtenerPrecioGalon(combEfectivo)

  const costoEstimadoCOP = Math.round(galones * precioGalon)
  const factorDesgaste = FACTOR_TERRENO_DESGASTE_LLANTAS[terreno] || 0.01
  const desgasteLlantasPorc = Number((km * factorDesgaste).toFixed(2))

  return { galones, costoEstimadoCOP, desgasteLlantasPorc }
}

/**
 * Obtiene el precio por galón según el tipo de combustible.
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
