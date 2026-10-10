import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { exportarBackup, importarBackup } from '@/lib/firebase/backup'

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
      setMsg('Backup descargado. Guárdalo en un lugar seguro.')
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
      setMsg(`Importación completa: ${n} documentos restaurados.`)
    } catch (e: any) {
      setError(e?.message || 'Archivo inválido o no se pudo importar.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Backup de datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Exporta toda tu información (cuentas, deudas, vehículos, propiedades, nómina, recurrentes, movimientos y
            calendario) a un archivo JSON. También puedes restaurarla desde un backup previo.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={descargar}>
              {busy ? '...' : 'Descargar backup'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              Importar backup
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
          {msg && <div className="text-xs text-green-700">{msg}</div>}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </CardContent>
      </Card>
    </div>
  )
}