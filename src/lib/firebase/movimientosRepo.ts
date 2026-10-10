import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoMovimiento =
  | 'gasto'
  | 'ingreso'
  | 'transferencia'
  | 'pago_deuda'
  | 'pago_nomina'
  | 'impuesto'
  | 'seguro'
  | 'mantenimiento'
  | 'otro'

export interface MovimientoInput {
  fecha: string
  tipo: TipoMovimiento
  concepto: string
  monto: number
  categoria: string
  subcategoria?: string
  descripcion?: string
  cuentaBancoId?: string
  deudaId?: string
  vehiculoId?: string
  propiedadId?: string
  nominaId?: string
  recurrenteId?: string
  etiquetas?: string[]
  fuente?: 'chat_IA' | 'manual' | 'automatico'
}

export interface CuentaBanco {
  id: string
  nombre: string
  tipo: 'ahorros' | 'corriente' | 'digital' | 'efectivo' | 'inversion'
  saldoActual: number
  moneda?: 'COP'
  activa?: boolean
  orden?: number
}

export interface MovimientoDoc {
  id: string
  fecha: string
  tipo: TipoMovimiento
  concepto: string
  monto: number
  categoria: string
  cuentaBancoId?: string
  creado?: number
}

export async function crearMovimiento(input: MovimientoInput): Promise<string> {
  const data = limpio({
    ...input,
    etiquetas: input.etiquetas ?? [],
    fuente: input.fuente ?? 'chat_IA',
    estado: 'confirmado',
    creado: Date.now(),
    actualizado: Date.now(),
  })
  const ref = await addDoc(collection(db, COLLECTIONS.MOVIMIENTOS), data)
  if (input.cuentaBancoId) {
    const delta = input.tipo === 'ingreso' ? input.monto : -input.monto
    await setDoc(
      doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaBancoId),
      {
        saldoActual: increment(delta),
        actualizado: Date.now(),
      },
      { merge: true }
    )
  }
  return ref.id
}

export async function listarCuentasBanco(): Promise<CuentaBanco[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.CUENTAS_BANCO))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as CuentaBanco[]
}

export async function crearCuentaBanco(data: {
  nombre: string
  tipo: CuentaBanco['tipo']
  saldoActual: number
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.CUENTAS_BANCO), {
    nombre: data.nombre,
    tipo: data.tipo,
    saldoActual: data.saldoActual,
    moneda: 'COP',
    activa: true,
    orden: Date.now(),
    actualizado: Date.now(),
  })
  return ref.id
}

export async function obtenerResumenSaldos(): Promise<{ cuentas: CuentaBanco[]; total: number }> {
  const cuentas = await listarCuentasBanco()
  const total = cuentas.reduce((s, c) => s + (Number(c.saldoActual) || 0), 0)
  return { cuentas, total }
}

export async function listarMovimientos(max = 20): Promise<MovimientoDoc[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.MOVIMIENTOS), orderBy('creado', 'desc'), limit(max))
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as MovimientoDoc[]
}

export async function listarTodosLosMovimientos(max = 300): Promise<MovimientoDoc[]> {
  return listarMovimientos(max)
}

export async function actualizarCuentaBanco(id: string, data: Partial<CuentaBanco>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, id), limpio({ ...data, actualizado: Date.now() }))
}

export async function eliminarCuentaBanco(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, id))
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const documento = await getDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id))
  if (documento.exists()) {
    const datos = documento.data() as Record<string, unknown>
    const cuentaBancoId = datos.cuentaBancoId as string | undefined
    if (cuentaBancoId && typeof datos.monto === 'number') {
      const reverso = datos.tipo === 'ingreso' ? -datos.monto : datos.monto
      await setDoc(
        doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaBancoId),
        { saldoActual: increment(reverso), actualizado: Date.now() },
        { merge: true }
      )
    }
  }
  await deleteDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id))
}
