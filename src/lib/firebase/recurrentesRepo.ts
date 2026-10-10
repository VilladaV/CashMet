import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type CategoriaRecurrente = 'hogar' | 'transporte' | 'salud' | 'educacion' | 'servicios' | 'otro'
export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

export interface GastoRecurrente {
  id: string
  concepto: string
  categoria: CategoriaRecurrente
  valor: number
  periodicidad: Periodicidad
  diaVencimiento?: number
  activo: boolean
  notas?: string
  actualizado?: number
}

export const CATEGORIAS_RECURRENTE: CategoriaRecurrente[] = [
  'hogar',
  'transporte',
  'salud',
  'educacion',
  'servicios',
  'otro',
]
export const PERIODICIDADES: Periodicidad[] = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual']

export async function listarRecurrentes(): Promise<GastoRecurrente[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.GASTOS_RECURRENTES))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as GastoRecurrente[]
}

export async function crearRecurrente(g: Partial<GastoRecurrente>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.GASTOS_RECURRENTES), limpio({ ...g, actualizado: Date.now() }))
  return ref.id
}

export async function actualizarRecurrente(id: string, g: Partial<GastoRecurrente>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.GASTOS_RECURRENTES, id), limpio({ ...g, actualizado: Date.now() }))
}

export async function eliminarRecurrente(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.GASTOS_RECURRENTES, id))
}