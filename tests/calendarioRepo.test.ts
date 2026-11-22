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

describe('construirEventos · prima legal y predial de propiedades', () => {
  it('programa la prima de junio el 30 de junio (-06-30) y NO en julio (-07-30)', async () => {
    vi.setSystemTime(new Date('2026-01-15T15:00:00.000Z'))
    __seed(COL_NOM, 'n-prima', {
      nombreCompleto: 'Carlos',
      cargo: 'Conductor',
      activo: true,
      salarioBaseMensual: 2000000,
      primaServicios: { aplica: true, mitadJulio: true, mitadDiciembre: true },
    })
    const eventos = await construirEventos(12)
    const primaJunio = eventos.filter((e) => e.tipo === 'prima_julio')
    const primaDic = eventos.filter((e) => e.tipo === 'prima_diciembre')
    expect(primaJunio).toHaveLength(1)
    expect(primaJunio[0].fechaInicio).toBe('2026-06-30')
    expect(primaJunio[0].fechaInicio).not.toContain('-07-')
    expect(primaDic).toHaveLength(1)
    expect(primaDic[0].fechaInicio).toBe('2026-12-20')
  })

  it('incluye vencimientos de predial de propiedades registradas', async () => {
    vi.setSystemTime(new Date('2026-01-15T15:00:00.000Z'))
    __seed('propiedades', 'prop-1', {
      nombre: 'Finca El Guadual',
      tipo: 'vivienda',
      impuestos: {
        predial: {
          vigente: true,
          valorAnual: 1200000,
          fechaVencimiento: '2026-05-31',
          municipio: 'Manizales',
        },
      },
    })
    const eventos = await construirEventos(12)
    const prediales = eventos.filter((e) => e.tipo === 'predial')
    expect(prediales).toHaveLength(1)
    expect(prediales[0]).toMatchObject({
      titulo: 'Predial Finca El Guadual',
      fechaInicio: '2026-05-31',
      relacionado: { propiedadId: 'prop-1' },
    })
  })

  it('no produce overflow en día 31 al construir 12 meses de nómina y deudas', async () => {
    vi.setSystemTime(new Date('2026-01-01T15:00:00.000Z'))
    seedNomina(31)
    seedDeuda(31)
    const eventos = await construirEventos(12)
    const fechasNomina = eventos.filter((e) => e.tipo === 'nomina_trabajador').map((e) => e.fechaInicio)
    expect(fechasNomina).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ])
  })
})
