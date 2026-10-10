import { useEffect, useState } from 'react'
import CrudPage, { type CampoForm } from '@/components/CrudPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  ESTADOS_DEUDA,
  TIPOS_DEUDA,
  actualizarDeuda,
  crearDeuda,
  eliminarDeuda,
  listarDeudas,
  registrarPagoDeuda,
  type Deuda,
} from '@/lib/firebase/deudasRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const NUMERICOS = new Set(['montoInicial', 'saldoPendiente', 'cuotaMensual', 'tasaInteres', 'fechaVencimientoCuota'])

const CAMPOS: CampoForm[] = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_DEUDA.map((t) => ({ value: t, label: t })) },
  { key: 'entidad', label: 'Entidad' },
  { key: 'montoInicial', label: 'Monto inicial (COP)', tipo: 'number' },
  { key: 'saldoPendiente', label: 'Saldo pendiente (COP)', tipo: 'number', required: true },
  { key: 'cuotaMensual', label: 'Cuota mensual (COP)', tipo: 'number' },
  { key: 'tasaInteres', label: 'Tasa interés (%)', tipo: 'number' },
  { key: 'fechaVencimientoCuota', label: 'Día de vencimiento (1-31)', tipo: 'number' },
  { key: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS_DEUDA.map((t) => ({ value: t, label: t })) },
  { key: 'notas', label: 'Notas', span2: true },
]

const VACIO: Record<string, string> = { estado: 'activa' }

function PagoDeuda() {
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [deudaId, setDeudaId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = () =>
    listarDeudas()
      .then((d) => {
        const activas = d.filter((x) => x.estado !== 'pagada')
        setDeudas(activas)
        if (activas.length && !activas.some((x) => x.id === deudaId)) setDeudaId(activas[0].id)
      })
      .catch(() => setError('No se pudieron cargar las deudas.'))

  useEffect(() => {
    cargar()
  }, [])

  const pagar = async () => {
    const montoNum = Number(monto.replace(/[^\d.]/g, '')) || 0
    if (!deudaId || montoNum <= 0) return
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await registrarPagoDeuda(deudaId, montoNum, fecha)
      setMsg(`Pago registrado: $${montoNum.toLocaleString('es-CO')}.`)
      setMonto('')
      cargar()
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el pago.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar pago de cuota</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Deuda</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={deudaId}
              onChange={(e) => setDeudaId(e.target.value)}
            >
              {deudas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} (saldo $ {(d.saldoPendiente || 0).toLocaleString('es-CO')})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Monto (COP)</span>
            <Input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Fecha</span>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        {msg && <div className="text-xs text-green-700">{msg}</div>}
        {error && <div className="text-xs text-red-600">{error}</div>}
        <Button size="sm" disabled={busy || !deudaId} onClick={pagar}>
          {busy ? '...' : 'Registrar pago'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function DeudasPage() {
  return (
    <CrudPage<Deuda>
      titulo="Deuda"
      descripcion="Registra tus deudas (crédito, tarjeta, préstamo...). El chat y el calendario las usarán para cuotas y vencimientos."
      campos={CAMPOS}
      vacio={VACIO}
      listar={listarDeudas}
      crear={(d) => crearDeuda(d)}
      actualizar={(id, d) => actualizarDeuda(id, d)}
      eliminar={(id) => eliminarDeuda(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {}
        for (const c of CAMPOS) {
          const v = vals[c.key]
          if (!v && v !== '0') continue
          doc[c.key] = NUMERICOS.has(c.key) ? num(v) : String(v).trim()
        }
        doc.estado = vals.estado || 'activa'
        return doc
      }}
      aForm={(d) => {
        const f: Record<string, string> = {}
        for (const c of CAMPOS) {
          const v = (d as unknown as Record<string, unknown>)[c.key]
          f[c.key] = v === undefined || v === null ? '' : String(v)
        }
        return f
      }}
      renderItem={(d) => (
        <div>
          <div className="font-medium">
            {d.nombre} <span className="text-muted-foreground">({d.tipo})</span>{' '}
            {d.estado !== 'activa' && <span className="text-muted-foreground">— {d.estado}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            Saldo: ${(d.saldoPendiente || 0).toLocaleString('es-CO')}
            {d.cuotaMensual ? ` · Cuota: $${d.cuotaMensual.toLocaleString('es-CO')}` : ''}
            {d.fechaVencimientoCuota ? ` · Día ${d.fechaVencimientoCuota}` : ''}
          </div>
        </div>
      )}
      extra={<PagoDeuda />}
    />
  )
}