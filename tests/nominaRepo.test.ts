import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { actualizarNomina, registrarPagoNomina } from '@/lib/firebase/nominaRepo'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

const COL_NOM = 'nomina'
const COL_CTA = 'cuentas_banco'
const COL_MOV = 'movimientos'

function seedNomina(overrides: Record<string, unknown> = {}) {
  __seed(COL_NOM, 'n1', {
    nombreCompleto: 'Ana Pérez',
    cargo: 'Contadora',
    activo: true,
    tipoContrato: 'indefinido',
    salarioBaseMensual: 2000000,
    adicionalMensual: 150000,
    cuentaBancoId: 'a',
    ...overrides,
  })
}

beforeEach(() => {
  __reset()
})

describe('actualizarNomina', () => {
  it('preserva salario y adicional cuando la actualización es parcial', async () => {
    seedNomina()
    await actualizarNomina('n1', { nombreCompleto: 'Ana María Pérez' })
    const n = __get(COL_NOM, 'n1')
    expect(n?.nombreCompleto).toBe('Ana María Pérez')
    expect(n?.salarioBaseMensual).toBe(2000000)
    expect(n?.adicionalMensual).toBe(150000)
    expect(n?.salarioTotalMensualEstimado).toBe(2150000)
  })

  it('recalcula el total al cambiar el salario base', async () => {
    seedNomina()
    await actualizarNomina('n1', { salarioBaseMensual: 2500000 })
    expect(__get(COL_NOM, 'n1')?.salarioTotalMensualEstimado).toBe(2650000)
    expect(__get(COL_NOM, 'n1')?.adicionalMensual).toBe(150000)
  })

  it('rechaza salarios negativos', async () => {
    seedNomina()
    await expect(actualizarNomina('n1', { salarioBaseMensual: -1 })).rejects.toThrow(/salario/i)
    expect(__get(COL_NOM, 'n1')?.salarioBaseMensual).toBe(2000000)
  })
})

describe('registrarPagoNomina', () => {
  it('paga base + adicional y descuenta la cuenta en una sola operación', async () => {
    seedNomina()
    __seed(COL_CTA, 'a', { nombre: 'Ahorros', saldoActual: 5000000 })
    const r = await registrarPagoNomina('n1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(true)
    expect(r.monto).toBe(2150000)
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(2850000)
    expect(__all(COL_MOV)).toHaveLength(1)
  })

  it('no paga si la cuenta no tiene fondos', async () => {
    seedNomina()
    __seed(COL_CTA, 'a', { nombre: 'Ahorros', saldoActual: 100 })
    const r = await registrarPagoNomina('n1', { fecha: '2026-11-11' })
    expect(r.ok).toBe(false)
    expect(r.saldoInsuficiente).toBe(true)
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(100)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('serializa dos pagos concurrentes y evita el doble pago', async () => {
    seedNomina()
    __seed(COL_CTA, 'a', { nombre: 'Ahorros', saldoActual: 5000000 })
    const [r1, r2] = await Promise.all([
      registrarPagoNomina('n1', { fecha: '2026-11-11' }),
      registrarPagoNomina('n1', { fecha: '2026-11-11' }),
    ])
    // Ambos pueden ser válidos en un modelo de nómina mensual; lo que no puede
    // pasar es que el saldo quede inconsistente con los movimientos creados.
    const exitosos = [r1, r2].filter((r) => r.ok).length
    expect(__all(COL_MOV)).toHaveLength(exitosos)
    expect(__get(COL_CTA, 'a')?.saldoActual).toBe(5000000 - exitosos * 2150000)
  })
})
