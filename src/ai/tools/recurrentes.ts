import { z } from 'zod'
import { defineTool } from 'genkit'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const crearEditarGastoRecurrenteTool = defineTool(
  {
    name: 'crearEditarGastoRecurrente',
    description: 'Crea/edita gasto recurrente automático.',
    inputSchema: z.object({
      recurrenteId: z.string().optional(),
      concepto: z.string().min(1).max(80),
      categoria: z.enum(['hogar', 'transporte', 'salud', 'educacion', 'servicios', 'otro']),
      valor: z.number().min(0),
      periodicidad: z.enum(['diaria', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual']),
      diaVencimiento: z.number().int().min(1).max(31).optional(),
      fechaInicio: z.string(),
      fechaFin: z.string().optional(),
      activo: z.boolean().default(true),
      autoGenerarEnChat: z.boolean().default(true),
      notas: z.string().optional(),
    }),
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
  },
  async (input) => {
    const payload: any = { ...input, actualizado: Date.now() }
    if (input.recurrenteId) {
      await updateDoc(doc(db, COLLECTIONS.GASTOS_RECURRENTES, input.recurrenteId), payload)
      return { id: input.recurrenteId, ok: true }
    }
    const ref = await addDoc(collection(db, COLLECTIONS.GASTOS_RECURRENTES), payload)
    return { id: ref.id, ok: true }
  }
)
