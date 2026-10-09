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
        respuesta: `Saldos: ${r.totalCuentas} cuentas, total ${r.totalSaldoCOP.toLocaleString('es-CO')} COP.`,
        acciones: ['consulta_saldos'],
      }
    }

    if (msg.includes('buscar') && (msg.includes('movimiento') || msg.includes('gasto') || msg.includes('ingreso'))) {
      const r = await buscarMovimientosTool.run({ limite: 5 })
      return {
        respuesta: `Encontrados ${r.total} movimientos. Mostrando ${r.movimientos.length}.`,
        acciones: ['busqueda_movimientos'],
      }
    }

    if ((msg.includes('registrar') || msg.includes('añadir') || msg.includes('agregar')) && (msg.includes('gasto') || msg.includes('ingreso') || /\d+/.test(msg))) {
      acciones.push('requiere_confirmacion')
      return {
        respuesta: 'Detecté un posible movimiento. ¿Quieres que lo registre? Indícame: tipo (gasto/ingreso), fecha (YYYY-MM-DD), concepto, monto (COP), categoría y cuenta (si aplica).',
        acciones,
      }
    }

    return {
      respuesta: 'Puedo registrar gastos/ingresos, consultar saldos y buscar movimientos. También gestiono vehículos (investigación CO con confirmación), propiedades, nómina, recurrentes, calendario.',
      acciones,
    }
  }
)
