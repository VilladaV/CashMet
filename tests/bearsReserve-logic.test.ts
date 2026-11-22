import { describe, expect, it } from 'vitest'
import {
  CONSUMO_RALENTI_GALONES_POR_HORA,
  PARADAS_RUTA_MERCADO_CAMPESINO,
  calcularCombustibleRalenti,
  calcularDistanciaHaversineKm,
  calcularDistanciaRealDesdeBase,
  calcularDistanciaRutaParadas,
  escapeHtml,
  estimarLogisticaMisionDesdeBase,
  factorSinuosidadMontaña,
  formatearDuracionCorta,
  resolverCoordenadasLugar,
} from '@/features/bearsReserve/geo'
import {
  FACTOR_TERRENO_CONSUMO,
  calcularConsumoMision,
  esPrecioDesactualizado,
  obtenerPrecioGalon,
  obtenerPreciosCombustibleActuales,
} from '@/features/bearsReserve/preciosCombustible'
import {
  conductorDeRutaEnCuadrante,
  deduplicarEventosRadar,
  empleadosEnTurnoAhora,
  esEventoRedundante,
  esFechaNoticiaReciente,
  filtrarEventosRadarVigentes,
  generarTurnosSemanalesIA,
  investigarFichaVehiculoIA,
  responderGema,
  seleccionarTripulacionMision,
  seleccionarVehiculosOptimosMision,
} from '@/features/bearsReserve/gemaEngine'
import { RUTAS_HABITUALES_INICIALES } from '@/features/bearsReserve/repo'
import type { EmpleadoOperativo, EventoRadarLocal } from '@/features/bearsReserve/types'

function emp(id: string, nombre: string, cargo: string, extra?: Partial<EmpleadoOperativo>): EmpleadoOperativo {
  return {
    id,
    nombreCompleto: nombre,
    cargo,
    habilidades: cargo.toLowerCase().includes('conduc')
      ? ['Conducción en alta montaña']
      : cargo.toLowerCase().includes('mec')
        ? ['Mecánica de emergencia']
        : ['Logística comunitaria'],
    horasSemanalesAsignadas: 0,
    maxHorasSemanales: 42,
    activo: true,
    horariosNoDisponibles: [],
    enTurnoActivo: false,
    ...extra,
  }
}

describe("Bear's Reserve · geografía", () => {
  it('calcula una distancia Haversine conocida (Manizales - Bogotá ~ 150-180 km)', () => {
    const km = calcularDistanciaHaversineKm(5.07, -75.52, 4.71, -74.07)
    expect(km).toBeGreaterThan(140)
    expect(km).toBeLessThan(190)
  })

  it('aplica mayor sinuosidad a trocha que a pavimento', () => {
    expect(factorSinuosidadMontaña(true)).toBeGreaterThan(factorSinuosidadMontaña(false))
  })

  it('calcula ida y vuelta desde la base', () => {
    const r = calcularDistanciaRealDesdeBase(5.0934, -75.5562, true)
    expect(r.distanciaKmIda).toBeGreaterThan(0)
    expect(r.distanciaKmTotalIdaYVuelta).toBeCloseTo(r.distanciaKmIda * 2, 0)
    expect(r.tiempoMinutosRodamientoIdaYVuelta).toBeGreaterThan(0)
  })

  it('el ralentí no genera galones negativos', () => {
    expect(calcularCombustibleRalenti('carro', -30)).toBe(0)
    expect(calcularCombustibleRalenti('camion', 60)).toBe(CONSUMO_RALENTI_GALONES_POR_HORA.camion)
  })

  it('resuelve coordenadas reales de municipios y calcula distancia de paradas de mercado', () => {
    const neira = resolverCoordenadasLugar('Municipio de Neira', 'Caldas')
    expect(neira.lat).toBeCloseTo(5.1667, 2)
    const calc = calcularDistanciaRutaParadas(PARADAS_RUTA_MERCADO_CAMPESINO, true)
    expect(calc.distanciaKm).toBeGreaterThan(15)
    expect(calc.minutosRodamiento).toBeGreaterThan(15)
  })

  it('escapa HTML malicioso para popups de Leaflet', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })
})

describe("Bear's Reserve · combustible", () => {
  it('convierte distancia y terreno en galones y desgaste y respeta tipoCombustible real', () => {
    const r = calcularConsumoMision('carro', 100, 'trocha_extrema_barrizal', 25, 'diesel')
    const esperado = 100 / (25 / FACTOR_TERRENO_CONSUMO.trocha_extrema_barrizal)
    expect(r.galones).toBeCloseTo(esperado, 1)
    expect(r.desgasteLlantasPorc).toBeCloseTo(4.5, 2)
    expect(r.costoEstimadoCOP).toBe(Math.round(r.galones * obtenerPrecioGalon('diesel')))
  })

  it('no acepta distancias negativas', () => {
    const r = calcularConsumoMision('carro', -50, 'pavimento', 30)
    expect(r.galones).toBe(0)
    expect(r.costoEstimadoCOP).toBe(0)
    expect(r.desgasteLlantasPorc).toBe(0)
  })

  it('usa diésel, corriente y extra según el tipo', () => {
    const precios = obtenerPreciosCombustibleActuales()
    expect(obtenerPrecioGalon('diesel')).toBe(precios.dieselPorGalon)
    expect(obtenerPrecioGalon('corriente')).toBe(precios.corrientePorGalon)
    expect(obtenerPrecioGalon('extra')).toBe(precios.extraPorGalon)
  })

  it('nunca produce rendimiento efectivo menor a 3 km/gal', () => {
    const r = calcularConsumoMision('camion', 100, 'trocha_extrema_barrizal', 0.5)
    expect(r.galones).toBeLessThanOrEqual(100 / 3)
  })

  it('detecta cuándo un precio está vencido (>24h)', () => {
    const ahora = Date.now()
    expect(
      esPrecioDesactualizado(
        { ...obtenerPreciosCombustibleActuales(), consultadoEn: ahora - 25 * 3600_000, editadoManualmente: false },
        ahora
      )
    ).toBe(true)
    expect(
      esPrecioDesactualizado(
        { ...obtenerPreciosCombustibleActuales(), consultadoEn: ahora - 2 * 3600_000, editadoManualmente: false },
        ahora
      )
    ).toBe(false)
  })
})

describe("Bear's Reserve · motor de turnos, rutas escolares y tripulación", () => {
  it('vincula los IDs reales de rutas escolares y encuentra el conductor del cuadrante (sin caer en hueco)', () => {
    const emps = [
      emp('e1', 'Carlos', 'Conductor'),
      emp('e2', 'Marta', 'Conductora'),
      emp('e3', 'Luis', 'Mecánico'),
      emp('e4', 'Sofía', 'Editor Audiovisual'),
    ]
    const turnos = generarTurnosSemanalesIA(emps, '2026-11-16', RUTAS_HABITUALES_INICIALES, 0)

    const condManana = conductorDeRutaEnCuadrante(turnos, 'rut-escolar-manana', '2026-11-16', 'manana')
    const condTarde = conductorDeRutaEnCuadrante(turnos, 'rut-escolar-tarde', '2026-11-16', 'tarde')
    const condMercado = conductorDeRutaEnCuadrante(turnos, 'rut-mercado-campesino', '2026-11-21', 'mercado_sabado')

    expect(condManana).not.toBeNull()
    expect(condTarde).not.toBeNull()
    expect(condMercado).not.toBeNull()
    expect(condManana?.id).not.toBe('coord-user')

    // Todos los empleados activos (incluida Sofía con cargo Editor) reciben horas <= 42h
    for (const e of emps) {
      const h = turnos.filter((t) => t.empleadoId === e.id).reduce((s, t) => s + t.horas, 0)
      expect(h).toBeGreaterThan(0)
      expect(h).toBeLessThanOrEqual(42)
    }

    // Todos los IDs de turno son únicos
    const ids = new Set(turnos.map((t) => t.id))
    expect(ids.size).toBe(turnos.length)
  })

  it('rota realmente los turnos incluso con 3 empleados (múltiplo de 3)', () => {
    const emps = [emp('e1', 'Ana', 'Conductora'), emp('e2', 'Beto', 'Conductor'), emp('e3', 'Ciro', 'Mecánico')]
    const t0 = generarTurnosSemanalesIA(emps, '2026-11-16', RUTAS_HABITUALES_INICIALES, 0)
    const t1 = generarTurnosSemanalesIA(emps, '2026-11-16', RUTAS_HABITUALES_INICIALES, 1)
    expect(t0[0].empleadoId).not.toBe(t1[0].empleadoId)
  })

  it('empleadosEnTurnoAhora detecta correctamente a quien entró anoche durante la madrugada', () => {
    const emps = [emp('e1', 'LunesNoche', 'Conductor'), emp('e2', 'MartesNoche', 'Conductor')]
    const turnos = [
      {
        id: 't-lun',
        semanaISO: '2026-11-16',
        empleadoId: 'e1',
        empleadoNombre: 'LunesNoche',
        fecha: '2026-11-16',
        franja: 'noche' as const,
        horaInicio: '22:00',
        horaFin: '06:00',
        horas: 8,
        rolGuardia: 'Nocturno',
      },
      {
        id: 't-mar',
        semanaISO: '2026-11-16',
        empleadoId: 'e2',
        empleadoNombre: 'MartesNoche',
        fecha: '2026-11-17',
        franja: 'noche' as const,
        horaInicio: '22:00',
        horaFin: '06:00',
        horas: 8,
        rolGuardia: 'Nocturno',
      },
    ]

    const enMadrugadaMartes = empleadosEnTurnoAhora(turnos, emps, '2026-11-17', '02:30')
    expect(enMadrugadaMartes.map((e) => e.id)).toEqual(['e1'])
  })

  it('respeta restricciones de domingo (diaSemana = 0) en seleccionarTripulacionMision', () => {
    const bloqueadoDom = emp('e1', 'OcupadoDomingo', 'Conductor', {
      horariosNoDisponibles: [{ diaSemana: 0, horaInicio: '08:00', horaFin: '14:00', motivo: 'Familia' }],
    })
    const libreDom = emp('e2', 'LibreDomingo', 'Conductor')
    // 2026-11-22 es domingo
    const res = seleccionarTripulacionMision(
      { titulo: 'Auxilio rural', tipo: 'auxilio_comunitario' },
      [],
      [bloqueadoDom, libreDom],
      [],
      '2026-11-22',
      '10:00'
    )
    expect(res.tripulacion.map((t) => t.id)).toEqual(['e2'])
  })
})

describe("Bear's Reserve · catálogo técnico, radar con caducidad y Gema local", () => {
  it('no confunde BMW M2, BMW 130i ni Ford F-250 con camiones pesados', () => {
    const bmwM2 = investigarFichaVehiculoIA('BMW', 'M2', 'carro')
    expect(bmwM2.capacidadTanqueGalones).toBeLessThan(20)
    expect(bmwM2.fichaInvestigadaNota).not.toMatch(/Freightliner/i)

    const bmw130 = investigarFichaVehiculoIA('BMW', '130i', 'carro')
    expect(bmw130.fichaInvestigadaNota).not.toMatch(/ZIL/i)

    const fordF250 = investigarFichaVehiculoIA('Ford', 'F-250', 'carro')
    expect(fordF250.fichaInvestigadaNota).not.toMatch(/KrAZ/i)
    expect(fordF250.capacidadTanqueGalones).toBeLessThan(45)
  })

  it('filtra automáticamente eventos de radar caducados (>1–2 días)', () => {
    const ahora = Date.now()
    const eventos: EventoRadarLocal[] = [
      {
        id: 'viejo',
        titulo: 'Noticia de hace un mes',
        lugar: 'Caldas',
        departamento: 'Caldas',
        fuenteNoticia: 'Prensa',
        resumen: 'Vieja',
        fecha: '2026-10-01',
        creadoEn: ahora - 30 * 24 * 3600_000,
        expiraEn: ahora - 28 * 24 * 3600_000,
        esEmergenciaGrave: false,
        atencionOficialPresente: false,
        esNoticiaWebReal: true,
        recomendacionGema: 'monitorear_sin_intervenir',
        justificacionGema: 'Vieja',
      },
      {
        id: 'vigente',
        titulo: 'Alerta reciente',
        lugar: 'Manizales',
        departamento: 'Caldas',
        fuenteNoticia: 'Prensa',
        resumen: 'Reciente',
        fecha: '2026-11-21',
        creadoEn: ahora - 2 * 3600_000,
        expiraEn: ahora + 30 * 3600_000,
        esEmergenciaGrave: false,
        atencionOficialPresente: false,
        esNoticiaWebReal: true,
        recomendacionGema: 'apoyo_logistico',
        justificacionGema: 'Hoy',
      },
    ]

    const vigentes = filtrarEventosRadarVigentes(eventos, ahora)
    expect(vigentes.map((e) => e.id)).toEqual(['vigente'])
  })

  it('valida estrictamente fechaPublicacion de noticias web (rechaza noticias de >2 días o inválidas)', () => {
    expect(esFechaNoticiaReciente('2026-11-21', '2026-11-21', 2)).toBe(true)
    expect(esFechaNoticiaReciente('2026-11-20', '2026-11-21', 2)).toBe(true)
    expect(esFechaNoticiaReciente('2026-11-19', '2026-11-21', 2)).toBe(true)
    expect(esFechaNoticiaReciente('2026-11-18', '2026-11-21', 2)).toBe(false)
    expect(esFechaNoticiaReciente('2026-10-01', '2026-11-21', 2)).toBe(false)
    expect(esFechaNoticiaReciente('2026-02-31', '2026-03-01', 2)).toBe(false)
    expect(esFechaNoticiaReciente(undefined, '2026-11-21', 2)).toBe(false)
  })

  it('evita llamadas comunitarias repetidas en la misma vereda o con la misma temática', () => {
    const existentes: EventoRadarLocal[] = [
      {
        id: 'ev-1',
        titulo: 'Rescate de camión lechero atascado en barro',
        lugar: 'Vereda Bajo Tablazo · Manizales',
        departamento: 'Caldas',
        fuenteNoticia: 'Llamada comunitaria',
        resumen: 'Camión lechero atrapado en lodazal',
        fecha: '2026-11-21',
        esEmergenciaGrave: false,
        atencionOficialPresente: false,
        esNoticiaWebReal: false,
        recomendacionGema: 'intervenir_urgente',
        justificacionGema: 'Winche',
      },
    ]

    // Misma temática (camión lechero) en otra vereda -> redundante
    expect(
      esEventoRedundante(
        {
          titulo: 'Atollamiento de camión lechero en sector La Siria',
          lugar: 'Vereda El Rosario · Manizales',
          resumen: 'Camión recolector de leche varado',
          esNoticiaWebReal: false,
        },
        existentes
      )
    ).toBe(true)

    // Misma vereda (Bajo Tablazo) aunque sea otro tema -> redundante
    expect(
      esEventoRedundante(
        {
          titulo: 'Árbol caído en sendero veredal',
          lugar: 'Vereda Bajo Tablazo',
          resumen: 'Tronco bloquea camino peatonal',
          esNoticiaWebReal: false,
        },
        existentes
      )
    ).toBe(true)

    // Otra vereda y otro tema -> permitido
    expect(
      esEventoRedundante(
        {
          titulo: 'Árbol caído bloquea acueducto rural',
          lugar: 'Vereda San Peregrino · Manizales',
          resumen: 'Tronco rompió manguera de agua',
          esNoticiaWebReal: false,
        },
        existentes
      )
    ).toBe(false)
  })

  it('deduplica noticias web duplicadas (misma URL o mismo suceso) y ubica departamentos nacionales', () => {
    const choco = resolverCoordenadasLugar('Quibdó', 'Chocó')
    expect(choco.lat).toBeCloseTo(5.69, 1)
    const cordoba = resolverCoordenadasLugar('Montería', 'Córdoba')
    expect(cordoba.lat).toBeCloseTo(8.75, 1)

    const dup: EventoRadarLocal[] = [
      {
        id: 'w1',
        titulo: 'Inundaciones en Quibdó dejan 400 familias damnificadas tras creciente del Atrato',
        lugar: 'Quibdó',
        departamento: 'Chocó',
        fuenteNoticia: 'El Tiempo',
        urlFuente: 'https://ejemplo.co/noticia-1',
        resumen: 'Creciente del río Atrato',
        fecha: '2026-11-21',
        esEmergenciaGrave: true,
        atencionOficialPresente: true,
        esNoticiaWebReal: true,
        recomendacionGema: 'apoyo_logistico',
        justificacionGema: 'Envío de ayudas',
      },
      {
        id: 'w2',
        titulo: 'Inundaciones en Quibdó dejan 400 familias damnificadas tras creciente del Atrato',
        lugar: 'Quibdó',
        departamento: 'Chocó',
        fuenteNoticia: 'El Tiempo',
        urlFuente: 'https://ejemplo.co/noticia-1',
        resumen: 'Creciente del río Atrato',
        fecha: '2026-11-21',
        esEmergenciaGrave: true,
        atencionOficialPresente: true,
        esNoticiaWebReal: true,
        recomendacionGema: 'apoyo_logistico',
        justificacionGema: 'Envío de ayudas',
      },
    ]
    expect(deduplicarEventosRadar(dup)).toHaveLength(1)
  })

  it('los chips de Gema rotan turnos y consultan alertas viales correctamente', () => {
    const ctx = {
      empleados: [emp('e1', 'Andrés', 'Conductor')],
      vehiculos: [],
      turnos: [],
      misiones: [],
      eventosRadar: [
        {
          id: 'ev1',
          titulo: 'Paso restringido vía Letras',
          lugar: 'Mesones',
          departamento: 'Caldas',
          fuenteNoticia: 'Invías',
          resumen: 'Paso a un carril',
          fecha: '2026-11-21',
          creadoEn: Date.now(),
          expiraEn: Date.now() + 24 * 3600_000,
          esEmergenciaGrave: true,
          atencionOficialPresente: true,
          esNoticiaWebReal: true,
          recomendacionGema: 'apoyo_logistico' as const,
          justificacionGema: 'Apoyo',
        },
      ],
    }

    const rRotar = responderGema('Rotar turnos semanales (máx 42h) 💎', ctx)
    expect(rRotar.accion?.tipo).toBe('rotar_turnos')

    const rAlertas = responderGema('¿Hay alertas viales en Caldas? 🚨', ctx)
    expect(rAlertas.respuesta).toContain('Paso restringido vía Letras')
  })

  it('calcula distancia ida/vuelta y desglose ida + servicio + vuelta realista (local vs nacional y con GPS OSRM)', () => {
    const local = estimarLogisticaMisionDesdeBase({
      lugar: 'Vereda La Cabaña · Manizales',
      departamento: 'Caldas',
      titulo: 'Despeje de árbol caído',
    })
    expect(local.categoriaDistancia).toBe('local')
    expect(local.distanciaKmIda).toBeGreaterThan(2)
    expect(local.distanciaKmIda).toBeLessThan(25)
    expect(local.distanciaKmTotalIdaYVuelta).toBeCloseTo(local.distanciaKmIda * 2, 1)
    expect(local.duracionTotalMinutos).toBe(local.minutosRodamientoTotal + local.minutosServicioEnSitio)

    const medellinOsrm = estimarLogisticaMisionDesdeBase(
      {
        lugar: 'Medellín',
        departamento: 'Antioquia',
        titulo: 'Tormenta eléctrica y alerta roja por quebradas',
        esEmergenciaGrave: true,
      },
      { distanciaKm: 203.9, duracionMinutos: 214 }
    )
    expect(medellinOsrm.fuenteCalculo).toBe('gps_carretera')
    expect(medellinOsrm.categoriaDistancia).toBe('nacional')
    expect(medellinOsrm.distanciaKmIda).toBe(203.9)
    expect(medellinOsrm.distanciaKmTotalIdaYVuelta).toBe(407.8)
    expect(medellinOsrm.minutosRodamientoTotal).toBe(medellinOsrm.minutosIda * 2)
    expect(medellinOsrm.duracionTotalMinutos).toBe(
      medellinOsrm.minutosRodamientoTotal + medellinOsrm.minutosServicioEnSitio
    )

    expect(formatearDuracionCorta(45)).toBe('45 min')
    expect(formatearDuracionCorta(120)).toBe('2h')
    expect(formatearDuracionCorta(155)).toBe('2h 35m')

    // Valle del Cauca / Buenaventura no debe colisionar con "cauca" (Popayán)
    const buenaventura = estimarLogisticaMisionDesdeBase({
      lugar: 'Sector Los Tubos, vía Buenaventura-Loboguerrero',
      departamento: 'Valle del Cauca',
      titulo: 'Volcamiento bloquea vía a Buenaventura',
    })
    expect(buenaventura.distanciaKmIda).toBeGreaterThan(250)
    expect(buenaventura.distanciaKmIda).toBeLessThan(340)
  })

  it('elige vehículo cómodo de pasajeros para traslados médicos, arma convoy en emergencias graves y nunca toma vehículos no habilitados', () => {
    const baseVeh = {
      disponibleEnCashmet: true,
      estado: 'disponible' as const,
      tipoCombustible: 'diesel' as const,
      capacidadTanqueGalones: 20,
      nivelCombustiblePorc: 85,
      consumoKmPorGalon: 20,
      kilometrajeActual: 50000,
      desgasteLlantasPorc: 15,
      estadoBateriaPorc: 95,
      totalGalonesConsumidos: 0,
      totalCostoCombustibleCOP: 0,
    }

    const flota = [
      { ...baseVeh, id: 'v-cam', vehiculoId: 'v-cam', marca: 'GAZ', linea: '3302 GAZelle', tipo: 'camion' as const, disponibleParaTrabajo: true, nivelCombustiblePorc: 95 },
      { ...baseVeh, id: 'v-suv', vehiculoId: 'v-suv', marca: 'Toyota', linea: 'Land Cruiser Prado', tipo: 'carro' as const, disponibleParaTrabajo: true, nivelCombustiblePorc: 80 },
      { ...baseVeh, id: 'v-off', vehiculoId: 'v-off', marca: 'BMW', linea: 'M2', tipo: 'carro' as const, disponibleParaTrabajo: false, nivelCombustiblePorc: 100 },
    ]

    // Traslado médico de adulto mayor -> elige Toyota Land Cruiser Prado (NO el camión GAZelle)
    const medico = seleccionarVehiculosOptimosMision(
      { titulo: 'Traslado de adulto mayor a cita médica', tipo: 'transporte_humanitario', impactoSocial: 'Paciente requiere traslado al hospital' },
      flota
    )
    expect(medico.vehiculosElegidos.map((v) => v.id)).toEqual(['v-suv'])

    // Emergencia grave (volcamiento de tractomula) -> arma convoy de 2 vehículos complementarios (y nunca usa el BMW no habilitado)
    const grave = seleccionarVehiculosOptimosMision(
      { titulo: 'Volcamiento de tractomula bloquea vía', tipo: 'rescate_barrizal', esEmergenciaGrave: true, impactoSocial: 'Rescate pesado y apoyo' },
      flota,
      2
    )
    expect(grave.vehiculosElegidos).toHaveLength(2)
    expect(grave.vehiculosElegidos.some((v) => v.id === 'v-off')).toBe(false)

    // Si ninguno está habilitado -> no toma vehículos personales de CashMet
    const sinHab = seleccionarVehiculosOptimosMision(
      { titulo: 'Auxilio rural', tipo: 'auxilio_comunitario' },
      [{ ...flota[2] }]
    )
    expect(sinHab.vehiculosElegidos).toHaveLength(0)
  })
})
