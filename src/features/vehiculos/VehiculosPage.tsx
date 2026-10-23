import { useCallback, useEffect, useState } from 'react'
import CrudPage, { type CampoForm } from '@/components/CrudPage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ESTADOS_VEHICULO,
  actualizarVehiculo,
  crearVehiculo,
  eliminarVehiculo,
  listarVehiculos,
  obtenerVehiculo,
  type Vehiculo,
} from '@/lib/firebase/vehiculosRepo'
import VehiculoDetalle from './VehiculoDetalle'
import { formatoKm } from './vehiculoUtils'
import { Car } from 'lucide-react'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) && String(s).trim() !== '' ? n : undefined
}

const CAMPOS: CampoForm[] = [
  { key: 'placa', label: 'Placa' },
  { key: 'marca', label: 'Marca', required: true },
  { key: 'linea', label: 'Línea', required: true },
  { key: 'modelo', label: 'Modelo (año)', tipo: 'number', required: true },
  { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: ['carro', 'moto', 'camion', 'otro'].map((t) => ({ value: t, label: t })) },
  { key: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS_VEHICULO.map((t) => ({ value: t, label: t })) },
  { key: 'cilindraje', label: 'Cilindraje (cc)', tipo: 'number' },
  { key: 'color', label: 'Color' },
  { key: 'valorComercial', label: 'Valor comercial (COP)', tipo: 'number' },
  { key: 'fotoUrl', label: 'Foto (URL)', span2: true },
  { key: 'kilometraje', label: 'Kilometraje actual (km)', tipo: 'number' },
  { key: 'soatFecha', label: 'SOAT vence', tipo: 'date' },
  { key: 'soatPrima', label: 'SOAT prima anual (COP)', tipo: 'number' },
  { key: 'soatNumero', label: 'SOAT Nº póliza' },
  { key: 'soatAseguradora', label: 'SOAT aseguradora' },
  { key: 'tmFecha', label: 'Tecnicomecánica vence', tipo: 'date' },
  { key: 'tmCosto', label: 'Tecnicomecánica costo (COP)', tipo: 'number' },
  { key: 'tmCda', label: 'CDA' },
  { key: 'tmCertificado', label: 'Nº certificado TM' },
  { key: 'strFecha', label: 'Seguro todo riesgo vence', tipo: 'date' },
  { key: 'strPrima', label: 'Seguro todo riesgo prima anual (COP)', tipo: 'number' },
  { key: 'licenciaNumero', label: 'Licencia de tránsito Nº' },
  { key: 'organismoTransito', label: 'Organismo de tránsito' },
  { key: 'numMotor', label: 'Nº motor' },
  { key: 'numChasis', label: 'Nº chasis' },
  { key: 'manualUrl', label: 'Manual (URL PDF)', span2: true },
  { key: 'fichaUrl', label: 'Ficha técnica (URL PDF)', span2: true },
]

const VACIO: Record<string, string> = { tipo: 'carro', estado: 'Disponible' }

export default function VehiculosPage() {
  const [detalleId, setDetalleId] = useState('')
  const [opciones, setOpciones] = useState<Vehiculo[]>([])
  const [detalle, setDetalle] = useState<Vehiculo | null>(null)
  const [recarga, setRecarga] = useState(0)

  const cargarOpciones = useCallback(() => {
    listarVehiculos()
      .then(setOpciones)
      .catch(() => {})
  }, [])

  useEffect(() => {
    cargarOpciones()
  }, [cargarOpciones, recarga])

  const detalleEfectivo = detalleId || opciones[0]?.id || ''

  useEffect(() => {
    if (!detalleEfectivo) {
      setDetalle(null)
      return
    }
    obtenerVehiculo(detalleEfectivo)
      .then(setDetalle)
      .catch(() => setDetalle(null))
  }, [detalleEfectivo, recarga])

  const recargarTodo = () => setRecarga((n) => n + 1)

  return (
    <div className="space-y-4">
      <CrudPage<Vehiculo>
        titulo="Vehículo"
        descripcion="Registra tus vehículos con SOAT, tecnicomecánica y seguro. El calendario usará los vencimientos. Abajo tienes el detalle completo: documentos, tarjeta y mantenimiento."
        campos={CAMPOS}
        vacio={VACIO}
        listar={listarVehiculos}
        crear={(d) => crearVehiculo(d).then((id) => {
          recargarTodo()
          return id
        })}
        actualizar={async (id, d) => {
          const actual = await obtenerVehiculo(id)
          const tareas = actual?.mantenimiento?.tareas ?? []
          const kmNuevo = (d.mantenimiento as { kilometrajeActual?: number } | undefined)?.kilometrajeActual
          await actualizarVehiculo(id, {
            ...d,
            mantenimiento: { kilometrajeActual: kmNuevo ?? actual?.mantenimiento?.kilometrajeActual, tareas },
          })
          recargarTodo()
        }}
        eliminar={async (id) => {
          await eliminarVehiculo(id)
          recargarTodo()
        }}
        transformar={(vals) => {
          const doc: Record<string, unknown> = {
            placa: vals.placa?.trim() || undefined,
            marca: vals.marca.trim(),
            linea: vals.linea.trim(),
            modelo: num(vals.modelo),
            tipo: vals.tipo || 'carro',
            estado: vals.estado || 'Disponible',
          }
          for (const k of ['cilindraje', 'valorComercial']) {
            const v = num(vals[k] as string)
            if (v !== undefined) doc[k] = v
          }
          for (const k of ['color', 'fotoUrl', 'numMotor', 'numChasis'] as const) {
            const v = (vals[k] as string)?.trim()
            if (v) doc[k] = v
          }
          const km = num(vals.kilometraje as string)
          if (km !== undefined) doc.mantenimiento = { kilometrajeActual: km, tareas: [] }
          const soat = {
            fechaVencimiento: vals.soatFecha || undefined,
            valorPrimaAnual: num(vals.soatPrima as string),
            numeroPoliza: (vals.soatNumero as string)?.trim() || undefined,
            aseguradora: (vals.soatAseguradora as string)?.trim() || undefined,
            fuente: 'manual',
            vigente: !!vals.soatFecha,
          }
          const tm = {
            fechaVencimiento: vals.tmFecha || undefined,
            costoRevision: num(vals.tmCosto as string),
            cda: (vals.tmCda as string)?.trim() || undefined,
            numeroCertificado: (vals.tmCertificado as string)?.trim() || undefined,
            fuente: 'manual',
            vigente: !!vals.tmFecha,
          }
          const strPrima = num(vals.strPrima as string)
          const str = {
            tiene: !!vals.strFecha || strPrima !== undefined,
            fechaVencimiento: vals.strFecha || undefined,
            valorPrimaAnual: strPrima,
            periodicidad: 'anual',
            fuente: 'manual',
            vigente: !!vals.strFecha,
          }
          if (vals.soatFecha || soat.valorPrimaAnual !== undefined || soat.numeroPoliza) doc.soat = soat
          if (vals.tmFecha || tm.costoRevision !== undefined || tm.numeroCertificado) doc.tecnicomecanica = tm
          if (str.tiene) doc.seguroTodoRiesgo = str
          const lic = (vals.licenciaNumero as string)?.trim()
          const org = (vals.organismoTransito as string)?.trim()
          if (lic || org) doc.licenciaTransito = { numeroLicencia: lic || undefined, organismoTransito: org || undefined }
          const manualUrl = (vals.manualUrl as string)?.trim()
          const fichaUrl = (vals.fichaUrl as string)?.trim()
          if (manualUrl || fichaUrl) doc.documentos = { manualUrl: manualUrl || undefined, fichaUrl: fichaUrl || undefined }
          return doc
        }}
        aForm={(v) => ({
          placa: v.placa ?? '',
          marca: v.marca,
          linea: v.linea,
          modelo: String(v.modelo ?? ''),
          tipo: v.tipo,
          estado: v.estado ?? 'Disponible',
          cilindraje: v.cilindraje != null ? String(v.cilindraje) : '',
          color: v.color ?? '',
          valorComercial: v.valorComercial != null ? String(v.valorComercial) : '',
          fotoUrl: v.fotoUrl ?? '',
          kilometraje: v.mantenimiento?.kilometrajeActual != null ? String(v.mantenimiento.kilometrajeActual) : '',
          soatFecha: v.soat?.fechaVencimiento ?? '',
          soatPrima: v.soat?.valorPrimaAnual != null ? String(v.soat.valorPrimaAnual) : '',
          soatNumero: v.soat?.numeroPoliza ?? '',
          soatAseguradora: v.soat?.aseguradora ?? '',
          tmFecha: v.tecnicomecanica?.fechaVencimiento ?? '',
          tmCosto: v.tecnicomecanica?.costoRevision != null ? String(v.tecnicomecanica.costoRevision) : '',
          tmCda: v.tecnicomecanica?.cda ?? '',
          tmCertificado: v.tecnicomecanica?.numeroCertificado ?? '',
          strFecha: v.seguroTodoRiesgo?.fechaVencimiento ?? '',
          strPrima: v.seguroTodoRiesgo?.valorPrimaAnual != null ? String(v.seguroTodoRiesgo.valorPrimaAnual) : '',
          licenciaNumero: v.licenciaTransito?.numeroLicencia ?? '',
          organismoTransito: v.licenciaTransito?.organismoTransito ?? '',
          numMotor: v.numMotor ?? '',
          numChasis: v.numChasis ?? '',
          manualUrl: v.documentos?.manualUrl ?? '',
          fichaUrl: v.documentos?.fichaUrl ?? '',
        })}
        renderItem={(v) => (
          <div>
            <div className="font-medium">
              {v.marca} {v.linea} <span className="text-muted-foreground">({v.modelo})</span>
              {v.placa ? ` · ${v.placa}` : ''}
            </div>
            <div className="text-xs text-muted-foreground">
              {v.estado ?? v.tipo}
              {v.mantenimiento?.kilometrajeActual != null
                ? ` · ${formatoKm(v.mantenimiento.kilometrajeActual)}`
                : ''}
              {v.soat?.fechaVencimiento ? ` · SOAT: ${v.soat.fechaVencimiento}` : ''}
              {v.tecnicomecanica?.fechaVencimiento ? ` · TM: ${v.tecnicomecanica.fechaVencimiento}` : ''}
            </div>
          </div>
        )}
      />

      <Card className="glass-card overflow-hidden border-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white sm:text-base">
            <Car className="h-4 w-4 text-emerald-300" />
            <span>Billetera vehicular · detalle completo</span>
          </CardTitle>
          {opciones.length > 0 && (
            <select
              value={detalleEfectivo}
              onChange={(e) => setDetalleId(e.target.value)}
              className="field-dark h-9 max-w-55 rounded-xl px-2.5 text-xs font-medium outline-none"
            >
              {opciones.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.linea}{v.placa ? ` · ${v.placa}` : ''}
                </option>
              ))}
            </select>
          )}
        </CardHeader>
        <CardContent className="p-4 text-xs sm:p-6">
          {detalle ? (
            <VehiculoDetalle vehiculo={detalle} onCambio={recargarTodo} />
          ) : (
            <p className="p-4 text-center text-mist-500">
              Registra tu primer vehículo arriba para ver aquí su billetera completa: documentos, tarjeta y mantenimiento.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
