import { useEffect, useRef, useState } from 'react'
import {
  galonesALitros,
  UMBRAL_LLANTAS_CRITICO_PORC,
  UMBRAL_RESERVA_COMBUSTIBLE_PORC,
} from './constants'
import type { TipoCombustible, VehiculoOperativo } from './types'
import TanqueCombustible from './TanqueCombustible'
import { Truck, Sparkles, CheckCircle2, RotateCcw, AlertTriangle, Pencil, Check } from 'lucide-react'

interface Props {
  vehiculos: VehiculoOperativo[]
  onActualizarVehiculo: (id: string, parcial: Partial<VehiculoOperativo>) => Promise<void> | void
  onTanquearVehiculo: (id: string) => Promise<void>
  onInvestigarFichasPendientesIA: (
    forzarTodos?: boolean
  ) => Promise<{ procesados: number; conGemini: number; conCatalogoLocal: number; nombres: string[] }>
  onInvestigarVehiculoIndividualIA?: (
    id: string
  ) => Promise<{ vehiculo: VehiculoOperativo | null; usoGemini: boolean }>
  onReemplazarLlantas: (id: string) => Promise<void> | void
}

export default function FlotaTab({
  vehiculos,
  onActualizarVehiculo,
  onTanquearVehiculo,
  onInvestigarFichasPendientesIA,
  onInvestigarVehiculoIndividualIA,
  onReemplazarLlantas,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAccionId, setBusyAccionId] = useState<string | null>(null)
  const [investigandoIndividualId, setInvestigandoIndividualId] = useState<string | null>(null)
  const [investigando, setInvestigando] = useState(false)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'aviso'; texto: string } | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'habilitados' | 'reserva'>('todos')
  const feedbackTimerRef = useRef<number | null>(null)

  // Editor manual de ficha técnica (tanque, combustible y rendimiento)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editGalones, setEditGalones] = useState('')
  const [editConsumo, setEditConsumo] = useState('')
  const [editCombustible, setEditCombustible] = useState<TipoCombustible>('corriente')

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  const pendientesInvestigacion = vehiculos.filter(
    (v) => v.disponibleParaTrabajo && !v.investigadoIA
  ).length

  const enReservaCount = vehiculos.filter(
    (v) => v.nivelCombustiblePorc <= UMBRAL_RESERVA_COMBUSTIBLE_PORC
  ).length

  const filtrar = vehiculos.filter((v) => {
    if (filtro === 'habilitados') return v.disponibleParaTrabajo
    if (filtro === 'reserva') return v.nivelCombustiblePorc <= UMBRAL_RESERVA_COMBUSTIBLE_PORC
    return true
  })

  const mostrarFeedback = (tipo: 'ok' | 'aviso', texto: string) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current)
    }
    setFeedback({ tipo, texto })
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null)
      feedbackTimerRef.current = null
    }, 4500)
  }

  const ejecutarTanqueo = async (id: string) => {
    if (busyId === id) return
    setBusyId(id)
    try {
      await onTanquearVehiculo(id)
      mostrarFeedback('ok', '⛽ Tanqueo al 100% registrado con éxito en la Tarjeta de Combustible.')
    } catch (e: unknown) {
      mostrarFeedback('aviso', e instanceof Error ? e.message : 'No se pudo completar el tanqueo.')
    } finally {
      setBusyId(null)
    }
  }

  const ejecutarInvestigacionIndividual = async (id: string, marca: string, linea: string) => {
    if (!onInvestigarVehiculoIndividualIA || investigandoIndividualId === id) return
    setInvestigandoIndividualId(id)
    try {
      const res = await onInvestigarVehiculoIndividualIA(id)
      if (res.usoGemini) {
        mostrarFeedback(
          'ok',
          `✨ Gemini IA investigó y actualizó la ficha oficial de ${marca} ${linea}.`
        )
      } else {
        mostrarFeedback(
          'aviso',
          `📋 Gemini no respondió (verifica VITE_GEMINI_API_KEY); se aplicó catálogo técnico local a ${marca} ${linea}.`
        )
      }
    } catch (e: unknown) {
      mostrarFeedback(
        'aviso',
        e instanceof Error
          ? e.message
          : `No se pudo investigar la ficha técnica de ${marca} ${linea}.`
      )
    } finally {
      setInvestigandoIndividualId(null)
    }
  }

  const ejecutarInvestigacionMasiva = async (forzarTodos = false) => {
    if (investigando) return
    setInvestigando(true)
    try {
      const res = await onInvestigarFichasPendientesIA(forzarTodos)
      if (res.procesados > 0) {
        if (res.conGemini > 0 && res.conCatalogoLocal === 0) {
          mostrarFeedback(
            'ok',
            `✨ Gemini IA investigó y configuró ${res.conGemini} vehículo(s): ${res.nombres.join(', ')}.`
          )
        } else if (res.conGemini > 0) {
          mostrarFeedback(
            'aviso',
            `🔍 Procesados ${res.procesados}: ${res.conGemini} con Gemini IA y ${res.conCatalogoLocal} con catálogo local.`
          )
        } else {
          mostrarFeedback(
            'aviso',
            `📋 Sin respuesta de Gemini IA; se configuraron ${res.conCatalogoLocal} vehículo(s) con el catálogo técnico local.`
          )
        }
      } else {
        mostrarFeedback(
          'ok',
          '✅ Todos los vehículos habilitados ya tienen su ficha técnica configurada.'
        )
      }
    } catch (e: unknown) {
      mostrarFeedback(
        'aviso',
        e instanceof Error ? e.message : 'No se pudo completar la investigación masiva de fichas IA.'
      )
    } finally {
      setInvestigando(false)
    }
  }

  const cambiarLlantasDiscreto = async (v: VehiculoOperativo) => {
    if (v.estado === 'en_mision' || v.desgasteLlantasPorc <= 0 || busyAccionId === v.id) return
    const confirmado = window.confirm(
      `¿Confirmas el reemplazo del juego de llantas en ${v.marca} ${v.linea}? El desgaste volverá a 0%.`
    )
    if (!confirmado) return

    setBusyAccionId(v.id)
    try {
      await onReemplazarLlantas(v.id)
      mostrarFeedback(
        'ok',
        `🛞 Se instaló juego nuevo de llantas en ${v.marca} ${v.linea} (desgaste restablecido a 0%).`
      )
    } catch (e: unknown) {
      mostrarFeedback(
        'aviso',
        e instanceof Error ? e.message : 'No se pudo restablecer el desgaste de llantas.'
      )
    } finally {
      setBusyAccionId(null)
    }
  }

  const handleToggleHabilitado = async (v: VehiculoOperativo, habilitado: boolean) => {
    if (v.disponibleEnCashmet === false || v.estado === 'en_mision' || busyAccionId === v.id) return
    setBusyAccionId(v.id)
    try {
      await onActualizarVehiculo(v.id, { disponibleParaTrabajo: habilitado })
      if (habilitado && !v.investigadoIA && onInvestigarVehiculoIndividualIA) {
        void ejecutarInvestigacionIndividual(v.id, v.marca, v.linea)
      }
    } catch (e: unknown) {
      mostrarFeedback(
        'aviso',
        e instanceof Error
          ? e.message
          : `No se pudo actualizar la disponibilidad de ${v.marca} ${v.linea}.`
      )
    } finally {
      setBusyAccionId(null)
    }
  }

  const abrirEditorFicha = (v: VehiculoOperativo) => {
    if (v.estado === 'en_mision') return
    setEditandoId(v.id)
    setEditGalones(String(v.capacidadTanqueGalones))
    setEditConsumo(String(v.consumoKmPorGalon))
    setEditCombustible(v.tipoCombustible)
  }

  const guardarFichaManual = async (v: VehiculoOperativo) => {
    if (v.estado === 'en_mision' || busyAccionId === v.id) return
    const gal = Number(editGalones)
    const kmGal = Number(editConsumo)
    if (!Number.isFinite(gal) || gal < 1 || gal > 600 || !Number.isFinite(kmGal) || kmGal < 2 || kmGal > 250) {
      mostrarFeedback('aviso', 'Ingresa valores válidos de tanque (1–600 gal) y rendimiento (2–250 km/gal).')
      return
    }
    const lit = galonesALitros(gal)
    setBusyAccionId(v.id)
    try {
      await onActualizarVehiculo(v.id, {
        capacidadTanqueGalones: Number(gal.toFixed(1)),
        capacidadTanqueLitros: lit,
        consumoKmPorGalon: Number(kmGal.toFixed(1)),
        tipoCombustible: editCombustible,
        investigadoIA: true,
        fuenteFicha: 'manual',
        fichaInvestigadaNota: `✏️ Ficha ajustada manualmente: Tanque ${gal.toFixed(1)} gal (${lit} L) · ${kmGal.toFixed(1)} km/gal · ${editCombustible.toUpperCase()}.`,
      })
      setEditandoId(null)
      mostrarFeedback('ok', `✅ Ficha técnica de ${v.marca} ${v.linea} guardada en Firestore.`)
    } catch (e: unknown) {
      mostrarFeedback(
        'aviso',
        e instanceof Error ? e.message : `No se pudo guardar la ficha de ${v.marca} ${v.linea}.`
      )
    } finally {
      setBusyAccionId(null)
    }
  }

  const etiquetaFuenteFicha = (v: VehiculoOperativo) => {
    if (v.fuenteFicha === 'gemini') return '✨ Gemini IA'
    if (v.fuenteFicha === 'manual') return '✏️ Manual'
    if (v.fuenteFicha === 'catalogo_local') return '📋 Catálogo local'
    return v.fichaInvestigadaNota?.includes('Gemini') ? '✨ Gemini IA' : '📋 Catálogo local'
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-2xl border p-3 font-bold shadow-lg text-xs ${
            feedback.tipo === 'aviso'
              ? 'border-amber-400/35 bg-amber-500/10 text-amber-200'
              : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          {feedback.tipo === 'aviso' ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {/* Barra superior de flota */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3 text-xs">
        <div>
          <h2 className="text-sm font-extrabold text-white">Flota de la Reserva Bear&apos;s Reserve</h2>
          <p className="text-[11px] text-mist-500">
            Vehículos conectados con CashMet. Odómetro, telemetría y desgaste se sincronizan con Firestore tras cada misión.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendientesInvestigacion > 0 ? (
            <button
              type="button"
              disabled={investigando}
              onClick={() => void ejecutarInvestigacionMasiva(false)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs font-bold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-40"
            >
              <Sparkles className={`h-3.5 w-3.5 ${investigando ? 'animate-spin' : ''}`} />
              <span>
                {investigando
                  ? 'Investigando con Gemini...'
                  : `🔍 Investigar Fichas con IA (${pendientesInvestigacion} pendientes)`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={investigando}
              onClick={() => void ejecutarInvestigacionMasiva(true)}
              title="Volver a consultar a Gemini IA (con búsqueda web) para verificar especificaciones oficiales de la flota"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/[0.06] px-3 py-1.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/15 disabled:opacity-40"
            >
              <Sparkles className={`h-3.5 w-3.5 ${investigando ? 'animate-spin' : ''}`} />
              <span>
                {investigando ? 'Actualizando flota con Gemini...' : '✨ Reinvestigar Flota con IA'}
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
                filtro === 'habilitados'
                  ? 'bg-emerald-400/20 text-emerald-200'
                  : 'bg-white/[0.04] text-mist-400 hover:text-white'
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
              En reserva ({enReservaCount})
            </button>
          </div>
        </div>
      </div>

      {/* Grid de vehículos */}
      {filtrar.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 text-center text-xs text-mist-400">
          <Truck className="mx-auto mb-2 h-8 w-8 text-mist-600" />
          <p className="font-bold text-white">
            {filtro === 'reserva'
              ? `No hay vehículos en reserva (≤ ${UMBRAL_RESERVA_COMBUSTIBLE_PORC}% de combustible).`
              : filtro === 'habilitados'
                ? 'Aún no hay vehículos habilitados para Bear\'s Reserve.'
                : 'No hay vehículos registrados en la flota.'}
          </p>
          <p className="mt-1 text-[11px] text-mist-500">
            {filtro !== 'todos'
              ? 'Cambia el filtro superior para ver toda la flota sincronizada desde CashMet.'
              : 'Registra vehículos en el módulo Vehículos de CashMet para gestionarlos aquí.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtrar.map((v) => {
            const bloqueadoPorCashmet = v.disponibleEnCashmet === false
            const enMision = v.estado === 'en_mision'
            const ocupado = busyAccionId === v.id
            const toggleBloqueado = bloqueadoPorCashmet || enMision || ocupado
            const badgeEstado =
              enMision
                ? { txt: '🚨 En misión', cls: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200 animate-pulse' }
                : v.estado === 'mantenimiento'
                  ? { txt: `🔧 ${v.estadoCashmet || 'Mantenimiento'}`, cls: 'border-red-400/30 bg-red-500/15 text-red-300' }
                  : v.estado === 'reserva'
                    ? { txt: '⚠️ Reserva', cls: 'border-amber-400/35 bg-amber-500/15 text-amber-200' }
                    : { txt: 'En base', cls: 'border-white/10 bg-white/[0.04] text-mist-400' }

            return (
              <div
                key={v.id}
                className={`space-y-3 rounded-3xl border p-4 text-xs shadow-xl backdrop-blur-md transition ${
                  v.disponibleParaTrabajo
                    ? 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    : 'border-white/[0.05] bg-black/40 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-amber-400/20 to-emerald-400/10 text-amber-300">
                      <Truck className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-black text-white">
                          {v.marca} {v.linea} {v.modelo ? `(${v.modelo})` : ''}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${badgeEstado.cls}`}>
                          {badgeEstado.txt}
                        </span>
                        {v.investigadoIA ? (
                          <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[9px] font-bold text-sky-300">
                            {etiquetaFuenteFicha(v)}
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                            ⚠️ Preliminar
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

                  <label
                    title={
                      bloqueadoPorCashmet
                        ? `No disponible en CashMet (estado actual: ${v.estadoCashmet}). Cámbialo a "Disponible" en el módulo de Vehículos de CashMet.`
                        : enMision
                          ? 'No puedes deshabilitar un vehículo mientras está en una misión activa.'
                          : 'Habilitar o deshabilitar este vehículo para Bear\'s Reserve'
                    }
                    className={`flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-bold ${
                      toggleBloqueado
                        ? 'cursor-not-allowed text-red-300/80 opacity-75'
                        : 'cursor-pointer text-mist-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={toggleBloqueado}
                      checked={v.disponibleParaTrabajo}
                      onChange={(e) => void handleToggleHabilitado(v, e.target.checked)}
                      className="h-3.5 w-3.5 accent-amber-400 disabled:cursor-not-allowed"
                    />
                    <span>
                      {bloqueadoPorCashmet
                        ? v.estadoCashmet || 'No disponible'
                        : enMision
                          ? 'En misión'
                          : v.disponibleParaTrabajo
                            ? 'Habilitado Reserva'
                            : 'Solo CashMet'}
                    </span>
                  </label>
                </div>

                {/* Ficha técnica investigada + Botón Gemini + Edición manual */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {v.fichaInvestigadaNota ? (
                        <div className="rounded-xl border border-sky-400/15 bg-sky-500/[0.04] p-2 text-[10px] text-sky-200/90 leading-relaxed">
                          {v.fichaInvestigadaNota}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.04] p-2 text-[10px] text-amber-200/90 leading-relaxed">
                          Pendiente de investigación de especificaciones oficiales de fábrica con IA.
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {onInvestigarVehiculoIndividualIA && (
                        <button
                          type="button"
                          disabled={investigandoIndividualId === v.id || investigando}
                          onClick={() => void ejecutarInvestigacionIndividual(v.id, v.marca, v.linea)}
                          title="Investigar o verificar especificaciones oficiales con Gemini IA (búsqueda web)"
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[10px] font-bold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-40"
                        >
                          <Sparkles
                            className={`h-3 w-3 ${investigandoIndividualId === v.id ? 'animate-spin' : ''}`}
                          />
                          <span>
                            {investigandoIndividualId === v.id
                              ? 'Consultando...'
                              : v.investigadoIA
                                ? 'Reinvestigar IA'
                                : 'Investigar IA'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={enMision || ocupado}
                        onClick={() => (editandoId === v.id ? setEditandoId(null) : abrirEditorFicha(v))}
                        title={
                          enMision
                            ? 'Espera a que termine la misión para ajustar la ficha técnica'
                            : 'Ajustar manualmente tanque, combustible o rendimiento'
                        }
                        className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-mist-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        <span>Ajustar</span>
                      </button>
                    </div>
                  </div>

                  {/* Editor inline de ficha */}
                  {editandoId === v.id && (
                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-sky-400/25 bg-black/50 p-2.5 sm:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-mist-400">Tanque (gal)</span>
                        <input
                          type="number"
                          step="0.1"
                          min={1}
                          max={600}
                          value={editGalones}
                          onChange={(e) => setEditGalones(e.target.value)}
                          className="field-dark h-7 rounded-lg px-2 font-mono text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-mist-400">Rendimiento (km/gal)</span>
                        <input
                          type="number"
                          step="0.5"
                          min={2}
                          max={250}
                          value={editConsumo}
                          onChange={(e) => setEditConsumo(e.target.value)}
                          className="field-dark h-7 rounded-lg px-2 font-mono text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-mist-400">Combustible</span>
                        <select
                          value={editCombustible}
                          onChange={(e) => setEditCombustible(e.target.value as TipoCombustible)}
                          className="field-dark h-7 rounded-lg px-1.5 text-xs"
                        >
                          <option value="corriente">Corriente</option>
                          <option value="diesel">Diésel / ACPM</option>
                          <option value="extra">Extra</option>
                        </select>
                      </label>
                      <div className="flex gap-2 sm:col-span-3">
                        <button
                          type="button"
                          disabled={ocupado || enMision}
                          onClick={() => void guardarFichaManual(v)}
                          className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" /> {ocupado ? 'Guardando...' : 'Guardar ficha'}
                        </button>
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => setEditandoId(null)}
                          className="cursor-pointer rounded-lg bg-white/10 px-3 py-1 text-[10px] text-mist-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notas heredadas de CashMet */}
                {v.notasCashmet && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-2 text-[10px] text-amber-200/90 leading-relaxed">
                    <span className="font-bold text-amber-300">📝 </span>
                    {v.notasCashmet}
                  </div>
                )}

                {/* Indicador gráfico de tanque */}
                <TanqueCombustible
                  vehiculo={v}
                  busy={busyId === v.id}
                  onTanquear={() => void ejecutarTanqueo(v.id)}
                />

                {/* Métricas de Odómetro y Desgaste de Llantas */}
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
                      <button
                        type="button"
                        disabled={v.desgasteLlantasPorc <= 0 || enMision || ocupado}
                        title={
                          enMision
                            ? 'No disponible mientras el vehículo está en misión'
                            : v.desgasteLlantasPorc <= 0
                              ? 'Las llantas ya están en 0% de desgaste'
                              : 'Instalar llantas nuevas (restablecer desgaste al 0%)'
                        }
                        onClick={() => void cambiarLlantasDiscreto(v)}
                        className="cursor-pointer text-mist-500 hover:text-amber-300 transition disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-mono text-sm font-black text-amber-300">
                        {v.desgasteLlantasPorc}%
                      </span>
                      <span className="text-[10px] text-mist-400">
                        {v.desgasteLlantasPorc >= UMBRAL_LLANTAS_CRITICO_PORC
                          ? '⚠️ Requiere cambio'
                          : 'Buen agarre'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
