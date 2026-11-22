import { addDoc, collection, deleteDoc, doc, getDocs, increment, runTransaction } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio, limpioUpdate } from './repoUtils'
import { datosMovimiento, listarCuentasBanco, listarTodosLosMovimientos } from './movimientosRepo'
import { crearEvento, listarEventos } from './calendarioRepo'
import { isoLocal } from '../fechas'

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
  creado?: number
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

function validarRangoFechas(inicio?: unknown, fin?: unknown): void {
  const ini = typeof inicio === 'string' ? inicio.trim().slice(0, 10) : ''
  const fn = typeof fin === 'string' ? fin.trim().slice(0, 10) : ''
  if (ini && fn && /^\d{4}-\d{2}-\d{2}$/.test(ini) && /^\d{4}-\d{2}-\d{2}$/.test(fn) && fn < ini) {
    throw new Error('rango_fechas_invalido: la fecha de fin no puede ser anterior a la fecha de inicio')
  }
}

export async function listarRecurrentes(): Promise<GastoRecurrente[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.GASTOS_RECURRENTES))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as GastoRecurrente[]
}

export async function crearRecurrente(g: Partial<GastoRecurrente>): Promise<string> {
  const { id: _omitido, ...resto } = g as Record<string, unknown>
  validarRangoFechas(g.fechaInicio, g.fechaFin)
  const ahora = Date.now()
  const ref = await addDoc(
    collection(db, COLLECTIONS.GASTOS_RECURRENTES),
    limpio({ ...resto, creado: ahora, actualizado: ahora })
  )
  return ref.id
}

export async function actualizarRecurrente(id: string, g: Partial<GastoRecurrente>): Promise<void> {
  const { id: _omitido, ...resto } = g as Record<string, unknown>
  const ref = doc(db, COLLECTIONS.GASTOS_RECURRENTES, id)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('recurrente_no_encontrado: el gasto recurrente que se quiere actualizar no existe')
    }
    const actual = snap.data() as Record<string, unknown>
    const inicioFinal = resto.fechaInicio === null ? undefined : (resto.fechaInicio ?? actual.fechaInicio)
    const finFinal = resto.fechaFin === null ? undefined : (resto.fechaFin ?? actual.fechaFin)
    validarRangoFechas(inicioFinal, finFinal)
    tx.update(ref, limpioUpdate({ ...resto, actualizado: Date.now() }))
  })
}

export async function eliminarRecurrente(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.GASTOS_RECURRENTES, id))
}

function indiceMes(mes: string): number {
  if (!/^\d{4}-\d{2}$/.test(mes)) return Number.NaN
  const [y, m] = mes.split('-').map(Number)
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return Number.NaN
  return y * 12 + (m - 1)
}

function tocaMes(r: GastoRecurrente, mes: string): boolean {
  const idx = indiceMes(mes)
  if (!Number.isFinite(idx)) return false

  let base: number | null =
    r.fechaInicio && /^\d{4}-\d{2}/.test(r.fechaInicio) ? indiceMes(r.fechaInicio.slice(0, 7)) : null
  if (base != null && !Number.isFinite(base)) return false

  if (base == null && r.periodicidad !== 'mensual') {
    const refTs =
      typeof r.creado === 'number' && Number.isFinite(r.creado)
        ? r.creado
        : typeof r.actualizado === 'number' && Number.isFinite(r.actualizado)
          ? r.actualizado
          : null
    if (refTs !== null) {
      base = indiceMes(isoLocal(new Date(refTs)).slice(0, 7))
    }
  }

  const fin = r.fechaFin && /^\d{4}-\d{2}/.test(r.fechaFin) ? indiceMes(r.fechaFin.slice(0, 7)) : null
  if (fin != null && !Number.isFinite(fin)) return false
  if (fin != null && idx > fin) return false
  if (base == null) return r.periodicidad === 'mensual' || !r.periodicidad
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
  const d = Math.min(Math.max(1, Math.round(dia)), ultimo)
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
  if (!Number.isFinite(indiceMes(mes))) return 0
  const [recurrentesRaw, existentes, cuentas] = await Promise.all([
    listarRecurrentes(),
    listarTodosLosMovimientos(),
    listarCuentasBanco().catch(() => []),
  ])
  const recurrentes = recurrentesRaw.filter((r) => r.activo !== false && r.autoGenerar !== false)
  const cuentaUnicaId = cuentas.length === 1 ? cuentas[0].id : undefined
  const yaGenerados = new Set(
    existentes
      .filter((m) => m.estado !== 'anulado' && String(m.fecha).startsWith(mes) && m.recurrenteId)
      .map((m) => m.recurrenteId)
  )
  let creados = 0
  for (const r of recurrentes) {
    if (!tocaMes(r, mes) || yaGenerados.has(r.id)) continue
    const valor = Math.round(Number(r.valor))
    if (!Number.isFinite(valor) || valor <= 0) continue
    const cuentaId = r.cuentaBancoId || cuentaUnicaId
    if (!cuentaId) continue
    try {
      const movId = `rec_${r.id}_${mes}`
      const movRef = doc(db, COLLECTIONS.MOVIMIENTOS, movId)
      const cuentaRef = doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId)
      const data = datosMovimiento({
        fecha: fechaEnMes(mes, Number(r.diaVencimiento) || 1),
        tipo: 'gasto',
        concepto: r.concepto,
        monto: valor,
        categoria: categoriaMovimiento(r.categoria),
        cuentaBancoId: cuentaId,
        recurrenteId: r.id,
        fuente: 'automatico',
      })
      const creado = await runTransaction(db, async (tx) => {
        const [movSnap, cuentaSnap] = await Promise.all([tx.get(movRef), tx.get(cuentaRef)])
        if (movSnap.exists() || !cuentaSnap.exists()) return false
        tx.update(cuentaRef, { saldoActual: increment(-valor), actualizado: Date.now() })
        tx.set(movRef, data)
        return true
      })
      if (creado) {
        yaGenerados.add(r.id)
        creados++
      }
    } catch {
      /* aislar fallo individual sin abortar el resto */
    }
  }
  return creados
}

export async function generarEventosRecurrentes(mes: string): Promise<number> {
  if (!Number.isFinite(indiceMes(mes))) return 0
  const recurrentes = (await listarRecurrentes()).filter(
    (r) => r.activo !== false && r.autoGenerar !== false && Number(r.diaVencimiento) > 0
  )
  const existentes = await listarEventos(2000, { desde: `${mes}-01` })
  const yaGenerados = new Set(
    existentes
      .filter((e) => String(e.fechaInicio).startsWith(mes) && e.relacionado?.recurrenteId)
      .map((e) => e.relacionado?.recurrenteId)
  )
  let creados = 0
  for (const r of recurrentes) {
    if (!tocaMes(r, mes) || yaGenerados.has(r.id)) continue
    try {
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
      yaGenerados.add(r.id)
      creados++
    } catch {
      /* aislar fallo individual sin abortar el resto */
    }
  }
  return creados
}
