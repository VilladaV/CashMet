import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import {
  actualizarMovimiento,
  crearMovimiento,
  eliminarMovimiento,
  listarTodosLosMovimientos,
  transferirEntreCuentas,
} from '@/lib/firebase/movimientosRepo'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

const COL_MOV = 'movimientos'
const COL_CTA = 'cuentas_banco'

function seedCuenta(id: string, saldo: number, nombre = id) {
  __seed(COL_CTA, id, { nombre, tipo: 'ahorros', saldoActual: saldo, moneda: 'COP', activa: true })
}

function saldo(id: string): number {
  return Number(__get(COL_CTA, id)?.saldoActual) || 0
}

beforeEach(() => {
  __reset()
})

describe('crearMovimiento · validación', () => {
  it('rechaza montos cero, negativos, NaN o infinitos', async () => {
    const base = {
      fecha: '2026-11-11',
      tipo: 'gasto' as const,
      concepto: 'Prueba',
      categoria: 'Otros',
    }
    await expect(crearMovimiento({ ...base, monto: 0 })).rejects.toThrow(/monto/i)
    await expect(crearMovimiento({ ...base, monto: -10 })).rejects.toThrow(/monto/i)
    await expect(crearMovimiento({ ...base, monto: Number.NaN })).rejects.toThrow(/monto/i)
    await expect(crearMovimiento({ ...base, monto: Number.POSITIVE_INFINITY })).rejects.toThrow(/monto/i)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('rechaza fechas con formato inválido', async () => {
    await expect(
      crearMovimiento({
        fecha: '11/11/2026',
        tipo: 'gasto',
        concepto: 'Prueba',
        monto: 1000,
        categoria: 'Otros',
      })
    ).rejects.toThrow(/fecha/i)
  })

  it('rechaza un concepto vacío', async () => {
    await expect(
      crearMovimiento({
        fecha: '2026-11-11',
        tipo: 'gasto',
        concepto: '   ',
        monto: 1000,
        categoria: 'Otros',
      })
    ).rejects.toThrow(/concepto/i)
  })

  it('no crea el movimiento si la cuenta no existe', async () => {
    await expect(
      crearMovimiento({
        fecha: '2026-11-11',
        tipo: 'gasto',
        concepto: 'Fantasma',
        monto: 1000,
        categoria: 'Otros',
        cuentaBancoId: 'no-existe',
      })
    ).rejects.toThrow(/cuenta/i)
    expect(__all(COL_MOV)).toHaveLength(0)
    expect(__get(COL_CTA, 'no-existe')).toBeUndefined()
  })
})

describe('crearMovimiento · saldos', () => {
  it('suma un ingreso a la cuenta', async () => {
    seedCuenta('a', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'ingreso',
      concepto: 'Pago cliente',
      monto: 500,
      categoria: 'Ingreso',
      cuentaBancoId: 'a',
    })
    expect(id).toBeTruthy()
    expect(saldo('a')).toBe(1500)
    expect(__get(COL_MOV, id)?.estado).toBe('confirmado')
  })

  it('resta un gasto de la cuenta', async () => {
    seedCuenta('a', 1000)
    await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 300,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    expect(saldo('a')).toBe(700)
  })

  it('crearMovimiento sin cuentaBancoId devuelve el ID real guardado en Firestore', async () => {
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Efectivo sin cuenta',
      monto: 15000,
      categoria: 'Otros',
    })
    expect(id).toBeTruthy()
    const guardado = __get(COL_MOV, id)
    expect(guardado).toBeDefined()
    expect(guardado?.concepto).toBe('Efectivo sin cuenta')
    expect(guardado?.monto).toBe(15000)
  })

  it('mueve saldo entre cuentas en una transferencia', async () => {
    seedCuenta('a', 1000)
    seedCuenta('b', 0)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'transferencia',
      concepto: 'Traslado',
      monto: 300,
      categoria: 'Transferencia',
      cuentaBancoId: 'a',
      cuentaDestinoId: 'b',
    })
    expect(saldo('a')).toBe(700)
    expect(saldo('b')).toBe(300)
    expect(__get(COL_MOV, id)?.cuentaDestinoId).toBe('b')
  })

  it('rechaza una transferencia a la misma cuenta', async () => {
    seedCuenta('a', 1000)
    await expect(
      crearMovimiento({
        fecha: '2026-11-11',
        tipo: 'transferencia',
        concepto: 'Traslado',
        monto: 300,
        categoria: 'Transferencia',
        cuentaBancoId: 'a',
        cuentaDestinoId: 'a',
      })
    ).rejects.toThrow(/misma|distinta/i)
    expect(saldo('a')).toBe(1000)
  })

  it('rechaza una transferencia sin saldo suficiente', async () => {
    seedCuenta('a', 100)
    seedCuenta('b', 0)
    await expect(
      crearMovimiento({
        fecha: '2026-11-11',
        tipo: 'transferencia',
        concepto: 'Traslado',
        monto: 300,
        categoria: 'Transferencia',
        cuentaBancoId: 'a',
        cuentaDestinoId: 'b',
      })
    ).rejects.toThrow(/saldo/i)
    expect(saldo('a')).toBe(100)
    expect(saldo('b')).toBe(0)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('no descuenta nada si la cuenta destino no existe (atomicidad)', async () => {
    seedCuenta('a', 1000)
    await expect(
      crearMovimiento({
        fecha: '2026-11-11',
        tipo: 'transferencia',
        concepto: 'Traslado',
        monto: 300,
        categoria: 'Transferencia',
        cuentaBancoId: 'a',
        cuentaDestinoId: 'fantasma',
      })
    ).rejects.toThrow()
    expect(saldo('a')).toBe(1000)
    expect(__all(COL_MOV)).toHaveLength(0)
  })
})

describe('transferirEntreCuentas', () => {
  it('mueve el saldo y crea un solo movimiento', async () => {
    seedCuenta('a', 1000, 'Ahorros')
    seedCuenta('b', 500, 'Efectivo')
    const r = await transferirEntreCuentas({
      origenId: 'a',
      destinoId: 'b',
      monto: 250,
      fecha: '2026-11-11',
    })
    expect(r.ok).toBe(true)
    expect(saldo('a')).toBe(750)
    expect(saldo('b')).toBe(750)
    expect(__all(COL_MOV)).toHaveLength(1)
  })

  it('rechaza saldo insuficiente sin mover dinero', async () => {
    seedCuenta('a', 100, 'Ahorros')
    seedCuenta('b', 0, 'Efectivo')
    const r = await transferirEntreCuentas({
      origenId: 'a',
      destinoId: 'b',
      monto: 250,
      fecha: '2026-11-11',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('saldo_insuficiente')
    expect(saldo('a')).toBe(100)
    expect(__all(COL_MOV)).toHaveLength(0)
  })

  it('serializa dos transferencias concurrentes y evita el sobregiro', async () => {
    seedCuenta('a', 1000, 'Ahorros')
    seedCuenta('b', 0, 'Efectivo')
    const [r1, r2] = await Promise.all([
      transferirEntreCuentas({ origenId: 'a', destinoId: 'b', monto: 800, fecha: '2026-11-11' }),
      transferirEntreCuentas({ origenId: 'a', destinoId: 'b', monto: 800, fecha: '2026-11-11' }),
    ])
    expect([r1, r2].filter((r) => r.ok)).toHaveLength(1)
    expect(saldo('a')).toBe(200)
    expect(saldo('b')).toBe(800)
    expect(__all(COL_MOV)).toHaveLength(1)
  })
})

describe('actualizarMovimiento', () => {
  it('reajusta el saldo al cambiar el monto', async () => {
    seedCuenta('a', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    expect(saldo('a')).toBe(800)
    await actualizarMovimiento(id, {
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 350,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    expect(saldo('a')).toBe(650)
    expect(__get(COL_MOV, id)?.monto).toBe(350)
  })

  it('traslada el efecto al cambiar de cuenta', async () => {
    seedCuenta('a', 1000)
    seedCuenta('b', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    await actualizarMovimiento(id, {
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: 'b',
    })
    expect(saldo('a')).toBe(1000)
    expect(saldo('b')).toBe(800)
  })

  it('convierte una transferencia en gasto sin dejar dinero perdido', async () => {
    seedCuenta('a', 1000)
    seedCuenta('b', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'transferencia',
      concepto: 'Traslado',
      monto: 300,
      categoria: 'Transferencia',
      cuentaBancoId: 'a',
      cuentaDestinoId: 'b',
    })
    expect(saldo('a')).toBe(700)
    expect(saldo('b')).toBe(1300)
    await actualizarMovimiento(id, {
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Compra',
      monto: 300,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    expect(saldo('a')).toBe(700)
    expect(saldo('b')).toBe(1000)
    expect(__get(COL_MOV, id)?.cuentaDestinoId).toBeUndefined()
  })

  it('rechaza un monto inválido sin alterar saldos', async () => {
    seedCuenta('a', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    await expect(
      actualizarMovimiento(id, {
        fecha: '2026-11-11',
        tipo: 'gasto',
        concepto: 'Mercado',
        monto: 0,
        categoria: 'Mercado',
        cuentaBancoId: 'a',
      })
    ).rejects.toThrow(/monto/i)
    expect(saldo('a')).toBe(800)
    expect(__get(COL_MOV, id)?.monto).toBe(200)
  })

  it('limpiar cuentaBancoId borra el campo en Firestore y evita doble reversión al eliminar', async () => {
    seedCuenta('a', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    expect(saldo('a')).toBe(800)

    await actualizarMovimiento(id, {
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado sin cuenta',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: undefined,
    })

    // Saldo restaurado y campo cuentaBancoId efectivamente eliminado en Firestore
    expect(saldo('a')).toBe(1000)
    expect(__get(COL_MOV, id)?.cuentaBancoId).toBeUndefined()

    // Eliminar después NO debe volver a acreditar la cuenta (evita doble reversión)
    await eliminarMovimiento(id)
    expect(saldo('a')).toBe(1000)
  })
})

describe('eliminarMovimiento', () => {
  it('revierte el saldo al eliminar un gasto', async () => {
    seedCuenta('a', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'gasto',
      concepto: 'Mercado',
      monto: 200,
      categoria: 'Mercado',
      cuentaBancoId: 'a',
    })
    await eliminarMovimiento(id)
    expect(saldo('a')).toBe(1000)
    expect(__get(COL_MOV, id)).toBeUndefined()
  })

  it('revierte ambos lados de una transferencia respetando reads-before-writes', async () => {
    seedCuenta('a', 1000)
    seedCuenta('b', 1000)
    const id = await crearMovimiento({
      fecha: '2026-11-11',
      tipo: 'transferencia',
      concepto: 'Traslado',
      monto: 300,
      categoria: 'Transferencia',
      cuentaBancoId: 'a',
      cuentaDestinoId: 'b',
    })
    await eliminarMovimiento(id)
    expect(saldo('a')).toBe(1000)
    expect(saldo('b')).toBe(1000)
    expect(__get(COL_MOV, id)).toBeUndefined()
  })

  it('revierte la deuda asociada al eliminar un pago de deuda', async () => {
    seedCuenta('a', 4000)
    __seed('deudas', 'd1', {
      nombre: 'Tarjeta Visa',
      tipo: 'tarjeta',
      saldoPendiente: 0,
      estado: 'pagada',
    })
    __seed(COL_MOV, 'm-deuda', {
      fecha: '2026-11-11',
      tipo: 'pago_deuda',
      concepto: 'Pago de cuota Tarjeta Visa',
      monto: 1000,
      categoria: 'Deudas',
      deudaId: 'd1',
      cuentaBancoId: 'a',
      estado: 'confirmado',
    })

    await eliminarMovimiento('m-deuda')

    expect(saldo('a')).toBe(5000)
    expect(__get('deudas', 'd1')?.saldoPendiente).toBe(1000)
    expect(__get('deudas', 'd1')?.estado).toBe('activa')
    expect(__get(COL_MOV, 'm-deuda')).toBeUndefined()
  })

  it('revierte el impuesto asociado al eliminar un pago de impuesto', async () => {
    seedCuenta('a', 500000)
    __seed('impuestos', 'i1', {
      nombre: 'Predial 2026',
      tipo: 'predial',
      valor: 500000,
      periodicidad: 'anual',
      pagado: true,
      fechaPago: '2026-11-11',
      cuentaBancoId: 'a',
    })
    __seed(COL_MOV, 'm-imp', {
      fecha: '2026-11-11',
      tipo: 'impuesto',
      concepto: 'Pago de Predial 2026',
      monto: 500000,
      categoria: 'Impuestos',
      impuestoId: 'i1',
      cuentaBancoId: 'a',
      estado: 'confirmado',
    })

    await eliminarMovimiento('m-imp')

    expect(saldo('a')).toBe(1000000)
    expect(__get('impuestos', 'i1')?.pagado).toBe(false)
    expect(__get('impuestos', 'i1')?.fechaPago).toBeUndefined()
    expect(__get(COL_MOV, 'm-imp')).toBeUndefined()
  })
})

describe('listarTodosLosMovimientos', () => {
  it('respeta el límite solicitado y devuelve los más recientes', async () => {
    seedCuenta('a', 100000)
    for (const [fecha, monto] of [
      ['2026-01-01', 100],
      ['2026-02-01', 200],
      ['2026-03-01', 300],
    ] as const) {
      await crearMovimiento({
        fecha,
        tipo: 'gasto',
        concepto: fecha,
        monto,
        categoria: 'Otros',
        cuentaBancoId: 'a',
      })
    }
    const r = await listarTodosLosMovimientos(2)
    expect(r).toHaveLength(2)
    expect(r.map((m) => m.fecha)).toEqual(['2026-03-01', '2026-02-01'])
  })
})
