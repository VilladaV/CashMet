import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  actualizarImpuesto,
  crearImpuesto,
  eliminarImpuesto,
  listarImpuestos,
  type Impuesto,
  type PeriodicidadImpuesto,
  type TipoImpuesto,
} from '@/lib/firebase/impuestosRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const TIPOS: { value: TipoImpuesto; label: string }[] = [
  { value: 'predial', label: 'Predial' },
  { value: 'predial_bimestral', label: 'Predial (bimestral)' },
  { value: 'vehicular', label: 'Impuesto vehicular' },
  { value: 'renta', label: 'Renta' },
  { value: 'ica', label: 'ICA' },
  { value: 'otro', label: 'Otro' },
]

const PERIODICIDADES: { value: PeriodicidadImpuesto; label: string }[] = [
  { value: 'anual', label: 'Anual' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'unico', label: 'Pago único' },
]

const CAMPOS: CampoForm[] = [
  { key: 'nombre', label: 'Nombre', required: true, span2: true },
  { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS },
  { key: 'entidad', label: 'Entidad / municipio' },
  { key: 'valor', label: 'Valor (COP)', tipo: 'number', required: true },
  { key: 'periodicidad', label: 'Periodicidad', tipo: 'select', opciones: PERIODICIDADES },
  { key: 'fechaVencimiento', label: 'Fecha de vencimiento', tipo: 'date' },
  { key: 'pagado', label: 'Pagado', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
  { key: 'notas', label: 'Notas', span2: true },
]

const VACIO: Record<string, string> = { tipo: 'predial', periodicidad: 'anual', pagado: 'no' }

const etiquetaTipo = (t: TipoImpuesto) => TIPOS.find((x) => x.value === t)?.label ?? t

export default function ImpuestosPage() {
  return (
    <CrudPage<Impuesto>
      titulo="Impuesto"
      descripcion="Predial, vehicular, renta, ICA y otros. Con vencimiento se agregan al calendario y a los recordatorios."
      campos={CAMPOS}
      vacio={VACIO}
      listar={listarImpuestos}
      crear={(d) => crearImpuesto(d)}
      actualizar={(id, d) => actualizarImpuesto(id, d)}
      eliminar={(id) => eliminarImpuesto(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {
          nombre: vals.nombre.trim(),
          tipo: vals.tipo || 'otro',
          valor: num(vals.valor),
          periodicidad: vals.periodicidad || 'anual',
          pagado: vals.pagado === 'si',
        }
        if (vals.entidad?.trim()) doc.entidad = vals.entidad.trim()
        if (vals.fechaVencimiento) doc.fechaVencimiento = vals.fechaVencimiento
        if (vals.notas?.trim()) doc.notas = vals.notas.trim()
        return doc
      }}
      aForm={(i) => ({
        nombre: i.nombre,
        tipo: i.tipo,
        entidad: i.entidad ?? '',
        valor: String(i.valor ?? ''),
        periodicidad: i.periodicidad,
        fechaVencimiento: i.fechaVencimiento ?? '',
        pagado: i.pagado ? 'si' : 'no',
        notas: i.notas ?? '',
      })}
      renderItem={(i) => (
        <div>
          <div className="font-medium">
            {i.nombre} <span className="text-muted-foreground">({etiquetaTipo(i.tipo)})</span>
            {i.pagado ? ' — pagado' : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            ${(i.valor || 0).toLocaleString('es-CO')} / {i.periodicidad}
            {i.fechaVencimiento ? ` · Vence ${i.fechaVencimiento}` : ''}
            {i.entidad ? ` · ${i.entidad}` : ''}
          </div>
        </div>
      )}
    />
  )
}
