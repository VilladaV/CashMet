import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import { exportarBackup, importarBackup } from '@/lib/firebase/backup'
import { __all, __get, __reset, __seed } from './helpers/fakeFirestore'

beforeEach(() => {
  __reset()
})

describe('backup', () => {
  it('exporta todas las colecciones permitidas con id incluido', async () => {
    __seed('cuentas_banco', 'a', { nombre: 'Ahorros', saldoActual: 100 })
    __seed('deudas', 'd', { nombre: 'Visa', saldoPendiente: 50 })
    const { contenido } = await exportarBackup()
    const data = JSON.parse(contenido)
    expect(data.app).toBe('CashMet')
    expect(data.copia.cuentas_banco).toHaveLength(1)
    expect(data.copia.cuentas_banco[0].id).toBe('a')
    expect(data.copia.deudas[0].id).toBe('d')
  })

  it('importa documentos válidos de colecciones permitidas', async () => {
    const payload = {
      copia: {
        cuentas_banco: [{ id: 'a', nombre: 'Ahorros', saldoActual: 100 }],
        movimientos: [{ id: 'm1', fecha: '2026-11-11', monto: 10, tipo: 'gasto' }],
      },
    }
    const n = await importarBackup(JSON.stringify(payload))
    expect(n).toBe(2)
    expect(__get('cuentas_banco', 'a')?.nombre).toBe('Ahorros')
    expect(__get('movimientos', 'm1')?.monto).toBe(10)
  })

  it('rechaza colecciones fuera de la lista blanca sin escribir nada', async () => {
    const payload = {
      copia: {
        cuentas_banco: [{ id: 'a', nombre: 'Ahorros', saldoActual: 100 }],
        coleccion_maliciosa: [{ id: 'x', foo: 'bar' }],
      },
    }
    await expect(importarBackup(JSON.stringify(payload))).rejects.toThrow(/colección|collection/i)
    expect(__all('cuentas_banco')).toHaveLength(0)
    expect(__all('coleccion_maliciosa')).toHaveLength(0)
  })

  it('rechaza documentos sin id o con estructuras inválidas antes de escribir', async () => {
    const sinId = { copia: { cuentas_banco: [{ nombre: 'Ahorros' }] } }
    await expect(importarBackup(JSON.stringify(sinId))).rejects.toThrow(/id/i)
    expect(__all('cuentas_banco')).toHaveLength(0)

    const noArray = { copia: { cuentas_banco: { id: 'a' } } }
    await expect(importarBackup(JSON.stringify(noArray))).rejects.toThrow(/lista|array|formato/i)

    await expect(importarBackup('{esto no es json')).rejects.toThrow()
  })

  it('rechaza payloads que no son objetos', async () => {
    await expect(importarBackup('null')).rejects.toThrow(/formato/i)
    await expect(importarBackup('[]')).rejects.toThrow(/formato/i)
  })

  it('es idempotente: reimportar sobrescribe por id en vez de duplicar', async () => {
    const payload = { copia: { cuentas_banco: [{ id: 'a', nombre: 'Ahorros', saldoActual: 100 }] } }
    await importarBackup(JSON.stringify(payload))
    const payload2 = { copia: { cuentas_banco: [{ id: 'a', nombre: 'Ahorros', saldoActual: 250 }] } }
    await importarBackup(JSON.stringify(payload2))
    expect(__all('cuentas_banco')).toHaveLength(1)
    expect(__get('cuentas_banco', 'a')?.saldoActual).toBe(250)
  })

  it('limita la cantidad de documentos para evitar importaciones abusivas', async () => {
    const docs = Array.from({ length: 20001 }, (_, i) => ({ id: `d${i}`, nombre: `Cuenta ${i}` }))
    await expect(importarBackup(JSON.stringify({ copia: { cuentas_banco: docs } }))).rejects.toThrow(
      /límite|limite|demasiados/i
    )
  })
})
