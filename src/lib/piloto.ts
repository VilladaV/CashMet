import { crearMovimiento, listarMovimientos } from './firebase/movimientosRepo'
import { generarEventosRecurrentes, generarMovimientosRecurrentes } from './firebase/recurrentesRepo'
import { listarDeudas, registrarPagoDeuda } from './firebase/deudasRepo'
import { leerPiloto, type PilotoConfig } from './firebase/pilotoRepo'
import { convertirACOP } from './fx'

export interface ItemPiloto {
  texto: string
  monto: number
}

export interface ResumenPiloto {
  fecha: string
  aplicados: ItemPiloto[]
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

  const movs = await listarMovimientos(500)

  const cfg = await leerPiloto().catch((): PilotoConfig => ({}))
  const sal = cfg.salario
  const monedaSalario = String(sal?.moneda ?? 'COP').trim().toUpperCase() || 'COP'
  if (sal?.activo && (sal.monto || 0) > 0 && hoy.getDate() >= Math.min(31, Math.max(1, sal.dia || 1))) {
    const ya = movs.some(
      (m) => String(m.fecha).startsWith(mes) && (m as { recurrenteId?: string }).recurrenteId === MARCA_SALARIO
    )
    if (!ya) {
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
          cuentaBancoId: sal.cuentaBancoId,
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

  const deudas = await listarDeudas()
  for (const d of deudas) {
    if (d.estado !== 'activa' || !d.autoDescontar || !(Number(d.cuotaMensual) > 0)) continue
    const dia = d.fechaVencimientoCuota && d.fechaVencimientoCuota >= 1 && d.fechaVencimientoCuota <= 31 ? d.fechaVencimientoCuota : 1
    if (hoy.getDate() < dia) continue
    const ya = movs.some(
      (m) => m.tipo === 'pago_deuda' && (m as { deudaId?: string }).deudaId === d.id && String(m.fecha).startsWith(mes)
    )
    if (ya) continue
    try {
      await registrarPagoDeuda(d.id, Number(d.cuotaMensual), fechaEnMes(mes, dia), undefined, 'automatico')
      aplicados.push({ texto: `Se descontó la cuota de "${d.nombre}" por ${COD(Number(d.cuotaMensual))}`, monto: Number(d.cuotaMensual) })
      cambio = true
    } catch {
      /* se reintenta en la próxima apertura */
    }
  }

  const resumen: ResumenPiloto = { fecha: hoyISO(), aplicados, cambio }
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
