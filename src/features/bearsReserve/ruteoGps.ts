/**
 * Servicio de Ruteo Vehicular GPS por Carreteras Reales (OSRM / OpenStreetMap)
 * Delinea las curvas, giros y trayectos exactos por la malla vial como un GPS.
 */

interface CacheRuta {
  coordenadas: Array<[number, number]>
  distanciaKm: number
  duracionMinutos: number
}

const cacheRutasMemoria = new Map<string, CacheRuta>()

export async function trazarRutaCarreteraGps(
  puntos: Array<{ lat: number; lng: number }>
): Promise<CacheRuta | null> {
  if (!puntos || puntos.length < 2) return null

  const clave = puntos.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')
  if (cacheRutasMemoria.has(clave)) {
    return cacheRutasMemoria.get(clave)!
  }

  try {
    const coordsStr = puntos.map((p) => `${p.lng},${p.lat}`).join(';')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3500)

    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) return null

    const data = await res.json()
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const r = data.routes[0]
      // GeoJSON coordinates vienen como [lng, lat], Leaflet polyline requiere [lat, lng]
      const coordenadas: Array<[number, number]> = r.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      )
      const distanciaKm = Number((r.distance / 1000).toFixed(1))
      const duracionMinutos = Math.round(r.duration / 60)

      const resultado: CacheRuta = { coordenadas, distanciaKm, duracionMinutos }
      cacheRutasMemoria.set(clave, resultado)
      return resultado
    }
  } catch {
    /* fallback silencioso */
  }

  return null
}
