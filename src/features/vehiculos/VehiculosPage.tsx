import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  TIPOS_VEHICULO,
  actualizarVehiculo,
  crearVehiculo,
  eliminarVehiculo,
  listarVehiculos,
  type Vehiculo,
} from '@/lib/firebase/vehiculosRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const CAMPOS: CampoForm[] = [
  { key: 'placa', label: 'Placa' },
  { key: 'marca', label: 'Marca', required: true },
  { key: 'linea', label: 'Línea', required: true },
  { key: 'modelo', label: 'Modelo (año)', tipo: 'number', required: true },
  { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS_VEHICULO.map((t) => ({ value: t, label: t })) },
  { key: 'cilindraje', label: 'Cilindraje (cc)', tipo: 'number' },
  { key: 'valorComercial', label: 'Valor comercial (COP)', tipo: 'number' },
  { key: 'soatFecha', label: 'SOAT vence', tipo: 'date' },
  { key: 'soatPrima', label: 'SOAT prima anual (COP)', tipo: 'number' },
  { key: 'tmFecha', label: 'Tecnicomecánica vence', tipo: 'date' },
  { key: 'tmCosto', label: 'Tecnicomecánica costo (COP)', tipo: 'number' },
  { key: 'strFecha', label: 'Seguro todo riesgo vence', tipo: 'date' },
  { key: 'strPrima', label: 'Seguro todo riesgo prima anual (COP)', tipo: 'number' },
]

const VACIO: Record<string, string> = { tipo: 'carro' }

export default function VehiculosPage() {
  return (
    <CrudPage<Vehiculo>
      titulo="Vehículo"
      descripcion="Registra tus vehículos con SOAT, tecnicomecánica y seguro. El calendario usará los vencimientos."
      campos={CAMPOS}
      vacio={VACIO}
      listar={listarVehiculos}
      crear={(d) => crearVehiculo(d)}
      actualizar={(id, d) => actualizarVehiculo(id, d)}
      eliminar={(id) => eliminarVehiculo(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {
          placa: vals.placa?.trim() || undefined,
          marca: vals.marca.trim(),
          linea: vals.linea.trim(),
          modelo: num(vals.modelo),
          tipo: vals.tipo || 'carro',
        }
        for (const k of ['cilindraje', 'valorComercial']) {
          const v = num(vals[k] as string)
          if (v !== undefined) doc[k] = v
        }
        const soat = { fechaVencimiento: vals.soatFecha || undefined, valorPrimaAnual: num(vals.soatPrima as string), fuente: 'manual', vigente: !!vals.soatFecha }
        const tm = { fechaVencimiento: vals.tmFecha || undefined, costoRevision: num(vals.tmCosto as string), fuente: 'manual', vigente: !!vals.tmFecha }
        const strPrima = num(vals.strPrima as string)
        const str = { tiene: !!vals.strFecha || strPrima !== undefined, fechaVencimiento: vals.strFecha || undefined, valorPrimaAnual: strPrima, periodicidad: 'anual', fuente: 'manual', vigente: !!vals.strFecha }
        if (vals.soatFecha || soat.valorPrimaAnual !== undefined) doc.soat = soat
        if (vals.tmFecha || tm.costoRevision !== undefined) doc.tecnicomecanica = tm
        if (str.tiene) doc.seguroTodoRiesgo = str
        return doc
      }}
      aForm={(v) => ({
        placa: v.placa ?? '',
        marca: v.marca,
        linea: v.linea,
        modelo: String(v.modelo ?? ''),
        tipo: v.tipo,
        cilindraje: v.cilindraje != null ? String(v.cilindraje) : '',
        valorComercial: v.valorComercial != null ? String(v.valorComercial) : '',
        soatFecha: v.soat?.fechaVencimiento ?? '',
        soatPrima: v.soat?.valorPrimaAnual != null ? String(v.soat.valorPrimaAnual) : '',
        tmFecha: v.tecnicomecanica?.fechaVencimiento ?? '',
        tmCosto: v.tecnicomecanica?.costoRevision != null ? String(v.tecnicomecanica.costoRevision) : '',
        strFecha: v.seguroTodoRiesgo?.fechaVencimiento ?? '',
        strPrima: v.seguroTodoRiesgo?.valorPrimaAnual != null ? String(v.seguroTodoRiesgo.valorPrimaAnual) : '',
      })}
      renderItem={(v) => (
        <div>
          <div className="font-medium">
            {v.marca} {v.linea} <span className="text-muted-foreground">({v.modelo})</span>
            {v.placa ? ` · ${v.placa}` : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            {v.tipo}
            {v.cilindraje ? ` · ${v.cilindraje} cc` : ''}
            {v.soat?.fechaVencimiento ? ` · SOAT: ${v.soat.fechaVencimiento}` : ''}
            {v.tecnicomecanica?.fechaVencimiento ? ` · TM: ${v.tecnicomecanica.fechaVencimiento}` : ''}
          </div>
        </div>
      )}
    />
  )
}