import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  actualizarVehiculo,
  crearVehiculo,
  eliminarVehiculo,
  ESTADOS_VEHICULO,
  TIPOS_VEHICULO,
  type EstadoVehiculo,
  type PeriodicidadGasto,
  type TipoVehiculo,
  type Vehiculo,
  type VehiculoUpdate,
} from '@/lib/firebase/vehiculosRepo'
import { fechaFutura } from '@/lib/fechas'
import { Car, FileText, Gauge, Loader2, Save, ShieldCheck, StickyNote, Trash2, Wrench, X } from 'lucide-react'

interface Props {
  vehiculo: Vehiculo | null
  onCerrar: () => void
  onGuardado: (id: string) => void | Promise<void>
  onEliminado: (id: string) => void | Promise<void>
}

function numero(valor: string): number | undefined {
  const limpio = valor.trim()
  if (!limpio) return undefined
  const n = Number(limpio.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function txt(valor: string): string | undefined {
  return valor.trim() || undefined
}

function txtNulo(valor: string): string | null {
  return valor.trim() || null
}

function mensajeError(e: unknown): string {
  const m = e as { message?: string; code?: string }
  return m?.message || m?.code || 'No se pudo guardar el vehículo.'
}

function inicial(v: Vehiculo | null) {
  return {
    placa: v?.placa ?? '',
    marca: v?.marca ?? '',
    linea: v?.linea ?? '',
    modelo: v?.modelo ? String(v.modelo) : '',
    tipo: (v?.tipo ?? 'carro') as TipoVehiculo,
    estado: (v?.estado ?? 'Disponible') as EstadoVehiculo,
    cilindraje: v?.cilindraje != null ? String(v.cilindraje) : '',
    claseVehiculo: v?.claseVehiculo ?? '',
    color: v?.color ?? '',
    valorComercial: v?.valorComercial != null ? String(v.valorComercial) : '',
    fotoUrl: v?.fotoUrl ?? '',
    notas: v?.notas ?? '',
    km: v?.mantenimiento?.kilometrajeActual != null ? String(v.mantenimiento.kilometrajeActual) : '',
    soatAseguradora: v?.soat?.aseguradora ?? '',
    soatPoliza: v?.soat?.numeroPoliza ?? '',
    soatInicio: v?.soat?.fechaInicioVigencia ?? '',
    soatVence: v?.soat?.fechaVencimiento ?? '',
    soatPrima: v?.soat?.valorPrimaAnual != null ? String(v.soat.valorPrimaAnual) : '',
    tmCda: v?.tecnicomecanica?.cda ?? v?.tecnicomecanica?.centroRevision ?? '',
    tmCertificado: v?.tecnicomecanica?.numeroCertificado ?? '',
    tmExpedicion: v?.tecnicomecanica?.fechaExpedicion ?? '',
    tmVence: v?.tecnicomecanica?.fechaVencimiento ?? '',
    tmCosto: v?.tecnicomecanica?.costoRevision != null ? String(v.tecnicomecanica.costoRevision) : '',
    strTiene: (v?.seguroTodoRiesgo?.tiene ? 'si' : 'no') as 'si' | 'no',
    strAseguradora: v?.seguroTodoRiesgo?.aseguradora ?? '',
    strPoliza: v?.seguroTodoRiesgo?.numeroPoliza ?? '',
    strVence: v?.seguroTodoRiesgo?.fechaVencimiento ?? '',
    strPrima: v?.seguroTodoRiesgo?.valorPrimaAnual != null ? String(v.seguroTodoRiesgo.valorPrimaAnual) : '',
    strPeriodicidad: (v?.seguroTodoRiesgo?.periodicidad ?? 'anual') as PeriodicidadGasto,
    manualNombre: v?.documentos?.manualNombre ?? '',
    manualUrl: v?.documentos?.manualUrl ?? '',
    fichaNombre: v?.documentos?.fichaNombre ?? '',
    fichaUrl: v?.documentos?.fichaUrl ?? '',
  }
}

function Campo({
  label,
  valor,
  onChange,
  tipo = 'text',
  placeholder,
  span2,
  required,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  tipo?: 'text' | 'number' | 'date' | 'url'
  placeholder?: string
  span2?: boolean
  required?: boolean
}) {
  return (
    <label className={span2 ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-[11px] font-semibold text-mist-400">
        {label}
        {required ? ' *' : ''}
      </span>
      <Input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-dark h-9 text-xs"
      />
    </label>
  )
}

function Seleccion({
  label,
  valor,
  onChange,
  children,
  span2,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  children: ReactNode
  span2?: boolean
}) {
  return (
    <label className={span2 ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-[11px] font-semibold text-mist-400">{label}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="field-dark h-9 w-full rounded-lg px-3 text-xs"
      >
        {children}
      </select>
    </label>
  )
}

function Seccion({ titulo, icono, children }: { titulo: string; icono: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 sm:p-4">
      <div className="flex items-center gap-2 text-xs font-extrabold text-white">
        {icono}
        {titulo}
      </div>
      {children}
    </section>
  )
}

export default function VehiculoForm({ vehiculo, onCerrar, onGuardado, onEliminado }: Props) {
  const [f, setF] = useState(() => inicial(vehiculo))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCerrar])

  const set = (k: keyof ReturnType<typeof inicial>, v: string) => {
    setF((prev) => ({ ...prev, [k]: v } as ReturnType<typeof inicial>))
  }

  const validar = (): string | null => {
    if (!f.marca.trim()) return 'La marca es obligatoria.'
    if (!f.linea.trim()) return 'La línea es obligatoria.'
    const modelo = Number(f.modelo)
    if (!f.modelo.trim() || !Number.isInteger(modelo) || modelo < 1900 || modelo > new Date().getFullYear() + 1) {
      return 'El modelo debe ser un año válido.'
    }
    const placa = f.placa.trim().toUpperCase()
    if (placa && !/^[A-Z0-9]{5,7}$/.test(placa)) return 'La placa debe tener entre 5 y 7 caracteres alfanuméricos.'
    const numeros: Array<[keyof ReturnType<typeof inicial>, string, boolean]> = [
      ['cilindraje', 'El cilindraje', true],
      ['valorComercial', 'El valor comercial', false],
      ['km', 'El kilometraje', true],
      ['soatPrima', 'La prima del SOAT', false],
      ['tmCosto', 'El costo de la tecnomecánica', false],
      ['strPrima', 'La prima del todo riesgo', false],
    ]
    for (const [campo, etiqueta, entero] of numeros) {
      if (!f[campo].trim()) continue
      const n = numero(f[campo])
      if (n === undefined) return `${etiqueta} no es un número válido.`
      if (n < 0) return `${etiqueta} no puede ser negativo.`
      if (entero && !Number.isInteger(n)) return `${etiqueta} debe ser un número entero.`
    }
    const urls: Array<[string, string]> = [
      [f.fotoUrl, 'La URL de la foto'],
      [f.manualUrl, 'La URL del manual'],
      [f.fichaUrl, 'La URL de la ficha técnica'],
    ]
    for (const [url, etiqueta] of urls) {
      if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) return `${etiqueta} no es válida.`
    }
    return null
  }

  const guardar = async () => {
    const problema = validar()
    if (problema) {
      setError(problema)
      return
    }
    setError('')
    setBusy(true)
    try {
      const placa = f.placa.trim().toUpperCase()
      const tieneSoat = [f.soatAseguradora, f.soatPoliza, f.soatInicio, f.soatVence, f.soatPrima].some(
        (x) => x.trim() !== ''
      )
      const tieneTm = [f.tmCda, f.tmCertificado, f.tmExpedicion, f.tmVence, f.tmCosto].some((x) => x.trim() !== '')
      const tieneDocs = [f.manualNombre, f.manualUrl, f.fichaNombre, f.fichaUrl].some((x) => x.trim() !== '')
      const tareas = vehiculo?.mantenimiento?.tareas ?? []
      const km = numero(f.km)
      const data = {
        placa: txtNulo(placa),
        marca: f.marca.trim(),
        linea: f.linea.trim(),
        modelo: Number(f.modelo),
        tipo: f.tipo,
        estado: f.estado,
        cilindraje: numero(f.cilindraje) ?? null,
        claseVehiculo: txtNulo(f.claseVehiculo),
        color: txtNulo(f.color),
        valorComercial: numero(f.valorComercial) ?? null,
        fotoUrl: txtNulo(f.fotoUrl),
        notas: txtNulo(f.notas),
        mantenimiento: km !== undefined || tareas.length ? { kilometrajeActual: km, tareas } : null,
        soat: tieneSoat
          ? {
              vigente: fechaFutura(f.soatVence),
              aseguradora: txt(f.soatAseguradora),
              numeroPoliza: txt(f.soatPoliza),
              fechaInicioVigencia: txt(f.soatInicio),
              fechaVencimiento: txt(f.soatVence),
              valorPrimaAnual: numero(f.soatPrima),
              fuente: 'manual',
            }
          : null,
        tecnicomecanica: tieneTm
          ? {
              vigente: fechaFutura(f.tmVence),
              centroRevision: txt(f.tmCda),
              cda: txt(f.tmCda),
              numeroCertificado: txt(f.tmCertificado),
              fechaExpedicion: txt(f.tmExpedicion),
              fechaVencimiento: txt(f.tmVence),
              costoRevision: numero(f.tmCosto),
              fuente: 'manual',
            }
          : null,
        seguroTodoRiesgo:
          f.strTiene === 'si'
            ? {
                tiene: true,
                vigente: fechaFutura(f.strVence),
                aseguradora: txt(f.strAseguradora),
                numeroPoliza: txt(f.strPoliza),
                fechaVencimiento: txt(f.strVence),
                valorPrimaAnual: numero(f.strPrima),
                periodicidad: f.strPeriodicidad,
                fuente: 'manual',
              }
            : null,
        documentos: tieneDocs
          ? {
              manualNombre: txt(f.manualNombre),
              manualUrl: txt(f.manualUrl),
              fichaNombre: txt(f.fichaNombre),
              fichaUrl: txt(f.fichaUrl),
            }
          : null,
      } as VehiculoUpdate
      if (vehiculo) {
        await actualizarVehiculo(vehiculo.id, data)
        await onGuardado(vehiculo.id)
      } else {
        const id = await crearVehiculo(data)
        await onGuardado(id)
      }
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBusy(false)
    }
  }

  const eliminar = async () => {
    if (!vehiculo) return
    if (!window.confirm(`¿Eliminar ${vehiculo.marca} ${vehiculo.linea}? También se borrarán sus recordatorios del calendario.`)) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await eliminarVehiculo(vehiculo.id)
      await onEliminado(vehiculo.id)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => {
        if (!busy) onCerrar()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehiculo-form-title"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-0 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <div>
            <h2 id="vehiculo-form-title" className="text-base font-extrabold text-white">
              {vehiculo ? 'Editar vehículo' : 'Nuevo vehículo'}
            </h2>
            <p className="text-[11px] text-mist-500">
              {vehiculo ? `${vehiculo.marca} ${vehiculo.linea}` : 'Registra los datos base y sus documentos.'}
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={busy}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-mist-300 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <Seccion titulo="Identificación" icono={<Car className="h-4 w-4 text-emerald-300" />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Placa" valor={f.placa} onChange={(v) => set('placa', v.toUpperCase())} placeholder="ABC123" />
              <Campo label="Marca" valor={f.marca} onChange={(v) => set('marca', v)} required />
              <Campo label="Línea" valor={f.linea} onChange={(v) => set('linea', v)} required />
              <Campo label="Modelo (año)" valor={f.modelo} onChange={(v) => set('modelo', v)} tipo="number" required />
              <Seleccion label="Tipo" valor={f.tipo} onChange={(v) => set('tipo', v)}>
                {TIPOS_VEHICULO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Seleccion>
              <Seleccion label="Estado" valor={f.estado} onChange={(v) => set('estado', v)}>
                {ESTADOS_VEHICULO.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Seleccion>
              <Campo label="Cilindraje" valor={f.cilindraje} onChange={(v) => set('cilindraje', v)} tipo="number" />
              <Campo label="Clase" valor={f.claseVehiculo} onChange={(v) => set('claseVehiculo', v)} placeholder="Automóvil, camioneta..." />
              <Campo label="Color" valor={f.color} onChange={(v) => set('color', v)} />
              <Campo label="Valor comercial" valor={f.valorComercial} onChange={(v) => set('valorComercial', v)} tipo="number" />
              <Campo label="Kilometraje" valor={f.km} onChange={(v) => set('km', v)} tipo="number" />
              <Campo label="Foto (URL)" valor={f.fotoUrl} onChange={(v) => set('fotoUrl', v)} tipo="url" placeholder="https://..." />
            </div>
          </Seccion>

          <Seccion titulo="SOAT" icono={<ShieldCheck className="h-4 w-4 text-sky-300" />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Aseguradora" valor={f.soatAseguradora} onChange={(v) => set('soatAseguradora', v)} />
              <Campo label="Número de póliza" valor={f.soatPoliza} onChange={(v) => set('soatPoliza', v)} />
              <Campo label="Inicio de vigencia" valor={f.soatInicio} onChange={(v) => set('soatInicio', v)} tipo="date" />
              <Campo label="Vencimiento" valor={f.soatVence} onChange={(v) => set('soatVence', v)} tipo="date" />
              <Campo label="Prima anual" valor={f.soatPrima} onChange={(v) => set('soatPrima', v)} tipo="number" />
            </div>
          </Seccion>

          <Seccion titulo="Tecnomecánica" icono={<Wrench className="h-4 w-4 text-amber-300" />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="CDA" valor={f.tmCda} onChange={(v) => set('tmCda', v)} />
              <Campo label="Número de certificado" valor={f.tmCertificado} onChange={(v) => set('tmCertificado', v)} />
              <Campo label="Fecha de expedición" valor={f.tmExpedicion} onChange={(v) => set('tmExpedicion', v)} tipo="date" />
              <Campo label="Vencimiento" valor={f.tmVence} onChange={(v) => set('tmVence', v)} tipo="date" />
              <Campo label="Costo de revisión" valor={f.tmCosto} onChange={(v) => set('tmCosto', v)} tipo="number" />
            </div>
          </Seccion>

          <Seccion titulo="Seguro todo riesgo" icono={<ShieldCheck className="h-4 w-4 text-violet-300" />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Seleccion label="¿Tiene seguro?" valor={f.strTiene} onChange={(v) => set('strTiene', v)}>
                <option value="no">No</option>
                <option value="si">Sí</option>
              </Seleccion>
              <Seleccion label="Periodicidad de la prima" valor={f.strPeriodicidad} onChange={(v) => set('strPeriodicidad', v)}>
                <option value="anual">Anual</option>
                <option value="semestral">Semestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="mensual">Mensual</option>
              </Seleccion>
              <Campo label="Aseguradora" valor={f.strAseguradora} onChange={(v) => set('strAseguradora', v)} />
              <Campo label="Número de póliza" valor={f.strPoliza} onChange={(v) => set('strPoliza', v)} />
              <Campo label="Vencimiento" valor={f.strVence} onChange={(v) => set('strVence', v)} tipo="date" />
              <Campo label="Prima" valor={f.strPrima} onChange={(v) => set('strPrima', v)} tipo="number" />
            </div>
          </Seccion>

          <Seccion titulo="Documentos" icono={<FileText className="h-4 w-4 text-cyan-300" />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nombre del manual" valor={f.manualNombre} onChange={(v) => set('manualNombre', v)} />
              <Campo label="URL del manual" valor={f.manualUrl} onChange={(v) => set('manualUrl', v)} tipo="url" placeholder="https://..." />
              <Campo label="Nombre de la ficha técnica" valor={f.fichaNombre} onChange={(v) => set('fichaNombre', v)} />
              <Campo label="URL de la ficha técnica" valor={f.fichaUrl} onChange={(v) => set('fichaUrl', v)} tipo="url" placeholder="https://..." />
            </div>
          </Seccion>

          <Seccion titulo="Notas" icono={<StickyNote className="h-4 w-4 text-mist-300" />}>
            <textarea
              value={f.notas}
              onChange={(e) => set('notas', e.target.value)}
              rows={3}
              placeholder="Seguros, talleres, detalles del vehículo..."
              className="field-dark w-full rounded-lg px-3 py-2 text-xs"
            />
          </Seccion>

          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] text-mist-500">
            <Gauge className="h-3.5 w-3.5 shrink-0" />
            El costo mensual se calcula automáticamente con el SOAT, la tecnomecánica y el todo riesgo.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/20 px-4 py-3 sm:px-6">
          <div>
            {vehiculo && (
              <Button
                variant="ghost"
                onClick={eliminar}
                disabled={busy}
                className="h-9 cursor-pointer text-red-300 hover:bg-red-500/10 hover:text-red-200"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={busy} className="h-9 cursor-pointer">
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={busy} className="h-9 cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
