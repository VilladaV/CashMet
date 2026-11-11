import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  interpretarLote,
  interpretarMensaje,
  interpretarTransferencia,
  estimadosVehiculoCO,
} from '@/features/chat/engine'

describe('motor de interpretación local', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-10T15:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('registra un gasto con monto, categoría y fecha', () => {
    const r = interpretarMensaje('gasté 50.000 en mercado ayer')
    expect(r.acciones).toContain('requiere_confirmacion')
    expect(r.borrador).toMatchObject({
      tipo: 'gasto',
      monto: 50000,
      categoria: 'Mercado',
      fecha: '2026-02-09',
    })
  })

  it('detecta varias transacciones en un mensaje', () => {
    const r = interpretarLote('compré un almuerzo por 25.000 y pagué 30.000 de taxi')
    expect(r?.lote).toHaveLength(2)
    expect(r?.lote?.map((x) => x.borrador?.monto)).toEqual([25000, 30000])
  })

  it('no crea un movimiento al preguntar por una conversión de moneda', () => {
    const r = interpretarMensaje('¿cuánto son 100 dólares en pesos?')
    expect(r.acciones).not.toContain('requiere_confirmacion')
    expect(r.borrador).toBeUndefined()
  })

  it('detecta una transferencia entre cuentas por nombre', () => {
    const r = interpretarTransferencia('pasa 500.000 de Ahorros a Efectivo', ['Ahorros', 'Efectivo'])
    expect(r?.acciones).toEqual(['transferir'])
    expect(r?.params).toMatchObject({
      monto: 500000,
      cuentaOrigenId: 'Ahorros',
      cuentaDestinoId: 'Efectivo',
    })
  })

  it('no inventa una transferencia con una sola cuenta', () => {
    expect(interpretarTransferencia('pasa 500.000 de Ahorros a Efectivo', ['Ahorros'])).toBeNull()
  })

  it('el recordatorio con día 31 en febrero usa el último día real del mes', () => {
    const r = interpretarMensaje('agenda cita vence el 31')
    expect(r.acciones).toContain('crear_evento')
    // Febrero de 2026 tiene 28 días; nunca debe generar el 3 de marzo.
    expect(r.params?.fecha).toBe('2026-02-28')
  })

  it('genera el resumen del mes pedido', () => {
    const r = interpretarMensaje('dame el resumen de marzo')
    expect(r.acciones).toEqual(['resumen_mes'])
    expect(r.params?.mes).toBe('2026-03')
  })

  it('detecta pago de deuda antes que un gasto genérico', () => {
    const r = interpretarMensaje('pagué 200.000 de la tarjeta Visa')
    expect(r.acciones).toEqual(['pago_deuda'])
    expect(r.params).toMatchObject({ monto: 200000 })
  })

  it('detecta pago de nómina', () => {
    const r = interpretarMensaje('pagué 1.500.000 de salario a Juan')
    expect(r.acciones).toEqual(['pago_nomina'])
    expect(r.params).toMatchObject({ monto: 1500000 })
  })

  it('estima SOAT y TM con supuestos explícitos', () => {
    const e = estimadosVehiculoCO({ modelo: 2020, cilindraje: 1600 })
    expect(e.soatAnualEstimadoCOP).toBeGreaterThan(0)
    expect(e.tecnicomecanicaCostoEstimadoCOP).toBeGreaterThan(0)
    expect(e.soatRango.min).toBeLessThan(e.soatAnualEstimadoCOP)
    expect(e.fuente).toMatch(/referencial/i)
  })
})
