// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubEnv('VITE_GOOGLE_CALENDAR_CLIENT_ID', 'test-google-client-id')
})

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))

import {
  conectarGoogleCalendar,
  desconectarGoogleCalendar,
  eliminarEventoGoogle,
  estadoGoogleCalendar,
  sincronizarPendientes,
  subirEvento,
} from '@/lib/google/calendar'
import { __get, __reset, __seed } from './helpers/fakeFirestore'

async function conectarMock() {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: ({ callback }) => ({
          requestAccessToken: () => callback({ access_token: 'tok-test-123', expires_in: 3600 }),
        }),
        revoke: vi.fn(),
      },
    },
  }
  await conectarGoogleCalendar()
}

beforeEach(() => {
  __reset()
  localStorage.clear()
  desconectarGoogleCalendar()
})

afterEach(() => {
  desconectarGoogleCalendar()
  vi.unstubAllGlobals()
  delete window.google
})

describe('google/calendar · HTTP 204, rethrow en 401 y recordatorio 0 min', () => {
  it('maneja HTTP 204 No Content limpiamente en eliminarEventoGoogle sin llamar r.json()', async () => {
    const jsonSpy = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      json: jsonSpy,
    })
    vi.stubGlobal('fetch', fetchMock)

    await conectarMock()
    await expect(eliminarEventoGoogle('g-ev-204')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/g-ev-204',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('respeta recordatorio de 0 minutos en subirEvento (no lo reemplaza por 60)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'google-id-0' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    __seed('calendario_eventos', 'ev-0', {
      titulo: 'Pago puntual',
      tipo: 'personal',
      fechaInicio: '2026-12-01',
      allDay: true,
      recurrente: false,
      recordatorios: [{ minutosAntes: 0 }],
      relacionado: {},
      activo: true,
    })

    await conectarMock()
    const id = await subirEvento({
      id: 'ev-0',
      titulo: 'Pago puntual',
      tipo: 'personal',
      fechaInicio: '2026-12-01',
      allDay: true,
      recurrente: false,
      recordatorios: [{ minutosAntes: 0 }],
      relacionado: {},
    })

    expect(id).toBe('google-id-0')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init.body))
    expect(body.reminders.overrides).toEqual([{ method: 'popup', minutes: 0 }])
    expect(__get('calendario_eventos', 'ev-0')?.googleEventId).toBe('google-id-0')
  })

  it('relanza (rethrow) el error 401 dentro de sincronizarPendientes y desconecta la sesión', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T15:00:00.000Z'))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ error: 'unauthorized' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    __seed('calendario_eventos', 'ev-pend', {
      titulo: 'SOAT',
      tipo: 'soat',
      fechaInicio: '2026-12-01',
      allDay: true,
      recurrente: false,
      recordatorios: [{ minutosAntes: 1440 }],
      relacionado: {},
      activo: true,
    })

    await conectarMock()
    expect(estadoGoogleCalendar().conectado).toBe(true)

    await expect(sincronizarPendientes()).rejects.toMatchObject({ status: 401 })
    expect(estadoGoogleCalendar().conectado).toBe(false)
  })
})
