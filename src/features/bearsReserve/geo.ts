/**
 * Base Central y Sistema Geográfico de Navegación Bear's Reserve 🐻🏔️
 * Base fija: Finca El Guadual, Vereda San Peregrino, Manizales, Caldas.
 */

export interface PuntoGeografico {
  nombre: string
  sector?: string
  lat: number
  lng: number
  esTrocha?: boolean
}

export const BASE_BEARS_RESERVE: PuntoGeografico & { municipio: string; departamento: string } = {
  nombre: 'Finca El Guadual (Base Central)',
  sector: 'Vereda San Peregrino',
  municipio: 'Manizales',
  departamento: 'Caldas',
  lat: 5.06975,
  lng: -75.590521,
}

/**
 * Puntos clave de referencia y veredas de Caldas y alrededores
 */
export const PUNTOS_REFERENCIA_CALDAS: Record<string, PuntoGeografico> = {
  base: {
    nombre: 'Base Central · Finca El Guadual',
    sector: 'San Peregrino',
    lat: 5.06975,
    lng: -75.590521,
  },
  san_peregrino: {
    nombre: 'Vereda San Peregrino',
    lat: 5.06975,
    lng: -75.590521,
  },
  la_cabana: {
    nombre: 'Vereda La Cabaña',
    lat: 5.0934,
    lng: -75.5562,
    esTrocha: true,
  },
  la_linda: {
    nombre: 'Vereda La Linda / Morrogacho',
    lat: 5.0745,
    lng: -75.5398,
    esTrocha: true,
  },
  el_desquite: {
    nombre: 'Vereda El Desquite (Trocha Alta)',
    lat: 5.056,
    lng: -75.438,
    esTrocha: true,
  },
  el_rosario: {
    nombre: 'Vereda El Rosario',
    lat: 5.0489,
    lng: -75.5682,
    esTrocha: true,
  },
  la_trinidad_escuela: {
    nombre: 'Escuela Rural La Trinidad',
    lat: 5.0722,
    lng: -75.545,
  },
  colegios_manizales: {
    nombre: 'Zona Escolar Urbana (Manizales / Chipre / Centro)',
    lat: 5.0689,
    lng: -75.5174,
  },
  bajo_tablazo: {
    nombre: 'Sector Bajo Tablazo',
    lat: 5.0345,
    lng: -75.528,
    esTrocha: true,
  },
  letras_mesones: {
    nombre: 'Sector Mesones / Alto de Letras',
    lat: 5.079,
    lng: -75.335,
    esTrocha: true,
  },
  neira: {
    nombre: 'Municipio de Neira (Caldas)',
    lat: 5.1667,
    lng: -75.5167,
  },
  chinchina: {
    nombre: 'Municipio de Chinchiná',
    lat: 4.9814,
    lng: -75.6042,
  },
  cocorna: {
    nombre: 'Cocorná (Antioquia)',
    lat: 6.0594,
    lng: -75.1847,
  },
}

/**
 * Fórmula de Haversine para calcular la distancia ortodrómica en kilómetros.
 */
export function calcularDistanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Factor de sinuosidad de la Cordillera Central (curvas de montaña y trocha).
 * En Caldas, una distancia en línea recta de 10 km representa en carretera real
 * entre 14 km (pavimento con curvas) y 18 km (trocha destapada de ladera).
 */
export function factorSinuosidadMontaña(esTrocha = false): number {
  return esTrocha ? 1.62 : 1.38
}

/**
 * Calcula la distancia real por carretera/trocha desde Finca El Guadual a un punto.
 */
export function calcularDistanciaRealDesdeBase(destinoLat: number, destinoLng: number, esTrocha = false): {
  distanciaKmIda: number
  distanciaKmTotalIdaYVuelta: number
  tiempoMinutosRodamientoIdaYVuelta: number
} {
  const linealKm = calcularDistanciaHaversineKm(
    BASE_BEARS_RESERVE.lat,
    BASE_BEARS_RESERVE.lng,
    destinoLat,
    destinoLng
  )
  const factor = factorSinuosidadMontaña(esTrocha)
  const kmIda = Number((linealKm * factor).toFixed(1))
  const kmTotal = Number((kmIda * 2).toFixed(1))

  // Velocidad promedio en curvas y trochas de montaña: ~28 km/h en trocha, ~38 km/h mixto
  const velPromedioKmH = esTrocha ? 26 : 36
  const tiempoMinutos = Math.round((kmTotal / velPromedioKmH) * 60)

  return {
    distanciaKmIda: kmIda,
    distanciaKmTotalIdaYVuelta: kmTotal,
    tiempoMinutosRodamientoIdaYVuelta: tiempoMinutos,
  }
}

/**
 * Consumo de combustible al ralentí (Idling) en galones por hora:
 * Motor encendido estacionado durante paradas escolares, wincheos o maniobras.
 */
export const CONSUMO_RALENTI_GALONES_POR_HORA: Record<'carro' | 'camion' | 'moto' | 'otro', number> = {
  camion: 0.55, // Motor diésel pesado con toma de fuerza o winche
  carro: 0.32, // Campero o camioneta 4x4
  moto: 0.08,
  otro: 0.3,
}

export function calcularCombustibleRalenti(
  tipoVehiculo: 'carro' | 'camion' | 'moto' | 'otro',
  minutosRalenti: number
): number {
  const minutos = Number.isFinite(minutosRalenti) ? Math.max(0, minutosRalenti) : 0
  const galonesHora = CONSUMO_RALENTI_GALONES_POR_HORA[tipoVehiculo] || 0.3
  return Number(((minutos / 60) * galonesHora).toFixed(2))
}

/**
 * Paradas geográficas reales de la Ruta Escolar Rural Bear's Reserve:
 * Salida desde Base Finca El Guadual (San Peregrino) hacia veredas y colegios.
 */
export const PARADAS_RUTA_ESCOLAR_MATUTINA: PuntoGeografico[] = [
  { ...BASE_BEARS_RESERVE, nombre: '06:00 · Salida Base Finca El Guadual' },
  { nombre: '06:12 · Vereda San Peregrino (Fincas La Esperanza y El Paraíso)', lat: 5.0742, lng: -75.5810, esTrocha: true },
  { nombre: '06:24 · Cruce Vereda La Linda (Recogida 4 niños)', lat: 5.0780, lng: -75.5580, esTrocha: true },
  { nombre: '06:36 · Vereda La Cabaña (Recogida 5 niños)', lat: 5.0934, lng: -75.5562, esTrocha: true },
  { nombre: '06:50 · Escuela Rural La Trinidad (Dejada de 6 niños)', lat: 5.0722, lng: -75.5450 },
  { nombre: '07:05 · Colegios Manizales Urbana / Chipre (Dejada 7 niños)', lat: 5.0689, lng: -75.5174 },
  { ...BASE_BEARS_RESERVE, nombre: '07:30 · Retorno a Base Finca El Guadual' },
]

export const PARADAS_RUTA_ESCOLAR_VESPERTINA: PuntoGeografico[] = [
  { ...BASE_BEARS_RESERVE, nombre: '15:00 · Salida Base Finca El Guadual' },
  { nombre: '15:25 · Colegios Manizales Urbana / Chipre (Recogida niños)', lat: 5.0689, lng: -75.5174 },
  { nombre: '15:45 · Escuela Rural La Trinidad (Recogida niños)', lat: 5.0722, lng: -75.5450 },
  { nombre: '16:02 · Dejada en Vereda La Cabaña', lat: 5.0934, lng: -75.5562, esTrocha: true },
  { nombre: '16:18 · Dejada en Vereda La Linda', lat: 5.0780, lng: -75.5580, esTrocha: true },
  { nombre: '16:32 · Dejada en Vereda San Peregrino', lat: 5.0742, lng: -75.5810, esTrocha: true },
  { ...BASE_BEARS_RESERVE, nombre: '16:50 · Retorno a Base Finca El Guadual' },
]
