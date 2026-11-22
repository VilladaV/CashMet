import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from './config'

function uid(): string {
  return auth.currentUser?.uid ?? 'anon'
}

function validarVehiculoId(vehiculoId: string): string {
  const limpio = String(vehiculoId ?? '').trim()
  if (!limpio || limpio.includes('/') || limpio === '.' || limpio === '..') {
    throw new Error('vehiculo_id_invalido: el identificador del vehículo no es válido')
  }
  return limpio
}

function sufijoAleatorio(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function nombreSeguro(nombre: string): string {
  const saneado = nombre
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!saneado) return 'archivo'
  if (saneado.length <= 80) return saneado
  const punto = saneado.lastIndexOf('.')
  if (punto > 0 && saneado.length - punto <= 12) {
    const ext = saneado.slice(punto)
    const base = saneado.slice(0, Math.max(1, 80 - ext.length)).replace(/-+$/g, '')
    return `${base || 'archivo'}${ext}`
  }
  return saneado.slice(0, 80)
}

export async function subirFotoVehiculo(vehiculoId: string, archivo: File): Promise<string> {
  const idSeguro = validarVehiculoId(vehiculoId)
  const ruta = `vehicle-images/${uid()}/${idSeguro}/${Date.now()}-${sufijoAleatorio()}-${nombreSeguro(archivo.name)}`
  const r = ref(storage, ruta)
  await uploadBytes(r, archivo, { contentType: archivo.type || 'image/jpeg' })
  return getDownloadURL(r)
}

export async function subirDocumentoVehiculo(vehiculoId: string, archivo: File): Promise<string> {
  const idSeguro = validarVehiculoId(vehiculoId)
  const ruta = `vehicle-docs/${uid()}/${idSeguro}/${Date.now()}-${sufijoAleatorio()}-${nombreSeguro(archivo.name)}`
  const r = ref(storage, ruta)
  await uploadBytes(r, archivo, { contentType: archivo.type || 'application/pdf' })
  return getDownloadURL(r)
}
