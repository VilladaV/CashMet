import { z } from 'zod'
import { ai } from '../genkit'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const crearEditarNominaTool = ai.defineTool(
  {
    name: 'crearEditarNomina',
    description: 'Crea o edita trabajador (nómina). Calcula estimado mensual.',
    inputSchema: z.object({
      nominaId: z.string().optional(),
      nombreCompleto: z.string().min(1).max(120),
      cargo: z.string().min(1).max(80),
      activo: z.boolean().default(true),
      tipoContrato: z.enum(['indefinido', 'fijo', 'obra', 'aprendiz']),
      salarioBaseMensual: z.number().min(0),
      moneda: z.literal('COP'),
      asignacion: z.object({ vehiculoId: z.string().optional(), propiedadId: z.string().optional(), otros: z.string().optional() }).default({}),
      primaServicios: z.object({ aplica: z.boolean(), mitadJulio: z.boolean(), mitadDiciembre: z.boolean() }).default({ aplica: true, mitadJulio: true, mitadDiciembre: true }),
      otrosConceptos: z.array(z.object({ concepto: z.string(), tipo: z.enum(['devengo', 'deduccion']), valorMensual: z.number(), periodicidad: z.enum(['mensual', 'anual']) })).default([]),
      fechaPago: z.object({ dia: z.number().int().min(1).max(31), tipo: z.enum(['mensual', 'quincenal', 'semanal']) }),
      notas: z.string().optional(),
    }),
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
  },
  async (input) => {
    const dev = input.otrosConceptos.filter((c) => c.tipo === 'devengo').reduce((a, c) => a + (c.periodicidad === 'mensual' ? c.valorMensual : c.valorMensual / 12), 0)
    const ded = input.otrosConceptos.filter((c) => c.tipo === 'deduccion').reduce((a, c) => a + (c.periodicidad === 'mensual' ? c.valorMensual : c.valorMensual / 12), 0)
    const salarioTotalMensualEstimado = Math.round((input.salarioBaseMensual || 0) + dev - ded)
    const payload: any = { ...input, salarioTotalMensualEstimado, creado: input.nominaId ? undefined : Date.now(), actualizado: Date.now() }
    if (input.nominaId) {
      await updateDoc(doc(db, COLLECTIONS.NOMINA, input.nominaId), payload)
      return { id: input.nominaId, ok: true }
    }
    const ref = await addDoc(collection(db, COLLECTIONS.NOMINA), payload)
    return { id: ref.id, ok: true }
  }
)
