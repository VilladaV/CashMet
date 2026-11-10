export interface TarifaVehiculo {
  id: string
  categoria: string
  subcategoria: string
  descripcion: string
  valor: number
  tipoVehiculo: 'moto' | 'carro' | 'camion' | 'otro'
  cilindrajeMin?: number
  cilindrajeMax?: number
  antiguedadMin?: number
  antiguedadMax?: number
}

/**
 * Tarifas Oficiales SOAT Colombia (Superfinanciera de Colombia 2025/2026).
 * Incluyen contribución ADRES (52%) y tasa RUNT. Valores redondeados a cientos.
 */
export const TARIFAS_SOAT_COLOMBIA: TarifaVehiculo[] = [
  // --- MOTOS / CICLOMOTORES ---
  {
    id: 'soat-ciclomotor',
    categoria: 'Motos',
    subcategoria: 'Ciclomotor',
    descripcion: 'Ciclomotores y tricimotos eléctricas/gasolina',
    valor: 124100,
    tipoVehiculo: 'moto',
    cilindrajeMax: 50,
  },
  {
    id: 'soat-moto-menos-100',
    categoria: 'Motos',
    subcategoria: '< 100 c.c.',
    descripcion: 'Motocicletas de menos de 100 c.c.',
    valor: 256200,
    tipoVehiculo: 'moto',
    cilindrajeMax: 99,
  },
  {
    id: 'soat-moto-100-200',
    categoria: 'Motos',
    subcategoria: '100 a 200 c.c.',
    descripcion: 'Motocicletas de 100 c.c. hasta 200 c.c.',
    valor: 343300,
    tipoVehiculo: 'moto',
    cilindrajeMin: 100,
    cilindrajeMax: 200,
  },
  {
    id: 'soat-moto-mas-200',
    categoria: 'Motos',
    subcategoria: '> 200 c.c.',
    descripcion: 'Motocicletas de más de 200 c.c.',
    valor: 761400,
    tipoVehiculo: 'moto',
    cilindrajeMin: 201,
  },
  {
    id: 'soat-motocarro',
    categoria: 'Motos',
    subcategoria: 'Motocarro / Cuadriciclo',
    descripcion: 'Motocarros, tricimotos y cuadriciclos de 3 o 4 ruedas',
    valor: 386900,
    tipoVehiculo: 'moto',
  },

  // --- AUTOS FAMILIARES (PARTICULARES) ---
  {
    id: 'soat-familiar-1500-nuevo',
    categoria: 'Autos Familiares',
    subcategoria: '< 1.500 c.c. (0 a 9 años)',
    descripcion: 'Automóvil familiar < 1.500 c.c. modelos recientes (0-9 años)',
    valor: 447300,
    tipoVehiculo: 'carro',
    cilindrajeMax: 1499,
    antiguedadMax: 9,
  },
  {
    id: 'soat-familiar-1500-antiguo',
    categoria: 'Autos Familiares',
    subcategoria: '< 1.500 c.c. (10+ años)',
    descripcion: 'Automóvil familiar < 1.500 c.c. modelos de 10 o más años',
    valor: 592900,
    tipoVehiculo: 'carro',
    cilindrajeMax: 1499,
    antiguedadMin: 10,
  },
  {
    id: 'soat-familiar-1500-2500-nuevo',
    categoria: 'Autos Familiares',
    subcategoria: '1.500 a 2.500 c.c. (0 a 9 años)',
    descripcion: 'Automóvil familiar 1.500 a 2.500 c.c. (0-9 años)',
    valor: 544700,
    tipoVehiculo: 'carro',
    cilindrajeMin: 1500,
    cilindrajeMax: 2500,
    antiguedadMax: 9,
  },
  {
    id: 'soat-familiar-1500-2500-antiguo',
    categoria: 'Autos Familiares',
    subcategoria: '1.500 a 2.500 c.c. (10+ años)',
    descripcion: 'Automóvil familiar 1.500 a 2.500 c.c. (10 o más años)',
    valor: 677400,
    tipoVehiculo: 'carro',
    cilindrajeMin: 1500,
    cilindrajeMax: 2500,
    antiguedadMin: 10,
  },
  {
    id: 'soat-familiar-2500-nuevo',
    categoria: 'Autos Familiares',
    subcategoria: '> 2.500 c.c. (0 a 9 años)',
    descripcion: 'Automóvil familiar > 2.500 c.c. (0-9 años)',
    valor: 636000,
    tipoVehiculo: 'carro',
    cilindrajeMin: 2501,
    antiguedadMax: 9,
  },
  {
    id: 'soat-familiar-2500-antiguo',
    categoria: 'Autos Familiares',
    subcategoria: '> 2.500 c.c. (10+ años)',
    descripcion: 'Automóvil familiar > 2.500 c.c. (10 o más años)',
    valor: 754300,
    tipoVehiculo: 'carro',
    cilindrajeMin: 2501,
    antiguedadMin: 10,
  },

  // --- CAMPEROS Y CAMIONETAS ---
  {
    id: 'soat-campero-1500-nuevo',
    categoria: 'Camperos y Camionetas',
    subcategoria: '< 1.500 c.c. (0 a 9 años)',
    descripcion: 'Campero o camioneta < 1.500 c.c. (0-9 años)',
    valor: 792800,
    tipoVehiculo: 'carro',
    cilindrajeMax: 1499,
    antiguedadMax: 9,
  },
  {
    id: 'soat-campero-1500-antiguo',
    categoria: 'Camperos y Camionetas',
    subcategoria: '< 1.500 c.c. (10+ años)',
    descripcion: 'Campero o camioneta < 1.500 c.c. (10 o más años)',
    valor: 953000,
    tipoVehiculo: 'carro',
    cilindrajeMax: 1499,
    antiguedadMin: 10,
  },
  {
    id: 'soat-campero-1500-2500-nuevo',
    categoria: 'Camperos y Camionetas',
    subcategoria: '1.500 a 2.500 c.c. (0 a 9 años)',
    descripcion: 'Campero o camioneta 1.500 a 2.500 c.c. (0-9 años)',
    valor: 946600,
    tipoVehiculo: 'carro',
    cilindrajeMin: 1500,
    cilindrajeMax: 2500,
    antiguedadMax: 9,
  },
  {
    id: 'soat-campero-1500-2500-antiguo',
    categoria: 'Camperos y Camionetas',
    subcategoria: '1.500 a 2.500 c.c. (10+ años)',
    descripcion: 'Campero o camioneta 1.500 a 2.500 c.c. (10 o más años)',
    valor: 1121400,
    tipoVehiculo: 'carro',
    cilindrajeMin: 1500,
    cilindrajeMax: 2500,
    antiguedadMin: 10,
  },
  {
    id: 'soat-campero-2500-nuevo',
    categoria: 'Camperos y Camionetas',
    subcategoria: '> 2.500 c.c. (0 a 9 años)',
    descripcion: 'Campero o camioneta > 2.500 c.c. (0-9 años)',
    valor: 1110300,
    tipoVehiculo: 'carro',
    cilindrajeMin: 2501,
    antiguedadMax: 9,
  },
  {
    id: 'soat-campero-2500-antiguo',
    categoria: 'Camperos y Camionetas',
    subcategoria: '> 2.500 c.c. (10+ años)',
    descripcion: 'Campero o camioneta > 2.500 c.c. (10 o más años)',
    valor: 1274000,
    tipoVehiculo: 'carro',
    cilindrajeMin: 2501,
    antiguedadMin: 10,
  },

  // --- TAXIS Y SERVICIO PÚBLICO / NEGOCIO ---
  {
    id: 'soat-taxi-1500-nuevo',
    categoria: 'Taxis y Negocio',
    subcategoria: '< 1.500 c.c. (0 a 9 años)',
    descripcion: 'Taxis y autos de negocio < 1.500 c.c. (0-9 años)',
    valor: 281900,
    tipoVehiculo: 'carro',
    cilindrajeMax: 1499,
    antiguedadMax: 9,
  },
  {
    id: 'soat-taxi-1500-antiguo',
    categoria: 'Taxis y Negocio',
    subcategoria: '< 1.500 c.c. (10+ años)',
    descripcion: 'Taxis y autos de negocio < 1.500 c.c. (10+ años)',
    valor: 352000,
    tipoVehiculo: 'carro',
    cilindrajeMax: 1499,
    antiguedadMin: 10,
  },
  {
    id: 'soat-taxi-1500-2500-nuevo',
    categoria: 'Taxis y Negocio',
    subcategoria: '1.500 a 2.500 c.c. (0 a 9 años)',
    descripcion: 'Taxis y autos de negocio 1.500 a 2.500 c.c. (0-9 años)',
    valor: 350000,
    tipoVehiculo: 'carro',
    cilindrajeMin: 1500,
    cilindrajeMax: 2500,
    antiguedadMax: 9,
  },
  {
    id: 'soat-taxi-1500-2500-antiguo',
    categoria: 'Taxis y Negocio',
    subcategoria: '1.500 a 2.500 c.c. (10+ años)',
    descripcion: 'Taxis y autos de negocio 1.500 a 2.500 c.c. (10+ años)',
    valor: 432400,
    tipoVehiculo: 'carro',
    cilindrajeMin: 1500,
    cilindrajeMax: 2500,
    antiguedadMin: 10,
  },
  {
    id: 'soat-taxi-2500-nuevo',
    categoria: 'Taxis y Negocio',
    subcategoria: '> 2.500 c.c. (0 a 9 años)',
    descripcion: 'Taxis y autos de negocio > 2.500 c.c. (0-9 años)',
    valor: 451400,
    tipoVehiculo: 'carro',
    cilindrajeMin: 2501,
    antiguedadMax: 9,
  },
  {
    id: 'soat-taxi-2500-antiguo',
    categoria: 'Taxis y Negocio',
    subcategoria: '> 2.500 c.c. (10+ años)',
    descripcion: 'Taxis y autos de negocio > 2.500 c.c. (10+ años)',
    valor: 529300,
    tipoVehiculo: 'carro',
    cilindrajeMin: 2501,
    antiguedadMin: 10,
  },

  // --- CARGA Y PESADOS ---
  {
    id: 'soat-carga-menos-5ton',
    categoria: 'Carga o Mixtos',
    subcategoria: 'Menos de 5 Toneladas',
    descripcion: 'Vehículo de carga o mixto < 5 toneladas',
    valor: 884700,
    tipoVehiculo: 'camion',
  },
  {
    id: 'soat-carga-5-15ton',
    categoria: 'Carga o Mixtos',
    subcategoria: '5 a 15 Toneladas',
    descripcion: 'Vehículo de carga de 5 a 15 toneladas',
    valor: 1277600,
    tipoVehiculo: 'camion',
  },
  {
    id: 'soat-carga-mas-15ton',
    categoria: 'Carga o Mixtos',
    subcategoria: 'Más de 15 Toneladas',
    descripcion: 'Vehículo de carga pesada > 15 toneladas',
    valor: 1615500,
    tipoVehiculo: 'camion',
  },
]

/**
 * Tarifas Oficiales Revisión Técnico-Mecánica y Emisiones Contaminantes (RTM - CDA Colombia).
 * Reguladas por MinTransporte / Supertransporte / RUNT / SICOV / ANSV con IVA incluido.
 */
export const TARIFAS_TM_COLOMBIA: TarifaVehiculo[] = [
  // --- MOTOCICLETAS ---
  {
    id: 'tm-moto-reciente',
    categoria: 'Motocicletas',
    subcategoria: 'Modelos recientes (2024–2026)',
    descripcion: 'Motos modelos 2024 al presente',
    valor: 233100,
    tipoVehiculo: 'moto',
    antiguedadMax: 2,
  },
  {
    id: 'tm-moto-intermedia',
    categoria: 'Motocicletas',
    subcategoria: 'Modelos intermedios (2010–2023)',
    descripcion: 'Motos modelos 2010 a 2023',
    valor: 233700,
    tipoVehiculo: 'moto',
    antiguedadMin: 3,
    antiguedadMax: 16,
  },
  {
    id: 'tm-moto-antigua',
    categoria: 'Motocicletas',
    subcategoria: 'Modelos antiguos (2009 o anterior)',
    descripcion: 'Motos modelos 2009 o anteriores',
    valor: 233400,
    tipoVehiculo: 'moto',
    antiguedadMin: 17,
  },
  {
    id: 'tm-moto-base',
    categoria: 'Motocicletas',
    subcategoria: 'Tarifa base promedio CDA',
    descripcion: 'Motos tarifa promedio base nacional',
    valor: 218000,
    tipoVehiculo: 'moto',
  },

  // --- VEHÍCULOS LIVIANOS PARTICULARES (Autos, camperos, camionetas) ---
  {
    id: 'tm-liviano-reciente',
    categoria: 'Livianos Particulares',
    subcategoria: 'Modelos recientes (2022–2026)',
    descripcion: 'Carros particulares modelos 2022 al presente',
    valor: 357200,
    tipoVehiculo: 'carro',
    antiguedadMax: 4,
  },
  {
    id: 'tm-liviano-intermedio',
    categoria: 'Livianos Particulares',
    subcategoria: 'Modelos intermedios (2010–2021)',
    descripcion: 'Carros particulares modelos 2010 a 2021',
    valor: 357900,
    tipoVehiculo: 'carro',
    antiguedadMin: 5,
    antiguedadMax: 16,
  },
  {
    id: 'tm-liviano-antiguo',
    categoria: 'Livianos Particulares',
    subcategoria: 'Modelos antiguos (2009 o anterior)',
    descripcion: 'Carros particulares modelos 2009 o anteriores',
    valor: 357500,
    tipoVehiculo: 'carro',
    antiguedadMin: 17,
  },
  {
    id: 'tm-liviano-electrico',
    categoria: 'Livianos Particulares',
    subcategoria: 'Eléctricos particulares',
    descripcion: 'Vehículo liviano 100% eléctrico particular',
    valor: 258400,
    tipoVehiculo: 'carro',
  },

  // --- LIVIANOS PÚBLICOS (Taxis, servicio especial) ---
  {
    id: 'tm-publico-liviano',
    categoria: 'Livianos Servicio Público',
    subcategoria: 'Taxis y servicio especial',
    descripcion: 'Taxis, camperos y microbuses de servicio público',
    valor: 356500,
    tipoVehiculo: 'carro',
  },

  // --- PESADOS (Camiones, volquetas, buses) ---
  {
    id: 'tm-pesado-particular',
    categoria: 'Vehículos Pesados',
    subcategoria: 'Pesado particular (Carga/Volqueta)',
    descripcion: 'Camiones y vehículos pesados de servicio particular',
    valor: 510300,
    tipoVehiculo: 'camion',
  },
  {
    id: 'tm-pesado-publico',
    categoria: 'Vehículos Pesados',
    subcategoria: 'Pesado público (Bus/Carga)',
    descripcion: 'Buses, busetas y camiones de servicio público',
    valor: 509800,
    tipoVehiculo: 'camion',
  },
]

/**
 * Sugerir la mejor tarifa aproximada según los datos disponibles del vehículo.
 */
export function sugerirTarifaSoat(
  tipo: string = 'carro',
  cilindraje?: number | null,
  modelo?: number | null
): TarifaVehiculo | undefined {
  const anioActual = new Date().getFullYear()
  const antiguedad = modelo ? Math.max(0, anioActual - modelo) : undefined

  const tipoNormalizado =
    tipo === 'moto' ? 'moto' : tipo === 'camion' ? 'camion' : 'carro'

  const candidatos = TARIFAS_SOAT_COLOMBIA.filter((t) => t.tipoVehiculo === tipoNormalizado)

  if (tipoNormalizado === 'moto') {
    if (!cilindraje) return candidatos.find((c) => c.id === 'soat-moto-100-200') ?? candidatos[0]
    if (cilindraje < 100) return candidatos.find((c) => c.id === 'soat-moto-menos-100')
    if (cilindraje <= 200) return candidatos.find((c) => c.id === 'soat-moto-100-200')
    return candidatos.find((c) => c.id === 'soat-moto-mas-200')
  }

  if (tipoNormalizado === 'carro') {
    const esAntiguo = antiguedad != null ? antiguedad >= 10 : false
    if (!cilindraje || cilindraje < 1500) {
      return candidatos.find((c) =>
        esAntiguo ? c.id === 'soat-familiar-1500-antiguo' : c.id === 'soat-familiar-1500-nuevo'
      )
    }
    if (cilindraje <= 2500) {
      return candidatos.find((c) =>
        esAntiguo ? c.id === 'soat-familiar-1500-2500-antiguo' : c.id === 'soat-familiar-1500-2500-nuevo'
      )
    }
    return candidatos.find((c) =>
      esAntiguo ? c.id === 'soat-familiar-2500-antiguo' : c.id === 'soat-familiar-2500-nuevo'
    )
  }

  return candidatos[0]
}

export function sugerirTarifaTM(
  tipo: string = 'carro',
  modelo?: number | null
): TarifaVehiculo | undefined {
  const anioActual = new Date().getFullYear()
  const antiguedad = modelo ? Math.max(0, anioActual - modelo) : undefined

  const tipoNormalizado =
    tipo === 'moto' ? 'moto' : tipo === 'camion' ? 'camion' : 'carro'

  const candidatos = TARIFAS_TM_COLOMBIA.filter((t) => t.tipoVehiculo === tipoNormalizado)

  if (antiguedad != null) {
    const match = candidatos.find((c) => {
      const minOk = c.antiguedadMin == null || antiguedad >= c.antiguedadMin
      const maxOk = c.antiguedadMax == null || antiguedad <= c.antiguedadMax
      return minOk && maxOk
    })
    if (match) return match
  }

  return candidatos[0]
}
