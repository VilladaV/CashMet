import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { estimadosVehiculoCO, NOMBRE_IA, type AccionInterpretada } from './engine'
import { interpretar, geminiDisponible } from './interpretar'
import { construirSnapshotFinanciero, invalidarSnapshotFinanciero } from './snapshot'
import ConfirmacionCard, { type MovimientoConfirmado } from './ConfirmacionCard'
import TextoEnriquecido from './TextoEnriquecido'
import type { BorradorMovimiento } from '@/ai/parser/nl'
import {
  crearMovimiento,
  listarCuentasBanco,
  listarMovimientos,
  listarTodosLosMovimientos,
  obtenerResumenSaldos,
  type CuentaBanco,
} from '@/lib/firebase/movimientosRepo'
import { listarDeudas, registrarPagoDeuda } from '@/lib/firebase/deudasRepo'
import { crearVehiculo } from '@/lib/firebase/vehiculosRepo'
import { crearRecurrente } from '@/lib/firebase/recurrentesRepo'
import { listarNomina } from '@/lib/firebase/nominaRepo'
import { crearEvento, construirEventos, guardarEventos } from '@/lib/firebase/calendarioRepo'
import { lineaTasasContexto } from '@/lib/fx'
import { CashMetEmblem } from '@/components/brand/CashMetLogo'
import { Send, CheckCircle2, AlertCircle, User, Trash2, ArrowLeftRight, BarChart3 } from 'lucide-react'

interface Msg {
  id: number
  rol: 'user' | 'ia'
  texto: string
  borrador?: BorradorMovimiento
  estado?: 'pendiente' | 'guardado' | 'cancelado'
  timestamp?: string
}

const COD = (n: number) => `$${n.toLocaleString('es-CO')} COP`

type CatRecurrente = 'hogar' | 'transporte' | 'salud' | 'educacion' | 'servicios' | 'otro'
type PerRecurrente = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

const normalizarCategoria = (c: string): CatRecurrente => {
  const t = c.toLowerCase()
  if (t.includes('hogar') || t.includes('casa') || t.includes('mercado')) return 'hogar'
  if (t.includes('transp') || t.includes('gasolina') || t.includes('carro') || t.includes('moto')) return 'transporte'
  if (t.includes('salud') || t.includes('medic')) return 'salud'
  if (t.includes('educ') || t.includes('estudio') || t.includes('coleg')) return 'educacion'
  if (t.includes('servic') || t.includes('luz') || t.includes('agua') || t.includes('internet') || t.includes('gas'))
    return 'servicios'
  return 'otro'
}

const normalizarPeriodicidad = (p: string): PerRecurrente => {
  const t = p.toLowerCase()
  if (t.startsWith('bim')) return 'bimestral'
  if (t.startsWith('tri')) return 'trimestral'
  if (t.startsWith('sem')) return 'semestral'
  if (t.startsWith('an') || t.includes('año')) return 'anual'
  return 'mensual'
}

interface PulsoMes {
  etiqueta: string
  ingresos: number
  gastos: number
}

const SALUDO = `👋 ¡Hola! Soy ${NOMBRE_IA}, tu contadora. Cuéntame cómo te fue con la plata y yo te la organizo. 💛`

const CLAVE_CHAT = 'cashmet_chat_v1'

const saludoInicial = (): Msg => ({ id: 0, rol: 'ia', texto: SALUDO, timestamp: 'Ahora' })

const cargarHistorial = (): Msg[] => {
  try {
    const raw = localStorage.getItem(CLAVE_CHAT)
    if (raw) {
      const parsed = JSON.parse(raw) as Msg[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((m) => (m.estado === 'pendiente' ? { ...m, estado: 'cancelado' as const } : m))
      }
    }
  } catch {
    /* historial corrupto: se reinicia */
  }
  return [saludoInicial()]
}

export default function ChatPage() {
  const [msg, setMsg] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>(cargarHistorial)
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [guardandoId, setGuardandoId] = useState<number | null>(null)
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState('')
  const [tasas, setTasas] = useState<string[]>([])
  const [pulso, setPulso] = useState<PulsoMes[]>([])

  const cargarPulso = useCallback(async () => {
    try {
      const todos = await listarTodosLosMovimientos(400)
      const ahora = new Date()
      const meses: PulsoMes[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
        const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        let ingresos = 0
        let gastos = 0
        for (const m of todos) {
          if (String(m.fecha).slice(0, 7) !== clave) continue
          const v = Number(m.monto) || 0
          if (m.tipo === 'ingreso') ingresos += v
          else if (m.tipo !== 'transferencia') gastos += v
        }
        meses.push({
          etiqueta: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
          ingresos,
          gastos,
        })
      }
      setPulso(meses)
    } catch {
      /* sin pulso disponible */
    }
  }, [])
  const idRef = useRef(1)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    idRef.current = msgs.reduce((mx, m) => Math.max(mx, m.id), 0) + 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_CHAT, JSON.stringify(msgs.slice(-60)))
    } catch {
      // almacenamiento no disponible
    }
  }, [msgs])

  const limpiarChat = () => {
    idRef.current = 1
    setMsgs([saludoInicial()])
    setError('')
  }

  useEffect(() => {
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => setError('No se pudieron cargar las cuentas bancarias.'))
    lineaTasasContexto()
      .then((t) => {
        if (t) setTasas(t.split('\n').filter((l) => l.startsWith('- ')))
      })
      .catch(() => {})
    void cargarPulso()
  }, [cargarPulso])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, pensando])

  const push = (m: Omit<Msg, 'id'>) => {
    const id = idRef.current++
    const tiempo = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    setMsgs((prev) => [...prev, { ...m, id, timestamp: tiempo }])
    return id
  }

  const ejecutarAccion = async (op: AccionInterpretada) => {
    const p = op.params ?? {}

    if (op.nombre === 'consulta_saldos') {
      try {
        const { cuentas: cs, total } = await obtenerResumenSaldos()
        if (!cs.length) {
          push({
            rol: 'ia',
            texto: 'Todavía no tienes cuentas registradas. Ve a la pestaña "Cuentas" y agrega la primera, así empiezo a llevarte las cuentas. 💛',
          })
        } else {
          const detalle = cs.map((c) => `• ${c.nombre}: ${COD(Number(c.saldoActual) || 0)}`).join('\n')
          push({ rol: 'ia', texto: `💰 Tu saldo total es ${COD(total)}.\n\nDesglose por cuenta:\n${detalle}` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude consultar los saldos en este momento.' })
      }
      return
    }

    if (op.nombre === 'busqueda_movimientos') {
      try {
        const movs = await listarMovimientos(8)
        if (!movs.length) {
          push({ rol: 'ia', texto: 'Todavía no hay movimientos registrados.' })
        } else {
          const detalle = movs
            .map((m) => `• ${m.fecha} — ${m.concepto}: ${COD(Number(m.monto) || 0)} (${m.tipo})`)
            .join('\n')
          push({ rol: 'ia', texto: `📋 Tus últimos ${movs.length} movimientos:\n\n${detalle}` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude recuperar los movimientos.' })
      }
      return
    }

    if (op.nombre === 'generar_calendario') {
      try {
        const eventos = await construirEventos(12)
        if (!eventos.length) {
          push({
            rol: 'ia',
            texto: 'No tengo vehículos, nómina o deudas para proyectar. Agrégalos en sus pestañas y con gusto te armo el calendario.',
          })
        } else {
          const n = await guardarEventos(eventos)
          invalidarSnapshotFinanciero()
          push({ rol: 'ia', texto: `📅 ¡Listo! Generé y guardé ${n} eventos en el calendario para los próximos 12 meses.` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude generar los eventos del calendario.' })
      }
      return
    }

    if (op.nombre === 'resumen_mes') {
      try {
        const mes = String(p.mes ?? '')
        const todos = await listarTodosLosMovimientos(500)
        const delMes = todos.filter((m) => String(m.fecha).startsWith(mes))
        if (!delMes.length) {
          push({ rol: 'ia', texto: `No veo movimientos en el periodo ${mes}.` })
        } else {
          let ingresos = 0
          let gastos = 0
          const porCat = new Map<string, number>()
          for (const m of delMes) {
            const val = Number(m.monto) || 0
            if (m.tipo === 'ingreso') ingresos += val
            else gastos += val
            porCat.set(m.categoria || 'Otros', (porCat.get(m.categoria || 'Otros') || 0) + val)
          }
          const top = [...porCat.entries()]
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([c, v]) => `• ${c}: ${COD(v)}`)
            .join('\n')
          const balance = ingresos - gastos
          const opinion =
            balance >= 0
              ? 'Vas en terreno positivo, ¡bien ahí! 💪'
              : 'Ojo, este mes gastaste más de lo que entró; vale la pena revisarlo con calma.'
          push({
            rol: 'ia',
            texto:
              `📊 Resumen financiero (${mes}):\n\n` +
              `• Ingresos: ${COD(ingresos)}\n` +
              `• Gastos: ${COD(gastos)}\n` +
              `• Balance: ${COD(balance)}\n\n` +
              (top ? `Tus mayores gastos:\n${top}\n\n` : '') +
              opinion,
          })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude calcular el resumen del mes.' })
      }
      return
    }

    if (op.nombre === 'pago_deuda') {
      const hoyString = new Date().toISOString().slice(0, 10)
      const monto = Number(p.monto) || 0
      const fecha = String(p.fecha ?? hoyString).slice(0, 10) || hoyString
      const nombreBuscado = String(p.nombre ?? p.deudaNombre ?? '').toLowerCase()
      try {
        const deudas = (await listarDeudas()).filter((d) => d.estado !== 'pagada')
        const candidatas = nombreBuscado
          ? deudas.filter((d) => d.nombre.toLowerCase().includes(nombreBuscado) || nombreBuscado.includes(d.nombre.toLowerCase()))
          : deudas
        const deuda = candidatas.length === 1 ? candidatas[0] : deudas.length === 1 ? deudas[0] : undefined
        if (!deuda) {
          push({
            rol: 'ia',
            texto:
              deudas.length === 0
                ? 'No tienes deudas activas registradas. Ve a la pestaña "Deudas" y las registramos.'
                : `Tienes varias deudas activas:\n${deudas.map((d) => `• ${d.nombre} (saldo ${COD(d.saldoPendiente || 0)})`).join('\n')}\n\n¿A cuál le abono? Ej: "pagué 100.000 de ${deudas[0].nombre}".`,
          })
          return
        }
        await registrarPagoDeuda(deuda.id, monto, fecha)
        invalidarSnapshotFinanciero()
        push({
          rol: 'ia',
          texto: `✅ Listo, registré el pago de ${COD(monto)} a "${deuda.nombre}". Te queda un saldo de ${COD(Math.max(0, (deuda.saldoPendiente || 0) - monto))}.`,
        })
      } catch (e: any) {
        console.error('Error al pagar deuda:', e)
        setError(`No se pudo registrar el pago (${e?.code || 'error'}).`)
      }
      return
    }

    if (op.nombre === 'investigar_vehiculo') {
      const est = estimadosVehiculoCO({ modelo: Number(p.modelo) || undefined, cilindraje: Number(p.cilindraje) || undefined })
      push({
        rol: 'ia',
        texto:
          `🚗 Estimados en Colombia para ${String(p.marca)} ${String(p.linea)} (Modelo ${p.modelo ?? '?'}):\n\n` +
          `• SOAT anual estimado: ${COD(est.soatAnualEstimadoCOP)} (rango ${COD(est.soatRango.min)} - ${COD(est.soatRango.max)})\n` +
          `• Tecnicomecánica (RTM): ~${COD(est.tecnicomecanicaCostoEstimadoCOP)}\n` +
          `• Seguro todo riesgo: ~${COD(est.seguroTodoRiesgoAnualEstimadoCOP)} anual\n\n` +
          `💡 Es un estimativo (confianza media). Puedes afinarlo y guardarlo en la pestaña "Vehículos".`,
      })
      return
    }

    if (op.nombre === 'crear_vehiculo') {
      const yearDefault = new Date().getFullYear()
      try {
        await crearVehiculo({
          placa: String(p.placa ?? '').trim() || undefined,
          marca: String(p.marca),
          linea: String(p.linea),
          modelo: Number(p.modelo) || yearDefault,
          tipo: String(p.tipo) as 'carro' | 'moto' | 'camion' | 'otro',
          cilindraje: Number(p.cilindraje) || undefined,
        })
        invalidarSnapshotFinanciero()
        push({
          rol: 'ia',
          texto: `✅ Registré tu vehículo: ${String(p.marca)} ${String(p.linea)} (${p.modelo}). Puedes afinar SOAT, RTM y seguros en la pestaña "Vehículos".`,
        })
      } catch (e: any) {
        console.error('Error al crear vehículo:', e)
        setError(`No se pudo registrar el vehículo (${e?.code || 'error'}).`)
      }
      return
    }

    if (op.nombre === 'pago_nomina') {
      const monto = Number(p.monto) || 0
      const fecha = String(p.fecha ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)
      const nombre = String(p.nombre ?? '').trim()
      try {
        const nominas = await listarNomina()
        const match = nombre
          ? nominas.find((n) => n.nombreCompleto.toLowerCase().includes(nombre.toLowerCase()))
          : nominas.length === 1
            ? nominas[0]
            : undefined
        await crearMovimiento({
          fecha,
          tipo: 'pago_nomina',
          concepto: `Pago de nómina${match ? ' a ' + match.nombreCompleto : nombre ? ' a ' + nombre : ''}`,
          monto,
          categoria: 'Nómina',
          nominaId: match?.id,
          fuente: 'chat_IA',
        })
        invalidarSnapshotFinanciero()
        push({
          rol: 'ia',
          texto: `✅ Registré el pago de nómina de ${COD(monto)}${match ? ` a ${match.nombreCompleto}` : ''} (${fecha}).`,
        })
      } catch (e: any) {
        console.error('Error al registrar pago de nómina:', e)
        setError(`No se pudo registrar el pago de nómina (${e?.code || 'error'}).`)
      }
      return
    }

    if (op.nombre === 'crear_recurrente') {
      const monto = Number(p.monto ?? p.valor) || 0
      const concepto = String(p.concepto ?? '').trim() || 'Gasto recurrente'
      const categoria = normalizarCategoria(String(p.categoria ?? 'otro'))
      const periodicidad = normalizarPeriodicidad(String(p.periodicidad ?? 'mensual'))
      const dia = Number(p.diaVencimiento) || undefined
      try {
        await crearRecurrente({
          concepto,
          categoria,
          valor: monto,
          periodicidad,
          diaVencimiento: dia && dia >= 1 && dia <= 31 ? dia : undefined,
          activo: true,
          autoGenerar: true,
        })
        invalidarSnapshotFinanciero()
        push({
          rol: 'ia',
          texto:
            `✅ Listo, dejé "${concepto}" como gasto recurrente de ${COD(monto)} (${periodicidad}${dia ? `, vence el día ${dia}` : ''}).\n\n` +
            'Cuando quieras, genero sus movimientos y recordatorios de cada mes desde la pestaña "Recurrentes".',
        })
      } catch (e: any) {
        console.error('Error al crear recurrente:', e)
        setError(`No se pudo crear el gasto recurrente (${e?.code || 'error'}).`)
      }
      return
    }

    if (op.nombre === 'crear_evento') {
      const fecha = String(p.fecha ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)
      const titulo = String(p.titulo ?? '').trim() || 'Evento'
      try {
        await crearEvento({
          titulo,
          tipo: 'personal',
          fechaInicio: fecha,
          allDay: true,
          recurrente: false,
          recordatorios: [{ minutosAntes: 1440 }],
          relacionado: {},
        })
        invalidarSnapshotFinanciero()
        push({ rol: 'ia', texto: `📅 Anoté "${titulo}" para el ${fecha}. Te aviso un día antes.` })
      } catch (e: any) {
        console.error('Error al crear evento:', e)
        setError(`No se pudo crear el evento (${e?.code || 'error'}).`)
      }
      return
    }
  }

  const send = async () => {
    const texto = msg.trim()
    if (!texto || pensando) return
    setMsg('')
    setError('')
    push({ rol: 'user', texto })
    setPensando(true)
    try {
      const historial = msgs
        .filter((m) => m.texto.trim() && m.id !== 0)
        .slice(-8)
        .map((m) => ({ rol: m.rol, texto: m.texto }))

      const snapshot = await construirSnapshotFinanciero().catch(() => undefined)

      const interp = await interpretar(texto, { cuentas: cuentas.map((c) => c.nombre), historial, snapshot })

      const ops: AccionInterpretada[] = interp.lote?.length
        ? interp.lote
        : interp.acciones.length
          ? [{ nombre: interp.acciones[0], borrador: interp.borrador, params: interp.params }]
          : []

      const registros = ops.filter((o) => o.nombre === 'requiere_confirmacion' && o.borrador)
      const otras = ops.filter((o) => !(o.nombre === 'requiere_confirmacion' && o.borrador))

      if (!registros.length && interp.respuesta) {
        push({ rol: 'ia', texto: interp.respuesta })
      }

      registros.forEach((op, i) => {
        push({
          rol: 'ia',
          texto: i === 0 ? interp.respuesta || 'Revisa y confirma si está bien 👇' : 'Otro movimiento para confirmar 👇',
          borrador: op.borrador,
          estado: 'pendiente',
        })
      })

      for (const op of otras) {
        await ejecutarAccion(op)
      }

      if (!ops.length && !interp.respuesta) {
        push({ rol: 'ia', texto: 'Cuéntame en qué te ayudo con tu plata. 💛' })
      }
    } catch (e) {
      console.error('Error al interpretar el mensaje:', e)
      push({ rol: 'ia', texto: 'Uy, se me cruzaron los cables un segundo. ¿Me repites eso?' })
    } finally {
      setPensando(false)
    }
  }

  const confirmar = async (id: number, data: MovimientoConfirmado) => {
    setGuardandoId(id)
    setError('')
    try {
      await crearMovimiento({
        fecha: data.fecha,
        tipo: data.tipo,
        concepto: data.concepto,
        monto: data.monto,
        categoria: data.categoria,
        cuentaBancoId: data.cuentaBancoId,
        fuente: 'chat_IA',
      })
      invalidarSnapshotFinanciero()
      void cargarPulso()
      setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, estado: 'guardado' } : m)))
      push({
        rol: 'ia',
        texto: `✅ Guardado: ${data.tipo === 'ingreso' ? 'ingreso' : 'gasto'} de ${COD(data.monto)} — ${data.concepto} (${data.categoria}).`,
      })
      if (data.cuentaBancoId) {
        listarCuentasBanco().then(setCuentas).catch(() => {})
      }
    } catch (e: any) {
      console.error('Error al guardar movimiento:', e)
      const code = e?.code || (e && e.name) || 'desconocido'
      setError(`No se pudo guardar el movimiento (${code}).`)
    } finally {
      setGuardandoId(null)
    }
  }

  const cancelar = (id: number) => {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, estado: 'cancelado' } : m)))
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* COLUMNA DEL CHAT */}
      <Card className="glass-card surface-glow flex flex-col overflow-hidden border-0 max-md:h-[calc(100vh-56px)] max-md:h-[calc(100dvh-56px)] max-md:rounded-none">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] p-3.5 sm:p-4">
          <div className="flex items-center gap-3">
            <motion.div
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/25 to-sky-500/15"
              animate={{ boxShadow: ['0 0 0 0 rgba(52,211,153,0)', '0 0 24px 2px rgba(52,211,153,0.35)', '0 0 0 0 rgba(52,211,153,0)'] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <CashMetEmblem size={26} />
            </motion.div>
            <div>
              <div className="flex items-center gap-2 text-sm font-extrabold text-white sm:text-base">
                <span>{NOMBRE_IA}</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {geminiDisponible ? 'IA Gemini' : 'IA local'}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-mist-500">
                <span className="animate-pulse-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Tu contadora personal · recuerda la conversación</span>
              </div>
            </div>
          </div>
          <button
            onClick={limpiarChat}
            title="Nueva conversación"
            className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] p-2 text-mist-300 transition-all hover:bg-white/10 hover:text-white active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <CardContent className="flex min-h-0 flex-1 flex-col space-y-3 p-3 sm:p-4">
          <div className="slim-scroll h-[480px] space-y-4 overflow-y-auto rounded-2xl border border-white/[0.06] bg-black/25 p-3 text-sm sm:h-[520px] sm:p-5 max-md:h-auto max-md:min-h-0 max-md:flex-1 max-md:rounded-xl">
            <AnimatePresence initial={false}>
              {msgs.map((m) => (
                <motion.div
                  key={m.id}
                  layout="position"
                  initial={{ opacity: 0, y: 16, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  className={`flex items-end gap-2.5 ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.rol === 'ia' && (
                    <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                      <CashMetEmblem size={18} />
                    </div>
                  )}

                  <div className={`max-w-[88%] sm:max-w-[80%] ${m.borrador && m.estado === 'pendiente' ? 'w-full' : ''}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 leading-relaxed whitespace-pre-wrap ${
                        m.rol === 'user'
                          ? 'rounded-br-md bg-gradient-to-br from-emerald-400 to-teal-500 font-medium text-[#04241a] shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]'
                          : 'rounded-bl-md border border-white/[0.08] bg-white/[0.05] text-mist-100'
                      }`}
                    >
                      {m.rol === 'ia' ? <TextoEnriquecido texto={m.texto} /> : m.texto}
                    </div>

                    <AnimatePresence initial={false}>
                      {m.borrador && m.estado === 'pendiente' && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.99 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                          className="mt-2"
                        >
                          <ConfirmacionCard
                            borrador={m.borrador}
                            cuentas={cuentas}
                            guardando={guardandoId === m.id}
                            onConfirm={(data) => confirmar(m.id, data)}
                            onCancel={() => cancelar(m.id)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {m.estado === 'guardado' && (
                      <div className="mt-1 flex items-center gap-1 pl-1 text-[11px] font-bold text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Movimiento registrado y saldo actualizado</span>
                      </div>
                    )}

                    {m.estado === 'cancelado' && (
                      <div className="mt-1 pl-1 text-[11px] text-mist-600">Movimiento descartado</div>
                    )}

                    {m.timestamp && (
                      <div className={`mt-0.5 px-1 text-[10px] text-mist-600 ${m.rol === 'user' ? 'text-right' : 'text-left'}`}>
                        {m.timestamp}
                      </div>
                    )}
                  </div>

                  {m.rol === 'user' && (
                    <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400/30 to-emerald-400/30 text-white">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {pensando && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-end justify-start gap-2.5"
              >
                <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                  <CashMetEmblem size={18} />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.05] px-4 py-3.5">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-300 [animation-delay:0.2s]" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-300 [animation-delay:0.4s]" />
                  <span className="ml-1 text-[11px] font-semibold text-mist-500">Lucía está escribiendo…</span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1 max-md:pb-[env(safe-area-inset-bottom)]">
            <Input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Ej: gasté 35.000 en gasolina y me regalaron 20.000..."
              onKeyDown={(e) => e.key === 'Enter' && send()}
              className="field-dark h-12 rounded-2xl text-sm shadow-none"
            />
            <motion.div whileTap={{ scale: 0.94 }} className="shrink-0">
              <Button
                onClick={send}
                disabled={pensando}
                className="h-12 cursor-pointer rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 font-bold text-[#04241a] shadow-[0_8px_24px_-8px_rgba(16,185,129,0.7)] hover:brightness-110 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </motion.div>
          </div>
        </CardContent>
      </Card>

      {/* PANEL LATERAL: PULSO */}
      <aside className="hidden space-y-4 xl:block">
        <Card className="glass-card overflow-hidden border-0">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-xs font-black tracking-wider text-white uppercase">
              <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-300" />
              <span>Tasas del día</span>
            </div>
            {tasas.length ? (
              <ul className="space-y-1.5">
                {tasas.map((t) => (
                  <li
                    key={t}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-mist-300"
                  >
                    {t.replace(/^-\s*/, '')}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="animate-shimmer h-16 rounded-xl" />
            )}
            <p className="text-[11px] leading-relaxed text-mist-600">
              Referencia en COP. Lucía convierte sola cuando hablas en otra moneda.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden border-0">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-xs font-black tracking-wider text-white uppercase">
              <BarChart3 className="h-3.5 w-3.5 text-emerald-300" />
              <span>Últimos 6 meses</span>
            </div>
            {pulso.length ? (
              <div className="space-y-2.5">
                <div className="flex h-28 items-end gap-1.5">
                  {(() => {
                    const max = Math.max(1, ...pulso.flatMap((x) => [x.ingresos, x.gastos]))
                    return pulso.map((p) => (
                      <div key={p.etiqueta} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex h-24 w-full items-end justify-center gap-1">
                          <motion.div
                            className="w-full rounded-t-md bg-emerald-400/80"
                            title={`Ingresos: ${COD(p.ingresos)}`}
                            initial={{ height: 0 }}
                            animate={{ height: p.ingresos > 0 ? `${Math.max(4, (p.ingresos / max) * 100)}%` : 0 }}
                            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                          />
                          <motion.div
                            className="w-full rounded-t-md bg-rose-400/70"
                            title={`Gastos: ${COD(p.gastos)}`}
                            initial={{ height: 0 }}
                            animate={{ height: p.gastos > 0 ? `${Math.max(4, (p.gastos / max) * 100)}%` : 0 }}
                            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-mist-600 capitalize">{p.etiqueta}</span>
                      </div>
                    ))
                  })()}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-mist-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ingresos
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-400" /> Gastos
                  </span>
                </div>
              </div>
            ) : (
              <div className="animate-shimmer h-28 rounded-xl" />
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
