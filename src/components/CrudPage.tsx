import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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

  const cargar = () =>
    listar()
      .then(setItems)
      .catch(() => setError('No se pudieron cargar los datos.'))

  useEffect(() => {
    cargar()
  }, [])

  const submit = async () => {
    setError('')
    setMsg('')
    const faltante = campos.find((c) => c.required && !String(form[c.key] ?? '').trim())
    if (faltante) {
      setError(`Falta: ${faltante.label}`)
      return
    }
    setBusy(true)
    try {
      const documento = transformar(form)
      if (editId && actualizar) {
        await actualizar(editId, documento)
        setMsg('Actualizado.')
      } else {
        await crear(documento)
        setMsg('Creado.')
      }
      setForm(vacio)
      setEditId(null)
      cargar()
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.')
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
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await eliminar(item.id)
      cargar()
    } catch {
      setError('No se pudo eliminar.')
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{editId ? `Editar ${titulo}` : `Nuevo ${titulo}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {descripcion && <p className="text-muted-foreground">{descripcion}</p>}
          <div className="grid grid-cols-2 gap-2">
            {campos.map((c) => (
              <label key={c.key} className={`${c.span2 ? 'col-span-2' : ''} flex flex-col gap-1`}>
                <span className="text-xs text-muted-foreground">{c.label}</span>
                {c.tipo === 'select' ? (
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={form[c.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                  >
                    <option value="">—</option>
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
                  />
                )}
              </label>
            ))}
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          {msg && <div className="text-xs text-green-700">{msg}</div>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={submit}>
              {busy ? '...' : editId ? 'Guardar cambios' : 'Crear'}
            </Button>
            {editId && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditId(null)
                  setForm(vacio)
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {extra}

      <Card>
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {items.length === 0 ? (
            <p className="text-muted-foreground">Sin registros todavía.</p>
          ) : (
            <ul className="divide-y">
              {items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">{renderItem(it)}</div>
                  <div className="flex gap-1 shrink-0">
                    {actualizar && (
                      <Button size="sm" variant="outline" onClick={() => editar(it)}>
                        Editar
                      </Button>
                    )}
                    {eliminar && (
                      <Button size="sm" variant="outline" onClick={() => borrar(it)}>
                        Eliminar
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