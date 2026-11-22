import { listarEventos, marcarSincronizadoGoogle, type EventoDoc } from '@/lib/firebase/calendarioRepo'
import { hoyISO } from '@/lib/fechas'

const URL_GIS = 'https://accounts.google.com/gsi/client'
const ALCANCE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3'
/** Clave usada en versiones anteriores; se limpia para no dejar tokens en disco. */
const CLAVE_LEGACY = 'cashmet_gcal_v1'

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID as string | undefined)?.trim()

export const googleCalendarConfigurado = Boolean(CLIENT_ID)

interface TokenResponse {
  access_token: string
  expires_in: number
}

interface TokenClient {
  requestAccessToken: (opciones?: Record<string, string>) => void
}

interface SesionGoogle {
  token: string
  expira: number
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: TokenResponse & { error?: string }) => void
            error_callback?: (err: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string) => void
        }
      }
    }
  }
}

let promesaGIS: Promise<void> | null = null

// El access token vive solo en memoria: nunca se persiste en localStorage ni
// sessionStorage. Al recargar la página el usuario debe reconectar.
let sesionEnMemoria: SesionGoogle | null = null

try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(CLAVE_LEGACY)
} catch {
  /* almacenamiento no disponible */
}

function cargarGIS(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin ventana'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!promesaGIS) {
    promesaGIS = new Promise<void>((resolver, rechazar) => {
      const s = document.createElement('script')
      s.src = URL_GIS
      s.async = true
      s.defer = true
      s.onload = () => resolver()
      s.onerror = () => {
        promesaGIS = null
        s.remove()
        rechazar(new Error('no se pudo cargar Google Identity'))
      }
      document.head.appendChild(s)
    })
  }
  return promesaGIS
}

function leerSesion(): SesionGoogle | null {
  const s = sesionEnMemoria
  if (!s?.token || typeof s.expira !== 'number' || s.expira <= Date.now()) return null
  return s
}

function guardarSesion(s: SesionGoogle) {
  sesionEnMemoria = s
}

export function estadoGoogleCalendar(): { conectado: boolean } {
  const s = leerSesion()
  return { conectado: Boolean(s && s.expira > Date.now() + 60000) }
}

export async function conectarGoogleCalendar(): Promise<void> {
  if (!CLIENT_ID) throw new Error('falta VITE_GOOGLE_CALENDAR_CLIENT_ID')
  await cargarGIS()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google Identity no disponible')
  const respToken = await new Promise<{ token: string; expiresIn: number }>((resolver, rechazar) => {
    const cliente = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: ALCANCE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) rechazar(new Error('autorización denegada'))
        else {
          const exp = Number(resp.expires_in)
          resolver({ token: resp.access_token, expiresIn: Number.isFinite(exp) && exp > 0 ? exp : 3600 })
        }
      },
      error_callback: (err) => {
        rechazar(new Error(err?.message || err?.type || 'autorización cancelada'))
      },
    })
    cliente.requestAccessToken({ prompt: 'consent' })
  })
  guardarSesion({
    token: respToken.token,
    expira: Date.now() + Math.max(60, respToken.expiresIn - 100) * 1000,
  })
}

export function desconectarGoogleCalendar(): void {
  const s = sesionEnMemoria
  if (s && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(s.token)
    } catch {
      /* revocado local de todos modos */
    }
  }
  sesionEnMemoria = null
  try {
    localStorage.removeItem(CLAVE_LEGACY)
  } catch {
    /* sin persistencia disponible */
  }
}

async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const s = leerSesion()
  if (!s) {
    throw Object.assign(new Error('conectar primero Google Calendar'), { status: 401 })
  }
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!r.ok) {
    if (r.status === 401) desconectarGoogleCalendar()
    throw Object.assign(new Error(`Google Calendar respondió ${r.status}`), { status: r.status })
  }
  if (r.status === 204 || r.headers.get('content-length') === '0') {
    return undefined as T
  }
  return (await r.json()) as T
}

function diaSiguiente(fecha: string): string {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const x = new Date(y, (m || 1) - 1, d || 1)
  x.setDate(x.getDate() + 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export async function subirEvento(ev: EventoDoc): Promise<string | null> {
  const fecha = ev.fechaInicio.slice(0, 10)
  const cuerpo = {
    summary: ev.titulo,
    description: ev.descripcion ?? undefined,
    start: { date: fecha },
    end: { date: diaSiguiente(fecha) },
    reminders: {
      useDefault: false,
      overrides: (ev.recordatorios ?? [{ minutosAntes: 1440 }]).map((x) => {
        const mins = Number(x.minutosAntes)
        return {
          method: 'popup',
          minutes: Number.isFinite(mins) && mins >= 0 ? Math.round(mins) : 60,
        }
      }),
    },
  }
  const creado = ev.googleEventId
    ? await api<{ id: string }>(`/calendars/primary/events/${encodeURIComponent(ev.googleEventId)}`, {
        method: 'PATCH',
        body: JSON.stringify(cuerpo),
      })
    : await api<{ id: string }>('/calendars/primary/events', {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      })
  if (!creado?.id) return null
  if (!ev.googleEventId) await marcarSincronizadoGoogle(ev.id, creado.id)
  return creado.id
}

export async function sincronizarPendientes(): Promise<{ subidos: number; fallos: number }> {
  const hoy = hoyISO()
  const eventos = (await listarEventos(500, { desde: hoy })).filter(
    (e) => !e.googleEventId && e.fechaInicio.slice(0, 10) >= hoy
  )
  let subidos = 0
  let fallos = 0
  for (const e of eventos) {
    try {
      const id = await subirEvento(e)
      if (id) subidos++
      else fallos++
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 401 || !estadoGoogleCalendar().conectado) {
        throw err
      }
      fallos++
    }
  }
  return { subidos, fallos }
}

export async function eliminarEventoGoogle(googleEventId: string): Promise<void> {
  await api<unknown>(`/calendars/primary/events/${encodeURIComponent(googleEventId)}`, { method: 'DELETE' }).catch(
    () => {}
  )
}
