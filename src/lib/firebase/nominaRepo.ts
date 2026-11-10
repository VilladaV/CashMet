import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, updateDoc, writeBatch } from 'firebase/firestore'
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
  adicionalMensual?: number
  cuentaBancoId?: string
  autoCobrar?: boolean
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

export function totalMensualNomina(n: Pick<Nomina, 'salarioBaseMensual' | 'adicionalMensual'>): number {
  return Math.round((Number(n.salarioBaseMensual) || 0) + (Number(n.adicionalMensual) || 0))
}

export async function listarNomina(): Promise<Nomina[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.NOMINA))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Nomina[]
}

export async function crearNomina(n: Partial<Nomina>): Promise<string> {
  const salarioTotalMensualEstimado = totalMensualNomina({
    salarioBaseMensual: Number(n.salarioBaseMensual) || 0,
    adicionalMensual: Number(n.adicionalMensual) || 0,
  })
  const ref = await addDoc(
    collection(db, COLLECTIONS.NOMINA),
    limpio({ ...n, salarioTotalMensualEstimado, actualizado: Date.now() })
  )
  return ref.id
}

export async function actualizarNomina(id: string, n: Partial<Nomina>): Promise<void> {
  const salarioTotalMensualEstimado = totalMensualNomina({
    salarioBaseMensual: Number(n.salarioBaseMensual) || 0,
    adicionalMensual: Number(n.adicionalMensual) || 0,
  })
  await updateDoc(
    doc(db, COLLECTIONS.NOMINA, id),
    limpio({ ...n, salarioTotalMensualEstimado, actualizado: Date.now() })
  )
}

export async function eliminarNomina(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.NOMINA, id))
}

export interface ResultadoPagoNomina {
  ok: boolean
  movimientoId?: string
  monto?: number
  base?: number
  adicional?: number
  sinCuenta?: boolean
  saldoInsuficiente?: boolean
  saldoDisponible?: number
  cuentaNombre?: string
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function registrarPagoNomina(
  id: string,
  opts?: {
    cuentaBancoId?: string
    fecha?: string
    fuente?: 'manual' | 'automatico' | 'chat_IA'
    montoOverride?: number
  }
): Promise<ResultadoPagoNomina> {
  const ref = doc(db, COLLECTIONS.NOMINA, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { ok: false }
  const nomina = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as unknown as Nomina

  const base = Math.round(Number(nomina.salarioBaseMensual) || 0)
  const adicional = Math.round(Number(nomina.adicionalMensual) || 0)
  const monto =
    opts?.montoOverride && opts.montoOverride > 0 ? Math.round(opts.montoOverride) : base + adicional
  if (monto <= 0) return { ok: false }

  const cuentaId = (opts?.cuentaBancoId ?? nomina.cuentaBancoId ?? '').trim()
  if (!cuentaId) {
    return { ok: false, sinCuenta: true, monto, base, adicional }
  }

  const cuentaSnap = await getDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId))
  if (!cuentaSnap.exists()) return { ok: false, sinCuenta: true, monto, base, adicional }
  const cuenta = cuentaSnap.data() as Record<string, unknown>
  const saldoDisponible = Number(cuenta.saldoActual) || 0
  const cuentaNombre = String(cuenta.nombre ?? '')
  if (saldoDisponible < monto) {
    return {
      ok: false,
      saldoInsuficiente: true,
      saldoDisponible,
      cuentaNombre,
      monto,
      base,
      adicional,
    }
  }

  const fecha = String(opts?.fecha ?? '').slice(0, 10) || hoyISO()
  const descripcion =
    adicional > 0
      ? `Salario base $${base.toLocaleString('es-CO')} + Adicional ARL/prestaciones $${adicional.toLocaleString('es-CO')} · ${nomina.cargo}`
      : `Salario base $${base.toLocaleString('es-CO')} · ${nomina.cargo}`

  const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))
  const lote = writeBatch(db)
  lote.set(
    movRef,
    limpio({
      fecha,
      tipo: 'pago_nomina',
      concepto: `Pago de nómina a ${nomina.nombreCompleto}`,
      descripcion,
      monto,
      categoria: 'Nómina',
      nominaId: nomina.id,
      cuentaBancoId: cuentaId,
      etiquetas: adicional > 0 ? ['nomina', 'arl'] : ['nomina'],
      fuente: opts?.fuente ?? 'manual',
      estado: 'confirmado',
      creado: Date.now(),
      actualizado: Date.now(),
    })
  )
  lote.update(doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId), {
    saldoActual: increment(-monto),
    actualizado: Date.now(),
  })
  await lote.commit()

  return { ok: true, movimientoId: movRef.id, monto, base, adicional, cuentaNombre }
}
