import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('chat/interpretar · conversión FX y fallback Gemini', () => {
  it('convierte interp.params raíz en divisas extranjeras (ej. transferencia en USD)', async () => {
    vi.resetModules()
    vi.doMock('@/ai/gemini', () => ({
      geminiDisponible: false,
      interpretarConGemini: vi.fn(),
    }))
    vi.doMock('@/lib/fx', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/fx')>()
      return {
        ...actual,
        convertirACOP: vi.fn().mockResolvedValue({ montoCOP: 420000, tasa: 4200, moneda: 'USD', fecha: '2026-11-22' }),
      }
    })

    const { interpretar } = await import('@/features/chat/interpretar')
    const r = await interpretar('pasa 100 USD de Wise a Bancolombia', { cuentas: ['Wise', 'Bancolombia'] })

    expect(r.acciones).toEqual(['transferir'])
    expect(r.params).toMatchObject({
      monto: 420000,
      montoOriginal: 100,
      tasaCambio: 4200,
      moneda: 'USD',
    })
  })

  it('cancela una acción inmediata con params raíz si falla la tasa FX', async () => {
    vi.resetModules()
    vi.doMock('@/ai/gemini', () => ({
      geminiDisponible: false,
      interpretarConGemini: vi.fn(),
    }))
    vi.doMock('@/lib/fx', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/fx')>()
      return {
        ...actual,
        convertirACOP: vi.fn().mockResolvedValue(null),
      }
    })

    const { interpretar } = await import('@/features/chat/interpretar')
    const r = await interpretar('pasa 100 USD de Wise a Bancolombia', { cuentas: ['Wise', 'Bancolombia'] })

    expect(r.acciones).toEqual([])
    expect(r.params).toBeUndefined()
    expect(r.respuesta).toMatch(/tasa de cambio/i)
  })

  it('NO ejecuta transferencia local cuando Gemini respondió válidamente con acciones: []', async () => {
    vi.resetModules()
    const interpretarConGemini = vi.fn().mockResolvedValue({
      respuesta: '¿De cuál cuenta quieres sacar el dinero exactamente?',
      acciones: [],
    })
    vi.doMock('@/ai/gemini', () => ({
      geminiDisponible: true,
      interpretarConGemini,
    }))
    vi.doMock('@/lib/fx', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/fx')>()
      return { ...actual, convertirACOP: vi.fn().mockResolvedValue(null) }
    })

    const { interpretar } = await import('@/features/chat/interpretar')
    const r = await interpretar('pasa 500.000 de Ahorros a Efectivo', { cuentas: ['Ahorros', 'Efectivo'] })

    expect(interpretarConGemini).toHaveBeenCalledTimes(1)
    expect(r.acciones).toEqual([])
    expect(r.params).toBeUndefined()
    expect(r.respuesta).toContain('cuál cuenta')
  })

  it('en borrador extranjero cuando falla la tasa FX deja monto en 0 y conserva montoOriginal', async () => {
    vi.resetModules()
    vi.doMock('@/ai/gemini', () => ({
      geminiDisponible: false,
      interpretarConGemini: vi.fn(),
    }))
    vi.doMock('@/lib/fx', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/fx')>()
      return {
        ...actual,
        convertirACOP: vi.fn().mockResolvedValue(null),
      }
    })

    const { interpretar } = await import('@/features/chat/interpretar')
    const r = await interpretar('gasté 50 euros en cena', { cuentas: ['Bancolombia'] })

    expect(r.acciones).toContain('requiere_confirmacion')
    expect(r.borrador?.monto).toBe(0)
    expect(r.borrador?.montoOriginal).toBe(50)
    expect(r.respuesta).toMatch(/tasa de cambio/i)
  })
})
