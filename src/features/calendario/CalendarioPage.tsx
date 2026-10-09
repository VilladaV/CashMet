import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  construirEventos,
  guardarEventos,
  listarEventos,
  type EventoDoc,
  type EventoInput,
} from '@/lib/firebase/calendarioRepo'

const ETIQUETA: Record<string, string> = {
  soat: 'SOAT',
  tecnicomecanica: 'Tecnicomecánica',
  seguro_tr: 'Seguro',
  prima_julio: 'Prima julio',
  prima_diciembre: 'Prima diciembre',
  cuota_deuda: 'Cuota',
  predial: 'Predial',
  impuesto: 'Impuesto',
  pago_sueldo: 'Sueldo',
  nomina_trabajador: 'Nómina',
  recurrente: 'Recurrente',
  personal: 'Personal',
}

export default function CalendarioPage() {
  const [generando, setGenerando] = useState(false)
  const [eventos, setEventos] = useState<EventoDoc[]>([])
  const [preview, setPreview] = useState<EventoInput[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const cargar = () =>
    listarEventos()
      .then(setEventos)
      .catch(() => setError('No se pudieron cargar los eventos.'))

  useEffect(() => {
    cargar()
  }, [])

  const previsualizar = async () => {
    setGenerando(true)
    setError('')
    setMsg('')
    try {
      const evs = await construirEventos(12)
      setPreview(evs)
      setMsg(`Se generarán ${evs.length} eventos para los próximos 12 meses.`)
    } catch {
      setError('No se pudieron calcular los eventos. ¿Tienes vehículos, nómina o deudas registrados?')
    } finally {
      setGenerando(false)
    }
  }

  const guardar = async () => {
    if (!preview.length) return
    setGenerando(true)
    setError('')
    try {
      const n = await guardarEventos(preview)
      setMsg(`Se guardaron ${n} eventos.`)
      setPreview([])
      cargar()
    } catch {
      setError('No se pudieron guardar los eventos.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Calendario (Colombia)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Genera vencimientos desde tus datos: SOAT, tecnicomecánica, seguro todo riesgo, primas de servicios
            (julio/diciembre) y cuotas de deudas, para los próximos 12 meses.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={generando} onClick={previsualizar}>
              Previsualizar eventos
            </Button>
            <Button size="sm" disabled={generando || !preview.length} onClick={guardar}>
              Guardar {preview.length ? `(${preview.length})` : ''}
            </Button>
          </div>
          {msg && <div className="text-xs text-green-700">{msg}</div>}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previsualización ({preview.length})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="divide-y">
              {preview.map((e, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span>
                    {e.fechaInicio} — {e.titulo}
                  </span>
                  <span className="text-muted-foreground">{ETIQUETA[e.tipo] ?? e.tipo}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Eventos guardados</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {eventos.length === 0 ? (
            <p className="text-muted-foreground">Sin eventos guardados todavía.</p>
          ) : (
            <ul className="divide-y">
              {eventos.map((e) => (
                <li key={e.id} className="flex justify-between py-1.5">
                  <span>
                    {e.fechaInicio} — {e.titulo}
                  </span>
                  <span className="text-muted-foreground">{ETIQUETA[e.tipo] ?? e.tipo}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
