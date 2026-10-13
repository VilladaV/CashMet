import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import CrudPage, { type CampoForm } from '@/components/CrudPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { BadgeDollarSign, CheckCircle2 } from 'lucide-react'
import {
  TIPOS_CONTRATO,
  actualizarNomina,
  crearNomina,
  eliminarNomina,
  listarNomina,
  type Nomina,
} from '@/lib/firebase/nominaRepo'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { guardarSalarioPropio, leerPiloto } from '@/lib/firebase/pilotoRepo'

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

function SalarioPropioCard() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [monto, setMonto] = useState('')
  const [dia, setDia] = useState('1')
  const [cuentaId, setCuentaId] = useState('')
  const [concepto, setConcepto] = useState('Salario mensual')
  const [activo, setActivo] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => {})
    leerPiloto()
      .then((cfg) => {
        const s = cfg.salario
        if (!s) return
        setMonto(s.monto ? String(s.monto) : '')
        setDia(String(s.dia || 1))
        setCuentaId(s.cuentaBancoId ?? '')
        setConcepto(s.concepto ?? 'Salario mensual')
        setActivo(s.activo)
      })
      .catch(() => {})
  }, [])

  const guardar = async () => {
    setError('')
    setMsg('')
    const montoNum = Number(String(monto).replace(/[^\d.-]/g, '')) || 0
    const diaNum = Math.min(31, Math.max(1, Number(dia) || 1))
    if (activo && montoNum <= 0) {
      setError('Escribe el monto de tu salario para activarlo.')
      return
    }
    setBusy(true)
    try {
      await guardarSalarioPropio({ activo, monto: montoNum, dia: diaNum, cuentaBancoId: cuentaId || undefined, concepto })
      setMsg(activo ? 'Listo: tu salario se consignará solo cada mes.' : 'Salario automático desactivado.')
    } catch {
      setError('No se pudo guardar la configuración.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="glass-card overflow-hidden border-0">
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-500" />
      <CardHeader className="border-b border-white/[0.06] px-4 py-3.5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-white">
          <BadgeDollarSign className="h-4 w-4 text-emerald-300" />
          <span>Mi salario (ingreso automático)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 text-xs sm:p-6">
        <p className="leading-relaxed text-mist-500">
          El piloto automático consigna tu sueldo cada mes sin que hagas nada, y Lucía te avisa al entrar.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Monto mensual (COP)</span>
            <Input
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej: 3500000"
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Día de consignación (1-31)</span>
            <Input
              inputMode="numeric"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Cuenta destino</span>
            <select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
            >
              <option value="">Sin cuenta (solo registra el ingreso)</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-mist-300">Concepto</span>
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="field-dark h-10 text-xs shadow-none"
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-mist-300">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-4 w-4 accent-emerald-400"
          />
          Consignar automáticamente cada mes
        </label>
        {msg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2.5 font-bold text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{msg}</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 font-medium text-red-300">
            <span>{error}</span>
          </div>
        )}
        <Button
          size="sm"
          disabled={busy}
          onClick={guardar}
          className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
        >
          {busy ? 'Guardando...' : 'Guardar mi salario'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function NominaPage() {
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <SalarioPropioCard />
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
    </motion.div>
  )
}
