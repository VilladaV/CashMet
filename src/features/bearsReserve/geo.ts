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
    { claves: ['armenia', 'quindio', 'calarca', 'salento'], punto: { nombre: 'Quindío', lat: 4.5339, lng: -75.6811 } },
    { claves: ['ibague'], punto: { nombre: 'Ibagué (Tolima)', lat: 4.4389, lng: -75.2322 } },
    { claves: ['fresno', 'mariquita', 'tolima', 'herveo'], punto: PUNTOS_REFERENCIA_CALDAS.fresno },
    { claves: ['bello', 'zamora'], punto: { nombre: 'Bello (Antioquia)', lat: 6.3373, lng: -75.5579 } },
    { claves: ['medellin', 'aburra', 'envigado', 'itagui', 'sabaneta'], punto: { nombre: 'Medellín (Antioquia)', lat: 6.2442, lng: -75.5812 } },
    { claves: ['uraba', 'apartado', 'turbo', 'dabeiba'], punto: { nombre: 'Urabá (Antioquia)', lat: 7.883, lng: -76.6259 } },
    { claves: ['cocorna', 'san luis', 'antioquia'], punto: PUNTOS_REFERENCIA_CALDAS.cocorna },
    { claves: ['choco', 'quibdo', 'istmina', 'riosucio choco', 'san juan'], punto: { nombre: 'Chocó', lat: 5.6947, lng: -76.6611 } },
    { claves: ['buenaventura', 'loboguerrero'], punto: { nombre: 'Buenaventura (Valle)', lat: 3.8801, lng: -77.0312 } },
    { claves: ['buga', 'tulua'], punto: { nombre: 'Buga (Valle)', lat: 3.9009, lng: -76.2978 } },
    { claves: ['valle del cauca', 'cali', 'palmira', 'jamundi'], punto: { nombre: 'Valle del Cauca', lat: 3.4516, lng: -76.532 } },
    { claves: ['cauca', 'popayan', 'rosas', 'cajibio', 'panamericana'], punto: { nombre: 'Cauca', lat: 2.4448, lng: -76.6147 } },
    { claves: ['narino', 'pasto', 'tumaco', 'ipiales'], punto: { nombre: 'Nariño', lat: 1.2136, lng: -77.2811 } },
    { claves: ['cordoba', 'monteria', 'lorica', 'mojana'], punto: { nombre: 'Córdoba', lat: 8.7479, lng: -75.8814 } },
    { claves: ['bolivar', 'cartagena', 'magangue'], punto: { nombre: 'Bolívar', lat: 10.391, lng: -75.4794 } },
    { claves: ['atlantico', 'barranquilla', 'soledad'], punto: { nombre: 'Atlántico', lat: 10.9685, lng: -74.7813 } },
    { claves: ['magdalena', 'santa marta', 'cienaga', 'costa'], punto: { nombre: 'Magdalena', lat: 11.2408, lng: -74.199 } },
    { claves: ['guajira', 'riohacha', 'uribia', 'maicao'], punto: { nombre: 'La Guajira', lat: 11.5444, lng: -72.9072 } },
    { claves: ['sucre', 'sincelejo', 'san marcos'], punto: { nombre: 'Sucre', lat: 9.3047, lng: -75.3978 } },
    { claves: ['cesar', 'valledupar', 'aguachica'], punto: { nombre: 'Cesar', lat: 10.4631, lng: -73.2532 } },
    { claves: ['norte de santander', 'cucuta', 'ocana', 'catatumbo'], punto: { nombre: 'Norte de Santander', lat: 7.8939, lng: -72.5078 } },
    { claves: ['santander', 'bucaramanga', 'barrancabermeja', 'san gil'], punto: { nombre: 'Santander', lat: 7.1254, lng: -73.1198 } },
    { claves: ['meta', 'villavicencio', 'via al llano', 'guayabetal'], punto: { nombre: 'Meta', lat: 4.142, lng: -73.6266 } },
    { claves: ['huila', 'neiva', 'pitalito', 'garzon'], punto: { nombre: 'Huila', lat: 2.9273, lng: -75.2819 } },
    { claves: ['boyaca', 'tunja', 'sogamoso', 'duitama'], punto: { nombre: 'Boyacá', lat: 5.5353, lng: -73.3678 } },
    { claves: ['cundinamarca', 'bogota', 'soacha', 'girardot', 'villeta'], punto: { nombre: 'Cundinamarca', lat: 4.711, lng: -74.0721 } },
    { claves: ['putumayo', 'mocoa', 'puerto asis'], punto: { nombre: 'Putumayo', lat: 1.1528, lng: -76.6521 } },
    { claves: ['caqueta', 'florencia'], punto: { nombre: 'Caquetá', lat: 1.6144, lng: -75.6062 } },
    { claves: ['casanare', 'yopal'], punto: { nombre: 'Casanare', lat: 5.3378, lng: -72.3959 } },
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
 * Adapta automáticamente el factor de sinuosidad y velocidad promedio entre trocha local (≤35 km)
 * y carretera nacional de montaña (>35 km) para que los tiempos a otras regiones sean realistas.
 */
export function calcularDistanciaRealDesdeBase(
  destinoLat: number,
  destinoLng: number,
  esTrocha = false
): {
  distanciaKmIda: number
  distanciaKmTotalIdaYVuelta: number
  tiempoMinutosIda: number
  tiempoMinutosRodamientoIdaYVuelta: number
  esLargaDistancia: boolean
} {
  const linealKm = calcularDistanciaHaversineKm(
    BASE_BEARS_RESERVE.lat,
    BASE_BEARS_RESERVE.lng,
    destinoLat,
    destinoLng
  )
  const esLargaDistancia = linealKm > 35
  const usarTrocha = esTrocha && !esLargaDistancia
  const factor = usarTrocha ? 1.54 : 1.42
  const kmIda = Math.max(2, Number((linealKm * factor).toFixed(1)))
  const kmTotal = Number((kmIda * 2).toFixed(1))

  // Velocidad promedio realista en Colombia para camioneta 4x4 / camión:
  // ~28 km/h en trocha veredal, ~48 km/h en carretera nacional de montaña
  const velPromedioKmH = usarTrocha ? 28 : esLargaDistancia ? 48 : 38
  const tiempoIda = kmIda > 0 ? Math.max(8, Math.round((kmIda / velPromedioKmH) * 60)) : 0
  const tiempoTotal = tiempoIda * 2

  return {
    distanciaKmIda: kmIda,
    distanciaKmTotalIdaYVuelta: kmTotal,
    tiempoMinutosIda: tiempoIda,
    tiempoMinutosRodamientoIdaYVuelta: tiempoTotal,
    esLargaDistancia,
  }
}

export interface EstimacionLogisticaMision {
  distanciaKmIda: number
  distanciaKmTotalIdaYVuelta: number
  minutosIda: number
  minutosVuelta: number
  minutosRodamientoTotal: number
  minutosServicioEnSitio: number
  minutosRalenti: number
  duracionTotalMinutos: number
  categoriaDistancia: 'local' | 'regional' | 'nacional'
  fuenteCalculo: 'gps_carretera' | 'estimado_cordillera'
}

/**
 * Estima la logística completa de una misión desde Base Finca El Guadual:
 * Tiempo total = Ida + Servicio/maniobra en el sitio + Vuelta.
 * Si se provee una ruta real OSRM (`osrmIda`), usa la distancia real por carretera y aplica
 * un factor conservador de vehículo pesado/montaña (1.18x) sobre el tiempo teórico OSRM.
 */
export function estimarLogisticaMisionDesdeBase(
  destino: {
    lat?: number
    lng?: number
    lugar: string
    departamento?: string
    titulo?: string
    esEmergenciaGrave?: boolean
    tipoMision?: string
  },
  osrmIda?: { distanciaKm: number; duracionMinutos: number } | null
): EstimacionLogisticaMision {
  const coords =
    typeof destino.lat === 'number' &&
    typeof destino.lng === 'number' &&
    Number.isFinite(destino.lat) &&
    Number.isFinite(destino.lng)
      ? { lat: destino.lat, lng: destino.lng }
      : resolverCoordenadasLugar(destino.lugar, destino.departamento || 'Caldas')

  const texto = `${destino.titulo || ''} ${destino.lugar || ''}`.toLowerCase()
  const pareceVereda = /vereda|trocha|finca|camino|tablazo|caba[ñn]a|la linda|desquite|rosario/.test(texto)

  let kmIda: number
  let minutosIda: number
  let fuenteCalculo: 'gps_carretera' | 'estimado_cordillera' = 'estimado_cordillera'

  if (osrmIda && osrmIda.distanciaKm > 0 && osrmIda.duracionMinutos > 0) {
    kmIda = Number(osrmIda.distanciaKm.toFixed(1))
    // Factor de convoy/camión en carretera de montaña colombiana (~18% sobre auto ligero OSRM)
    minutosIda = Math.max(8, Math.round(osrmIda.duracionMinutos * 1.18))
    fuenteCalculo = 'gps_carretera'
  } else {
    const calc = calcularDistanciaRealDesdeBase(coords.lat, coords.lng, pareceVereda)
    kmIda = calc.distanciaKmIda
    minutosIda = calc.tiempoMinutosIda
  }

  const kmTotal = Number((kmIda * 2).toFixed(1))
  const minutosVuelta = minutosIda
  const minutosRodamientoTotal = minutosIda + minutosVuelta

  // Tiempo realista de trabajo / maniobra en el lugar según tipo de emergencia
  let minutosServicioEnSitio = 55
  if (/volcamiento|derrumbe|deslizamiento|barrizal|barro|atascad|atollam|rescate|suspendido/.test(texto)) {
    minutosServicioEnSitio = 75
  } else if (/[aá]rbol|despeje|acueducto|quebrada|inundaci|creciente/.test(texto)) {
    minutosServicioEnSitio = 65
  } else if (/m[eé]dic|traslado|insumos|trasteo|v[ií]veres|agua|escolar/.test(texto)) {
    minutosServicioEnSitio = 40
  }
  if (destino.esEmergenciaGrave) {
    minutosServicioEnSitio += 25
  }
  if (kmIda > 150) {
    // Apoyo en convoy de larga distancia incluye descarga, coordinación local y breve descanso
    minutosServicioEnSitio = Math.max(minutosServicioEnSitio, 90)
  }

  const minutosRalenti = Math.round(minutosServicioEnSitio * 0.5)
  const duracionTotalMinutos = Math.max(25, minutosRodamientoTotal + minutosServicioEnSitio)

  const categoriaDistancia: 'local' | 'regional' | 'nacional' =
    kmIda <= 40 ? 'local' : kmIda <= 150 ? 'regional' : 'nacional'

  return {
    distanciaKmIda: kmIda,
    distanciaKmTotalIdaYVuelta: kmTotal,
    minutosIda,
    minutosVuelta,
    minutosRodamientoTotal,
    minutosServicioEnSitio,
    minutosRalenti,
    duracionTotalMinutos,
    categoriaDistancia,
    fuenteCalculo,
  }
}

export function formatearDuracionCorta(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
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
