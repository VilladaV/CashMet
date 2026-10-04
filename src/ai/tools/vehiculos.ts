import { z } from 'zod'
import { defineTool } from 'genkit'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
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

export const investigacionVehiculoCOTool = defineTool(
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
    return {
      soatAnualEstimadoCOP: soatMedio,
      tecnicomecanicaCostoEstimadoCOP: tmMedio,
      seguroTodoRiesgoAnualEstimadoCOP: strMedio,
      rangoSOAT: { min: Math.round(soatMedio * 0.85), max: Math.round(soatMedio * 1.15) },
      rangoSTR: { min: Math.round(strMedio * 0.8), max: Math.round(strMedio * 1.2) },
      nivelConfianza: 'medio',
      requiereConfirmacion: true,
      fuente: 'Estimativo IA Colombia (referencial). Requiere verificación real.',
      justificacion: Basado en   , cilindraje aprox cc, edad  años.,
    }
  }
)

export const crearEditarVehiculoTool = defineTool(
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
