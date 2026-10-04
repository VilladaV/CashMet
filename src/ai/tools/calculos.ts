import { z } from 'zod'
import { defineTool } from 'genkit'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase/config'
import { COLLECTIONS } from '../../lib/firebase/collections'

export const calcularGastosMensualesTool = defineTool(
  {
    name: 'calcularGastosMensuales',
    description: 'Calcula gastos mensuales consolidados (recurrentes, vehículos, propiedades).',
    inputSchema: z.object({}),
    outputSchema: z.object({
      totalMensualEstimado: z.number(),
      porCategoria: z.record(z.string(), z.number()),
      detalles: z.array(z.object({ origen: z.string(), concepto: z.string(), valorMensual: z.number() })),
    }),
  },
  async () => {
    const [rec, veh, prop] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.GASTOS_RECURRENTES)),
      getDocs(collection(db, COLLECTIONS.VEHICULOS)),
      getDocs(collection(db, COLLECTIONS.PROPIEDADES)),
    ])
    const detalles: any[] = []
    let total = 0
    const porCat: Record<string, number> = {}
    rec.docs.forEach((d) => {
      const v: any = d.data()
      if (!v.activo) return
      let vm = v.valor || 0
      const p = v.periodicidad
      if (p === 'anual') vm = vm / 12
      if (p === 'semestral') vm = vm / 6
      if (p === 'trimestral') vm = vm / 3
      if (p === 'bimestral') vm = vm / 2
      if (p === 'quincenal') vm = vm * 2
      if (p === 'semanal') vm = vm * 4.345
      if (p === 'diaria') vm = vm * 30.44
      vm = Math.round(vm)
      total += vm
      const c = v.categoria || 'otro'
      porCat[c] = (porCat[c] || 0) + vm
      detalles.push({ origen: 'recurrente', concepto: v.concepto, valorMensual: vm })
    })
    return { totalMensualEstimado: Math.round(total), porCategoria: porCat, detalles }
  }
)
