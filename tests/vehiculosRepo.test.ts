import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import {
  actualizarKilometraje,
  actualizarVehiculo,
  crearVehiculo,
  detalleGastosVehiculo,
  registrarServicioMantenimiento,
} from '@/lib/firebase/vehiculosRepo'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

const COL = 'vehiculos'

beforeEach(() => {
  __reset()
})

describe('detalleGastosVehiculo', () => {
  it('mensualiza SOAT, TM, STR y otros gastos', () => {
    const d = detalleGastosVehiculo({
      soat: { valorPrimaAnual: 1200000 },
      tecnicomecanica: { costoRevision: 600000 },
      seguroTodoRiesgo: { tiene: true, valorPrimaAnual: 2400000, periodicidad: 'anual' },
      otrosGastos: [{ concepto: 'Parqueadero', periodicidad: 'bimestral', valor: 120000 }],
    })
    expect(d).toEqual({
      soatMensual: 100000,
      tmMensual: 50000,
      strMensual: 200000,
      otrosMensual: 60000,
      totalMensual: 410000,
    })
  })

  it('no suma STR cuando tiene=false', () => {
    const d = detalleGastosVehiculo({
      seguroTodoRiesgo: { tiene: false, valorPrimaAnual: 2400000, periodicidad: 'anual' },
    })
    expect(d.strMensual).toBe(0)
  })
})

describe('actualizarVehiculo · preservación de campos anidados', () => {
  function seedVehiculo() {
    __seed(COL, 'v1', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      activo: true,
      estado: 'Disponible',
      soat: {
        aseguradora: 'Sura',
        numeroPoliza: 'POL-1',
        fechaVencimiento: '2026-12-31',
        valorPrimaAnual: 800000,
      },
      tecnicomecanica: { centroRevision: 'CDA Norte', fechaVencimiento: '2026-10-01' },
      mantenimiento: { kilometrajeActual: 10000, tareas: [{ id: 't1', nombre: 'Aceite' }] },
    })
  }

  it('conserva los campos de SOAT que no vienen en la actualización', async () => {
    seedVehiculo()
    await actualizarVehiculo('v1', { soat: { fechaVencimiento: '2027-12-31' } })
    const v = __get(COL, 'v1')
    expect(v?.soat).toMatchObject({
      aseguradora: 'Sura',
      numeroPoliza: 'POL-1',
      fechaVencimiento: '2027-12-31',
      valorPrimaAnual: 800000,
    })
  })

  it('conserva los campos de mantenimiento y tareas', async () => {
    seedVehiculo()
    await actualizarVehiculo('v1', { mantenimiento: { kilometrajeActual: 12000 } })
    const v = __get(COL, 'v1')
    expect(v?.mantenimiento?.kilometrajeActual).toBe(12000)
    expect(v?.mantenimiento?.tareas).toHaveLength(1)
  })

  it('conserva los campos de nivel superior al actualizar uno solo', async () => {
    seedVehiculo()
    await actualizarVehiculo('v1', { color: 'Rojo' })
    const v = __get(COL, 'v1')
    expect(v?.marca).toBe('Toyota')
    expect(v?.soat?.aseguradora).toBe('Sura')
    expect(v?.color).toBe('Rojo')
  })

  it('permite borrar un bloque anidado con null', async () => {
    seedVehiculo()
    await actualizarVehiculo('v1', { soat: null })
    expect(__get(COL, 'v1')?.soat).toBeUndefined()
  })

  it('recalcula el gasto mensual con los datos mezclados', async () => {
    seedVehiculo()
    await actualizarVehiculo('v1', {
      tecnicomecanica: { costoRevision: 600000 },
      seguroTodoRiesgo: { tiene: true, valorPrimaAnual: 1200000, periodicidad: 'anual' },
    })
    const v = __get(COL, 'v1')
    expect(v?.gastosMensualesCalculados).toBe(
      Math.round(800000 / 12) + Math.round(600000 / 12) + Math.round(1200000 / 12)
    )
  })
})

describe('mantenimiento', () => {
  it('actualizarKilometraje conserva las tareas existentes', async () => {
    __seed(COL, 'v1', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      mantenimiento: { kilometrajeActual: 1000, tareas: [{ id: 't1', nombre: 'Aceite' }] },
    })
    await actualizarKilometraje('v1', 2500.7)
    const v = __get(COL, 'v1')
    expect(v?.mantenimiento?.kilometrajeActual).toBe(2501)
    expect(v?.mantenimiento?.tareas).toHaveLength(1)
  })

  it('registrarServicioMantenimiento calcula la próxima fecha sin desbordar el mes', async () => {
    __seed(COL, 'v1', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      mantenimiento: {
        kilometrajeActual: 1000,
        tareas: [{ id: 't1', nombre: 'Aceite', intervaloMeses: 1 }],
      },
    })
    const t = await registrarServicioMantenimiento('v1', 't1', { km: 2000, fecha: '2026-01-31' })
    expect(t?.proximaFecha).toBe('2026-02-28')
    expect(t?.proximoKm).toBeUndefined()
  })
})

describe('crearVehiculo', () => {
  it('crea con valores por defecto y calcula gastos', async () => {
    const id = await crearVehiculo({
      marca: 'Mazda',
      linea: '2',
      tipo: 'carro',
      soat: { valorPrimaAnual: 1200000 },
    })
    const v = __get(COL, id)
    expect(v?.activo).toBe(true)
    expect(v?.estado).toBe('Disponible')
    expect(v?.gastosMensualesCalculados).toBe(100000)
    expect(__all(COL)).toHaveLength(1)
  })
})
