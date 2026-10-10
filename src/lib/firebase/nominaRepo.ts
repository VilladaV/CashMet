import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoContrato = 'indefinido' | 'fijo' | 'obra' | 'aprendiz'

export interface Nomina {
  id: string
  nombreCompleto: string
  cargo: string
  activo: boolean
  tipoContrato: TipoContrato
  salarioBaseMensual: number
  primaServicios?: {
    aplica: boolean
    mitadJulio: boolean
    mitadDiciembre: boolean
  }
  fechaPago?: { dia: number; tipo: 'mensual' | 'quincenal' | 'semanal' }
  notas?: string
  actualizado?: number
}

export const TIPOS_CONTRATO: TipoContrato[] = ['indefinido', 'fijo', 'obra', 'aprendiz']

export async function listarNomina(): Promise<Nomina[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.NOMINA))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Nomina[]
}

export async function crearNomina(n: Partial<Nomina>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.NOMINA), limpio({ ...n, actualizado: Date.now() }))
  return ref.id
}

export async function actualizarNomina(id: string, n: Partial<Nomina>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.NOMINA, id), limpio({ ...n, actualizado: Date.now() }))
}

export async function eliminarNomina(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.NOMINA, id))
}