import { crearMovimiento, listarCuentasBanco, listarTodosLosMovimientos } from './firebase/movimientosRepo'
import { generarEventosRecurrentes, generarMovimientosRecurrentes } from './firebase/recurrentesRepo'
import { listarDeudas, registrarPagoDeuda } from './firebase/deudasRepo'
import { listarImpuestos, registrarPagoImpuesto } from './firebase/impuestosRepo'
import { listarNomina, registrarPagoNomina, totalMensualNomina } from './firebase/nominaRepo'
import { leerPiloto, type PilotoConfig } from './firebase/pilotoRepo'
import { convertirACOP } from './fx'

export interface ItemPiloto {
  texto: string
  monto: number
}

export interface ResumenPiloto {
  fecha: string
  aplicados: ItemPiloto[]
  avisos: string[]
  cambio: boolean
}

const CLAVE = 'cashmet_piloto_v1'
const MARCA_SALARIO = 'salario_propio'

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')} COP`

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaEnMes(mes: string, dia: number): string {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${mes}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, '0')}`
}

export async function ejecutarPilotoAutomatico(): Promise<ResumenPiloto> {
  const hoy = new Date()
  const mes = hoyISO().slice(0, 7)
  const aplicados: ItemPiloto[] = []
  const avisos: string[] = []
  let cambio = false

  const movsRec = await generarMovimientosRecurrentes(mes)
  const evsRec = await generarEventosRecurrentes(mes)
  if (movsRec > 0 || evsRec > 0) {
    aplicados.push({
      texto: `Se generaron ${movsRec} gasto(s) recurrente(s) y ${evsRec} recordatorio(s) del mes`,
      monto: 0,
    })
    cambio = true
  }

  const [movs, cuentas] = await Promise.all([
    listarTodosLosMovimientos(),
    listarCuentasBanco().catch(() => []),
  ])
  const cuentaUnicaId = cuentas.length === 1 ? cuentas[0].id : undefined

  const cfg = await leerPiloto().catch((): PilotoConfig => ({}))
  const sal = cfg.salario
  const monedaSalario = String(sal?.moneda ?? 'COP').trim().toUpperCase() || 'COP'
  if (sal?.activo && (sal.monto || 0) > 0 && hoy.getDate() >= Math.min(31, Math.max(1, sal.dia || 1))) {
    const ya = movs.some(
      (m) => String(m.fecha).startsWith(mes) && (m as { recurrenteId?: string }).recurrenteId === MARCA_SALARIO
    )
    if (!ya) {
      const cuentaSalarioId = sal.cuentaBancoId || cuentaUnicaId
      if (!cuentaSalarioId) {
        avisos.push('Tu salario automático está listo para consignarse, pero debes elegir la cuenta destino en la pestaña Nómina.')
        cambio = true
      } else {
        try {
          let montoCOP = Math.round(sal.monto)
          let descripcion: string | undefined
          if (monedaSalario !== 'COP') {
            const conv = await convertirACOP(sal.monto, monedaSalario)
            if (!conv) throw new Error('sin tasa disponible')
            montoCOP = conv.montoCOP
            descripcion =
              `${monedaSalario} ${Number(sal.monto).toLocaleString('es-CO')} · ` +
              `tasa 1 ${monedaSalario} = $${Math.round(conv.tasa).toLocaleString('es-CO')}${conv.fecha ? ` del ${conv.fecha}` : ''}`
          }
          await crearMovimiento({
            fecha: fechaEnMes(mes, sal.dia),
            tipo: 'ingreso',
            concepto: sal.concepto?.trim() || 'Salario mensual',
            monto: montoCOP,
            categoria: 'Salario',
            cuentaBancoId: cuentaSalarioId,
            recurrenteId: MARCA_SALARIO,
            fuente: 'automatico',
            descripcion,
          })
          aplicados.push({
            texto:
              monedaSalario === 'COP'
                ? `Se te consignó tu salario mensual por ${COD(sal.monto)}`
                : `Se te consignó tu salario mensual: ${monedaSalario} ${Number(sal.monto).toLocaleString('es-CO')} (≈ ${COD(montoCOP)} COP)`,
            monto: montoCOP,
          })
          cambio = true
        } catch {
          /* sin tasa o sin red: se reintenta en la próxima apertura */
        }
      }
    }
  }

  // Cobro automático de nóminas de empleados / trabajadores
  const nominas = await listarNomina().catch(() => [])
  for (const n of nominas) {
    if (n.activo === false || n.autoCobrar === false) continue
    const total = totalMensualNomina(n)
    if (total <= 0) continue
    const dia = n.fechaPago?.dia && n.fechaPago.dia >= 1 && n.fechaPago.dia <= 31 ? n.fechaPago.dia : 1
    if (hoy.getDate() < dia) continue
    const ya = movs.some(
      (m) => m.tipo === 'pago_nomina' && (m as { nominaId?: string }).nominaId === n.id && String(m.fecha).startsWith(mes)
    )
    if (ya) continue
    const cuentaNominaId = n.cuentaBancoId || cuentaUnicaId
    try {
      const r = await registrarPagoNomina(n.id, {
        cuentaBancoId: cuentaNominaId,
        fecha: fechaEnMes(mes, dia),
        fuente: 'automatico',
      })
      if (r.ok) {
        const extraArl =
          (r.adicional ?? 0) > 0
            ? ` (salario ${COD(r.base ?? 0)} + ARL/adicional ${COD(r.adicional ?? 0)})`
            : ''
        aplicados.push({
          texto: `Se cobró la nómina de "${n.nombreCompleto}" por ${COD(r.monto ?? total)}${extraArl}${r.cuentaNombre ? ` desde ${r.cuentaNombre}` : ''}`,
          monto: r.monto ?? total,
        })
        cambio = true
      } else if (r.sinCuenta) {
        avisos.push(
          `La nómina de "${n.nombreCompleto}" (${COD(total)}, día ${dia}) venció, pero debes elegir la cuenta a descontar en la pestaña Nómina.`
        )
        cambio = true
      } else if (r.saldoInsuficiente) {
        avisos.push(
          `No pude cobrar la nómina de "${n.nombreCompleto}" (${COD(total)}): la cuenta "${r.cuentaNombre ?? ''}" solo tiene ${COD(r.saldoDisponible ?? 0)}.`
        )
        cambio = true
      }
    } catch {
      /* se reintenta en la próxima apertura */
    }
  }

  const deudas = await listarDeudas()
  for (const d of deudas) {
    if (d.estado !== 'activa' || !d.autoDescontar || !(Number(d.cuotaMensual) > 0)) continue
    const dia = d.fechaVencimientoCuota && d.fechaVencimientoCuota >= 1 && d.fechaVencimientoCuota <= 31 ? d.fechaVencimientoCuota : 1
    if (hoy.getDate() < dia) continue
    const ya = movs.some(
      (m) => m.tipo === 'pago_deuda' && (m as { deudaId?: string }).deudaId === d.id && String(m.fecha).startsWith(mes)
    )
    if (ya) continue
    const cuentaDeudaId = d.cuentaBancoId || cuentaUnicaId
    if (!cuentaDeudaId) {
      avisos.push(`La cuota de "${d.nombre}" (${COD(Number(d.cuotaMensual))}) está lista, pero debes asignarle una cuenta en Deudas.`)
      cambio = true
      continue
    }
    try {
      const r = await registrarPagoDeuda(d.id, Number(d.cuotaMensual), fechaEnMes(mes, dia), cuentaDeudaId, 'automatico')
      if (r.ok) {
        aplicados.push({
          texto: `Se descontó la cuota de "${d.nombre}" por ${COD(Number(d.cuotaMensual))}${r.cerrada ? ' (deuda pagada)' : ''}`,
          monto: Number(d.cuotaMensual),
        })
        cambio = true
      } else if (r.error === 'saldo_insuficiente') {
        avisos.push(
          `No pude descontar la cuota de "${d.nombre}" (${COD(Number(d.cuotaMensual))}): la cuenta solo tiene ${COD(r.saldoDisponible ?? 0)}.`
        )
        cambio = true
      } else if (r.error === 'monto_excede_saldo') {
        avisos.push(
          `La cuota de "${d.nombre}" (${COD(Number(d.cuotaMensual))}) supera el saldo pendiente (${COD(r.saldoPendiente ?? 0)}). Ajusta la cuota o registra el pago final a mano.`
        )
        cambio = true
      }
    } catch {
      /* se reintenta en la próxima apertura */
    }
  }

  const impuestos = await listarImpuestos()
  const hoyStr = hoyISO()
  for (const imp of impuestos) {
    if (!imp.autoPagar || imp.pagado) continue
    const valor = Number(imp.valor) || 0
    if (valor <= 0) continue
    const vence = String(imp.fechaVencimiento ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || vence > hoyStr) continue
    const ya = movs.some((m) => (m as { impuestoId?: string }).impuestoId === imp.id)
    if (ya) continue
    const cuentaImpId = imp.cuentaBancoId || cuentaUnicaId
    if (!cuentaImpId) {
      avisos.push(`El impuesto "${imp.nombre}" (${COD(valor)}) venció, pero debes asignarle una cuenta en Impuestos para descontarlo.`)
      cambio = true
      continue
    }
    try {
      const r = await registrarPagoImpuesto(imp.id, { cuentaBancoId: cuentaImpId, fuente: 'automatico' })
      if (r.ok) {
        aplicados.push({ texto: `Se registró el pago del impuesto "${imp.nombre}" por ${COD(valor)}`, monto: valor })
        cambio = true
      } else if (r.saldoInsuficiente) {
        avisos.push(
          `No pude pagar "${imp.nombre}" (${COD(valor)}): la cuenta "${r.cuentaNombre ?? ''}" solo tiene ${COD(r.saldoDisponible ?? 0)}.`
        )
        cambio = true
      }
    } catch {
      /* se reintenta en la próxima apertura */
    }
  }

  const resumen: ResumenPiloto = { fecha: hoyISO(), aplicados, avisos, cambio }
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...resumen, anunciado: false }))
  } catch {
    /* sin persistencia disponible */
  }
  return resumen
}

export function leerResumenPiloto(): (ResumenPiloto & { anunciado: boolean }) | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const r = JSON.parse(crudo) as ResumenPiloto & { anunciado: boolean }
    if (!r || typeof r.fecha !== 'string' || !Array.isArray(r.aplicados)) return null
    return r
  } catch {
    return null
  }
}

export function marcarPilotoAnunciado(): void {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return
    const r = JSON.parse(crudo) as Record<string, unknown>
    localStorage.setItem(CLAVE, JSON.stringify({ ...r, anunciado: true }))
  } catch {
    /* sin persistencia disponible */
  }
}
