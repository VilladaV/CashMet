import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PlusCircle, Edit3, Trash2, Check, AlertCircle } from 'lucide-react'

export interface CampoForm {
  key: string
  label: string
  tipo?: 'text' | 'number' | 'date' | 'select'
  opciones?: { value: string; label: string }[]
  required?: boolean
  span2?: boolean
}

interface Props<T extends { id: string }> {
  titulo: string
  descripcion?: string
  campos: CampoForm[]
  vacio: Record<string, string>
  listar: () => Promise<T[]>
  crear: (d: Record<string, unknown>) => Promise<string>
  actualizar?: (id: string, d: Record<string, unknown>) => Promise<void>
  eliminar?: (id: string) => Promise<void>
  transformar: (vals: Record<string, string>) => Record<string, unknown>
  aForm: (item: T) => Record<string, string>
  renderItem: (item: T) => React.ReactNode
  extra?: React.ReactNode
}

export default function CrudPage<T extends { id: string }>(props: Props<T>) {
  const { titulo, descripcion, campos, vacio, listar, crear, actualizar, eliminar, transformar, aForm, renderItem, extra } = props
  const [items, setItems] = useState<T[]>([])
  const [form, setForm] = useState<Record<string, string>>(vacio)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    listar()
      .then(setItems)
      .catch(() => setError('No se pudieron cargar los datos.'))
  }, [listar])

  useEffect(() => {
    cargar()
  }, [cargar])

  const submit = async () => {
    setError('')
    setMsg('')
    const faltante = campos.find((c) => c.required && !String(form[c.key] ?? '').trim())
    if (faltante) {
      setError(`Falta diligenciar: ${faltante.label}`)
      return
    }
    setBusy(true)
    try {
      const documento = transformar(form)
      if (editId && actualizar) {
        await actualizar(editId, documento)
        setMsg('Registro actualizado exitosamente.')
      } else {
        await crear(documento)
        setMsg('Registro creado exitosamente.')
      }
      setForm(vacio)
      setEditId(null)
      cargar()
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la información.')
    } finally {
      setBusy(false)
    }
  }

  const editar = (item: T) => {
    setForm({ ...vacio, ...aForm(item) })
    setEditId(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const borrar = async (item: T) => {
    if (!eliminar) return
    if (!confirm('¿Deseas eliminar este registro de la base de datos?')) return
    try {
      await eliminar(item.id)
      cargar()
    } catch {
      setError('No se pudo eliminar el registro.')
    }
  }

  return (
    <div className="container mx-auto p-2 sm:p-4 max-w-4xl space-y-4">
      {/* FORMULARIO DE CREACIÓN / EDICIÓN */}
      <Card className="glass-card shadow-sm border-slate-200/90 overflow-hidden">
        <div className="h-1 w-full gradient-brand-growth" />
        <CardHeader className="py-3.5 px-4 sm:px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            {editId ? <Edit3 className="w-4 h-4 text-emerald-600" /> : <PlusCircle className="w-4 h-4 text-emerald-600" />}
            <span>{editId ? `Editar ${titulo}` : `Nuevo Registro de ${titulo}`}</span>
          </CardTitle>
          {editId && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Modo Edición
            </span>
          )}
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4 text-xs">
          {descripcion && <p className="text-slate-500">{descripcion}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campos.map((c) => (
              <label key={c.key} className={`${c.span2 ? 'sm:col-span-2' : ''} flex flex-col gap-1.5`}>
                <span className="font-semibold text-slate-700">
                  {c.label} {c.required && <span className="text-red-500">*</span>}
                </span>
                {c.tipo === 'select' ? (
                  <select
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={form[c.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {c.opciones?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : 'text'}
                    value={form[c.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    className="h-9 text-xs bg-white border-slate-200 focus-visible:ring-emerald-500"
                  />
                )}
              </label>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {msg && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
              <Check className="w-4 h-4 shrink-0" />
              <span>{msg}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <Button
              size="sm"
              disabled={busy}
              onClick={submit}
              className="gradient-brand-growth text-white hover:opacity-90 font-semibold text-xs h-8.5 px-4 gap-1.5 shadow-xs"
            >
              <span>{busy ? 'Guardando...' : editId ? 'Actualizar Registro' : `Guardar ${titulo}`}</span>
            </Button>
            {editId && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditId(null)
                  setForm(vacio)
                  setError('')
                  setMsg('')
                }}
                className="text-xs h-8.5 border-slate-200"
              >
                Cancelar Edición
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {extra}

      {/* LISTADO DE ELEMENTOS EXISTENTES */}
      <Card className="glass-card shadow-xs border-slate-200/90 overflow-hidden">
        <CardHeader className="py-3.5 px-4 sm:px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
            {titulo}s Registrados
          </CardTitle>
          <span className="text-[11px] font-semibold text-slate-500">
            {items.length} {items.length === 1 ? 'registro' : 'registros'}
          </span>
        </CardHeader>
        <CardContent className="p-0 text-xs">
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-1">
              <p className="font-semibold">No hay {titulo.toLowerCase()}s registrados todavía</p>
              <p className="text-[11px]">Diligencia el formulario superior para añadir el primero.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 p-3 sm:px-6 hover:bg-slate-50/80 transition-colors">
                  <div className="min-w-0 flex-1">{renderItem(it)}</div>
                  <div className="flex items-center gap-1 shrink-0">
                    {actualizar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => editar(it)}
                        className="h-8 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                    )}
                    {eliminar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => borrar(it)}
                        className="h-8 text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                        <span className="hidden sm:inline">Eliminar</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}