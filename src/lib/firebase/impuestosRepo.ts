import { addDoc, collection, deleteDoc, doc, getDocs, increment, runTransaction, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'
import { hoyISO, parseFechaLocal } from '../fechas'

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
  autoPagar?: boolean
  cuentaBancoId?: string
  fechaPago?: string
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

export interface ResultadoPagoImpuesto {
  ok: boolean
  movimientoId?: string
  monto?: number
  yaPagado?: boolean
  saldoInsuficiente?: boolean
  saldoDisponible?: number
  cuentaNombre?: string
}

export async function registrarPagoImpuesto(
  id: string,
  opts?: { cuentaBancoId?: string; fecha?: string; fuente?: 'manual' | 'automatico' | 'chat_IA' }
): Promise<ResultadoPagoImpuesto> {
  const ref = doc(db, COLLECTIONS.IMPUESTOS, id)
  const fecha = String(opts?.fecha ?? '').slice(0, 10) || hoyISO()
  if (!parseFechaLocal(fecha)) throw new Error('fecha_invalida: la fecha debe existir y usar el formato YYYY-MM-DD')

  return runTransaction<ResultadoPagoImpuesto>(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return { ok: false }
    const impuesto = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as unknown as Impuesto
    if (impuesto.pagado) return { ok: false, yaPagado: true }

    const monto = Math.round(Number(impuesto.valor) || 0)
    if (monto <= 0) return { ok: false }

    const cuentaId = opts?.cuentaBancoId ?? impuesto.cuentaBancoId
    let saldoDisponible: number | undefined
    let cuentaNombre: string | undefined
    let cuentaRef: ReturnType<typeof doc> | null = null

    if (cuentaId) {
      cuentaRef = doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId)
      const cuentaSnap = await tx.get(cuentaRef)
      if (!cuentaSnap.exists()) return { ok: false }
      const cuenta = cuentaSnap.data() as Record<string, unknown>
      saldoDisponible = Number(cuenta.saldoActual) || 0
      cuentaNombre = String(cuenta.nombre ?? '')
      if (saldoDisponible < monto) {
        return { ok: false, saldoInsuficiente: true, saldoDisponible, cuentaNombre, monto }
      }
    }

    const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))
    tx.set(
      movRef,
      limpio({
        fecha,
        tipo: 'impuesto',
        concepto: `Pago de ${impuesto.nombre}`,
        descripcion: impuesto.entidad ? `Impuesto ${impuesto.tipo} · ${impuesto.entidad}` : `Impuesto ${impuesto.tipo}`,
        monto,
        categoria: 'Impuestos',
        impuestoId: impuesto.id,
        cuentaBancoId: cuentaId,
        etiquetas: [],
        fuente: opts?.fuente ?? 'manual',
        estado: 'confirmado',
        creado: Date.now(),
        actualizado: Date.now(),
      })
    )
    tx.update(ref, { pagado: true, fechaPago: fecha, actualizado: Date.now() })
    if (cuentaRef) {
      tx.update(cuentaRef, { saldoActual: increment(-monto), actualizado: Date.now() })
    }

    return { ok: true, movimientoId: movRef.id, monto }
  })
}
