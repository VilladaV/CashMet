import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  TIPOS_PROPIEDAD,
  actualizarPropiedad,
  crearPropiedad,
  eliminarPropiedad,
  listarPropiedades,
  type Propiedad,
} from '@/lib/firebase/propiedadesRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const NUMERICOS = new Set(['valorComercialEstimado', 'valorPatrimonial', 'predialValor'])

const CAMPOS: CampoForm[] = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t })) },
  { key: 'direccion', label: 'Dirección', span2: true },
  { key: 'valorComercialEstimado', label: 'Valor comercial estimado (COP)', tipo: 'number' },
  { key: 'valorPatrimonial', label: 'Valor patrimonial (COP)', tipo: 'number' },
  { key: 'predialValor', label: 'Predial valor anual (COP)', tipo: 'number' },
  { key: 'predialFecha', label: 'Predial vence', tipo: 'date' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'notas', label: 'Notas', span2: true },
]

const VACIO: Record<string, string> = { tipo: 'vivienda' }

export default function PropiedadesPage() {
  return (
    <CrudPage<Propiedad>
      titulo="Propiedad"
      descripcion="Registra propiedades (casa, apartamento, lote) con su valor y predial."
      campos={CAMPOS}
      vacio={VACIO}
      listar={listarPropiedades}
      crear={(d) => crearPropiedad(d)}
      actualizar={(id, d) => actualizarPropiedad(id, d)}
      eliminar={(id) => eliminarPropiedad(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {
          nombre: vals.nombre.trim(),
          tipo: vals.tipo || 'vivienda',
        }
        for (const c of CAMPOS) {
          if (c.key === 'nombre' || c.key === 'tipo') continue
          const v = vals[c.key]
          if (!v) continue
          if (NUMERICOS.has(c.key)) doc[c.key] = num(v)
          else if (c.key.startsWith('predial')) doc[c.key] = String(v).trim()
          else doc[c.key] = String(v).trim()
        }
        const predialValor = vals.predialValor
          ? num(vals.predialValor)
          : undefined
        if (predialValor !== undefined || vals.predialFecha) {
          doc.impuestos = {
            predial: {
              valorAnual: predialValor,
              fechaVencimiento: vals.predialFecha || undefined,
              municipio: vals.municipio?.trim() || undefined,
              vigente: !!vals.predialFecha,
              fuente: 'manual',
            },
          }
          delete doc.predialValor
          delete doc.predialFecha
          delete doc.municipio
        }
        return doc
      }}
      aForm={(p) => ({
        nombre: p.nombre,
        tipo: p.tipo,
        direccion: p.direccion ?? '',
        valorComercialEstimado: p.valorComercialEstimado != null ? String(p.valorComercialEstimado) : '',
        valorPatrimonial: p.valorPatrimonial != null ? String(p.valorPatrimonial) : '',
        predialValor: p.impuestos?.predial?.valorAnual != null ? String(p.impuestos.predial.valorAnual) : '',
        predialFecha: p.impuestos?.predial?.fechaVencimiento ?? '',
        municipio: p.impuestos?.predial?.municipio ?? '',
        notas: p.notas ?? '',
      })}
      renderItem={(p) => (
        <div>
          <div className="font-medium">
            {p.nombre} <span className="text-muted-foreground">({p.tipo})</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {p.valorComercialEstimado
              ? `Comercial: $${p.valorComercialEstimado.toLocaleString('es-CO')}`
              : p.valorPatrimonial
                ? `Patrimonial: $${p.valorPatrimonial.toLocaleString('es-CO')}`
                : ''}
            {p.impuestos?.predial?.fechaVencimiento ? ` · Predial: ${p.impuestos.predial.fechaVencimiento}` : ''}
          </div>
        </div>
      )}
    />
  )
}