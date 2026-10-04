import { z } from 'zod'
import { defineTool } from 'genkit'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const crearEditarPropiedadTool = defineTool(
  {
    name: 'crearEditarPropiedad',
    description: 'Crea o edita propiedad (valor patrimonial, predial).',
    inputSchema: z.object({
      propiedadId: z.string().optional(),
      nombre: z.string().min(1).max(80),
      direccion: z.string().max(120).optional(),
      tipo: z.enum(['vivienda', 'comercial', 'terreno', 'otro']),
      valorCatastral: z.number().min(0).optional(),
      valorComercialEstimado: z.number().min(0),
      valorPatrimonial: z.number().min(0),
      avaluoFecha: z.string().optional(),
      hipotecaAsociadaId: z.string().optional(),
      gastosMensualesFijos: z.array(z.object({ concepto: z.string(), valor: z.number() })).default([]),
      impuestos: z.object({
        predial: z.object({
          vigente: z.boolean(),
          fechaVencimiento: z.string().optional(),
          valorAnual: z.number().min(0).optional(),
          municipio: z.string().min(1),
          fuente: z.enum(['investigado_IA', 'manual']),
        }),
      }),
      intereses: z.array(z.object({ concepto: z.string(), tipo: z.enum(['mensual', 'anual']), valor: z.number(), descripcion: z.string().optional() })).default([]),
      notas: z.string().optional(),
    }),
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
  },
  async (input) => {
    const payload: any = { ...input, gastosMensualesCalculados: 0, actualizado: Date.now() }
    if (input.propiedadId) {
      await updateDoc(doc(db, COLLECTIONS.PROPIEDADES, input.propiedadId), payload)
      return { id: input.propiedadId, ok: true }
    }
    const ref = await addDoc(collection(db, COLLECTIONS.PROPIEDADES), payload)
    return { id: ref.id, ok: true }
  }
)
