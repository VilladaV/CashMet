import { useState } from 'react'
import type { EmpleadoOperativo, TurnoSemanal } from './types'
import { Sparkles, Calendar, Clock, UserCheck, ShieldAlert, BookOpen, CheckCircle2 } from 'lucide-react'

interface Props {
  empleados: EmpleadoOperativo[]
  turnos: TurnoSemanal[]
  onRotarTurnosPorIA: () => void
  onActualizarEmpleado: (id: string, parcial: Partial<EmpleadoOperativo>) => void
}

export default function TurnosTab({
  empleados,
  turnos,
  onRotarTurnosPorIA,
  onActualizarEmpleado,
}: Props) {
  const [empSeleccionado, setEmpSeleccionado] = useState<EmpleadoOperativo | null>(null)
  const [nuevoDiaSemana, setNuevoDiaSemana] = useState(2) // Martes
  const [horaInicio, setHoraInicio] = useState('18:00')
  const [horaFin, setHoraFin] = useState('22:00')
  const [motivo, setMotivo] = useState('Universidad / Clases')

  const agregarRestriccionHorario = () => {
    if (!empSeleccionado) return
    const actual = empSeleccionado.horariosNoDisponibles || []
    const nueva = {
      diaSemana: nuevoDiaSemana,
      horaInicio,
      horaFin,
      motivo: motivo.trim() || 'Estudio / Personal',
    }
    const actualizados = [...actual, nueva]
    onActualizarEmpleado(empSeleccionado.id, { horariosNoDisponibles: actualizados })
    setEmpSeleccionado({ ...empSeleccionado, horariosNoDisponibles: actualizados })
  }

  const borrarRestriccion = (idx: number) => {
    if (!empSeleccionado) return
    const actualizados = (empSeleccionado.horariosNoDisponibles || []).filter((_, i) => i !== idx)
    onActualizarEmpleado(empSeleccionado.id, { horariosNoDisponibles: actualizados })
    setEmpSeleccionado({ ...empSeleccionado, horariosNoDisponibles: actualizados })
  }

  const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  return (
    <div className="space-y-4 text-xs">
      {/* Encabezado y disparador de Gema */}
      <div className="flex flex-col gap-3 rounded-3xl border border-sky-400/25 bg-gradient-to-r from-sky-500/[0.1] via-teal-500/[0.05] to-black/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/20 text-sky-300">
              <Calendar className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-extrabold text-white">
              Centro de Turnos y Guardia Inteligente (Tope 42h)
            </h2>
          </div>
          <p className="text-[11px] text-mist-400">
            Gema analiza los horarios personales/universitarios de cada colaborador y rota los turnos equitativamente.
            Si queda alguna franja descubierta, te asigna a ti como respaldo de emergencia 🚨.
          </p>
        </div>

        <button
          type="button"
          onClick={onRotarTurnosPorIA}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 px-4 py-2.5 font-black text-[#04241a] shadow-lg transition hover:brightness-110 active:scale-95"
        >
          <Sparkles className="h-4 w-4" />
          <span>💎 Gema: Rotar turnos de la semana</span>
        </button>
      </div>

      {/* Grid de Empleados y sus horas semanales */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-mist-400">
            Colaboradores de Nómina ({empleados.length})
          </span>
          <span className="text-[11px] text-mist-500">Haz clic en uno para editar sus horarios de estudio</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {empleados.map((emp) => {
            const horas = emp.horasSemanalesAsignadas || 0
            const porcHoras = Math.min(100, Math.round((horas / 42) * 100))
            const esSeleccionado = empSeleccionado?.id === emp.id

            return (
              <div
                key={emp.id}
                onClick={() => setEmpSeleccionado(emp)}
                className={`cursor-pointer rounded-2xl border p-3 transition ${
                  esSeleccionado
                    ? 'border-sky-400/50 bg-sky-400/10 shadow-md'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <UserCheck className="h-4 w-4 text-emerald-300" />
                    <span className="truncate">{emp.nombreCompleto}</span>
                  </div>
                  {emp.enTurnoActivo && (
                    <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                      En turno
                    </span>
                  )}
                </div>

                <div className="mt-1 text-[11px] text-mist-500">{emp.cargo}</div>

                {/* Barra de 42 horas */}
                <div className="mt-2.5 space-y-1">
                  <div className="flex justify-between text-[10px] text-mist-400">
                    <span>Horas semana:</span>
                    <b className="text-white">{horas} / 42h</b>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        horas >= 42 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${porcHoras}%` }}
                    />
                  </div>
                </div>

                {/* Etiquetas de estudio / compromisos */}
                {emp.horariosNoDisponibles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {emp.horariosNoDisponibles.map((h, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] text-mist-300"
                      >
                        <BookOpen className="h-2.5 w-2.5 text-sky-300" />
                        {NOMBRES_DIAS[h.diaSemana % 7]}: {h.motivo}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Editor de Horarios Personales / Clases Universitarias */}
      {empSeleccionado && (
        <div className="rounded-3xl border border-sky-400/30 bg-night-900/90 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-extrabold text-white">
                Horarios Personales y Clases de {empSeleccionado.nombreCompleto}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEmpSeleccionado(null)}
              className="cursor-pointer text-xs text-mist-500 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Día de la semana</span>
              <select
                value={nuevoDiaSemana}
                onChange={(e) => setNuevoDiaSemana(Number(e.target.value))}
                className="field-dark h-9 rounded-xl px-2 text-xs"
              >
                <option value={1}>Lunes</option>
                <option value={2}>Martes</option>
                <option value={3}>Miércoles</option>
                <option value={4}>Jueves</option>
                <option value={5}>Viernes</option>
                <option value={6}>Sábado</option>
                <option value={0}>Domingo</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Hora inicio</span>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="field-dark h-9 rounded-xl px-2 text-xs"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Hora fin</span>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="field-dark h-9 rounded-xl px-2 text-xs"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-mist-400">Motivo (ej: Universidad)</span>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Clases de medicina"
                className="field-dark h-9 rounded-xl px-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={agregarRestriccionHorario}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-400/20 px-3 py-1.5 font-bold text-sky-200 transition hover:bg-sky-400/30"
            >
              <span>+ Añadir horario no disponible</span>
            </button>
            <span className="text-[11px] text-mist-500">Gema no le asignará turnos en estas horas</span>
          </div>

          {/* Lista actual de restricciones */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(empSeleccionado.horariosNoDisponibles || []).map((h, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-mist-300"
              >
                <b>{NOMBRES_DIAS[h.diaSemana % 7]}</b>: {h.horaInicio} - {h.horaFin} ({h.motivo})
                <button
                  type="button"
                  onClick={() => borrarRestriccion(i)}
                  className="cursor-pointer text-red-400 hover:text-red-300"
                  title="Eliminar restricción"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tablero Semanal de Turnos Generados */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-extrabold text-white">Cuadrante Semanal de Guardia</h3>
          </div>
          <span className="text-[11px] text-mist-500">{turnos.length} turnos programados</span>
        </div>

        {turnos.length === 0 ? (
          <div className="p-8 text-center text-mist-500">
            <Calendar className="mx-auto mb-2 h-8 w-8 text-mist-600" />
            <p className="font-bold text-mist-300">Aún no hay turnos generados para esta semana.</p>
            <p className="text-[11px]">
              Presiona el botón superior para que Gema analice los horarios y arme la rotación automática.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {turnos.map((t) => (
              <div
                key={t.id}
                className={`rounded-2xl border p-3 ${
                  t.esRespaldoCoordinador
                    ? 'border-red-400/40 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                    : 'border-white/[0.08] bg-black/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    {t.esRespaldoCoordinador ? (
                      <ShieldAlert className="h-4 w-4 text-red-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    <span>{t.empleadoNombre}</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-amber-300">{t.horas}h</span>
                </div>

                <div className="mt-1 text-[11px] text-mist-400">{t.rolGuardia}</div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-mist-500 border-t border-white/[0.06] pt-1.5">
                  <span>Fecha: {t.fecha}</span>
                  <span className="font-mono font-bold text-mist-300">
                    {t.horaInicio} - {t.horaFin}
                  </span>
                </div>

                {t.notas && <p className="mt-1 text-[10px] italic text-red-200">{t.notas}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
