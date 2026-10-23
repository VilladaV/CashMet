import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
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
  cuentaDestinoId?: string
  deudaId?: string
  vehiculoId?: string
  propiedadId?: string
  nominaId?: string
  impuestoId?: string
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
  subcategoria?: string
  descripcion?: string
  cuentaBancoId?: string
  cuentaDestinoId?: string
  deudaId?: string
  vehiculoId?: string
  propiedadId?: string
  nominaId?: string
  impuestoId?: string
  recurrenteId?: string
  etiquetas?: string[]
  creado?: number
}

export interface MovimientoUpdate {
  fecha: string
  tipo: TipoMovimiento
  concepto: string
  monto: number
  categoria: string
  subcategoria?: string
  descripcion?: string
  cuentaBancoId?: string
  cuentaDestinoId?: string
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
  if (input.tipo === 'transferencia' && input.cuentaDestinoId) {
    await setDoc(
      doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaDestinoId),
      {
        saldoActual: increment(input.monto),
        actualizado: Date.now(),
      },
      { merge: true }
    )
  }
  return ref.id
}

export type ErrorTransferencia =
  | 'monto_invalido'
  | 'misma_cuenta'
  | 'cuenta_no_encontrada'
  | 'saldo_insuficiente'

export interface EntradaTransferencia {
  origenId: string
  destinoId: string
  monto: number
  fecha: string
  concepto?: string
  fuente?: 'chat_IA' | 'manual' | 'automatico'
}

export type ResultadoTransferencia =
  | {
      ok: true
      movimientoId: string
      origen: CuentaBanco
      destino: CuentaBanco
    }
  | {
      ok: false
      error: ErrorTransferencia
      saldoDisponible?: number
      nombreOrigen?: string
    }

export async function transferirEntreCuentas(input: EntradaTransferencia): Promise<ResultadoTransferencia> {
  const monto = Math.round(Number(input.monto) || 0)
  if (monto <= 0) return { ok: false, error: 'monto_invalido' }
  if (!input.origenId || !input.destinoId) return { ok: false, error: 'cuenta_no_encontrada' }
  if (input.origenId === input.destinoId) return { ok: false, error: 'misma_cuenta' }

  const origenRef = doc(db, COLLECTIONS.CUENTAS_BANCO, input.origenId)
  const destinoRef = doc(db, COLLECTIONS.CUENTAS_BANCO, input.destinoId)
  const [origenSnap, destinoSnap] = await Promise.all([getDoc(origenRef), getDoc(destinoRef)])
  if (!origenSnap.exists() || !destinoSnap.exists()) return { ok: false, error: 'cuenta_no_encontrada' }

  const origen = { id: origenSnap.id, ...(origenSnap.data() as Record<string, unknown>) } as unknown as CuentaBanco
  const destino = { id: destinoSnap.id, ...(destinoSnap.data() as Record<string, unknown>) } as unknown as CuentaBanco
  const saldoOrigen = Number(origen.saldoActual) || 0
  if (saldoOrigen < monto) {
    return { ok: false, error: 'saldo_insuficiente', saldoDisponible: saldoOrigen, nombreOrigen: origen.nombre }
  }

  const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))
  const movimiento = limpio({
    fecha: input.fecha,
    tipo: 'transferencia',
    concepto: input.concepto?.trim() || `Transferencia de ${origen.nombre} a ${destino.nombre}`,
    descripcion: `De ${origen.nombre} a ${destino.nombre}`,
    monto,
    categoria: 'Transferencia',
    cuentaBancoId: origen.id,
    cuentaDestinoId: destino.id,
    etiquetas: [],
    fuente: input.fuente ?? 'chat_IA',
    estado: 'confirmado',
    creado: Date.now(),
    actualizado: Date.now(),
  })

  const lote = writeBatch(db)
  lote.set(movRef, movimiento)
  lote.update(origenRef, { saldoActual: increment(-monto), actualizado: Date.now() })
  lote.update(destinoRef, { saldoActual: increment(monto), actualizado: Date.now() })
  await lote.commit()

  return {
    ok: true,
    movimientoId: movRef.id,
    origen: { ...origen, saldoActual: saldoOrigen - monto },
    destino: { ...destino, saldoActual: (Number(destino.saldoActual) || 0) + monto },
  }
}

export async function actualizarMovimiento(id: string, input: MovimientoUpdate): Promise<void> {
  const ref = doc(db, COLLECTIONS.MOVIMIENTOS, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const viejo = snap.data() as Record<string, unknown>
  const cuentaVieja = viejo.cuentaBancoId as string | undefined
  const destinoViejo = viejo.cuentaDestinoId as string | undefined
  const montoViejo = Number(viejo.monto) || 0
  const tipoViejo = viejo.tipo as TipoMovimiento
  if (cuentaVieja) {
    const reverso = tipoViejo === 'ingreso' ? -montoViejo : montoViejo
    await setDoc(
      doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaVieja),
      { saldoActual: increment(reverso), actualizado: Date.now() },
      { merge: true }
    )
  }
  if (tipoViejo === 'transferencia' && destinoViejo) {
    await setDoc(
      doc(db, COLLECTIONS.CUENTAS_BANCO, destinoViejo),
      { saldoActual: increment(-montoViejo), actualizado: Date.now() },
      { merge: true }
    )
  }
  if (input.cuentaBancoId) {
    const delta = input.tipo === 'ingreso' ? input.monto : -input.monto
    await setDoc(
      doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaBancoId),
      { saldoActual: increment(delta), actualizado: Date.now() },
      { merge: true }
    )
  }
  const destinoNuevo = input.tipo === 'transferencia' ? input.cuentaDestinoId ?? destinoViejo : undefined
  if (destinoNuevo) {
    await setDoc(
      doc(db, COLLECTIONS.CUENTAS_BANCO, destinoNuevo),
      { saldoActual: increment(input.monto), actualizado: Date.now() },
      { merge: true }
    )
  }
  await updateDoc(
    ref,
    limpio({
      ...input,
      cuentaDestinoId: destinoNuevo ?? deleteField(),
      actualizado: Date.now(),
    })
  )
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
    const cuentaDestinoId = datos.cuentaDestinoId as string | undefined
    if (cuentaBancoId && typeof datos.monto === 'number') {
      const reverso = datos.tipo === 'ingreso' ? -datos.monto : datos.monto
      await setDoc(
        doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaBancoId),
        { saldoActual: increment(reverso), actualizado: Date.now() },
        { merge: true }
      )
    }
    if (datos.tipo === 'transferencia' && cuentaDestinoId && typeof datos.monto === 'number') {
      await setDoc(
        doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaDestinoId),
        { saldoActual: increment(-datos.monto), actualizado: Date.now() },
        { merge: true }
      )
    }
  }
  await deleteDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id))
}
