import { z } from 'zod'
import { ai } from '../genkit'
import { generarEventosCalendarioTool } from '../tools/calendario'

export const generarCalendarioFlow = ai.defineFlow(
  {
    name: 'generarCalendarioFlow',
    inputSchema: z.object({ anio: z.number().int().min(2020).max(2100).default(new Date().getFullYear()) }),
    outputSchema: z.object({ creados: z.number(), ok: z.boolean() }),
  },
  async (input) => {
    const eventos: any[] = []
    eventos.push({ titulo: 'Prima de Servicios - Mitad Julio', descripcion: 'Recordatorio prima servicios (Colombia)', tipo: 'prima_julio' as const, fechaInicio: `${input.anio}-07-15`, allDay: true, recurrente: false, recordatorios: [{ minutosAntes: 2880 }, { minutosAntes: 1440 }] })
    eventos.push({ titulo: 'Prima de Servicios - Mitad Diciembre', descripcion: 'Recordatorio prima servicios (Colombia)', tipo: 'prima_diciembre' as const, fechaInicio: `${input.anio}-12-15`, allDay: true, recurrente: false, recordatorios: [{ minutosAntes: 2880 }, { minutosAntes: 1440 }] })
    const r = await generarEventosCalendarioTool({ eventos })
    return r
  }
)
