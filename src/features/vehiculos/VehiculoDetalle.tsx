import { useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  actualizarVehiculo,
  eliminarTareaMantenimiento,
  guardarTareaMantenimiento,
  nuevaTareaId,
  registrarServicioMantenimiento,
  actualizarKilometraje,
  ESTADOS_VEHICULO,
  type EstadoVehiculo,
  type TareaMantenimiento,
  type Vehiculo,
} from '@/lib/firebase/vehiculosRepo'
import { crearMovimiento } from '@/lib/firebase/movimientosRepo'
import { subirDocumentoVehiculo, subirFotoVehiculo } from '@/lib/firebase/storage'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import {
  claseVigencia,
  etiquetaVigencia,
  formatoFecha,
  formatoKm,
  progresoTarea,
  vigenciaDe,
} from './vehiculoUtils'
import {
  Car,
  FileText,
  IdCard,
  Wrench,
  Camera,
  ExternalLink,
  Plus,
  Trash2,
  Check,
  Gauge,
} from 'lucide-react'

type Tab = 'resumen' | 'documentos' | 'tarjeta' | 'mantenimiento'

const TABS: Array<{ id: Tab; label: string; icon: typeof Car }> = [
  { id: 'resumen', label: 'Resumen', icon: Car },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'tarjeta', label: 'Tarjeta', icon: IdCard },
  { id: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
]

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

function campoVacio(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}

export default function VehiculoDetalle({
  vehiculo,
  onCambio,
}: {
  vehiculo: Vehiculo
  onCambio: () => void
}) {
  const [tab, setTab] = useState<Tab>('resumen')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [docTab, setDocTab] = useState<string | null>(null)

  const guardar = async (parcial: Partial<Vehiculo>, ok = 'Cambios guardados.') => {
    setBusy(true)
    setMsg('')
    try {
      await actualizarVehiculo(vehiculo.id, parcial)
      invalidarSnapshotFinanciero()
      setMsg(ok)
      onCambio()
    } finally {
      setBusy(false)
    }
  }

  const soatV = vigenciaDe(vehiculo.soat?.fechaVencimiento)
  const tmV = vigenciaDe(vehiculo.tecnicomecanica?.fechaVencimiento)
  const strV = vigenciaDe(vehiculo.seguroTodoRiesgo?.fechaVencimiento)
  const tareas = vehiculo.mantenimiento?.tareas ?? []
  const km = vehiculo.mantenimiento?.kilometrajeActual

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      <Card className="glass-card overflow-hidden border-0">
        <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-emerald-400" />
        <CardHeader className="border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
          <CardTitle className="flex flex-wrap items-center gap-3 text-sm font-extrabold text-white sm:text-base">
            {vehiculo.fotoUrl ? (
              <img
                src={vehiculo.fotoUrl}
                alt={`${vehiculo.marca} ${vehiculo.linea}`}
                className="h-11 w-16 rounded-xl border border-white/10 object-cover"
              />
            ) : (
              <span className="flex h-11 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Car className="h-5 w-5 text-mist-500" />
              </span>
            )}
            <span>
              {vehiculo.marca} {vehiculo.linea}{' '}
              <span className="text-mist-500">({vehiculo.modelo})</span>
              {vehiculo.placa ? ` · ${vehiculo.placa}` : ''}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-bold text-mist-300">
              {vehiculo.estado ?? 'Disponible'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const Icon = t.icon
              const activo = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    activo
                      ? 'bg-emerald-400/15 text-emerald-200'
                      : 'bg-white/[0.04] text-mist-500 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
          {msg && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 text-xs font-bold text-emerald-200">
              <Check className="h-4 w-4 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {tab === 'resumen' && (
        <ResumenTab
          vehiculo={vehiculo}
          busy={busy}
          soatV={soatV}
          tmV={tmV}
          strV={strV}
          onGuardar={guardar}
        />
      )}
      {tab === 'documentos' && (
        <DocumentosTab
          vehiculo={vehiculo}
          busy={busy}
          docAbierto={docTab}
          onAbrir={setDocTab}
          onGuardar={guardar}
        />
      )}
      {tab === 'tarjeta' && <TarjetaTab vehiculo={vehiculo} busy={busy} onGuardar={guardar} />}
      {tab === 'mantenimiento' && (
        <MantenimientoTab
          vehiculo={vehiculo}
          tareas={tareas}
          km={km}
          onCambio={onCambio}
        />
      )}
    </motion.div>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="text-[11px] font-bold text-mist-500">{label}</span>
      <span className="text-right text-xs font-semibold text-mist-100">{valor}</span>
    </div>
  )
}

function ResumenTab({
  vehiculo,
  busy,
  soatV,
  tmV,
  strV,
  onGuardar,
}: {
  vehiculo: Vehiculo
  busy: boolean
  soatV: ReturnType<typeof vigenciaDe>
  tmV: ReturnType<typeof vigenciaDe>
  strV: ReturnType<typeof vigenciaDe>
  onGuardar: (p: Partial<Vehiculo>, ok?: string) => Promise<void>
}) {
  const [estado, setEstado] = useState<string>(vehiculo.estado ?? 'Disponible')
  const [foto, setFoto] = useState<File | null>(null)

  const guardarFoto = async () => {
    if (!foto) return
    const url = await subirFotoVehiculo(vehiculo.id, foto)
    setFoto(null)
    await onGuardar({ fotoUrl: url }, 'Foto actualizada.')
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <CardContent className="space-y-3 p-4 text-xs sm:p-6">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fila label="Tipo" valor={`${vehiculo.tipo}${vehiculo.cilindraje ? ` · ${vehiculo.cilindraje} cc` : ''}`} />
          <Fila label="Color" valor={vehiculo.color || 'N/A'} />
          <Fila
            label="Valor comercial"
            valor={vehiculo.valorComercial ? COD(vehiculo.valorComercial) : 'N/A'}
          />
          <Fila
            label="Costo mensual estimado"
            valor={
              vehiculo.gastosMensualesCalculados
                ? `${COD(vehiculo.gastosMensualesCalculados)} / mes`
                : 'N/A'
            }
          />
          <Fila label="Kilometraje" valor={formatoKm(vehiculo.mantenimiento?.kilometrajeActual)} />
          <Fila
            label="Tareas de mantenimiento"
            valor={`${vehiculo.mantenimiento?.tareas?.length ?? 0} registradas`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${claseVigencia(soatV)}`}>
            SOAT: {etiquetaVigencia(soatV)}
            {vehiculo.soat?.fechaVencimiento ? ` · ${formatoFecha(vehiculo.soat.fechaVencimiento)}` : ''}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${claseVigencia(tmV)}`}>
            Tecnicomecánica: {etiquetaVigencia(tmV)}
            {vehiculo.tecnicomecanica?.fechaVencimiento
              ? ` · ${formatoFecha(vehiculo.tecnicomecanica.fechaVencimiento)}`
              : ''}
          </span>
          {vehiculo.seguroTodoRiesgo?.tiene && (
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${claseVigencia(strV)}`}>
              Todo riesgo: {etiquetaVigencia(strV)}
              {vehiculo.seguroTodoRiesgo?.fechaVencimiento
                ? ` · ${formatoFecha(vehiculo.seguroTodoRiesgo.fechaVencimiento)}`
                : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Estado del vehículo</span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
            >
              {ESTADOS_VEHICULO.map((e: EstadoVehiculo) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Foto del vehículo</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="text-[11px] text-mist-500 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-400/15 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-emerald-300"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || estado === (vehiculo.estado ?? 'Disponible')}
            onClick={() => onGuardar({ estado: estado as EstadoVehiculo }, 'Estado actualizado.')}
            className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
          >
            Guardar estado
          </Button>
          {foto && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void guardarFoto()}
              className="h-9 cursor-pointer gap-1.5 border border-white/10 bg-transparent text-xs text-mist-200 hover:bg-white/5"
            >
              <Camera className="h-3.5 w-3.5" />
              Subir foto
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CampoEditable({
  label,
  valor,
  onChange,
  tipo = 'text',
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  tipo?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-bold text-mist-300">{label}</span>
      <Input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="field-dark h-10 text-xs shadow-none"
      />
    </label>
  )
}

function DocumentosTab({
  vehiculo,
  busy,
  docAbierto,
  onAbrir,
  onGuardar,
}: {
  vehiculo: Vehiculo
  busy: boolean
  docAbierto: string | null
  onAbrir: (v: string | null) => void
  onGuardar: (p: Partial<Vehiculo>, ok?: string) => Promise<void>
}) {
  const [soat, setSoat] = useState({
    aseguradora: vehiculo.soat?.aseguradora ?? '',
    numeroPoliza: vehiculo.soat?.numeroPoliza ?? '',
    fechaInicioVigencia: (vehiculo.soat as { fechaInicioVigencia?: string })?.fechaInicioVigencia ?? '',
    fechaVencimiento: vehiculo.soat?.fechaVencimiento ?? '',
    valorPrimaAnual: campoVacio(vehiculo.soat?.valorPrimaAnual),
  })
  const [tm, setTm] = useState({
    centroRevision: vehiculo.tecnicomecanica?.centroRevision ?? '',
    numeroCertificado:
      (vehiculo.tecnicomecanica as { numeroCertificado?: string })?.numeroCertificado ?? '',
    cda: (vehiculo.tecnicomecanica as { cda?: string })?.cda ?? '',
    fechaExpedicion:
      (vehiculo.tecnicomecanica as { fechaExpedicion?: string })?.fechaExpedicion ?? '',
    fechaVencimiento: vehiculo.tecnicomecanica?.fechaVencimiento ?? '',
    costoRevision: campoVacio(vehiculo.tecnicomecanica?.costoRevision),
  })
  const [docs, setDocs] = useState({
    manualNombre: vehiculo.documentos?.manualNombre ?? 'Manual del vehículo',
    manualUrl: vehiculo.documentos?.manualUrl ?? '',
    fichaNombre: vehiculo.documentos?.fichaNombre ?? 'Ficha técnica',
    fichaUrl: vehiculo.documentos?.fichaUrl ?? '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [destinoArchivo, setDestinoArchivo] = useState<'manual' | 'ficha'>('manual')

  const num = (s: string) => {
    const n = Number(String(s).replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) && s.trim() !== '' ? n : undefined
  }

  const guardarTodo = () =>
    onGuardar(
      {
        soat: {
          ...vehiculo.soat,
          aseguradora: soat.aseguradora || undefined,
          numeroPoliza: soat.numeroPoliza || undefined,
          fechaInicioVigencia: soat.fechaInicioVigencia || undefined,
          fechaVencimiento: soat.fechaVencimiento || undefined,
          valorPrimaAnual: num(soat.valorPrimaAnual),
          vigente: !!soat.fechaVencimiento,
          fuente: 'manual',
        },
        tecnicomecanica: {
          ...vehiculo.tecnicomecanica,
          centroRevision: tm.centroRevision || undefined,
          numeroCertificado: tm.numeroCertificado || undefined,
          cda: tm.cda || undefined,
          fechaExpedicion: tm.fechaExpedicion || undefined,
          fechaVencimiento: tm.fechaVencimiento || undefined,
          costoRevision: num(tm.costoRevision),
          vigente: !!tm.fechaVencimiento,
          fuente: 'manual',
        },
        documentos: {
          ...vehiculo.documentos,
          manualNombre: docs.manualNombre || undefined,
          manualUrl: docs.manualUrl || undefined,
          fichaNombre: docs.fichaNombre || undefined,
          fichaUrl: docs.fichaUrl || undefined,
        },
      },
      'Documentos guardados. El calendario usará los vencimientos.'
    )

  const subirArchivo = async () => {
    if (!archivo) return
    const url = await subirDocumentoVehiculo(vehiculo.id, archivo)
    if (destinoArchivo === 'manual') setDocs((d) => ({ ...d, manualUrl: url, manualNombre: archivo.name }))
    else setDocs((d) => ({ ...d, fichaUrl: url, fichaNombre: archivo.name }))
    setArchivo(null)
  }

  const visor = (id: string, titulo: string, url?: string) => {
    if (!url) return null
    const abierto = docAbierto === id
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-mist-100">{titulo}</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => onAbrir(abierto ? null : id)}
              className="cursor-pointer rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-mist-200 hover:bg-white/[0.1]"
            >
              {abierto ? 'Ocultar' : 'Ver aquí'}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-400/25"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir
            </a>
          </div>
        </div>
        {abierto && (
          <iframe
            title={titulo}
            src={url}
            className="mt-2 h-96 w-full rounded-lg border border-white/10 bg-black/30"
          />
        )}
      </div>
    )
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <CardContent className="space-y-4 p-4 text-xs sm:p-6">
        <div>
          <h3 className="mb-2 text-sm font-extrabold text-white">SOAT</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Aseguradora" valor={soat.aseguradora} onChange={(v) => setSoat({ ...soat, aseguradora: v })} />
            <CampoEditable label="Número de póliza" valor={soat.numeroPoliza} onChange={(v) => setSoat({ ...soat, numeroPoliza: v })} />
            <CampoEditable label="Inicio de vigencia" valor={soat.fechaInicioVigencia} tipo="date" onChange={(v) => setSoat({ ...soat, fechaInicioVigencia: v })} />
            <CampoEditable label="Vencimiento" valor={soat.fechaVencimiento} tipo="date" onChange={(v) => setSoat({ ...soat, fechaVencimiento: v })} />
            <CampoEditable label="Prima anual (COP)" valor={soat.valorPrimaAnual} tipo="number" onChange={(v) => setSoat({ ...soat, valorPrimaAnual: v })} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="mb-2 text-sm font-extrabold text-white">Tecnicomecánica</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="CDA / Centro" valor={tm.cda || tm.centroRevision} onChange={(v) => setTm({ ...tm, cda: v, centroRevision: v })} />
            <CampoEditable label="Número de certificado" valor={tm.numeroCertificado} onChange={(v) => setTm({ ...tm, numeroCertificado: v })} />
            <CampoEditable label="Fecha de expedición" valor={tm.fechaExpedicion} tipo="date" onChange={(v) => setTm({ ...tm, fechaExpedicion: v })} />
            <CampoEditable label="Vencimiento" valor={tm.fechaVencimiento} tipo="date" onChange={(v) => setTm({ ...tm, fechaVencimiento: v })} />
            <CampoEditable label="Costo revisión (COP)" valor={tm.costoRevision} tipo="number" onChange={(v) => setTm({ ...tm, costoRevision: v })} />
          </div>
        </div>

        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <h3 className="text-sm font-extrabold text-white">Manual y ficha técnica (PDF)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Nombre del manual" valor={docs.manualNombre} onChange={(v) => setDocs({ ...docs, manualNombre: v })} />
            <CampoEditable label="URL del manual (PDF)" valor={docs.manualUrl} onChange={(v) => setDocs({ ...docs, manualUrl: v })} />
            <CampoEditable label="Nombre de la ficha" valor={docs.fichaNombre} onChange={(v) => setDocs({ ...docs, fichaNombre: v })} />
            <CampoEditable label="URL de la ficha (PDF)" valor={docs.fichaUrl} onChange={(v) => setDocs({ ...docs, fichaUrl: v })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={destinoArchivo}
              onChange={(e) => setDestinoArchivo(e.target.value as 'manual' | 'ficha')}
              className="field-dark h-9 rounded-xl px-2.5 text-xs font-medium outline-none"
            >
              <option value="manual">Subir como manual</option>
              <option value="ficha">Subir como ficha</option>
            </select>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="text-[11px] text-mist-500 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-400/15 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-emerald-300"
            />
            {archivo && (
              <Button
                size="sm"
                onClick={() => void subirArchivo()}
                className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
              >
                Subir PDF
              </Button>
            )}
          </div>
          {visor('manual', docs.manualNombre || 'Manual', docs.manualUrl || undefined)}
          {visor('ficha', docs.fichaNombre || 'Ficha técnica', docs.fichaUrl || undefined)}
        </div>

        <Button
          size="sm"
          disabled={busy}
          onClick={() => void guardarTodo()}
          className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
        >
          {busy ? 'Guardando...' : 'Guardar documentos'}
        </Button>
      </CardContent>
    </Card>
  )
}

function TarjetaTab({
  vehiculo,
  busy,
  onGuardar,
}: {
  vehiculo: Vehiculo
  busy: boolean
  onGuardar: (p: Partial<Vehiculo>, ok?: string) => Promise<void>
}) {
  const [lic, setLic] = useState({
    numeroLicencia: vehiculo.licenciaTransito?.numeroLicencia ?? '',
    fechaExpedicion: vehiculo.licenciaTransito?.fechaExpedicion ?? '',
    organismoTransito: vehiculo.licenciaTransito?.organismoTransito ?? '',
    limitacionesPropiedad: vehiculo.licenciaTransito?.limitacionesPropiedad ?? '',
  })
  const [prop, setProp] = useState({
    nombre: vehiculo.propietarioDetalle?.nombre ?? '',
    documento: vehiculo.propietarioDetalle?.documento ?? '',
    direccion: vehiculo.propietarioDetalle?.direccion ?? '',
    ciudad: vehiculo.propietarioDetalle?.ciudad ?? '',
    telefono: vehiculo.propietarioDetalle?.telefono ?? '',
  })
  const [tec, setTec] = useState({
    color: vehiculo.color ?? '',
    servicio: vehiculo.servicio ?? 'Particular',
    carroceria: vehiculo.carroceria ?? '',
    numPuertas: campoVacio(vehiculo.numPuertas),
    numMotor: vehiculo.numMotor ?? '',
    numSerie: vehiculo.numSerie ?? '',
    numChasis: vehiculo.numChasis ?? '',
    capacidad: vehiculo.capacidad ?? '',
    avaluoComercial: campoVacio(vehiculo.avaluoComercial ?? vehiculo.valorComercial),
  })

  const guardar = () =>
    onGuardar(
      {
        color: tec.color || undefined,
        servicio: tec.servicio || undefined,
        carroceria: tec.carroceria || undefined,
        numPuertas: tec.numPuertas ? Number(tec.numPuertas) : undefined,
        numMotor: tec.numMotor || undefined,
        numSerie: tec.numSerie || undefined,
        numChasis: tec.numChasis || undefined,
        capacidad: tec.capacidad || undefined,
        avaluoComercial: tec.avaluoComercial ? Number(tec.avaluoComercial) : undefined,
        licenciaTransito: {
          numeroLicencia: lic.numeroLicencia || undefined,
          fechaExpedicion: lic.fechaExpedicion || undefined,
          organismoTransito: lic.organismoTransito || undefined,
          limitacionesPropiedad: lic.limitacionesPropiedad || undefined,
        },
        propietarioDetalle: {
          nombre: prop.nombre || undefined,
          documento: prop.documento || undefined,
          direccion: prop.direccion || undefined,
          ciudad: prop.ciudad || undefined,
          telefono: prop.telefono || undefined,
        },
      },
      'Tarjeta de propiedad guardada.'
    )

  return (
    <Card className="glass-card overflow-hidden border-0">
      <CardContent className="space-y-4 p-4 text-xs sm:p-6">
        <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-200/[0.08] to-yellow-500/[0.04] p-4">
          <div className="mb-1 text-[10px] font-black tracking-[0.2em] text-amber-200/80 uppercase">
            Licencia de tránsito · frente
          </div>
          <div className="text-base font-extrabold text-white">
            {vehiculo.marca} {vehiculo.linea} · {vehiculo.modelo}
          </div>
          <div className="mt-1 inline-block rounded-lg border border-white/15 bg-black/40 px-3 py-1 font-mono text-sm font-black tracking-[0.25em] text-amber-100">
            {vehiculo.placa || 'SIN PLACA'}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
            <Fila label="Licencia Nº" valor={lic.numeroLicencia || 'N/A'} />
            <Fila label="Expedición" valor={formatoFecha(lic.fechaExpedicion || undefined)} />
            <Fila label="Organismo" valor={lic.organismoTransito || 'N/A'} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-extrabold text-white">Licencia de tránsito</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Número de licencia" valor={lic.numeroLicencia} onChange={(v) => setLic({ ...lic, numeroLicencia: v })} />
            <CampoEditable label="Fecha de expedición" valor={lic.fechaExpedicion} tipo="date" onChange={(v) => setLic({ ...lic, fechaExpedicion: v })} />
            <CampoEditable label="Organismo de tránsito" valor={lic.organismoTransito} onChange={(v) => setLic({ ...lic, organismoTransito: v })} />
            <CampoEditable label="Limitaciones" valor={lic.limitacionesPropiedad} onChange={(v) => setLic({ ...lic, limitacionesPropiedad: v })} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="mb-2 text-sm font-extrabold text-white">Propietario</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Nombre" valor={prop.nombre} onChange={(v) => setProp({ ...prop, nombre: v })} />
            <CampoEditable label="Documento" valor={prop.documento} onChange={(v) => setProp({ ...prop, documento: v })} />
            <CampoEditable label="Dirección" valor={prop.direccion} onChange={(v) => setProp({ ...prop, direccion: v })} />
            <CampoEditable label="Ciudad" valor={prop.ciudad} onChange={(v) => setProp({ ...prop, ciudad: v })} />
            <CampoEditable label="Teléfono" valor={prop.telefono} onChange={(v) => setProp({ ...prop, telefono: v })} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="mb-2 text-sm font-extrabold text-white">Datos técnicos (reverso)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Color" valor={tec.color} onChange={(v) => setTec({ ...tec, color: v })} />
            <CampoEditable label="Servicio" valor={tec.servicio} onChange={(v) => setTec({ ...tec, servicio: v })} />
            <CampoEditable label="Carrocería" valor={tec.carroceria} onChange={(v) => setTec({ ...tec, carroceria: v })} />
            <CampoEditable label="Nº puertas" valor={tec.numPuertas} tipo="number" onChange={(v) => setTec({ ...tec, numPuertas: v })} />
            <CampoEditable label="Nº motor" valor={tec.numMotor} onChange={(v) => setTec({ ...tec, numMotor: v })} />
            <CampoEditable label="Nº serie" valor={tec.numSerie} onChange={(v) => setTec({ ...tec, numSerie: v })} />
            <CampoEditable label="Nº chasis" valor={tec.numChasis} onChange={(v) => setTec({ ...tec, numChasis: v })} />
            <CampoEditable label="Capacidad" valor={tec.capacidad} onChange={(v) => setTec({ ...tec, capacidad: v })} />
            <CampoEditable label="Avalúo comercial (COP)" valor={tec.avaluoComercial} tipo="number" onChange={(v) => setTec({ ...tec, avaluoComercial: v })} />
          </div>
        </div>

        <Button
          size="sm"
          disabled={busy}
          onClick={() => void guardar()}
          className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
        >
          {busy ? 'Guardando...' : 'Guardar tarjeta'}
        </Button>
      </CardContent>
    </Card>
  )
}

function MantenimientoTab({
  vehiculo,
  tareas,
  km,
  onCambio,
}: {
  vehiculo: Vehiculo
  tareas: TareaMantenimiento[]
  km?: number
  onCambio: () => void
}) {
  const [nuevoKm, setNuevoKm] = useState('')
  const [nombre, setNombre] = useState('')
  const [intervalo, setIntervalo] = useState('')
  const [busy, setBusy] = useState(false)
  const [servicio, setServicio] = useState<Record<string, { km: string; fecha: string; costo: string }>>({})

  const recargar = () => {
    invalidarSnapshotFinanciero()
    onCambio()
  }

  const guardarKm = async () => {
    const n = Number(nuevoKm)
    if (!Number.isFinite(n) || n < 0) return
    setBusy(true)
    try {
      await actualizarKilometraje(vehiculo.id, n)
      setNuevoKm('')
      recargar()
    } finally {
      setBusy(false)
    }
  }

  const agregarTarea = async () => {
    if (nombre.trim().length < 3) return
    const intervaloKm = intervalo ? Number(intervalo) : undefined
    const base = km ?? 0
    const tarea: TareaMantenimiento = {
      id: nuevaTareaId(),
      nombre: nombre.trim(),
      intervaloKm: intervaloKm && intervaloKm > 0 ? intervaloKm : undefined,
      ultimoKm: undefined,
      proximoKm: intervaloKm && intervaloKm > 0 ? base + intervaloKm : undefined,
    }
    setBusy(true)
    try {
      await guardarTareaMantenimiento(vehiculo.id, tarea)
      setNombre('')
      setIntervalo('')
      recargar()
    } finally {
      setBusy(false)
    }
  }

  const registrarServicio = async (t: TareaMantenimiento) => {
    const f = servicio[t.id]
    const kmNum = f?.km ? Number(f.km) : undefined
    const fecha = f?.fecha || new Date().toISOString().slice(0, 10)
    const costo = f?.costo ? Number(f.costo) : undefined
    setBusy(true)
    try {
      await registrarServicioMantenimiento(vehiculo.id, t.id, { km: kmNum, fecha })
      if (costo && costo > 0) {
        await crearMovimiento({
          fecha,
          tipo: 'mantenimiento',
          concepto: `Mantenimiento ${t.nombre} · ${vehiculo.marca} ${vehiculo.linea}${vehiculo.placa ? ` (${vehiculo.placa})` : ''}`,
          monto: costo,
          categoria: 'Transporte',
          vehiculoId: vehiculo.id,
          fuente: 'manual',
        })
      }
      setServicio((s) => ({ ...s, [t.id]: { km: '', fecha: '', costo: '' } }))
      recargar()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <CardContent className="space-y-4 p-4 text-xs sm:p-6">
        <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4 text-center">
          <div className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-mist-500">
            <Gauge className="h-3.5 w-3.5" />
            <span>Kilometraje actual</span>
          </div>
          <div className="font-mono text-3xl font-black tracking-widest text-white">
            {km !== undefined ? Math.round(km).toLocaleString('es-CO') : '—'}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Input
              type="number"
              value={nuevoKm}
              onChange={(e) => setNuevoKm(e.target.value)}
              placeholder="Nuevo kilometraje"
              className="field-dark h-9 w-44 text-xs shadow-none"
            />
            <Button
              size="sm"
              disabled={busy || !nuevoKm}
              onClick={() => void guardarKm()}
              className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
            >
              Actualizar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-white/[0.06] pt-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1.5">
            <span className="font-bold text-mist-300">Nueva tarea</span>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Cambio de aceite"
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
          <label className="flex w-36 flex-col gap-1.5">
            <span className="font-bold text-mist-300">Cada (km)</span>
            <Input
              type="number"
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
              placeholder="5000"
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
          <Button
            size="sm"
            disabled={busy || nombre.trim().length < 3}
            onClick={() => void agregarTarea()}
            className="h-10 cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>

        <div className="space-y-3">
          {tareas.length === 0 && (
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center text-mist-500">
              Sin tareas todavía. Crea la primera: aceite, frenos, llantas, batería...
            </p>
          )}
          {tareas.map((t) => {
            const prog = progresoTarea(t, km)
            const f = servicio[t.id] ?? { km: '', fecha: '', costo: '' }
            return (
              <div key={t.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-white">{t.nombre}</div>
                    <div className="mt-0.5 text-[11px] text-mist-500">
                      Último: {formatoKm(t.ultimoKm)}
                      {t.ultimaFecha ? ` · ${formatoFecha(t.ultimaFecha)}` : ''} → Próximo:{' '}
                      {formatoKm(t.proximoKm)}
                      {t.proximaFecha ? ` · ${formatoFecha(t.proximaFecha)}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => void eliminarTareaMantenimiento(vehiculo.id, t.id).then(recargar)}
                    title="Eliminar tarea"
                    className="cursor-pointer rounded-lg p-1.5 text-mist-600 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all"
                    style={{ width: `${prog}%` }}
                  />
                </div>
                <div className="mt-1 text-right text-[11px] font-bold text-mist-500">{prog}%</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    value={f.km}
                    onChange={(e) => setServicio((s) => ({ ...s, [t.id]: { ...f, km: e.target.value } }))}
                    placeholder={`Km (${km !== undefined ? Math.round(km).toLocaleString('es-CO') : '?'})`}
                    className="field-dark h-9 text-xs shadow-none"
                  />
                  <Input
                    type="date"
                    value={f.fecha}
                    onChange={(e) => setServicio((s) => ({ ...s, [t.id]: { ...f, fecha: e.target.value } }))}
                    className="field-dark h-9 text-xs shadow-none"
                  />
                  <Input
                    type="number"
                    value={f.costo}
                    onChange={(e) => setServicio((s) => ({ ...s, [t.id]: { ...f, costo: e.target.value } }))}
                    placeholder="Costo $"
                    className="field-dark h-9 text-xs shadow-none"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void registrarServicio(t)}
                  className="mt-2 h-9 w-full cursor-pointer gap-1.5 border border-emerald-400/30 bg-emerald-400/10 text-xs font-bold text-emerald-200 hover:bg-emerald-400/20"
                >
                  <Check className="h-3.5 w-3.5" />
                  Registrar servicio{f.costo ? ' + movimiento' : ''}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
