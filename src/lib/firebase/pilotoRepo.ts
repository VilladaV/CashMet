import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'

export interface SalarioPropio {
  activo: boolean
  monto: number
  moneda?: string
  dia: number
  cuentaBancoId?: string
  concepto?: string
}

export interface PilotoConfig {
  salario?: SalarioPropio
  actualizado?: number
}

const ID_DOC = 'piloto'

export async function leerPiloto(): Promise<PilotoConfig> {
  const s = await getDoc(doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, ID_DOC))
  return s.exists() ? (s.data() as PilotoConfig) : {}
}

export async function guardarSalarioPropio(s: SalarioPropio): Promise<void> {
  const montoNum = Number(s.monto)
  if (!Number.isFinite(montoNum) || montoNum < 0) {
    throw new Error('monto_invalido: el monto del salario debe ser un número mayor o igual a cero')
  }
  const moneda = String(s.moneda ?? 'COP').trim().toUpperCase() || 'COP'
  const salario: Record<string, unknown> = {
    activo: Boolean(s.activo),
    monto: Math.round(montoNum),
    moneda,
    dia: Math.min(31, Math.max(1, Math.round(Number(s.dia) || 1))),
  }
  const cuentaId = String(s.cuentaBancoId ?? '').trim()
  if (cuentaId) salario.cuentaBancoId = cuentaId
  const concepto = String(s.concepto ?? '').trim()
  if (concepto) salario.concepto = concepto
  await setDoc(
    doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, ID_DOC),
    { salario, actualizado: Date.now() },
    { mergeFields: ['salario', 'actualizado'] }
  )
}
