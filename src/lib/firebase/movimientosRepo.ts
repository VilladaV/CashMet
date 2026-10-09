import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'

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
  const ref = await addDoc(collection(db, COLLECTIONS.MOVIMIENTOS), {
    ...input,
    etiquetas: input.etiquetas ?? [],
    fuente: input.fuente ?? 'chat_IA',
    estado: 'confirmado',
    creado: Date.now(),
    actualizado: Date.now(),
  })
  if (input.cuentaBancoId) {
    const delta = input.tipo === 'ingreso' ? input.monto : -input.monto
    await updateDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaBancoId), {
      saldoActual: increment(delta),
      actualizado: Date.now(),
    })
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
