import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { estimadosVehiculoCO } from './engine'
import { interpretar, geminiDisponible } from './interpretar'
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
import { Send, Sparkles, CheckCircle2, AlertCircle, User } from 'lucide-react'

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
  '¿cuánto tengo en el banco?',
  'gasté 45.000 en almuerzo',
  'me pagaron 2.800.000 de nómina',
  'agrega gasto recurrente internet 120000 mensual',
  'recuérdame pagar el arriendo el 5',
  'resumen de este mes',
  'genera el calendario de vencimientos',
]

export default function ChatPage() {
  const [msg, setMsg] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 0,
      rol: 'ia',
      texto:
        '👋 ¡Hola! Soy tu asistente financiero CashMet. Puedes escribirme en lenguaje natural, por ejemplo:\n\n' +
        '• "gasté 45.000 en mercado con Bancolombia"\n' +
        '• "me consignaron 3.000.000 de sueldo"\n' +
        '• "¿cuánto tengo en mis cuentas?"\n' +
                '• "pagué 350.000 de cuota del crédito"\n' +
        '• "agrega gasto recurrente internet 120000 mensual"\n' +
        '• "recuérdame pagar el arriendo el 5"\n' +
        '• "pagué la nómina de Juan 2.500.000"\n' +
        '• "agrega vehículo Mazda 3 2021 placa HJK890"\n' +
        '• "genera el calendario de vencimientos"\n' +
        '• "resumen de este mes"',
      timestamp: 'Ahora',
    },
  ])
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [guardandoId, setGuardandoId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const idRef = useRef(1)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listarCuentasBanco()
      .then(setCuentas)
      .catch(() => setError('No se pudieron cargar las cuentas bancarias.'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const push = (m: Omit<Msg, 'id'>) => {
    const id = idRef.current++
    const tiempo = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    setMsgs((prev) => [...prev, { ...m, id, timestamp: tiempo }])
    return id
  }

  const send = async () => {
    const texto = msg.trim()
    if (!texto) return
    setMsg('')
    setError('')
    push({ rol: 'user', texto })

    const interp = await interpretar(texto, { cuentas: cuentas.map((c) => c.nombre) })

    if (interp.acciones.includes('consulta_saldos')) {
      try {
        const { cuentas: cs, total } = await obtenerResumenSaldos()
        if (!cs.length) {
          push({
            rol: 'ia',
            texto: 'No tienes cuentas bancarias registradas aún. Ve a la pestaña "Cuentas" para añadir la primera.',
          })
        } else {
          const detalle = cs
            .map((c) => `• ${c.nombre}: ${COD(Number(c.saldoActual) || 0)}`)
            .join('\n')
          push({ rol: 'ia', texto: `💰 Saldo Total: ${COD(total)}\n\nDesglose por cuenta:\n${detalle}` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude consultar los saldos de tus cuentas.' })
      }
      return
    }

    if (interp.acciones.includes('busqueda_movimientos')) {
      try {
        const movs = await listarMovimientos(8)
        if (!movs.length) {
          push({ rol: 'ia', texto: 'No hay movimientos registrados todavía.' })
        } else {
          const detalle = movs
            .map((m) => `• ${m.fecha} — ${m.concepto}: ${COD(Number(m.monto) || 0)} (${m.tipo})`)
            .join('\n')
          push({ rol: 'ia', texto: `📋 Últimos ${movs.length} movimientos:\n\n${detalle}` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude recuperar los movimientos.' })
      }
      return
    }

    if (interp.acciones.includes('generar_calendario')) {
      try {
        const eventos = await construirEventos(12)
        if (!eventos.length) {
          push({
            rol: 'ia',
            texto: 'No hay vehículos, nómina o deudas registrados para proyectar eventos. Agrégalos en sus pestañas de gestión.',
          })
        } else {
          const n = await guardarEventos(eventos)
          push({ rol: 'ia', texto: `📅 ¡Listo! Se generaron y guardaron ${n} eventos en el calendario para los próximos 12 meses.` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude generar los eventos del calendario.' })
      }
      return
    }

    if (interp.acciones.includes('resumen_mes')) {
      try {
        const mes = String(interp.params?.mes ?? '')
        const todos = await listarTodosLosMovimientos(500)
        const delMes = todos.filter((m) => String(m.fecha).startsWith(mes))
        if (!delMes.length) {
          push({ rol: 'ia', texto: `No se registraron movimientos en el periodo ${mes}.` })
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
          push({
            rol: 'ia',
            texto:
              `📊 Resumen Financiero (${mes}):\n\n` +
              `• Ingresos: ${COD(ingresos)}\n` +
              `• Gastos: ${COD(gastos)}\n` +
              `• Balance Neto: ${COD(ingresos - gastos)}\n\n` +
              (top ? `Mayores categorías de gasto:\n${top}` : ''),
          })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude calcular el resumen del mes.' })
      }
      return
    }

    if (interp.acciones.includes('pago_deuda')) {
      const hoyString = new Date().toISOString().slice(0, 10)
      const monto = Number(interp.params?.monto) || 0
      const fecha = String(interp.params?.fecha ?? hoyString)
      const nombreBuscado = String(interp.params?.deudaNombre ?? '').toLowerCase()
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
                ? 'No tienes deudas activas registradas. Ve a la pestaña "Deudas" para registrar una.'
                : `Tienes varias deudas activas:\n${deudas.map((d) => `• ${d.nombre} (saldo ${COD(d.saldoPendiente || 0)})`).join('\n')}\n¿A cuál deseas aplicar el abono? Ej: "pagué 100.000 de ${deudas[0].nombre}".`,
          })
          return
        }
        await registrarPagoDeuda(deuda.id, monto, fecha)
        push({
          rol: 'ia',
          texto: `✅ Pago registrado: ${COD(monto)} a "${deuda.nombre}". Nuevo saldo pendiente: ${COD(Math.max(0, (deuda.saldoPendiente || 0) - monto))}.`,
        })
      } catch (e: any) {
        console.error('Error al pagar deuda:', e)
        setError(`No se pudo registrar el pago (${e?.code || 'error'}).`)
      }
      return
    }

    if (interp.acciones.includes('investigar_vehiculo')) {
      const p = interp.params ?? {}
      const est = estimadosVehiculoCO({ modelo: Number(p.modelo) || undefined, cilindraje: Number(p.cilindraje) || undefined })
      push({
        rol: 'ia',
        texto:
          `🚗 Estimados Colombia para ${String(p.marca)} ${String(p.linea)} (Modelo ${p.modelo ?? '?'}):\n\n` +
          `• SOAT Anual estimado: ${COD(est.soatAnualEstimadoCOP)} (Rango: ${COD(est.soatRango.min)} - ${COD(est.soatRango.max)})\n` +
          `• Tecnicomecánica (RTM): ~${COD(est.tecnicomecanicaCostoEstimadoCOP)}\n` +
          `• Seguro Todo Riesgo: ~${COD(est.seguroTodoRiesgoAnualEstimadoCOP)} anual\n\n` +
          `💡 Nivel de confianza: medio (${est.fuente}). Puedes guardarlo en la pestaña "Vehículos".`,
      })
      return
    }

    if (interp.acciones.includes('crear_vehiculo')) {
      const p = interp.params ?? {}
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
        push({
          rol: 'ia',
          texto: `✅ Vehículo registrado con éxito: ${String(p.marca)} ${String(p.linea)} (${p.modelo}). Puedes consultar y afinar SOAT, RTM y seguros en la pestaña "Vehículos".`,
        })
      } catch (e: any) {
        console.error('Error al crear vehículo:', e)
        setError(`No se pudo registrar el vehículo (${e?.code || 'error'}).`)
      }
      return
    }

    if (interp.acciones.includes('pago_nomina')) {
      const p = interp.params ?? {}
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
        push({
          rol: 'ia',
          texto: `✅ Pago de nómina registrado: ${COD(monto)}${match ? ` a ${match.nombreCompleto}` : ''} (${fecha}).`,
        })
      } catch (e: any) {
        console.error('Error al registrar pago de nómina:', e)
        setError(`No se pudo registrar el pago de nómina (${e?.code || 'error'}).`)
      }
      return
    }

    if (interp.acciones.includes('crear_recurrente')) {
      const p = interp.params ?? {}
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
        push({
          rol: 'ia',
          texto:
            `✅ Gasto recurrente creado: "${concepto}" por ${COD(monto)} (${periodicidad}${dia ? `, vence día ${dia}` : ''}).\n\n` +
            `Puedes generar sus movimientos y eventos de cada mes desde la pestaña "Recurrentes".`,
        })
      } catch (e: any) {
        console.error('Error al crear recurrente:', e)
        setError(`No se pudo crear el gasto recurrente (${e?.code || 'error'}).`)
      }
      return
    }

    if (interp.acciones.includes('crear_evento')) {
      const p = interp.params ?? {}
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
        push({ rol: 'ia', texto: `📅 Evento creado: "${titulo}" para el ${fecha}.` })
      } catch (e: any) {
        console.error('Error al crear evento:', e)
        setError(`No se pudo crear el evento (${e?.code || 'error'}).`)
      }
      return
    }

    if (interp.acciones.includes('requiere_confirmacion') && interp.borrador) {
      push({ rol: 'ia', texto: interp.respuesta, borrador: interp.borrador, estado: 'pendiente' })
      return
    }

    push({ rol: 'ia', texto: interp.respuesta })
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
      setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, estado: 'guardado' } : m)))
      push({
        rol: 'ia',
        texto: `✅ Guardado correctamente: ${data.tipo.toUpperCase()} de ${COD(data.monto)} — ${data.concepto} (${data.categoria}).`,
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
                <span>CashMet Copilot</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {geminiDisponible ? 'IA Gemini' : 'IA local'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-live" />
                <span>Interpreta gastos, pagos de deudas, vencimientos y saldos</span>
              </div>
            </div>
          </div>
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
                    <div className="text-[11px] text-slate-400 mt-1 pl-1">
                      Movimiento descartado
                    </div>
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
              placeholder="Ej: gasté 35.000 en gasolina, ¿cuánto tengo?, etc..."
              onKeyDown={(e) => e.key === 'Enter' && send()}
              className="h-11 rounded-xl bg-white border-slate-200 focus-visible:ring-emerald-500 text-sm shadow-2xs"
            />
            <Button
              onClick={send}
              className="h-11 px-4 rounded-xl gradient-brand-navy hover:opacity-90 text-white font-semibold flex items-center gap-1.5 shadow-xs shrink-0 transition-transform active:scale-95"
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
