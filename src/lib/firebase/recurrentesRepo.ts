import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'
import { crearMovimiento, listarMovimientos } from './movimientosRepo'
import { crearEvento, listarEventos } from './calendarioRepo'

export type CategoriaRecurrente = 'hogar' | 'transporte' | 'salud' | 'educacion' | 'servicios' | 'otro'
export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

export interface GastoRecurrente {
  id: string
  concepto: string
  categoria: CategoriaRecurrente
  valor: number
  periodicidad: Periodicidad
  diaVencimiento?: number
  fechaInicio?: string
  fechaFin?: string
  cuentaBancoId?: string
  autoGenerar?: boolean
  activo: boolean
  notas?: string
  actualizado?: number
}

export const CATEGORIAS_RECURRENTE: CategoriaRecurrente[] = [
  'hogar',
  'transporte',
  'salud',
  'educacion',
  'servicios',
  'otro',
]
export const PERIODICIDADES: Periodicidad[] = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual']

export async function listarRecurrentes(): Promise<GastoRecurrente[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.GASTOS_RECURRENTES))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as GastoRecurrente[]
}

export async function crearRecurrente(g: Partial<GastoRecurrente>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.GASTOS_RECURRENTES), limpio({ ...g, actualizado: Date.now() }))
  return ref.id
}

export async function actualizarRecurrente(id: string, g: Partial<GastoRecurrente>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.GASTOS_RECURRENTES, id), limpio({ ...g, actualizado: Date.now() }))
}

export async function eliminarRecurrente(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.GASTOS_RECURRENTES, id))
}

function indiceMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return y * 12 + (m - 1)
}

function tocaMes(r: GastoRecurrente, mes: string): boolean {
  const idx = indiceMes(mes)
  const base = r.fechaInicio && /^\d{4}-\d{2}/.test(r.fechaInicio) ? indiceMes(r.fechaInicio.slice(0, 7)) : null
  if (base == null) return true
  const dif = idx - base
  if (dif < 0) return false
  switch (r.periodicidad) {
    case 'mensual':
      return true
    case 'bimestral':
      return dif % 2 === 0
    case 'trimestral':
      return dif % 3 === 0
    case 'semestral':
      return dif % 6 === 0
    case 'anual':
      return dif % 12 === 0
    default:
      return true
  }
}

function fechaEnMes(mes: string, dia: number): string {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  const d = Math.min(Math.max(1, dia), ultimo)
  return `${mes}-${String(d).padStart(2, '0')}`
}

function categoriaMovimiento(c: CategoriaRecurrente): string {
  const mapa: Record<CategoriaRecurrente, string> = {
    hogar: 'Hogar',
    transporte: 'Transporte',
    salud: 'Salud',
    educacion: 'Educación',
    servicios: 'Servicios',
    otro: 'Otros',
  }
  return mapa[c] ?? 'Otros'
}

export async function generarMovimientosRecurrentes(mes: string): Promise<number> {
  const recurrentes = (await listarRecurrentes()).filter((r) => r.activo !== false && r.autoGenerar !== false)
  const existentes = await listarMovimientos(500)
  const yaGenerados = new Set(
    existentes
      .filter((m) => String(m.fecha).startsWith(mes) && m.recurrenteId)
      .map((m) => m.recurrenteId)
  )
  let creados = 0
  for (const r of recurrentes) {
    if (!tocaMes(r, mes) || yaGenerados.has(r.id)) continue
    await crearMovimiento({
      fecha: fechaEnMes(mes, Number(r.diaVencimiento) || 1),
      tipo: 'gasto',
      concepto: r.concepto,
      monto: Number(r.valor) || 0,
      categoria: categoriaMovimiento(r.categoria),
      cuentaBancoId: r.cuentaBancoId,
      recurrenteId: r.id,
      fuente: 'automatico',
    })
    creados++
  }
  return creados
}

export async function generarEventosRecurrentes(mes: string): Promise<number> {
  const recurrentes = (await listarRecurrentes()).filter((r) => r.activo !== false && Number(r.diaVencimiento) > 0)
  const existentes = await listarEventos(500)
  const yaGenerados = new Set(
    existentes
      .filter((e) => String(e.fechaInicio).startsWith(mes) && e.relacionado?.recurrenteId)
      .map((e) => e.relacionado?.recurrenteId)
  )
  let creados = 0
  for (const r of recurrentes) {
    if (!tocaMes(r, mes) || yaGenerados.has(r.id)) continue
    await crearEvento({
      titulo: `Pago ${r.concepto}`,
      descripcion: 'Gasto recurrente',
      tipo: 'recurrente',
      fechaInicio: fechaEnMes(mes, Number(r.diaVencimiento)),
      allDay: true,
      recurrente: false,
      recordatorios: [{ minutosAntes: 1440 }],
      relacionado: { recurrenteId: r.id },
    })
    creados++
  }
  return creados
}
