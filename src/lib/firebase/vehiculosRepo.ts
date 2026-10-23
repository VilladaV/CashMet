import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoVehiculo = 'carro' | 'moto' | 'camion' | 'otro'

export type EstadoVehiculo =
  | 'Disponible'
  | 'En reparación'
  | 'Dañado'
  | 'Decomisado'
  | 'Vendido'
  | 'No disponible'

export interface TareaMantenimiento {
  id: string
  nombre: string
  ultimoKm?: number
  proximoKm?: number
  ultimaFecha?: string
  proximaFecha?: string
  intervaloKm?: number
  costoEstimado?: number
}

export interface Vehiculo {
  id: string
  placa?: string
  marca: string
  linea: string
  modelo: number
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
    fechaVencimiento?: string
    valorPrimaAnual?: number
    periodicidad?: string
    fuente?: string
  }
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

export const TIPOS_VEHICULO: TipoVehiculo[] = ['carro', 'moto', 'camion', 'otro']

export const ESTADOS_VEHICULO: EstadoVehiculo[] = [
  'Disponible',
  'En reparación',
  'Dañado',
  'Decomisado',
  'Vendido',
  'No disponible',
]

export function nuevaTareaId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

function calcularGastosMensuales(v: Partial<Vehiculo>): number {
  let total = 0
  const soat = Number(v.soat?.valorPrimaAnual) || 0
  const str = Number(v.seguroTodoRiesgo?.valorPrimaAnual) || 0
  const tm = Number(v.tecnicomecanica?.costoRevision) || 0
  total += soat / 12
  total += str / 12
  total += tm
  return Math.round(total)
}

export async function listarVehiculos(): Promise<Vehiculo[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.VEHICULOS))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as Vehiculo[]
}

export async function obtenerVehiculo(id: string): Promise<Vehiculo | null> {
  return obtenerVehiculo(id)
}

export async function renovarSoat(id: string): Promise<{ fechaVencimiento: string } | null> {
  const actual = await obtenerVehiculo(id)
  if (!actual?.soat?.fechaVencimiento) return null
  const fecha = new Date(actual.soat.fechaVencimiento)
  fecha.setFullYear(fecha.getFullYear() + 1)
  const nueva = fecha.toISOString().slice(0, 10)
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), {
    'soat.fechaVencimiento': nueva,
    'soat.vigente': true,
    actualizado: Date.now(),
  })
  return { fechaVencimiento: nueva }
}

export async function renovarTecnicomecanica(id: string): Promise<{ fechaVencimiento: string } | null> {
  const actual = await obtenerVehiculo(id)
  if (!actual?.tecnicomecanica?.fechaVencimiento) return null
  const fecha = new Date(actual.tecnicomecanica.fechaVencimiento)
  fecha.setFullYear(fecha.getFullYear() + 1)
  const nueva = fecha.toISOString().slice(0, 10)
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), {
    'tecnicomecanica.fechaVencimiento': nueva,
    'tecnicomecanica.vigente': true,
    actualizado: Date.now(),
  })
  return { fechaVencimiento: nueva }
}

export async function crearVehiculo(v: Partial<Vehiculo>): Promise<string> {
  const payload = limpio({
    ...v,
    activo: true,
    estado: v.estado ?? 'Disponible',
    gastosMensualesCalculados: calcularGastosMensuales(v),
    actualizado: Date.now(),
  })
  const ref = await addDoc(collection(db, COLLECTIONS.VEHICULOS), payload)
  return ref.id
}

export async function actualizarVehiculo(id: string, v: Partial<Vehiculo>): Promise<void> {
  const actual = await obtenerVehiculo(id)
  const mezclado: Partial<Vehiculo> = { ...(actual ?? {}), ...v }
  const payload = limpio({
    ...v,
    gastosMensualesCalculados: calcularGastosMensuales(mezclado),
    actualizado: Date.now(),
  })
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), payload)
}

export async function eliminarVehiculo(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.VEHICULOS, id))
}

export async function actualizarKilometraje(id: string, kilometrajeActual: number): Promise<void> {
  const actual = await obtenerVehiculo(id)
  const tareas = actual?.mantenimiento?.tareas ?? []
  await updateDoc(
    doc(db, COLLECTIONS.VEHICULOS, id),
    limpio({
      mantenimiento: { kilometrajeActual: Math.max(0, Math.round(kilometrajeActual)), tareas },
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
  if (servicio.km !== undefined) {
    t.ultimoKm = servicio.km
    if (t.intervaloKm && t.intervaloKm > 0) t.proximoKm = servicio.km + t.intervaloKm
  }
  if (servicio.fecha) t.ultimaFecha = servicio.fecha
  tareas[i] = limpio({ ...t } as unknown as Record<string, unknown>) as unknown as TareaMantenimiento
  const km =
    servicio.km !== undefined
      ? Math.max(actual?.mantenimiento?.kilometrajeActual ?? 0, servicio.km)
      : actual?.mantenimiento?.kilometrajeActual
  await updateDoc(
    doc(db, COLLECTIONS.VEHICULOS, id),
    limpio({ mantenimiento: { kilometrajeActual: km, tareas }, actualizado: Date.now() })
  )
  return tareas[i]
}
