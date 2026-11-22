import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))
vi.mock('@/lib/fx', () => ({
  convertirACOP: vi.fn().mockResolvedValue({ montoCOP: 4000000, tasa: 4000, moneda: 'USD', fecha: '2026-02-28' }),
}))

import { guardarSalarioPropio, leerPiloto } from '@/lib/firebase/pilotoRepo'
import { ejecutarPilotoAutomatico } from '@/lib/piloto'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

beforeEach(() => {
  __reset()
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pilotoRepo · mergeFields en guardarSalarioPropio', () => {
  it('al cambiar de USD a COP reemplaza el objeto salario sin conservar moneda USD y preserva otros campos del doc', async () => {
    __seed('configuracion_sistema', 'piloto', {
      salario: {
        activo: true,
        monto: 1000,
        moneda: 'USD',
        dia: 15,
        cuentaBancoId: 'cta-1',
        concepto: 'Salario remoto',
      },
      preferenciasExtra: { mantener: true },
    })

    await guardarSalarioPropio({
      activo: true,
      monto: 4500000,
      moneda: 'COP',
      dia: 30,
      cuentaBancoId: 'cta-1',
    })

    const cfg = await leerPiloto()
    expect(cfg.salario?.moneda).toBe('COP')
    expect(cfg.salario?.monto).toBe(4500000)
    expect(cfg.salario?.concepto).toBeUndefined()
    // Otros campos ajenos a mergeFields se conservan intactos
    expect((__get('configuracion_sistema', 'piloto') as Record<string, unknown>)?.preferenciasExtra).toEqual({
      mantener: true,
    })
  })
})

describe('ejecutarPilotoAutomatico', () => {
  it('dispara pagos configurados para día 30 y 31 el último día real de febrero (28)', async () => {
    vi.setSystemTime(new Date('2026-02-28T15:00:00.000Z'))
    __seed('cuentas_banco', 'cta-1', { nombre: 'Bancolombia', tipo: 'ahorros', saldoActual: 10_000_000, activa: true })
    __seed('configuracion_sistema', 'piloto', {
      salario: { activo: true, monto: 5_000_000, moneda: 'COP', dia: 31, cuentaBancoId: 'cta-1' },
    })
    __seed('nomina', 'n1', {
      nombreCompleto: 'Luis',
      cargo: 'Conductor',
      activo: true,
      autoCobrar: true,
      salarioBaseMensual: 2_000_000,
      cuentaBancoId: 'cta-1',
      fechaPago: { dia: 30, tipo: 'mensual' },
    })
    __seed('deudas', 'd1', {
      nombre: 'Crédito',
      tipo: 'consumo',
      estado: 'activa',
      autoDescontar: true,
      saldoPendiente: 1_000_000,
      cuotaMensual: 300_000,
      fechaVencimientoCuota: 31,
      cuentaBancoId: 'cta-1',
    })

    const res = await ejecutarPilotoAutomatico()

    expect(res.cambio).toBe(true)
    const movs = __all('movimientos')
    expect(movs).toHaveLength(3)
    expect(movs.every((m) => m.fecha === '2026-02-28')).toBe(true)
  })

  it('mutex evita doble corrida concurrente y no duplica movimientos', async () => {
    vi.setSystemTime(new Date('2026-03-15T15:00:00.000Z'))
    __seed('cuentas_banco', 'cta-1', { nombre: 'Bancolombia', tipo: 'ahorros', saldoActual: 1_000_000, activa: true })
    __seed('configuracion_sistema', 'piloto', {
      salario: { activo: true, monto: 3_000_000, moneda: 'COP', dia: 15, cuentaBancoId: 'cta-1' },
    })

    const [r1, r2] = await Promise.all([ejecutarPilotoAutomatico(), ejecutarPilotoAutomatico()])

    expect(r1).toBe(r2)
    expect(__all('movimientos')).toHaveLength(1)
    expect(__get('cuentas_banco', 'cta-1')?.saldoActual).toBe(4_000_000)
  })

  it('ignora movimientos con estado "anulado" al verificar si ya se aplicó el mes', async () => {
    vi.setSystemTime(new Date('2026-03-15T15:00:00.000Z'))
    __seed('cuentas_banco', 'cta-1', { nombre: 'Bancolombia', tipo: 'ahorros', saldoActual: 1_000_000, activa: true })
    __seed('configuracion_sistema', 'piloto', {
      salario: { activo: true, monto: 2_500_000, moneda: 'COP', dia: 15, cuentaBancoId: 'cta-1' },
    })
    __seed('movimientos', 'm-anulado', {
      fecha: '2026-03-15',
      tipo: 'ingreso',
      concepto: 'Salario mensual',
      monto: 2_500_000,
      categoria: 'Salario',
      cuentaBancoId: 'cta-1',
      recurrenteId: 'salario_propio',
      estado: 'anulado',
    })

    const res = await ejecutarPilotoAutomatico()

    expect(res.aplicados).toHaveLength(1)
    const activos = __all('movimientos').filter((m) => m.estado !== 'anulado')
    expect(activos).toHaveLength(1)
    expect(__get('cuentas_banco', 'cta-1')?.saldoActual).toBe(3_500_000)
  })

  it('nunca genera textos duplicados como "COP COP" en aplicados ni avisos', async () => {
    vi.setSystemTime(new Date('2026-03-20T15:00:00.000Z'))
    __seed('cuentas_banco', 'cta-1', { nombre: 'Ahorros', tipo: 'ahorros', saldoActual: 50_000, activa: true })
    __seed('configuracion_sistema', 'piloto', {
      salario: { activo: true, monto: 2_000_000, moneda: 'COP', dia: 15, cuentaBancoId: 'cta-1' },
    })
    __seed('nomina', 'n1', {
      nombreCompleto: 'Ana',
      cargo: 'Contadora',
      activo: true,
      autoCobrar: true,
      salarioBaseMensual: 5_000_000,
      cuentaBancoId: 'cta-1',
      fechaPago: { dia: 10, tipo: 'mensual' },
    })

    const res = await ejecutarPilotoAutomatico()
    const textos = [...res.aplicados.map((a) => a.texto), ...res.avisos]
    expect(textos.length).toBeGreaterThanOrEqual(2)
    for (const t of textos) {
      expect(t).not.toMatch(/COP\s+COP/i)
    }
  })
})
