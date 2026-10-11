import { useRef, useState } from 'react'
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
    <div className="container mx-auto p-2 sm:p-4 max-w-4xl space-y-4">
      <Card className="glass-card shadow-sm border-slate-200/90 overflow-hidden">
        <div className="h-1.5 w-full gradient-brand-growth" />
        <CardHeader className="py-4 px-4 sm:px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <span>Copia de Seguridad y Restauración de Datos</span>
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Formato JSON Puro</span>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed text-sm">
            Exporta una instantánea completa de tu base de datos financiera: cuentas bancarias, deudas, vehículos, propiedades, trabajadores de nómina, gastos recurrentes fijos, movimientos y calendario de vencimientos. Puedes guardarla localmente o restaurarla en cualquier momento.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button
              size="sm"
              disabled={busy}
              onClick={descargar}
              className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-9 px-4 gap-2 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{busy ? 'Generando...' : 'Descargar Copia de Seguridad (.json)'}</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="text-xs h-9 px-4 border-slate-200 text-slate-700 hover:bg-slate-100 gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Restaurar desde Archivo JSON</span>
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
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{msg}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}