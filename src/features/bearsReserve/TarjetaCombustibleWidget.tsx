import { useState } from 'react'
import { obtenerPreciosCombustibleActuales } from './preciosCombustible'
import type { TarjetaCombustibleReserva } from './types'
import type { CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { CreditCard, Fuel, ArrowRight, DollarSign, History } from 'lucide-react'

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

  const precios = obtenerPreciosCombustibleActuales()
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
      {/* Precios de referencia oficiales en Colombia con actualización automática */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
        <div className="flex items-center gap-1.5 text-xs font-black text-amber-200">
          <Fuel className="h-4 w-4 text-amber-400" />
          <span title={precios.actualizado}>Precios Colombia:</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            Corriente: <b className="text-white">{COD(precios.corrientePorGalon)}</b>
          </span>
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            ACPM (Diésel): <b className="text-white">{COD(precios.dieselPorGalon)}</b>
          </span>
          <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-medium text-mist-300">
            Extra: <b className="text-white">{COD(precios.extraPorGalon)}</b>
          </span>
          <span className="rounded-full bg-emerald-400/15 border border-emerald-400/30 px-1.5 py-0.2 text-[9px] font-black text-emerald-300">
            ✓ Auto-actualizado
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
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-mist-400">Mes de acumulación:</span>
                  <span className="font-bold text-white">{tarjeta.mes}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-mist-400">Total galones tanqueados:</span>
                  <span className="font-bold text-amber-300">{tarjeta.totalGalonesMes} gal</span>
                </div>
                <div className="flex justify-between text-sm mt-1 border-t border-white/[0.06] pt-1">
                  <span className="font-extrabold text-white">Saldo total a liquidar:</span>
                  <span className="font-mono text-base font-black text-amber-300">
                    {COD(tarjeta.saldoAcumuladoCOP)}
                  </span>
                </div>
              </div>

              {/* Historial de Tanqueos del Mes */}
              <div>
                <div className="flex items-center gap-1.5 font-bold text-mist-300 mb-1.5">
                  <History className="h-3.5 w-3.5" />
                  <span>Historial de Tanqueos ({tarjeta.tanqueos.length})</span>
                </div>
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
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
                            {t.fecha} {t.hora} · {t.motivo === 'reserva_automatica' ? 'Auto-tanqueo (Reserva)' : 'Tanqueo manual'}
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
                  <span>Liquidar y descontar en CashMet</span>
                </div>
                <p className="text-[11px] text-mist-300">
                  El valor se debitará de la cuenta bancaria de CashMet que selecciones y quedará asentado en el historial de movimientos financieros.
                </p>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-mist-400 uppercase">
                    Cuenta bancaria a debitar (Obligatoria):
                  </span>
                  <select
                    value={cuentaEfectiva}
                    onChange={(e) => setCuentaId(e.target.value)}
                    className="field-dark h-9 rounded-xl px-2.5 text-xs font-semibold"
                  >
                    {cuentasCashmet.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda} · Saldo: {COD(c.saldoActual)})
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
                {msg && <p className="text-[11px] font-bold text-emerald-300">{msg}</p>}

                <button
                  type="button"
                  disabled={busy || tarjeta.liquidadoEnCashmet || tarjeta.saldoAcumuladoCOP <= 0}
                  onClick={ejecutarLiquidacion}
                  className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2.5 text-center font-black text-[#2a1702] transition hover:brightness-110 disabled:opacity-40"
                >
                  {tarjeta.liquidadoEnCashmet
                    ? '✓ Liquidado este mes en CashMet'
                    : busy
                      ? 'Procesando débito en CashMet...'
                      : `Confirmar Débito de ${COD(tarjeta.saldoAcumuladoCOP)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
