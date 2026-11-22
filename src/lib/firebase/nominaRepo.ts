import { addDoc, collection, deleteDoc, doc, getDocs, increment, runTransaction } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio, limpioUpdate } from './repoUtils'
import { hoyISO, parseFechaLocal } from '../fechas'

export type TipoContrato = 'indefinido' | 'fijo' | 'obra' | 'aprendiz'

export interface Nomina {
  id: string
  nombreCompleto: string
  cargo: string
  activo: boolean
  tipoContrato: TipoContrato
  salarioBaseMensual: number
  adicionalMensual?: number
  salarioTotalMensualEstimado?: number
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

function validarMontoNomina(valor: unknown, etiqueta: string): number {
  if (valor === undefined || valor === null || valor === '') return 0
  const crudo = Number(valor)
  if (!Number.isFinite(crudo) || crudo < 0) {
    throw new Error(`${etiqueta}: el salario y el adicional deben ser números mayores o iguales a cero`)
  }
  return Math.round(crudo)
}

export async function crearNomina(n: Partial<Nomina>): Promise<string> {
  const { id: _omitido, ...resto } = n as Record<string, unknown>
  const salarioBaseMensual = validarMontoNomina(n.salarioBaseMensual, 'salario_invalido')
  const adicionalMensual = validarMontoNomina(n.adicionalMensual, 'adicional_invalido')
  const salarioTotalMensualEstimado = totalMensualNomina({ salarioBaseMensual, adicionalMensual })
  const ref = await addDoc(
    collection(db, COLLECTIONS.NOMINA),
    limpio({ ...resto, salarioBaseMensual, adicionalMensual, salarioTotalMensualEstimado, actualizado: Date.now() })
  )
  return ref.id
}

export async function actualizarNomina(id: string, n: Partial<Nomina>): Promise<void> {
  const ref = doc(db, COLLECTIONS.NOMINA, id)
  const { id: _omitido, ...resto } = n as Record<string, unknown>

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('nomina_no_encontrada: la nómina que se quiere actualizar no existe')
    const actual = snap.data() as Record<string, unknown>

    // Se parte del documento existente para no borrar salario/adicional cuando la
    // actualización es parcial (por ejemplo, solo el nombre o el cargo).
    const salarioBaseMensual = validarMontoNomina(
      n.salarioBaseMensual !== undefined ? n.salarioBaseMensual : actual.salarioBaseMensual,
      'salario_invalido'
    )
    const adicionalMensual = validarMontoNomina(
      n.adicionalMensual !== undefined ? n.adicionalMensual : actual.adicionalMensual,
      'adicional_invalido'
    )
    const salarioTotalMensualEstimado = totalMensualNomina({ salarioBaseMensual, adicionalMensual })

    tx.update(
      ref,
      limpioUpdate({
        ...resto,
        salarioBaseMensual,
        adicionalMensual,
        salarioTotalMensualEstimado,
        actualizado: Date.now(),
      })
    )
  })
}

export async function eliminarNomina(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.NOMINA, id))
}

export type ErrorPagoNomina =
  | 'fecha_invalida'
  | 'nomina_no_encontrada'
  | 'nomina_inactiva'
  | 'monto_invalido'
  | 'sin_cuenta'
  | 'saldo_insuficiente'

export interface ResultadoPagoNomina {
  ok: boolean
  error?: ErrorPagoNomina
  movimientoId?: string
  monto?: number
  base?: number
  adicional?: number
  sinCuenta?: boolean
  saldoInsuficiente?: boolean
  saldoDisponible?: number
  cuentaNombre?: string
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
  const fecha = String(opts?.fecha ?? '').slice(0, 10) || hoyISO()
  if (!parseFechaLocal(fecha)) throw new Error('fecha_invalida: la fecha debe existir y usar el formato YYYY-MM-DD')

  const tieneOverride = opts?.montoOverride !== undefined
  if (tieneOverride) {
    const ov = Number(opts.montoOverride)
    if (!Number.isFinite(ov) || Math.round(ov) <= 0) {
      return { ok: false, error: 'monto_invalido' }
    }
  }

  return runTransaction<ResultadoPagoNomina>(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return { ok: false, error: 'nomina_no_encontrada' }
    const nomina = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as unknown as Nomina
    if (nomina.activo === false) return { ok: false, error: 'nomina_inactiva' }

    const base = Math.round(Number(nomina.salarioBaseMensual) || 0)
    const adicional = Math.round(Number(nomina.adicionalMensual) || 0)
    const monto = tieneOverride ? Math.round(Number(opts!.montoOverride)) : base + adicional
    if (monto <= 0) return { ok: false, error: 'monto_invalido' }

    const cuentaId = (opts?.cuentaBancoId ?? nomina.cuentaBancoId ?? '').trim()
    if (!cuentaId) {
      return { ok: false, error: 'sin_cuenta', sinCuenta: true, monto, base, adicional }
    }

    const cuentaRef = doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId)
    const cuentaSnap = await tx.get(cuentaRef)
    if (!cuentaSnap.exists()) return { ok: false, error: 'sin_cuenta', sinCuenta: true, monto, base, adicional }
    const cuenta = cuentaSnap.data() as Record<string, unknown>
    const saldoDisponible = Number(cuenta.saldoActual) || 0
    const cuentaNombre = String(cuenta.nombre ?? '')
    if (saldoDisponible < monto) {
      return {
        ok: false,
        error: 'saldo_insuficiente',
        saldoInsuficiente: true,
        saldoDisponible,
        cuentaNombre,
        monto,
        base,
        adicional,
      }
    }

    const descripcion = tieneOverride
      ? `Pago de nómina ajustado $${monto.toLocaleString('es-CO')} · ${nomina.cargo}`
      : adicional > 0
        ? `Salario base $${base.toLocaleString('es-CO')} + Adicional ARL/prestaciones $${adicional.toLocaleString('es-CO')} · ${nomina.cargo}`
        : `Salario base $${base.toLocaleString('es-CO')} · ${nomina.cargo}`

    const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))
    tx.set(
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
        etiquetas: !tieneOverride && adicional > 0 ? ['nomina', 'arl'] : ['nomina'],
        fuente: opts?.fuente ?? 'manual',
        estado: 'confirmado',
        creado: Date.now(),
        actualizado: Date.now(),
      })
    )
    tx.update(cuentaRef, {
      saldoActual: increment(-monto),
      actualizado: Date.now(),
    })

    return { ok: true, movimientoId: movRef.id, monto, base, adicional, cuentaNombre }
  })
}
