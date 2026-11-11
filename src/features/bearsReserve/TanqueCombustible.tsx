import { Fuel, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { VehiculoOperativo } from './types'

interface Props {
  vehiculo: VehiculoOperativo
  onTanquear: (vehiculoId: string) => void | Promise<void>
  busy?: boolean
}

export default function TanqueCombustible({ vehiculo, onTanquear, busy }: Props) {
  const nivel = Math.max(0, Math.min(100, Math.round(vehiculo.nivelCombustiblePorc ?? 80)))
  const esReserva = nivel <= 15
  const esBajo = nivel <= 35 && !esReserva
  const capacidad = vehiculo.capacidadTanqueGalones || 20
  const galonesActuales = Number(((nivel / 100) * capacidad).toFixed(1))

  const colorNivel = esReserva
    ? 'from-red-500 via-rose-500 to-amber-500'
    : esBajo
      ? 'from-amber-400 via-orange-400 to-yellow-500'
      : 'from-emerald-400 via-teal-400 to-cyan-400'

  const borderNivel = esReserva
    ? 'border-red-400/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse'
    : esBajo
      ? 'border-amber-400/40'
      : 'border-emerald-400/30'

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-black/40 p-3.5 backdrop-blur-md ${borderNivel}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.08] text-amber-300">
            <Fuel className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-mist-300">
              Tanque · {vehiculo.tipoCombustible.toUpperCase()}
            </div>
            <div className="text-xs font-black text-white">
              {galonesActuales} / {capacidad} galones
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono text-base font-black tracking-tight text-white">{nivel}%</div>
          {esReserva ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-300">
              <AlertTriangle className="h-3 w-3" /> ¡Reserva!
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> Operativo
            </span>
          )}
        </div>
      </div>

      {/* Indicador visual de tanque */}
      <div className="mt-3">
        <div className="relative h-3.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/[0.05] p-0.5">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out ${colorNivel}`}
            style={{ width: `${nivel}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-bold tracking-widest text-mist-500">
          <span>VACÍO (E)</span>
          <span>1/4</span>
          <span>1/2</span>
          <span>3/4</span>
          <span>LLENO (F)</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
        <span className="text-mist-400">
          Rendimiento en trocha: <b className="text-white">{vehiculo.consumoKmPorGalon} km/gal</b>
        </span>
        <button
          type="button"
          disabled={busy || nivel >= 98}
          onClick={() => onTanquear(vehiculo.id)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
          <span>Tanquear 100%</span>
        </button>
      </div>
    </div>
  )
}
