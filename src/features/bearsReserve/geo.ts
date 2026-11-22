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

function normalizarTextoGeo(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function coincidePalabraGeo(texto: string, clave: string): boolean {
  if (!texto || !clave) return false
  const escapada = clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escapada}([^a-z0-9]|$)`).test(texto)
}

interface EntradaGeo {
  claves: string[]
  punto: { lat: number; lng: number }
  soloSiCaldasOVacio?: boolean
  soloSiDepartamento?: string[]
  excluirSiDepartamento?: string[]
}

const MUNICIPIOS_CALDAS_GEO: EntradaGeo[] = [
  // Los 27 municipios reales de Caldas
  { claves: ['la dorada'], punto: { lat: 5.4536, lng: -74.6631 } },
  { claves: ['aguadas'], punto: { lat: 5.6111, lng: -75.4561 } },
  { claves: ['riosucio'], punto: { lat: 5.4214, lng: -75.7031 }, excluirSiDepartamento: ['choco'] },
  { claves: ['pensilvania'], punto: { lat: 5.3842, lng: -75.1614 } },
  { claves: ['samana'], punto: { lat: 5.4128, lng: -74.9922 } },
  { claves: ['manzanares'], punto: { lat: 5.2528, lng: -75.1553 } },
  { claves: ['anserma'], punto: { lat: 5.2381, lng: -75.785 } },
  { claves: ['supia'], punto: { lat: 5.4481, lng: -75.6494 } },
  { claves: ['marmato'], punto: { lat: 5.475, lng: -75.5989 } },
  { claves: ['viterbo'], punto: { lat: 5.0628, lng: -75.8717 } },
  { claves: ['pacora'], punto: { lat: 5.5272, lng: -75.4594 } },
  { claves: ['victoria'], punto: { lat: 5.3161, lng: -74.9125 }, soloSiCaldasOVacio: true },
  { claves: ['norcasia'], punto: { lat: 5.5742, lng: -74.8886 } },
  { claves: ['marquetalia'], punto: { lat: 5.2964, lng: -75.0531 } },
  { claves: ['marulanda'], punto: { lat: 5.2842, lng: -75.2606 } },
  { claves: ['filadelfia'], punto: { lat: 5.2961, lng: -75.5614 } },
  { claves: ['belalcazar'], punto: { lat: 4.9964, lng: -75.8131 } },
  { claves: ['palestina', 'santagueda'], punto: PUNTOS_REFERENCIA_CALDAS.palestina, excluirSiDepartamento: ['huila'] },
  { claves: ['arauca'], punto: PUNTOS_REFERENCIA_CALDAS.palestina, soloSiCaldasOVacio: true },
  { claves: ['risaralda'], punto: { lat: 5.1683, lng: -75.7647 }, soloSiDepartamento: ['caldas'] },
  { claves: ['san jose'], punto: { lat: 5.0806, lng: -75.7928 }, soloSiCaldasOVacio: true },
  { claves: ['aranzazu'], punto: { lat: 5.2719, lng: -75.4894 } },
  { claves: ['salamina'], punto: { lat: 5.4075, lng: -75.4878 } },
  { claves: ['la merced', 'merced'], punto: { lat: 5.4003, lng: -75.5469 }, soloSiCaldasOVacio: true },
  { claves: ['neira'], punto: PUNTOS_REFERENCIA_CALDAS.neira },
  { claves: ['chinchina'], punto: PUNTOS_REFERENCIA_CALDAS.chinchina },
  { claves: ['villamaria', 'gallinazo'], punto: PUNTOS_REFERENCIA_CALDAS.villamaria },
]

const VEREDAS_LOCALES_MANIZALES_GEO: EntradaGeo[] = [
  { claves: ['san peregrino', 'guadual'], punto: PUNTOS_REFERENCIA_CALDAS.san_peregrino, soloSiCaldasOVacio: true },
  { claves: ['la cabana', 'cabana', 'quiebra'], punto: PUNTOS_REFERENCIA_CALDAS.la_cabana, soloSiCaldasOVacio: true },
  { claves: ['la linda', 'morrogacho'], punto: PUNTOS_REFERENCIA_CALDAS.la_linda, soloSiCaldasOVacio: true },
  { claves: ['desquite'], punto: PUNTOS_REFERENCIA_CALDAS.el_desquite, soloSiCaldasOVacio: true },
  { claves: ['tablazo'], punto: PUNTOS_REFERENCIA_CALDAS.bajo_tablazo, soloSiCaldasOVacio: true },
  { claves: ['letras', 'mesones', 'padua'], punto: PUNTOS_REFERENCIA_CALDAS.letras_mesones },
  { claves: ['siria'], punto: PUNTOS_REFERENCIA_CALDAS.el_rosario, soloSiCaldasOVacio: true },
  { claves: ['el rosario', 'rosario'], punto: PUNTOS_REFERENCIA_CALDAS.el_rosario, soloSiCaldasOVacio: true },
  { claves: ['la trinidad', 'trinidad'], punto: PUNTOS_REFERENCIA_CALDAS.la_trinidad_escuela, soloSiCaldasOVacio: true },
  { claves: ['plaza de mercado', 'mercado', 'galeria'], punto: PUNTOS_REFERENCIA_CALDAS.plaza_mercado_manizales, soloSiCaldasOVacio: true },
  { claves: ['manizales', 'chipre'], punto: PUNTOS_REFERENCIA_CALDAS.colegios_manizales },
  { claves: ['centro'], punto: PUNTOS_REFERENCIA_CALDAS.colegios_manizales, soloSiCaldasOVacio: true },
]

const CIUDADES_Y_MUNICIPIOS_NACIONALES_GEO: EntradaGeo[] = [
  // Multi-palabra / desambiguados primero
  { claves: ['san juan de pasto', 'pasto', 'tumaco', 'ipiales'], punto: { lat: 1.2136, lng: -77.2811 } },
  { claves: ['santa rosa de cabal'], punto: PUNTOS_REFERENCIA_CALDAS.santa_rosa },
  { claves: ['santa rosa de osos'], punto: { lat: 6.6475, lng: -75.4603 } },
  { claves: ['santa rosa del sur'], punto: { lat: 7.9644, lng: -74.0544 } },
  { claves: ['riosucio choco', 'riosucio'], punto: { lat: 7.4406, lng: -77.1189 }, soloSiDepartamento: ['choco'] },
  { claves: ['riosucio choco'], punto: { lat: 7.4406, lng: -77.1189 } },
  { claves: ['rio san juan', 'san juan choco', 'medio san juan', 'litoral del san juan'], punto: { lat: 5.158, lng: -76.688 } },
  { claves: ['san jose del guaviare'], punto: { lat: 2.5729, lng: -72.6459 } },
  { claves: ['villa del rosario', 'cucuta', 'ocana', 'catatumbo'], punto: { lat: 7.8939, lng: -72.5078 } },
  { claves: ['santa rosa'], punto: PUNTOS_REFERENCIA_CALDAS.santa_rosa, soloSiDepartamento: ['risaralda', 'caldas', ''] },
  { claves: ['pereira', 'dosquebradas'], punto: PUNTOS_REFERENCIA_CALDAS.pereira },
  { claves: ['armenia', 'calarca', 'salento'], punto: { lat: 4.5339, lng: -75.6811 } },
  { claves: ['ibague'], punto: { lat: 4.4389, lng: -75.2322 } },
  { claves: ['fresno', 'mariquita', 'herveo'], punto: PUNTOS_REFERENCIA_CALDAS.fresno },
  { claves: ['bello', 'zamora'], punto: { lat: 6.3373, lng: -75.5579 }, soloSiDepartamento: ['antioquia', ''] },
  { claves: ['medellin', 'aburra', 'envigado', 'itagui', 'sabaneta'], punto: { lat: 6.2442, lng: -75.5812 } },
  { claves: ['uraba', 'apartado', 'turbo', 'dabeiba'], punto: { lat: 7.883, lng: -76.6259 } },
  { claves: ['cocorna', 'san luis'], punto: PUNTOS_REFERENCIA_CALDAS.cocorna },
  { claves: ['quibdo', 'istmina'], punto: { lat: 5.6947, lng: -76.6611 } },
  { claves: ['buenaventura', 'loboguerrero'], punto: { lat: 3.8801, lng: -77.0312 } },
  { claves: ['buga', 'tulua'], punto: { lat: 3.9009, lng: -76.2978 } },
  { claves: ['cali', 'palmira', 'jamundi'], punto: { lat: 3.4516, lng: -76.532 } },
  { claves: ['popayan', 'rosas', 'cajibio', 'panamericana'], punto: { lat: 2.4448, lng: -76.6147 } },
  { claves: ['monteria', 'lorica', 'mojana'], punto: { lat: 8.7479, lng: -75.8814 } },
  { claves: ['cartagena', 'magangue'], punto: { lat: 10.391, lng: -75.4794 } },
  { claves: ['barranquilla', 'soledad'], punto: { lat: 10.9685, lng: -74.7813 } },
  { claves: ['santa marta', 'cienaga', 'costa caribe'], punto: { lat: 11.2408, lng: -74.199 } },
  { claves: ['riohacha', 'uribia', 'maicao'], punto: { lat: 11.5444, lng: -72.9072 } },
  { claves: ['sincelejo', 'san marcos'], punto: { lat: 9.3047, lng: -75.3978 } },
  { claves: ['valledupar', 'aguachica'], punto: { lat: 10.4631, lng: -73.2532 } },
  { claves: ['bucaramanga', 'barrancabermeja', 'san gil'], punto: { lat: 7.1254, lng: -73.1198 } },
  { claves: ['villavicencio', 'via al llano', 'guayabetal'], punto: { lat: 4.142, lng: -73.6266 } },
  { claves: ['neiva', 'pitalito', 'garzon'], punto: { lat: 2.9273, lng: -75.2819 } },
  { claves: ['tunja', 'sogamoso', 'duitama'], punto: { lat: 5.5353, lng: -73.3678 } },
  { claves: ['bogota', 'soacha', 'girardot', 'villeta'], punto: { lat: 4.711, lng: -74.0721 } },
  { claves: ['mocoa', 'puerto asis'], punto: { lat: 1.1528, lng: -76.6521 } },
  { claves: ['florencia'], punto: { lat: 1.6144, lng: -75.6062 } },
  { claves: ['yopal'], punto: { lat: 5.3378, lng: -72.3959 } },
  { claves: ['leticia'], punto: { lat: -4.2153, lng: -69.9406 } },
  { claves: ['san andres'], punto: { lat: 12.5847, lng: -81.7006 } },
]

const DEPARTAMENTOS_COLOMBIA_GEO: Array<{ claves: string[]; punto: { lat: number; lng: number } }> = [
  { claves: ['valle del cauca'], punto: { lat: 3.4516, lng: -76.532 } },
  { claves: ['norte de santander'], punto: { lat: 7.8939, lng: -72.5078 } },
  { claves: ['la guajira', 'guajira'], punto: { lat: 11.5444, lng: -72.9072 } },
  { claves: ['risaralda'], punto: PUNTOS_REFERENCIA_CALDAS.pereira },
  { claves: ['quindio'], punto: { lat: 4.5339, lng: -75.6811 } },
  { claves: ['tolima'], punto: PUNTOS_REFERENCIA_CALDAS.fresno },
  { claves: ['antioquia'], punto: PUNTOS_REFERENCIA_CALDAS.cocorna },
  { claves: ['choco'], punto: { lat: 5.6947, lng: -76.6611 } },
  { claves: ['cauca'], punto: { lat: 2.4448, lng: -76.6147 } },
  { claves: ['narino'], punto: { lat: 1.2136, lng: -77.2811 } },
  { claves: ['cordoba'], punto: { lat: 8.7479, lng: -75.8814 } },
  { claves: ['bolivar'], punto: { lat: 10.391, lng: -75.4794 } },
  { claves: ['atlantico'], punto: { lat: 10.9685, lng: -74.7813 } },
  { claves: ['magdalena'], punto: { lat: 11.2408, lng: -74.199 } },
  { claves: ['sucre'], punto: { lat: 9.3047, lng: -75.3978 } },
  { claves: ['cesar'], punto: { lat: 10.4631, lng: -73.2532 } },
  { claves: ['santander'], punto: { lat: 7.1254, lng: -73.1198 } },
  { claves: ['meta'], punto: { lat: 4.142, lng: -73.6266 } },
  { claves: ['huila'], punto: { lat: 2.9273, lng: -75.2819 } },
  { claves: ['boyaca'], punto: { lat: 5.5353, lng: -73.3678 } },
  { claves: ['cundinamarca'], punto: { lat: 4.711, lng: -74.0721 } },
  { claves: ['putumayo'], punto: { lat: 1.1528, lng: -76.6521 } },
  { claves: ['caqueta'], punto: { lat: 1.6144, lng: -75.6062 } },
  { claves: ['casanare'], punto: { lat: 5.3378, lng: -72.3959 } },
  { claves: ['arauca'], punto: { lat: 7.0847, lng: -70.7591 } },
  { claves: ['amazonas'], punto: { lat: -4.2153, lng: -69.9406 } },
  { claves: ['guaviare'], punto: { lat: 2.5729, lng: -72.6459 } },
  { claves: ['caldas'], punto: PUNTOS_REFERENCIA_CALDAS.colegios_manizales },
]

function entradaHabilitadaParaDep(
  item: EntradaGeo,
  depNorm: string,
  esCaldasOVacio: boolean
): boolean {
  if (item.soloSiCaldasOVacio && !esCaldasOVacio) return false
  if (item.soloSiDepartamento) {
    const ok = item.soloSiDepartamento.some((d) => (d === '' ? depNorm === '' : depNorm.includes(d)))
    if (!ok) return false
  }
  if (item.excluirSiDepartamento) {
    const excluido = item.excluirSiDepartamento.some((d) => depNorm.includes(d))
    if (excluido) return false
  }
  return true
}

/**
 * Resuelve coordenadas aproximadas reales a partir del nombre de una vereda,
 * municipio o departamento mencionado en una llamada comunitaria o noticia.
 */
export function resolverCoordenadasLugar(
  lugar: string,
  departamento = 'Caldas'
): { lat: number; lng: number } {
  const lugarNorm = normalizarTextoGeo(lugar)
  const depNorm = normalizarTextoGeo(departamento)
  const esCaldasOVacio =
    !depNorm || depNorm.includes('caldas') || depNorm === 'otro' || coincidePalabraGeo(lugarNorm, 'manizales')

  // 1. Priorizar ciudades/municipios específicos nacionales y desambiguados en `lugar`
  for (const item of CIUDADES_Y_MUNICIPIOS_NACIONALES_GEO) {
    if (!entradaHabilitadaParaDep(item, depNorm, esCaldasOVacio)) continue
    if (item.claves.some((k) => coincidePalabraGeo(lugarNorm, k))) {
      return { lat: item.punto.lat, lng: item.punto.lng }
    }
  }

  // 2. Los 27 municipios reales de Caldas en `lugar`
  for (const item of MUNICIPIOS_CALDAS_GEO) {
    if (!entradaHabilitadaParaDep(item, depNorm, esCaldasOVacio)) continue
    if (item.claves.some((k) => coincidePalabraGeo(lugarNorm, k))) {
      return { lat: item.punto.lat, lng: item.punto.lng }
    }
  }

  // 3. Veredas y sectores locales de Manizales/Caldas (condicionados a Caldas o vacío)
  for (const item of VEREDAS_LOCALES_MANIZALES_GEO) {
    if (!entradaHabilitadaParaDep(item, depNorm, esCaldasOVacio)) continue
    if (item.claves.some((k) => coincidePalabraGeo(lugarNorm, k))) {
      return { lat: item.punto.lat, lng: item.punto.lng }
    }
  }

  // 4. Coincidencia explícita de departamento en `departamento` primero
  if (depNorm) {
    for (const item of DEPARTAMENTOS_COLOMBIA_GEO) {
      if (item.claves.some((k) => coincidePalabraGeo(depNorm, k))) {
        return { lat: item.punto.lat, lng: item.punto.lng }
      }
    }
  }

  // 5. Fallback: departamento mencionado explícitamente en `lugar` (evitando falsos positivos como "meta" suelta)
  for (const item of DEPARTAMENTOS_COLOMBIA_GEO) {
    if (item.claves.includes('meta')) {
      if (coincidePalabraGeo(lugarNorm, 'departamento del meta') || coincidePalabraGeo(lugarNorm, 'llanos del meta')) {
        return { lat: item.punto.lat, lng: item.punto.lng }
      }
      continue
    }
    if (item.claves.some((k) => coincidePalabraGeo(lugarNorm, k))) {
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
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0
  }
  const R = 6371 // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const aAcotado = Math.min(1, Math.max(0, a))
  const c = 2 * Math.atan2(Math.sqrt(aAcotado), Math.sqrt(1 - aAcotado))
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
 * Usa transición continua y estrictamente monótona por tramos (acceso local ≤25 km + carretera nacional >25 km)
 * reutilizando `factorSinuosidadMontaña` para eliminar saltos bruscos en 35 km.
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

  // Tramo 1 (0..25 km lineales): acceso veredal/regional desde la Cordillera Central
  // Tramo 2 (>25 km lineales): carretera nacional de montaña
  const tramoLocalLineal = Math.min(linealKm, 25)
  const tramoNacionalLineal = Math.max(0, linealKm - 25)

  const kmTramoLocal = tramoLocalLineal * factorSinuosidadMontaña(esTrocha)
  const kmTramoNacional = tramoNacionalLineal * factorSinuosidadMontaña(false)
  const kmCalculado = kmTramoLocal + kmTramoNacional
  const kmIda = Math.max(2, Number(kmCalculado.toFixed(1)))
  const kmTotal = Number((kmIda * 2).toFixed(1))

  // Velocidad promedio realista en Colombia para camioneta 4x4 / camión:
  // ~28 km/h en trocha veredal, ~38 km/h en vía regional, ~48 km/h en carretera nacional de montaña
  const velLocalKmH = esTrocha ? 28 : 38
  const velNacionalKmH = 48
  const horasIda =
    kmCalculado > 0 ? kmTramoLocal / velLocalKmH + kmTramoNacional / velNacionalKmH : kmIda / velLocalKmH
  const tiempoIda = kmIda > 0 ? Math.max(8, Math.round(horasIda * 60)) : 0
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

  const texto = normalizarTextoGeo(
    `${destino.titulo || ''} ${destino.lugar || ''} ${destino.tipoMision || ''}`
  )
  const pareceVereda =
    /vereda|trocha|finca|camino|tablazo|cabana|la linda|desquite|rosario|rural|rescate_barrizal|desvarado_rural/.test(
      texto
    )

  let kmIda: number
  let minutosIda: number
  let fuenteCalculo: 'gps_carretera' | 'estimado_cordillera' = 'estimado_cordillera'

  if (
    osrmIda &&
    Number.isFinite(osrmIda.distanciaKm) &&
    osrmIda.distanciaKm > 0 &&
    Number.isFinite(osrmIda.duracionMinutos) &&
    osrmIda.duracionMinutos > 0
  ) {
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
  if (
    /volcamiento|derrumbe|deslizamiento|barrizal|barro|atascad|atollam|rescate|suspendido/.test(texto)
  ) {
    minutosServicioEnSitio = 75
  } else if (
    /arbol|despeje|acueducto|quebrada|inundaci|creciente|desvar|varad|mecan|apoyo_vial/.test(texto)
  ) {
    minutosServicioEnSitio = 65
  } else if (
    /medic|traslado|insumos|trasteo|viveres|agua|escolar|transporte_humanitario/.test(texto)
  ) {
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
  if (!Number.isFinite(minutos)) return '0m'
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
