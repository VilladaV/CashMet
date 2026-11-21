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
  plaza_mercado_manizales: {
    nombre: 'Plaza de Mercado / Galería Central de Manizales',
    lat: 5.0662,
    lng: -75.5178,
  },
  bajo_tablazo: {
    nombre: 'Sector Bajo Tablazo',
    lat: 5.0345,
    lng: -75.528,
    esTrocha: true,
  },
  villamaria: {
    nombre: 'Villamaría / Vía Gallinazo (Caldas)',
    lat: 5.0458,
    lng: -75.5142,
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
  palestina: {
    nombre: 'Municipio de Palestina (Caldas)',
    lat: 5.0229,
    lng: -75.6227,
  },
  santa_rosa: {
    nombre: 'Santa Rosa de Cabal (Risaralda)',
    lat: 4.8681,
    lng: -75.6214,
  },
  pereira: {
    nombre: 'Pereira (Risaralda)',
    lat: 4.8133,
    lng: -75.6961,
  },
  fresno: {
    nombre: 'Fresno (Tolima)',
    lat: 5.1522,
    lng: -75.0361,
  },
  cocorna: {
    nombre: 'Cocorná (Antioquia)',
    lat: 6.0594,
    lng: -75.1847,
  },
}

/**
 * Resuelve coordenadas aproximadas reales a partir del nombre de una vereda,
 * municipio o departamento mencionado en una llamada comunitaria.
 */
export function resolverCoordenadasLugar(
  lugar: string,
  departamento = 'Caldas'
): { lat: number; lng: number } {
  const texto = `${lugar} ${departamento}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const diccionario: Array<{ claves: string[]; punto: PuntoGeografico }> = [
    { claves: ['cabaña', 'cabana', 'quiebra'], punto: PUNTOS_REFERENCIA_CALDAS.la_cabana },
    { claves: ['la linda', 'morrogacho'], punto: PUNTOS_REFERENCIA_CALDAS.la_linda },
    { claves: ['desquite'], punto: PUNTOS_REFERENCIA_CALDAS.el_desquite },
    { claves: ['rosario', 'siria'], punto: PUNTOS_REFERENCIA_CALDAS.el_rosario },
    { claves: ['trinidad'], punto: PUNTOS_REFERENCIA_CALDAS.la_trinidad_escuela },
    { claves: ['mercado', 'galeria'], punto: PUNTOS_REFERENCIA_CALDAS.plaza_mercado_manizales },
    { claves: ['tablazo'], punto: PUNTOS_REFERENCIA_CALDAS.bajo_tablazo },
    { claves: ['villamaria', 'gallinazo'], punto: PUNTOS_REFERENCIA_CALDAS.villamaria },
    { claves: ['letras', 'mesones', 'padua'], punto: PUNTOS_REFERENCIA_CALDAS.letras_mesones },
    { claves: ['neira', 'aranzazu', 'salamina'], punto: PUNTOS_REFERENCIA_CALDAS.neira },
    { claves: ['chinchina'], punto: PUNTOS_REFERENCIA_CALDAS.chinchina },
    { claves: ['palestina', 'arauca', 'santagueda'], punto: PUNTOS_REFERENCIA_CALDAS.palestina },
    { claves: ['santa rosa'], punto: PUNTOS_REFERENCIA_CALDAS.santa_rosa },
    { claves: ['pereira', 'dosquebradas', 'risaralda'], punto: PUNTOS_REFERENCIA_CALDAS.pereira },
    { claves: ['fresno', 'mariquita', 'tolima', 'herveo'], punto: PUNTOS_REFERENCIA_CALDAS.fresno },
    { claves: ['cocorna', 'san luis', 'antioquia', 'medellin'], punto: PUNTOS_REFERENCIA_CALDAS.cocorna },
    { claves: ['san peregrino', 'guadual'], punto: PUNTOS_REFERENCIA_CALDAS.san_peregrino },
    { claves: ['manizales', 'chipre', 'centro'], punto: PUNTOS_REFERENCIA_CALDAS.colegios_manizales },
  ]

  for (const item of diccionario) {
    if (item.claves.some((k) => texto.includes(k))) {
      return { lat: item.punto.lat, lng: item.punto.lng }
    }
  }

  return { lat: PUNTOS_REFERENCIA_CALDAS.colegios_manizales.lat, lng: PUNTOS_REFERENCIA_CALDAS.colegios_manizales.lng }
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
 * Calcula la distancia total real por carretera/trocha a partir de una secuencia de paradas.
 */
export function calcularDistanciaRutaParadas(
  paradas: Array<{ lat: number; lng: number }>,
  esTrocha = true
): { distanciaKm: number; minutosRodamiento: number } {
  if (!paradas || paradas.length < 2) {
    return { distanciaKm: 0, minutosRodamiento: 0 }
  }
  let linealTotal = 0
  for (let i = 0; i < paradas.length - 1; i++) {
    linealTotal += calcularDistanciaHaversineKm(
      paradas[i].lat,
      paradas[i].lng,
      paradas[i + 1].lat,
      paradas[i + 1].lng
    )
  }
  const km = Number((linealTotal * factorSinuosidadMontaña(esTrocha)).toFixed(1))
  const velKmH = esTrocha ? 28 : 38
  const min = Math.max(5, Math.round((km / velKmH) * 60))
  return { distanciaKm: km, minutosRodamiento: min }
}

/**
 * Calcula la distancia real por carretera/trocha desde Finca El Guadual a un punto.
 */
export function calcularDistanciaRealDesdeBase(
  destinoLat: number,
  destinoLng: number,
  esTrocha = false
): {
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

  // Velocidad promedio en curvas y trochas de montaña: ~26 km/h en trocha, ~36 km/h mixto
  const velPromedioKmH = esTrocha ? 26 : 36
  const tiempoMinutos = kmTotal > 0 ? Math.round((kmTotal / velPromedioKmH) * 60) : 0

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
 * Escapa texto de usuario antes de insertarlo en HTML de popups/tooltips de Leaflet.
 */
export function escapeHtml(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Paradas geográficas reales de la Ruta Escolar Rural Bear's Reserve:
 * Salida desde Base Finca El Guadual (San Peregrino) hacia veredas y colegios.
 */
export const PARADAS_RUTA_ESCOLAR_MATUTINA: PuntoGeografico[] = [
  { ...BASE_BEARS_RESERVE, nombre: '06:00 · Salida Base Finca El Guadual' },
  { nombre: '06:12 · Vereda San Peregrino (Fincas La Esperanza y El Paraíso)', lat: 5.0742, lng: -75.581, esTrocha: true },
  { nombre: '06:24 · Cruce Vereda La Linda (Recogida 4 niños)', lat: 5.078, lng: -75.558, esTrocha: true },
  { nombre: '06:36 · Vereda La Cabaña (Recogida 5 niños)', lat: 5.0934, lng: -75.5562, esTrocha: true },
  { nombre: '06:50 · Escuela Rural La Trinidad (Dejada de 6 niños)', lat: 5.0722, lng: -75.545 },
  { nombre: '07:05 · Colegios Manizales Urbana / Chipre (Dejada 7 niños)', lat: 5.0689, lng: -75.5174 },
  { ...BASE_BEARS_RESERVE, nombre: '07:30 · Retorno a Base Finca El Guadual' },
]

export const PARADAS_RUTA_ESCOLAR_VESPERTINA: PuntoGeografico[] = [
  { ...BASE_BEARS_RESERVE, nombre: '15:00 · Salida Base Finca El Guadual' },
  { nombre: '15:25 · Colegios Manizales Urbana / Chipre (Recogida niños)', lat: 5.0689, lng: -75.5174 },
  { nombre: '15:45 · Escuela Rural La Trinidad (Recogida niños)', lat: 5.0722, lng: -75.545 },
  { nombre: '16:02 · Dejada en Vereda La Cabaña', lat: 5.0934, lng: -75.5562, esTrocha: true },
  { nombre: '16:18 · Dejada en Vereda La Linda', lat: 5.078, lng: -75.558, esTrocha: true },
  { nombre: '16:32 · Dejada en Vereda San Peregrino', lat: 5.0742, lng: -75.581, esTrocha: true },
  { ...BASE_BEARS_RESERVE, nombre: '16:50 · Retorno a Base Finca El Guadual' },
]

export const PARADAS_RUTA_MERCADO_CAMPESINO: PuntoGeografico[] = [
  { ...BASE_BEARS_RESERVE, nombre: '05:30 · Salida Base Finca El Guadual' },
  { nombre: '05:45 · Acopio Vereda San Peregrino (Plátano y Café)', lat: 5.0742, lng: -75.581, esTrocha: true },
  { nombre: '06:05 · Acopio Vereda La Linda (Hortalizas y Frutas)', lat: 5.0745, lng: -75.5398, esTrocha: true },
  { nombre: '06:25 · Vereda El Rosario (Pequeños productores)', lat: 5.0489, lng: -75.5682, esTrocha: true },
  { nombre: '07:00 · Plaza de Mercado / Galería Central de Manizales', lat: 5.0662, lng: -75.5178 },
  { ...BASE_BEARS_RESERVE, nombre: '07:50 · Retorno a Base Finca El Guadual' },
]
