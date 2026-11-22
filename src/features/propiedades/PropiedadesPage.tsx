import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  TIPOS_PROPIEDAD,
  actualizarPropiedad,
  crearPropiedad,
  eliminarPropiedad,
  listarPropiedades,
  type Propiedad,
} from '@/lib/firebase/propiedadesRepo'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import { fechaFutura } from '@/lib/fechas'
import { desformatearCifra } from '@/lib/utils'

const num = (s: string) => {
  const limpio = String(s ?? '').trim()
  if (!limpio) return undefined
  const n = desformatearCifra(limpio)
  return Number.isFinite(n) ? n : undefined
}

const NUMERICOS = new Set(['valorComercialEstimado', 'valorPatrimonial'])
const CAMPOS_PREDIAL = new Set(['predialValor', 'predialFecha', 'municipio'])

const CAMPOS: CampoForm[] = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t })) },
  { key: 'direccion', label: 'Dirección', span2: true },
  { key: 'valorComercialEstimado', label: 'Valor comercial estimado (COP)', tipo: 'cifra' },
  { key: 'valorPatrimonial', label: 'Valor patrimonial (COP)', tipo: 'cifra' },
  { key: 'predialValor', label: 'Predial valor anual (COP)', tipo: 'cifra' },
  { key: 'predialFecha', label: 'Predial vence', tipo: 'date' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'notas', label: 'Notas', span2: true },
]

const VACIO: Record<string, string> = { tipo: 'vivienda' }

export default function PropiedadesPage() {
  return (
    <CrudPage<Propiedad>
      titulo="Propiedad"
      tituloPlural="Propiedades"
      descripcion="Registra propiedades (casa, apartamento, lote) con su valor y predial."
      campos={CAMPOS}
      vacio={VACIO}
      onMutate={() => invalidarSnapshotFinanciero()}
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
          if (c.key === 'nombre' || c.key === 'tipo' || CAMPOS_PREDIAL.has(c.key)) continue
          const v = String(vals[c.key] ?? '').trim()
          if (!v) {
            doc[c.key] = null
            continue
          }
          if (NUMERICOS.has(c.key)) {
            const valNum = num(v)
            if (valNum === undefined || valNum < 0) {
              throw new Error(`${c.label} debe ser un número válido mayor o igual a 0.`)
            }
            doc[c.key] = Math.round(valNum)
          } else {
            doc[c.key] = v
          }
        }

        const predialValor = vals.predialValor?.trim() ? num(vals.predialValor) : undefined
        if (vals.predialValor?.trim() && (predialValor === undefined || predialValor < 0)) {
          throw new Error('El valor anual del predial debe ser un número mayor o igual a 0.')
        }
        const predialFecha = vals.predialFecha?.trim() || undefined
        const municipio = vals.municipio?.trim() || undefined

        if (predialValor !== undefined || predialFecha || municipio) {
          doc.impuestos = {
            predial: {
              valorAnual: predialValor !== undefined ? Math.round(predialValor) : null,
              fechaVencimiento: predialFecha ?? null,
              municipio: municipio ?? null,
              vigente: fechaFutura(predialFecha),
              fuente: 'manual',
            },
          }
        } else {
          doc.impuestos = null
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
            {p.impuestos?.predial?.municipio ? ` · ${p.impuestos.predial.municipio}` : ''}
            {p.impuestos?.predial?.fechaVencimiento ? ` · Predial: ${p.impuestos.predial.fechaVencimiento}` : ''}
          </div>
        </div>
      )}
    />
  )
}
