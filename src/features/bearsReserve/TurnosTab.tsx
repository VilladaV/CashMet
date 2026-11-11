import { useState, useMemo } from 'react'
import type { EmpleadoOperativo, TurnoSemanal } from './types'
import {
  Sparkles,
  Calendar,
  Clock,
  UserCheck,
  UserX,
  ShieldAlert,
  BookOpen,
  CheckCircle2,
  LayoutGrid,
  List,
  ShieldCheck,
} from 'lucide-react'
import { hoyISO } from '@/lib/fechas'

interface Props {
  empleados: EmpleadoOperativo[]
  turnos: TurnoSemanal[]
  onRotarTurnosPorIA: () => void
  onActualizarEmpleado: (id: string, parcial: Partial<EmpleadoOperativo>) => void
}

const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const FRANJAS_24H = [
  {
    clave: 'manana' as const,
    etiqueta: 'Mañana',
    icono: '🌅',
    horario: '06:00 - 14:00',
    horas: '8h',
    badgeColor: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  {
    clave: 'tarde' as const,
    etiqueta: 'Tarde',
    icono: '☀️',
    horario: '14:00 - 22:00',
    horas: '8h',
    badgeColor: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  },
  {
    clave: 'noche' as const,
    etiqueta: 'Noche',
    icono: '🌙',
    horario: '22:00 - 06:00',
    horas: '8h',
    badgeColor: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-300',
  },
]

function calcularDiasSemana(refSemanaISO?: string) {
  let base: Date
  if (refSemanaISO) {
    const [y, m, d] = refSemanaISO.split('-').map(Number)
    base = new Date(y, m - 1, d, 12, 0, 0)
  } else {
    const hoyD = new Date()
    base = new Date(hoyD.getFullYear(), hoyD.getMonth(), hoyD.getDate() - ((hoyD.getDay() + 6) % 7), 12, 0, 0)
  }
  const dias = []
  const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const hoy = hoyISO()

  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const diaNum = String(d.getDate()).padStart(2, '0')
    const iso = `${y}-${m}-${diaNum}`
    dias.push({
      nombre: NOMBRES[i],
      nombreCorto: NOMBRES[i].slice(0, 3),
      fechaISO: iso,
      fechaCorta: `${diaNum} ${MESES[d.getMonth()]}`,
      esHoy: iso === hoy,
    })
  }
  return dias
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
  const [vista, setVista] = useState<'horario' | 'tarjetas'>('horario')

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

  // Generar lista memoizada de los 7 días de la semana a partir de los turnos
  const diasSemana = useMemo(() => calcularDiasSemana(turnos[0]?.semanaISO), [turnos])
  const empleadosActivos = empleados.filter((e) => e.activo !== false)
  const totalHorasProgramadas = turnos.reduce((acc, t) => acc + t.horas, 0)

  return (
    <div className="space-y-5 text-xs">
      {/* Encabezado y disparador de Gema */}
      <div className="flex flex-col gap-4 rounded-3xl border border-sky-400/25 bg-gradient-to-r from-sky-500/[0.12] via-teal-500/[0.08] to-black/40 p-4 sm:flex-row sm:items-center sm:justify-between shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/20 text-sky-300">
              <Calendar className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-extrabold text-white">
              Centro de Turnos y Guardia Continua 24/7 (Tope 40-42h)
            </h2>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              Cobertura 100% Sin Ratos Vacíos
            </span>
          </div>
          <p className="text-[11px] text-mist-300 leading-relaxed">
            3 turnos continuos de 8 horas diarias sin jornadas partidas. En cada turno de guardia permanecen mínimo
            1 Conductor y 1 Mecánico/Polivalente. Las rutas escolares se realizan dentro de la jornada continua y cada
            colaborador activo cumple con 40 a 42 horas semanales respetando sus descansos y estudios.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-mist-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <b>{empleadosActivos.length}</b> de {empleados.length} colaboradores activos en reserva
            </span>
            <span>·</span>
            <span>
              <b>{totalHorasProgramadas}h</b> semanales cubiertas en 24/7
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRotarTurnosPorIA}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 px-5 py-3 font-black text-[#04241a] shadow-lg transition hover:brightness-110 active:scale-95 shrink-0"
        >
          <Sparkles className="h-4 w-4" />
          <span>💎 Gema: Rotar turnos 24/7</span>
        </button>
      </div>

      {/* Grid de Empleados con Desactivador / Habilitador y Horas Reales */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-mist-300">
              Colaboradores de Nómina ({empleados.length})
            </span>
            <span className="ml-2 text-[10px] text-mist-500">
              Usa el switch para incluir o excluir personal de las operaciones de rescate
            </span>
          </div>
          <span className="text-[10px] text-mist-400">Haz clic en una ficha para gestionar horarios de estudio</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {empleados.map((emp) => {
            const activo = emp.activo !== false
            const horasSemana = turnos
              .filter((t) => t.empleadoId === emp.id)
              .reduce((s, t) => s + t.horas, 0)
            const porcHoras = Math.min(100, Math.round((horasSemana / 42) * 100))
            const esSeleccionado = empSeleccionado?.id === emp.id

            return (
              <div
                key={emp.id}
                className={`rounded-2xl border p-3 transition ${
                  !activo
                    ? 'border-white/[0.05] bg-white/[0.01] opacity-60'
                    : esSeleccionado
                      ? 'border-sky-400/50 bg-sky-400/10 shadow-md'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    onClick={() => setEmpSeleccionado(emp)}
                    className="flex-1 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 font-bold text-white">
                      {activo ? (
                        <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <UserX className="h-4 w-4 text-mist-500 shrink-0" />
                      )}
                      <span className="truncate">{emp.nombreCompleto}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-mist-400">{emp.cargo}</div>
                  </div>

                  {/* Toggle para habilitar/deshabilitar de Bear's Reserve */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onActualizarEmpleado(emp.id, { activo: !activo })
                    }}
                    className={`shrink-0 cursor-pointer rounded-xl px-2.5 py-1 text-[10px] font-extrabold transition shadow-sm ${
                      activo
                        ? 'border border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
                        : 'border border-mist-600/30 bg-mist-800/40 text-mist-400 hover:bg-mist-700/50'
                    }`}
                    title={activo ? 'Clic para excluir de Bear\'s Reserve' : 'Clic para habilitar en Bear\'s Reserve'}
                  >
                    {activo ? '✅ En Reserva' : '⏸️ Excluido'}
                  </button>
                </div>

                {/* Barra de 40-42 horas calculada dinámicamente según el cuadrante */}
                {activo ? (
                  <div className="mt-2.5 space-y-1">
                    <div className="flex justify-between text-[10px] text-mist-400">
                      <span>Carga asignada esta semana:</span>
                      <b
                        className={`font-mono ${
                          horasSemana >= 40 ? 'text-emerald-300 font-bold' : horasSemana > 0 ? 'text-white' : 'text-mist-500'
                        }`}
                      >
                        {horasSemana} / 42h
                      </b>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          horasSemana >= 40
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                            : 'bg-sky-400'
                        }`}
                        style={{ width: `${porcHoras}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 rounded-lg border border-dashed border-white/10 px-2 py-1 text-[10px] text-mist-500 text-center">
                    Excluido de la asignación operativa de guardia
                  </div>
                )}

                {/* Etiquetas de estudio / compromisos universitarios */}
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

      {/* HORARIO SEMANAL 24/7 (Matriz Visual de Días vs Franjas) */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 shadow-xl">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-extrabold text-white">
              Horario Semanal de Guardia Continua (24 Horas)
            </h3>
            <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-mist-400">
              {turnos.length} puestos programados
            </span>
          </div>

          {/* Alternar vista Matriz vs Tarjetas */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            <button
              type="button"
              onClick={() => setVista('horario')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                vista === 'horario'
                  ? 'bg-sky-400/20 text-sky-200 shadow-sm'
                  : 'text-mist-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Matriz Horario</span>
            </button>
            <button
              type="button"
              onClick={() => setVista('tarjetas')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                vista === 'tarjetas'
                  ? 'bg-sky-400/20 text-sky-200 shadow-sm'
                  : 'text-mist-400 hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Fichas</span>
            </button>
          </div>
        </div>

        {turnos.length === 0 ? (
          <div className="p-8 text-center text-mist-500">
            <Calendar className="mx-auto mb-2 h-8 w-8 text-mist-600" />
            <p className="font-bold text-mist-300">Aún no hay turnos generados para esta semana.</p>
            <p className="text-[11px]">
              Presiona el botón superior para que Gema analice los roles y arme el horario continuo 24/7.
            </p>
          </div>
        ) : vista === 'horario' ? (
          /* TABLA DE HORARIO SEMANAL 24/7 */
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="p-3 w-40 text-mist-400 text-[11px] uppercase tracking-wider font-extrabold border-r border-white/10">
                    Franja 24/7
                  </th>
                  {diasSemana.map((dia) => (
                    <th
                      key={dia.fechaISO}
                      className={`p-3 text-center border-r border-white/10 last:border-r-0 ${
                        dia.esHoy ? 'bg-sky-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5 text-[12px] font-extrabold text-white">
                        <span>{dia.nombre}</span>
                        {dia.esHoy && (
                          <span className="rounded-full bg-sky-400/30 px-1.5 py-0.2 text-[8px] font-extrabold text-sky-200 animate-pulse">
                            HOY
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] font-mono text-mist-400">{dia.fechaCorta}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FRANJAS_24H.map((franja) => (
                  <tr key={franja.clave} className="border-b border-white/[0.06] last:border-b-0">
                    {/* Encabezado lateral del Turno */}
                    <td className="p-3 align-top bg-white/[0.015] border-r border-white/10">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 font-black text-white text-xs">
                          <span>{franja.icono}</span>
                          <span>{franja.etiqueta}</span>
                        </div>
                        <div className="font-mono text-[10px] text-mist-300 font-bold">
                          {franja.horario}
                        </div>
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[9px] font-extrabold border ${franja.badgeColor}`}>
                          {franja.horas} continuas
                        </span>
                      </div>
                    </td>

                    {/* Celdas para cada uno de los 7 días */}
                    {diasSemana.map((dia) => {
                      const turnosCelda = turnos.filter(
                        (t) => t.fecha === dia.fechaISO && t.franja === franja.clave
                      )
                      const tCond =
                        turnosCelda.find(
                          (t) => t.id.includes('-cond') || t.rolGuardia.toLowerCase().includes('conduc')
                        ) || turnosCelda[0]
                      const tMec =
                        turnosCelda.find(
                          (t) =>
                            t.id.includes('-mec') ||
                            t.rolGuardia.toLowerCase().includes('mec') ||
                            t.rolGuardia.toLowerCase().includes('soporte')
                        ) || (turnosCelda.length > 1 && turnosCelda[1] !== tCond ? turnosCelda[1] : undefined)

                      return (
                        <td
                          key={dia.fechaISO}
                          className={`p-2 align-top border-r border-white/[0.06] last:border-r-0 transition-colors ${
                            dia.esHoy ? 'bg-sky-500/[0.03]' : ''
                          }`}
                        >
                          <div className="flex flex-col gap-1.5 min-h-[115px]">
                            {/* Puesto 1: Conductor */}
                            {tCond ? (
                              <div
                                className={`rounded-xl border p-2 space-y-0.5 shadow-sm ${
                                  tCond.esRespaldoCoordinador
                                    ? 'border-red-400/40 bg-red-500/10 text-red-200'
                                    : 'border-sky-400/25 bg-sky-500/[0.08] text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-extrabold text-[11px] truncate flex items-center gap-1 text-sky-200">
                                    <span>{tCond.rutaHabitualId ? '🚌' : '🚗'}</span>
                                    <span className="truncate">{tCond.empleadoNombre}</span>
                                  </span>
                                  {tCond.esRespaldoCoordinador && (
                                    <span className="rounded bg-red-400/30 px-1 text-[8px] font-black text-red-300 shrink-0">
                                      SOS
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] text-mist-400 line-clamp-2 leading-tight">
                                  {tCond.rolGuardia}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-white/10 p-2 text-[9px] text-mist-500 italic text-center">
                                Sin conductor
                              </div>
                            )}

                            {/* Puesto 2: Mecánico / Polivalente */}
                            {tMec ? (
                              <div
                                className={`rounded-xl border p-2 space-y-0.5 shadow-sm ${
                                  tMec.esRespaldoCoordinador
                                    ? 'border-red-400/40 bg-red-500/10 text-red-200'
                                    : 'border-emerald-400/25 bg-emerald-500/[0.08] text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-extrabold text-[11px] truncate flex items-center gap-1 text-emerald-200">
                                    <span>🔧</span>
                                    <span className="truncate">{tMec.empleadoNombre}</span>
                                  </span>
                                  {tMec.esRespaldoCoordinador && (
                                    <span className="rounded bg-red-400/30 px-1 text-[8px] font-black text-red-300 shrink-0">
                                      SOS
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] text-mist-400 line-clamp-2 leading-tight">
                                  {tMec.rolGuardia}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-white/10 p-2 text-[9px] text-mist-500 italic text-center">
                                Sin mecánico
                              </div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* VISTA DETALLADA EN FICHAS / TARJETAS */
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
