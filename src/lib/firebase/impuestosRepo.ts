import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoImpuesto = 'predial' | 'vehicular' | 'renta' | 'ica' | 'predial_bimestral' | 'otro'

export type PeriodicidadImpuesto = 'anual' | 'semestral' | 'bimestral' | 'trimestral' | 'mensual' | 'unico'

export interface Impuesto {
  id: string
  nombre: string
  tipo: TipoImpuesto
  entidad?: string
  valor: number
  periodicidad: PeriodicidadImpuesto
  fechaVencimiento?: string
  pagado: boolean
  notas?: string
  actualizado?: number
}

export const TIPOS_IMPUESTO: TipoImpuesto[] = ['predial', 'predial_bimestral', 'vehicular', 'renta', 'ica', 'otro']

export const PERIODICIDADES_IMPUESTO: PeriodicidadImpuesto[] = [
  'anual',
  'semestral',
  'bimestral',
  'trimestral',
  'mensual',
  'unico',
]

export async function listarImpuestos(): Promise<Impuesto[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.IMPUESTOS))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Impuesto[]
}

export async function crearImpuesto(i: Partial<Impuesto>): Promise<string> {
  const ref = await addDoc(
    collection(db, COLLECTIONS.IMPUESTOS),
    limpio({ ...i, pagado: i.pagado ?? false, actualizado: Date.now() })
  )
  return ref.id
}

export async function actualizarImpuesto(id: string, data: Partial<Impuesto>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.IMPUESTOS, id), limpio({ ...data, actualizado: Date.now() }))
}

export async function eliminarImpuesto(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.IMPUESTOS, id))
}
