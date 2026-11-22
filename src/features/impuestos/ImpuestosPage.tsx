import { useCallback, useEffect, useMemo, useState } from 'react'
import CrudPage, { type CampoForm } from '@/components/CrudPage'
import { Button } from '@/components/ui/button'
import {
  actualizarImpuesto,
  crearImpuesto,
  eliminarImpuesto,
  listarImpuestos,
  registrarPagoImpuesto,
  type Impuesto,
  type PeriodicidadImpuesto,
  type TipoImpuesto,
} from '@/lib/firebase/impuestosRepo'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import { desformatearCifra } from '@/lib/utils'
import { AlertCircle, CheckCircle2, CreditCard } from 'lucide-react'

const num = (s: string) => {
  const limpio = String(s ?? '').trim()
  if (!limpio) return undefined
  const n = desformatearCifra(limpio)
  return Number.isFinite(n) ? n : undefined
}

const TIPOS: { value: TipoImpuesto; label: string }[] = [
  { value: 'predial', label: 'Predial' },
  { value: 'predial_bimestral', label: 'Predial (bimestral)' },
  { value: 'vehicular', label: 'Impuesto vehicular' },
  { value: 'renta', label: 'Renta' },
  { value: 'ica', label: 'ICA' },
  { value: 'otro', label: 'Otro' },
]

const PERIODICIDADES: { value: PeriodicidadImpuesto; label: string }[] = [
  { value: 'anual', label: 'Anual' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'unico', label: 'Pago único' },
]

const VACIO: Record<string, string> = { tipo: 'predial', periodicidad: 'anual', pagado: 'no', autoPagar: 'no' }

const etiquetaTipo = (t: TipoImpuesto) => TIPOS.find((x) => x.value === t)?.label ?? t

export default function ImpuestosPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [version, setVersion] = useState(0)
  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [pagoMsg, setPagoMsg] = useState('')
  const [pagoError, setPagoError] = useState('')

  const cargarCuentas = useCallback(async () => {
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
      if (!cancelado) void cargarCuentas()
    })
    return () => {
      cancelado = true
    }
  }, [cargarCuentas])

  const notificarCambio = useCallback(async () => {
    invalidarSnapshotFinanciero()
    await cargarCuentas()
  }, [cargarCuentas])

  const pagarAhora = async (i: Impuesto) => {
    if (pagandoId) return
    const cuenta = cuentas.find((c) => c.id === i.cuentaBancoId)
    const avisoCuenta = cuenta ? ` desde "${cuenta.nombre}"` : ''
    if (!confirm(`¿Registrar el pago de "${i.nombre}" por $${Math.round(i.valor || 0).toLocaleString('es-CO')} COP${avisoCuenta}?`)) {
      return
    }
    setPagandoId(i.id)
    setPagoMsg('')
    setPagoError('')
    try {
      const r = await registrarPagoImpuesto(i.id, { fuente: 'manual' })
      if (!r.ok) {
        if (r.yaPagado) {
          setPagoError(`"${i.nombre}" ya estaba marcado como pagado.`)
        } else if (r.saldoInsuficiente) {
          setPagoError(
            `Saldo insuficiente en "${r.cuentaNombre ?? 'la cuenta'}" (disponible: $${Math.round(r.saldoDisponible ?? 0).toLocaleString('es-CO')} COP).`
          )
        } else {
          setPagoError(`No se pudo registrar el pago de "${i.nombre}". Verifica que el monto y la cuenta sean válidos.`)
        }
        return
      }
      invalidarSnapshotFinanciero()
      setPagoMsg(`Pago registrado: "${i.nombre}" por $${Math.round(r.monto ?? i.valor ?? 0).toLocaleString('es-CO')} COP.`)
      setVersion((v) => v + 1)
      await cargarCuentas()
    } catch (e: any) {
      setPagoError(e?.message || 'No se pudo registrar el pago del impuesto.')
    } finally {
      setPagandoId(null)
    }
  }

  const campos = useMemo<CampoForm[]>(
    () => [
      { key: 'nombre', label: 'Nombre', required: true, span2: true },
      { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS },
      { key: 'entidad', label: 'Entidad / municipio' },
      { key: 'valor', label: 'Valor (COP)', tipo: 'cifra', required: true },
      { key: 'periodicidad', label: 'Periodicidad', tipo: 'select', opciones: PERIODICIDADES },
      { key: 'fechaVencimiento', label: 'Fecha de vencimiento', tipo: 'date' },
      {
        key: 'pagado',
        label: 'Pagado',
        tipo: 'select',
        opciones: [
          { value: 'si', label: 'Sí' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        key: 'autoPagar',
        label: '⚡ Pagar automáticamente al vencer',
        tipo: 'select',
        opciones: [
          { value: 'si', label: 'Sí' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        key: 'cuentaBancoId',
        label: 'Cuenta para descontar',
        tipo: 'select',
        required: true,
        opciones: cuentas.map((c) => ({
          value: c.id,
          label: `${c.nombre} · $${(Number(c.saldoActual) || 0).toLocaleString('es-CO')}`,
        })),
      },
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

  const bannersPago =
    pagoMsg || pagoError ? (
      <div className="space-y-2 text-xs">
        {pagoMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 font-bold text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{pagoMsg}</span>
          </div>
        )}
        {pagoError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 font-medium text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{pagoError}</span>
          </div>
        )}
      </div>
    ) : null

  return (
    <CrudPage<Impuesto>
      titulo="Impuesto"
      tituloPlural="Impuestos"
      descripcion="Predial, vehicular, renta, ICA y otros. Con vencimiento se agregan al calendario. Usa 'Registrar pago' para descontar el saldo y generar el movimiento automáticamente."
      campos={campos}
      vacio={vacio}
      refreshKey={version}
      onMutate={notificarCambio}
      extra={bannersPago}
      listar={listarImpuestos}
      crear={(d) => crearImpuesto(d)}
      actualizar={(id, d) => actualizarImpuesto(id, d)}
      eliminar={(id) => eliminarImpuesto(id)}
      transformar={(vals) => {
        const valorNum = num(vals.valor)
        if (valorNum === undefined || valorNum <= 0) {
          throw new Error('El valor del impuesto debe ser mayor a cero.')
        }
        const autoPagar = vals.autoPagar === 'si'
        if (autoPagar && !vals.fechaVencimiento) {
          throw new Error('Para activar el pago automático debes indicar una fecha de vencimiento.')
        }
        return {
          nombre: vals.nombre.trim(),
          tipo: vals.tipo || 'otro',
          valor: Math.round(valorNum),
          periodicidad: vals.periodicidad || 'anual',
          pagado: vals.pagado === 'si',
          autoPagar,
          entidad: vals.entidad?.trim() || null,
          fechaVencimiento: vals.fechaVencimiento || null,
          cuentaBancoId: vals.cuentaBancoId || null,
          notas: vals.notas?.trim() || null,
        }
      }}
      aForm={(i) => ({
        nombre: i.nombre,
        tipo: i.tipo,
        entidad: i.entidad ?? '',
        valor: String(i.valor ?? ''),
        periodicidad: i.periodicidad,
        fechaVencimiento: i.fechaVencimiento ?? '',
        pagado: i.pagado ? 'si' : 'no',
        autoPagar: i.autoPagar ? 'si' : 'no',
        cuentaBancoId: i.cuentaBancoId ?? '',
        notas: i.notas ?? '',
      })}
      renderItem={(i) => {
        const cuenta = cuentas.find((c) => c.id === i.cuentaBancoId)
        return (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">
                {i.nombre} <span className="text-muted-foreground">({etiquetaTipo(i.tipo)})</span>
                {i.autoPagar ? ' — ⚡ auto' : ''}
                {i.pagado ? ' — pagado' : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                ${(i.valor || 0).toLocaleString('es-CO')} / {i.periodicidad}
                {i.fechaVencimiento ? ` · Vence ${i.fechaVencimiento}` : ''}
                {i.entidad ? ` · ${i.entidad}` : ''}
                {cuenta ? ` · Cuenta: ${cuenta.nombre}` : ''}
                {i.pagado && i.fechaPago ? ` · Pagado el ${i.fechaPago}` : ''}
              </div>
            </div>
            {!i.pagado && (
              <Button
                size="sm"
                variant="outline"
                disabled={pagandoId !== null}
                onClick={() => void pagarAhora(i)}
                className="h-7 cursor-pointer gap-1 border-emerald-400/30 bg-emerald-400/10 px-2.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-400/20"
              >
                <CreditCard className="h-3 w-3" />
                <span>{pagandoId === i.id ? 'Pagando...' : 'Registrar pago'}</span>
              </Button>
            )}
          </div>
        )
      }}
    />
  )
}
