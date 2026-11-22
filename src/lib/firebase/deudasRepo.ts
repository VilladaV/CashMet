import { addDoc, collection, deleteDoc, doc, getDocs, increment, runTransaction, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio, limpioUpdate } from './repoUtils'
import { datosMovimiento } from './movimientosRepo'
import { parseFechaLocal } from '../fechas'

export type TipoDeuda = 'hipoteca' | 'consumo' | 'tarjeta' | 'vehiculo' | 'otro'
export type EstadoDeuda = 'activa' | 'pagada' | 'congelada'

export interface Deuda {
  id: string
  nombre: string
  tipo: TipoDeuda
  entidad?: string
  montoInicial?: number
  saldoPendiente: number
  cuotaMensual?: number
  tasaInteres?: number
  fechaVencimientoCuota?: number
  cuentaBancoId?: string
  autoDescontar?: boolean
  estado: EstadoDeuda
  notas?: string
  actualizado?: number
}

export const TIPOS_DEUDA: TipoDeuda[] = ['hipoteca', 'consumo', 'tarjeta', 'vehiculo', 'otro']
export const ESTADOS_DEUDA: EstadoDeuda[] = ['activa', 'pagada', 'congelada']

export type ErrorPagoDeuda =
  | 'monto_invalido'
  | 'fecha_invalida'
  | 'deuda_no_encontrada'
  | 'deuda_pagada'
  | 'deuda_congelada'
  | 'monto_excede_saldo'
  | 'cuenta_no_encontrada'
  | 'saldo_insuficiente'

export type ResultadoPagoDeuda =
  | {
      ok: true
      saldoPendiente: number
      cerrada: boolean
      movimientoId: string
    }
  | {
      ok: false
      error: ErrorPagoDeuda
      saldoPendiente?: number
      saldoDisponible?: number
    }

export async function listarDeudas(): Promise<Deuda[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.DEUDAS))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Deuda[]
}

export async function crearDeuda(d: Partial<Deuda>): Promise<string> {
  const { id: _omitido, ...resto } = d as Record<string, unknown>
  if (resto.saldoPendiente !== undefined && resto.saldoPendiente !== null) {
    const s = Number(resto.saldoPendiente)
    resto.saldoPendiente = Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0
  }
  const ref = await addDoc(collection(db, COLLECTIONS.DEUDAS), limpio({ ...resto, actualizado: Date.now() }))
  return ref.id
}

export async function actualizarDeuda(id: string, d: Partial<Deuda>): Promise<void> {
  const { id: _omitido, ...resto } = d as Record<string, unknown>
  if (resto.saldoPendiente !== undefined && resto.saldoPendiente !== null) {
    const s = Number(resto.saldoPendiente)
    resto.saldoPendiente = Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0
  }
  await updateDoc(doc(db, COLLECTIONS.DEUDAS, id), limpioUpdate({ ...resto, actualizado: Date.now() }))
}

export async function eliminarDeuda(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.DEUDAS, id))
}

/**
 * Registra un pago de deuda de forma atómica: valida el saldo pendiente y los
 * fondos de la cuenta, actualiza la deuda, descuenta la cuenta y crea el
 * movimiento dentro de una sola transacción.
 */
export async function registrarPagoDeuda(
  id: string,
  monto: number,
  fecha: string,
  cuentaBancoId?: string,
  fuente: 'manual' | 'automatico' | 'chat_IA' = 'manual'
): Promise<ResultadoPagoDeuda> {
  const montoAbs = Math.round(Number(monto))
  if (!Number.isFinite(montoAbs) || montoAbs <= 0) return { ok: false, error: 'monto_invalido' }
  if (!parseFechaLocal(fecha)) return { ok: false, error: 'fecha_invalida' }
  if (!id) return { ok: false, error: 'deuda_no_encontrada' }

  const deudaRef = doc(db, COLLECTIONS.DEUDAS, id)
  const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))

  return runTransaction<ResultadoPagoDeuda>(db, async (tx) => {
    const deudaSnap = await tx.get(deudaRef)
    if (!deudaSnap.exists()) return { ok: false, error: 'deuda_no_encontrada' }

    const deuda = deudaSnap.data() as Record<string, unknown>
    const saldoActual = Math.round(Number(deuda.saldoPendiente) || 0)
    if (deuda.estado === 'congelada') {
      return { ok: false, error: 'deuda_congelada', saldoPendiente: saldoActual }
    }
    if (deuda.estado === 'pagada' || saldoActual <= 0) {
      return { ok: false, error: 'deuda_pagada', saldoPendiente: saldoActual }
    }
    if (montoAbs > saldoActual) {
      return { ok: false, error: 'monto_excede_saldo', saldoPendiente: saldoActual }
    }

    const cuentaRef = cuentaBancoId ? doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaBancoId) : null
    if (cuentaRef) {
      const cuentaSnap = await tx.get(cuentaRef)
      if (!cuentaSnap.exists()) return { ok: false, error: 'cuenta_no_encontrada', saldoPendiente: saldoActual }
      const saldoCuenta = Number(cuentaSnap.data()?.saldoActual) || 0
      if (saldoCuenta < montoAbs) {
        return { ok: false, error: 'saldo_insuficiente', saldoPendiente: saldoActual, saldoDisponible: saldoCuenta }
      }
    }

    const nombreDeuda = String(deuda.nombre ?? '').trim()
    const datos = datosMovimiento({
      fecha,
      tipo: 'pago_deuda',
      concepto: nombreDeuda ? `Pago de cuota ${nombreDeuda}` : 'Pago de cuota deuda',
      monto: montoAbs,
      categoria: 'Deudas',
      deudaId: id,
      cuentaBancoId,
      fuente,
    })

    if (cuentaRef) {
      tx.update(cuentaRef, { saldoActual: increment(-montoAbs), actualizado: Date.now() })
    }

    const nuevoSaldo = Math.max(0, saldoActual - montoAbs)
    const cerrada = nuevoSaldo <= 0
    tx.update(deudaRef, {
      saldoPendiente: nuevoSaldo,
      estado: cerrada ? 'pagada' : (deuda.estado as EstadoDeuda) || 'activa',
      actualizado: Date.now(),
    })
    tx.set(movRef, datos)

    return { ok: true, saldoPendiente: nuevoSaldo, cerrada, movimientoId: movRef.id }
  })
}
