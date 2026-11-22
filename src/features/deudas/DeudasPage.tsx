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
  type ErrorPagoDeuda,
} from '@/lib/firebase/deudasRepo'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import { hoyISO } from '@/lib/fechas'
import { desformatearCifra } from '@/lib/utils'
import { AlertCircle, CheckCircle2, CreditCard } from 'lucide-react'

const num = (s: string) => {
  const limpio = String(s ?? '').trim()
  if (!limpio) return undefined
  const n = desformatearCifra(limpio)
  return Number.isFinite(n) ? n : undefined
}

const NUMERICOS = new Set(['montoInicial', 'saldoPendiente', 'cuotaMensual', 'tasaInteres', 'fechaVencimientoCuota'])
const OPCIONALES = new Set(['entidad', 'montoInicial', 'cuotaMensual', 'tasaInteres', 'fechaVencimientoCuota', 'notas'])

const VACIO: Record<string, string> = { tipo: 'consumo', estado: 'activa', autoDescontar: 'no' }

function mensajeErrorPago(
  error: ErrorPagoDeuda | string,
  saldoPendiente?: number,
  saldoDisponible?: number
): string {
  switch (error) {
    case 'monto_invalido':
      return 'El monto del pago debe ser mayor a cero.'
    case 'fecha_invalida':
      return 'La fecha ingresada no es válida.'
    case 'deuda_no_encontrada':
      return 'No se encontró la deuda seleccionada.'
    case 'deuda_pagada':
      return 'Esta deuda ya está marcada como pagada.'
    case 'monto_excede_saldo':
      return `El pago supera el saldo pendiente ($${Math.round(saldoPendiente ?? 0).toLocaleString('es-CO')} COP).`
    case 'cuenta_no_encontrada':
      return 'La cuenta seleccionada ya no existe. Elige otra cuenta.'
    case 'saldo_insuficiente':
      return `Saldo insuficiente en la cuenta (disponible: $${Math.round(saldoDisponible ?? 0).toLocaleString('es-CO')} COP).`
    default:
      return 'No se pudo registrar el pago de la deuda.'
  }
}

function PagoDeuda({
  cuentas,
  version,
  onPagoRegistrado,
}: {
  cuentas: CuentaBanco[]
  version: number
  onPagoRegistrado: () => void | Promise<void>
}) {
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [deudaId, setDeudaId] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => hoyISO())
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(() => {
    listarDeudas()
      .then((d) => {
        const activas = d.filter((x) => x.estado !== 'pagada')
        setDeudas(activas)
        setDeudaId((actual) => {
          if (actual && activas.some((x) => x.id === actual)) return actual
          const primera = activas[0]
          if (primera?.cuentaBancoId) setCuentaId(primera.cuentaBancoId)
          return primera?.id ?? ''
        })
      })
      .catch(() => setError('No se pudieron cargar las deudas.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar, version])

  const cuentaEfectiva =
    (cuentaId && cuentas.some((c) => c.id === cuentaId) ? cuentaId : cuentas[0]?.id) || ''

  const pagar = async () => {
    setMsg('')
    setError('')
    const montoNum = desformatearCifra(monto)
    if (!deudaId) {
      setError('Selecciona una deuda activa.')
      return
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('El monto del pago debe ser mayor a cero.')
      return
    }
    if (!cuentaEfectiva) {
      setError('Debes elegir la cuenta bancaria de la cual se descontará el pago.')
      return
    }
    setBusy(true)
    try {
      const r = await registrarPagoDeuda(deudaId, montoNum, fecha, cuentaEfectiva, 'manual')
      if (!r.ok) {
        setError(mensajeErrorPago(r.error, r.saldoPendiente, r.saldoDisponible))
        return
      }
      invalidarSnapshotFinanciero()
      setMsg(
        r.cerrada
          ? `Pago registrado ($${Math.round(montoNum).toLocaleString('es-CO')} COP). ¡Deuda saldada por completo!`
          : `Pago registrado y descontado: $${Math.round(montoNum).toLocaleString('es-CO')} COP. Saldo restante: $${Math.round(r.saldoPendiente).toLocaleString('es-CO')} COP.`
      )
      setMonto('')
      await onPagoRegistrado()
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el pago.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-500" />
      <CardHeader className="border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white">
          <CreditCard className="h-4 w-4 text-emerald-300" />
          <span>Registrar pago de cuota</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 text-xs sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="font-bold text-mist-300">Deuda</span>
            <select
              className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
              value={deudaId}
              onChange={(e) => {
                const id = e.target.value
                setDeudaId(id)
                const sel = deudas.find((x) => x.id === id)
                if (sel?.cuentaBancoId) setCuentaId(sel.cuentaBancoId)
              }}
            >
              {deudas.length === 0 && <option value="">Sin deudas activas</option>}
              {deudas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} (saldo ${(d.saldoPendiente || 0).toLocaleString('es-CO')})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="font-bold text-mist-300">
              Cuenta a descontar <span className="text-red-300">*</span>
            </span>
            <select
              className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
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
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Monto (COP)</span>
            <Input
              cifra
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Fecha</span>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
        </div>

        {msg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 font-bold text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 font-medium text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button
          size="sm"
          disabled={busy || !deudaId || !cuentaEfectiva}
          onClick={() => void pagar()}
          className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
        >
          {busy ? 'Registrando...' : 'Registrar pago'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function DeudasPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [version, setVersion] = useState(0)

  const recargarCuentas = useCallback(async () => {
    try {
      const lista = await listarCuentasBanco()
      setCuentas(lista)
    } catch {
      /* sin cuentas */
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    void Promise.resolve().then(() => {
      if (!cancelado) void recargarCuentas()
    })
    return () => {
      cancelado = true
    }
  }, [recargarCuentas])

  const notificarCambio = useCallback(async () => {
    invalidarSnapshotFinanciero()
    setVersion((v) => v + 1)
    await recargarCuentas()
  }, [recargarCuentas])

  const campos = useMemo<CampoForm[]>(
    () => [
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'tipo', label: 'Tipo', tipo: 'select', required: true, opciones: TIPOS_DEUDA.map((t) => ({ value: t, label: t })) },
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
      tituloPlural="Deudas"
      descripcion="Registra tus deudas (crédito, tarjeta, préstamo...). El chat y el calendario las usarán para cuotas y vencimientos."
      campos={campos}
      vacio={vacio}
      refreshKey={version}
      onMutate={notificarCambio}
      listar={listarDeudas}
      crear={(d) => crearDeuda(d)}
      actualizar={(id, d) => actualizarDeuda(id, d)}
      eliminar={(id) => eliminarDeuda(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {}
        for (const c of campos) {
          const raw = String(vals[c.key] ?? '').trim()
          if (!raw) {
            if (OPCIONALES.has(c.key)) doc[c.key] = null
            continue
          }
          if (c.key === 'fechaVencimientoCuota') {
            const dia = Number(raw)
            if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
              throw new Error('El día de vencimiento de la cuota debe ser un número entero entre 1 y 31.')
            }
            doc[c.key] = dia
          } else if (NUMERICOS.has(c.key)) {
            const valNum = num(raw)
            if (valNum === undefined || valNum < 0) {
              throw new Error(`${c.label} debe ser un número válido mayor o igual a 0.`)
            }
            doc[c.key] = valNum
          } else {
            doc[c.key] = raw
          }
        }
        doc.tipo = vals.tipo || 'consumo'
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
        f.tipo = d.tipo || 'consumo'
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
      extra={<PagoDeuda cuentas={cuentas} version={version} onPagoRegistrado={notificarCambio} />}
    />
  )
}
