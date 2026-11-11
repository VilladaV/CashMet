import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { generarMovimientosRecurrentes } from '@/lib/firebase/recurrentesRepo'
import { __all, __reset, __seed } from './helpers/fakeFirestore'

const COL_REC = 'gastos_recurrentes'
const COL_CTA = 'cuentas_banco'
const COL_MOV = 'movimientos'

function seedRecurrente(overrides: Record<string, unknown> = {}) {
  __seed(COL_REC, 'r1', {
    concepto: 'Arriendo',
    categoria: 'hogar',
    valor: 1000000,
    periodicidad: 'mensual',
    diaVencimiento: 5,
    cuentaBancoId: 'a',
    activo: true,
    autoGenerar: true,
    ...overrides,
  })
}

beforeEach(() => {
  __reset()
  __seed(COL_CTA, 'a', { nombre: 'Ahorros', saldoActual: 100000000 })
})

describe('generarMovimientosRecurrentes', () => {
  it('genera el gasto del mes una sola vez', async () => {
    seedRecurrente()
    expect(await generarMovimientosRecurrentes('2026-11')).toBe(1)
    expect(await generarMovimientosRecurrentes('2026-11')).toBe(0)
    expect(__all(COL_MOV)).toHaveLength(1)
  })

  it('respeta fechaFin y no genera después del fin', async () => {
    seedRecurrente({ fechaInicio: '2026-01-01', fechaFin: '2026-03-31' })
    expect(await generarMovimientosRecurrentes('2026-04')).toBe(0)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('respeta fechaInicio y no genera antes de empezar', async () => {
    seedRecurrente({ fechaInicio: '2026-06-01' })
    expect(await generarMovimientosRecurrentes('2026-05')).toBe(0)
    expect(await generarMovimientosRecurrentes('2026-06')).toBe(1)
  })

  it('respeta la periodicidad bimestral', async () => {
    seedRecurrente({ fechaInicio: '2026-01-01', periodicidad: 'bimestral' })
    expect(await generarMovimientosRecurrentes('2026-01')).toBe(1)
    expect(await generarMovimientosRecurrentes('2026-02')).toBe(0)
    expect(await generarMovimientosRecurrentes('2026-03')).toBe(1)
  })

  it('recorta el día de vencimiento al último del mes', async () => {
    seedRecurrente({ diaVencimiento: 31 })
    await generarMovimientosRecurrentes('2026-02')
    expect(__all(COL_MOV)[0].fecha).toBe('2026-02-28')
  })

  it('no genera si está inactivo o sin cuenta', async () => {
    // Con dos cuentas no hay "cuenta única" que sirva de respaldo automático.
    __seed(COL_CTA, 'b', { nombre: 'Efectivo', saldoActual: 1000 })
    __seed(COL_REC, 'r2', {
      concepto: 'Inactivo',
      valor: 1000,
      activo: false,
      cuentaBancoId: 'a',
    })
    __seed(COL_REC, 'r3', {
      concepto: 'Sin cuenta',
      valor: 1000,
      activo: true,
      cuentaBancoId: '',
    })
    expect(await generarMovimientosRecurrentes('2026-11')).toBe(0)
  })

  it('rechaza valores no positivos en lugar de crear movimientos en cero', async () => {
    seedRecurrente({ valor: 0 })
    expect(await generarMovimientosRecurrentes('2026-11')).toBe(0)
    expect(__all(COL_MOV)).toHaveLength(0)
  })
})
