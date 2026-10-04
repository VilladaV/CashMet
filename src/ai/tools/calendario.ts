import { z } from 'zod'
import { defineTool } from 'genkit'
import { addDoc, collection } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const generarEventosCalendarioTool = defineTool(
  {
    name: 'generarEventosCalendario',
    description: 'Genera eventos calendario (vencimientos/sueldos/primas).',
    inputSchema: z.object({
      eventos: z.array(
        z.object({
          titulo: z.string().min(1).max(120),
          descripcion: z.string().max(300).optional(),
          tipo: z.enum(['pago_sueldo', 'nomina_trabajador', 'prima_julio', 'prima_diciembre', 'soat', 'tecnicomecanica', 'seguro_tr', 'predial', 'impuesto', 'cuota_deuda', 'recurrente', 'personal']),
          fechaInicio: z.string(),
          fechaFin: z.string().optional(),
          allDay: z.boolean().default(true),
          recurrente: z.boolean().default(false),
          reglaRecurrencia: z.string().optional(),
          recordatorios: z.array(z.object({ minutosAntes: z.number().int() })).default([{ minutosAntes: 1440 }, { minutosAntes: 60 }]),
          relacionado: z.object({ vehiculoId: z.string().optional(), deudaId: z.string().optional(), propiedadId: z.string().optional(), nominaId: z.string().optional(), recurrenteId: z.string().optional() }).default({}),
        })
      ),
    }),
    outputSchema: z.object({ creados: z.number(), ok: z.boolean() }),
  },
  async (input) => {
    let creados = 0
    for (const e of input.eventos) {
      await addDoc(collection(db, COLLECTIONS.CALENDARIO_EVENTOS), {
        ...e,
        sincronizadoGoogle: false,
        activo: true,
        creado: Date.now(),
        actualizado: Date.now(),
      })
      creados++
    }
    return { creados, ok: true }
  }
)
