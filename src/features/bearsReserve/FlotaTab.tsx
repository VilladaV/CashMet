import { useState } from 'react'
import type { VehiculoOperativo } from './types'
import TanqueCombustible from './TanqueCombustible'
import { Truck, Sparkles, CheckCircle2, RotateCcw } from 'lucide-react'

interface Props {
  vehiculos: VehiculoOperativo[]
  onActualizarVehiculo: (id: string, parcial: Partial<VehiculoOperativo>) => void
  onTanquearVehiculo: (id: string) => Promise<void>
  onInvestigarFichasPendientesIA: () => Promise<{ procesados: number; nombres: string[] }>
  onReemplazarLlantas: (id: string) => void
}

export default function FlotaTab({
  vehiculos,
  onActualizarVehiculo,
  onTanquearVehiculo,
  onInvestigarFichasPendientesIA,
  onReemplazarLlantas,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [investigando, setInvestigando] = useState(false)
  const [feedback, setFeedback] = useState<string>('')
  const [filtro, setFiltro] = useState<'todos' | 'habilitados' | 'reserva'>('todos')

  const pendientesInvestigacion = vehiculos.filter(
    (v) => v.disponibleParaTrabajo && !v.investigadoIA
  ).length

  const filtrar = vehiculos.filter((v) => {
    if (filtro === 'habilitados') return v.disponibleParaTrabajo
    if (filtro === 'reserva') return v.nivelCombustiblePorc <= 20
    return true
  })

  const ejecutarTanqueo = async (id: string) => {
    setBusyId(id)
    try {
      await onTanquearVehiculo(id)
      setFeedback('⛽ Tanqueo al 100% registrado con éxito en la Tarjeta de Combustible.')
      window.setTimeout(() => setFeedback(''), 3500)
    } finally {
      setBusyId(null)
    }
  }

  const ejecutarInvestigacionMasiva = async () => {
    setInvestigando(true)
    try {
      const res = await onInvestigarFichasPendientesIA()
      if (res.procesados > 0) {
        setFeedback(
          `🔍 Se investigaron y configuraron con IA ${res.procesados} vehículos de trabajo: ${res.nombres.join(', ')}.`
        )
      } else {
        setFeedback('✅ Todos los vehículos habilitados para Bear\'s Reserve ya tienen su ficha técnica validada.')
      }
      window.setTimeout(() => setFeedback(''), 4500)
    } finally {
      setInvestigando(false)
    }
  }

  const cambiarLlantasDiscreto = (v: VehiculoOperativo) => {
    onReemplazarLlantas(v.id)
    setFeedback(`🛞 Se instaló juego nuevo de llantas en ${v.marca} ${v.linea} (desgaste restablecido a 0%).`)
    window.setTimeout(() => setFeedback(''), 3500)
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 font-bold text-emerald-200 shadow-lg text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Barra superior de flota */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3 text-xs">
        <div>
          <h2 className="text-sm font-extrabold text-white">Flota de la Reserva Bear&apos;s Reserve</h2>
          <p className="text-[11px] text-mist-500">
            Vehículos conectados con CashMet. Odómetro, telemetría y desgaste se actualizan en tiempo real tras cada salida.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendientesInvestigacion > 0 && (
            <button
              type="button"
              disabled={investigando}
              onClick={ejecutarInvestigacionMasiva}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs font-bold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-40"
            >
              <Sparkles className={`h-3.5 w-3.5 ${investigando ? 'animate-spin' : ''}`} />
              <span>
                {investigando
                  ? 'Investigando especificaciones...'
                  : `🔍 Investigar Fichas con IA (${pendientesInvestigacion})`}
              </span>
            </button>
          )}

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFiltro('todos')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                filtro === 'todos' ? 'bg-amber-400/20 text-amber-200' : 'bg-white/[0.04] text-mist-400 hover:text-white'
              }`}
            >
              Todos ({vehiculos.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro('habilitados')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                filtro === 'habilitados' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/[0.04] text-mist-400 hover:text-white'
              }`}
            >
              Habilitados ({vehiculos.filter((v) => v.disponibleParaTrabajo).length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro('reserva')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                filtro === 'reserva' ? 'bg-red-400/20 text-red-200' : 'bg-white/[0.04] text-mist-400 hover:text-white'
              }`}
            >
              En reserva
            </button>
          </div>
        </div>
      </div>

      {/* Grid de vehículos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtrar.map((v) => {
          return (
            <div
              key={v.id}
              className={`space-y-3 rounded-3xl border p-4 text-xs shadow-xl backdrop-blur-md transition ${
                v.disponibleParaTrabajo
                  ? 'border-white/10 bg-white/[0.02] hover:border-white/20'
                  : 'border-white/[0.05] bg-black/40 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-amber-400/20 to-emerald-400/10 text-amber-300">
                    <Truck className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">
                        {v.marca} {v.linea} {v.modelo ? `(${v.modelo})` : ''}
                      </span>
                      {v.investigadoIA && (
                        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.2 text-[9px] font-bold text-sky-300">
                          ✓ Ficha IA
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium text-mist-400">
                      {v.placa ? `Placa: ${v.placa} · ` : ''}
                      Clase: <span className="capitalize text-slate-200">{v.tipo}</span> ·{' '}
                      {v.tipoCombustible.toUpperCase()}
                    </div>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-bold text-mist-300">
                  <input
                    type="checkbox"
                    checked={v.disponibleParaTrabajo}
                    onChange={(e) =>
                      onActualizarVehiculo(v.id, { disponibleParaTrabajo: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-amber-400"
                  />
                  <span>{v.disponibleParaTrabajo ? 'Habilitado Reserva' : 'Solo CashMet'}</span>
                </label>
              </div>

              {/* Ficha técnica investigada */}
              {v.fichaInvestigadaNota && (
                <div className="rounded-xl border border-sky-400/15 bg-sky-500/[0.04] p-2 text-[10px] text-sky-200/90 leading-relaxed">
                  {v.fichaInvestigadaNota}
                </div>
              )}

              {/* Indicador gráfico de tanque de combustible */}
              <TanqueCombustible
                vehiculo={v}
                busy={busyId === v.id}
                onTanquear={() => ejecutarTanqueo(v.id)}
              />

              {/* Métricas de Odómetro y Desgaste de Llantas con acción discreta */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-mist-500">
                    Odómetro (CashMet)
                  </div>
                  <div className="font-mono text-sm font-black text-white">
                    {v.kilometrajeActual.toLocaleString('es-CO')} km
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5">
                  <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-mist-500">
                    <span>Desgaste de llantas</span>
                    {/* Botón discreto de cambio de llantas */}
                    <button
                      type="button"
                      title="Instalar llantas nuevas (restablecer desgaste al 0%)"
                      onClick={() => cambiarLlantasDiscreto(v)}
                      className="cursor-pointer text-mist-500 hover:text-amber-300 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-sm font-black text-amber-300">
                      {v.desgasteLlantasPorc}%
                    </span>
                    <span className="text-[10px] text-mist-400">
                      {v.desgasteLlantasPorc > 75 ? '⚠️ Requiere cambio' : 'Buen agarre'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
