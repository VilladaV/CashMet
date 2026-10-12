import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { estimadosVehiculoCO, NOMBRE_IA, type AccionInterpretada } from './engine'
import { interpretar, geminiDisponible } from './interpretar'
import { construirSnapshotFinanciero, invalidarSnapshotFinanciero } from './snapshot'
import ConfirmacionCard, { type MovimientoConfirmado } from './ConfirmacionCard'
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
import { CashMetEmblem } from '@/components/brand/CashMetLogo'
import { Send, Sparkles, CheckCircle2, AlertCircle, User, Trash2 } from 'lucide-react'

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

const SUGERENCIAS = [
  'analiza mi estado financiero',
  '¿cuánto tengo en el banco?',
  'compré un almuerzo por 25.000 y me regalaron 70.000',
  'agrega gasto recurrente internet 120000 mensual',
  'resumen de este mes',
]

const SALUDO =
  `👋 ¡Hola! Soy ${NOMBRE_IA}, tu contadora. Cuéntame cómo te fue con la plata y yo te la organizo.\n\n` +
  'Puedes escribirme cosas como:\n' +
  '• "gasté 45.000 en mercado"\n' +
  '• "compré un almuerzo por 25.000 y me regalaron 70.000" (¡varias en un solo mensaje!)\n' +
  '• "¿cuánto tengo en mis cuentas?"\n' +
  '• "pagué 350.000 de la cuota del crédito"\n' +
  '• "agrega gasto recurrente internet 120000 mensual"\n' +
  '• "recuérdame pagar el arriendo el 5"\n' +
  '• "resumen de este mes"\n\n' +
  'Y si quieres, solo conversamos: pregúntame lo que necesites. 💛'

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
  }, [])

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
        .filter((m) => m.texto.trim() && m.texto !== SALUDO)
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
    <div className="container mx-auto p-2 sm:p-4 max-w-4xl space-y-3">
      {/* TARJETA PRINCIPAL DEL CHAT */}
      <Card className="glass-card shadow-lg border-slate-200/90 overflow-hidden">
        {/* Header del Chat */}
        <div className="gradient-brand-navy p-3.5 sm:p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xs">
              <CashMetEmblem size={26} />
            </div>
            <div>
              <div className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>{NOMBRE_IA}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {geminiDisponible ? 'IA Gemini' : 'IA local'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-live" />
                <span>Tu contadora personal · recuerda la conversación</span>
              </div>
            </div>
          </div>
          <button
            onClick={limpiarChat}
            title="Nueva conversación"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 transition-colors cursor-pointer active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Área de mensajes con scroll */}
          <div className="h-[460px] sm:h-[500px] overflow-y-auto rounded-xl p-3 sm:p-4 bg-slate-50/70 border border-slate-200/80 text-sm space-y-3">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 items-end ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* Avatar del Asistente */}
                {m.rol === 'ia' && (
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0 mb-1">
                    <CashMetEmblem size={18} />
                  </div>
                )}

                <div className={`max-w-[88%] sm:max-w-[80%] ${m.borrador && m.estado === 'pendiente' ? 'w-full' : ''}`}>
                  {/* Burbuja del mensaje */}
                  <div
                    className={`rounded-2xl px-4 py-2.5 shadow-2xs leading-relaxed whitespace-pre-wrap ${
                      m.rol === 'user'
                        ? 'gradient-brand-navy text-white rounded-br-xs font-medium'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {m.texto}
                  </div>

                  {/* Tarjeta de Confirmación de Movimiento */}
                  {m.borrador && m.estado === 'pendiente' && (
                    <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                      <ConfirmacionCard
                        borrador={m.borrador}
                        cuentas={cuentas}
                        guardando={guardandoId === m.id}
                        onConfirm={(data) => confirmar(m.id, data)}
                        onCancel={() => cancelar(m.id)}
                      />
                    </div>
                  )}

                  {/* Estado de guardado / cancelado */}
                  {m.estado === 'guardado' && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-1 pl-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Movimiento registrado y saldo actualizado</span>
                    </div>
                  )}

                  {m.estado === 'cancelado' && (
                    <div className="text-[11px] text-slate-400 mt-1 pl-1">Movimiento descartado</div>
                  )}

                  {m.timestamp && (
                    <div className={`text-[10px] text-slate-400 mt-0.5 px-1 ${m.rol === 'user' ? 'text-right' : 'text-left'}`}>
                      {m.timestamp}
                    </div>
                  )}
                </div>

                {/* Avatar del usuario */}
                {m.rol === 'user' && (
                  <div className="w-7 h-7 rounded-lg gradient-brand-growth flex items-center justify-center text-white shrink-0 mb-1 shadow-2xs">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Indicador de "escribiendo" */}
            {pensando && (
              <div className="flex gap-2.5 items-end justify-start">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0 mb-1">
                  <CashMetEmblem size={18} />
                </div>
                <div className="rounded-2xl rounded-bl-xs px-4 py-3 bg-white border border-slate-200/90 shadow-2xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Errores */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Chips de Sugerencias Rápidas */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>Sugerencias rápidas:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => setMsg(s)}
                  className="px-2.5 py-1 rounded-full text-xs bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200/90 hover:border-emerald-300 transition-all shadow-2xs cursor-pointer active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Barra de entrada de texto */}
          <div className="flex gap-2 pt-1">
            <Input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Ej: gasté 35.000 en gasolina y me regalaron 20.000..."
              onKeyDown={(e) => e.key === 'Enter' && send()}
              className="h-11 rounded-xl bg-white border-slate-200 focus-visible:ring-emerald-500 text-sm shadow-2xs"
            />
            <Button
              onClick={send}
              disabled={pensando}
              className="h-11 px-4 rounded-xl gradient-brand-navy hover:opacity-90 text-white font-semibold flex items-center gap-1.5 shadow-xs shrink-0 transition-transform active:scale-95 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
