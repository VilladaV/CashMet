import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from './config'

function uid(): string {
  return auth.currentUser?.uid ?? 'anon'
}

function nombreSeguro(nombre: string): string {
  return nombre.toLowerCase().replace(/[^a-z0-9.\\-]+/g, '-').slice(0, 80) || 'archivo'
}

export async function subirFotoVehiculo(vehiculoId: string, archivo: File): Promise<string> {
  const ruta = `vehicle-images/${uid()}/${vehiculoId}/${Date.now()}-${nombreSeguro(archivo.name)}`
  const r = ref(storage, ruta)
  await uploadBytes(r, archivo, { contentType: archivo.type || 'image/jpeg' })
  return getDownloadURL(r)
}

export async function subirDocumentoVehiculo(vehiculoId: string, archivo: File): Promise<string> {
  const ruta = `vehicle-docs/${uid()}/${vehiculoId}/${Date.now()}-${nombreSeguro(archivo.name)}`
  const r = ref(storage, ruta)
  await uploadBytes(r, archivo, { contentType: archivo.type || 'application/pdf' })
  return getDownloadURL(r)
}
