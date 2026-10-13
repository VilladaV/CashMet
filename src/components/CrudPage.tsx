import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
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
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="glass-card overflow-hidden border-0">
        <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white sm:text-base">
            {editId ? <Edit3 className="h-4 w-4 text-emerald-300" /> : <PlusCircle className="h-4 w-4 text-emerald-300" />}
            <span>{editId ? `Editar ${titulo}` : `Nuevo registro de ${titulo}`}</span>
          </CardTitle>
          {editId && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
              Modo edición
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4 p-4 text-xs sm:p-6">
          {descripcion && <p className="leading-relaxed text-mist-500">{descripcion}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {campos.map((c) => (
              <label key={c.key} className={`${c.span2 ? 'sm:col-span-2' : ''} flex flex-col gap-1.5`}>
                <span className="font-bold text-mist-300">
                  {c.label} {c.required && <span className="text-red-300">*</span>}
                </span>
                {c.tipo === 'select' ? (
                  <select
                    className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
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
                    className="field-dark h-10 text-xs shadow-none"
                  />
                )}
              </label>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 font-medium text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {msg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 font-bold text-emerald-200">
              <Check className="h-4 w-4 shrink-0" />
              <span>{msg}</span>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <Button
              size="sm"
              disabled={busy}
              onClick={submit}
              className="h-9 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
            >
              <span>{busy ? 'Guardando...' : editId ? 'Actualizar registro' : `Guardar ${titulo}`}</span>
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
                className="h-9 cursor-pointer border-white/10 bg-transparent text-xs text-mist-300 hover:bg-white/5 hover:text-white"
              >
                Cancelar edición
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {extra}

      <Card className="glass-card overflow-hidden border-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
          <CardTitle className="text-sm font-extrabold text-white sm:text-base">
            {titulo}s registrados
          </CardTitle>
          <span className="text-[11px] font-semibold text-mist-500">
            {items.length} {items.length === 1 ? 'registro' : 'registros'}
          </span>
        </CardHeader>
        <CardContent className="p-0 text-xs">
          {items.length === 0 ? (
            <div className="space-y-1 p-8 text-center">
              <p className="font-bold text-mist-300">No hay {titulo.toLowerCase()}s registrados todavía</p>
              <p className="text-[11px] text-mist-600">Diligencia el formulario superior para añadir el primero.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.03] sm:px-6">
                  <div className="min-w-0 flex-1 text-mist-100">{renderItem(it)}</div>
                  <div className="flex shrink-0 items-center gap-1">
                    {actualizar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => editar(it)}
                        className="h-8 cursor-pointer gap-1 text-xs text-mist-500 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                    )}
                    {eliminar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => borrar(it)}
                        className="h-8 cursor-pointer gap-1 text-xs text-mist-500 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
    </motion.div>
  )
}
