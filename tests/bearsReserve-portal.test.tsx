import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))
vi.mock('@/ai/gemini', () => ({
  geminiDisponible: false,
  googleSearchBloqueadoEnSesion: () => true,
  limpiarJson: (s: string) => s,
  llamarGemini: vi.fn().mockResolvedValue({ res: null, modelo: '' }),
  llamarGeminiConBusqueda: vi.fn().mockResolvedValue({ res: null, usoBusqueda: false, errorBusqueda: 'test' }),
  investigarVehiculoConGeminiAI: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/features/bearsReserve/ruteoGps', () => ({
  trazarRutaCarreteraGps: vi.fn().mockResolvedValue({
    coordenadas: [],
    distanciaKm: 12.5,
    duracionMinutos: 22,
  }),
}))

import BearsReservePortal from '@/features/bearsReserve/BearsReservePortal'
import {
  __resetCacheBearsParaTests,
  leerPreciosCombustible,
  leerTarjetaCombustible,
  listarVehiculosBears,
} from '@/features/bearsReserve/repo'
import { __get, __reset, __seed } from './helpers/fakeFirestore'

function seedFlotaYNominaCashmet() {
  __seed('vehiculos', 'v-prado', {
    marca: 'Toyota',
    linea: 'Land Cruiser Prado',
    modelo: 2022,
    tipo: 'carro',
    activo: true,
    estado: 'Disponible',
    notas: '4x4 pasajeros y apoyo rural',
    mantenimiento: { kilometrajeActual: 41200, tareas: [] },
  })
  __seed('vehiculos', 'v-gaz', {
    marca: 'GAZ',
    linea: '3302 GAZelle',
    modelo: 2020,
    tipo: 'camion',
    activo: true,
    estado: 'Disponible',
    notas: 'Camión de carga y rescate',
    mantenimiento: { kilometrajeActual: 88000, tareas: [] },
  })
  __seed('nomina', 'emp-daniela', {
    nombreCompleto: 'Daniela Martínez Torres',
    cargo: 'Conductora de Rescate',
    activo: true,
    tipoContrato: 'indefinido',
    salarioBaseMensual: 2200000,
  })
  __seed('nomina', 'emp-camila', {
    nombreCompleto: 'Camila Editor',
    cargo: 'Editor Audiovisual',
    activo: true,
    tipoContrato: 'indefinido',
    salarioBaseMensual: 2000000,
  })
}

beforeEach(() => {
  cleanup()
  __reset()
  __resetCacheBearsParaTests()
  localStorage.clear()
  // Evitar fetch real a RSS durante test de UI
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline test')))
})

describe("Bear's Reserve · prueba real de uso E2E en <BearsReservePortal /> con recargas F5", () => {
  it('leerTarjetaCombustible() antes de hidratar nunca bloquea la lectura de Firestore', async () => {
    seedFlotaYNominaCashmet()
    __seed('configuracion_sistema', 'bears_reserve_config', {
      vehiculosExtra: {
        'v-prado': { disponibleParaTrabajo: true, investigadoIA: true, capacidadTanqueGalones: 23 },
      },
      empleadosExtra: {},
      rutasHabituales: [],
      rotacionContador: 0,
      actualizado: Date.now(),
    })

    // Simula exactamente lo que hace useState(...) en el primer render del Portal
    leerTarjetaCombustible()
    leerPreciosCombustible()

    const vehs = await listarVehiculosBears()
    const prado = vehs.find((v) => v.id === 'v-prado')
    expect(prado?.disponibleParaTrabajo).toBe(true)
    expect(prado?.investigadoIA).toBe(true)
    expect(prado?.capacidadTanqueGalones).toBe(23)
  })

  it('conserva vehículo habilitado, trabajador desactivado y misión en curso tras recargar (F5) y en navegador limpio (solo Firestore)', async () => {
    seedFlotaYNominaCashmet()

    // 1. Primer ingreso del usuario al Portal
    const view1 = render(<BearsReservePortal onVolverACashmet={() => {}} />)

    // Esperar a que termine la hidratación inicial y aparezca el radar con llamadas de respaldo
    await waitFor(() => {
      expect(screen.queryByText(/Sincronizando Bear's Reserve/i)).toBeNull()
    })

    // 2. Ir a Flota & Combustible y habilitar específicamente Toyota Land Cruiser Prado
    fireEvent.click(screen.getByRole('button', { name: /Flota & Combustible/i }))
    await waitFor(() => {
      expect(screen.getByText(/Toyota Land Cruiser Prado/i)).toBeTruthy()
    })

    const cardPrado = screen.getByText(/Toyota Land Cruiser Prado/i).closest('.rounded-3xl') as HTMLElement
    const checkboxPrado = cardPrado.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkboxPrado.checked).toBe(false)
    fireEvent.click(checkboxPrado)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Habilitados \(1\)/i })).toBeTruthy()
    })

    // 3. Ir a Turnos & Personal y desactivar específicamente a Camila Editor
    fireEvent.click(screen.getByRole('button', { name: /Turnos & Personal/i }))
    await waitFor(() => {
      expect(screen.getAllByText(/Camila Editor/i).length).toBeGreaterThan(0)
    })

    const cardCamila = screen
      .getAllByText(/Camila Editor/i)
      .map((el) => el.closest('.rounded-2xl'))
      .find((c) => c && c.textContent?.includes('En Reserva')) as HTMLElement
    const btnCamila = cardCamila.querySelector('button') as HTMLButtonElement
    fireEvent.click(btnCamila)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Desactivado/i })).toBeTruthy()
    })

    // 4. Volver a Radar & Misiones y despachar una misión
    fireEvent.click(screen.getByRole('button', { name: /Radar & Misiones/i }))
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Despachar Misión/i }).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Despachar Misión/i })[0])

    await waitFor(() => {
      expect(screen.getByText(/Misiones en Desarrollo \(1\)/i)).toBeTruthy()
    })

    // Verificar que Firestore realmente recibió ambos documentos
    const docCfg = __get('configuracion_sistema', 'bears_reserve_config')
    const docOp = __get('configuracion_sistema', 'bears_reserve_operaciones')
    expect(
      (docCfg?.vehiculosExtra as Record<string, { disponibleParaTrabajo?: boolean }>)?.['v-prado']
        ?.disponibleParaTrabajo
    ).toBe(true)
    expect(
      (docCfg?.empleadosExtra as Record<string, { activo?: boolean }>)?.['emp-camila']?.activo
    ).toBe(false)
    expect(Array.isArray(docOp?.misiones) && docOp.misiones.length).toBe(1)

    // 5. SIMULAR F5 (desmontar app, borrar toda la memoria RAM de JS, volver a montar)
    view1.unmount()
    __resetCacheBearsParaTests()

    const view2 = render(<BearsReservePortal onVolverACashmet={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/Misiones en Desarrollo \(1\)/i)).toBeTruthy()
    })

    // Verificar que el vehículo sigue habilitado tras F5
    fireEvent.click(screen.getByRole('button', { name: /Flota & Combustible/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Habilitados \(1\)/i })).toBeTruthy()
    })

    // Verificar que el trabajador sigue desactivado tras F5
    fireEvent.click(screen.getByRole('button', { name: /Turnos & Personal/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Desactivado/i })).toBeTruthy()
    })

    // 6. SIMULAR OTRO NAVEGADOR / CERRAR Y BORRAR LOCALSTORAGE (100% desde Firestore)
    view2.unmount()
    localStorage.clear()
    __resetCacheBearsParaTests()

    render(<BearsReservePortal onVolverACashmet={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/Misiones en Desarrollo \(1\)/i)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Flota & Combustible/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Habilitados \(1\)/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Turnos & Personal/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Desactivado/i })).toBeTruthy()
    })
  })
})
