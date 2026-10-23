import { useEffect, useState } from 'react'
import CrudPage, { type CampoForm } from '@/components/CrudPage'
import {
  actualizarImpuesto,
  crearImpuesto,
  eliminarImpuesto,
  listarImpuestos,
  type Impuesto,
  type PeriodicidadImpuesto,
  type TipoImpuesto,
} from '@/lib/firebase/impuestosRepo'
import { listarCuentasBanco, type CuentaBanco } from '@/lib/firebase/movimientosRepo'

const num = (s: string) => {
  const n = Number(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const TIPOS: { value: TipoImpuesto; label: string }[] = [
  { value: 'predial', label: 'Predial' },
  { value: 'predial_bimestral', label: 'Predial (bimestral)' },
  { value: 'vehicular', label: 'Impuesto vehicular' },
  { value: 'renta', label: 'Renta' },
  { value: 'ica', label: 'ICA' },
  { value: 'otro', label: 'Otro' },
]

const PERIODICIDADES: { value: PeriodicidadImpuesto; label: string }[] = [
  { value: 'anual', label: 'Anual' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'unico', label: 'Pago único' },
]

const VACIO: Record<string, string> = { tipo: 'predial', periodicidad: 'anual', pagado: 'no', autoPagar: 'no' }

const etiquetaTipo = (t: TipoImpuesto) => TIPOS.find((x) => x.value === t)?.label ?? t

export default function ImpuestosPage() {
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])

  useEffect(() => {
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => {})
  }, [])

  const campos: CampoForm[] = [
    { key: 'nombre', label: 'Nombre', required: true, span2: true },
    { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS },
    { key: 'entidad', label: 'Entidad / municipio' },
    { key: 'valor', label: 'Valor (COP)', tipo: 'number', required: true },
    { key: 'periodicidad', label: 'Periodicidad', tipo: 'select', opciones: PERIODICIDADES },
    { key: 'fechaVencimiento', label: 'Fecha de vencimiento', tipo: 'date' },
    {
      key: 'pagado',
      label: 'Pagado',
      tipo: 'select',
      opciones: [
        { value: 'si', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    },
    {
      key: 'autoPagar',
      label: '⚡ Pagar automáticamente al vencer',
      tipo: 'select',
      opciones: [
        { value: 'si', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    },
    {
      key: 'cuentaBancoId',
      label: 'Cuenta para descontar (si activas ⚡ auto)',
      tipo: 'select',
      opciones: cuentas.map((c) => ({
        value: c.id,
        label: `${c.nombre} · $${(Number(c.saldoActual) || 0).toLocaleString('es-CO')}`,
      })),
    },
    { key: 'notas', label: 'Notas', span2: true },
  ]

  return (
    <CrudPage<Impuesto>
      titulo="Impuesto"
      descripcion="Predial, vehicular, renta, ICA y otros. Con vencimiento se agregan al calendario. Si activas ⚡ auto, el piloto lo paga al vencer y descuenta el saldo de la cuenta que elijas."
      campos={campos}
      vacio={VACIO}
      listar={listarImpuestos}
      crear={(d) => crearImpuesto(d)}
      actualizar={(id, d) => actualizarImpuesto(id, d)}
      eliminar={(id) => eliminarImpuesto(id)}
      transformar={(vals) => {
        const doc: Record<string, unknown> = {
          nombre: vals.nombre.trim(),
          tipo: vals.tipo || 'otro',
          valor: num(vals.valor),
          periodicidad: vals.periodicidad || 'anual',
          pagado: vals.pagado === 'si',
          autoPagar: vals.autoPagar === 'si',
        }
        if (vals.entidad?.trim()) doc.entidad = vals.entidad.trim()
        if (vals.fechaVencimiento) doc.fechaVencimiento = vals.fechaVencimiento
        if (vals.cuentaBancoId) doc.cuentaBancoId = vals.cuentaBancoId
        else doc.cuentaBancoId = null
        if (vals.notas?.trim()) doc.notas = vals.notas.trim()
        return doc
      }}
      aForm={(i) => ({
        nombre: i.nombre,
        tipo: i.tipo,
        entidad: i.entidad ?? '',
        valor: String(i.valor ?? ''),
        periodicidad: i.periodicidad,
        fechaVencimiento: i.fechaVencimiento ?? '',
        pagado: i.pagado ? 'si' : 'no',
        autoPagar: i.autoPagar ? 'si' : 'no',
        cuentaBancoId: i.cuentaBancoId ?? '',
        notas: i.notas ?? '',
      })}
      renderItem={(i) => {
        const cuenta = cuentas.find((c) => c.id === i.cuentaBancoId)
        return (
          <div>
            <div className="font-medium">
              {i.nombre} <span className="text-muted-foreground">({etiquetaTipo(i.tipo)})</span>
              {i.autoPagar ? ' — ⚡ auto' : ''}
              {i.pagado ? ' — pagado' : ''}
            </div>
            <div className="text-xs text-muted-foreground">
              ${(i.valor || 0).toLocaleString('es-CO')} / {i.periodicidad}
              {i.fechaVencimiento ? ` · Vence ${i.fechaVencimiento}` : ''}
              {i.entidad ? ` · ${i.entidad}` : ''}
              {i.autoPagar && cuenta ? ` · Descuenta de ${cuenta.nombre}` : ''}
              {i.pagado && i.fechaPago ? ` · Pagado el ${i.fechaPago}` : ''}
            </div>
          </div>
        )
      }}
    />
  )
}
