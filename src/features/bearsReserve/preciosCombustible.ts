import type { PreciosCombustible, TerrenoRuta, TipoCombustible } from './types'

export const PRECIOS_COMBUSTIBLE_COLOMBIA: PreciosCombustible = {
  corrientePorGalon: 15850,
  dieselPorGalon: 10450,
  extraPorGalon: 19950,
  actualizado: 'Noviembre 2026 · Caldas / Eje Cafetero',
}

/**
 * Rendimientos base en geografía de montaña andina (km por galón en condiciones promedio de Manizales).
 */
export const RENDIMIENTO_BASE_KM_GALON: Record<'moto' | 'carro' | 'camion' | 'otro', number> = {
  moto: 110,
  carro: 26, // Camperos, SUVs y camionetas de montaña
  camion: 8.5, // Camiones pesados y volquetas diésel
  otro: 20,
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
  terreno: TerrenoRuta = 'mixto_montaña'
): { galones: number; costoEstimadoCOP: number; desgasteLlantasPorc: number } {
  const baseKmGalon = RENDIMIENTO_BASE_KM_GALON[tipoVehiculo] || 20
  const factor = FACTOR_TERRENO_CONSUMO[terreno] || 1.2
  const kmEfectivosPorGalon = Math.max(3, baseKmGalon / factor)

  const galones = Number((distanciaKm / kmEfectivosPorGalon).toFixed(2))

  const precioGalon =
    tipoVehiculo === 'camion'
      ? PRECIOS_COMBUSTIBLE_COLOMBIA.dieselPorGalon
      : PRECIOS_COMBUSTIBLE_COLOMBIA.corrientePorGalon

  const costoEstimadoCOP = Math.round(galones * precioGalon)
  const factorDesgaste = FACTOR_TERRENO_DESGASTE_LLANTAS[terreno] || 0.01
  const desgasteLlantasPorc = Number((distanciaKm * factorDesgaste).toFixed(2))

  return { galones, costoEstimadoCOP, desgasteLlantasPorc }
}

/**
 * Obtiene el precio por galón según el tipo de combustible.
 */
export function obtenerPrecioGalon(tipo: TipoCombustible): number {
  switch (tipo) {
    case 'diesel':
      return PRECIOS_COMBUSTIBLE_COLOMBIA.dieselPorGalon
    case 'extra':
      return PRECIOS_COMBUSTIBLE_COLOMBIA.extraPorGalon
    case 'corriente':
    default:
      return PRECIOS_COMBUSTIBLE_COLOMBIA.corrientePorGalon
  }
}
