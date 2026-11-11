import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'
import { hoyISO, parseFechaLocal } from '../fechas'

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
  hora?: string
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
  estado?: 'confirmado' | 'pendiente' | 'anulado'
  notasIA?: string
  creado?: number
  actualizado?: number
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

function validarEntradaMovimiento(input: MovimientoInput): number {
  const monto = Math.round(Number(input.monto))
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error('monto_invalido: el monto debe ser un número mayor a cero')
  }
  if (!parseFechaLocal(input.fecha)) {
    throw new Error('fecha_invalida: la fecha debe existir y usar el formato YYYY-MM-DD')
  }
  if (!String(input.concepto ?? '').trim()) {
    throw new Error('concepto_requerido: el movimiento necesita un concepto')
  }
  if (!String(input.categoria ?? '').trim()) {
    throw new Error('categoria_requerida: el movimiento necesita una categoría')
  }
  if (input.tipo === 'transferencia') {
    if (!input.cuentaBancoId || !input.cuentaDestinoId) {
      throw new Error('cuenta_requerida: la transferencia necesita cuenta de origen y destino')
    }
    if (input.cuentaBancoId === input.cuentaDestinoId) {
      throw new Error('misma_cuenta: la cuenta de origen y destino deben ser distintas')
    }
  }
  return monto
}

export function datosMovimiento(input: MovimientoInput, ahora = Date.now()): Record<string, unknown> {
  const monto = validarEntradaMovimiento(input)
  return limpio({
    ...input,
    monto,
    etiquetas: input.etiquetas ?? [],
    fuente: input.fuente ?? 'chat_IA',
    estado: 'confirmado',
    creado: ahora,
    actualizado: ahora,
  })
}

export async function crearMovimiento(input: MovimientoInput): Promise<string> {
  const monto = validarEntradaMovimiento(input)
  const data = datosMovimiento(input)
  const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))

  if (!input.cuentaBancoId) {
    await addDoc(collection(db, COLLECTIONS.MOVIMIENTOS), data)
    return movRef.id
  }

  await runTransaction(db, async (tx) => {
    const origenRef = doc(db, COLLECTIONS.CUENTAS_BANCO, input.cuentaBancoId as string)
    const origenSnap = await tx.get(origenRef)
    if (!origenSnap.exists()) {
      throw new Error('cuenta_no_encontrada: la cuenta indicada no existe')
    }

    if (input.tipo === 'transferencia') {
      const destinoId = input.cuentaDestinoId as string
      const destinoRef = doc(db, COLLECTIONS.CUENTAS_BANCO, destinoId)
      const destinoSnap = await tx.get(destinoRef)
      if (!destinoSnap.exists()) {
        throw new Error('cuenta_no_encontrada: la cuenta destino no existe')
      }
      const saldoOrigen = Number(origenSnap.data()?.saldoActual) || 0
      if (saldoOrigen < monto) {
        throw new Error('saldo_insuficiente: la cuenta de origen no tiene fondos suficientes')
      }
      tx.update(origenRef, { saldoActual: increment(-monto), actualizado: Date.now() })
      tx.update(destinoRef, { saldoActual: increment(monto), actualizado: Date.now() })
    } else {
      const delta = input.tipo === 'ingreso' ? monto : -monto
      tx.update(origenRef, { saldoActual: increment(delta), actualizado: Date.now() })
    }

    tx.set(movRef, data)
  })

  return movRef.id
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
  if (!parseFechaLocal(input.fecha)) {
    throw new Error('fecha_invalida: la fecha debe existir y usar el formato YYYY-MM-DD')
  }

  const origenRef = doc(db, COLLECTIONS.CUENTAS_BANCO, input.origenId)
  const destinoRef = doc(db, COLLECTIONS.CUENTAS_BANCO, input.destinoId)
  const movRef = doc(collection(db, COLLECTIONS.MOVIMIENTOS))

  return runTransaction<ResultadoTransferencia>(db, async (tx) => {
    const origenSnap = await tx.get(origenRef)
    const destinoSnap = await tx.get(destinoRef)
    if (!origenSnap.exists() || !destinoSnap.exists()) return { ok: false, error: 'cuenta_no_encontrada' }

    const origen = { id: origenSnap.id, ...(origenSnap.data() as Record<string, unknown>) } as unknown as CuentaBanco
    const destino = { id: destinoSnap.id, ...(destinoSnap.data() as Record<string, unknown>) } as unknown as CuentaBanco
    const saldoOrigen = Number(origen.saldoActual) || 0
    if (saldoOrigen < monto) {
      return { ok: false, error: 'saldo_insuficiente', saldoDisponible: saldoOrigen, nombreOrigen: origen.nombre }
    }

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

    tx.set(movRef, movimiento)
    tx.update(origenRef, { saldoActual: increment(-monto), actualizado: Date.now() })
    tx.update(destinoRef, { saldoActual: increment(monto), actualizado: Date.now() })

    return {
      ok: true,
      movimientoId: movRef.id,
      origen: { ...origen, saldoActual: saldoOrigen - monto },
      destino: { ...destino, saldoActual: (Number(destino.saldoActual) || 0) + monto },
    }
  })
}

const efectoEnOrigen = (tipo: TipoMovimiento, monto: number): number => (tipo === 'ingreso' ? monto : -monto)
const efectoEnDestino = (tipo: TipoMovimiento, monto: number): number => (tipo === 'transferencia' ? monto : 0)

export async function actualizarMovimiento(id: string, input: MovimientoUpdate): Promise<void> {
  const monto = validarEntradaMovimiento(input)
  const ref = doc(db, COLLECTIONS.MOVIMIENTOS, id)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('movimiento_no_encontrado: el movimiento que se quiere editar no existe')
    }
    const viejo = snap.data() as Record<string, unknown>
    const montoViejo = Number(viejo.monto) || 0
    const tipoViejo = (viejo.tipo as TipoMovimiento) ?? 'otro'
    const origenViejo = viejo.cuentaBancoId as string | undefined
    const destinoViejo = tipoViejo === 'transferencia' ? (viejo.cuentaDestinoId as string | undefined) : undefined

    // El delta se calcula como (efecto nuevo - efecto viejo) por cuenta, de modo
    // que el ajuste sea idempotente y se aplique en una sola transacción.
    const deltas = new Map<string, number>()
    const acumular = (cuentaId: string | undefined, delta: number) => {
      if (!cuentaId || !Number.isFinite(delta) || delta === 0) return
      deltas.set(cuentaId, (deltas.get(cuentaId) ?? 0) + delta)
    }

    acumular(origenViejo, -efectoEnOrigen(tipoViejo, montoViejo))
    acumular(destinoViejo, -efectoEnDestino(tipoViejo, montoViejo))

    const destinoNuevo = input.tipo === 'transferencia' ? input.cuentaDestinoId : undefined
    acumular(input.cuentaBancoId, efectoEnOrigen(input.tipo, monto))
    acumular(destinoNuevo, efectoEnDestino(input.tipo, monto))

    const saldos = new Map<string, number | null>()
    for (const cuentaId of deltas.keys()) {
      const cuentaSnap = await tx.get(doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId))
      saldos.set(cuentaId, cuentaSnap.exists() ? Number(cuentaSnap.data()?.saldoActual) || 0 : null)
    }

    const requeridas = new Set<string>()
    if (input.cuentaBancoId) requeridas.add(input.cuentaBancoId)
    if (destinoNuevo) requeridas.add(destinoNuevo)
    for (const cuentaId of requeridas) {
      if (saldos.get(cuentaId) === null) {
        throw new Error('cuenta_no_encontrada: la cuenta indicada no existe')
      }
    }

    if (input.tipo === 'transferencia' && input.cuentaBancoId) {
      const saldoFinal = (saldos.get(input.cuentaBancoId) ?? 0) + (deltas.get(input.cuentaBancoId) ?? 0)
      if (saldoFinal < 0) {
        throw new Error('saldo_insuficiente: la cuenta de origen no tiene fondos suficientes')
      }
    }

    for (const [cuentaId, delta] of deltas) {
      if (saldos.get(cuentaId) === null) continue // la cuenta vieja ya no existe: nada que revertir
      tx.update(doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId), {
        saldoActual: increment(delta),
        actualizado: Date.now(),
      })
    }

    tx.update(
      ref,
      limpio({
        fecha: input.fecha,
        tipo: input.tipo,
        concepto: input.concepto,
        monto,
        categoria: input.categoria,
        subcategoria: input.subcategoria,
        descripcion: input.descripcion,
        cuentaBancoId: input.cuentaBancoId,
        cuentaDestinoId: destinoNuevo ?? deleteField(),
        actualizado: Date.now(),
      })
    )
  })
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

export async function listarTodosLosMovimientos(max?: number): Promise<MovimientoDoc[]> {
  const col = collection(db, COLLECTIONS.MOVIMIENTOS)
  const snap =
    typeof max === 'number' && max > 0
      ? await getDocs(query(col, orderBy('fecha', 'desc'), limit(Math.floor(max))))
      : await getDocs(query(col, orderBy('fecha', 'desc')))
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as unknown as MovimientoDoc[]
}

export async function listarMovimientos(max?: number): Promise<MovimientoDoc[]> {
  return listarTodosLosMovimientos(max)
}

const limpiarCelda = (v: unknown): string =>
  String(v ?? '')
    .replace(/[\r\n|]+/g, ' ')
    .trim()

export async function exportarMovimientosCompacto(): Promise<{
  nombre: string
  contenido: string
  totalMovimientos: number
}> {
  const [movs, cuentasSnap, deudasSnap, vehSnap, propSnap, nomSnap, impSnap, recSnap] = await Promise.all([
    listarTodosLosMovimientos(),
    getDocs(collection(db, COLLECTIONS.CUENTAS_BANCO)).catch(() => null),
    getDocs(collection(db, COLLECTIONS.DEUDAS)).catch(() => null),
    getDocs(collection(db, COLLECTIONS.VEHICULOS)).catch(() => null),
    getDocs(collection(db, COLLECTIONS.PROPIEDADES)).catch(() => null),
    getDocs(collection(db, COLLECTIONS.NOMINA)).catch(() => null),
    getDocs(collection(db, COLLECTIONS.IMPUESTOS)).catch(() => null),
    getDocs(collection(db, COLLECTIONS.GASTOS_RECURRENTES)).catch(() => null),
  ])

  const mapaCuentas = new Map<string, string>()
  cuentasSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    mapaCuentas.set(d.id, String(data.nombre ?? d.id))
  })

  const mapaDeudas = new Map<string, string>()
  deudasSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    mapaDeudas.set(d.id, String(data.nombre ?? d.id))
  })

  const mapaVehiculos = new Map<string, string>()
  vehSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    const etiqueta = [data.marca, data.linea, data.placa ? `(${data.placa})` : ''].filter(Boolean).join(' ')
    mapaVehiculos.set(d.id, etiqueta || d.id)
  })

  const mapaPropiedades = new Map<string, string>()
  propSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    mapaPropiedades.set(d.id, String(data.nombre ?? d.id))
  })

  const mapaNomina = new Map<string, string>()
  nomSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    mapaNomina.set(d.id, String(data.nombreCompleto ?? d.id))
  })

  const mapaImpuestos = new Map<string, string>()
  impSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    mapaImpuestos.set(d.id, String(data.nombre ?? d.id))
  })

  const mapaRecurrentes = new Map<string, string>()
  recSnap?.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    mapaRecurrentes.set(d.id, String(data.concepto ?? d.id))
  })

  // Orden cronológico desde el primer movimiento hasta el más reciente
  const cronologicos = [...movs].reverse()

  let totalIngresos = 0
  let totalEgresos = 0
  for (const m of cronologicos) {
    const v = Number(m.monto) || 0
    if (m.tipo === 'ingreso') totalIngresos += v
    else if (m.tipo !== 'transferencia') totalEgresos += v
  }

  const fechaHoy = hoyISO()
  const lineas: string[] = [
    `# CASHMET_MOVIMIENTOS_COMPLETO v1 | exportado=${fechaHoy} | moneda=COP | total_movimientos=${cronologicos.length} | ingresos_acum=${Math.round(totalIngresos)} | egresos_acum=${Math.round(totalEgresos)} | balance_neto=${Math.round(totalIngresos - totalEgresos)}`,
    'fecha|hora|tipo|monto|concepto|categoria|subcategoria|cuenta|cuentaId|cuentaDestino|cuentaDestinoId|vinculo|descripcion|etiquetas|fuente|estado|notasIA|id|creado',
  ]

  for (const m of cronologicos) {
    const vinculos: string[] = []
    if (m.deudaId) vinculos.push(`deuda:${mapaDeudas.get(m.deudaId) ?? m.deudaId}[${m.deudaId}]`)
    if (m.vehiculoId) vinculos.push(`vehiculo:${mapaVehiculos.get(m.vehiculoId) ?? m.vehiculoId}[${m.vehiculoId}]`)
    if (m.propiedadId) vinculos.push(`propiedad:${mapaPropiedades.get(m.propiedadId) ?? m.propiedadId}[${m.propiedadId}]`)
    if (m.nominaId) vinculos.push(`nomina:${mapaNomina.get(m.nominaId) ?? m.nominaId}[${m.nominaId}]`)
    if (m.impuestoId) vinculos.push(`impuesto:${mapaImpuestos.get(m.impuestoId) ?? m.impuestoId}[${m.impuestoId}]`)
    if (m.recurrenteId) vinculos.push(`recurrente:${mapaRecurrentes.get(m.recurrenteId) ?? m.recurrenteId}[${m.recurrenteId}]`)

    const fila = [
      limpiarCelda(m.fecha),
      limpiarCelda(m.hora),
      limpiarCelda(m.tipo),
      String(Math.round(Number(m.monto) || 0)),
      limpiarCelda(m.concepto),
      limpiarCelda(m.categoria),
      limpiarCelda(m.subcategoria),
      limpiarCelda(m.cuentaBancoId ? mapaCuentas.get(m.cuentaBancoId) ?? m.cuentaBancoId : ''),
      limpiarCelda(m.cuentaBancoId),
      limpiarCelda(m.cuentaDestinoId ? mapaCuentas.get(m.cuentaDestinoId) ?? m.cuentaDestinoId : ''),
      limpiarCelda(m.cuentaDestinoId),
      limpiarCelda(vinculos.join(';')),
      limpiarCelda(m.descripcion),
      limpiarCelda(Array.isArray(m.etiquetas) ? m.etiquetas.join(',') : ''),
      limpiarCelda(m.fuente),
      limpiarCelda(m.estado ?? 'confirmado'),
      limpiarCelda(m.notasIA),
      limpiarCelda(m.id),
      m.creado ? String(m.creado) : '',
    ].join('|')

    lineas.push(fila)
  }

  return {
    nombre: `cashmet-movimientos-${fechaHoy}.csv`,
    contenido: lineas.join('\n'),
    totalMovimientos: cronologicos.length,
  }
}

export async function actualizarCuentaBanco(id: string, data: Partial<CuentaBanco>): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, id), limpio({ ...data, actualizado: Date.now() }))
}

export async function eliminarCuentaBanco(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.CUENTAS_BANCO, id))
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.MOVIMIENTOS, id)

  await runTransaction(db, async (tx) => {
    const documento = await tx.get(ref)
    if (!documento.exists()) return
    const datos = documento.data() as Record<string, unknown>
    const monto = Number(datos.monto) || 0
    const tipo = (datos.tipo as TipoMovimiento) ?? 'otro'
    const cuentaBancoId = datos.cuentaBancoId as string | undefined
    const cuentaDestinoId = (datos.cuentaDestinoId as string | undefined) ?? undefined

    const reversos = new Map<string, number>()
    const acumular = (cuentaId: string | undefined, delta: number) => {
      if (!cuentaId || !delta) return
      reversos.set(cuentaId, (reversos.get(cuentaId) ?? 0) + delta)
    }
    acumular(cuentaBancoId, -efectoEnOrigen(tipo, monto))
    if (tipo === 'transferencia') acumular(cuentaDestinoId, -efectoEnDestino(tipo, monto))

    for (const [cuentaId, delta] of reversos) {
      const cuentaRef = doc(db, COLLECTIONS.CUENTAS_BANCO, cuentaId)
      const cuentaSnap = await tx.get(cuentaRef)
      if (!cuentaSnap.exists()) continue
      tx.update(cuentaRef, { saldoActual: increment(delta), actualizado: Date.now() })
    }

    tx.delete(ref)
  })
}
