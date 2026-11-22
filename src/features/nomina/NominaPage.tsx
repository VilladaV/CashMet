import { useCallback, useEffect, useMemo, useState } from 'react'
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
  totalMensualNomina,
  type Nomina,
} from '@/lib/firebase/nominaRepo'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'
import { guardarSalarioPropio, leerPiloto } from '@/lib/firebase/pilotoRepo'
import { ejecutarPilotoAutomatico } from '@/lib/piloto'
import { invalidarSnapshotFinanciero } from '@/features/chat/snapshot'
import { desformatearCifra } from '@/lib/utils'

const num = (s: string) => {
  const limpio = String(s ?? '').trim()
  if (!limpio) return undefined
  const n = desformatearCifra(limpio)
  return Number.isFinite(n) ? n : undefined
}

const si = (v: string | undefined) => v === 'si'

function etiquetaPrima(n: Nomina): string {
  const ps = n.primaServicios
  if (!ps || ps.aplica === false) return ''
  if (ps.mitadJulio && ps.mitadDiciembre) return ' · Prima jun/dic'
  if (ps.mitadJulio) return ' · Prima junio'
  if (ps.mitadDiciembre) return ' · Prima diciembre'
  return ''
}

function SalarioPropioCard({
  cuentas,
  onCambioCuentas,
}: {
  cuentas: CuentaBanco[]
  onCambioCuentas: () => void | Promise<void>
}) {
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('COP')
  const [dia, setDia] = useState('1')
  const [cuentaId, setCuentaId] = useState('')
  const [concepto, setConcepto] = useState('Salario mensual')
  const [activo, setActivo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    leerPiloto()
      .then((cfg) => {
        const s = cfg.salario
        if (!s) return
        setMonto(s.monto ? String(s.monto) : '')
        setMoneda(String(s.moneda ?? 'COP').toUpperCase() || 'COP')
        setDia(String(s.dia || 1))
        if (s.cuentaBancoId) setCuentaId(s.cuentaBancoId)
        setConcepto(s.concepto ?? 'Salario mensual')
        setActivo(s.activo)
      })
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [])

  const cuentaEfectiva =
    (cuentaId && cuentas.some((c) => c.id === cuentaId) ? cuentaId : cuentas[0]?.id) || ''

  const guardar = async () => {
    setError('')
    setMsg('')
    const montoNum = desformatearCifra(monto)
    const diaRaw = Number(dia.trim())
    if (!Number.isInteger(diaRaw) || diaRaw < 1 || diaRaw > 31) {
      setError('El día de consignación debe ser un número entero entre 1 y 31.')
      return
    }
    if (activo && (!Number.isFinite(montoNum) || montoNum <= 0)) {
      setError('Escribe el monto de tu salario para activarlo.')
      return
    }
    if (!cuentaEfectiva) {
      setError('Debes elegir la cuenta bancaria donde se consignará el dinero.')
      return
    }
    setBusy(true)
    try {
      await guardarSalarioPropio({
        activo,
        monto: Math.max(0, Math.round(montoNum)),
        moneda,
        dia: diaRaw,
        cuentaBancoId: cuentaEfectiva,
        concepto: concepto.trim() || 'Salario mensual',
      })
      await ejecutarPilotoAutomatico().catch(() => {})
      invalidarSnapshotFinanciero()
      await onCambioCuentas()
      setMsg(activo ? 'Listo: tu salario se consignará automáticamente en la cuenta elegida.' : 'Salario automático desactivado.')
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
        {cargando ? (
          <div className="animate-shimmer h-28 rounded-xl" />
        ) : (
          <>
            <p className="leading-relaxed text-mist-500">
              El piloto automático consigna tu sueldo cada mes en la cuenta que elijas, y Lucía te avisa al entrar.
              {moneda !== 'COP'
                ? ` Se guarda en ${moneda} y se convierte a pesos con la tasa del día de la consignación.`
                : ''}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="font-bold text-mist-300">Monto mensual</span>
                <Input
                  cifra
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder={moneda === 'COP' ? 'Ej: 3,500,000' : 'Ej: 180,000'}
                  className="field-dark h-10 text-xs shadow-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-bold text-mist-300">Moneda</span>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
                >
                  {['COP', 'USD', 'EUR', 'GBP', 'MXN', 'BRL', 'PEN'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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
                <span className="font-bold text-mist-300">
                  Cuenta destino <span className="text-red-300">*</span>
                </span>
                <select
                  value={cuentaEfectiva}
                  onChange={(e) => setCuentaId(e.target.value)}
                  className="field-dark h-10 rounded-xl px-2.5 text-xs font-medium outline-none"
                >
                  {cuentas.length === 0 && <option value="">Crea primero una cuenta en Cuentas</option>}
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} (Saldo: ${(Number(c.saldoActual) || 0).toLocaleString('es-CO')})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
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
              <div
                role="alert"
                className="rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 font-medium text-red-300"
              >
                <span>{error}</span>
              </div>
            )}
            <Button
              size="sm"
              disabled={busy || cuentas.length === 0}
              onClick={() => void guardar()}
              className="h-9 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-400 px-4 text-xs font-bold text-[#04241a] hover:brightness-110"
            >
              {busy ? 'Guardando...' : 'Guardar mi salario'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function NominaPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])

  const cargarCuentas = useCallback(async () => {
    try {
      const data = await listarCuentasBanco()
      setCuentas(data)
    } catch {
      /* sin cuentas */
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    void Promise.resolve().then(() => {
      if (!cancelado) void cargarCuentas()
    })
    return () => {
      cancelado = true
    }
  }, [cargarCuentas])

  const campos = useMemo<CampoForm[]>(
    () => [
      { key: 'nombreCompleto', label: 'Nombre completo', required: true },
      { key: 'cargo', label: 'Cargo', required: true },
      { key: 'salarioBaseMensual', label: 'Salario base mensual (COP)', tipo: 'cifra', required: true },
      {
        key: 'adicionalMensual',
        label: 'Adicional ARL, seguridad social y otros (COP)',
        tipo: 'cifra',
      },
      {
        key: 'cuentaBancoId',
        label: 'Cuenta para descontar pago',
        tipo: 'select',
        required: true,
        opciones: cuentas.map((c) => ({
          value: c.id,
          label: `${c.nombre} · $${(Number(c.saldoActual) || 0).toLocaleString('es-CO')}`,
        })),
      },
      { key: 'diaPago', label: 'Día de cobro mensual (1-31)', tipo: 'number', required: true },
      {
        key: 'autoCobrar',
        label: '⚡ Cobrar automáticamente de la cuenta',
        tipo: 'select',
        opciones: [
          { value: 'si', label: 'Sí' },
          { value: 'no', label: 'No' },
        ],
      },
      { key: 'tipoContrato', label: 'Tipo de contrato', tipo: 'select', opciones: TIPOS_CONTRATO.map((t) => ({ value: t, label: t })) },
      { key: 'activo', label: 'Activo', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      { key: 'primaAplica', label: 'Prima de servicios', tipo: 'select', opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      {
        key: 'primaJulio',
        label: 'Prima junio (30 jun)',
        tipo: 'select',
        opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
        disabled: (vals) => vals.primaAplica === 'no',
      },
      {
        key: 'primaDiciembre',
        label: 'Prima diciembre (20 dic)',
        tipo: 'select',
        opciones: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
        disabled: (vals) => vals.primaAplica === 'no',
      },
      { key: 'notas', label: 'Notas', span2: true },
    ],
    [cuentas]
  )

  const vacio = useMemo<Record<string, string>>(
    () => ({
      tipoContrato: 'indefinido',
      activo: 'si',
      autoCobrar: 'si',
      adicionalMensual: '0',
      cuentaBancoId: cuentas[0]?.id ?? '',
      primaAplica: 'si',
      primaJulio: 'si',
      primaDiciembre: 'si',
    }),
    [cuentas]
  )

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <SalarioPropioCard cuentas={cuentas} onCambioCuentas={cargarCuentas} />
      <CrudPage<Nomina>
        titulo="Nómina"
        tituloPlural="Registros de nómina"
        descripcion="Trabajadores que reciben sueldo. Incluye adicional configurable de ARL/seguridad social y descuento automático desde la cuenta elegida el día de pago."
        campos={campos}
        vacio={vacio}
        listar={listarNomina}
        crear={async (d) => {
          const id = await crearNomina(d)
          await ejecutarPilotoAutomatico().catch(() => {})
          invalidarSnapshotFinanciero()
          await cargarCuentas()
          return id
        }}
        actualizar={async (id, d) => {
          await actualizarNomina(id, d)
          await ejecutarPilotoAutomatico().catch(() => {})
          invalidarSnapshotFinanciero()
          await cargarCuentas()
        }}
        eliminar={async (id) => {
          await eliminarNomina(id)
          invalidarSnapshotFinanciero()
        }}
        transformar={(vals) => {
          const primaAplica = si(vals.primaAplica)
          const diaRaw = Number(String(vals.diaPago ?? '').trim())
          if (!Number.isInteger(diaRaw) || diaRaw < 1 || diaRaw > 31) {
            throw new Error('El día de cobro mensual debe ser un número entero entre 1 y 31.')
          }
          const salarioBase = num(vals.salarioBaseMensual) ?? 0
          const adicional = num(vals.adicionalMensual) ?? 0
          if (salarioBase < 0 || adicional < 0) {
            throw new Error('El salario y el adicional deben ser valores positivos.')
          }
          return {
            nombreCompleto: vals.nombreCompleto.trim(),
            cargo: vals.cargo.trim(),
            salarioBaseMensual: Math.round(salarioBase),
            adicionalMensual: Math.round(adicional),
            cuentaBancoId: vals.cuentaBancoId,
            autoCobrar: vals.autoCobrar !== 'no',
            tipoContrato: vals.tipoContrato || 'indefinido',
            activo: si(vals.activo),
            primaServicios: {
              aplica: primaAplica,
              mitadJulio: primaAplica && si(vals.primaJulio),
              mitadDiciembre: primaAplica && si(vals.primaDiciembre),
            },
            fechaPago: { dia: diaRaw, tipo: 'mensual' },
            notas: vals.notas?.trim() || null,
          }
        }}
        aForm={(n) => ({
          nombreCompleto: n.nombreCompleto,
          cargo: n.cargo,
          salarioBaseMensual: String(n.salarioBaseMensual ?? ''),
          adicionalMensual: String(n.adicionalMensual ?? 0),
          cuentaBancoId: n.cuentaBancoId || cuentas[0]?.id || '',
          diaPago: n.fechaPago?.dia != null ? String(n.fechaPago.dia) : '',
          autoCobrar: n.autoCobrar === false ? 'no' : 'si',
          tipoContrato: n.tipoContrato,
          activo: n.activo === false ? 'no' : 'si',
          primaAplica: n.primaServicios?.aplica === false ? 'no' : 'si',
          primaJulio: n.primaServicios?.mitadJulio === false ? 'no' : 'si',
          primaDiciembre: n.primaServicios?.mitadDiciembre === false ? 'no' : 'si',
          notas: n.notas ?? '',
        })}
        renderItem={(n) => {
          const base = Number(n.salarioBaseMensual) || 0
          const adicional = Number(n.adicionalMensual) || 0
          const total = totalMensualNomina(n)
          const cuenta = cuentas.find((c) => c.id === n.cuentaBancoId)
          return (
            <div>
              <div className="font-medium">
                {n.nombreCompleto} <span className="text-muted-foreground">({n.cargo})</span>
                {n.autoCobrar !== false ? ' · ⚡ auto' : ''}
                {n.activo === false ? ' — inactivo' : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                Total a cobrar: <b className="text-emerald-300">${total.toLocaleString('es-CO')}</b>{' '}
                (Base: ${base.toLocaleString('es-CO')}
                {adicional > 0 ? ` + ARL/Adicional: $${adicional.toLocaleString('es-CO')}` : ''})
                {n.fechaPago?.dia ? ` · Día ${n.fechaPago.dia}` : ''}
                {cuenta ? ` · Cuenta: ${cuenta.nombre}` : ' · ⚠️ Elige cuenta al editar'}
                {etiquetaPrima(n)}
              </div>
            </div>
          )
        }}
      />
    </motion.div>
  )
}
