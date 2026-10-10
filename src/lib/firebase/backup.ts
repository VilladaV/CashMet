import { collection, doc, getDocs, setDoc, type DocumentData } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'

const COLECCIONES = [
  COLLECTIONS.CUENTAS_BANCO,
  COLLECTIONS.DEUDAS,
  COLLECTIONS.VEHICULOS,
  COLLECTIONS.PROPIEDADES,
  COLLECTIONS.NOMINA,
  COLLECTIONS.GASTOS_RECURRENTES,
  COLLECTIONS.MOVIMIENTOS,
  COLLECTIONS.CALENDARIO_EVENTOS,
  COLLECTIONS.CONFIGURACION_SISTEMA,
  COLLECTIONS.RESUMENES_MENSUALES,
]

export async function exportarBackup(): Promise<{ nombre: string; contenido: string }> {
  const copia: Record<string, unknown[]> = {}
  for (const col of COLECCIONES) {
    const snap = await getDocs(collection(db, col))
    copia[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  const fecha = new Date().toISOString().slice(0, 10)
  return {
    nombre: `cashmet-backup-${fecha}.json`,
    contenido: JSON.stringify({ generado: new Date().toISOString(), app: 'CashMet', copia }, null, 2),
  }
}

export async function importarBackup(jsonText: string): Promise<number> {
  const data = JSON.parse(jsonText)
  const copia: Record<string, Array<Record<string, unknown>>> = data?.copia ?? data
  let total = 0
  for (const col of Object.keys(copia)) {
    const docs = copia[col]
    if (!Array.isArray(docs)) continue
    for (const d of docs) {
      if (!d || !d.id) continue
      const { id, ...resto } = d
      await setDoc(doc(db, col, String(id)), resto as DocumentData)
      total++
    }
  }
  return total
}