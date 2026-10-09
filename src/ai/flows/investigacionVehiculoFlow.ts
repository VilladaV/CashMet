import { z } from 'zod'
import { ai } from '../genkit'
import { investigacionVehiculoCOTool } from '../tools/vehiculos'

export const investigacionVehiculoFlow = ai.defineFlow(
  {
    name: 'investigacionVehiculoFlow',
    inputSchema: z.object({
      marca: z.string(),
      linea: z.string(),
      modelo: z.number().int(),
      cilindraje: z.number().int().optional(),
      claseVehiculo: z.string().optional(),
    }),
    outputSchema: z.object({
      resultado: z.object({
        requiereConfirmacion: z.literal(true),
        nivelConfianza: z.enum(['bajo', 'medio', 'alto']),
        fuente: z.string(),
        soatAnualEstimadoCOP: z.number(),
        tecnicomecanicaCostoEstimadoCOP: z.number(),
        seguroTodoRiesgoAnualEstimadoCOP: z.number(),
        justificacion: z.string(),
      }),
    }),
  },
  async (input) => {
    const r = await investigacionVehiculoCOTool(input)
    return {
      resultado: {
        requiereConfirmacion: true as const,
        nivelConfianza: r.nivelConfianza,
        fuente: r.fuente,
        soatAnualEstimadoCOP: r.soatAnualEstimadoCOP,
        tecnicomecanicaCostoEstimadoCOP: r.tecnicomecanicaCostoEstimadoCOP,
        seguroTodoRiesgoAnualEstimadoCOP: r.seguroTodoRiesgoAnualEstimadoCOP,
        justificacion: r.justificacion,
      },
    }
  }
)
