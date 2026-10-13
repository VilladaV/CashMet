import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'

export interface SalarioPropio {
  activo: boolean
  monto: number
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
  const salario: Record<string, unknown> = {
    activo: s.activo,
    monto: Math.round(Number(s.monto) || 0),
    dia: Math.min(31, Math.max(1, Math.round(Number(s.dia) || 1))),
  }
  if (s.cuentaBancoId) salario.cuentaBancoId = s.cuentaBancoId
  const concepto = (s.concepto ?? '').trim()
  if (concepto) salario.concepto = concepto
  await setDoc(
    doc(db, COLLECTIONS.CONFIGURACION_SISTEMA, ID_DOC),
    { salario, actualizado: Date.now() },
    { merge: true }
  )
}
