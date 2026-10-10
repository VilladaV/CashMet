import { addDoc, collection, deleteDoc, doc, getDocs, increment, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'
import { crearMovimiento, type MovimientoInput } from './movimientosRepo'

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
  estado: EstadoDeuda
  notas?: string
  actualizado?: number
}

export const TIPOS_DEUDA: TipoDeuda[] = ['hipoteca', 'consumo', 'tarjeta', 'vehiculo', 'otro']
export const ESTADOS_DEUDA: EstadoDeuda[] = ['activa', 'pagada', 'congelada']

export async function listarDeudas(): Promise<Deuda[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.DEUDAS))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Deuda[]
}

export async function crearDeuda(d: Partial<Deuda>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.DEUDAS), limpio({ ...d, actualizado: Date.now() }))
  return ref.id
}

export async function actualizarDeuda(id: string, d: Partial<Deuda>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.DEUDAS, id), limpio({ ...d, actualizado: Date.now() }))
}

export async function eliminarDeuda(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.DEUDAS, id))
}

export async function registrarPagoDeuda(
  id: string,
  monto: number,
  fecha: string,
  cuentaBancoId?: string
): Promise<void> {
  const montoAbs = Math.abs(monto)
  await updateDoc(doc(db, COLLECTIONS.DEUDAS, id), {
    saldoPendiente: increment(-montoAbs),
    actualizado: Date.now(),
  })
  const input: MovimientoInput = {
    fecha,
    tipo: 'pago_deuda',
    concepto: 'Pago de cuota deuda',
    monto: montoAbs,
    categoria: 'deudas',
    deudaId: id,
    cuentaBancoId,
    fuente: 'manual',
  }
  await crearMovimiento(input)
}