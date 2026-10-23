import { z } from 'zod'
import { ai } from '../genkit'
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const InvestigarVehiculoInput = z.object({
  marca: z.string().min(1).max(40),
  linea: z.string().min(1).max(60),
  modelo: z.number().int().min(1900).max(2100),
  cilindraje: z.number().int().min(50).max(10000).optional(),
  claseVehiculo: z.string().max(60).optional(),
  placa: z.string().max(10).optional(),
})

export const investigacionVehiculoCOOutput = z.object({
  soatAnualEstimadoCOP: z.number().min(0),
  tecnicomecanicaCostoEstimadoCOP: z.number().min(0),
  seguroTodoRiesgoAnualEstimadoCOP: z.number().min(0),
  rangoSOAT: z.object({ min: z.number(), max: z.number() }).optional(),
  rangoSTR: z.object({ min: z.number(), max: z.number() }).optional(),
  nivelConfianza: z.enum(['bajo', 'medio', 'alto']),
  requiereConfirmacion: z.literal(true),
  fuente: z.string().min(1),
  justificacion: z.string().min(1).max(500),
})

export const investigacionVehiculoCOTool = ai.defineTool(
  {
    name: 'investigacionVehiculoCO',
    description: 'Investiga estimados Colombia (SOAT, tecnicomecánica, STR). requiereConfirmacion=true.',
    inputSchema: InvestigarVehiculoInput,
    outputSchema: investigacionVehiculoCOOutput,
  },
  async (input) => {
    const cil = input.cilindraje ?? 1400
    const modelo = input.modelo
    const edad = Math.max(0, new Date().getFullYear() - modelo)
    const factorCil = Math.min(2.5, 1 + cil / 2500)
    const factorEdad = Math.max(0.6, 1 - edad * 0.03)
    const soatMedio = Math.round(250000 * factorCil * factorEdad)
    const tmMedio = Math.round(120000 + edad * 8000)
    const strMedio = Math.round(soatMedio * 2.2)
    const resultado: z.infer<typeof investigacionVehiculoCOOutput> = {
      soatAnualEstimadoCOP: soatMedio,
      tecnicomecanicaCostoEstimadoCOP: tmMedio,
      seguroTodoRiesgoAnualEstimadoCOP: strMedio,
      rangoSOAT: { min: Math.round(soatMedio * 0.85), max: Math.round(soatMedio * 1.15) },
      rangoSTR: { min: Math.round(strMedio * 0.8), max: Math.round(strMedio * 1.2) },
      nivelConfianza: 'medio',
      requiereConfirmacion: true,
      fuente: 'Estimativo IA Colombia (referencial). Requiere verificación real.',
      justificacion: `Basado en modelo ${modelo}, cilindraje aprox ${cil} cc, edad ${edad} años. Estimación referencial.`,
    }
    return resultado
  }
)

export const crearEditarVehiculoTool = ai.defineTool(
  {
    name: 'crearEditarVehiculo',
    description: 'Crea o edita vehículo con datos SOAT/TM/STR.',
    inputSchema: z.object({
      vehiculoId: z.string().optional(),
      placa: z.string().min(3).max(10),
      marca: z.string().min(1),
      linea: z.string().min(1),
      modelo: z.number().int(),
      tipo: z.enum(['carro', 'moto', 'camion', 'otro']),
      cilindraje: z.number().int().optional(),
      claseVehiculo: z.string().optional(),
      valorComercial: z.number().min(0).optional(),
      soat: z.object({ vigente: z.boolean(), aseguradora: z.string(), numeroPoliza: z.string(), fechaVencimiento: z.string(), valorPrimaAnual: z.number(), cobertura: z.string(), fuente: z.enum(['investigado_IA', 'manual']) }),
      tecnicomecanica: z.object({ vigente: z.boolean(), centroRevision: z.string(), fechaVencimiento: z.string(), costoRevision: z.number(), tipo: z.enum(['vigente']), fuente: z.enum(['investigado_IA', 'manual']) }),
      seguroTodoRiesgo: z.object({ tiene: z.boolean(), vigente: z.boolean(), aseguradora: z.string(), numeroPoliza: z.string(), fechaVencimiento: z.string(), valorPrimaAnual: z.number(), periodicidad: z.enum(['anual', 'mensual', 'semestral']), deducible: z.number().optional(), cobertura: z.string(), fuente: z.enum(['investigado_IA', 'manual']) }),
      otrosGastos: z.array(z.object({ concepto: z.string(), periodicidad: z.enum(['mensual', 'trimestral', 'anual']), valor: z.number() })).default([]),
      notas: z.string().optional(),
      investigadoIA: z.boolean().default(false),
    }),
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
  },
  async (input) => {
    const payload: any = {
      ...input,
      gastosMensualesCalculados: 0,
      actualizado: Date.now(),
      investigadoIA: input.investigadoIA ? Date.now() : undefined,
    }
    if (input.vehiculoId) {
      await updateDoc(doc(db, COLLECTIONS.VEHICULOS, input.vehiculoId), payload)
      return { id: input.vehiculoId, ok: true }
    } else {
      const ref = await addDoc(collection(db, COLLECTIONS.VEHICULOS), payload)
      return { id: ref.id, ok: true }
    }
  }
)

export const obtenerVehiculoCompletoTool = ai.defineTool(
  {
    name: 'obtener_vehiculo_completo',
    description: 'Obtiene TODOS los datos de un vehículo por su ID (SOAT, TM, STR, cilindraje, valor, documentos, mantenimiento). Úsalo cuando necesites detalle completo que no esté en el snapshot.',
    inputSchema: z.object({ vehiculoId: z.string().min(1) }),
    outputSchema: z.object({
      id: z.string(),
      placa: z.string().optional(),
      marca: z.string(),
      linea: z.string(),
      modelo: z.number(),
      tipo: z.string(),
      cilindraje: z.number().optional(),
      valorComercial: z.number().optional(),
      estado: z.string().optional(),
      soat: z.object({ vigente: z.boolean(), fechaVencimiento: z.string().optional(), valorPrimaAnual: z.number().optional(), aseguradora: z.string().optional(), numeroPoliza: z.string().optional() }).optional(),
      tecnicomecanica: z.object({ vigente: z.boolean(), fechaVencimiento: z.string().optional(), costoRevision: z.number().optional(), cda: z.string().optional(), numeroCertificado: z.string().optional() }).optional(),
      seguroTodoRiesgo: z.object({ tiene: z.boolean(), vigente: z.boolean(), fechaVencimiento: z.string().optional(), valorPrimaAnual: z.number().optional(), aseguradora: z.string().optional() }).optional(),
      gastosMensualesCalculados: z.number().optional(),
      mantenimiento: z.object({ kilometrajeActual: z.number().optional(), tareas: z.array(z.any()) }).optional(),
      documentos: z.object({ manualUrl: z.string().optional(), fichaUrl: z.string().optional() }).optional(),
      licenciaTransito: z.object({ numeroLicencia: z.string().optional(), organismoTransito: z.string().optional() }).optional(),
      actualizado: z.number().optional(),
    }),
  },
  async (input) => {
    const snap = await getDoc(doc(db, COLLECTIONS.VEHICULOS, input.vehiculoId))
    if (!snap.exists()) throw new Error('Vehículo no encontrado')
    return { id: snap.id, ...snap.data() } as any
  }
)

export const renovarSoatTool = ai.defineTool(
  {
    name: 'renovar_soat',
    description: 'Renueva el SOAT del vehículo sumando 1 año a la fecha de vencimiento actual. Requiere que el vehículo ya tenga SOAT con fecha de vencimiento.',
    inputSchema: z.object({ vehiculoId: z.string().min(1) }),
    outputSchema: z.object({ ok: z.boolean(), fechaVencimiento: z.string() }),
  },
  async (input) => {
    const snap = await getDoc(doc(db, COLLECTIONS.VEHICULOS, input.vehiculoId))
    if (!snap.exists()) throw new Error('Vehículo no encontrado')
    const v = snap.data() as any
    if (!v.soat?.fechaVencimiento) throw new Error('El vehículo no tiene SOAT con fecha de vencimiento')
    const fecha = new Date(v.soat.fechaVencimiento)
    fecha.setFullYear(fecha.getFullYear() + 1)
    const nueva = fecha.toISOString().slice(0, 10)
    await updateDoc(doc(db, COLLECTIONS.VEHICULOS, input.vehiculoId), {
      'soat.fechaVencimiento': nueva,
      'soat.vigente': true,
      actualizado: Date.now(),
    })
    return { ok: true, fechaVencimiento: nueva }
  }
)

export const renovarTecnicomecanicaTool = ai.defineTool(
  {
    name: 'renovar_tecnomecanica',
    description: 'Renueva la Tecnicomecánica del vehículo sumando 1 año a la fecha de vencimiento actual. Requiere que el vehículo ya tenga TM con fecha de vencimiento.',
    inputSchema: z.object({ vehiculoId: z.string().min(1) }),
    outputSchema: z.object({ ok: z.boolean(), fechaVencimiento: z.string() }),
  },
  async (input) => {
    const snap = await getDoc(doc(db, COLLECTIONS.VEHICULOS, input.vehiculoId))
    if (!snap.exists()) throw new Error('Vehículo no encontrado')
    const v = snap.data() as any
    if (!v.tecnicomecanica?.fechaVencimiento) throw new Error('El vehículo no tiene Tecnicomecánica con fecha de vencimiento')
    const fecha = new Date(v.tecnicomecanica.fechaVencimiento)
    fecha.setFullYear(fecha.getFullYear() + 1)
    const nueva = fecha.toISOString().slice(0, 10)
    await updateDoc(doc(db, COLLECTIONS.VEHICULOS, input.vehiculoId), {
      'tecnicomecanica.fechaVencimiento': nueva,
      'tecnicomecanica.vigente': true,
      actualizado: Date.now(),
    })
    return { ok: true, fechaVencimiento: nueva }
  }
)
