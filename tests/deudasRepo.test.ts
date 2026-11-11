import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { registrarPagoDeuda } from '@/lib/firebase/deudasRepo'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

const COL_DEUDA = 'deudas'
const COL_CTA = 'cuentas_banco'
const COL_MOV = 'movimientos'

function seedCuenta(id: string, saldo: number, nombre = id) {
  __seed(COL_CTA, id, { nombre, tipo: 'ahorros', saldoActual: saldo })
}

function seedDeuda(id = 'd1', saldo = 1000, estado: 'activa' | 'pagada' = 'activa') {
  __seed(COL_DEUDA, id, { nombre: 'Tarjeta', tipo: 'tarjeta', saldoPendiente: saldo, cuotaMensual: 200, estado })
}

function saldo(id: string): number {
  return Number(__get(COL_CTA, id)?.saldoActual) || 0
}

beforeEach(() => {
  __reset()
})

describe('registrarPagoDeuda', () => {
  it('descuenta la cuota del saldo de la deuda y de la cuenta', async () => {
    seedCuenta('a', 5000)
    seedDeuda('d1', 1000)
    const r = await registrarPagoDeuda('d1', 300, '2026-11-11', 'a')
    expect(r.ok).toBe(true)
    expect(r.saldoPendiente).toBe(700)
    expect(saldo('a')).toBe(4700)
    const movs = __all(COL_MOV)
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({ tipo: 'pago_deuda', deudaId: 'd1', monto: 300 })
  })

  it('marca la deuda como pagada cuando el saldo llega a cero', async () => {
    seedCuenta('a', 5000)
    seedDeuda('d1', 1000)
    const r = await registrarPagoDeuda('d1', 1000, '2026-11-11', 'a')
    expect(r.ok).toBe(true)
    expect(r.cerrada).toBe(true)
    expect(__get(COL_DEUDA, 'd1')?.saldoPendiente).toBe(0)
    expect(__get(COL_DEUDA, 'd1')?.estado).toBe('pagada')
  })

  it('rechaza un pago mayor al saldo pendiente sin alterar nada', async () => {
    seedCuenta('a', 5000)
    seedDeuda('d1', 1000)
    const r = await registrarPagoDeuda('d1', 1500, '2026-11-11', 'a')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('monto_excede_saldo')
    expect(__get(COL_DEUDA, 'd1')?.saldoPendiente).toBe(1000)
    expect(saldo('a')).toBe(5000)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('rechaza el pago si la cuenta no tiene fondos', async () => {
    seedCuenta('a', 100)
    seedDeuda('d1', 1000)
    const r = await registrarPagoDeuda('d1', 300, '2026-11-11', 'a')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('saldo_insuficiente')
    expect(__get(COL_DEUDA, 'd1')?.saldoPendiente).toBe(1000)
    expect(saldo('a')).toBe(100)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('rechaza cuentas inexistentes', async () => {
    seedDeuda('d1', 1000)
    const r = await registrarPagoDeuda('d1', 300, '2026-11-11', 'fantasma')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('cuenta_no_encontrada')
    expect(__get(COL_DEUDA, 'd1')?.saldoPendiente).toBe(1000)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('rechaza montos inválidos', async () => {
    seedCuenta('a', 5000)
    seedDeuda()
    for (const monto of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await registrarPagoDeuda('d1', monto, '2026-11-11', 'a')
      expect(r.ok).toBe(false)
      expect(r.error).toBe('monto_invalido')
    }
    expect(__get(COL_DEUDA, 'd1')?.saldoPendiente).toBe(1000)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('rechaza deudas inexistentes o ya pagadas', async () => {
    seedCuenta('a', 5000)
    expect((await registrarPagoDeuda('nope', 100, '2026-11-11', 'a')).ok).toBe(false)
    seedDeuda('d1', 0, 'pagada')
    const r = await registrarPagoDeuda('d1', 100, '2026-11-11', 'a')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('deuda_pagada')
  })

  it('serializa pagos concurrentes para no sobregirar la deuda ni la cuenta', async () => {
    seedCuenta('a', 5000)
    seedDeuda('d1', 1000)
    const [r1, r2] = await Promise.all([
      registrarPagoDeuda('d1', 700, '2026-11-11', 'a'),
      registrarPagoDeuda('d1', 700, '2026-11-11', 'a'),
    ])
    expect([r1, r2].filter((r) => r.ok)).toHaveLength(1)
    expect(__get(COL_DEUDA, 'd1')?.saldoPendiente).toBe(300)
    expect(saldo('a')).toBe(4300)
    expect(__all(COL_MOV)).toHaveLength(1)
  })
})
