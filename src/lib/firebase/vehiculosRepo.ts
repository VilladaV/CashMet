import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'
import { hoyISO, parseFechaLocal, sumarAnio, sumarMeses } from '../fechas'

export type TipoVehiculo = 'carro' | 'moto' | 'camion' | 'otro'

export type EstadoVehiculo =
  | 'Disponible'
  | 'En reparación'
  | 'Dañado'
  | 'Decomisado'
  | 'Vendido'
  | 'No disponible'

export type PeriodicidadGasto = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

export interface TareaMantenimiento {
  id: string
  nombre: string
  ultimoKm?: number
  proximoKm?: number
  ultimaFecha?: string
  proximaFecha?: string
  intervaloKm?: number
  intervaloMeses?: number
  costoEstimado?: number
}

export interface Vehiculo {
  id: string
  placa?: string
  marca: string
  linea: string
  modelo?: number | null
  tipo: TipoVehiculo
  cilindraje?: number
  claseVehiculo?: string
  valorComercial?: number
  activo?: boolean
  soat?: {
    vigente?: boolean
    aseguradora?: string
    numeroPoliza?: string
    fechaInicioVigencia?: string
    fechaVencimiento?: string
    valorPrimaAnual?: number
    fuente?: string
  }
  tecnicomecanica?: {
    vigente?: boolean
    centroRevision?: string
    numeroCertificado?: string
    cda?: string
    fechaExpedicion?: string
    fechaVencimiento?: string
    costoRevision?: number
    fuente?: string
  }
  seguroTodoRiesgo?: {
    tiene?: boolean
    vigente?: boolean
    aseguradora?: string
    numeroPoliza?: string
    fechaVencimiento?: string
    valorPrimaAnual?: number
    periodicidad?: PeriodicidadGasto
    fuente?: string
  }
  otrosGastos?: Array<{ concepto: string; periodicidad: PeriodicidadGasto; valor: number }>
  gastosMensualesCalculados?: number
  notas?: string
  actualizado?: number
  estado?: EstadoVehiculo
  fotoUrl?: string
  color?: string
  servicio?: string
  carroceria?: string
  numPuertas?: number
  numMotor?: string
  numSerie?: string
  numChasis?: string
  capacidad?: string
  avaluoComercial?: number
  licenciaTransito?: {
    numeroLicencia?: string
    fechaExpedicion?: string
    organismoTransito?: string
    limitacionesPropiedad?: string
  }
  propietarioDetalle?: {
    nombre?: string
    documento?: string
    direccion?: string
    ciudad?: string
    telefono?: string
  }
  documentos?: {
    manualNombre?: string
    manualUrl?: string
    fichaNombre?: string
    fichaUrl?: string
  }
  mantenimiento?: {
    kilometrajeActual?: number
    tareas: TareaMantenimiento[]
  }
}

type VehiculoBase = Omit<
  Vehiculo,
  | 'id'
  | 'soat'
  | 'tecnicomecanica'
  | 'seguroTodoRiesgo'
  | 'otrosGastos'
  | 'licenciaTransito'
  | 'propietarioDetalle'
  | 'documentos'
  | 'mantenimiento'
>

export type VehiculoUpdate = {
  [K in keyof VehiculoBase]?: VehiculoBase[K] | null
} & {
  soat?: Vehiculo['soat'] | null
  tecnicomecanica?: Vehiculo['tecnicomecanica'] | null
  seguroTodoRiesgo?: Vehiculo['seguroTodoRiesgo'] | null
  otrosGastos?: Vehiculo['otrosGastos'] | null
  licenciaTransito?: Vehiculo['licenciaTransito'] | null
  propietarioDetalle?: Vehiculo['propietarioDetalle'] | null
  documentos?: Vehiculo['documentos'] | null
  mantenimiento?: Vehiculo['mantenimiento'] | null
}

export interface DetalleGastosVehiculo {
  soatMensual: number
  tmMensual: number
  strMensual: number
  otrosMensual: number
  totalMensual: number
}

export const TIPOS_VEHICULO: TipoVehiculo[] = ['carro', 'moto', 'camion', 'otro']

export const ESTADOS_VEHICULO: EstadoVehiculo[] = [
  'Disponible',
  'En reparación',
  'Dañado',
  'Decomisado',
  'Vendido',
  'No disponible',
]

const FACTOR_MENSUAL: Record<PeriodicidadGasto, number> = {
  mensual: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
}

export function nuevaTareaId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

function mensualizar(valor: number, periodicidad?: string): number {
  const p = String(periodicidad ?? 'anual') as PeriodicidadGasto
  return valor * (FACTOR_MENSUAL[p] ?? FACTOR_MENSUAL.anual)
}

export interface VehiculoGastos {
  soat?: Vehiculo['soat'] | null
  tecnicomecanica?: Vehiculo['tecnicomecanica'] | null
  seguroTodoRiesgo?: Vehiculo['seguroTodoRiesgo'] | null
  otrosGastos?: Vehiculo['otrosGastos'] | null
}

export function detalleGastosVehiculo(v: VehiculoGastos): DetalleGastosVehiculo {
  const soat = Number(v.soat?.valorPrimaAnual) || 0
  const tm = Number(v.tecnicomecanica?.costoRevision) || 0
  const str = Number(v.seguroTodoRiesgo?.valorPrimaAnual) || 0
  const strTiene = v.seguroTodoRiesgo?.tiene !== false
  const otros = Array.isArray(v.otrosGastos)
    ? v.otrosGastos.reduce((s, g) => s + mensualizar(Number(g.valor) || 0, g.periodicidad), 0)
    : 0
  const soatMensual = Math.round(soat / 12)
  const tmMensual = Math.round(tm / 12)
  const strMensual = strTiene ? Math.round(mensualizar(str, v.seguroTodoRiesgo?.periodicidad)) : 0
  const otrosMensual = Math.round(otros)
  return {
    soatMensual,
    tmMensual,
    strMensual,
    otrosMensual,
    totalMensual: soatMensual + tmMensual + strMensual + otrosMensual,
  }
}

export function calcularGastosMensuales(v: VehiculoGastos): number {
  return detalleGastosVehiculo(v).totalMensual
}

function mezclarNested<T extends object>(actual: T | null | undefined, nuevo: T | null | undefined): T | null | undefined {
  if (nuevo === null) return null
  if (nuevo === undefined) return actual
  return { ...(actual ?? {}), ...nuevo } as T
}

function mezclarVehiculo(actual: Vehiculo | null, v: VehiculoUpdate): Partial<Vehiculo> {
  const base: Record<string, unknown> = { ...(actual ?? {}), ...v }
  base.soat = mezclarNested(actual?.soat, v.soat)
  base.tecnicomecanica = mezclarNested(actual?.tecnicomecanica, v.tecnicomecanica)
  base.seguroTodoRiesgo = mezclarNested(actual?.seguroTodoRiesgo, v.seguroTodoRiesgo)
  base.licenciaTransito = mezclarNested(actual?.licenciaTransito, v.licenciaTransito)
  base.propietarioDetalle = mezclarNested(actual?.propietarioDetalle, v.propietarioDetalle)
  base.documentos = mezclarNested(actual?.documentos, v.documentos)
  base.mantenimiento = mezclarNested(actual?.mantenimiento, v.mantenimiento)
  if (v.otrosGastos !== undefined) base.otrosGastos = v.otrosGastos
  return base as Partial<Vehiculo>
}

export async function listarVehiculos(): Promise<Vehiculo[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.VEHICULOS))
  const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Vehiculo[]
  return lista.sort((a, b) => {
    const vendidoA = a.estado === 'Vendido' || a.activo === false ? 1 : 0
    const vendidoB = b.estado === 'Vendido' || b.activo === false ? 1 : 0
    if (vendidoA !== vendidoB) return vendidoA - vendidoB
    const textoA = `${a.marca ?? ''} ${a.linea ?? ''} ${a.modelo ?? ''}`.toLowerCase()
    const textoB = `${b.marca ?? ''} ${b.linea ?? ''} ${b.modelo ?? ''}`.toLowerCase()
    return textoA.localeCompare(textoB, 'es')
  })
}

export async function obtenerVehiculo(id: string): Promise<Vehiculo | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.VEHICULOS, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) } as unknown as Vehiculo
}

export async function renovarSoat(id: string): Promise<{ fechaVencimiento: string; fechaInicioVigencia: string } | null> {
  const actual = await obtenerVehiculo(id)
  const vencimiento = actual?.soat?.fechaVencimiento
  if (!vencimiento || !parseFechaLocal(vencimiento)) return null
  const hoy = hoyISO()
  const inicio = vencimiento > hoy ? vencimiento : hoy
  const nueva = sumarAnio(inicio)
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), {
    'soat.fechaInicioVigencia': inicio,
    'soat.fechaVencimiento': nueva,
    'soat.vigente': true,
    actualizado: Date.now(),
  })
  return { fechaVencimiento: nueva, fechaInicioVigencia: inicio }
}

export async function renovarTecnicomecanica(id: string): Promise<{ fechaVencimiento: string; fechaExpedicion: string } | null> {
  const actual = await obtenerVehiculo(id)
  const vencimiento = actual?.tecnicomecanica?.fechaVencimiento
  if (!vencimiento || !parseFechaLocal(vencimiento)) return null
  const hoy = hoyISO()
  const inicio = vencimiento > hoy ? vencimiento : hoy
  const nueva = sumarAnio(inicio)
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), {
    'tecnicomecanica.fechaExpedicion': inicio,
    'tecnicomecanica.fechaVencimiento': nueva,
    'tecnicomecanica.vigente': true,
    actualizado: Date.now(),
  })
  return { fechaVencimiento: nueva, fechaExpedicion: inicio }
}

export async function crearVehiculo(v: VehiculoUpdate): Promise<string> {
  const payload = limpio({
    ...v,
    tipo: v.tipo ?? 'carro',
    activo: v.activo ?? true,
    estado: v.estado ?? 'Disponible',
    gastosMensualesCalculados: calcularGastosMensuales(v),
    actualizado: Date.now(),
  } as Record<string, unknown>)
  const ref = await addDoc(collection(db, COLLECTIONS.VEHICULOS), payload)
  return ref.id
}

export async function actualizarVehiculo(id: string, v: VehiculoUpdate): Promise<void> {
  const actual = await obtenerVehiculo(id)
  const mezclado = mezclarVehiculo(actual, v)
  const payload = limpio({
    ...v,
    gastosMensualesCalculados: calcularGastosMensuales(mezclado),
    actualizado: Date.now(),
  } as Record<string, unknown>)
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), payload)
}

export async function eliminarVehiculo(id: string): Promise<void> {
  try {
    const eventos = await getDocs(
      query(collection(db, COLLECTIONS.CALENDARIO_EVENTOS), where('relacionado.vehiculoId', '==', id))
    )
    await Promise.all(eventos.docs.map((d) => deleteDoc(d.ref)))
  } catch {
    void 0
  }
  await deleteDoc(doc(db, COLLECTIONS.VEHICULOS, id))
}

export async function actualizarKilometraje(id: string, kilometrajeActual: number): Promise<void> {
  const n = Number(kilometrajeActual)
  if (!Number.isFinite(n)) return
  const actual = await obtenerVehiculo(id)
  const tareas = actual?.mantenimiento?.tareas ?? []
  await updateDoc(
    doc(db, COLLECTIONS.VEHICULOS, id),
    limpio({
      mantenimiento: { kilometrajeActual: Math.max(0, Math.round(n)), tareas },
      actualizado: Date.now(),
    })
  )
}

export async function guardarTareaMantenimiento(id: string, tarea: TareaMantenimiento): Promise<void> {
  const actual = await obtenerVehiculo(id)
  const km = actual?.mantenimiento?.kilometrajeActual
  const tareas = [...(actual?.mantenimiento?.tareas ?? [])]
  const i = tareas.findIndex((t) => t.id === tarea.id)
  const limpia = limpio({ ...tarea } as unknown as Record<string, unknown>) as unknown as TareaMantenimiento
  if (i >= 0) tareas[i] = limpia
  else tareas.push(limpia)
  await updateDoc(
    doc(db, COLLECTIONS.VEHICULOS, id),
    limpio({ mantenimiento: { kilometrajeActual: km, tareas }, actualizado: Date.now() })
  )
}

export async function eliminarTareaMantenimiento(id: string, tareaId: string): Promise<void> {
  const actual = await obtenerVehiculo(id)
  const km = actual?.mantenimiento?.kilometrajeActual
  const tareas = (actual?.mantenimiento?.tareas ?? []).filter((t) => t.id !== tareaId)
  await updateDoc(
    doc(db, COLLECTIONS.VEHICULOS, id),
    limpio({ mantenimiento: { kilometrajeActual: km, tareas }, actualizado: Date.now() })
  )
}

export async function registrarServicioMantenimiento(
  id: string,
  tareaId: string,
  servicio: { km?: number; fecha?: string }
): Promise<TareaMantenimiento | null> {
  const actual = await obtenerVehiculo(id)
  if (!actual) return null
  const tareas = [...(actual?.mantenimiento?.tareas ?? [])]
  const i = tareas.findIndex((t) => t.id === tareaId)
  if (i < 0) return null
  const t = { ...tareas[i] }
  const kmNum =
    servicio.km !== undefined && Number.isFinite(servicio.km)
      ? Math.max(0, Math.round(servicio.km))
      : undefined
  if (kmNum !== undefined) {
    t.ultimoKm = kmNum
    t.proximoKm = t.intervaloKm && t.intervaloKm > 0 ? kmNum + t.intervaloKm : undefined
  }
  if (servicio.fecha) {
    t.ultimaFecha = servicio.fecha
    t.proximaFecha =
      t.intervaloMeses && t.intervaloMeses > 0 ? sumarMeses(servicio.fecha, t.intervaloMeses) : undefined
  }
  tareas[i] = limpio({ ...t } as unknown as Record<string, unknown>) as unknown as TareaMantenimiento
  const km =
    kmNum !== undefined
      ? Math.max(actual?.mantenimiento?.kilometrajeActual ?? 0, kmNum)
      : actual?.mantenimiento?.kilometrajeActual
  await updateDoc(
    doc(db, COLLECTIONS.VEHICULOS, id),
    limpio({ mantenimiento: { kilometrajeActual: km, tareas }, actualizado: Date.now() })
  )
  return tareas[i]
}
