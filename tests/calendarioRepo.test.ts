import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { construirEventos, guardarEventos, listarEventos } from '@/lib/firebase/calendarioRepo'
import { __reset, __seed } from './helpers/fakeFirestore'

const COL_NOM = 'nomina'
const COL_DEUDA = 'deudas'
const COL_EV = 'calendario_eventos'

function seedNomina(dia: number) {
  __seed(COL_NOM, 'n1', {
    nombreCompleto: 'Ana',
    cargo: 'Contadora',
    activo: true,
    salarioBaseMensual: 2000000,
    fechaPago: { dia, tipo: 'mensual' },
  })
}

function seedDeuda(dia: number) {
  __seed(COL_DEUDA, 'd1', {
    nombre: 'Tarjeta',
    estado: 'activa',
    saldoPendiente: 1000,
    fechaVencimientoCuota: dia,
  })
}

beforeEach(() => {
  __reset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('construirEventos · fechas de nómina', () => {
  it('recorta el día 31 al último día real de cada mes', async () => {
    vi.setSystemTime(new Date('2026-01-15T15:00:00.000Z'))
    seedNomina(31)
    const eventos = await construirEventos(3)
    const fechas = eventos.filter((e) => e.tipo === 'nomina_trabajador').map((e) => e.fechaInicio)
    expect(fechas).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('usa el 29 de febrero en año bisiesto', async () => {
    vi.setSystemTime(new Date('2024-01-15T15:00:00.000Z'))
    seedNomina(29)
    const fechas = (await construirEventos(2))
      .filter((e) => e.tipo === 'nomina_trabajador')
      .map((e) => e.fechaInicio)
    expect(fechas).toEqual(['2024-01-29', '2024-02-29'])
  })

  it('no genera eventos de meses ya pasados en el mes actual', async () => {
    vi.setSystemTime(new Date('2026-01-20T15:00:00.000Z'))
    seedNomina(10)
    const fechas = (await construirEventos(3))
      .filter((e) => e.tipo === 'nomina_trabajador')
      .map((e) => e.fechaInicio)
    expect(fechas).toEqual(['2026-02-10', '2026-03-10'])
  })
})

describe('construirEventos · cuotas de deuda', () => {
  it('recorta el día 31 al último día del mes', async () => {
    vi.setSystemTime(new Date('2026-02-10T15:00:00.000Z'))
    seedDeuda(31)
    const fechas = (await construirEventos(3))
      .filter((e) => e.tipo === 'cuota_deuda')
      .map((e) => e.fechaInicio)
    expect(fechas).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('omite deudas que no están activas', async () => {
    vi.setSystemTime(new Date('2026-02-10T15:00:00.000Z'))
    __seed(COL_DEUDA, 'd2', { nombre: 'Pagada', estado: 'pagada', fechaVencimientoCuota: 5 })
    const eventos = await construirEventos(2)
    expect(eventos.filter((e) => e.tipo === 'cuota_deuda')).toHaveLength(0)
  })
})

describe('calendario · persistencia', () => {
  it('guardarEventos no duplica eventos ya existentes', async () => {
    vi.setSystemTime(new Date('2026-02-10T15:00:00.000Z'))
    seedNomina(15)
    const eventos = await construirEventos(2)
    const primeros = await guardarEventos(eventos)
    const segundos = await guardarEventos(eventos)
    expect(primeros).toBeGreaterThan(0)
    expect(segundos).toBe(0)
  })

  it('listarEventos excluye inactivos, ordena y respeta el máximo', async () => {
    __seed(COL_EV, 'e1', { titulo: 'B', fechaInicio: '2026-03-01', activo: true })
    __seed(COL_EV, 'e2', { titulo: 'A', fechaInicio: '2026-02-01', activo: true })
    __seed(COL_EV, 'e3', { titulo: 'C', fechaInicio: '2026-01-01', activo: false })
    const r = await listarEventos(10)
    expect(r.map((e) => e.titulo)).toEqual(['A', 'B'])
    expect(await listarEventos(1)).toHaveLength(1)
  })
})
