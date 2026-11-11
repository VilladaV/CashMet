import { describe, expect, it } from 'vitest'
import {
  CONSUMO_RALENTI_GALONES_POR_HORA,
  calcularCombustibleRalenti,
  calcularDistanciaHaversineKm,
  calcularDistanciaRealDesdeBase,
  factorSinuosidadMontaña,
} from '@/features/bearsReserve/geo'
import {
  FACTOR_TERRENO_CONSUMO,
  calcularConsumoMision,
  obtenerPrecioGalon,
  obtenerPreciosCombustibleActuales,
} from '@/features/bearsReserve/preciosCombustible'

describe('Bear\'s Reserve · geografía', () => {
  it('calcula una distancia Haversine conocida (Manizales - Bogotá ~ 150-180 km)', () => {
    const km = calcularDistanciaHaversineKm(5.07, -75.52, 4.71, -74.07)
    expect(km).toBeGreaterThan(140)
    expect(km).toBeLessThan(190)
  })

  it('aplica mayor sinuosidad a trocha que a pavimento', () => {
    expect(factorSinuosidadMontaña(true)).toBeGreaterThan(factorSinuosidadMontaña(false))
  })

  it('calcula ida y vuelta desde la base', () => {
    const r = calcularDistanciaRealDesdeBase(5.0934, -75.5562, true)
    expect(r.distanciaKmIda).toBeGreaterThan(0)
    expect(r.distanciaKmTotalIdaYVuelta).toBeCloseTo(r.distanciaKmIda * 2, 0)
    expect(r.tiempoMinutosRodamientoIdaYVuelta).toBeGreaterThan(0)
  })

  it('el ralentí no genera galones negativos', () => {
    expect(calcularCombustibleRalenti('carro', -30)).toBe(0)
    expect(calcularCombustibleRalenti('camion', 60)).toBe(
      CONSUMO_RALENTI_GALONES_POR_HORA.camion
    )
  })
})

describe('Bear\'s Reserve · combustible', () => {
  it('convierte distancia y terreno en galones y desgaste', () => {
    const r = calcularConsumoMision('carro', 100, 'trocha_extrema_barrizal', 25)
    const esperado = 100 / (25 / FACTOR_TERRENO_CONSUMO.trocha_extrema_barrizal)
    expect(r.galones).toBeCloseTo(esperado, 1)
    expect(r.desgasteLlantasPorc).toBeCloseTo(4.5, 2)
    expect(r.costoEstimadoCOP).toBeGreaterThan(0)
  })

  it('usa diésel para camión y corriente para carro', () => {
    const precios = obtenerPreciosCombustibleActuales()
    expect(obtenerPrecioGalon('diesel')).toBe(precios.dieselPorGalon)
    expect(obtenerPrecioGalon('corriente')).toBe(precios.corrientePorGalon)
    expect(obtenerPrecioGalon('extra')).toBe(precios.extraPorGalon)
  })

  it('nunca produce rendimiento efectivo menor a 3 km/gal', () => {
    const r = calcularConsumoMision('camion', 100, 'trocha_extrema_barrizal', 0.5)
    expect(r.galones).toBeLessThanOrEqual(100 / 3)
  })

  it('devuelve precios positivos y una fuente declarada', () => {
    const p = obtenerPreciosCombustibleActuales()
    expect(p.corrientePorGalon).toBeGreaterThan(0)
    expect(p.dieselPorGalon).toBeGreaterThan(0)
    expect(p.fuente.length).toBeGreaterThan(0)
  })
})
