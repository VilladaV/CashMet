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
    const msg = input.mensaje.toLowerCase()
    const acciones: string[] = []

    if (msg.includes('saldo') || msg.includes('saldos')) {
      const r = await getSaldosTool.run({})
      return {
        respuesta: Saldos:  cuentas, total  COP.,
        acciones: ['consulta_saldos'],
      }
    }

    if (msg.includes('buscar') || msg.includes('buscar movimiento')) {
      const r = await buscarMovimientosTool.run({ limite: 5 })
      return {
        respuesta: Encontrados  movimientos (muestra: ).,
        acciones: ['busqueda_movimientos'],
      }
    }

    if ((msg.includes('gasto') || msg.includes('ingreso') || msg.includes('registrar') || msg.includes('pagu')) && (msg.includes('cop') || msg.match(/\d+/))) {
      acciones.push('requiere_confirmacion')
      return {
        respuesta: 'He detectado un posible movimiento. ¿Quieres confirmar los datos (fecha, concepto, monto, categoría, cuenta)?',
        acciones,
      }
    }

    return {
      respuesta: 'Entendido. Puedo registrar gastos/ingresos, consultar saldos o buscar movimientos.',
      acciones,
    }
  }
)
