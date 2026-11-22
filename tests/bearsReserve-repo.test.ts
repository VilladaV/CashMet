import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: { fake: true } }))
vi.mock('firebase/firestore', async () => await import('./helpers/fakeFirestore'))
vi.mock('@/ai/gemini', () => ({
  geminiDisponible: false,
  googleSearchBloqueadoEnSesion: () => true,
  limpiarJson: (s: string) => s,
  llamarGemini: vi.fn().mockResolvedValue({ res: null, cuotaAgotada: false }),
  llamarGeminiConBusqueda: vi.fn().mockResolvedValue({
    res: null,
    cuotaAgotada: false,
    usoBusqueda: false,
    errorBusqueda: 'offline test',
  }),
  investigarVehiculoConGeminiAI: vi.fn().mockResolvedValue(null),
}))

import {
  __resetCacheBearsParaTests,
  cancelarMisionProgramada,
  crearMisionOperativa,
  guardarEventosRadar,
  guardarExtraEmpleado,
  guardarExtraVehiculo,
  hidratarEstadoBears,
  leerEventosRadar,
  liquidarTarjetaEnCashmet,
  listarEmpleadosBears,
  listarMisiones,
  listarVehiculosBears,
  saldoPendienteTarjeta,
  tanquearVehiculoCompleto,
  verificarYCompletarMisionesVencidas,
} from '@/features/bearsReserve/repo'
import { exportarBackup } from '@/lib/firebase/backup'
import { __all, __failNextGetDoc, __get, __reset, __seed } from './helpers/fakeFirestore'

beforeEach(() => {
  __reset()
  __resetCacheBearsParaTests()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline test')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Bear's Reserve · persistencia Firestore, liquidación y auto-cierre", () => {
  it('persiste estado en Firestore (configuracion_sistema) e ingresa automáticamente al backup', async () => {
    __seed('nomina', 'n1', {
      nombreCompleto: 'Camila Editor',
      cargo: 'Editor Audiovisual',
      activo: true,
      tipoContrato: 'indefinido',
      salarioBaseMensual: 2000000,
    })

    // No se excluye por código aunque su cargo sea Editor
    const emps1 = await listarEmpleadosBears()
    expect(emps1.find((e) => e.id === 'n1')?.activo).toBe(true)

    // El usuario la desactiva explícitamente y se guarda en Firestore
    await guardarExtraEmpleado('n1', { activo: false })

    // Limpiamos la caché en memoria para verificar que realmente viene de Firestore
    __resetCacheBearsParaTests()
    const emps2 = await listarEmpleadosBears()
    expect(emps2.find((e) => e.id === 'n1')?.activo).toBe(false)

    // El backup de CashMet incluye los documentos de Bear's Reserve
    const { contenido } = await exportarBackup()
    const parsed = JSON.parse(contenido)
    const idsConfig = (parsed.copia.configuracion_sistema as Array<{ id: string }>).map((d) => d.id)
    expect(idsConfig).toContain('bears_reserve_config')
  })

  it('permite liquidar múltiples veces en el mismo mes cuando hay nuevos tanqueos', async () => {
    __seed('cuentas_banco', 'cta-1', { nombre: 'Bancolombia', tipo: 'ahorros', saldoActual: 5000000, activa: true })
    __seed('vehiculos', 'v1', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      activo: true,
      estado: 'Disponible',
      mantenimiento: { kilometrajeActual: 50000, tareas: [] },
    })

    await guardarExtraVehiculo('v1', {
      disponibleParaTrabajo: true,
      nivelCombustiblePorc: 50,
      capacidadTanqueGalones: 20,
      tipoCombustible: 'diesel',
    })

    // 1er tanqueo (10 gal diésel) y 1ra liquidación
    const tq1 = await tanquearVehiculoCompleto('v1', 'manual')
    expect(tq1.tanqueo.galones).toBe(10)
    const monto1 = tq1.tanqueo.totalCOP

    const liq1 = await liquidarTarjetaEnCashmet('cta-1')
    expect(saldoPendienteTarjeta(liq1)).toBe(0)
    expect(__get('cuentas_banco', 'cta-1')?.saldoActual).toBe(5000000 - monto1)

    // 2do tanqueo en el mismo mes (5 gal) → vuelve a tener saldo pendiente liquidable
    await guardarExtraVehiculo('v1', { nivelCombustiblePorc: 75 })
    const tq2 = await tanquearVehiculoCompleto('v1', 'manual')
    expect(saldoPendienteTarjeta(tq2.tarjeta)).toBe(tq2.tanqueo.totalCOP)

    const liq2 = await liquidarTarjetaEnCashmet('cta-1')
    expect(saldoPendienteTarjeta(liq2)).toBe(0)
    expect(liq2.liquidaciones).toHaveLength(2)
    expect(__get('cuentas_banco', 'cta-1')?.saldoActual).toBe(5000000 - monto1 - tq2.tanqueo.totalCOP)
  })

  it('finaliza automáticamente misiones vencidas, actualiza odómetro en Firestore y evita doble conteo de galones', async () => {
    __seed('vehiculos', 'v1', {
      marca: 'Toyota',
      linea: 'Land Cruiser',
      tipo: 'carro',
      activo: true,
      estado: 'Disponible',
      notas: '4x4 con winche',
      mantenimiento: { kilometrajeActual: 100000, tareas: [] },
    })

    await guardarExtraVehiculo('v1', {
      disponibleParaTrabajo: true,
      nivelCombustiblePorc: 20,
      capacidadTanqueGalones: 20,
      consumoKmPorGalon: 20,
      tipoCombustible: 'diesel',
      totalGalonesConsumidos: 0,
    })

    const haceDosHoras = Date.now() - 2 * 3600_000
    await crearMisionOperativa({
      id: 'mis-auto-1',
      titulo: 'Rescate en vereda',
      tipo: 'auxilio_comunitario',
      prioridad: 'alta',
      origen: 'Base Finca El Guadual',
      destino: 'Vereda La Cabaña',
      departamento: 'Caldas',
      prioridadGeografica: 'local_manizales',
      terreno: 'pavimento',
      distanciaKmIdaYVuelta: 40,
      duracionMinutos: 60,
      iniciadaEn: haceDosHoras,
      finalizaEstimadaEn: haceDosHoras + 60 * 60_000, // ya venció hace 1 hora
      vehiculosAsignados: [{ id: 'v1', nombre: 'Toyota Land Cruiser' }],
      tripulantesAsignados: [{ id: 'e1', nombre: 'Andrés' }],
      galonesConsumidosEstimados: 0,
      costoCombustibleEstimadoCOP: 0,
      desgasteLlantasIncrementoPorc: 0,
      fecha: '2026-11-21',
      estado: 'en_curso',
      impactoSocial: 'Apoyo veredal',
    })

    const res = await verificarYCompletarMisionesVencidas()
    expect(res.misionesFinalizadas).toHaveLength(1)
    expect(res.misionesFinalizadas[0].cronicaHistoria?.length).toBeGreaterThan(20)
    expect(['completada', 'inconclusa_repliegue']).toContain(res.misionesFinalizadas[0].estado)

    // Odómetro en Firestore aumentó
    const vehFirestore = __get('vehiculos', 'v1') as { mantenimiento?: { kilometrajeActual?: number } }
    expect(vehFirestore?.mantenimiento?.kilometrajeActual).toBeGreaterThan(100000)

    // Si bajó a <= 15% y auto-tanqueó, totalGalonesConsumidos NO se duplicó con los 18 galones del tanqueo
    const vehs = await listarVehiculosBears()
    const v1 = vehs.find((v) => v.id === 'v1')!
    expect(v1.estado).toBe('disponible')
    expect(v1.totalGalonesConsumidos).toBeLessThan(10)

    // Idempotencia: segunda llamada no vuelve a completar la misión
    const res2 = await verificarYCompletarMisionesVencidas()
    expect(res2.misionesFinalizadas).toHaveLength(0)
    expect(listarMisiones()).toHaveLength(1)
  })

  it('persiste cambios en modo demo (cuando CashMet no tiene vehículos registrados)', async () => {
    await hidratarEstadoBears()
    const demo1 = await listarVehiculosBears()
    expect(demo1.length).toBeGreaterThan(0)
    const id = demo1[0].id

    await guardarExtraVehiculo(id, { nivelCombustiblePorc: 42, desgasteLlantasPorc: 0 })
    __resetCacheBearsParaTests()

    const demo2 = await listarVehiculosBears()
    const encontrado = demo2.find((v) => v.id === id)
    expect(encontrado?.nivelCombustiblePorc).toBe(42)
    expect(encontrado?.desgasteLlantasPorc).toBe(0)
  })

  it('recupera vehículos habilitados e investigados desde localStorage si Firestore quedó con vehiculosExtra vacío', async () => {
    __seed('vehiculos', 'v-rec', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      activo: true,
      estado: 'Disponible',
      mantenimiento: { kilometrajeActual: 12000, tareas: [] },
    })
    // Firestore ya existe pero con vehiculosExtra vacío
    __seed('configuracion_sistema', 'bears_reserve_config', {
      vehiculosExtra: {},
      empleadosExtra: {},
      rutasHabituales: [],
      rotacionContador: 0,
    })
    // localStorage aún conserva la configuración previa del usuario
    localStorage.setItem(
      'bears_reserve_habilitados_map_v1',
      JSON.stringify({ 'v-rec': true })
    )
    localStorage.setItem(
      'bears_reserve_data_v2',
      JSON.stringify({
        vehiculosExtra: {
          'v-rec': {
            disponibleParaTrabajo: true,
            investigadoIA: true,
            capacidadTanqueGalones: 21.1,
            tipoCombustible: 'diesel',
          },
        },
      })
    )

    const vehs = await listarVehiculosBears()
    const v = vehs.find((x) => x.id === 'v-rec')
    expect(v?.disponibleParaTrabajo).toBe(true)
    expect(v?.investigadoIA).toBe(true)
    expect(v?.capacidadTanqueGalones).toBe(21.1)
    expect(v?.tipoCombustible).toBe('diesel')
  })

  it('conserva vehículos habilitados y misiones en curso al recargar incluso si Firestore quedó desactualizado', async () => {
    __seed('vehiculos', 'v-gaz', {
      marca: 'GAZ',
      linea: '3302 GAZelle',
      tipo: 'camion',
      activo: true,
      estado: 'Disponible',
      mantenimiento: { kilometrajeActual: 85000, tareas: [] },
    })

    await guardarExtraVehiculo('v-gaz', {
      disponibleParaTrabajo: true,
      investigadoIA: true,
      capacidadTanqueGalones: 18.5,
      tipoCombustible: 'diesel',
    })

    await crearMisionOperativa({
      id: 'mis-activa-f5',
      titulo: 'Traslado humanitario de adulto mayor',
      tipo: 'transporte_humanitario',
      prioridad: 'alta',
      origen: 'Finca El Guadual',
      destino: 'Vereda La Linda · Manizales',
      departamento: 'Caldas',
      prioridadGeografica: 'local_manizales',
      terreno: 'trocha_moderada',
      distanciaKmIdaYVuelta: 32.8,
      duracionMinutos: 108,
      vehiculosAsignados: [{ id: 'v-gaz', nombre: 'GAZ 3302 GAZelle' }],
      tripulantesAsignados: [{ id: 'emp-1', nombre: 'Daniela' }],
      galonesConsumidosEstimados: 0,
      costoCombustibleEstimadoCOP: 0,
      desgasteLlantasIncrementoPorc: 0,
      fecha: '2026-11-21',
      estado: 'en_curso',
      impactoSocial: 'Traslado médico prioritario',
    })

    // Simulamos pérdida/desfase en Firestore + recarga F5 de la página (caché RAM vacía, pero espejo local intacto)
    __reset()
    __seed('vehiculos', 'v-gaz', {
      marca: 'GAZ',
      linea: '3302 GAZelle',
      tipo: 'camion',
      activo: true,
      estado: 'Disponible',
      mantenimiento: { kilometrajeActual: 85000, tareas: [] },
    })
    __resetCacheBearsParaTests()

    await hidratarEstadoBears()
    const vehs = await listarVehiculosBears()
    const gaz = vehs.find((x) => x.id === 'v-gaz')
    expect(gaz?.disponibleParaTrabajo).toBe(true)
    expect(gaz?.investigadoIA).toBe(true)
    expect(gaz?.estado).toBe('en_mision')

    const misiones = listarMisiones()
    expect(misiones.some((m) => m.id === 'mis-activa-f5' && m.estado === 'en_curso')).toBe(true)

    // Además se volvió a sincronizar hacia Firestore automáticamente
    const docCfg = __get('configuracion_sistema', 'bears_reserve_config')
    const docOp = __get('configuracion_sistema', 'bears_reserve_operaciones')
    expect((docCfg?.vehiculosExtra as Record<string, { disponibleParaTrabajo?: boolean }>)?.['v-gaz']?.disponibleParaTrabajo).toBe(true)
    expect(Array.isArray(docOp?.misiones) && docOp.misiones.length).toBe(1)
  })

  it('sanitizarFirestore neutraliza arrays 2D y convierte Date a ISO sin fallar en Firestore', async () => {
    __seed('vehiculos', 'v-san', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      activo: true,
      estado: 'Disponible',
      mantenimiento: { kilometrajeActual: 10000, tareas: [] },
    })

    const fechaPrueba = new Date('2026-11-22T12:00:00.000Z')
    await guardarExtraVehiculo('v-san', {
      disponibleParaTrabajo: true,
      // Valores prohibidos por Firestore si no se sanitizan: array 2D, Date y undefined
      ...({
        matrizCoordenadas: [[1, 2], [3, 4]],
        fechaInspeccion: fechaPrueba,
        campoVacio: undefined,
      } as Record<string, unknown>),
    })

    const docCfg = __get('configuracion_sistema', 'bears_reserve_config')
    const extraGuardado = (docCfg?.vehiculosExtra as Record<string, Record<string, unknown>>)?.['v-san']
    expect(extraGuardado?.fechaInspeccion).toBe('2026-11-22T12:00:00.000Z')
    expect(extraGuardado?.matrizCoordenadas).toEqual(['[1,2]', '[3,4]'])
    expect('campoVacio' in (extraGuardado ?? {})).toBe(false)
  })

  it('cancelarMisionProgramada elimina el evento del calendario y limpia despachado en el radar', async () => {
    const ahora = Date.now()
    await guardarEventosRadar([
      {
        id: 'rad-cancel-1',
        titulo: 'Despeje programado en vereda',
        lugar: 'Vereda La Linda',
        departamento: 'Caldas',
        fuenteNoticia: 'Junta Veredal',
        resumen: 'Ramas sobre vía secundaria',
        fecha: '2026-11-22',
        creadoEn: ahora,
        expiraEn: ahora + 24 * 3600_000,
        esEmergenciaGrave: false,
        atencionOficialPresente: false,
        esNoticiaWebReal: false,
        recomendacionGema: 'apoyo_logistico',
        justificacionGema: 'Apoyo veredal',
      },
    ])

    const mision = await crearMisionOperativa({
      id: 'mis-prog-cancel',
      titulo: 'Despeje programado',
      tipo: 'auxilio_comunitario',
      prioridad: 'media',
      origen: 'Finca El Guadual',
      destino: 'Vereda La Linda',
      departamento: 'Caldas',
      prioridadGeografica: 'local_manizales',
      terreno: 'trocha_moderada',
      distanciaKmIdaYVuelta: 20,
      duracionMinutos: 60,
      vehiculosAsignados: [],
      tripulantesAsignados: [{ id: 'e1', nombre: 'Andrés' }],
      galonesConsumidosEstimados: 0,
      costoCombustibleEstimadoCOP: 0,
      desgasteLlantasIncrementoPorc: 0,
      fecha: '2026-11-25',
      estado: 'programada',
      impactoSocial: 'Despeje de acceso escolar',
      eventoRadarId: 'rad-cancel-1',
    })

    expect(mision.eventoCalendarioId).toBeTruthy()
    expect(__all('calendario_eventos')).toHaveLength(1)
    expect(leerEventosRadar().find((e) => e.id === 'rad-cancel-1')?.despachado).toBe(true)

    await cancelarMisionProgramada('mis-prog-cancel')

    expect(listarMisiones().some((m) => m.id === 'mis-prog-cancel')).toBe(false)
    expect(__all('calendario_eventos')).toHaveLength(0)
    expect(leerEventosRadar().find((e) => e.id === 'rad-cancel-1')?.despachado).toBe(false)
  })

  it('liquidarTarjetaEnCashmet parcial no duplica galones ni conteo de tanqueos en el segundo tramo', async () => {
    __seed('cuentas_banco', 'cta-1', { nombre: 'Bancolombia', tipo: 'ahorros', saldoActual: 5000000, activa: true })
    __seed('vehiculos', 'v1', {
      marca: 'Toyota',
      linea: 'Hilux',
      tipo: 'carro',
      activo: true,
      estado: 'Disponible',
      mantenimiento: { kilometrajeActual: 50000, tareas: [] },
    })

    await guardarExtraVehiculo('v1', {
      disponibleParaTrabajo: true,
      nivelCombustiblePorc: 50,
      capacidadTanqueGalones: 20,
      tipoCombustible: 'diesel',
    })

    // Tramo 1: 10 galones (1 tanqueo)
    await tanquearVehiculoCompleto('v1', 'manual')
    const liq1 = await liquidarTarjetaEnCashmet('cta-1')
    expect(liq1.liquidaciones?.[0]).toMatchObject({ galones: 10, tanqueosCount: 1 })

    // Tramo 2: 5 galones adicionales (1 tanqueo nuevo) -> solo debe reportar 5 gal y 1 tanqueo, no 15 gal y 2
    await guardarExtraVehiculo('v1', { nivelCombustiblePorc: 75 })
    await tanquearVehiculoCompleto('v1', 'manual')
    const liq2 = await liquidarTarjetaEnCashmet('cta-1')
    expect(liq2.liquidaciones).toHaveLength(2)
    expect(liq2.liquidaciones?.[0]).toMatchObject({ galones: 5, tanqueosCount: 1 })
    expect(liq2.liquidaciones?.[1]).toMatchObject({ galones: 10, tanqueosCount: 1 })
  })

  it('hidratarEstadoBears tras error de lectura protege Firestore y no sobrescribe datos existentes', async () => {
    __seed('configuracion_sistema', 'bears_reserve_config', {
      vehiculosExtra: {
        'v-prod': { disponibleParaTrabajo: true, investigadoIA: true, capacidadTanqueGalones: 24 },
      },
      empleadosExtra: {},
      rutasHabituales: [],
      rotacionContador: 3,
      actualizado: Date.now() - 1000,
    })

    __failNextGetDoc('configuracion_sistema', 'bears_reserve_config', new Error('unavailable'))
    await hidratarEstadoBears()

    // Si el documento sigue sin poder leerse en el siguiente intento (sin espejo local previo),
    // guardarExtraVehiculo queda protegido y NO sobrescribe Firestore.
    __failNextGetDoc('configuracion_sistema', 'bears_reserve_config', new Error('unavailable'))
    await guardarExtraVehiculo('v-otro', { disponibleParaTrabajo: true })

    const docRemoto = __get('configuracion_sistema', 'bears_reserve_config')
    const extrasRemotos = docRemoto?.vehiculosExtra as Record<string, { disponibleParaTrabajo?: boolean }>
    expect(extrasRemotos?.['v-prod']?.disponibleParaTrabajo).toBe(true)
    expect(extrasRemotos?.['v-otro']).toBeUndefined()
  })
})
