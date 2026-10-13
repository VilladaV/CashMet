import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { exportarBackup, importarBackup } from '@/lib/firebase/backup'
import { Download, Upload, ShieldCheck, Database, CheckCircle2, AlertCircle } from 'lucide-react'

export default function BackupPage() {
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const descargar = async () => {
    setBusy(true)
    setMsg('')
    setError('')
    try {
      const { nombre, contenido } = await exportarBackup()
      const blob = new Blob([contenido], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
      setMsg('Respaldo descargado exitosamente. Guárdalo en un almacenamiento seguro.')
    } catch (e: any) {
      setError(e?.message || 'No se pudo exportar el backup.')
    } finally {
      setBusy(false)
    }
  }

  const importar = async (file: File) => {
    setBusy(true)
    setMsg('')
    setError('')
    try {
      const texto = await file.text()
      const n = await importarBackup(texto)
      setMsg(`Restauración exitosa: ${n} documentos restaurados en Firestore.`)
    } catch (e: any) {
      setError(e?.message || 'Archivo JSON inválido o error al restaurar datos.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
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
            Exporta una instantánea completa de tu base de datos: cuentas, deudas, vehículos, propiedades, nómina, recurrentes, movimientos y calendario. Guárdala localmente o restáurala cuando quieras.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button
              size="sm"
              disabled={busy}
              onClick={descargar}
              className="h-10 cursor-pointer gap-2 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              <span>{busy ? 'Generando...' : 'Descargar copia (.json)'}</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-10 cursor-pointer gap-2 border-white/10 bg-transparent px-4 text-xs text-mist-300 hover:bg-white/5 hover:text-white"
            >
              <Upload className="h-4 w-4" />
              <span>Restaurar desde archivo</span>
            </Button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importar(f)
              }}
            />
          </div>

          {msg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 font-bold text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>{msg}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 font-medium text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
