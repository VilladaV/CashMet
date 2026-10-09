import { z } from 'zod'
import { defineFlow } from 'genkit'
import { interpretarMensaje } from '../../features/chat/engine'

export const chatFlow = defineFlow(
  {
    name: 'chatFlow',
    inputSchema: z.object({ mensaje: z.string().min(1).max(2000) }),
    outputSchema: z.object({
      respuesta: z.string(),
      acciones: z.array(z.string()).default([]),
      borrador: z
        .object({
          tipo: z.enum(['gasto', 'ingreso']),
          fecha: z.string(),
          concepto: z.string(),
          monto: z.number(),
          categoria: z.string(),
        })
        .optional(),
    }),
  },
  async (input) => interpretarMensaje(input.mensaje)
)
