import { crearMovimiento, listarCuentasBanco, listarTodosLosMovimientos } from './firebase/movimientosRepo'
import { generarEventosRecurrentes, generarMovimientosRecurrentes } from './firebase/recurrentesRepo'
import { listarDeudas, registrarPagoDeuda } from './firebase/deudasRepo'
import { listarImpuestos, registrarPagoImpuesto } from './firebase/impuestosRepo'
import { listarNomina, registrarPagoNomina, totalMensualNomina } from './firebase/nominaRepo'
import { leerPiloto, type PilotoConfig } from './firebase/pilotoRepo'
import { convertirACOP } from './fx'
import { diasEnMes, hoyISO } from './fechas'

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

let enCurso: Promise<ResumenPiloto> | null = null

function fechaEnMes(mes: string, dia: number): string {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = diasEnMes(y, m)
  return `${mes}-${String(Math.min(Math.max(1, Math.round(dia)), ultimo)).padStart(2, '0')}`
}

function diaDisparoEnMes(dia: number | undefined, hoy: Date): number {
  const d = Math.min(31, Math.max(1, Math.round(Number(dia) || 1)))
  const maxMes = diasEnMes(hoy.getFullYear(), hoy.getMonth() + 1)
  return Math.min(d, maxMes)
}

function persistirResumenPiloto(resumen: ResumenPiloto): void {
  if (!resumen.aplicados.length && !resumen.avisos.length) return
  try {
    const previo = leerResumenPiloto()
    if (previo && previo.fecha === resumen.fecha) {
      const aplicados = [...previo.aplicados, ...resumen.aplicados]
      const avisos = Array.from(new Set([...previo.avisos, ...resumen.avisos]))
      const hayNuevo =
        resumen.aplicados.length > 0 || avisos.length > previo.avisos.length
      if (!hayNuevo) return
      localStorage.setItem(
        CLAVE,
        JSON.stringify({
          fecha: resumen.fecha,
          aplicados,
          avisos,
          cambio: true,
          anunciado: false,
        })
      )
      return
    }
    localStorage.setItem(CLAVE, JSON.stringify({ ...resumen, anunciado: false }))
  } catch {
    /* sin persistencia disponible */
  }
}

async function ejecutarPilotoInterno(): Promise<ResumenPiloto> {
  const hoy = new Date()
  const hoyStr = hoyISO()
  const mes = hoyStr.slice(0, 7)
  const aplicados: ItemPiloto[] = []
  const avisos: string[] = []
  let cambio = false

  try {
    const [movsRec, evsRec] = await Promise.all([
      generarMovimientosRecurrentes(mes).catch(() => 0),
      generarEventosRecurrentes(mes).catch(() => 0),
    ])
    if (movsRec > 0 || evsRec > 0) {
      aplicados.push({
        texto: `Se generaron ${movsRec} gasto(s) recurrente(s) y ${evsRec} recordatorio(s) del mes`,
        monto: 0,
      })
      cambio = true
    }
  } catch {
    /* etapa recurrentes aislada */
  }

  const [movsRaw, cuentas] = await Promise.all([
    listarTodosLosMovimientos().catch(() => []),
    listarCuentasBanco().catch(() => []),
  ])
  const movs = movsRaw.filter((m) => m.estado !== 'anulado')
  const cuentaUnicaId = cuentas.length === 1 ? cuentas[0].id : undefined

  // Etapa 1: Salario propio
  try {
    const cfg = await leerPiloto().catch((): PilotoConfig => ({}))
    const sal = cfg.salario
    const monedaSalario = String(sal?.moneda ?? 'COP').trim().toUpperCase() || 'COP'
    if (sal?.activo && (sal.monto || 0) > 0 && hoy.getDate() >= diaDisparoEnMes(sal.dia, hoy)) {
      const ya = movs.some(
        (m) => String(m.fecha).startsWith(mes) && (m as { recurrenteId?: string }).recurrenteId === MARCA_SALARIO
      )
      if (!ya) {
        const cuentaSalarioId = sal.cuentaBancoId || cuentaUnicaId
        if (!cuentaSalarioId) {
          avisos.push(
            'Tu salario automático está listo para consignarse, pero debes elegir la cuenta destino en la pestaña Nómina.'
          )
          cambio = true
        } else {
          try {
            let montoCOP = Math.round(sal.monto)
            let descripcion: string | undefined
            if (monedaSalario !== 'COP') {
              const conv = await convertirACOP(sal.monto, monedaSalario)
              if (!conv) {
                avisos.push(
                  `No pude consignar tu salario automático en ${monedaSalario}: no se pudo consultar la tasa de cambio en este momento.`
                )
                cambio = true
                throw new Error('sin_tasa')
              }
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
                  : `Se te consignó tu salario mensual: ${monedaSalario} ${Number(sal.monto).toLocaleString('es-CO')} (≈ ${COD(montoCOP)})`,
              monto: montoCOP,
            })
            cambio = true
          } catch (err) {
            const msg = err instanceof Error ? err.message : ''
            if (msg.includes('cuenta_no_encontrada')) {
              avisos.push(
                'Tu salario automático no se pudo consignar porque la cuenta configurada ya no existe. Elige una nueva cuenta en Nómina.'
              )
              cambio = true
            }
          }
        }
      }
    }
  } catch {
    /* etapa salario aislada */
  }

  // Etapa 2: Cobro automático de nóminas de empleados / trabajadores
  try {
    const nominas = await listarNomina().catch(() => [])
    for (const n of nominas) {
      if (n.activo === false || n.autoCobrar === false) continue
      const total = totalMensualNomina(n)
      if (total <= 0) continue
      const dia = n.fechaPago?.dia && n.fechaPago.dia >= 1 && n.fechaPago.dia <= 31 ? Math.round(n.fechaPago.dia) : 1
      if (hoy.getDate() < diaDisparoEnMes(dia, hoy)) continue
      const ya = movs.some(
        (m) =>
          m.tipo === 'pago_nomina' && (m as { nominaId?: string }).nominaId === n.id && String(m.fecha).startsWith(mes)
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
  } catch {
    /* etapa nómina aislada */
  }

  // Etapa 3: Cuotas de deudas con auto-descuento
  try {
    const deudas = await listarDeudas()
    for (const d of deudas) {
      if (d.estado !== 'activa' || !d.autoDescontar || !(Number(d.cuotaMensual) > 0)) continue
      const dia =
        d.fechaVencimientoCuota && d.fechaVencimientoCuota >= 1 && d.fechaVencimientoCuota <= 31
          ? Math.round(d.fechaVencimientoCuota)
          : 1
      if (hoy.getDate() < diaDisparoEnMes(dia, hoy)) continue
      const ya = movs.some(
        (m) =>
          m.tipo === 'pago_deuda' && (m as { deudaId?: string }).deudaId === d.id && String(m.fecha).startsWith(mes)
      )
      if (ya) continue
      const cuentaDeudaId = d.cuentaBancoId || cuentaUnicaId
      if (!cuentaDeudaId) {
        avisos.push(
          `La cuota de "${d.nombre}" (${COD(Number(d.cuotaMensual))}) está lista, pero debes asignarle una cuenta en Deudas.`
        )
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
        } else if (r.error === 'cuenta_no_encontrada') {
          avisos.push(
            `No pude descontar la cuota de "${d.nombre}": la cuenta asignada ya no existe. Selecciona otra en Deudas.`
          )
          cambio = true
        }
      } catch {
        /* se reintenta en la próxima apertura */
      }
    }
  } catch {
    /* etapa deudas aislada */
  }

  // Etapa 4: Impuestos con auto-pago
  try {
    const impuestos = await listarImpuestos()
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
        avisos.push(
          `El impuesto "${imp.nombre}" (${COD(valor)}) venció, pero debes asignarle una cuenta en Impuestos para descontarlo.`
        )
        cambio = true
        continue
      }
      try {
        const r = await registrarPagoImpuesto(imp.id, {
          cuentaBancoId: cuentaImpId,
          fuente: 'automatico',
          requerirCuenta: true,
        })
        if (r.ok) {
          aplicados.push({ texto: `Se registró el pago del impuesto "${imp.nombre}" por ${COD(valor)}`, monto: valor })
          cambio = true
        } else if (r.saldoInsuficiente) {
          avisos.push(
            `No pude pagar "${imp.nombre}" (${COD(valor)}): la cuenta "${r.cuentaNombre ?? ''}" solo tiene ${COD(r.saldoDisponible ?? 0)}.`
          )
          cambio = true
        } else if (r.error === 'cuenta_no_encontrada') {
          avisos.push(
            `No pude pagar "${imp.nombre}": la cuenta asignada ya no existe. Elige otra cuenta en Impuestos.`
          )
          cambio = true
        }
      } catch {
        /* se reintenta en la próxima apertura */
      }
    }
  } catch {
    /* etapa impuestos aislada */
  }

  const resumen: ResumenPiloto = { fecha: hoyStr, aplicados, avisos, cambio }
  persistirResumenPiloto(resumen)
  return resumen
}

export function ejecutarPilotoAutomatico(): Promise<ResumenPiloto> {
  if (!enCurso) {
    enCurso = ejecutarPilotoInterno().finally(() => {
      enCurso = null
    })
  }
  return enCurso
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
