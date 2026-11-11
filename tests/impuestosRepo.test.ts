import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { registrarPagoImpuesto } from '@/lib/firebase/impuestosRepo'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

const COL = 'impuestos'
const COL_CTA = 'cuentas_banco'
const COL_MOV = 'movimientos'

function seedImpuesto(overrides: Record<string, unknown> = {}) {
  __seed(COL, 'i1', {
    nombre: 'Predial 2026',
    tipo: 'predial',
    valor: 500000,
    periodicidad: 'anual',
    pagado: false,
    cuentaBancoId: 'a',
    ...overrides,
  })
}

beforeEach(() => {
  __reset()
  __seed(COL_CTA, 'a', { nombre: 'Ahorros', saldoActual: 1000000 })
})

describe('registrarPagoImpuesto', () => {
  it('marca pagado, descuenta la cuenta y crea el movimiento', async () => {
    seedImpuesto()
    const r = await registrarPagoImpuesto('i1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(true)
    expect(__get(COL, 'i1')?.pagado).toBe(true)
    expect(__get(COL, 'i1')?.fechaPago).toBe('2026-11-11')
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(500000)
    expect(__all(COL_MOV)[0]).toMatchObject({ tipo: 'impuesto', impuestoId: 'i1', monto: 500000 })
  })

  it('no paga dos veces el mismo impuesto', async () => {
    seedImpuesto()
    await registrarPagoImpuesto('i1', { fecha: '2026-11-11' })
    const r = await registrarPagoImpuesto('i1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(false)
    expect(r.yaPagado).toBe(true)
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(500000)
    expect(__all(COL_MOV)).toHaveLength(1)
  })

  it('rechaza el pago si no hay fondos y no altera nada', async () => {
    __seed(COL_CTA, 'a', { nombre: 'Ahorros', saldoActual: 100 })
    seedImpuesto()
    const r = await registrarPagoImpuesto('i1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(false)
    expect(r.saldoInsuficiente).toBe(true)
    expect(__get(COL, 'i1')?.pagado).toBe(false)
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(100)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('paga sin descontar si no tiene cuenta asociada', async () => {
    seedImpuesto({ cuentaBancoId: undefined })
    const r = await registrarPagoImpuesto('i1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(true)
    expect(__get(COL, 'i1')?.pagado).toBe(true)
    expect(__all(COL_MOV)).toHaveLength(1)
  })

  it('serializa pagos concurrentes y evita el doble descuento', async () => {
    seedImpuesto()
    const [r1, r2] = await Promise.all([
      registrarPagoImpuesto('i1', { fecha: '2026-11-11' }),
      registrarPagoImpuesto('i1', { fecha: '2026-11-11' }),
    ])
    expect([r1, r2].filter((r) => r.ok)).toHaveLength(1)
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(500000)
    expect(__all(COL_MOV)).toHaveLength(1)
  })

  it('rechaza impuestos con valor cero', async () => {
    seedImpuesto({ valor: 0 })
    const r = await registrarPagoImpuesto('i1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(false)
    expect(__get(COL, 'i1')?.pagado).toBe(false)
  })
})
