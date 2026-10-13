import { useEffect, useMemo, useState } from 'react'
import CrudPage, { type CampoForm } from '@/components/CrudPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CheckCircle2, AlertCircle, CalendarClock } from 'lucide-react'
import {
  CATEGORIAS_RECURRENTE,
  PERIODICIDADES,
  actualizarRecurrente,
  crearRecurrente,
  eliminarRecurrente,
  generarEventosRecurrentes,
  generarMovimientosRecurrentes,
  listarRecurrentes,
  type GastoRecurrente,
} from '@/lib/firebase/recurrentesRepo'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const mesActual = () => new Date().toISOString().slice(0, 7)

const VACIO: Record<string, string> = {
  categoria: 'hogar',
  periodicidad: 'mensual',
  activo: 'si',
  autoGenerar: 'si',
  cuentaBancoId: '',
}

export default function RecurrentesPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [mes, setMes] = useState(mesActual())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => {})
  }, [])

  const campos = useMemo<CampoForm[]>(
    () => [
      { key: 'concepto', label: 'Concepto', required: true, span2: true },
      { key: 'categoria', label: 'Categoría', tipo: 'select', opciones: CATEGORIAS_RECURRENTE.map((t) => ({ value: t, label: t })) },
      { key: 'valor', label: 'Valor (COP)', tipo: 'number', required: true },
      { key: 'periodicidad', label: 'Periodicidad', tipo: 'select', opciones: PERIODICIDADES.map((t) => ({ value: t, label: t })) },
      { key: 'diaVencimiento', label: 'Día de vencimiento (1-31)', tipo: 'number' },
      { key: 'fechaInicio', label: 'Fecha de inicio (para periodicidad)', tipo: 'date' },
      {
        key: 'cuentaBancoId',
        label: 'Cuenta que afecta (opcional)',
        tipo: 'select',
        opciones: [{ value: '', label: 'Sin cuenta' }, ...cuentas.map((c) => ({ value: c.id, label: c.nombre }))],
      },
      { key: 'autoGenerar', label: 'Generar automáticamente', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      { key: 'activo', label: 'Activo', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      { key: 'notas', label: 'Notas', span2: true },
    ],
    [cuentas]
  )

  const generar = async () => {
    setBusy(true)
    setMsg('')
    setError('')
    try {
      const movs = await generarMovimientosRecurrentes(mes)
      const evs = await generarEventosRecurrentes(mes)
      setMsg(`Mes ${mes}: ${movs} movimiento(s) y ${evs} evento(s) generados.`)
    } catch (e: any) {
      setError(e?.message || 'No se pudieron generar los recurrentes.')
    } finally {
      setBusy(false)
    }
  }

  const extra = (
    <Card className="glass-card overflow-hidden border-0">
      <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
      <CardHeader className="border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white">
          <CalendarClock className="h-4 w-4 text-emerald-300" />
          <span>Generar recurrentes del mes</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 text-xs sm:p-6">
        <p className="leading-relaxed text-mist-500">
          Crea los movimientos (gastos) y los eventos de calendario de los recurrentes activos con
          “Generar automáticamente”. Es idempotente: no duplica lo ya generado para ese mes.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Mes</span>
            <Input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="field-dark h-10 w-40 text-xs shadow-none"
            />
          </label>
          <Button
            size="sm"
            disabled={busy || !mes}
            onClick={generar}
            className="h-10 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
          >
            {busy ? 'Generando...' : 'Generar movimientos y eventos'}
          </Button>
        </div>
        {msg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 font-bold text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 font-medium text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <CrudPage<GastoRecurrente>
      titulo="Gasto recurrente"
      descripcion="Gastos fijos (internet, luz, agua, arriendo...) para proyecciones, movimientos automáticos y recordatorios."
      campos={campos}
      vacio={VACIO}
      listar={listarRecurrentes}
      crear={(d) => crearRecurrente(d)}
      actualizar={(id, d) => actualizarRecurrente(id, d)}
      eliminar={(id) => eliminarRecurrente(id)}
      extra={extra}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {
          concepto: vals.concepto.trim(),
          categoria: vals.categoria || 'hogar',
          valor: num(vals.valor),
          periodicidad: vals.periodicidad || 'mensual',
          autoGenerar: vals.autoGenerar !== 'no',
          activo: vals.activo !== 'no',
        }
        const dia = num(vals.diaVencimiento as string)
        if (dia !== undefined) doc.diaVencimiento = dia
        if (vals.fechaInicio) doc.fechaInicio = vals.fechaInicio
        if (vals.cuentaBancoId) doc.cuentaBancoId = vals.cuentaBancoId
        if (vals.notas?.trim()) doc.notas = vals.notas.trim()
        return doc
      }}
      aForm={(g) => ({
        concepto: g.concepto,
        categoria: g.categoria,
        valor: String(g.valor ?? ''),
        periodicidad: g.periodicidad,
        diaVencimiento: g.diaVencimiento != null ? String(g.diaVencimiento) : '',
        fechaInicio: g.fechaInicio ?? '',
        cuentaBancoId: g.cuentaBancoId ?? '',
        autoGenerar: g.autoGenerar === false ? 'no' : 'si',
        activo: g.activo === false ? 'no' : 'si',
        notas: g.notas ?? '',
      })}
      renderItem={(g) => (
        <div>
          <div className="font-medium">
            {g.concepto} <span className="text-muted-foreground">({g.categoria})</span>
            {g.activo === false ? ' — inactivo' : ''}
            {g.autoGenerar === false ? ' — no automático' : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            ${(g.valor || 0).toLocaleString('es-CO')} / {g.periodicidad}
            {g.diaVencimiento ? ` · Vence día ${g.diaVencimiento}` : ''}
          </div>
        </div>
      )}
    />
  )
}
