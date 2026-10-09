import { z } from 'zod'
import { ai } from '../genkit'
import { crearMovimiento } from '../../lib/firebase/movimientosRepo'

export const CreateMovimientoInput = z.object({
  fecha: z.string(),
  hora: z.string().optional(),
  tipo: z.enum(['gasto', 'ingreso', 'transferencia', 'pago_deuda', 'pago_nomina', 'impuesto', 'seguro', 'mantenimiento', 'otro']),
  concepto: z.string().min(1).max(120),
  descripcion: z.string().max(200).optional(),
  monto: z.number().positive(),
  categoria: z.string().min(1).max(60),
  subcategoria: z.string().max(60).optional(),
  cuentaBancoId: z.string().optional(),
  deudaId: z.string().optional(),
  vehiculoId: z.string().optional(),
  propiedadId: z.string().optional(),
  nominaId: z.string().optional(),
  recurrenteId: z.string().optional(),
  etiquetas: z.array(z.string()).max(20).default([]),
  notasIA: z.string().max(500).optional(),
})

export const createMovimientoTool = ai.defineTool(
  {
    name: 'createMovimiento',
    description: 'Crea un movimiento (gasto/ingreso/pago) y actualiza saldo de cuenta si aplica.',
    inputSchema: CreateMovimientoInput,
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
  },
  async (input) => {
    const id = await crearMovimiento({
      fecha: input.fecha,
      tipo: input.tipo,
      concepto: input.concepto,
      monto: input.monto,
      categoria: input.categoria,
      subcategoria: input.subcategoria,
      descripcion: input.descripcion,
      cuentaBancoId: input.cuentaBancoId,
      etiquetas: input.etiquetas,
      fuente: 'chat_IA',
    })
    return { id, ok: true }
  }
)
