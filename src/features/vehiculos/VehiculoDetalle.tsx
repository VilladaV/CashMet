import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  actualizarKilometraje,
  actualizarVehiculo,
  detalleGastosVehiculo,
  eliminarTareaMantenimiento,
  guardarTareaMantenimiento,
  nuevaTareaId,
  registrarServicioMantenimiento,
  ESTADOS_VEHICULO,
  type EstadoVehiculo,
  type PeriodicidadGasto,
  type TareaMantenimiento,
  type Vehiculo,
  type VehiculoUpdate,
} from '@/lib/firebase/vehiculosRepo'
import { crearMovimiento, listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { subirDocumentoVehiculo, subirFotoVehiculo } from '@/lib/firebase/storage'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import { eliminarEventosTarea } from '@/lib/firebase/calendarioRepo'
import { fechaFutura, hoyISO, sumarMeses } from '@/lib/fechas'
import {
  claseVigencia,
  etiquetaVigencia,
  formatoFecha,
  formatoKm,
  progresoTarea,
  vigenciaDe,
} from './vehiculoUtils'
import SelectorTarifa from './SelectorTarifa'
import {
  AlertCircle,
  Camera,
  Car,
  Check,
  ExternalLink,
  FileText,
  Gauge,
  IdCard,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  StickyNote,
  Trash2,
  Wrench,
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

function mensajeError(e: unknown): string {
  const m = e as { message?: string; code?: string }
  return m?.message || m?.code || 'No se pudo guardar el cambio.'
}

function txt(v: string): string | undefined {
  return v.trim() || undefined
}

function num(v: string): number | undefined {
  const limpio = v.trim()
  if (!limpio) return undefined
  const n = Number(limpio.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export default function VehiculoDetalle({
  vehiculo,
  onCambio,
  onEditar,
}: {
  vehiculo: Vehiculo
  onCambio: () => void | Promise<void>
  onEditar?: () => void
}) {
  const [tab, setTab] = useState<Tab>('resumen')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [docTab, setDocTab] = useState<string | null>(null)

  const guardar = async (parcial: VehiculoUpdate, ok = 'Cambios guardados.') => {
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await actualizarVehiculo(vehiculo.id, parcial)
      invalidarSnapshotFinanciero()
      setMsg(ok)
      await onCambio()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBusy(false)
    }
  }

  const soatV = vigenciaDe(vehiculo.soat?.fechaVencimiento)
  const tmV = vigenciaDe(vehiculo.tecnicomecanica?.fechaVencimiento)
  const strV = vigenciaDe(vehiculo.seguroTodoRiesgo?.fechaVencimiento)
  const tareas = vehiculo.mantenimiento?.tareas ?? []
  const km = vehiculo.mantenimiento?.kilometrajeActual
  const keyBase = vehiculo.actualizado ?? 0

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
            <span className="min-w-0">
              <span className="block truncate">
                {vehiculo.marca} {vehiculo.linea}{' '}
                {vehiculo.modelo ? <span className="text-mist-500">({vehiculo.modelo})</span> : null}
              </span>
              <span className="block text-[11px] font-medium text-mist-500">
                {vehiculo.placa ? `${vehiculo.placa} · ` : ''}
                {vehiculo.tipo}
                {vehiculo.claseVehiculo ? ` · ${vehiculo.claseVehiculo}` : ''}
              </span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-bold text-mist-300">
              {vehiculo.estado ?? 'Disponible'}
            </span>
            {onEditar && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditar}
                className="ml-auto h-8 cursor-pointer gap-1.5 border border-white/10 text-xs text-mist-200 hover:bg-white/[0.06]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar datos
              </Button>
            )}
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
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs font-bold text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {tab === 'resumen' && (
        <ResumenTab
          key={`resumen-${keyBase}`}
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
          key={`docs-${keyBase}`}
          vehiculo={vehiculo}
          busy={busy}
          docAbierto={docTab}
          onAbrir={setDocTab}
          onGuardar={guardar}
        />
      )}
      {tab === 'tarjeta' && (
        <TarjetaTab key={`tarjeta-${keyBase}`} vehiculo={vehiculo} busy={busy} onGuardar={guardar} />
      )}
      {tab === 'mantenimiento' && (
        <MantenimientoTab vehiculo={vehiculo} tareas={tareas} km={km} onCambio={onCambio} />
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

function Mini({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-mist-500">{label}</div>
      <div className="font-bold text-mist-200">{COD(valor)}</div>
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
  onGuardar: (p: VehiculoUpdate, ok?: string) => Promise<void>
}) {
  const [estado, setEstado] = useState<EstadoVehiculo>(vehiculo.estado ?? 'Disponible')
  const [foto, setFoto] = useState<File | null>(null)
  const [notas, setNotas] = useState(vehiculo.notas ?? '')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const gastos = detalleGastosVehiculo(vehiculo)

  const guardarFoto = async () => {
    if (!foto) return
    if (!foto.type.startsWith('image/')) {
      setError('Selecciona una imagen válida.')
      return
    }
    if (foto.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar 5 MB.')
      return
    }
    setSubiendo(true)
    setError('')
    try {
      const url = await subirFotoVehiculo(vehiculo.id, foto)
      setFoto(null)
      await onGuardar({ fotoUrl: url }, 'Foto actualizada.')
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <CardContent className="space-y-3 p-4 text-xs sm:p-6">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-mist-500">Costo mensual estimado</div>
              <div className="text-xl font-extrabold text-emerald-200">{COD(gastos.totalMensual)}</div>
            </div>
            <div className="text-[10px] text-mist-500">SOAT y TM prorrateados a 12 meses</div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="SOAT" valor={gastos.soatMensual} />
            <Mini label="TM" valor={gastos.tmMensual} />
            <Mini label="Todo riesgo" valor={gastos.strMensual} />
            <Mini label="Otros" valor={gastos.otrosMensual} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fila label="Tipo" valor={`${vehiculo.tipo}${vehiculo.cilindraje ? ` · ${vehiculo.cilindraje} cc` : ''}`} />
          <Fila label="Color" valor={vehiculo.color || 'N/A'} />
          <Fila label="Valor comercial" valor={vehiculo.valorComercial ? COD(vehiculo.valorComercial) : 'N/A'} />
          <Fila label="Kilometraje" valor={formatoKm(vehiculo.mantenimiento?.kilometrajeActual)} />
          <Fila
            label="Tareas de mantenimiento"
            valor={`${vehiculo.mantenimiento?.tareas?.length ?? 0} registradas`}
          />
          <Fila label="Placa" valor={vehiculo.placa || 'N/A'} />
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

        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-200">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Estado del vehículo</span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoVehiculo)}
              className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
            >
              {ESTADOS_VEHICULO.map((e) => (
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
            disabled={busy || subiendo || estado === (vehiculo.estado ?? 'Disponible')}
            onClick={() => void onGuardar({ estado }, 'Estado actualizado.')}
            className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
          >
            Guardar estado
          </Button>
          {foto && (
            <Button
              size="sm"
              disabled={busy || subiendo}
              onClick={() => void guardarFoto()}
              className="h-9 cursor-pointer gap-1.5 border border-white/10 bg-transparent text-xs text-mist-200 hover:bg-white/5"
            >
              {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {subiendo ? 'Subiendo...' : 'Subir foto'}
            </Button>
          )}
        </div>

        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
            <StickyNote className="h-3.5 w-3.5 text-mist-300" />
            Notas
          </div>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            placeholder="Talleres, detalles, historial..."
            className="field-dark w-full rounded-xl px-3 py-2 text-xs"
          />
          <Button
            size="sm"
            disabled={busy || subiendo || notas === (vehiculo.notas ?? '')}
            onClick={() => void onGuardar({ notas: notas.trim() || null }, 'Notas guardadas.')}
            className="h-9 cursor-pointer border border-white/10 bg-transparent text-xs text-mist-200 hover:bg-white/5"
          >
            Guardar notas
          </Button>
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
  cifra,
  placeholder,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  tipo?: 'text' | 'number' | 'date'
  cifra?: boolean
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-bold text-mist-300">{label}</span>
      <Input
        type={tipo}
        cifra={cifra}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
  onGuardar: (p: VehiculoUpdate, ok?: string) => Promise<void>
}) {
  const [soat, setSoat] = useState({
    aseguradora: vehiculo.soat?.aseguradora ?? '',
    numeroPoliza: vehiculo.soat?.numeroPoliza ?? '',
    fechaInicioVigencia: vehiculo.soat?.fechaInicioVigencia ?? '',
    fechaVencimiento: vehiculo.soat?.fechaVencimiento ?? '',
    valorPrimaAnual: campoVacio(vehiculo.soat?.valorPrimaAnual),
  })
  const [tm, setTm] = useState({
    cda: vehiculo.tecnicomecanica?.cda ?? vehiculo.tecnicomecanica?.centroRevision ?? '',
    numeroCertificado: vehiculo.tecnicomecanica?.numeroCertificado ?? '',
    fechaExpedicion: vehiculo.tecnicomecanica?.fechaExpedicion ?? '',
    fechaVencimiento: vehiculo.tecnicomecanica?.fechaVencimiento ?? '',
    costoRevision: campoVacio(vehiculo.tecnicomecanica?.costoRevision),
  })
  const [str, setStr] = useState({
    tiene: (vehiculo.seguroTodoRiesgo?.tiene ? 'si' : 'no') as 'si' | 'no',
    aseguradora: vehiculo.seguroTodoRiesgo?.aseguradora ?? '',
    numeroPoliza: vehiculo.seguroTodoRiesgo?.numeroPoliza ?? '',
    fechaVencimiento: vehiculo.seguroTodoRiesgo?.fechaVencimiento ?? '',
    valorPrimaAnual: campoVacio(vehiculo.seguroTodoRiesgo?.valorPrimaAnual),
    periodicidad: (vehiculo.seguroTodoRiesgo?.periodicidad ?? 'anual') as PeriodicidadGasto,
  })
  const [docs, setDocs] = useState({
    manualNombre: vehiculo.documentos?.manualNombre ?? '',
    manualUrl: vehiculo.documentos?.manualUrl ?? '',
    fichaNombre: vehiculo.documentos?.fichaNombre ?? '',
    fichaUrl: vehiculo.documentos?.fichaUrl ?? '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [destinoArchivo, setDestinoArchivo] = useState<'manual' | 'ficha'>('manual')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const guardarTodo = () => {
    const valores = [soat.valorPrimaAnual, tm.costoRevision, str.valorPrimaAnual]
    if (valores.some((x) => x.trim() && (num(x) === undefined || (num(x) ?? 0) < 0))) {
      setError('Los valores deben ser números positivos.')
      return
    }
    const urls = [docs.manualUrl, docs.fichaUrl]
    if (urls.some((x) => x.trim() && !/^https?:\/\/\S+$/i.test(x.trim()))) {
      setError('Las URLs deben empezar por http:// o https://.')
      return
    }
    setError('')
    const soatObj = [soat.aseguradora, soat.numeroPoliza, soat.fechaInicioVigencia, soat.fechaVencimiento, soat.valorPrimaAnual].some(
      (x) => x.trim() !== ''
    )
      ? {
          aseguradora: txt(soat.aseguradora),
          numeroPoliza: txt(soat.numeroPoliza),
          fechaInicioVigencia: txt(soat.fechaInicioVigencia),
          fechaVencimiento: txt(soat.fechaVencimiento),
          valorPrimaAnual: num(soat.valorPrimaAnual),
          vigente: fechaFutura(soat.fechaVencimiento),
          fuente: 'manual',
        }
      : null
    const tmObj = [tm.cda, tm.numeroCertificado, tm.fechaExpedicion, tm.fechaVencimiento, tm.costoRevision].some(
      (x) => x.trim() !== ''
    )
      ? {
          centroRevision: txt(tm.cda),
          cda: txt(tm.cda),
          numeroCertificado: txt(tm.numeroCertificado),
          fechaExpedicion: txt(tm.fechaExpedicion),
          fechaVencimiento: txt(tm.fechaVencimiento),
          costoRevision: num(tm.costoRevision),
          vigente: fechaFutura(tm.fechaVencimiento),
          fuente: 'manual',
        }
      : null
    const strObj =
      str.tiene === 'si'
        ? {
            tiene: true,
            vigente: fechaFutura(str.fechaVencimiento),
            aseguradora: txt(str.aseguradora),
            numeroPoliza: txt(str.numeroPoliza),
            fechaVencimiento: txt(str.fechaVencimiento),
            valorPrimaAnual: num(str.valorPrimaAnual),
            periodicidad: str.periodicidad,
            fuente: 'manual',
          }
        : null
    const docsObj = [docs.manualNombre, docs.manualUrl, docs.fichaNombre, docs.fichaUrl].some(
      (x) => x.trim() !== ''
    )
      ? {
          manualNombre: txt(docs.manualNombre),
          manualUrl: txt(docs.manualUrl),
          fichaNombre: txt(docs.fichaNombre),
          fichaUrl: txt(docs.fichaUrl),
        }
      : null
    void onGuardar(
      {
        soat: soatObj,
        tecnicomecanica: tmObj,
        seguroTodoRiesgo: strObj,
        documentos: docsObj,
      },
      'Documentos guardados. El calendario usará los vencimientos.'
    )
  }

  const subirArchivo = async () => {
    if (!archivo) return
    if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecciona un archivo PDF.')
      return
    }
    if (archivo.size > 10 * 1024 * 1024) {
      setError('El PDF no puede superar 10 MB.')
      return
    }
    setSubiendo(true)
    setError('')
    try {
      const url = await subirDocumentoVehiculo(vehiculo.id, archivo)
      const nuevos =
        destinoArchivo === 'manual'
          ? { ...docs, manualUrl: url, manualNombre: archivo.name }
          : { ...docs, fichaUrl: url, fichaNombre: archivo.name }
      setDocs(nuevos)
      await onGuardar(
        {
          documentos: {
            manualNombre: txt(nuevos.manualNombre),
            manualUrl: txt(nuevos.manualUrl),
            fichaNombre: txt(nuevos.fichaNombre),
            fichaUrl: txt(nuevos.fichaUrl),
          },
        },
        'PDF subido y guardado.'
      )
      setArchivo(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setSubiendo(false)
    }
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
        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-200">{error}</div>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-white">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            SOAT
          </h3>
          <div className="mb-3">
            <SelectorTarifa
              tipoTarifa="soat"
              tipoVehiculo={vehiculo.tipo}
              cilindraje={vehiculo.cilindraje}
              modelo={vehiculo.modelo}
              onSeleccionar={(val) => setSoat((prev) => ({ ...prev, valorPrimaAnual: String(val) }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Aseguradora" valor={soat.aseguradora} onChange={(v) => setSoat({ ...soat, aseguradora: v })} />
            <CampoEditable label="Número de póliza" valor={soat.numeroPoliza} onChange={(v) => setSoat({ ...soat, numeroPoliza: v })} />
            <CampoEditable label="Inicio de vigencia" valor={soat.fechaInicioVigencia} tipo="date" onChange={(v) => setSoat({ ...soat, fechaInicioVigencia: v })} />
            <CampoEditable label="Vencimiento" valor={soat.fechaVencimiento} tipo="date" onChange={(v) => setSoat({ ...soat, fechaVencimiento: v })} />
            <CampoEditable label="Prima anual (COP)" valor={soat.valorPrimaAnual} cifra onChange={(v) => setSoat({ ...soat, valorPrimaAnual: v })} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-white">
            <Wrench className="h-4 w-4 text-amber-300" />
            Tecnicomecánica
          </h3>
          <div className="mb-3">
            <SelectorTarifa
              tipoTarifa="tm"
              tipoVehiculo={vehiculo.tipo}
              modelo={vehiculo.modelo}
              onSeleccionar={(val) => setTm((prev) => ({ ...prev, costoRevision: String(val) }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="CDA / Centro" valor={tm.cda} onChange={(v) => setTm({ ...tm, cda: v })} />
            <CampoEditable label="Número de certificado" valor={tm.numeroCertificado} onChange={(v) => setTm({ ...tm, numeroCertificado: v })} />
            <CampoEditable label="Fecha de expedición" valor={tm.fechaExpedicion} tipo="date" onChange={(v) => setTm({ ...tm, fechaExpedicion: v })} />
            <CampoEditable label="Vencimiento" valor={tm.fechaVencimiento} tipo="date" onChange={(v) => setTm({ ...tm, fechaVencimiento: v })} />
            <CampoEditable label="Costo revisión (COP)" valor={tm.costoRevision} cifra onChange={(v) => setTm({ ...tm, costoRevision: v })} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-white">
            <ShieldCheck className="h-4 w-4 text-violet-300" />
            Seguro todo riesgo
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-bold text-mist-300">¿Tiene seguro?</span>
              <select
                value={str.tiene}
                onChange={(e) => setStr({ ...str, tiene: e.target.value as 'si' | 'no' })}
                className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
              >
                <option value="no">No</option>
                <option value="si">Sí</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-bold text-mist-300">Periodicidad de la prima</span>
              <select
                value={str.periodicidad}
                onChange={(e) => setStr({ ...str, periodicidad: e.target.value as PeriodicidadGasto })}
                className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
              >
                <option value="anual">Anual</option>
                <option value="semestral">Semestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="mensual">Mensual</option>
              </select>
            </label>
            <CampoEditable label="Aseguradora" valor={str.aseguradora} onChange={(v) => setStr({ ...str, aseguradora: v })} />
            <CampoEditable label="Número de póliza" valor={str.numeroPoliza} onChange={(v) => setStr({ ...str, numeroPoliza: v })} />
            <CampoEditable label="Vencimiento" valor={str.fechaVencimiento} tipo="date" onChange={(v) => setStr({ ...str, fechaVencimiento: v })} />
            <CampoEditable label="Prima" valor={str.valorPrimaAnual} cifra onChange={(v) => setStr({ ...str, valorPrimaAnual: v })} />
          </div>
        </div>

        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <h3 className="text-sm font-extrabold text-white">Manual y ficha técnica (PDF)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoEditable label="Nombre del manual" valor={docs.manualNombre} placeholder="Manual del vehículo" onChange={(v) => setDocs({ ...docs, manualNombre: v })} />
            <CampoEditable label="URL del manual (PDF)" valor={docs.manualUrl} placeholder="https://..." onChange={(v) => setDocs({ ...docs, manualUrl: v })} />
            <CampoEditable label="Nombre de la ficha" valor={docs.fichaNombre} placeholder="Ficha técnica" onChange={(v) => setDocs({ ...docs, fichaNombre: v })} />
            <CampoEditable label="URL de la ficha (PDF)" valor={docs.fichaUrl} placeholder="https://..." onChange={(v) => setDocs({ ...docs, fichaUrl: v })} />
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
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="text-[11px] text-mist-500 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-400/15 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-emerald-300"
            />
            {archivo && (
              <Button
                size="sm"
                disabled={busy || subiendo}
                onClick={() => void subirArchivo()}
                className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
              >
                {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {subiendo ? 'Subiendo...' : 'Subir PDF'}
              </Button>
            )}
          </div>
          {visor('manual', docs.manualNombre || 'Manual', docs.manualUrl || undefined)}
          {visor('ficha', docs.fichaNombre || 'Ficha técnica', docs.fichaUrl || undefined)}
        </div>

        <Button
          size="sm"
          disabled={busy || subiendo}
          onClick={guardarTodo}
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
  onGuardar: (p: VehiculoUpdate, ok?: string) => Promise<void>
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
  const [error, setError] = useState('')

  const guardar = () => {
    const puertas = num(tec.numPuertas)
    if (tec.numPuertas.trim() && (puertas === undefined || !Number.isInteger(puertas) || puertas < 0 || puertas > 10)) {
      setError('El número de puertas debe ser un entero entre 0 y 10.')
      return
    }
    const avaluo = num(tec.avaluoComercial)
    if (tec.avaluoComercial.trim() && (avaluo === undefined || avaluo < 0)) {
      setError('El avalúo comercial no es válido.')
      return
    }
    setError('')
    const licObj = [lic.numeroLicencia, lic.fechaExpedicion, lic.organismoTransito, lic.limitacionesPropiedad].some(
      (x) => x.trim() !== ''
    )
      ? {
          numeroLicencia: txt(lic.numeroLicencia),
          fechaExpedicion: txt(lic.fechaExpedicion),
          organismoTransito: txt(lic.organismoTransito),
          limitacionesPropiedad: txt(lic.limitacionesPropiedad),
        }
      : null
    const propObj = [prop.nombre, prop.documento, prop.direccion, prop.ciudad, prop.telefono].some(
      (x) => x.trim() !== ''
    )
      ? {
          nombre: txt(prop.nombre),
          documento: txt(prop.documento),
          direccion: txt(prop.direccion),
          ciudad: txt(prop.ciudad),
          telefono: txt(prop.telefono),
        }
      : null
    void onGuardar(
      {
        color: txt(tec.color) ?? null,
        servicio: txt(tec.servicio) ?? null,
        carroceria: txt(tec.carroceria) ?? null,
        numPuertas: puertas ?? null,
        numMotor: txt(tec.numMotor) ?? null,
        numSerie: txt(tec.numSerie) ?? null,
        numChasis: txt(tec.numChasis) ?? null,
        capacidad: txt(tec.capacidad) ?? null,
        avaluoComercial: avaluo ?? null,
        licenciaTransito: licObj,
        propietarioDetalle: propObj,
      },
      'Tarjeta de propiedad guardada.'
    )
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <CardContent className="space-y-4 p-4 text-xs sm:p-6">
        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-200">{error}</div>
        )}

        <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-200/[0.08] to-yellow-500/[0.04] p-4">
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">
            Licencia de tránsito · frente
          </div>
          <div className="text-base font-extrabold text-white">
            {vehiculo.marca} {vehiculo.linea}{vehiculo.modelo ? ` · ${vehiculo.modelo}` : ''}
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
            <CampoEditable label="Avalúo comercial (COP)" valor={tec.avaluoComercial} cifra onChange={(v) => setTec({ ...tec, avaluoComercial: v })} />
          </div>
        </div>

        <Button
          size="sm"
          disabled={busy}
          onClick={guardar}
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
  onCambio: () => void | Promise<void>
}) {
  const [nuevoKm, setNuevoKm] = useState('')
  const [nombre, setNombre] = useState('')
  const [intervalo, setIntervalo] = useState('')
  const [intervaloMeses, setIntervaloMeses] = useState('')
  const [fechaProxima, setFechaProxima] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [servicio, setServicio] = useState<Record<string, { km: string; fecha: string; costo: string }>>({})
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [cuentaId, setCuentaId] = useState('')

  useEffect(() => {
    listarCuentasBanco()
      .then((data) => {
        setCuentas(data)
        if (data.length > 0) setCuentaId((prev) => prev || data[0].id)
      })
      .catch(() => setCuentas([]))
  }, [])

  const recargar = async () => {
    invalidarSnapshotFinanciero()
    await onCambio()
  }

  const guardarKm = async () => {
    const n = Number(String(nuevoKm).replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      setError('El kilometraje debe ser un número positivo.')
      return
    }
    if (km !== undefined && n < km && !window.confirm('El kilometraje es menor al actual. ¿Guardarlo de todos modos?')) {
      return
    }
    setBusy(true)
    setError('')
    setOk('')
    try {
      await actualizarKilometraje(vehiculo.id, n)
      setNuevoKm('')
      setOk('Kilometraje actualizado.')
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBusy(false)
    }
  }

  const agregarTarea = async () => {
    const nombreLimpio = nombre.trim()
    if (nombreLimpio.length < 3) {
      setError('Escribe un nombre de tarea de al menos 3 caracteres.')
      return
    }
    if (tareas.some((t) => t.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
      setError('Ya existe una tarea con ese nombre.')
      return
    }
    const kmIntervalo = intervalo ? Number(String(intervalo).replace(/[^\d.-]/g, '')) : undefined
    if (intervalo && (!Number.isFinite(kmIntervalo) || (kmIntervalo ?? 0) <= 0)) {
      setError('El intervalo en kilómetros no es válido.')
      return
    }
    const mesesIntervalo = intervaloMeses ? Number(intervaloMeses) : undefined
    if (intervaloMeses && (!Number.isFinite(mesesIntervalo) || (mesesIntervalo ?? 0) <= 0)) {
      setError('El intervalo en meses no es válido.')
      return
    }
    const base = km ?? 0
    const proxima =
      fechaProxima || (mesesIntervalo && mesesIntervalo > 0 ? sumarMeses(hoyISO(), mesesIntervalo) : undefined)
    const tarea: TareaMantenimiento = {
      id: nuevaTareaId(),
      nombre: nombreLimpio,
      intervaloKm: kmIntervalo && kmIntervalo > 0 ? kmIntervalo : undefined,
      intervaloMeses: mesesIntervalo && mesesIntervalo > 0 ? mesesIntervalo : undefined,
      ultimoKm: km,
      proximoKm: kmIntervalo && kmIntervalo > 0 ? base + kmIntervalo : undefined,
      proximaFecha: proxima,
    }
    setBusy(true)
    setError('')
    setOk('')
    try {
      await guardarTareaMantenimiento(vehiculo.id, tarea)
      setNombre('')
      setIntervalo('')
      setIntervaloMeses('')
      setFechaProxima('')
      setOk('Tarea de mantenimiento creada.')
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBusy(false)
    }
  }

  const registrarServicio = async (t: TareaMantenimiento) => {
    const f = servicio[t.id] ?? { km: '', fecha: '', costo: '' }
    const kmNum = f.km.trim() ? Number(String(f.km).replace(/[^\d.-]/g, '')) : undefined
    if (kmNum !== undefined && (!Number.isFinite(kmNum) || kmNum < 0)) {
      setError('El kilometraje del servicio no es válido.')
      return
    }
    const fecha = f.fecha || hoyISO()
    const costo = f.costo.trim() ? Number(String(f.costo).replace(/[^\d.-]/g, '')) : undefined
    if (costo !== undefined && (!Number.isFinite(costo) || costo < 0)) {
      setError('El costo del servicio no es válido.')
      return
    }
    if (costo && costo > 0 && !cuentaId) {
      setError('Debes elegir la cuenta bancaria de la cual se descontará el costo del mantenimiento.')
      return
    }
    setBusy(true)
    setError('')
    setOk('')
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
          cuentaBancoId: cuentaId,
          fuente: 'manual',
        })
      }
      setServicio((s) => ({ ...s, [t.id]: { km: '', fecha: '', costo: '' } }))
      setOk(`Servicio registrado${costo && costo > 0 ? ` y ${COD(costo)} descontados de la cuenta` : ''}.`)
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBusy(false)
    }
  }

  const borrarTarea = async (t: TareaMantenimiento) => {
    if (!window.confirm(`¿Eliminar la tarea "${t.nombre}"?`)) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      await eliminarEventosTarea(t.id)
      await eliminarTareaMantenimiento(vehiculo.id, t.id)
      setOk('Tarea eliminada.')
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
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
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Input
              cifra
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
          {km === undefined && (
            <p className="mt-2 text-[10px] text-amber-300/80">
              Registra el kilometraje para calcular los próximos servicios por kilómetros.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-200">{error}</div>
        )}
        {ok && (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 text-xs text-emerald-200">{ok}</div>
        )}

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-white">
            <Plus className="h-4 w-4 text-emerald-300" />
            Nueva tarea
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="font-bold text-mist-300">Nombre</span>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Cambio de aceite"
                className="field-dark h-10 text-xs shadow-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-bold text-mist-300">Cada (km)</span>
              <Input
                cifra
                value={intervalo}
                onChange={(e) => setIntervalo(e.target.value)}
                placeholder="5,000"
                className="field-dark h-10 text-xs shadow-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-bold text-mist-300">Cada (meses)</span>
              <Input
                type="number"
                value={intervaloMeses}
                onChange={(e) => setIntervaloMeses(e.target.value)}
                placeholder="6"
                className="field-dark h-10 text-xs shadow-none"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="font-bold text-mist-300">Próxima fecha (opcional)</span>
              <Input
                type="date"
                value={fechaProxima}
                onChange={(e) => setFechaProxima(e.target.value)}
                className="field-dark h-10 text-xs shadow-none"
              />
            </label>
            <div className="flex items-end sm:col-span-2">
              <Button
                size="sm"
                disabled={busy || nombre.trim().length < 3}
                onClick={() => void agregarTarea()}
                className="h-10 w-full cursor-pointer gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
              >
                <Plus className="h-4 w-4" />
                Añadir tarea
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-bold text-mist-300">
              Cuenta para costos de mantenimiento <span className="text-red-300">*</span>
            </span>
            <select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
            >
              {cuentas.length === 0 && <option value="">Crea primero una cuenta en Cuentas</option>}
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {COD(c.saldoActual)}
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-xs text-[10px] text-mist-500">
            El costo del servicio se descuenta automáticamente de la cuenta seleccionada.
          </p>
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
            const intervaloTexto = [
              t.intervaloKm ? `cada ${formatoKm(t.intervaloKm)}` : '',
              t.intervaloMeses ? `cada ${t.intervaloMeses} meses` : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={t.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-white">{t.nombre}</div>
                    <div className="mt-0.5 text-[11px] text-mist-500">
                      {intervaloTexto || 'Sin intervalo definido'}
                    </div>
                  </div>
                  <button
                    onClick={() => void borrarTarea(t)}
                    title="Eliminar tarea"
                    className="cursor-pointer rounded-lg p-1.5 text-mist-600 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-mist-500 sm:grid-cols-2">
                  <div>
                    Último: <b className="text-mist-200">{formatoKm(t.ultimoKm)}</b>
                    {t.ultimaFecha ? ` · ${formatoFecha(t.ultimaFecha)}` : ''}
                  </div>
                  <div>
                    Próximo: <b className="text-mist-200">{formatoKm(t.proximoKm)}</b>
                    {t.proximaFecha ? ` · ${formatoFecha(t.proximaFecha)}` : ''}
                  </div>
                </div>
                {t.proximoKm !== undefined && (
                  <>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all"
                        style={{ width: `${prog}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[11px] font-bold text-mist-500">{prog}%</div>
                  </>
                )}
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    cifra
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
                    cifra
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
