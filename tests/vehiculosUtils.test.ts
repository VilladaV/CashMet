import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sugerirTarifaSoat, sugerirTarifaTM } from '@/features/vehiculos/tarifasColombia'
import { diasParaVencer, kmSobrepasadosTarea, progresoTarea, vigenciaDe } from '@/features/vehiculos/vehiculoUtils'
import type { TareaMantenimiento } from '@/lib/firebase/vehiculosRepo'

describe('tarifasColombia · sugerirTarifaSoat y sugerirTarifaTM', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sugerirTarifaSoat selecciona ciclomotor para motos <= 50cc y devuelve undefined para "otro"', () => {
    expect(sugerirTarifaSoat('moto', 50)?.id).toBe('soat-ciclomotor')
    expect(sugerirTarifaSoat('moto', 49)?.id).toBe('soat-ciclomotor')
    expect(sugerirTarifaSoat('moto', 99)?.id).toBe('soat-moto-menos-100')
    expect(sugerirTarifaSoat('moto', 150)?.id).toBe('soat-moto-100-200')
    expect(sugerirTarifaSoat('moto', 250)?.id).toBe('soat-moto-mas-200')
    expect(sugerirTarifaSoat('otro')).toBeUndefined()
    expect(sugerirTarifaSoat('otro', 1600, 2022)).toBeUndefined()
  })

  it('sugerirTarifaSoat distingue antigüedad y cilindraje en carros', () => {
    expect(sugerirTarifaSoat('carro', 1600, 2024)?.id).toBe('soat-familiar-1500-2500-nuevo')
    expect(sugerirTarifaSoat('carro', 1600, 2010)?.id).toBe('soat-familiar-1500-2500-antiguo')
    expect(sugerirTarifaSoat('camion')?.id).toBe('soat-carga-menos-5ton')
  })

  it('sugerirTarifaTM devuelve undefined para "otro" y clasifica por antigüedad', () => {
    expect(sugerirTarifaTM('otro')).toBeUndefined()
    expect(sugerirTarifaTM('otro', 2024)).toBeUndefined()
    expect(sugerirTarifaTM('moto', 2025)?.id).toBe('tm-moto-reciente')
    expect(sugerirTarifaTM('carro', 2015)?.id).toBe('tm-liviano-intermedio')
    expect(sugerirTarifaTM('camion')?.id).toBe('tm-pesado-particular')
  })
})

describe('vehiculoUtils · diasParaVencer (UTC) y progresoTarea', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T23:30:00-05:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calcula días exactos con aritmética UTC independientemente de la hora local', () => {
    expect(diasParaVencer('2026-03-01')).toBe(0)
    expect(diasParaVencer('2026-03-11')).toBe(10)
    expect(diasParaVencer('2026-02-28')).toBe(-1)
    expect(diasParaVencer('2027-03-01')).toBe(365)
    expect(diasParaVencer('invalida')).toBeNull()
    expect(diasParaVencer(undefined)).toBeNull()

    expect(vigenciaDe('2026-02-28')).toBe('vencido')
    expect(vigenciaDe('2026-03-20')).toBe('por-vencer')
    expect(vigenciaDe('2026-06-01')).toBe('vigente')
    expect(vigenciaDe(undefined)).toBe('sin-dato')
  })

  it('calcula progresoTarea y kmSobrepasadosTarea correctamente en todos los bordes', () => {
    const tarea: TareaMantenimiento = {
      id: 't1',
      nombre: 'Cambio de aceite',
      ultimoKm: 10000,
      proximoKm: 15000,
      intervaloKm: 5000,
    }

    expect(progresoTarea(tarea, 10000)).toBe(0)
    expect(progresoTarea(tarea, 12500)).toBe(50)
    expect(progresoTarea(tarea, 14999)).toBe(99)
    expect(progresoTarea(tarea, 15000)).toBe(100)
    expect(progresoTarea(tarea, 16200)).toBe(100)
    expect(kmSobrepasadosTarea(tarea, 16200)).toBe(1200)
    expect(kmSobrepasadosTarea(tarea, 14000)).toBe(0)

    // Infiere ultimoKm cuando solo hay proximoKm e intervaloKm
    const sinUltimo: TareaMantenimiento = {
      id: 't2',
      nombre: 'Filtro',
      proximoKm: 20000,
      intervaloKm: 10000,
    }
    expect(progresoTarea(sinUltimo, 15000)).toBe(50)

    // Borde proximoKm <= ultimoKm
    expect(progresoTarea({ id: 't3', nombre: 'Borde', ultimoKm: 10000, proximoKm: 10000 }, 10000)).toBe(100)
    expect(progresoTarea({ id: 't4', nombre: 'Incompleta' }, 10000)).toBe(0)
  })
})
