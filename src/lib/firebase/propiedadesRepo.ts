import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, runTransaction } from 'firebase/firestore'
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

function calcularGastosMensualesPropiedad(p: {
  gastosMensualesFijos?: Array<{ concepto: string; valor: number }> | null
  impuestos?: { predial?: { valorAnual?: number } | null } | null
}): number {
  const fijos = Array.isArray(p.gastosMensualesFijos)
    ? p.gastosMensualesFijos.reduce((s, g) => {
        const v = Number(g?.valor)
        return s + (Number.isFinite(v) && v > 0 ? v : 0)
      }, 0)
    : 0
  const predialAnual = Number(p.impuestos?.predial?.valorAnual)
  const predialMensual = Number.isFinite(predialAnual) && predialAnual > 0 ? predialAnual / 12 : 0
  return Math.round(fijos + predialMensual)
}

export async function listarPropiedades(): Promise<Propiedad[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.PROPIEDADES))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Propiedad[]
}

export async function crearPropiedad(p: Partial<Propiedad>): Promise<string> {
  const { id: _omitido, ...resto } = p as Record<string, unknown>
  const gastosMensualesCalculados = calcularGastosMensualesPropiedad(p)
  const ref = await addDoc(
    collection(db, COLLECTIONS.PROPIEDADES),
    limpio({ ...resto, gastosMensualesCalculados, actualizado: Date.now() })
  )
  return ref.id
}

export async function actualizarPropiedad(id: string, p: Partial<Propiedad>): Promise<void> {
  const ref = doc(db, COLLECTIONS.PROPIEDADES, id)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('propiedad_no_encontrada: la propiedad que se quiere actualizar no existe')
    const actual = snap.data() as Record<string, unknown>

    const payload: Record<string, unknown> = {}
    for (const [clave, valor] of Object.entries(p)) {
      if (clave === 'impuestos' || clave === 'id') continue
      payload[clave] = valor === null ? deleteField() : valor
    }

    let impuestosFinal = actual.impuestos as Propiedad['impuestos'] | undefined

    if (p.impuestos === null) {
      payload.impuestos = deleteField()
      impuestosFinal = undefined
    } else if (p.impuestos !== undefined) {
      // Los bloques anidados se mezclan con lo existente para no perder datos
      // (por ejemplo, el municipio del predial) al editar un solo campo.
      const actuales = (actual.impuestos ?? {}) as Record<string, unknown>
      const cambios = p.impuestos as Record<string, unknown>
      const combinado: Record<string, unknown> = { ...actuales, ...cambios }
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') delete combinado[clave]
      }
      const predialActual = actuales.predial as Record<string, unknown> | undefined
      if (cambios.predial && typeof cambios.predial === 'object' && !Array.isArray(cambios.predial)) {
        const predialCombinado: Record<string, unknown> = {
          ...(predialActual ?? {}),
          ...(cambios.predial as Record<string, unknown>),
        }
        for (const [k, v] of Object.entries(predialCombinado)) {
          if (v === null || v === '' || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) {
            delete predialCombinado[k]
          }
        }
        if (Object.keys(predialCombinado).length > 0) {
          combinado.predial = predialCombinado
        } else {
          delete combinado.predial
        }
      } else if (cambios.predial === null) {
        delete combinado.predial
      }

      if (Object.keys(combinado).length === 0) {
        payload.impuestos = deleteField()
        impuestosFinal = undefined
      } else {
        payload.impuestos = combinado
        impuestosFinal = combinado as Propiedad['impuestos']
      }
    }

    const gastosFijosFinal =
      p.gastosMensualesFijos === null
        ? undefined
        : p.gastosMensualesFijos !== undefined
          ? p.gastosMensualesFijos
          : (actual.gastosMensualesFijos as Propiedad['gastosMensualesFijos'])

    const gastosMensualesCalculados = calcularGastosMensualesPropiedad({
      gastosMensualesFijos: gastosFijosFinal,
      impuestos: impuestosFinal,
    })

    tx.update(ref, limpio({ ...payload, gastosMensualesCalculados, actualizado: Date.now() }))
  })
}

export async function eliminarPropiedad(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.PROPIEDADES, id))
}
