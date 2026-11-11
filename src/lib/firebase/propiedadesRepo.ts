import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'
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
  const ref = doc(db, COLLECTIONS.PROPIEDADES, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('propiedad_no_encontrada: la propiedad que se quiere actualizar no existe')
  const actual = snap.data() as Record<string, unknown>

  const payload: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(p)) {
    if (clave === 'impuestos' || clave === 'id') continue
    payload[clave] = valor === null ? deleteField() : valor
  }

  if (p.impuestos === null) {
    payload.impuestos = deleteField()
  } else if (p.impuestos !== undefined) {
    // Los bloques anidados se mezclan con lo existente para no perder datos
    // (por ejemplo, el municipio del predial) al editar un solo campo.
    const actuales = (actual.impuestos ?? {}) as Record<string, unknown>
    const cambios = p.impuestos as Record<string, unknown>
    const combinado: Record<string, unknown> = { ...actuales, ...cambios }
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) delete combinado[clave]
    }
    const predialActual = actuales.predial as Record<string, unknown> | undefined
    if (cambios.predial && typeof cambios.predial === 'object' && !Array.isArray(cambios.predial)) {
      combinado.predial = { ...(predialActual ?? {}), ...(cambios.predial as Record<string, unknown>) }
    } else if (cambios.predial === null) {
      delete combinado.predial
    }
    payload.impuestos = combinado
  }

  await updateDoc(ref, limpio({ ...payload, actualizado: Date.now() }))
}

export async function eliminarPropiedad(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.PROPIEDADES, id))
}
