import { listarCuentasBanco, listarTodosLosMovimientos } from '@/lib/firebase/movimientosRepo'
import { listarDeudas } from '@/lib/firebase/deudasRepo'
import { listarRecurrentes } from '@/lib/firebase/recurrentesRepo'
import { listarImpuestos } from '@/lib/firebase/impuestosRepo'
import { listarVehiculos } from '@/lib/firebase/vehiculosRepo'
import { listarPropiedades } from '@/lib/firebase/propiedadesRepo'
import { listarNomina } from '@/lib/firebase/nominaRepo'
import { listarEventos } from '@/lib/firebase/calendarioRepo'
import { lineaTasasContexto } from '@/lib/fx'

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

const FACTOR_MENSUAL: Record<string, number> = {
  mensual: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
}

let cache: { texto: string; ts: number } | null = null
const VIGENCIA_MS = 20000

export function invalidarSnapshotFinanciero() {
  cache = null
}

function mesActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function val<T>(r: PromiseSettledResult<T>): T | undefined {
  return r.status === 'fulfilled' ? r.value : undefined
}

export async function construirSnapshotFinanciero(): Promise<string> {
  if (cache && Date.now() - cache.ts < VIGENCIA_MS) return cache.texto

  const [cuentasR, movsR, deudasR, recR, impR, vehR, propR, nomR, evR] = await Promise.allSettled([
    listarCuentasBanco(),
    listarTodosLosMovimientos(400),
    listarDeudas(),
    listarRecurrentes(),
    listarImpuestos(),
    listarVehiculos(),
    listarPropiedades(),
    listarNomina(),
    listarEventos(80),
  ])

  const cuentas = val(cuentasR) ?? []
  const movs = val(movsR) ?? []
  const deudas = (val(deudasR) ?? []).filter((d) => d.estado === 'activa')
  const recurrentes = (val(recR) ?? []).filter((r) => r.activo !== false)
  const impuestos = (val(impR) ?? []).filter((i) => !i.pagado)
  const vehiculos = val(vehR) ?? []
  const propiedades = val(propR) ?? []
  const nomina = (val(nomR) ?? []).filter((n) => n.activo !== false)
  const eventos = (val(evR) ?? []).filter((e) => String(e.fechaInicio) >= hoyISO())

  const lineas: string[] = [`Contexto financiero actual (datos en vivo de su base, ${hoyISO()}):`]

  const tasasLinea = await lineaTasasContexto()
  if (tasasLinea) lineas.push('', tasasLinea)

  const totalCuentas = cuentas.reduce((s, c) => s + (Number(c.saldoActual) || 0), 0)
  lineas.push('', `DINERO EN CUENTAS: ${COD(totalCuentas)} (${cuentas.length} cuentas)`)
  for (const c of cuentas.slice(0, 8)) {
    lineas.push(`  · ${c.nombre}: ${COD(Number(c.saldoActual) || 0)}`)
  }

  const mes = mesActual()
  const delMes = movs.filter((m) => String(m.fecha).slice(0, 7) === mes)
  const ingresosMes = delMes
    .filter((m) => m.tipo === 'ingreso')
    .reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const egresosMes = delMes
    .filter((m) => m.tipo !== 'ingreso' && m.tipo !== 'transferencia')
    .reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const porCat = new Map<string, number>()
  for (const m of delMes) {
    if (m.tipo === 'ingreso' || m.tipo === 'transferencia') continue
    const cat = m.categoria || 'Otros'
    porCat.set(cat, (porCat.get(cat) || 0) + (Number(m.monto) || 0))
  }
  const topCat = [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  lineas.push('', `MES ACTUAL (${mes})`)
  lineas.push(`- Ingresos: ${COD(ingresosMes)}`)
  lineas.push(`- Egresos: ${COD(egresosMes)}`)
  lineas.push(`- Balance del mes: ${COD(ingresosMes - egresosMes)}`)
  if (topCat.length) {
    lineas.push(`- Mayores egresos por categoría: ${topCat.map(([c, v]) => `${c} ${COD(v)}`).join('; ')}`)
  }

  const ultimos = [...movs]
    .sort((a, b) => (String(b.fecha) + (b.creado ?? 0)).localeCompare(String(a.fecha) + (a.creado ?? 0)))
    .slice(0, 6)
  if (ultimos.length) {
    lineas.push('', 'ÚLTIMOS MOVIMIENTOS')
    for (const m of ultimos) {
      lineas.push(`- ${m.fecha} ${m.tipo} ${COD(Number(m.monto) || 0)} — ${m.concepto} (${m.categoria})`)
    }
  }

  if (deudas.length) {
    const totalDeuda = deudas.reduce((s, d) => s + (Number(d.saldoPendiente) || 0), 0)
    const cuotaTotal = deudas.reduce((s, d) => s + (Number(d.cuotaMensual) || 0), 0)
    const proxima = [...deudas]
      .filter((d) => d.fechaVencimientoCuota)
      .sort((a, b) => (a.fechaVencimientoCuota ?? 99) - (b.fechaVencimientoCuota ?? 99))[0]
    lineas.push('', `DEUDAS ACTIVAS (${deudas.length})`)
    lineas.push(`- Saldo pendiente total: ${COD(totalDeuda)}`)
    if (cuotaTotal > 0) lineas.push(`- Cuota mensual total: ${COD(cuotaTotal)}`)
    if (proxima) lineas.push(`- Próxima cuota: ${proxima.nombre} (día ${proxima.fechaVencimientoCuota})`)
    for (const d of deudas.slice(0, 6)) {
      lineas.push(`  · ${d.nombre} (${d.tipo}): saldo ${COD(Number(d.saldoPendiente) || 0)}`)
    }
  }

  if (recurrentes.length) {
    const mensual = recurrentes.reduce(
      (s, r) => s + (Number(r.valor) || 0) * (FACTOR_MENSUAL[r.periodicidad] ?? 1),
      0,
    )
    lineas.push('', `GASTOS RECURRENTES ACTIVOS (${recurrentes.length})`)
    lineas.push(`- Equivalente mensual aproximado: ${COD(mensual)}`)
    for (const r of recurrentes.slice(0, 6)) {
      lineas.push(`  · ${r.concepto} ${COD(Number(r.valor) || 0)} (${r.periodicidad})`)
    }
  }

  if (impuestos.length) {
    const totalImp = impuestos.reduce((s, i) => s + (Number(i.valor) || 0), 0)
    const prox = [...impuestos]
      .filter((i) => i.fechaVencimiento)
      .sort((a, b) => String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento)))[0]
    lineas.push('', `IMPUESTOS PENDIENTES (${impuestos.length})`)
    lineas.push(`- Valor total pendiente: ${COD(totalImp)}`)
    if (prox) lineas.push(`- Próximo vencimiento: ${prox.nombre} el ${prox.fechaVencimiento}`)
  }

  if (vehiculos.length || propiedades.length) {
    lineas.push('', 'PATRIMONIO')
    if (vehiculos.length) {
      const valorVeh = vehiculos.reduce((s, v) => s + (Number(v.valorComercial) || 0), 0)
      lineas.push(`- Vehículos: ${vehiculos.length}${valorVeh ? ` (valor comercial ~${COD(valorVeh)})` : ''}`)
      for (const v of vehiculos.slice(0, 4)) {
        lineas.push(`  · ${v.marca} ${v.linea} ${v.modelo}${v.placa ? ` (${v.placa})` : ''}`)
      }
    }
    if (propiedades.length) {
      const valorProp = propiedades.reduce(
        (s, p) => s + (Number(p.valorPatrimonial) || Number(p.valorComercialEstimado) || 0),
        0,
      )
      lineas.push(`- Propiedades: ${propiedades.length}${valorProp ? ` (valor ~${COD(valorProp)})` : ''}`)
      for (const p of propiedades.slice(0, 4)) {
        lineas.push(`  · ${p.nombre} (${p.tipo})`)
      }
    }
  }

  if (nomina.length) {
    const base = nomina.reduce((s, n) => s + (Number(n.salarioBaseMensual) || 0), 0)
    lineas.push('', `NÓMINA (${nomina.length} empleados activos)`)
    lineas.push(`- Salario base mensual total: ${COD(base)}`)
  }

  if (eventos.length) {
    const proxEv = [...eventos]
      .sort((a, b) => String(a.fechaInicio).localeCompare(String(b.fechaInicio)))
      .slice(0, 6)
    lineas.push('', 'PRÓXIMOS VENCIMIENTOS / EVENTOS')
    for (const e of proxEv) lineas.push(`- ${e.fechaInicio}: ${e.titulo}`)
  }

  const texto = lineas.join('\n')
  cache = { texto, ts: Date.now() }
  return texto
}
