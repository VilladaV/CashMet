import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoPropiedad = 'vivienda' | 'comercial' | 'terreno' | 'otro'

export interface Propiedad {
  id: string
  nombre: string
  direccion?: string
  tipo: TipoPropiedad
  valorComercialEstimado?: number
  valorPatrimonial?: number
  gastosMensualesFijos?: Array<{ concepto: string; valor: number }>
  impuestos?: {
    predial?: {
      vigente?: boolean
      fechaVencimiento?: string
      valorAnual?: number
      municipio?: string
      fuente?: string
    }
  }
  gastosMensualesCalculados?: number
  notas?: string
  actualizado?: number
}

export const TIPOS_PROPIEDAD: TipoPropiedad[] = ['vivienda', 'comercial', 'terreno', 'otro']

export async function listarPropiedades(): Promise<Propiedad[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.PROPIEDADES))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Propiedad[]
}

export async function crearPropiedad(p: Partial<Propiedad>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.PROPIEDADES), limpio({ ...p, actualizado: Date.now() }))
  return ref.id
}

export async function actualizarPropiedad(id: string, p: Partial<Propiedad>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.PROPIEDADES, id), limpio({ ...p, actualizado: Date.now() }))
}

export async function eliminarPropiedad(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.PROPIEDADES, id))
}