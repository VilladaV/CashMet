import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  CATEGORIAS_RECURRENTE,
  PERIODICIDADES,
  actualizarRecurrente,
  crearRecurrente,
  eliminarRecurrente,
  listarRecurrentes,
  type GastoRecurrente,
} from '@/lib/firebase/recurrentesRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const CAMPOS: CampoForm[] = [
  { key: 'concepto', label: 'Concepto', required: true, span2: true },
  { key: 'categoria', label: 'Categoría', tipo: 'select', opciones: CATEGORIAS_RECURRENTE.map((t) => ({ value: t, label: t })) },
  { key: 'valor', label: 'Valor (COP)', tipo: 'number', required: true },
  { key: 'periodicidad', label: 'Periodicidad', tipo: 'select', opciones: PERIODICIDADES.map((t) => ({ value: t, label: t })) },
  { key: 'diaVencimiento', label: 'Día de vencimiento (1-31)', tipo: 'number' },
  { key: 'activo', label: 'Activo', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
  { key: 'notas', label: 'Notas', span2: true },
]

const VACIO: Record<string, string> = { categoria: 'hogar', periodicidad: 'mensual', activo: 'si' }

export default function RecurrentesPage() {
  return (
    <CrudPage<GastoRecurrente>
      titulo="Gasto recurrente"
      descripcion="Gastos fijos (internet, luz, agua, arriendo...) para proyecciones y recordatorios."
      campos={CAMPOS}
      vacio={VACIO}
      listar={listarRecurrentes}
      crear={(d) => crearRecurrente(d)}
      actualizar={(id, d) => actualizarRecurrente(id, d)}
      eliminar={(id) => eliminarRecurrente(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {
          concepto: vals.concepto.trim(),
          categoria: vals.categoria || 'hogar',
          valor: num(vals.valor),
          periodicidad: vals.periodicidad || 'mensual',
          activo: vals.activo !== 'no',
        }
        const dia = num(vals.diaVencimiento as string)
        if (dia !== undefined) doc.diaVencimiento = dia
        if (vals.notas?.trim()) doc.notas = vals.notas.trim()
        return doc
      }}
      aForm={(g) => ({
        concepto: g.concepto,
        categoria: g.categoria,
        valor: String(g.valor ?? ''),
        periodicidad: g.periodicidad,
        diaVencimiento: g.diaVencimiento != null ? String(g.diaVencimiento) : '',
        activo: g.activo === false ? 'no' : 'si',
        notas: g.notas ?? '',
      })}
      renderItem={(g) => (
        <div>
          <div className="font-medium">
            {g.concepto} <span className="text-muted-foreground">({g.categoria})</span>
            {g.activo === false ? ' — inactivo' : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            ${(g.valor || 0).toLocaleString('es-CO')} / {g.periodicidad}
            {g.diaVencimiento ? ` · Vence día ${g.diaVencimiento}` : ''}
          </div>
        </div>
      )}
    />
  )
}