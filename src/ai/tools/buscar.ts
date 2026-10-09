import { z } from 'zod'
import { ai } from '../genkit'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const buscarMovimientosTool = ai.defineTool(
  {
    name: 'buscarMovimientos',
    description: 'Busca movimientos recientes por concepto/categoria.',
    inputSchema: z.object({ q: z.string().min(1).max(60), max: z.number().int().min(1).max(50).default(10) }),
    outputSchema: z.object({
      items: z.array(z.object({ id: z.string(), concepto: z.string(), monto: z.number(), fecha: z.string(), tipo: z.string() })),
    }),
  },
  async (input) => {
    const qRef = query(collection(db, COLLECTIONS.MOVIMIENTOS), orderBy('creado', 'desc'), limit(input.max))
    const snap = await getDocs(qRef)
    const items = snap.docs.map((x) => ({ id: x.id, ...(x.data() as any) }))
    const filtered = items.filter((m: any) => (m.concepto || '').toLowerCase().includes(input.q.toLowerCase()) || (m.categoria || '').toLowerCase().includes(input.q.toLowerCase()))
    return {
      items: filtered.slice(0, input.max).map((m: any) => ({ id: m.id, concepto: m.concepto, monto: m.monto, fecha: m.fecha, tipo: m.tipo })),
    }
  }
)
