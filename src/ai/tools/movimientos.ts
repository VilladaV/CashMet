import { z } from 'zod'
import { defineTool } from 'genkit'
import { addDoc, collection, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

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

export const createMovimientoTool = defineTool(
  {
    name: 'createMovimiento',
    description: 'Crea un movimiento (gasto/ingreso/pago) y actualiza saldo de cuenta si aplica.',
    inputSchema: CreateMovimientoInput,
    outputSchema: z.object({ id: z.string(), ok: z.boolean() }),
  },
  async (input) => {
    const ref = await addDoc(collection(db, COLLECTIONS.MOVIMIENTOS), {
      ...input,
      fuente: 'chat_IA',
      estado: 'confirmado',
      creado: Date.now(),
      actualizado: Date.now(),
    })
    if (input.cuentaBancoId) {
      const cRef = doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaBancoId)
      const delta = input.tipo === 'ingreso' ? input.monto : -input.monto
      await updateDoc(cRef, { saldoActual: increment(delta), actualizado: Date.now() })
    }
    return { id: ref.id, ok: true }
  }
)
