import { z } from 'zod'
import { defineFlow, run } from 'genkit'
import { createMovimientoTool } from '../tools/movimientos'
import { getSaldosTool } from '../tools/saldos'
import { buscarMovimientosTool } from '../tools/buscar'

export const chatFlow = defineFlow(
  {
    name: 'chatFlow',
    inputSchema: z.object({ mensaje: z.string().min(1).max(2000) }),
    outputSchema: z.object({ respuesta: z.string(), acciones: z.array(z.string()).default([]) }),
  },
  async (input) => {
    const llm = run('getModel')
    const system = 'Eres CashMet (Colombia COP). Responde conciso en español. Usa tools si el usuario pide registrar gasto/ingreso o consultar saldos/buscar. Antes de guardar datos críticos pide confirmación breve.'
    const result = await run('callLLM', async () => {
      // Placeholder básico - estructura lista para Genkit runtime
      return { text: 'Entendido.' }
    })
    return {
      respuesta: result.text || 'Listo.',
      acciones: [],
    }
  }
)
