import { z } from 'zod'
import { ai } from '../genkit'
import { calcularGastosMensualesTool } from '../tools/calculos'

export const calculoMensualFlow = ai.defineFlow(
  {
    name: 'calculoMensualFlow',
    inputSchema: z.object({}),
    outputSchema: z.object({
      totalMensualEstimado: z.number(),
      porCategoria: z.record(z.string(), z.number()),
    }),
  },
  async () => {
    const r = await calcularGastosMensualesTool({})
    return { totalMensualEstimado: r.totalMensualEstimado, porCategoria: r.porCategoria }
  }
)
