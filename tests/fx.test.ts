import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectarMoneda, normalizarMoneda } from '@/lib/fx'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('fx · detectarMoneda y normalizarMoneda', () => {
  it('evita falsos positivos con palabras cotidianas del español', () => {
    expect(detectarMoneda('compré una libra de carne por 18.000')).toBeUndefined()
    expect(detectarMoneda('gafas de sol 90.000')).toBeUndefined()
    expect(detectarMoneda('compré plátanos verdes en el mercado')).toBeUndefined()
    expect(detectarMoneda('gasto real de la semana 50.000')).toBeUndefined()
  })

  it('detecta monedas extranjeras inequívocas en texto libre', () => {
    expect(detectarMoneda('gasté 50 euros en cena')).toBe('EUR')
    expect(detectarMoneda('me pagaron 100 USD')).toBe('USD')
    expect(detectarMoneda('pagué 20 libras esterlinas')).toBe('GBP')
    expect(detectarMoneda('compré algo por €35')).toBe('EUR')
    expect(detectarMoneda('compré un libro por £15')).toBe('GBP')
  })

  it('normalizarMoneda acepta alias explícitos y omite COP o vacíos', () => {
    expect(normalizarMoneda('usd')).toBe('USD')
    expect(normalizarMoneda('dólares')).toBe('USD')
    expect(normalizarMoneda('verdes')).toBe('USD')
    expect(normalizarMoneda('euros')).toBe('EUR')
    expect(normalizarMoneda('libra')).toBe('GBP')
    expect(normalizarMoneda('sol')).toBe('PEN')
    expect(normalizarMoneda('real')).toBe('BRL')
    expect(normalizarMoneda('COP')).toBeUndefined()
    expect(normalizarMoneda('')).toBeUndefined()
  })
})

describe('fx · convertirACOP con fetch mockeado', () => {
  it('convierte USD y EUR a COP usando la API primaria', async () => {
    vi.resetModules()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '2026-11-22',
        usd: { usd: 1, cop: 4200, eur: 0.92 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { convertirACOP } = await import('@/lib/fx')

    const usd = await convertirACOP(100, 'USD')
    expect(usd).toMatchObject({ montoCOP: 420000, tasa: 4200, moneda: 'USD', fecha: '2026-11-22' })

    const eur = await convertirACOP(50, 'EUR')
    expect(eur?.moneda).toBe('EUR')
    expect(eur?.montoCOP).toBe(Math.round(50 * (4200 / 0.92)))
    // Segunda llamada usa caché en memoria sin repetir fetch
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('usa el espejo cuando la URL primaria falla y devuelve null si ambos fallan', async () => {
    vi.resetModules()
    const fetchFallback = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ date: '2026-11-22', usd: { usd: 1, cop: 4000 } }),
      })
    vi.stubGlobal('fetch', fetchFallback)

    const fx1 = await import('@/lib/fx')
    const res = await fx1.convertirACOP(10, 'USD')
    expect(res?.montoCOP).toBe(40000)
    expect(fetchFallback).toHaveBeenCalledTimes(2)

    // Si ambos endpoints fallan sin caché previa, devuelve null
    localStorage.clear()
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const fx2 = await import('@/lib/fx')
    expect(await fx2.convertirACOP(10, 'USD')).toBeNull()
    // COP nunca requiere red
    expect(await fx2.convertirACOP(12345.6, 'COP')).toEqual({ montoCOP: 12346, tasa: 1, moneda: 'COP' })
  })
})
