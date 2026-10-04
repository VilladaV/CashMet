import { z } from 'zod'
import { defineTool } from 'genkit'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const getSaldosTool = defineTool(
  {
    name: 'getSaldos',
    description: 'Obtiene saldos/resumen básico (cuentas banco + deudas).',
    inputSchema: z.object({}),
    outputSchema: z.object({
      cuentas: z.array(z.object({ id: z.string(), nombre: z.string(), saldoActual: z.number(), tipo: z.string() })),
      deudas: z.array(z.object({ id: z.string(), nombre: z.string(), saldoPendiente: z.number(), cuotaMensual: z.number() })),
    }),
  },
  async () => {
    const [c, d] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.CUENTAS_BANCO)),
      getDocs(collection(db, COLLECTIONS.DEUDAS)),
    ])
    const cuentas = c.docs.map((x) => ({ id: x.id, ...(x.data() as any) }))
    const deudas = d.docs.map((x) => ({ id: x.id, ...(x.data() as any) }))
    return {
      cuentas: cuentas.map((t: any) => ({ id: t.id, nombre: t.nombre, saldoActual: t.saldoActual ?? 0, tipo: t.tipo })),
      deudas: deudas.map((t: any) => ({ id: t.id, nombre: t.nombre, saldoPendiente: t.saldoPendiente ?? 0, cuotaMensual: t.cuotaMensual ?? 0 })),
    }
  }
)

export const updateSaldoCuentaTool = defineTool(
  {
    name: 'updateSaldoCuenta',
    description: 'Actualiza saldo actual de una cuenta banco.',
    inputSchema: z.object({ cuentaBancoId: z.string(), saldoActual: z.number() }),
    outputSchema: z.object({ ok: z.boolean() }),
  },
  async (input) => {
    await updateDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaBancoId), { saldoActual: input.saldoActual, actualizado: Date.now() })
    return { ok: true }
  }
)
