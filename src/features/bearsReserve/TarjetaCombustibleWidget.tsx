import { useState } from 'react'
import { PRECIOS_COMBUSTIBLE_COLOMBIA } from './preciosCombustible'
import type { TarjetaCombustibleReserva } from './types'
import type { CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { CreditCard, Fuel, CheckCircle2, ArrowRight, DollarSign, History } from 'lucide-react'

interface Props {
  tarjeta: TarjetaCombustibleReserva
  cuentasCashmet: CuentaBanco[]
  onLiquidar: (cuentaBancoId: string) => Promise<void>
  busy?: boolean
}

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

export default function TarjetaCombustibleWidget({
  tarjeta,
  cuentasCashmet,
  onLiquidar,
  busy,
}: Props) {
  const [cuentaId, setCuentaId] = useState(cuentasCashmet[0]?.id || '')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const cuentaEfectiva = cuentaId || cuentasCashmet[0]?.id || ''

  const ejecutarLiquidacion = async () => {
    if (!cuentaEfectiva) {
      setError('Debes elegir una cuenta bancaria de CashMet para descontar el combustible.')
      return
    }
    setError('')
    setMsg('')
    try {
      await onLiquidar(cuentaEfectiva)
      setMsg('¡Liquidado con éxito! Se registró el gasto en los movimientos de CashMet.')
      window.setTimeout(() => setModalAbierto(false), 1600)
    } catch (e: any) {
      setError(e?.message || 'No se pudo liquidar la tarjeta de combustible.')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] via-black/40 to-night-900 p-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-4">
      {/* Precios de referencia oficiales en Colombia */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
        <div className="flex items-center gap-1.5 text-xs font-black text-amber-200">
          <Fuel className="h-4 w-4 text-amber-400" />
          <span>Precios Colombia:</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            Corriente: <b className="text-white">{COD(PRECIOS_COMBUSTIBLE_COLOMBIA.corrientePorGalon)}</b>
          </span>
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            ACPM (Diésel): <b className="text-white">{COD(PRECIOS_COMBUSTIBLE_COLOMBIA.dieselPorGalon)}</b>
          </span>
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            Extra: <b className="text-white">{COD(PRECIOS_COMBUSTIBLE_COLOMBIA.extraPorGalon)}</b>
          </span>
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
            </div>
            <div className="font-mono text-base font-black text-white">
              {COD(tarjeta.saldoAcumuladoCOP)}
              <span className="ml-1.5 text-xs font-normal text-mist-400">
                ({tarjeta.totalGalonesMes} gal)
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-1.5 text-xs font-extrabold text-[#2a1702] transition hover:brightness-110"
        >
          <span>Ver tanqueos / Liquidar</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Modal de Detalle y Liquidación en CashMet */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="surface-glow w-full max-w-lg rounded-3xl border border-white/15 bg-night-900 p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-white">Tarjeta de Combustible Bear&apos;s Reserve</h3>
                  <p className="text-[11px] text-mist-500">Periodo {tarjeta.mes} · Flota Comunitaria</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="cursor-pointer rounded-full bg-white/[0.06] px-2.5 py-1 text-mist-400 hover:bg-white/[0.1] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-black/30 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-mist-500">Gasto total acumulado</div>
                  <div className="font-mono text-lg font-black text-amber-300">{COD(tarjeta.saldoAcumuladoCOP)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-mist-500">Galones suministrados</div>
                  <div className="font-mono text-lg font-black text-white">{tarjeta.totalGalonesMes} gal</div>
                </div>
              </div>

              {tarjeta.liquidadoEnCashmet ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-2.5 font-bold text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Este mes ya fue liquidado en los movimientos de CashMet ({tarjeta.fechaLiquidacion}).</span>
                </div>
              ) : (
                <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="font-bold text-mist-200">
                    Liquidar y descontar saldo en CashMet:
                  </span>
                  <select
                    value={cuentaEfectiva}
                    onChange={(e) => setCuentaId(e.target.value)}
                    className="field-dark h-9 w-full rounded-xl px-2.5 text-xs font-medium"
                  >
                    {cuentasCashmet.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} · Saldo: {COD(c.saldoActual || 0)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || tarjeta.saldoAcumuladoCOP <= 0}
                    onClick={ejecutarLiquidacion}
                    className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 font-bold text-[#04241a] transition hover:brightness-110 disabled:opacity-40"
                  >
                    <DollarSign className="h-4 w-4" />
                    <span>{busy ? 'Liquidando en CashMet...' : `Liquidar ${COD(tarjeta.saldoAcumuladoCOP)} en cuenta`}</span>
                  </button>
                </div>
              )}

              {msg && <div className="text-emerald-300 font-bold">{msg}</div>}
              {error && <div className="text-red-300 font-medium">{error}</div>}

              {/* Historial de Tanqueos */}
              <div className="border-t border-white/[0.08] pt-3">
                <div className="mb-2 flex items-center gap-1.5 font-bold text-white">
                  <History className="h-3.5 w-3.5 text-amber-400" />
                  <span>Historial de tanqueos de la flota ({tarjeta.tanqueos.length}):</span>
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {tarjeta.tanqueos.length === 0 ? (
                    <p className="text-[11px] text-mist-500">No hay tanqueos registrados aún este mes.</p>
                  ) : (
                    tarjeta.tanqueos.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 p-2 text-[11px]"
                      >
                        <div>
                          <div className="font-bold text-white">
                            {t.vehiculoNombre} {t.vehiculoPlaca ? `(${t.vehiculoPlaca})` : ''}
                          </div>
                          <div className="text-mist-500">
                            {t.fecha} {t.hora} · {t.galones} gal {t.tipoCombustible}
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-amber-300">
                          {COD(t.totalCOP)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
