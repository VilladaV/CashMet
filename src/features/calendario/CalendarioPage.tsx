import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  actualizarEvento,
  construirEventos,
  crearEvento,
  eliminarEvento,
  guardarEventos,
  listarEventos,
  type EventoDoc,
  type EventoInput,
  type TipoEvento,
} from '@/lib/firebase/calendarioRepo'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PlusCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'

const ETIQUETA: Record<string, string> = {
  soat: 'SOAT',
  tecnicomecanica: 'Tecnicomecánica',
  seguro_tr: 'Seguro',
  prima_julio: 'Prima julio',
  prima_diciembre: 'Prima diciembre',
  cuota_deuda: 'Cuota',
  predial: 'Predial',
  impuesto: 'Impuesto',
  pago_sueldo: 'Sueldo',
  nomina_trabajador: 'Nómina',
  recurrente: 'Recurrente',
  personal: 'Personal',
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const COLOR_TIPO: Record<string, string> = {
  soat: 'bg-red-50 text-red-700 border-red-200',
  tecnicomecanica: 'bg-amber-50 text-amber-800 border-amber-200',
  seguro_tr: 'bg-orange-50 text-orange-800 border-orange-200',
  cuota_deuda: 'bg-sky-50 text-sky-800 border-sky-200',
  prima_julio: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  prima_diciembre: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  personal: 'bg-slate-50 text-slate-700 border-slate-200',
}

const HOY_ISO = new Date().toISOString().slice(0, 10)

export default function CalendarioPage() {
  const [generando, setGenerando] = useState(false)
  const [eventos, setEventos] = useState<EventoDoc[]>([])
  const [preview, setPreview] = useState<EventoInput[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState({
    fecha: '',
    titulo: '',
    tipo: 'personal' as TipoEvento,
    descripcion: '',
  })
  const [creando, setCreando] = useState(false)
  const [mesVista, setMesVista] = useState(() => {
    const hoy = new Date()
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  })
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    fecha: string
    titulo: string
    tipo: TipoEvento
    descripcion: string
  } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    listarEventos(500)
      .then(setEventos)
      .catch(() => setError('No se pudieron cargar los eventos del calendario.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porDia = useMemo(() => {
    const mapa: Record<string, EventoDoc[]> = {}
    for (const e of eventos) {
      const clave = (e.fechaInicio || '').slice(0, 10)
      if (!clave) continue
      ;(mapa[clave] ||= []).push(e)
    }
    return mapa
  }, [eventos])

  const celdas = useMemo(() => {
    const year = mesVista.getFullYear()
    const month = mesVista.getMonth()
    const primerDia = new Date(year, month, 1).getDay()
    const offset = (primerDia + 6) % 7
    const dias = new Date(year, month + 1, 0).getDate()
    const out: Array<{ clave: string; dia: number } | null> = []
    for (let i = 0; i < offset; i++) out.push(null)
    for (let d = 1; d <= dias; d++) {
      const clave = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      out.push({ clave, dia: d })
    }
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [mesVista])

  const etiquetaMes = useMemo(
    () => mesVista.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
    [mesVista]
  )

  const cambiarMes = (delta: number) => {
    setMesVista((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
    setDiaSel(null)
  }

  const previsualizar = async () => {
    setGenerando(true)
    setError('')
    setMsg('')
    try {
      const evs = await construirEventos(12)
      setPreview(evs)
      setMsg(`Se proyectaron ${evs.length} eventos para los próximos 12 meses.`)
    } catch {
      setError('No se pudieron calcular los eventos. Verifica si tienes vehículos, nómina o deudas registrados.')
    } finally {
      setGenerando(false)
    }
  }

  const guardar = async () => {
    if (!preview.length) return
    setGenerando(true)
    setError('')
    try {
      const n = await guardarEventos(preview)
      setMsg(`¡Listo! Se guardaron ${n} eventos en Firestore.`)
      setPreview([])
      cargar()
    } catch {
      setError('No se pudieron guardar los eventos.')
    } finally {
      setGenerando(false)
    }
  }

  const crearManual = async () => {
    if (!nuevo.fecha || !nuevo.titulo.trim()) return
    setCreando(true)
    setError('')
    try {
      await crearEvento({
        titulo: nuevo.titulo.trim(),
        descripcion: nuevo.descripcion.trim() || undefined,
        tipo: nuevo.tipo,
        fechaInicio: nuevo.fecha,
        allDay: true,
        recurrente: false,
        recordatorios: [{ minutosAntes: 60 }],
        relacionado: {},
      })
      setNuevo({ fecha: '', titulo: '', tipo: 'personal', descripcion: '' })
      setMsg('Evento añadido al calendario.')
      cargar()
    } catch {
      setError('No se pudo crear el evento.')
    } finally {
      setCreando(false)
    }
  }

  const borrarEvento = async (id: string) => {
    if (!confirm('¿Deseas eliminar este evento del calendario?')) return
    try {
      await eliminarEvento(id)
      if (editandoId === id) cerrarEdicion()
      cargar()
    } catch {
      setError('No se pudo eliminar el evento.')
    }
  }

  const abrirEdicion = (e: EventoDoc) => {
    setEditandoId(e.id)
    setError('')
    setForm({
      fecha: (e.fechaInicio || '').slice(0, 10),
      titulo: e.titulo || '',
      tipo: e.tipo,
      descripcion: e.descripcion || '',
    })
  }

  const cerrarEdicion = () => {
    setEditandoId(null)
    setForm(null)
  }

  const guardarEdicion = async () => {
    if (!editandoId || !form) return
    if (!form.fecha || !form.titulo.trim()) {
      setError('Completa la fecha y el título del evento.')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await actualizarEvento(editandoId, {
        fechaInicio: form.fecha,
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        descripcion: form.descripcion.trim() || undefined,
      })
      cerrarEdicion()
      cargar()
    } catch {
      setError('No se pudo actualizar el evento.')
    } finally {
      setGuardando(false)
    }
  }

  const eventosDia = diaSel ? porDia[diaSel] ?? [] : []

  return (
    <div className="container mx-auto p-2 sm:p-4 max-w-5xl space-y-4">
      {/* HEADER CARD: GENERADOR INTELIGENTE */}
      <Card className="glass-card shadow-xs border-slate-200/90 overflow-hidden">
        <div className="h-1.5 w-full gradient-brand-growth" />
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-emerald-600" />
              <h1 className="font-bold text-base text-slate-900">
                Calendario de Vencimientos Financieros (Colombia)
              </h1>
            </div>
            <p className="text-xs text-slate-500 max-w-xl">
              Proyecta automáticamente fechas críticas: SOAT, Tecnicomecánica, Seguro Todo Riesgo, primas legales (junio/diciembre) y cuotas de préstamos.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              disabled={generando}
              onClick={previsualizar}
              className="text-xs h-8.5 border-slate-200 flex-1 sm:flex-initial"
            >
              <Clock className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
              <span>Previsualizar</span>
            </Button>
            <Button
              size="sm"
              disabled={generando || !preview.length}
              onClick={guardar}
              className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-8.5 px-3.5 flex-1 sm:flex-initial shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              <span>Guardar {preview.length ? `(${preview.length})` : ''}</span>
            </Button>
          </div>
        </CardContent>

        {(msg || error) && (
          <div className="px-4 pb-3">
            {msg && (
              <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{msg}</span>
              </div>
            )}
            {error && (
              <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* CUADRÍCULA DEL CALENDARIO MENSUAL */}
      <Card className="glass-card shadow-xs border-slate-200/90 overflow-hidden">
        {/* Navegación del Mes */}
        <CardHeader className="py-3 px-4 sm:px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-extrabold text-slate-900 capitalize flex items-center gap-2">
            <span>{etiquetaMes}</span>
          </CardTitle>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 border-slate-200 text-slate-600"
              onClick={() => cambiarMes(-1)}
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs font-semibold border-slate-200 text-slate-700"
              onClick={() => {
                const hoy = new Date()
                setMesVista(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
                setDiaSel(null)
              }}
            >
              Hoy
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 border-slate-200 text-slate-600"
              onClick={() => cambiarMes(1)}
              title="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-5 space-y-2">
          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500 py-1">
            {DIAS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Días del mes */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {celdas.map((c, i) => {
              if (!c) return <div key={`empty-${i}`} className="min-h-16 sm:min-h-20 rounded-xl bg-slate-50/40" />
              const evs = porDia[c.clave] ?? []
              const esHoy = c.clave === HOY_ISO
              const seleccionado = c.clave === diaSel
              return (
                <button
                  type="button"
                  key={c.clave}
                  onClick={() => setDiaSel(seleccionado ? null : c.clave)}
                  className={`min-h-16 sm:min-h-20 rounded-xl border p-1 sm:p-1.5 text-left align-top transition-all cursor-pointer ${
                    seleccionado
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-2xs'
                      : esHoy
                      ? 'border-slate-300 bg-sky-50/30'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold ${
                        esHoy
                          ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0A2540] text-emerald-400 text-[11px]'
                          : 'text-slate-600'
                      }`}
                    >
                      {c.dia}
                    </span>
                    {evs.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {evs.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className={`truncate rounded-md border px-1 py-0.2 text-[9px] sm:text-[10px] font-semibold leading-tight ${
                          COLOR_TIPO[e.tipo] ?? 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                        title={e.titulo}
                      >
                        {e.titulo}
                      </div>
                    ))}
                    {evs.length > 2 && (
                      <div className="text-[9px] font-bold text-slate-400 pl-0.5">
                        +{evs.length - 2} más
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* DETALLE DEL DÍA SELECCIONADO */}
          {diaSel && (
            <div className="mt-3 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 animate-in fade-in space-y-2">
              <div className="text-xs font-bold text-emerald-950 flex items-center justify-between">
                <span>Eventos del {diaSel}</span>
                <span className="text-[11px] font-normal text-emerald-800">
                  {eventosDia.length} programados
                </span>
              </div>

              {eventosDia.length === 0 ? (
                <div className="text-xs text-slate-500 py-1">Sin eventos programados para este día.</div>
              ) : (
                <ul className="divide-y divide-emerald-100/70 text-xs">
                  {eventosDia.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <span className="font-bold text-slate-900">{e.titulo}</span>
                        <span className="text-slate-500 text-[11px]"> · {ETIQUETA[e.tipo] ?? e.tipo}</span>
                        {e.descripcion && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{e.descripcion}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500 hover:text-slate-900"
                          onClick={() => abrirEdicion(e)}
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500 hover:text-red-700"
                          onClick={() => borrarEvento(e.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FORMULARIO DE EDICIÓN DE EVENTO */}
      {form && (
        <Card className="border-emerald-300 bg-emerald-50/20 shadow-md">
          <CardHeader className="py-3 px-4 border-b border-emerald-100">
            <CardTitle className="text-sm font-bold text-emerald-950 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-emerald-600" />
              <span>Modificar Evento del Calendario</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Fecha</span>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Tipo</span>
                <select
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoEvento })}
                >
                  {Object.keys(ETIQUETA).map((k) => (
                    <option key={k} value={k}>
                      {ETIQUETA[k]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Título</span>
                <Input
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200"
                />
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Descripción</span>
                <Input
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="h-8 text-xs bg-white border-slate-200"
                />
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                size="sm"
                className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-8 gap-1.5"
                disabled={guardando}
                onClick={guardarEdicion}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 border-slate-200"
                disabled={guardando}
                onClick={cerrarEdicion}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CREAR EVENTO MANUAL */}
      <Card className="glass-card shadow-xs border-slate-200/90 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-slate-100">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>Crear Evento o Recordatorio Manual</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Fecha</span>
              <Input
                type="date"
                value={nuevo.fecha}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
                className="h-8 text-xs bg-white border-slate-200"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Tipo de Evento</span>
              <select
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                value={nuevo.tipo}
                onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoEvento })}
              >
                {Object.keys(ETIQUETA).map((k) => (
                  <option key={k} value={k}>
                    {ETIQUETA[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Título del Recordatorio</span>
              <Input
                value={nuevo.titulo}
                onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
                placeholder="Ej: Pago de predial, Mantenimiento preventivo..."
                className="h-8 text-xs bg-white border-slate-200"
              />
            </label>

            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Descripción (opcional)</span>
              <Input
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
                placeholder="Notas adicionales..."
                className="h-8 text-xs bg-white border-slate-200"
              />
            </label>
          </div>

          <div className="pt-1">
            <Button
              size="sm"
              disabled={creando || !nuevo.fecha || !nuevo.titulo.trim()}
              onClick={crearManual}
              className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-8 px-4 gap-1.5 shadow-xs"
            >
              <span>{creando ? 'Creando...' : 'Crear Recordatorio'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
