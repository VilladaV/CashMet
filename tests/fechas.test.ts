import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fechaFutura,
  hoyISO,
  isoLocal,
  parseFechaLocal,
  sumarAnio,
  sumarMeses,
} from '@/lib/fechas'

describe('fechas (zona horaria America/Bogota)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hoyISO usa la fecha local y no la UTC (medianoche UTC)', () => {
    // 2026-03-01 02:00 UTC = 2026-02-28 21:00 en Colombia
    vi.setSystemTime(new Date('2026-03-01T02:00:00.000Z'))
    expect(hoyISO()).toBe('2026-02-28')
  })

  it('isoLocal conserva el día local', () => {
    expect(isoLocal(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01')
  })

  it('sumarMeses recorta al último día del mes destino (31 ene -> 28 feb)', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('sumarMeses respeta año bisiesto (31 ene 2024 -> 29 feb)', () => {
    expect(sumarMeses('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('sumarMeses funciona hacia atrás (31 mar -> 28 feb)', () => {
    expect(sumarMeses('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('sumarMeses conserva el día cuando existe', () => {
    expect(sumarMeses('2026-01-15', 1)).toBe('2026-02-15')
  })

  it('sumarAnio recorta 29 feb a 28 feb en año no bisiesto', () => {
    expect(sumarAnio('2024-02-29', 1)).toBe('2025-02-28')
  })

  it('parseFechaLocal rechaza fechas imposibles en lugar de desbordar el mes', () => {
    expect(parseFechaLocal('2026-02-31')).toBeNull()
    expect(parseFechaLocal('2026-13-01')).toBeNull()
    expect(parseFechaLocal('2026-04-31')).toBeNull()
  })

  it('parseFechaLocal acepta 29 feb en año bisiesto', () => {
    expect(parseFechaLocal('2024-02-29')?.getDate()).toBe(29)
  })

  it('parseFechaLocal exige formato YYYY-MM-DD', () => {
    expect(parseFechaLocal('15/03/2026')).toBeNull()
    expect(parseFechaLocal('')).toBeNull()
    expect(parseFechaLocal(undefined)).toBeNull()
  })

  it('fechaFutura incluye hoy y excluye ayer', () => {
    vi.setSystemTime(new Date('2026-11-11T15:00:00.000Z'))
    expect(fechaFutura('2026-11-11')).toBe(true)
    expect(fechaFutura('2026-11-10')).toBe(false)
  })
})
