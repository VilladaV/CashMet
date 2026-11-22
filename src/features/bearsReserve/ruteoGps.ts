/**
 * Servicio de Ruteo Vehicular GPS por Carreteras Reales (OSRM / OpenStreetMap)
 * Delinea las curvas, giros y trayectos exactos por la malla vial como un GPS.
 */

import { calcularDistanciaHaversineKm } from './geo'

export interface CacheRuta {
  coordenadas: Array<[number, number]>
  distanciaKm: number
  duracionMinutos: number
}

const MAX_CACHE_RUTAS = 100
const OSRM_TIMEOUT_MS = 6000
const OSRM_COOLDOWN_MS = 60_000

const cacheRutasMemoria = new Map<string, CacheRuta>()
const inFlight = new Map<string, Promise<CacheRuta | null>>()
let osrmCooldownHasta = 0

function guardarEnCacheRuta(clave: string, valor: CacheRuta): void {
  if (cacheRutasMemoria.size >= MAX_CACHE_RUTAS) {
    const primeraClave = cacheRutasMemoria.keys().next().value
    if (primeraClave !== undefined) {
      cacheRutasMemoria.delete(primeraClave)
    }
  }
  cacheRutasMemoria.set(clave, valor)
}

function estimarDistanciaLinealKm(puntos: Array<{ lat: number; lng: number }>): number {
  let total = 0
  for (let i = 0; i < puntos.length - 1; i++) {
    total += calcularDistanciaHaversineKm(
      puntos[i].lat,
      puntos[i].lng,
      puntos[i + 1].lat,
      puntos[i + 1].lng
    )
  }
  return total
}

function esperarConAbort<T>(promesa: Promise<T>, signal?: AbortSignal): Promise<T | null> {
  if (!signal) return promesa
  if (signal.aborted) return Promise.resolve(null)
  return new Promise<T | null>((resolve) => {
    const onAbort = () => resolve(null)
    signal.addEventListener('abort', onAbort, { once: true })
    promesa.then(
      (val) => {
        signal.removeEventListener('abort', onAbort)
        resolve(signal.aborted ? null : val)
      },
      () => {
        signal.removeEventListener('abort', onAbort)
        resolve(null)
      }
    )
  })
}

export async function trazarRutaCarreteraGps(
  puntos: Array<{ lat: number; lng: number }>,
  signal?: AbortSignal
): Promise<CacheRuta | null> {
  try {
    if (signal?.aborted) return null
    if (!Array.isArray(puntos) || puntos.length < 2) return null

    for (const p of puntos) {
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
        return null
      }
    }

    const clave = puntos.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')
    const enCache = cacheRutasMemoria.get(clave)
    if (enCache) {
      return enCache
    }

    const pendiente = inFlight.get(clave)
    if (pendiente) {
      return await esperarConAbort(pendiente, signal)
    }

    if (Date.now() < osrmCooldownHasta) {
      return null
    }

    const distanciaLineal = estimarDistanciaLinealKm(puntos)
    const overview = distanciaLineal > 50 ? 'simplified' : 'full'
    const coordsStr = puntos.map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=${overview}&geometries=geojson`

    const tarea = (async (): Promise<CacheRuta | null> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS)
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          if (res.status === 429 || res.status >= 500) {
            osrmCooldownHasta = Date.now() + OSRM_COOLDOWN_MS
          }
          return null
        }

        const data = (await res.json()) as {
          code?: string
          routes?: Array<{
            distance?: number
            duration?: number
            geometry?: { coordinates?: Array<[number, number]> }
          }>
        }

        const r = data.code === 'Ok' && Array.isArray(data.routes) ? data.routes[0] : undefined
        const rawCoords = r?.geometry?.coordinates
        if (
          !r ||
          !Array.isArray(rawCoords) ||
          rawCoords.length < 2 ||
          typeof r.distance !== 'number' ||
          !Number.isFinite(r.distance) ||
          typeof r.duration !== 'number' ||
          !Number.isFinite(r.duration)
        ) {
          return null
        }

        // GeoJSON coordinates vienen como [lng, lat], Leaflet polyline requiere [lat, lng]
        const coordenadas: Array<[number, number]> = rawCoords.map((c) => [c[1], c[0]])
        const distanciaKm = Number((r.distance / 1000).toFixed(1))
        const duracionMinutos = r.duration > 0 ? Math.max(1, Math.round(r.duration / 60)) : 0

        const resultado: CacheRuta = { coordenadas, distanciaKm, duracionMinutos }
        guardarEnCacheRuta(clave, resultado)
        return resultado
      } catch {
        osrmCooldownHasta = Date.now() + OSRM_COOLDOWN_MS
        return null
      } finally {
        clearTimeout(timeoutId)
        inFlight.delete(clave)
      }
    })()

    inFlight.set(clave, tarea)
    return await esperarConAbort(tarea, signal)
  } catch {
    return null
  }
}
