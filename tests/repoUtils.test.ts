import { describe, expect, it } from 'vitest'
import { limpio } from '@/lib/firebase/repoUtils'

describe('limpio (saneamiento de payloads Firestore)', () => {
  it('elimina undefined y cadenas vacías', () => {
    expect(limpio({ a: 1, b: undefined, c: '' })).toEqual({ a: 1 })
  })

  it('elimina objetos anidados vacíos', () => {
    expect(limpio({ a: { b: undefined, c: '' } })).toEqual({})
  })

  it('conserva ceros y false', () => {
    expect(limpio({ a: 0, b: false })).toEqual({ a: 0, b: false })
  })

  it('conserva arreglos vacíos', () => {
    expect(limpio({ a: [] })).toEqual({ a: [] })
  })

  it('sanea arreglos de objetos', () => {
    expect(limpio({ a: [{ b: 1, c: '' }, undefined] })).toEqual({ a: [{ b: 1 }] })
  })
})
