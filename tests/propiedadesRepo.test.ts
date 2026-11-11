import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { actualizarPropiedad, crearPropiedad } from '@/lib/firebase/propiedadesRepo'
import { __get, __reset, __seed } from './helpers/fakeFirestore'

const COL = 'propiedades'

beforeEach(() => {
  __reset()
})

describe('propiedades · actualización parcial', () => {
  it('conserva los campos del bloque impuestos al actualizar otro campo', async () => {
    __seed(COL, 'p1', {
      nombre: 'Casa',
      tipo: 'vivienda',
      valorComercialEstimado: 300000000,
      impuestos: {
        predial: { vigente: true, valorAnual: 500000, fechaVencimiento: '2026-06-30', municipio: 'Manizales' },
      },
    })
    await actualizarPropiedad('p1', { notas: 'Remodelada' })
    const p = __get(COL, 'p1')
    expect(p?.notas).toBe('Remodelada')
    expect(p?.impuestos?.predial?.valorAnual).toBe(500000)
    expect(p?.impuestos?.predial?.municipio).toBe('Manizales')
  })

  it('permite borrar el bloque de predial con null', async () => {
    __seed(COL, 'p1', {
      nombre: 'Casa',
      tipo: 'vivienda',
      impuestos: { predial: { valorAnual: 500000 } },
    })
    await actualizarPropiedad('p1', { impuestos: null })
    expect(__get(COL, 'p1')?.impuestos).toBeUndefined()
  })

  it('crea propiedades con los campos recibidos', async () => {
    const id = await crearPropiedad({ nombre: 'Lote', tipo: 'terreno', valorPatrimonial: 100000000 })
    expect(__get(COL, id)?.nombre).toBe('Lote')
  })
})
