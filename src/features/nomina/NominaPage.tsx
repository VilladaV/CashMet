import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  TIPOS_CONTRATO,
  actualizarNomina,
  crearNomina,
  eliminarNomina,
  listarNomina,
  type Nomina,
} from '@/lib/firebase/nominaRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const CAMPOS: CampoForm[] = [
  { key: 'nombreCompleto', label: 'Nombre completo', required: true },
  { key: 'cargo', label: 'Cargo', required: true },
  { key: 'salarioBaseMensual', label: 'Salario base mensual (COP)', tipo: 'number', required: true },
  { key: 'tipoContrato', label: 'Tipo de contrato', tipo: 'select', opciones: TIPOS_CONTRATO.map((t) => ({ value: t, label: t })) },
  { key: 'activo', label: 'Activo', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
  { key: 'primaAplica', label: 'Prima de servicios', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
  { key: 'primaJulio', label: 'Mitad julio (30 jun)', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
  { key: 'primaDiciembre', label: 'Mitad diciembre (20 dic)', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
  { key: 'diaPago', label: 'Día de pago (1-31)', tipo: 'number' },
  { key: 'notas', label: 'Notas', span2: true },
]

const VACIO: Record<string, string> = {
  tipoContrato: 'indefinido',
  activo: 'si',
  primaAplica: 'si',
  primaJulio: 'si',
  primaDiciembre: 'si',
}

const si = (v: string | undefined) => v === 'si'

export default function NominaPage() {
  return (
    <CrudPage<Nomina>
      titulo="Nómina"
      descripcion="Personas (o tú mismo) que reciben sueldo. Con primas de servicios de Colombia (julio/diciembre)."
      campos={CAMPOS}
      vacio={VACIO}
      listar={listarNomina}
      crear={(d) => crearNomina(d)}
      actualizar={(id, d) => actualizarNomina(id, d)}
      eliminar={(id) => eliminarNomina(id)}
      transformar={(vals) => {
        const primaAplica = si(vals.primaAplica)
        const doc: Record<string, unknown> = {
          nombreCompleto: vals.nombreCompleto.trim(),
          cargo: vals.cargo.trim(),
          salarioBaseMensual: num(vals.salarioBaseMensual),
          tipoContrato: vals.tipoContrato || 'indefinido',
          activo: si(vals.activo),
          primaServicios: {
            aplica: primaAplica,
            mitadJulio: primaAplica && si(vals.primaJulio),
            mitadDiciembre: primaAplica && si(vals.primaDiciembre),
          },
        }
        const dia = num(vals.diaPago as string)
        if (dia !== undefined) doc.fechaPago = { dia, tipo: 'mensual' }
        if (vals.notas?.trim()) doc.notas = vals.notas.trim()
        return doc
      }}
      aForm={(n) => ({
        nombreCompleto: n.nombreCompleto,
        cargo: n.cargo,
        salarioBaseMensual: String(n.salarioBaseMensual ?? ''),
        tipoContrato: n.tipoContrato,
        activo: n.activo === false ? 'no' : 'si',
        primaAplica: n.primaServicios?.aplica === false ? 'no' : 'si',
        primaJulio: n.primaServicios?.mitadJulio === false ? 'no' : 'si',
        primaDiciembre: n.primaServicios?.mitadDiciembre === false ? 'no' : 'si',
        diaPago: n.fechaPago?.dia != null ? String(n.fechaPago.dia) : '',
        notas: n.notas ?? '',
      })}
      renderItem={(n) => (
        <div>
          <div className="font-medium">
            {n.nombreCompleto} <span className="text-muted-foreground">({n.cargo})</span>
            {n.activo === false ? ' — inactivo' : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            Salario: ${(n.salarioBaseMensual || 0).toLocaleString('es-CO')}
            {n.fechaPago?.dia ? ` · Pago día ${n.fechaPago.dia}` : ''}
            {n.primaServicios?.mitadJulio || n.primaServicios?.mitadDiciembre ? ' · Prima julio/dic' : ''}
          </div>
        </div>
      )}
    />
  )
}