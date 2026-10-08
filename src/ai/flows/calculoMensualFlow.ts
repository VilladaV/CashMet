import { z } from 'zod'
import { defineFlow } from 'genkit'
import { calcularGastosMensualesTool } from '../tools/calculos'

export const calculoMensualFlow = defineFlow(
  {
    name: 'calculoMensualFlow',
    inputSchema: z.object({}),
    outputSchema: z.object({
      totalMensualEstimado: z.number(),
      porCategoria: z.record(z.string(), z.number()),
    }),
  },
  async () => {
    const r = await calcularGastosMensualesTool.run({})
    return { totalMensualEstimado: r.totalMensualEstimado, porCategoria: r.porCategoria }
  }
)
