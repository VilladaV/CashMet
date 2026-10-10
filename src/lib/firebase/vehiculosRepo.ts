import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { limpio } from './repoUtils'

export type TipoVehiculo = 'carro' | 'moto' | 'camion' | 'otro'

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
    fechaVencimiento?: string
    valorPrimaAnual?: number
    fuente?: string
  }
  tecnicomecanica?: {
    vigente?: boolean
    centroRevision?: string
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
}

export const TIPOS_VEHICULO: TipoVehiculo[] = ['carro', 'moto', 'camion', 'otro']

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

export async function crearVehiculo(v: Partial<Vehiculo>): Promise<string> {
  const payload = limpio({
    ...v,
    activo: true,
    gastosMensualesCalculados: calcularGastosMensuales(v),
    actualizado: Date.now(),
  })
  const ref = await addDoc(collection(db, COLLECTIONS.VEHICULOS), payload)
  return ref.id
}

export async function actualizarVehiculo(id: string, v: Partial<Vehiculo>): Promise<void> {
  const payload = limpio({
    ...v,
    gastosMensualesCalculados: calcularGastosMensuales(v),
    actualizado: Date.now(),
  })
  await updateDoc(doc(db, COLLECTIONS.VEHICULOS, id), payload)
}

export async function eliminarVehiculo(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.VEHICULOS, id))
}