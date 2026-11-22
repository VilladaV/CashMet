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
import { auth } from '@/lib/firebase/config'
import {
  crearMovimiento,
  listarCuentasBanco,
  listarMovimientos,
  listarTodosLosMovimientos,
  obtenerResumenSaldos,
  transferirEntreCuentas,
  type CuentaBanco,
} from '@/lib/firebase/movimientosRepo'
import { listarDeudas, registrarPagoDeuda } from '@/lib/firebase/deudasRepo'
import { listarImpuestos, registrarPagoImpuesto } from '@/lib/firebase/impuestosRepo'
import {
  calcularGastosMensuales,
  crearVehiculo,
  guardarTareaMantenimiento,
  listarVehiculos,
  nuevaTareaId,
  obtenerVehiculo,
  registrarServicioMantenimiento,
  renovarSoat,
  renovarTecnicomecanica,
  TIPOS_VEHICULO,
  type TipoVehiculo,
} from '@/lib/firebase/vehiculosRepo'
import { etiquetaVigencia, formatoFecha, formatoKm, vigenciaDe } from '@/features/vehiculos/vehiculoUtils'
import { hoyISO } from '@/lib/fechas'
import { crearRecurrente } from '@/lib/firebase/recurrentesRepo'
import { listarNomina, registrarPagoNomina, totalMensualNomina } from '@/lib/firebase/nominaRepo'
import { crearEvento, construirEventos, guardarEventos } from '@/lib/firebase/calendarioRepo'
import { estadoGoogleCalendar, sincronizarPendientes } from '@/lib/google/calendar'
import { leerResumenPiloto, marcarPilotoAnunciado } from '@/lib/piloto'
import { convertirACOP, lineaTasasContexto, normalizarMoneda } from '@/lib/fx'
import { CashMetEmblem } from '@/components/brand/CashMetLogo'
import { Send, CheckCircle2, AlertCircle, User, Trash2, ArrowLeftRight, BarChart3 } from 'lucide-react'

interface Msg {
  id: number
  rol: 'user' | 'ia'
  texto: string
  borrador?: BorradorMovimiento
  estado?: 'pendiente' | 'guardado' | 'cancelado'
  timestamp?: string
  sesionId?: string
}

const COD = (n: number) => `$${Math.round(n).toLocaleString('es-CO')} COP`

const normalizarNombre = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

type CatRecurrente = 'hogar' | 'transporte' | 'salud' | 'educacion' | 'servicios' | 'otro'
type PerRecurrente = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

const normalizarCategoria = (c: string): CatRecurrente => {
  const t = normalizarNombre(c)
  if (t.includes('hogar') || t.includes('casa') || t.includes('mercado')) return 'hogar'
  if (t.includes('transp') || t.includes('gasolina') || t.includes('carro') || t.includes('moto')) return 'transporte'
  if (t.includes('salud') || t.includes('medic')) return 'salud'
  if (t.includes('educ') || t.includes('estudio') || t.includes('coleg')) return 'educacion'
  if (t.includes('servic') || t.includes('luz') || t.includes('agua') || t.includes('internet') || t.includes('gas'))
    return 'servicios'
  return 'otro'
}

const normalizarPeriodicidad = (p: string): PerRecurrente => {
  const t = normalizarNombre(p)
  if (t.startsWith('bim')) return 'bimestral'
  if (t.startsWith('tri')) return 'trimestral'
  if (t.startsWith('sem')) return 'semestral'
  if (t.startsWith('an') || t.includes('ano')) return 'anual'
  return 'mensual'
}

interface PulsoMes {
  etiqueta: string
  ingresos: number
  gastos: number
}

const SALUDO = `👋 ¡Hola! Soy ${NOMBRE_IA}, tu contadora. Cuéntame cómo te fue con la plata y yo te la organizo. 💛`

const TEXTO_AYUDA =
  `¡Hola! Soy ${NOMBRE_IA}, tu contadora personal. Esto es lo que puedo hacer por ti:\n\n` +
  `• Registrar gastos e ingresos ("gasté 50.000 en mercado", "me pagaron 3.000 dólares")\n` +
  `• Mover plata entre tus cuentas ("pasa 500.000 de Bancolombia a Nequi")\n` +
  `• Consultar saldos, movimientos y resumen del mes\n` +
  `• Convertir divisas con la tasa del día ("¿cuánto son 100 dólares en pesos?")\n` +
  `• Pagar deudas, impuestos y nómina\n` +
  `• Crear gastos recurrentes, eventos de calendario, vehículos y mantenimientos`

// Identificador único de esta pestaña/sesión SPA: permite conservar borradores
// pendientes al cambiar de pestaña sin dejar borradores colgados tras recargar.
const SESION_SPA_ID = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const claveChatUsuario = (): string => {
  const uid = auth.currentUser?.uid
  return uid ? `cashmet_chat_v1_${uid}` : 'cashmet_chat_v1_anon'
}

const saludoInicial = (): Msg => ({ id: 0, rol: 'ia', texto: SALUDO, timestamp: 'Ahora' })

const cargarHistorial = (): Msg[] => {
  try {
    const raw = localStorage.getItem(claveChatUsuario())
    if (raw) {
      const parsed = JSON.parse(raw) as Msg[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((m) =>
          m.estado === 'pendiente' && m.sesionId !== SESION_SPA_ID
            ? { ...m, estado: 'cancelado' as const }
            : m
        )
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
  const [guardandoIds, setGuardandoIds] = useState<Set<number>>(() => new Set())
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState('')
  const [tasas, setTasas] = useState<string[]>([])
  const [estadoTasas, setEstadoTasas] = useState<'cargando' | 'listo' | 'vacio'>('cargando')
  const [pulso, setPulso] = useState<PulsoMes[]>([])
  const [estadoPulso, setEstadoPulso] = useState<'cargando' | 'listo' | 'vacio'>('cargando')

  const enProcesoRef = useRef<Set<number>>(new Set())
  const epochRef = useRef(0)
  const idRef = useRef(1)
  const bottomRef = useRef<HTMLDivElement>(null)

  const cargarPulso = useCallback(async () => {
    try {
      const todos = await listarTodosLosMovimientos(400)
      const ahora = new Date()
      const meses: PulsoMes[] = []
      let conDatos = false
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
        if (ingresos > 0 || gastos > 0) conDatos = true
        meses.push({
          etiqueta: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
          ingresos,
          gastos,
        })
      }
      setPulso(meses)
      setEstadoPulso(conDatos ? 'listo' : 'vacio')
    } catch {
      setEstadoPulso('vacio')
    }
  }, [])

  useEffect(() => {
    idRef.current = msgs.reduce((mx, m) => Math.max(mx, m.id), 0) + 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(claveChatUsuario(), JSON.stringify(msgs.slice(-60)))
    } catch {
      // almacenamiento no disponible
    }
  }, [msgs])

  const limpiarChat = () => {
    if (pensando) return
    epochRef.current += 1
    enProcesoRef.current.clear()
    setGuardandoIds(new Set())
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
        const lista = t ? t.split('\n').filter((l) => l.startsWith('- ')) : []
        setTasas(lista)
        setEstadoTasas(lista.length ? 'listo' : 'vacio')
      })
      .catch(() => setEstadoTasas('vacio'))
    void cargarPulso()
  }, [cargarPulso])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, pensando])

  useEffect(() => {
    let cancelado = false
    let intentos = 0
    let timerId: number | undefined

    const revisar = () => {
      if (cancelado) return
      const r = leerResumenPiloto()
      const h = new Date()
      const hoy = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
      const avisos = r?.avisos ?? []

      if (r && r.fecha === hoy && !r.anunciado && (r.aplicados.length || avisos.length)) {
        marcarPilotoAnunciado()
        const tiempo = h.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        const texto = [
          r.aplicados.length ? '☀️ Piloto automático: dejé esto al día por ti:' : '☀️ Piloto automático:',
          ...r.aplicados.map((a) => `• ${a.texto}`),
          ...(avisos.length ? ['', ...avisos.map((a) => `⚠️ ${a}`)] : []),
          '',
          avisos.length ? 'Revisa esos pendientes cuando puedas. 💛' : 'Así vas encaminado. 💪',
        ].join('\n')
        const id = idRef.current++
        setMsgs((prev) => [...prev, { id, rol: 'ia', texto, timestamp: tiempo }])
        return
      }

      if ((!r || r.fecha !== hoy) && intentos < 15) {
        intentos++
        timerId = window.setTimeout(revisar, 700)
      }
    }

    revisar()
    return () => {
      cancelado = true
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [])

  const push = (m: Omit<Msg, 'id'>) => {
    const id = idRef.current++
    const tiempo = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    setMsgs((prev) => [...prev, { ...m, id, timestamp: tiempo, sesionId: m.borrador ? SESION_SPA_ID : m.sesionId }])
    return id
  }

  const ejecutarAccion = async (op: AccionInterpretada): Promise<boolean> => {
    const p = op.params ?? {}

    if (op.nombre === 'ayuda') {
      push({ rol: 'ia', texto: TEXTO_AYUDA })
      return true
    }

    if (op.nombre === 'consulta_conversion') {
      const monto = Number(p.monto)
      const moneda = normalizarMoneda(p.moneda) ?? String(p.moneda ?? '').trim().toUpperCase()
      if (!moneda || !Number.isFinite(monto) || monto <= 0) {
        push({
          rol: 'ia',
          texto: 'Dime el monto y la moneda que quieres convertir. Por ejemplo: "¿cuánto son 100 dólares en pesos?".',
        })
        return true
      }
      try {
        const conv = await convertirACOP(monto, moneda)
        if (!conv) {
          push({
            rol: 'ia',
            texto: `No pude obtener la tasa de cambio para ${moneda} en este momento. Intenta de nuevo en unos minutos.`,
          })
          return true
        }
        const tasaTxt = conv.tasa.toLocaleString('es-CO', { maximumFractionDigits: 2 })
        const fechaTxt = conv.fecha ? ` (${conv.fecha})` : ''
        push({
          rol: 'ia',
          texto:
            `💱 ${monto.toLocaleString('es-CO')} ${conv.moneda} equivalen a **${COD(conv.montoCOP)}**.\n\n` +
            `• Tasa usada: 1 ${conv.moneda} = $${tasaTxt} COP${fechaTxt}`,
        })
      } catch {
        push({ rol: 'ia', texto: 'No pude consultar las tasas de cambio en este momento.' })
      }
      return true
    }

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
      return true
    }

    if (op.nombre === 'transferir') {
      const monto = Number(p.monto) || 0
      const fecha = String(p.fecha ?? '').slice(0, 10) || hoyISO()
      const concepto = String(p.concepto ?? '').trim()
      let listaCuentas: CuentaBanco[] = cuentas
      try {
        listaCuentas = await listarCuentasBanco()
      } catch {
        listaCuentas = cuentas
      }
      const resolver = (valor: unknown): CuentaBanco | undefined => {
        const raw = String(valor ?? '').trim()
        const v = normalizarNombre(raw)
        if (!v) return undefined
        return (
          listaCuentas.find((c) => c.id === raw) ??
          listaCuentas.find((c) => normalizarNombre(c.nombre) === v) ??
          listaCuentas.find((c) => {
            const n = normalizarNombre(c.nombre)
            return n.includes(v) || v.includes(n)
          })
        )
      }
      const origen = resolver(p.cuentaOrigenId ?? p.cuentaOrigen ?? p.origenId ?? p.origen)
      const destino = resolver(p.cuentaDestinoId ?? p.cuentaDestino ?? p.destinoId ?? p.destino)

      if (!monto || monto <= 0) {
        push({ rol: 'ia', texto: '¿De cuánto es la transferencia? Dime el monto y de qué cuenta a cuál la paso.' })
        return true
      }
      if (!origen || !destino) {
        const lista = listaCuentas.length
          ? listaCuentas.map((c) => `• ${c.nombre}: ${COD(Number(c.saldoActual) || 0)}`).join('\n')
          : 'Todavía no tienes cuentas registradas.'
        push({
          rol: 'ia',
          texto:
            `Necesito saber de qué cuenta a cuál. Estas son las que tengo:\n\n${lista}\n\n` +
            (listaCuentas.length >= 2
              ? `Dime por ejemplo: "pasa 200.000 de ${listaCuentas[0].nombre} a ${listaCuentas[1].nombre}".`
              : 'Ve a la pestaña "Cuentas" y agrega al menos dos para poder transferir.'),
        })
        return true
      }

      try {
        const r = await transferirEntreCuentas({
          origenId: origen.id,
          destinoId: destino.id,
          monto,
          fecha,
          concepto,
        })
        if (!r.ok) {
          const mensajes: Record<string, string> = {
            monto_invalido: 'El monto debe ser mayor a cero.',
            misma_cuenta: 'La cuenta de origen y la de destino son la misma. Dime dos cuentas distintas.',
            cuenta_no_encontrada: 'No encontré una de las cuentas. Revisa la pestaña "Cuentas" y lo intentamos de nuevo.',
            saldo_insuficiente: `La cuenta "${origen.nombre}" tiene ${COD(r.saldoDisponible ?? 0)}, no alcanza para mover ${COD(monto)}.`,
          }
          push({ rol: 'ia', texto: mensajes[r.error] ?? 'No pude hacer la transferencia.' })
          return true
        }
        invalidarSnapshotFinanciero()
        setCuentas((prev) =>
          prev.map((c) => (c.id === r.origen.id ? r.origen : c.id === r.destino.id ? r.destino : c))
        )
        void cargarPulso()
        push({
          rol: 'ia',
          texto:
            `✅ Transferencia lista: ${COD(monto)} de ${r.origen.nombre} a ${r.destino.nombre} (${fecha}).\n\n` +
            `• ${r.origen.nombre}: ${COD(r.origen.saldoActual)}\n` +
            `• ${r.destino.nombre}: ${COD(r.destino.saldoActual)}`,
        })
      } catch (e: any) {
        console.error('Error al transferir entre cuentas:', e)
        push({ rol: 'ia', texto: `No pude hacer la transferencia: ${e?.message ?? 'error'}` })
      }
      return true
    }

    if (op.nombre === 'busqueda_movimientos') {
      const qRaw = String(p.q ?? p.texto ?? p.concepto ?? p.categoria ?? '').trim()
      const qNorm = normalizarNombre(qRaw)
      try {
        if (qNorm) {
          const todos = await listarTodosLosMovimientos(250)
          const coincidencias = todos
            .filter((m) => {
              const texto = normalizarNombre(
                `${m.fecha ?? ''} ${m.concepto ?? ''} ${m.categoria ?? ''} ${m.descripcion ?? ''} ${m.tipo ?? ''}`
              )
              return texto.includes(qNorm)
            })
            .slice(0, 12)
          if (!coincidencias.length) {
            push({ rol: 'ia', texto: `No encontré movimientos que coincidan con "${qRaw}".` })
          } else {
            const detalle = coincidencias
              .map((m) => `• ${m.fecha} — ${m.concepto}: ${COD(Number(m.monto) || 0)} (${m.tipo})`)
              .join('\n')
            push({
              rol: 'ia',
              texto: `🔎 Encontré ${coincidencias.length} movimiento(s) para "${qRaw}":\n\n${detalle}`,
            })
          }
        } else {
          const movs = await listarMovimientos(8)
          if (!movs.length) {
            push({ rol: 'ia', texto: 'Todavía no hay movimientos registrados.' })
          } else {
            const detalle = movs
              .map((m) => `• ${m.fecha} — ${m.concepto}: ${COD(Number(m.monto) || 0)} (${m.tipo})`)
              .join('\n')
            push({ rol: 'ia', texto: `📋 Tus últimos ${movs.length} movimientos:\n\n${detalle}` })
          }
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude recuperar los movimientos.' })
      }
      return true
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
      return true
    }

    if (op.nombre === 'resumen_mes') {
      try {
        const mesRaw = String(p.mes ?? '').trim()
        const mes = /^\d{4}-\d{2}$/.test(mesRaw) ? mesRaw : hoyISO().slice(0, 7)
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
            if (m.tipo === 'ingreso') {
              ingresos += val
            } else if (m.tipo !== 'transferencia') {
              gastos += val
              porCat.set(m.categoria || 'Otros', (porCat.get(m.categoria || 'Otros') || 0) + val)
            }
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
      return true
    }

    if (op.nombre === 'pago_deuda') {
      const hoyString = hoyISO()
      const monto = Number(p.monto) || 0
      const fecha = String(p.fecha ?? hoyString).slice(0, 10) || hoyString
      const nombreOriginal = String(p.nombre ?? p.deudaNombre ?? '').trim()
      const nombreBuscado = normalizarNombre(nombreOriginal)
      try {
        const deudas = (await listarDeudas()).filter((d) => d.estado !== 'pagada')
        const candidatas = nombreBuscado
          ? deudas.filter((d) => {
              const n = normalizarNombre(d.nombre)
              return n === nombreBuscado || n.includes(nombreBuscado) || nombreBuscado.includes(n)
            })
          : deudas

        // Si el usuario indicó un nombre pero no coincidió con ninguna deuda activa, NO aplicar a otra deuda
        const deuda =
          candidatas.length === 1
            ? candidatas[0]
            : !nombreBuscado && deudas.length === 1
              ? deudas[0]
              : undefined

        if (!deuda) {
          if (deudas.length === 0) {
            push({
              rol: 'ia',
              texto: 'No tienes deudas activas registradas. Ve a la pestaña "Deudas" y las registramos.',
            })
          } else if (nombreBuscado && candidatas.length === 0) {
            push({
              rol: 'ia',
              texto:
                `No encontré ninguna deuda activa llamada "${nombreOriginal}". Estas son tus deudas activas:\n` +
                `${deudas.map((d) => `• ${d.nombre} (saldo ${COD(d.saldoPendiente || 0)})`).join('\n')}\n\n` +
                `¿A cuál le abono?`,
            })
          } else {
            const lista = candidatas.length ? candidatas : deudas
            push({
              rol: 'ia',
              texto:
                `Tienes varias deudas que coinciden:\n` +
                `${lista.map((d) => `• ${d.nombre} (saldo ${COD(d.saldoPendiente || 0)})`).join('\n')}\n\n` +
                `¿A cuál le abono? Ej: "pagué 100.000 de ${lista[0].nombre}".`,
            })
          }
          return true
        }
        const cuentaDeudaId = deuda.cuentaBancoId || cuentas[0]?.id
        if (!cuentaDeudaId) {
          push({ rol: 'ia', texto: 'Primero necesitas crear una cuenta bancaria en la pestaña "Cuentas" para poder descontar el pago.' })
          return true
        }
        if (!monto || monto <= 0) {
          push({ rol: 'ia', texto: '¿De cuánto es el abono? Dime el monto y lo registro.' })
          return true
        }
        const r = await registrarPagoDeuda(deuda.id, monto, fecha, cuentaDeudaId, 'chat_IA')
        if (!r.ok) {
          const mensajes: Record<string, string> = {
            monto_invalido: 'El monto del abono debe ser mayor a cero.',
            fecha_invalida: 'La fecha del abono no es válida.',
            deuda_no_encontrada: 'No encontré esa deuda; puede que la hayan eliminado.',
            deuda_pagada: `"${deuda.nombre}" ya está pagada. No registré otro abono.`,
            monto_excede_saldo: `El abono de ${COD(monto)} supera el saldo pendiente de "${deuda.nombre}" (${COD(r.saldoPendiente ?? deuda.saldoPendiente ?? 0)}).`,
            cuenta_no_encontrada: 'No encontré la cuenta para descontar el pago. Revisa la pestaña "Cuentas".',
            saldo_insuficiente: `La cuenta solo tiene ${COD(r.saldoDisponible ?? 0)}, no alcanza para el abono de ${COD(monto)}.`,
          }
          push({ rol: 'ia', texto: mensajes[r.error] ?? 'No pude registrar el pago de la deuda.' })
          return true
        }
        invalidarSnapshotFinanciero()
        listarCuentasBanco().then(setCuentas).catch(() => {})
        void cargarPulso()
        push({
          rol: 'ia',
          texto: r.cerrada
            ? `✅ Registré el pago de ${COD(monto)} a "${deuda.nombre}". ¡Quedó pagada por completo! 🎉`
            : `✅ Listo, registré el pago de ${COD(monto)} a "${deuda.nombre}". Te queda un saldo de ${COD(r.saldoPendiente)}.`,
        })
      } catch (e: any) {
        console.error('Error al pagar deuda:', e)
        push({ rol: 'ia', texto: `No pude registrar el pago de la deuda: ${e?.message || e?.code || 'error'}.` })
      }
      return true
    }

    if (op.nombre === 'pagar_impuesto') {
      const fecha = String(p.fecha ?? '').slice(0, 10) || hoyISO()
      const impuestoId = String(p.impuestoId ?? '').trim()
      const nombreOriginal = String(p.nombre ?? p.impuesto ?? '').trim()
      const nombreBuscado = normalizarNombre(nombreOriginal)
      try {
        const todos = await listarImpuestos()
        const pendientes = todos.filter((i) => !i.pagado)

        let impuesto = impuestoId ? todos.find((i) => i.id === impuestoId) : undefined

        if (!impuesto && nombreBuscado) {
          const coincide = (nombre: string) => {
            const n = normalizarNombre(nombre)
            return n === nombreBuscado || n.includes(nombreBuscado) || nombreBuscado.includes(n)
          }
          const exactosPendientes = pendientes.filter((i) => normalizarNombre(i.nombre) === nombreBuscado)
          const candPendientes = exactosPendientes.length ? exactosPendientes : pendientes.filter((i) => coincide(i.nombre))
          if (candPendientes.length === 1) {
            impuesto = candPendientes[0]
          } else if (candPendientes.length > 1) {
            push({
              rol: 'ia',
              texto:
                `Encontré varios impuestos pendientes que coinciden con "${nombreOriginal}":\n` +
                `${candPendientes
                  .map((i) => `• ${i.nombre}: ${COD(Number(i.valor) || 0)}${i.fechaVencimiento ? ` (vence ${i.fechaVencimiento})` : ''}`)
                  .join('\n')}\n\n¿Cuál deseas pagar?`,
            })
            return true
          } else {
            const candPagados = todos.filter((i) => i.pagado && coincide(i.nombre))
            if (candPagados.length === 1) {
              impuesto = candPagados[0]
            } else {
              push({
                rol: 'ia',
                texto:
                  pendientes.length === 0
                    ? `No encontré un impuesto pendiente llamado "${nombreOriginal}" y no tienes otros pendientes.`
                    : `No encontré un impuesto pendiente llamado "${nombreOriginal}". Tus pendientes son:\n` +
                      `${pendientes
                        .map((i) => `• ${i.nombre}: ${COD(Number(i.valor) || 0)}${i.fechaVencimiento ? ` (vence ${i.fechaVencimiento})` : ''}`)
                        .join('\n')}\n\n¿Cuál pago?`,
              })
              return true
            }
          }
        } else if (!impuesto && !nombreBuscado && pendientes.length === 1) {
          impuesto = pendientes[0]
        }

        if (!impuesto) {
          push({
            rol: 'ia',
            texto:
              pendientes.length === 0
                ? 'No tienes impuestos pendientes registrados. Ve a la pestaña "Impuestos" y los agregamos.'
                : `Tienes varios impuestos pendientes:\n${pendientes
                    .map(
                      (i) =>
                        `• ${i.nombre}: ${COD(Number(i.valor) || 0)}${i.fechaVencimiento ? ` (vence ${i.fechaVencimiento})` : ''}`
                    )
                    .join('\n')}\n\n¿Cuál pago?`,
          })
          return true
        }

        if (impuesto.pagado) {
          push({ rol: 'ia', texto: `"${impuesto.nombre}" ya estaba marcado como pagado.` })
          return true
        }

        const r = await registrarPagoImpuesto(impuesto.id, { fecha, fuente: 'chat_IA' })
        if (!r.ok) {
          if (r.yaPagado) {
            push({ rol: 'ia', texto: `"${impuesto.nombre}" ya estaba marcado como pagado.` })
          } else if (r.saldoInsuficiente) {
            push({
              rol: 'ia',
              texto: `No pude pagar "${impuesto.nombre}": la cuenta "${r.cuentaNombre ?? ''}" solo tiene ${COD(r.saldoDisponible ?? 0)} y el impuesto es ${COD(Number(impuesto.valor) || 0)}.`,
            })
          } else {
            push({ rol: 'ia', texto: `No pude registrar el pago de "${impuesto.nombre}".` })
          }
          return true
        }

        invalidarSnapshotFinanciero()
        listarCuentasBanco().then(setCuentas).catch(() => {})
        void cargarPulso()
        push({
          rol: 'ia',
          texto:
            `✅ Pago registrado: "${impuesto.nombre}" por ${COD(r.monto ?? 0)} (${fecha}).` +
            (impuesto.cuentaBancoId ? '' : '\n\nOjo: no tenía una cuenta asociada, así que no desconté saldo.'),
        })
      } catch (e: any) {
        console.error('Error al pagar impuesto:', e)
        push({ rol: 'ia', texto: `No pude registrar el pago del impuesto: ${e?.message ?? 'error'}` })
      }
      return true
    }

    if (op.nombre === 'investigar_vehiculo') {
      const est = estimadosVehiculoCO({ modelo: Number(p.modelo) || undefined, cilindraje: Number(p.cilindraje) || undefined })
      push({
        rol: 'ia',
        texto:
          `🚗 Estimados en Colombia para ${String(p.marca)} ${String(p.linea)} (Modelo ${p.modelo ?? '?'}):\n\n` +
          `• SOAT anual estimado: ${COD(est.soatAnualEstimadoCOP)} (rango ${COD(est.soatRango.min)} - ${COD(est.soatRango.max)})\n` +
          `• Tecnicomecánica (RTM): ~${COD(est.tecnicomecanicaCostoEstimadoCOP)}\n` +
          `• Seguro todo riesgo: ~${COD(est.seguroTodoRiesgoAnualEstimadoCOP)} anual (rango ${COD(est.rangoSTR.min)} - ${COD(est.rangoSTR.max)})\n\n` +
          `💡 Es un estimativo (confianza media). Puedes afinarlo y guardarlo en la pestaña "Vehículos".`,
      })
      return true
    }

    if (op.nombre === 'crear_vehiculo') {
      const yearDefault = new Date().getFullYear()
      const marca = String(p.marca ?? '').trim()
      const linea = String(p.linea ?? '').trim()
      const placa = String(p.placa ?? '').trim().toUpperCase().replace(/[\s-]+/g, '')
      const modelo = Number(p.modelo) || yearDefault
      if (!marca || !linea) {
        push({ rol: 'ia', texto: 'Necesito al menos la marca y la línea del vehículo para registrarlo.' })
        return true
      }
      try {
        const vehiculos = await listarVehiculos()
        if (placa) {
          const existente = vehiculos.find((x) => (x.placa ?? '').toUpperCase().replace(/[\s-]+/g, '') === placa)
          if (existente) {
            push({
              rol: 'ia',
              texto: `Ya tienes un vehículo con la placa ${placa}: ${existente.marca} ${existente.linea}. No creé otro.`,
            })
            return true
          }
        }
        const tipoTexto = String(p.tipo ?? '').trim()
        const tipo: TipoVehiculo = TIPOS_VEHICULO.includes(tipoTexto as TipoVehiculo)
          ? (tipoTexto as TipoVehiculo)
          : 'carro'
        await crearVehiculo({
          placa: placa || undefined,
          marca,
          linea,
          modelo,
          tipo,
          cilindraje: Number(p.cilindraje) || undefined,
        })
        invalidarSnapshotFinanciero()
        push({
          rol: 'ia',
          texto: `✅ Registré tu vehículo: ${marca} ${linea} (${modelo})${placa ? ` · ${placa}` : ''}. Puedes afinar SOAT, TM y seguros en la pestaña "Vehículos".`,
        })
      } catch (e: any) {
        console.error('Error al crear vehículo:', e)
        push({ rol: 'ia', texto: `No se pudo registrar el vehículo (${e?.code || e?.message || 'error'}).` })
      }
      return true
    }

    if (op.nombre === 'registrar_mantenimiento') {
      const montoRaw = p.monto !== undefined ? Number(p.monto) : 0
      const monto = Number.isFinite(montoRaw) ? montoRaw : 0
      const fecha = String(p.fecha ?? '').slice(0, 10) || hoyISO()
      const placa = String(p.placa ?? '').trim().toUpperCase().replace(/[\s-]+/g, '')
      const marca = normalizarNombre(String(p.marca ?? ''))
      const linea = normalizarNombre(String(p.linea ?? ''))
      const concepto = String(p.concepto ?? '').trim() || 'Mantenimiento'
      const km = p.km !== undefined && p.km !== '' ? Number(p.km) : undefined

      if (monto < 0) {
        push({ rol: 'ia', texto: 'El costo del mantenimiento no puede ser negativo.' })
        return true
      }
      if (km !== undefined && (!Number.isFinite(km) || km < 0)) {
        push({ rol: 'ia', texto: 'El kilometraje del mantenimiento debe ser un número válido mayor o igual a cero.' })
        return true
      }
      if (monto === 0 && km === undefined && p.sinCosto !== true) {
        push({
          rol: 'ia',
          texto: `¿Cuánto costó "${concepto}" (o a qué kilometraje se hizo)? Dime el valor y lo registro completo.`,
        })
        return true
      }

      const cuentaId = String(p.cuentaBancoId ?? '').trim() || undefined
      try {
        const vehiculos = await listarVehiculos()
        const activos = vehiculos.filter((x) => x.activo !== false && x.estado !== 'Vendido')
        let v = placa ? activos.find((x) => (x.placa ?? '').toUpperCase().replace(/[\s-]+/g, '') === placa) : undefined
        if (!v && (marca || linea)) {
          const candidatos = activos.filter(
            (x) =>
              (!marca || normalizarNombre(x.marca).includes(marca)) &&
              (!linea || normalizarNombre(x.linea).includes(linea))
          )
          if (candidatos.length === 1) {
            v = candidatos[0]
          } else if (candidatos.length > 1) {
            push({
              rol: 'ia',
              texto: `Encontré varios vehículos que coinciden:\n${candidatos
                .map((x) => `• ${x.marca} ${x.linea}${x.placa ? ` (${x.placa})` : ''}`)
                .join('\n')}\n\n¿De cuál fue el mantenimiento?`,
            })
            return true
          }
        }
        if (!v && !placa && !marca && !linea && activos.length === 1) v = activos[0]
        if (!v) {
          push({
            rol: 'ia',
            texto:
              activos.length === 0
                ? 'Todavía no tienes vehículos activos registrados. Ve a la pestaña "Vehículos" y lo registramos primero.'
                : `No identifiqué el vehículo. Estos son tus vehículos activos:\n${activos
                    .map((x) => `• ${x.marca} ${x.linea}${x.placa ? ` (${x.placa})` : ''}`)
                    .join('\n')}\n\n¿De cuál fue el mantenimiento?`,
          })
          return true
        }

        // Validamos la cuenta ANTES de cualquier escritura
        let listaCuentas = cuentas
        if (monto > 0 && !listaCuentas.length) {
          listaCuentas = await listarCuentasBanco().catch(() => [])
        }
        const cuentaMantId =
          cuentaId && listaCuentas.some((c) => c.id === cuentaId)
            ? cuentaId
            : listaCuentas[0]?.id
        if (monto > 0 && !cuentaMantId) {
          push({ rol: 'ia', texto: 'Primero registra una cuenta en la pestaña "Cuentas" para descontar el costo del mantenimiento.' })
          return true
        }

        const nombre = concepto.slice(0, 60)

        // Si tiene costo, creamos el movimiento primero para que un fallo bancario no deje hoja de vida desincronizada
        let movimientoCreado = false
        if (monto > 0 && cuentaMantId) {
          await crearMovimiento({
            fecha,
            tipo: 'mantenimiento',
            concepto: `${nombre} · ${v.marca} ${v.linea}${v.placa ? ` (${v.placa})` : ''}`,
            monto,
            categoria: 'Transporte',
            vehiculoId: v.id,
            cuentaBancoId: cuentaMantId,
            fuente: 'chat_IA',
          })
          movimientoCreado = true
          listarCuentasBanco().then(setCuentas).catch(() => {})
          void cargarPulso()
        }

        try {
          let tarea = (v.mantenimiento?.tareas ?? []).find((t) => normalizarNombre(t.nombre) === normalizarNombre(nombre))
          if (!tarea) {
            tarea = { id: nuevaTareaId(), nombre }
            await guardarTareaMantenimiento(v.id, tarea)
          }
          await registrarServicioMantenimiento(v.id, tarea.id, {
            km: Number.isFinite(km) ? km : undefined,
            fecha,
          })
        } catch (errHoja: any) {
          invalidarSnapshotFinanciero()
          console.error('Error al actualizar hoja de vida tras movimiento:', errHoja)
          push({
            rol: 'ia',
            texto: movimientoCreado
              ? `⚠️ Desconté el movimiento de ${COD(monto)}, pero no pude actualizar la hoja de vida del vehículo. Regístralo manualmente en la pestaña "Vehículos".`
              : `No pude registrar el mantenimiento en el vehículo (${errHoja?.message || 'error'}).`,
          })
          return true
        }

        invalidarSnapshotFinanciero()
        const detalleKm = Number.isFinite(km) ? ` a los ${formatoKm(km)}` : ''
        push({
          rol: 'ia',
          texto: `🔧 Listo, registré "${nombre}" del ${v.marca} ${v.linea}${v.placa ? ` (${v.placa})` : ''}${detalleKm}${monto > 0 ? ` por ${COD(monto)}` : ' (sin costo)'} (${formatoFecha(fecha)}). Quedó en su hoja de vida${monto > 0 ? ' y descontado en tus movimientos' : ''}.`,
        })
      } catch (e: any) {
        console.error('Error al registrar mantenimiento:', e)
        push({ rol: 'ia', texto: `No se pudo registrar el mantenimiento (${e?.message || e?.code || 'error'}).` })
      }
      return true
    }

    if (op.nombre === 'obtener_vehiculo_completo') {
      const vehiculoId = String(p.vehiculoId ?? '').trim()
      if (!vehiculoId) {
        push({ rol: 'ia', texto: 'Falta el ID del vehículo. Dime cuál quieres ver (puedes usar la placa o decirme "el primero").' })
        return true
      }
      try {
        const v = await obtenerVehiculo(vehiculoId)
        if (!v) {
          push({ rol: 'ia', texto: 'No encontré ese vehículo. Verifica el ID o la placa.' })
          return true
        }
        const soatV = vigenciaDe(v.soat?.fechaVencimiento)
        const tmV = vigenciaDe(v.tecnicomecanica?.fechaVencimiento)
        const strV = vigenciaDe(v.seguroTodoRiesgo?.fechaVencimiento)
        const partes = [
          `🚗 ${v.marca} ${v.linea}${v.modelo ? ` ${v.modelo}` : ''}${v.placa ? ` (${v.placa})` : ''}`,
          `Tipo: ${v.tipo}${v.cilindraje ? ` · ${v.cilindraje} cc` : ''}${v.valorComercial ? ` · Valor: ${COD(v.valorComercial)}` : ''}`,
          `Estado: ${v.estado ?? 'Disponible'} · Costo estimado: ${COD(calcularGastosMensuales(v))}/mes`,
        ]
        if (v.soat) {
          partes.push(
            `SOAT: ${etiquetaVigencia(soatV)}${v.soat.fechaVencimiento ? ` · vence ${formatoFecha(v.soat.fechaVencimiento)}` : ''}${v.soat.valorPrimaAnual ? ` · prima ${COD(v.soat.valorPrimaAnual)}` : ''}${v.soat.aseguradora ? ` · ${v.soat.aseguradora}` : ''}`
          )
        }
        if (v.tecnicomecanica) {
          partes.push(
            `TM: ${etiquetaVigencia(tmV)}${v.tecnicomecanica.fechaVencimiento ? ` · vence ${formatoFecha(v.tecnicomecanica.fechaVencimiento)}` : ''}${v.tecnicomecanica.costoRevision ? ` · costo ${COD(v.tecnicomecanica.costoRevision)}` : ''}${v.tecnicomecanica.cda ? ` · CDA: ${v.tecnicomecanica.cda}` : ''}`
          )
        }
        if (v.seguroTodoRiesgo?.tiene) {
          partes.push(
            `STR: ${etiquetaVigencia(strV)}${v.seguroTodoRiesgo.fechaVencimiento ? ` · vence ${formatoFecha(v.seguroTodoRiesgo.fechaVencimiento)}` : ''}${v.seguroTodoRiesgo.valorPrimaAnual ? ` · prima ${COD(v.seguroTodoRiesgo.valorPrimaAnual)}` : ''}`
          )
        }
        if (v.mantenimiento?.kilometrajeActual !== undefined) {
          partes.push(`Kilometraje: ${formatoKm(v.mantenimiento.kilometrajeActual)}`)
        }
        if (v.mantenimiento?.tareas?.length) {
          partes.push('Mantenimiento:')
          for (const t of v.mantenimiento.tareas.slice(0, 8)) {
            partes.push(
              `- ${t.nombre}: último ${formatoKm(t.ultimoKm)}${t.ultimaFecha ? ` (${formatoFecha(t.ultimaFecha)})` : ''} → próximo ${formatoKm(t.proximoKm)}${t.proximaFecha ? ` (${formatoFecha(t.proximaFecha)})` : ''}`
            )
          }
        }
        if (v.licenciaTransito?.numeroLicencia) {
          partes.push(`Licencia de tránsito: ${v.licenciaTransito.numeroLicencia}${v.licenciaTransito.organismoTransito ? ` · ${v.licenciaTransito.organismoTransito}` : ''}`)
        }
        if (v.notas) partes.push(`Notas: ${v.notas}`)
        if (v.documentos?.manualUrl || v.documentos?.fichaUrl) {
          partes.push(`Documentos: ${[v.documentos.manualUrl ? 'manual' : '', v.documentos.fichaUrl ? 'ficha técnica' : ''].filter(Boolean).join(' · ')}`)
        }
        push({ rol: 'ia', texto: partes.join('\n') })
      } catch {
        push({ rol: 'ia', texto: 'No pude obtener el detalle del vehículo.' })
      }
      return true
    }

    if (op.nombre === 'renovar_soat') {
      const vehiculoId = String(p.vehiculoId ?? '').trim()
      if (!vehiculoId) {
        push({ rol: 'ia', texto: 'Falta el ID del vehículo. Dime cuál quieres renovar.' })
        return true
      }
      try {
        const v = await obtenerVehiculo(vehiculoId)
        const r = await renovarSoat(vehiculoId)
        if (!r) {
          push({ rol: 'ia', texto: 'Ese vehículo no tiene SOAT con fecha de vencimiento para renovar.' })
          return true
        }
        invalidarSnapshotFinanciero()
        const nombre = v ? ` del ${v.marca} ${v.linea}${v.placa ? ` (${v.placa})` : ''}` : ''
        push({
          rol: 'ia',
          texto: `✅ SOAT renovado${nombre}. Nuevo vencimiento: ${formatoFecha(r.fechaVencimiento)} (inicio ${formatoFecha(r.fechaInicioVigencia)}).`,
        })
      } catch (e: any) {
        push({ rol: 'ia', texto: `No pude renovar el SOAT: ${e?.message ?? 'error'}` })
      }
      return true
    }

    if (op.nombre === 'renovar_tecnomecanica') {
      const vehiculoId = String(p.vehiculoId ?? '').trim()
      if (!vehiculoId) {
        push({ rol: 'ia', texto: 'Falta el ID del vehículo. Dime cuál quieres renovar.' })
        return true
      }
      try {
        const v = await obtenerVehiculo(vehiculoId)
        const r = await renovarTecnicomecanica(vehiculoId)
        if (!r) {
          push({ rol: 'ia', texto: 'Ese vehículo no tiene Tecnicomecánica con fecha de vencimiento para renovar.' })
          return true
        }
        invalidarSnapshotFinanciero()
        const nombre = v ? ` del ${v.marca} ${v.linea}${v.placa ? ` (${v.placa})` : ''}` : ''
        push({
          rol: 'ia',
          texto: `✅ Tecnicomecánica renovada${nombre}. Nuevo vencimiento: ${formatoFecha(r.fechaVencimiento)} (expedición ${formatoFecha(r.fechaExpedicion)}).`,
        })
      } catch (e: any) {
        push({ rol: 'ia', texto: `No pude renovar la TM: ${e?.message ?? 'error'}` })
      }
      return true
    }

    if (op.nombre === 'pago_nomina') {
      const monto = Number(p.monto) || 0
      const fecha = String(p.fecha ?? '').slice(0, 10) || hoyISO()
      const nombre = String(p.nombre ?? '').trim()
      const nombreNorm = normalizarNombre(nombre)
      try {
        const nominas = (await listarNomina()).filter((n) => n.activo !== false)
        const candidatos = nombreNorm
          ? nominas.filter((n) => {
              const completo = normalizarNombre(n.nombreCompleto)
              return completo === nombreNorm || completo.includes(nombreNorm) || nombreNorm.includes(completo)
            })
          : nominas

        const match =
          candidatos.length === 1
            ? candidatos[0]
            : !nombreNorm && nominas.length === 1
              ? nominas[0]
              : undefined

        if (!match && nominas.length > 0) {
          const lista = candidatos.length > 1 ? candidatos : nominas
          push({
            rol: 'ia',
            texto:
              (nombre && candidatos.length === 0
                ? `No encontré a "${nombre}" en tu nómina activa. `
                : 'Tienes varios empleados activos en nómina. ') +
              `¿A quién le registro el pago?\n\n${lista
                .map((n) => `• ${n.nombreCompleto} (${COD(totalMensualNomina(n))})`)
                .join('\n')}`,
          })
          return true
        }

        const cuentaNominaId = match?.cuentaBancoId || cuentas[0]?.id
        if (!cuentaNominaId) {
          push({ rol: 'ia', texto: 'Primero debes tener al menos una cuenta en "Cuentas" para descontar el pago de nómina.' })
          return true
        }
        if (match) {
          const r = await registrarPagoNomina(match.id, {
            cuentaBancoId: cuentaNominaId,
            fecha,
            fuente: 'chat_IA',
            montoOverride: monto > 0 ? monto : undefined,
          })
          if (!r.ok) {
            if (r.saldoInsuficiente) {
              push({
                rol: 'ia',
                texto: `No pude cobrar la nómina de "${match.nombreCompleto}": la cuenta "${r.cuentaNombre ?? ''}" solo tiene ${COD(r.saldoDisponible ?? 0)} y el pago es ${COD(r.monto ?? totalMensualNomina(match))}.`,
              })
            } else {
              push({ rol: 'ia', texto: `No pude registrar el pago de nómina de "${match.nombreCompleto}".` })
            }
            return true
          }
          invalidarSnapshotFinanciero()
          listarCuentasBanco().then(setCuentas).catch(() => {})
          void cargarPulso()
          const extra =
            (r.adicional ?? 0) > 0 && !monto
              ? ` (base ${COD(r.base ?? 0)} + ARL/adicional ${COD(r.adicional ?? 0)})`
              : ''
          push({
            rol: 'ia',
            texto: `✅ Registré el pago de nómina de ${COD(r.monto ?? 0)}${extra} a ${match.nombreCompleto} (${fecha}).`,
          })
          return true
        }

        if (monto <= 0) {
          push({ rol: 'ia', texto: 'No tienes empleados en nómina registrados. Dime el monto del pago para registrarlo.' })
          return true
        }
        await crearMovimiento({
          fecha,
          tipo: 'pago_nomina',
          concepto: `Pago de nómina${nombre ? ' a ' + nombre : ''}`,
          monto,
          categoria: 'Nómina',
          cuentaBancoId: cuentaNominaId,
          fuente: 'chat_IA',
        })
        invalidarSnapshotFinanciero()
        listarCuentasBanco().then(setCuentas).catch(() => {})
        void cargarPulso()
        push({
          rol: 'ia',
          texto: `✅ Registré el pago de nómina de ${COD(monto)}${nombre ? ` a ${nombre}` : ''} (${fecha}).`,
        })
      } catch (e: any) {
        console.error('Error al registrar pago de nómina:', e)
        push({ rol: 'ia', texto: `No se pudo registrar el pago de nómina (${e?.message || e?.code || 'error'}).` })
      }
      return true
    }

    if (op.nombre === 'crear_recurrente') {
      const monto = Math.round(Number(p.monto ?? p.valor) || 0)
      if (!Number.isFinite(monto) || monto <= 0) {
        push({
          rol: 'ia',
          texto: 'Para crear el gasto recurrente necesito un monto mayor a cero. Dime de cuánto es y lo dejo programado.',
        })
        return true
      }
      const concepto = String(p.concepto ?? '').trim() || 'Gasto recurrente'
      const categoria = normalizarCategoria(String(p.categoria ?? 'otro'))
      const periodicidad = normalizarPeriodicidad(String(p.periodicidad ?? 'mensual'))
      const diaRaw = Number(p.diaVencimiento)
      const dia = Number.isFinite(diaRaw) ? Math.round(diaRaw) : undefined
      try {
        await crearRecurrente({
          concepto,
          categoria,
          valor: monto,
          periodicidad,
          diaVencimiento: dia && dia >= 1 && dia <= 31 ? dia : undefined,
          fechaInicio: hoyISO(),
          cuentaBancoId: cuentas[0]?.id,
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
        push({ rol: 'ia', texto: `No se pudo crear el gasto recurrente (${e?.message || e?.code || 'error'}).` })
      }
      return true
    }

    if (op.nombre === 'crear_evento') {
      const fecha = String(p.fecha ?? '').slice(0, 10) || hoyISO()
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
        if (estadoGoogleCalendar().conectado) sincronizarPendientes().catch(() => {})
        push({ rol: 'ia', texto: `📅 Anoté "${titulo}" para el ${fecha}. Te aviso un día antes.` })
      } catch (e: any) {
        console.error('Error al crear evento:', e)
        push({ rol: 'ia', texto: `No se pudo crear el evento (${e?.message || e?.code || 'error'}).` })
      }
      return true
    }

    return false
  }

  const send = async () => {
    const texto = msg.trim()
    if (!texto || pensando) return
    const epochActual = epochRef.current
    setMsg('')
    setError('')
    push({ rol: 'user', texto })
    setPensando(true)
    try {
      const historial = msgs
        .filter((m) => (m.texto.trim() || m.borrador) && m.id !== 0)
        .slice(-8)
        .map((m) => {
          const resumenBorrador = m.borrador
            ? ` [Borrador ${m.estado ?? 'pendiente'}: ${m.borrador.tipo} ${COD(m.borrador.monto)} · ${m.borrador.concepto} · ${m.borrador.fecha}]`
            : ''
          return { rol: m.rol, texto: `${m.texto}${resumenBorrador}`.trim() }
        })

      const snapshot = await construirSnapshotFinanciero().catch(() => undefined)
      if (epochRef.current !== epochActual) return

      const interp = await interpretar(texto, { cuentas: cuentas.map((c) => c.nombre), historial, snapshot })
      if (epochRef.current !== epochActual) return

      const ops: AccionInterpretada[] = interp.lote?.length
        ? interp.lote
        : interp.acciones.length
          ? [{ nombre: interp.acciones[0], borrador: interp.borrador, params: interp.params }]
          : []

      const registros = ops.filter((o) => o.nombre === 'requiere_confirmacion' && o.borrador)
      const otras = ops.filter((o) => !(o.nombre === 'requiere_confirmacion' && o.borrador))

      // Ejecutar acciones inmediatas ANTES de decidir si mostrar interp.respuesta
      // para evitar burbujas optimistas contradictorias si la acción falla.
      let algunaAccionRespondio = false
      for (const op of otras) {
        if (epochRef.current !== epochActual) return
        const respondio = await ejecutarAccion(op)
        if (respondio) algunaAccionRespondio = true
      }

      if (epochRef.current !== epochActual) return

      registros.forEach((op, i) => {
        push({
          rol: 'ia',
          texto: i === 0 ? interp.respuesta || 'Revisa y confirma si está bien 👇' : 'Otro movimiento para confirmar 👇',
          borrador: op.borrador,
          estado: 'pendiente',
        })
      })

      if (!registros.length && !algunaAccionRespondio && interp.respuesta) {
        push({ rol: 'ia', texto: interp.respuesta })
      }

      if (!ops.length && !interp.respuesta) {
        push({ rol: 'ia', texto: 'Cuéntame en qué te ayudo con tu plata. 💛' })
      }
    } catch (e) {
      if (epochRef.current !== epochActual) return
      console.error('Error al interpretar el mensaje:', e)
      push({ rol: 'ia', texto: 'Uy, se me cruzaron los cables un segundo. ¿Me repites eso?' })
    } finally {
      if (epochRef.current === epochActual) {
        setPensando(false)
      }
    }
  }

  const confirmar = async (id: number, data: MovimientoConfirmado) => {
    if (enProcesoRef.current.has(id)) return
    enProcesoRef.current.add(id)
    setGuardandoIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setError('')
    try {
      await crearMovimiento({
        fecha: data.fecha,
        tipo: data.tipo,
        concepto: data.concepto,
        descripcion: data.descripcion,
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
      enProcesoRef.current.delete(id)
      setGuardandoIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const cancelar = (id: number) => {
    if (enProcesoRef.current.has(id)) return
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, estado: 'cancelado' } : m)))
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* COLUMNA DEL CHAT */}
      <Card className="glass-card surface-glow flex flex-col overflow-hidden border-0 max-md:h-[calc(100dvh-56px)] max-md:rounded-none">
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
            type="button"
            onClick={limpiarChat}
            disabled={pensando}
            title="Nueva conversación"
            aria-label="Nueva conversación"
            className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] p-2 text-mist-300 transition-all hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
                            guardando={guardandoIds.has(m.id)}
                            onConfirm={(data) => void confirmar(m.id, data)}
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
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-xs text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1 max-md:pb-[env(safe-area-inset-bottom)]">
            <Input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Ej: gasté 35.000 en gasolina y me regalaron 20.000..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send()
              }}
              aria-label="Mensaje para Lucía"
              className="field-dark h-12 rounded-2xl text-sm shadow-none"
            />
            <motion.div whileTap={{ scale: 0.94 }} className="shrink-0">
              <Button
                onClick={() => void send()}
                disabled={pensando}
                aria-label="Enviar mensaje"
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
            {estadoTasas === 'listo' ? (
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
            ) : estadoTasas === 'cargando' ? (
              <div className="animate-shimmer h-16 rounded-xl" />
            ) : (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[11px] text-mist-500">
                Tasas no disponibles sin conexión.
              </div>
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
            {estadoPulso === 'listo' ? (
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
            ) : estadoPulso === 'cargando' ? (
              <div className="animate-shimmer h-28 rounded-xl" />
            ) : (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center text-[11px] text-mist-500">
                Sin movimientos registrados en los últimos 6 meses.
              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
