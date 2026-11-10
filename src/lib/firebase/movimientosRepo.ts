import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
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

function ordenarMovimientosDesc(lista: MovimientoDoc[]): MovimientoDoc[] {
  return [...lista].sort((a, b) => {
    const cmpFecha = String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''))
    if (cmpFecha !== 0) return cmpFecha
    return (Number(b.creado) || 0) - (Number(a.creado) || 0)
  })
}

export async function listarTodosLosMovimientos(_max?: number): Promise<MovimientoDoc[]> {
  void _max
  const snap = await getDocs(collection(db, COLLECTIONS.MOVIMIENTOS))
  const todos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as MovimientoDoc[]
  return ordenarMovimientosDesc(todos)
}

export async function listarMovimientos(max?: number): Promise<MovimientoDoc[]> {
  const todos = await listarTodosLosMovimientos()
  if (typeof max === 'number' && max > 0) return todos.slice(0, max)
  return todos
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

  const fechaHoy = new Date().toISOString().slice(0, 10)
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
