import { useEffect, useState } from 'react'
import { saldoPendienteTarjeta } from './repo'
import type { PreciosCombustible, TanqueoRegistro, TarjetaCombustibleReserva } from './types'
import type { CuentaBanco } from '@/lib/firebase/movimientosRepo'
import {
  CreditCard,
  Fuel,
  ArrowRight,
  DollarSign,
  History,
  RefreshCw,
  Pencil,
  Check,
  Archive,
} from 'lucide-react'

interface Props {
  tarjeta: TarjetaCombustibleReserva
  historialTarjetas?: TarjetaCombustibleReserva[]
  precios: PreciosCombustible
  cuentasCashmet: CuentaBanco[]
  onLiquidar: (cuentaBancoId: string, tarjetaIdObjetivo?: string) => Promise<void>
  onActualizarPreciosWeb?: () => Promise<void>
  onGuardarPreciosManuales?: (valores: {
    corrientePorGalon: number
    dieselPorGalon: number
    extraPorGalon: number
  }) => Promise<void>
  busy?: boolean
  actualizandoPrecios?: boolean
  cargando?: boolean
}

const PRECIO_MIN_COP = 5000
const PRECIO_MAX_COP = 60000

const COD = (n: number) => `$${Math.round(Number.isFinite(n) ? n : 0).toLocaleString('es-CO')}`

function monedaCuenta(c: CuentaBanco): string {
  return ((c.moneda as string | undefined) || 'COP').toUpperCase()
}

function formatearSaldoCuenta(c: CuentaBanco): string {
  const mon = monedaCuenta(c)
  const val = Number.isFinite(c.saldoActual) ? c.saldoActual : 0
  if (mon === 'COP') return COD(val)
  return `${mon} ${val.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`
}

function etiquetaMotivoTanqueo(motivo: TanqueoRegistro['motivo']): string {
  if (motivo === 'reserva_automatica') return 'Auto-tanqueo (Reserva)'
  if (motivo === 'preventivo_mision') return 'Preventivo (Misión)'
  return 'Tanqueo manual'
}

export default function TarjetaCombustibleWidget({
  tarjeta,
  historialTarjetas = [],
  precios,
  cuentasCashmet,
  onLiquidar,
  onActualizarPreciosWeb,
  onGuardarPreciosManuales,
  busy,
  actualizandoPrecios,
  cargando,
}: Props) {
  const [cuentaId, setCuentaId] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [procesandoLocal, setProcesandoLocal] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  // Editor manual de precios
  const [editandoPrecios, setEditandoPrecios] = useState(false)
  const [guardandoPrecios, setGuardandoPrecios] = useState(false)
  const [errorPrecios, setErrorPrecios] = useState('')
  const [corrInput, setCorrInput] = useState(String(precios.corrientePorGalon))
  const [diesInput, setDiesInput] = useState(String(precios.dieselPorGalon))
  const [extInput, setExtInput] = useState(String(precios.extraPorGalon))

  useEffect(() => {
    if (!modalAbierto) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalAbierto(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalAbierto])

  const cuentasCop = cuentasCashmet.filter((c) => monedaCuenta(c) === 'COP')
  const cuentaSeleccionada =
    cuentasCashmet.find((c) => c.id === cuentaId) || cuentasCop[0] || cuentasCashmet[0] || null
  const cuentaEfectiva = cuentaSeleccionada?.id || ''
  const cuentaEsCop = cuentaSeleccionada ? monedaCuenta(cuentaSeleccionada) === 'COP' : false

  const pendienteActual = saldoPendienteTarjeta(tarjeta)
  const liquidadoActual = Math.max(0, (tarjeta.saldoAcumuladoCOP || 0) - pendienteActual)
  const tarjetasArchivadasConPendiente = historialTarjetas.filter((h) => saldoPendienteTarjeta(h) > 0)
  const pendienteArchivadoTotal = tarjetasArchivadasConPendiente.reduce(
    (acc, h) => acc + saldoPendienteTarjeta(h),
    0
  )
  const pendienteTotalAcumulado = pendienteActual + pendienteArchivadoTotal
  const bloqueado = Boolean(busy || procesandoLocal)

  const ejecutarLiquidacion = async (tarjetaObjetivo?: TarjetaCombustibleReserva) => {
    if (bloqueado) return
    if (!cuentaSeleccionada || !cuentaEfectiva) {
      setError('Debes registrar y elegir una cuenta bancaria en COP de CashMet para descontar el combustible.')
      return
    }
    if (!cuentaEsCop) {
      setError(
        `La cuenta "${cuentaSeleccionada.nombre}" está en ${monedaCuenta(cuentaSeleccionada)}. Selecciona una cuenta en COP para liquidar combustible.`
      )
      return
    }

    const objetivo = tarjetaObjetivo || tarjeta
    const montoALiquidar = saldoPendienteTarjeta(objetivo)
    if (montoALiquidar <= 0) {
      setError('No hay saldo pendiente por liquidar en este periodo.')
      return
    }
    if ((cuentaSeleccionada.saldoActual ?? 0) < montoALiquidar) {
      setError(
        `Saldo insuficiente en "${cuentaSeleccionada.nombre}" (${COD(cuentaSeleccionada.saldoActual)}) para cubrir ${COD(montoALiquidar)}.`
      )
      return
    }

    if (tarjetaObjetivo) {
      const ok = window.confirm(
        `¿Confirmas liquidar el mes archivado ${tarjetaObjetivo.mes} por ${COD(montoALiquidar)} desde la cuenta "${cuentaSeleccionada.nombre}"?`
      )
      if (!ok) return
    }

    setError('')
    setMsg('')
    setProcesandoLocal(true)
    try {
      await onLiquidar(cuentaEfectiva, tarjetaObjetivo?.id)
      setMsg('¡Liquidado con éxito! Se registró el gasto en CashMet y se actualizó el saldo bancario.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo liquidar la tarjeta de combustible.')
    } finally {
      setProcesandoLocal(false)
    }
  }

  const abrirEditorPrecios = () => {
    setErrorPrecios('')
    setCorrInput(String(precios.corrientePorGalon))
    setDiesInput(String(precios.dieselPorGalon))
    setExtInput(String(precios.extraPorGalon))
    setEditandoPrecios(true)
  }

  const handleActualizarPreciosWeb = async () => {
    if (!onActualizarPreciosWeb || actualizandoPrecios) return
    setErrorPrecios('')
    try {
      await onActualizarPreciosWeb()
    } catch (e: unknown) {
      setErrorPrecios(
        e instanceof Error ? e.message : 'No se pudieron actualizar los precios desde internet.'
      )
    }
  }

  const guardarPreciosEditados = async () => {
    if (!onGuardarPreciosManuales || guardandoPrecios) return
    const c = Number(corrInput)
    const d = Number(diesInput)
    const e = Number(extInput)
    const valido = (v: number) => Number.isFinite(v) && v >= PRECIO_MIN_COP && v <= PRECIO_MAX_COP
    if (!valido(c) || !valido(d) || !valido(e)) {
      setErrorPrecios(
        `Ingresa precios válidos por galón en COP (entre ${COD(PRECIO_MIN_COP)} y ${COD(PRECIO_MAX_COP)}).`
      )
      return
    }
    setErrorPrecios('')
    setGuardandoPrecios(true)
    try {
      await onGuardarPreciosManuales({
        corrientePorGalon: Math.round(c),
        dieselPorGalon: Math.round(d),
        extraPorGalon: Math.round(e),
      })
      setEditandoPrecios(false)
      setMsg('Precios guardados correctamente.')
    } catch (err: unknown) {
      setErrorPrecios(
        err instanceof Error ? err.message : 'No se pudieron guardar los precios manuales.'
      )
    } finally {
      setGuardandoPrecios(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.06] via-black/40 to-night-900 p-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-4 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-amber-400/20" />
          <div className="h-5 w-52 rounded-lg bg-white/10" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-400/15" />
          <div className="space-y-1.5">
            <div className="h-3 w-36 rounded bg-white/10" />
            <div className="h-4 w-28 rounded bg-white/15" />
          </div>
          <div className="h-8 w-36 rounded-xl bg-amber-400/20" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] via-black/40 to-night-900 p-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-4">
      {/* Precios reales en Colombia con actualización web o manual */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
        <div className="flex items-center gap-1.5 text-xs font-black text-amber-200">
          <Fuel className="h-4 w-4 text-amber-400" />
          <span title={`${precios.fuente} · ${precios.actualizado}`}>Precios Colombia:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            Corriente: <b className="text-white">{COD(precios.corrientePorGalon)}</b>
          </span>
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            ACPM: <b className="text-white">{COD(precios.dieselPorGalon)}</b>
          </span>
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            Extra: <b className="text-white">{COD(precios.extraPorGalon)}</b>
          </span>

          {precios.esFuenteReal ? (
            <span
              title={`${precios.fuente} · ${precios.actualizado}`}
              className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-300"
            >
              🌐 Web en vivo
            </span>
          ) : precios.editadoManualmente ? (
            <span
              title={precios.actualizado}
              className="rounded-full border border-sky-400/30 bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-black text-sky-300"
            >
              ✏️ Manual
            </span>
          ) : (
            <span
              title={precios.actualizado}
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-black text-amber-300"
            >
              📋 Referencia
            </span>
          )}

          {onActualizarPreciosWeb && (
            <button
              type="button"
              disabled={actualizandoPrecios}
              onClick={() => void handleActualizarPreciosWeb()}
              title="Consultar precios vigentes de combustible en Colombia desde internet (Gemini + Google Search)"
              className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.05] p-1 text-mist-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${actualizandoPrecios ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Tarjeta de Combustible Acumulada */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15 text-amber-300">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-300/80">
              Tarjeta Combustible · {tarjeta.mes}
              {tarjetasArchivadasConPendiente.length > 0 && (
                <span className="ml-1.5 rounded bg-red-500/25 px-1 text-[9px] text-red-300">
                  +{tarjetasArchivadasConPendiente.length} mes ant.
                </span>
              )}
            </div>
            <div className="font-mono text-base font-black text-white">
              {COD(pendienteActual)}
              <span className="ml-1.5 text-xs font-normal text-mist-400">
                pendiente ({tarjeta.totalGalonesMes} gal)
              </span>
            </div>
            {pendienteArchivadoTotal > 0 && (
              <div className="text-[10px] font-bold text-amber-200/90">
                Total acumulado por liquidar: {COD(pendienteTotalAcumulado)}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setError('')
            setErrorPrecios('')
            setMsg('')
            setEditandoPrecios(false)
            setModalAbierto(true)
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1.5 text-xs font-extrabold text-[#2a1702] transition hover:brightness-110"
        >
          <span>Ver tanqueos / Liquidar</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Modal de Detalle, Precios y Liquidación en CashMet */}
      {modalAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tarjeta de Combustible Bear's Reserve"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div className="surface-glow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-extrabold text-white">
                  Tarjeta de Combustible Bear&apos;s Reserve
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer text-mist-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-3">
              {/* Precios vigentes con opción de editar */}
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-200">
                    Tarifas de combustible ({precios.fuente})
                  </span>
                  <div className="flex items-center gap-1.5">
                    {onActualizarPreciosWeb && (
                      <button
                        type="button"
                        disabled={actualizandoPrecios}
                        onClick={() => void handleActualizarPreciosWeb()}
                        className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200 hover:bg-sky-400/20 disabled:opacity-40"
                      >
                        <RefreshCw className={`h-2.5 w-2.5 ${actualizandoPrecios ? 'animate-spin' : ''}`} />
                        <span>Sincronizar Web</span>
                      </button>
                    )}
                    {onGuardarPreciosManuales && !editandoPrecios && (
                      <button
                        type="button"
                        onClick={abrirEditorPrecios}
                        className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-mist-300 hover:text-white"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        <span>Editar</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-mist-500">{precios.actualizado}</div>

                {!editandoPrecios && errorPrecios && (
                  <p className="text-[11px] font-bold text-red-400">{errorPrecios}</p>
                )}

                {editandoPrecios && (
                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-mist-400">Corriente</span>
                      <input
                        type="number"
                        min={PRECIO_MIN_COP}
                        max={PRECIO_MAX_COP}
                        value={corrInput}
                        onChange={(e) => setCorrInput(e.target.value)}
                        className="field-dark h-8 rounded-lg px-2 font-mono text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-mist-400">ACPM / Diésel</span>
                      <input
                        type="number"
                        min={PRECIO_MIN_COP}
                        max={PRECIO_MAX_COP}
                        value={diesInput}
                        onChange={(e) => setDiesInput(e.target.value)}
                        className="field-dark h-8 rounded-lg px-2 font-mono text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-mist-400">Extra</span>
                      <input
                        type="number"
                        min={PRECIO_MIN_COP}
                        max={PRECIO_MAX_COP}
                        value={extInput}
                        onChange={(e) => setExtInput(e.target.value)}
                        className="field-dark h-8 rounded-lg px-2 font-mono text-xs"
                      />
                    </label>
                    {errorPrecios && (
                      <p className="text-[11px] font-bold text-red-400 sm:col-span-3">{errorPrecios}</p>
                    )}
                    <div className="flex gap-2 sm:col-span-3">
                      <button
                        type="button"
                        disabled={guardandoPrecios}
                        onClick={() => void guardarPreciosEditados()}
                        className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                      >
                        <Check className="h-3 w-3" />{' '}
                        {guardandoPrecios ? 'Guardando...' : 'Guardar tarifas'}
                      </button>
                      <button
                        type="button"
                        disabled={guardandoPrecios}
                        onClick={() => {
                          setErrorPrecios('')
                          setEditandoPrecios(false)
                        }}
                        className="cursor-pointer rounded-lg bg-white/10 px-3 py-1 text-[11px] text-mist-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Resumen del mes actual */}
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-mist-400">Mes actual:</span>
                  <span className="font-bold text-white">{tarjeta.mes}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-mist-400">Total tanqueado en el mes:</span>
                  <span className="font-bold text-white">
                    {COD(tarjeta.saldoAcumuladoCOP)} ({tarjeta.totalGalonesMes} gal)
                  </span>
                </div>
                {liquidadoActual > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-300">Ya liquidado este mes:</span>
                    <span className="font-mono font-bold text-emerald-300">
                      -{COD(liquidadoActual)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm mt-1 border-t border-white/[0.06] pt-1.5">
                  <span className="font-extrabold text-white">Saldo pendiente a liquidar:</span>
                  <span className="font-mono text-base font-black text-amber-300">
                    {COD(pendienteActual)}
                  </span>
                </div>
              </div>

              {/* Historial de Tanqueos del Mes */}
              <div>
                <div className="flex items-center gap-1.5 font-bold text-mist-300 mb-1.5">
                  <History className="h-3.5 w-3.5" />
                  <span>Historial de Tanqueos ({tarjeta.tanqueos.length})</span>
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {tarjeta.tanqueos.length === 0 ? (
                    <div className="p-4 text-center text-mist-500 italic">
                      No hay tanqueos registrados este mes.
                    </div>
                  ) : (
                    tarjeta.tanqueos.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-2 text-[11px]"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {t.vehiculoNombre} {t.vehiculoPlaca ? `(${t.vehiculoPlaca})` : ''}
                          </div>
                          <div className="text-[10px] text-mist-400">
                            {t.fecha} {t.hora} · {etiquetaMotivoTanqueo(t.motivo)} ·{' '}
                            {t.tipoCombustible.toUpperCase()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-amber-300">{COD(t.totalCOP)}</div>
                          <div className="text-[10px] text-mist-400">{t.galones} gal</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Sección de liquidación */}
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-3 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-200">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>Liquidar saldo pendiente en CashMet</span>
                </div>
                <p className="text-[11px] text-mist-300">
                  Solo se debita el saldo pendiente actual. Si después hay más tanqueos en el mes, podrás volver a liquidar la diferencia.
                </p>

                {cuentasCashmet.length === 0 ? (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 text-[11px] font-semibold text-amber-200">
                    No tienes cuentas bancarias registradas en CashMet. Crea una cuenta en COP en CashMet para poder liquidar el combustible.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-mist-400 uppercase">
                      Cuenta bancaria a debitar:
                    </span>
                    <select
                      value={cuentaEfectiva}
                      onChange={(e) => {
                        setCuentaId(e.target.value)
                        if (error) setError('')
                      }}
                      className="field-dark h-9 rounded-xl px-2.5 text-xs font-semibold"
                    >
                      {cuentasCashmet.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({monedaCuenta(c)} · Saldo: {formatearSaldoCuenta(c)})
                        </option>
                      ))}
                    </select>
                    {cuentaSeleccionada && !cuentaEsCop && (
                      <p className="text-[10px] font-bold text-amber-300">
                        ⚠️ Esta cuenta está en {monedaCuenta(cuentaSeleccionada)}. El combustible se liquida únicamente desde cuentas en COP.
                      </p>
                    )}
                  </div>
                )}

                {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
                {msg && <p className="text-[11px] font-bold text-emerald-300">{msg}</p>}

                <button
                  type="button"
                  disabled={
                    bloqueado ||
                    pendienteActual <= 0 ||
                    !cuentaSeleccionada ||
                    !cuentaEsCop
                  }
                  onClick={() => void ejecutarLiquidacion()}
                  className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2.5 text-center font-black text-[#2a1702] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {bloqueado
                    ? 'Procesando débito en CashMet...'
                    : pendienteActual <= 0
                      ? '✓ Al día (sin saldo pendiente este mes)'
                      : !cuentaSeleccionada
                        ? 'Registra una cuenta en CashMet'
                        : `Confirmar Débito de ${COD(pendienteActual)}`}
                </button>
              </div>

              {/* Meses archivados (nunca se pierden al cambiar de mes) */}
              {historialTarjetas.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-mist-300">
                    <Archive className="h-3.5 w-3.5 text-sky-300" />
                    <span>Historial de Meses Anteriores ({historialTarjetas.length})</span>
                  </div>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto">
                    {historialTarjetas.map((h) => {
                      const pend = saldoPendienteTarjeta(h)
                      return (
                        <div
                          key={h.id}
                          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-[11px]"
                        >
                          <div>
                            <div className="font-bold text-white">
                              Mes {h.mes} · {h.totalGalonesMes} gal
                            </div>
                            <div className="text-[10px] text-mist-400">
                              Total: {COD(h.saldoAcumuladoCOP)} ·{' '}
                              {pend > 0 ? `Pendiente: ${COD(pend)}` : '✓ Liquidado completo'}
                            </div>
                          </div>
                          {pend > 0 && (
                            <button
                              type="button"
                              disabled={bloqueado || !cuentaSeleccionada || !cuentaEsCop}
                              onClick={() => void ejecutarLiquidacion(h)}
                              className="cursor-pointer rounded-lg bg-amber-400/20 border border-amber-400/40 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Liquidar {COD(pend)}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
