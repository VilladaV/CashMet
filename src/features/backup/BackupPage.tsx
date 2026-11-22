import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { exportarBackup, importarBackup } from '@/lib/firebase/backup'
import { exportarMovimientosCompacto } from '@/lib/firebase/movimientosRepo'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import {
  Download,
  Upload,
  ShieldCheck,
  Database,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react'

interface PreviewImportacion {
  archivoNombre: string
  texto: string
  totalDocs: number
  colecciones: Array<{ nombre: string; cantidad: number }>
  generado?: string
}

function analizarBackupJson(nombreArchivo: string, texto: string): PreviewImportacion {
  const data = JSON.parse(texto) as unknown
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('El archivo no contiene un objeto JSON de respaldo válido.')
  }
  const raiz = data as Record<string, unknown>
  const copia = (raiz.copia ?? raiz) as Record<string, unknown>
  if (!copia || typeof copia !== 'object' || Array.isArray(copia)) {
    throw new Error('El respaldo no contiene la estructura "copia".')
  }
  const colecciones: Array<{ nombre: string; cantidad: number }> = []
  let totalDocs = 0
  for (const [nombre, valor] of Object.entries(copia)) {
    if (!Array.isArray(valor)) {
      throw new Error(`La colección "${nombre}" no tiene formato de lista válido.`)
    }
    colecciones.push({ nombre, cantidad: valor.length })
    totalDocs += valor.length
  }
  return {
    archivoNombre: nombreArchivo,
    texto,
    totalDocs,
    colecciones,
    generado: typeof raiz.generado === 'string' ? raiz.generado : undefined,
  }
}

export default function BackupPage() {
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busyExport, setBusyExport] = useState(false)
  const [busyImport, setBusyImport] = useState(false)
  const [busyMovs, setBusyMovs] = useState(false)
  const [pendiente, setPendiente] = useState<PreviewImportacion | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const ocupado = busyExport || busyImport || busyMovs

  const descargar = async () => {
    setBusyExport(true)
    setMsg('')
    setError('')
    try {
      const { nombre, contenido } = await exportarBackup()
      const blob = new Blob([contenido], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Respaldo descargado exitosamente. Guárdalo en un almacenamiento seguro.')
    } catch (e: any) {
      setError(e?.message || 'No se pudo exportar el backup.')
    } finally {
      setBusyExport(false)
    }
  }

  const descargarMovimientosCompacto = async () => {
    setBusyMovs(true)
    setMsg('')
    setError('')
    try {
      const { nombre, contenido, totalMovimientos } = await exportarMovimientosCompacto()
      const blob = new Blob(['\uFEFF', contenido], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg(`Se exportaron los ${totalMovimientos} movimientos históricos en formato compacto (separado por "|").`)
    } catch (e: any) {
      setError(e?.message || 'No se pudieron exportar los movimientos.')
    } finally {
      setBusyMovs(false)
    }
  }

  const prepararImportacion = async (file: File) => {
    setMsg('')
    setError('')
    setPendiente(null)
    try {
      const texto = await file.text()
      const preview = analizarBackupJson(file.name, texto)
      setPendiente(preview)
    } catch (e: any) {
      setError(e?.message || 'Archivo JSON inválido.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmarImportacion = async () => {
    if (!pendiente || busyImport) return
    setBusyImport(true)
    setMsg('')
    setError('')
    try {
      const n = await importarBackup(pendiente.texto)
      invalidarSnapshotFinanciero()
      setPendiente(null)
      setMsg(`Restauración exitosa: ${n} documentos restaurados en Firestore.`)
    } catch (e: any) {
      setError(e?.message || 'Archivo JSON inválido o error al restaurar datos.')
    } finally {
      setBusyImport(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="glass-card overflow-hidden border-0">
        <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base font-extrabold text-white">
            <Database className="h-5 w-5 text-emerald-300" />
            <span>Copia de seguridad</span>
          </CardTitle>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>JSON puro</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 text-xs sm:p-6">
          <p className="text-sm leading-relaxed text-mist-500">
            Exporta una instantánea completa de tu base de datos: cuentas, deudas, vehículos, propiedades, nómina, recurrentes, impuestos, movimientos, calendario y configuración. Guárdala localmente o restáurala cuando quieras.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => void descargar()}
              className="h-10 cursor-pointer gap-2 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              <span>{busyExport ? 'Generando...' : 'Descargar copia (.json)'}</span>
            </Button>

            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => void descargarMovimientosCompacto()}
              className="h-10 cursor-pointer gap-2 border border-emerald-400/30 bg-emerald-400/15 px-4 text-xs font-bold text-emerald-200 hover:bg-emerald-400/25"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>{busyMovs ? 'Exportando...' : 'Exportar todos los movimientos (mín. tokens)'}</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => fileRef.current?.click()}
              className="h-10 cursor-pointer gap-2 border-white/10 bg-transparent px-4 text-xs text-mist-300 hover:bg-white/5 hover:text-white"
            >
              <Upload className="h-4 w-4" />
              <span>{busyImport ? 'Restaurando...' : 'Restaurar desde archivo'}</span>
            </Button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void prepararImportacion(f)
              }}
            />
          </div>

          {pendiente && (
            <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="space-y-1">
                  <div className="font-extrabold text-white">
                    Confirmar restauración de {pendiente.archivoNombre}
                  </div>
                  <p className="text-amber-200/90">
                    Se escribirán <b>{pendiente.totalDocs}</b> documento(s) en {pendiente.colecciones.length}{' '}
                    colección(es) de Firestore. Los registros con el mismo ID serán sobrescritos.
                    {pendiente.generado ? ` Respaldo generado: ${pendiente.generado.slice(0, 19).replace('T', ' ')}.` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pendiente.colecciones.map((c) => (
                  <span
                    key={c.nombre}
                    className="rounded-lg border border-amber-300/25 bg-black/25 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
                  >
                    {c.nombre}: {c.cantidad}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  disabled={busyImport}
                  onClick={() => void confirmarImportacion()}
                  className="h-9 cursor-pointer bg-amber-400 px-4 text-xs font-bold text-[#1f1300] hover:bg-amber-300"
                >
                  {busyImport ? 'Restaurando...' : 'Sí, restaurar respaldo'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyImport}
                  onClick={() => setPendiente(null)}
                  className="h-9 cursor-pointer border-white/15 bg-transparent text-xs text-mist-200 hover:bg-white/10"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {msg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 font-bold text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>{msg}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 font-medium text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
