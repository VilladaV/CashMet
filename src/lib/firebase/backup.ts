import { collection, doc, getDocs, writeBatch, type DocumentData } from 'firebase/firestore'
import { db } from './config'
import { COLLECTIONS } from './collections'
import { hoyISO } from '../fechas'

const COLECCIONES = [
  COLLECTIONS.CUENTAS_BANCO,
  COLLECTIONS.DEUDAS,
  COLLECTIONS.VEHICULOS,
  COLLECTIONS.PROPIEDADES,
  COLLECTIONS.NOMINA,
  COLLECTIONS.GASTOS_RECURRENTES,
  COLLECTIONS.IMPUESTOS,
  COLLECTIONS.MOVIMIENTOS,
  COLLECTIONS.CALENDARIO_EVENTOS,
  COLLECTIONS.CONFIGURACION_SISTEMA,
  COLLECTIONS.RESUMENES_MENSUALES,
]

const COLECCIONES_PERMITIDAS = new Set<string>(COLECCIONES)
const MAX_DOCUMENTOS = 20000
const TAMANO_LOTE = 400

export async function exportarBackup(): Promise<{ nombre: string; contenido: string }> {
  const copia: Record<string, unknown[]> = {}
  for (const col of COLECCIONES) {
    const snap = await getDocs(collection(db, col))
    copia[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  const fecha = hoyISO()
  return {
    nombre: `cashmet-backup-${fecha}.json`,
    contenido: JSON.stringify({ generado: new Date().toISOString(), app: 'CashMet', copia }, null, 2),
  }
}

interface OperacionImportacion {
  coleccion: string
  id: string
  datos: Record<string, unknown>
}

/**
 * Importa un backup validando TODA la estructura antes de escribir. Solo se
 * aceptan colecciones conocidas de CashMet y documentos con id válido; la
 * escritura se hace por lotes para no dejar el backup a medio importar.
 */
export async function importarBackup(jsonText: string): Promise<number> {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    throw new Error('formato_invalido: el archivo no es un JSON válido')
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('formato_invalido: el backup debe ser un objeto JSON')
  }

  const crudo = (data as Record<string, unknown>).copia
  const copia = (crudo ?? data) as Record<string, unknown>
  if (!copia || typeof copia !== 'object' || Array.isArray(copia)) {
    throw new Error('formato_invalido: el backup debe incluir un objeto "copia"')
  }

  const operaciones: OperacionImportacion[] = []

  for (const coleccion of Object.keys(copia)) {
    if (!COLECCIONES_PERMITIDAS.has(coleccion)) {
      throw new Error(`colección_no_permitida: "${coleccion}" no es una colección válida de CashMet`)
    }

    const docs = copia[coleccion]
    if (!Array.isArray(docs)) {
      throw new Error('formato_invalido: cada colección debe ser una lista (array) de documentos')
    }

    for (const documento of docs) {
      if (!documento || typeof documento !== 'object' || Array.isArray(documento)) {
        throw new Error('documento_invalido: cada documento debe ser un objeto con id')
      }
      const registro = documento as Record<string, unknown>
      const id = registro.id
      if (typeof id !== 'string' && typeof id !== 'number') {
        throw new Error('documento_invalido: cada documento debe tener un id válido')
      }
      if (!String(id).trim()) {
        throw new Error('documento_invalido: el id del documento no puede estar vacío')
      }
      const { id: _id, ...datos } = registro
      operaciones.push({ coleccion, id: String(id), datos })
      if (operaciones.length > MAX_DOCUMENTOS) {
        throw new Error(`límite_excedido: el backup supera el máximo de ${MAX_DOCUMENTOS} documentos`)
      }
    }
  }

  for (let i = 0; i < operaciones.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db)
    for (const op of operaciones.slice(i, i + TAMANO_LOTE)) {
      lote.set(doc(db, op.coleccion, op.id), op.datos as DocumentData)
    }
    await lote.commit()
  }

  return operaciones.length
}
