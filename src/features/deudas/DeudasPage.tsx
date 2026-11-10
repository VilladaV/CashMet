import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const NUMERICOS = new Set(['montoInicial', 'saldoPendiente', 'cuotaMensual', 'tasaInteres', 'fechaVencimientoCuota'])

const VACIO: Record<string, string> = { estado: 'activa', autoDescontar: 'no' }

function PagoDeuda({ cuentas }: { cuentas: CuentaBanco[] }) {
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [deudaId, setDeudaId] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(() => {
    listarDeudas()
      .then((d) => {
        const activas = d.filter((x) => x.estado !== 'pagada')
        setDeudas(activas)
        if (activas.length && !activas.some((x) => x.id === deudaId)) {
          setDeudaId(activas[0].id)
          if (activas[0].cuentaBancoId) setCuentaId(activas[0].cuentaBancoId)
        }
      })
      .catch(() => setError('No se pudieron cargar las deudas.'))
  }, [deudaId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cuentaEfectiva = cuentaId || cuentas[0]?.id || ''

  const pagar = async () => {
    const montoNum = Number(monto.replace(/[^\d.]/g, '')) || 0
    if (!deudaId || montoNum <= 0) return
    if (!cuentaEfectiva) {
      setError('Debes elegir la cuenta bancaria de la cual se descontará el pago.')
      return
    }
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await registrarPagoDeuda(deudaId, montoNum, fecha, cuentaEfectiva, 'manual')
      setMsg(`Pago registrado y descontado: $${montoNum.toLocaleString('es-CO')}.`)
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
              onChange={(e) => {
                const id = e.target.value
                setDeudaId(id)
                const sel = deudas.find((x) => x.id === id)
                if (sel?.cuentaBancoId) setCuentaId(sel.cuentaBancoId)
              }}
            >
              {deudas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} (saldo $ {(d.saldoPendiente || 0).toLocaleString('es-CO')})
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Cuenta a descontar *</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={cuentaEfectiva}
              onChange={(e) => setCuentaId(e.target.value)}
            >
              {cuentas.length === 0 && <option value="">Crea primero una cuenta en Cuentas</option>}
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} (saldo ${(Number(c.saldoActual) || 0).toLocaleString('es-CO')})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Monto (COP)</span>
            <Input cifra value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Fecha</span>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        {msg && <div className="text-xs text-emerald-300">{msg}</div>}
        {error && <div className="text-xs text-red-300">{error}</div>}
        <Button size="sm" disabled={busy || !deudaId || !cuentaEfectiva} onClick={pagar}>
          {busy ? '...' : 'Registrar pago'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function DeudasPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])

  useEffect(() => {
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => {})
  }, [])

  const campos = useMemo<CampoForm[]>(
    () => [
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_DEUDA.map((t) => ({ value: t, label: t })) },
      { key: 'entidad', label: 'Entidad' },
      { key: 'montoInicial', label: 'Monto inicial (COP)', tipo: 'cifra' },
      { key: 'saldoPendiente', label: 'Saldo pendiente (COP)', tipo: 'cifra', required: true },
      { key: 'cuotaMensual', label: 'Cuota mensual (COP)', tipo: 'cifra' },
      { key: 'tasaInteres', label: 'Tasa interés (%)', tipo: 'number' },
      { key: 'fechaVencimientoCuota', label: 'Día de vencimiento (1-31)', tipo: 'number' },
      {
        key: 'cuentaBancoId',
        label: 'Cuenta para descontar cuotas',
        tipo: 'select',
        required: true,
        opciones: cuentas.map((c) => ({
          value: c.id,
          label: `${c.nombre} · $${(Number(c.saldoActual) || 0).toLocaleString('es-CO')}`,
        })),
      },
      { key: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS_DEUDA.map((t) => ({ value: t, label: t })) },
      { key: 'autoDescontar', label: 'Descontar cuota automáticamente', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      { key: 'notas', label: 'Notas', span2: true },
    ],
    [cuentas]
  )

  const vacio = useMemo<Record<string, string>>(
    () => ({
      ...VACIO,
      cuentaBancoId: cuentas[0]?.id ?? '',
    }),
    [cuentas]
  )

  return (
    <CrudPage<Deuda>
      titulo="Deuda"
      descripcion="Registra tus deudas (crédito, tarjeta, préstamo...). El chat y el calendario las usarán para cuotas y vencimientos."
      campos={campos}
      vacio={vacio}
      listar={listarDeudas}
      crear={(d) => crearDeuda(d)}
      actualizar={(id, d) => actualizarDeuda(id, d)}
      eliminar={(id) => eliminarDeuda(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {}
        for (const c of campos) {
          const v = vals[c.key]
          if (!v && v !== '0') continue
          doc[c.key] = NUMERICOS.has(c.key) ? num(v) : String(v).trim()
        }
        doc.estado = vals.estado || 'activa'
        doc.autoDescontar = vals.autoDescontar === 'si'
        return doc
      }}
      aForm={(d) => {
        const f: Record<string, string> = {}
        for (const c of campos) {
          const v = (d as unknown as Record<string, unknown>)[c.key]
          f[c.key] = v === undefined || v === null ? '' : String(v)
        }
        f.cuentaBancoId = d.cuentaBancoId || cuentas[0]?.id || ''
        f.autoDescontar = d.autoDescontar ? 'si' : 'no'
        return f
      }}
      renderItem={(d) => {
        const cuenta = cuentas.find((c) => c.id === d.cuentaBancoId)
        return (
          <div>
            <div className="font-medium">
              {d.nombre} <span className="text-muted-foreground">({d.tipo})</span>{' '}
              {d.estado !== 'activa' && <span className="text-muted-foreground">— {d.estado}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              Saldo: ${(d.saldoPendiente || 0).toLocaleString('es-CO')}
              {d.cuotaMensual ? ` · Cuota: $${d.cuotaMensual.toLocaleString('es-CO')}` : ''}
              {d.fechaVencimientoCuota ? ` · Día ${d.fechaVencimientoCuota}` : ''}
              {cuenta ? ` · Cuenta: ${cuenta.nombre}` : ''}
              {d.autoDescontar ? ' · ⚡ auto' : ''}
            </div>
          </div>
        )
      }}
      extra={<PagoDeuda cuentas={cuentas} />}
    />
  )
}