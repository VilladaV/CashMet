import { useState, useRef, useEffect } from 'react'
import type {
  EmpleadoOperativo,
  EventoRadarLocal,
  MensajeGema,
  MisionComunitaria,
  PreciosCombustible,
  RutaHabitual,
  TarjetaCombustibleReserva,
  TurnoSemanal,
  VehiculoOperativo,
} from './types'
import { empleadosEnTurnoAhora, responderGema } from './gemaEngine'
import { conversarConGemaAI } from './gemaAI'
import { geminiDisponible } from '@/ai/gemini'
import { hoyISO } from '@/lib/fechas'
import TextoEnriquecido from '@/features/chat/TextoEnriquecido'
import { Send, User, RefreshCw, Sparkles } from 'lucide-react'

function horaActual(): string {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function horaActual24(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

let counterMsg = 1
function crearMsgId(prefix: string): string {
  return `${prefix}-${Date.now()}-${counterMsg++}`
}

interface Props {
  empleados: EmpleadoOperativo[]
  vehiculos: VehiculoOperativo[]
  turnos: TurnoSemanal[]
  misiones: MisionComunitaria[]
  rutasHabituales: RutaHabitual[]
  eventosRadar: EventoRadarLocal[]
  tarjetaCombustible: TarjetaCombustibleReserva
  preciosCombustible: PreciosCombustible
  mensajesPersistidos?: MensajeGema[]
  onGuardarMensajes?: (mensajes: MensajeGema[]) => Promise<void> | void
  onRotarTurnos: () => Promise<void> | void
  onTanquearVehiculo?: (vehiculoId: string) => Promise<void>
  onEscanearRadar?: () => Promise<void>
  onActualizarPrecios?: () => Promise<void>
}

const SALUDO_INICIAL_GEMA = `👋 ¡Hola de corazón! Soy **Gema** 💎, oficial de operaciones de **Bear's Reserve** 🐻.

Estoy conectada en vivo con tu flota, el cuadrante 24/7, las rutas escolares, el radar de Manizales/Caldas y la tarjeta de combustible. ¿Qué coordinamos hoy? ❤️🏔️`

function mensajeBienvenida(): MensajeGema {
  return {
    id: 'gema-init',
    remitente: 'gema',
    texto: SALUDO_INICIAL_GEMA,
    hora: 'En vivo',
    fuente: geminiDisponible ? 'gemini' : 'local',
  }
}

export default function GemaChatTab({
  empleados,
  vehiculos,
  turnos,
  misiones,
  rutasHabituales,
  eventosRadar,
  tarjetaCombustible,
  preciosCombustible,
  mensajesPersistidos = [],
  onGuardarMensajes,
  onRotarTurnos,
  onTanquearVehiculo,
  onEscanearRadar,
  onActualizarPrecios,
}: Props) {
  const [mensajes, setMensajes] = useState<MensajeGema[]>(() =>
    mensajesPersistidos.length > 0 ? mensajesPersistidos : [mensajeBienvenida()]
  )
  const [input, setInput] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, escribiendo])

  const actualizarYGuardar = (nuevos: MensajeGema[]) => {
    setMensajes(nuevos)
    if (onGuardarMensajes) {
      void onGuardarMensajes(nuevos)
    }
  }

  const enviar = async (textoDirecto?: string) => {
    const textoAEnviar = (textoDirecto || input).trim()
    if (!textoAEnviar || escribiendo) return

    const userMsg: MensajeGema = {
      id: crearMsgId('u'),
      remitente: 'usuario',
      texto: textoAEnviar,
      hora: horaActual(),
    }

    const historialConUsuario = [...mensajes, userMsg]
    actualizarYGuardar(historialConUsuario)
    if (!textoDirecto) setInput('')
    setEscribiendo(true)

    try {
      const enTurnoAhora = empleadosEnTurnoAhora(turnos, empleados, hoyISO(), horaActual24())

      // 1. Intentar conversar con Gemini AI con contexto completo de Bear's Reserve
      const resGemini = await conversarConGemaAI(textoAEnviar, historialConUsuario, {
        empleados,
        vehiculos,
        turnos,
        misiones,
        rutasHabituales,
        eventosRadar,
        tarjetaCombustible,
        preciosCombustible,
        enTurnoAhora,
      })

      if (resGemini) {
        const gemaMsg: MensajeGema = {
          id: crearMsgId('g'),
          remitente: 'gema',
          texto: resGemini.respuesta,
          hora: horaActual(),
          fuente: 'gemini',
        }
        actualizarYGuardar([...historialConUsuario, gemaMsg])

        // Ejecutar acciones estructuradas solicitadas por Gema Gemini
        for (const acc of resGemini.acciones) {
          if (acc.tipo === 'rotar_turnos') await onRotarTurnos()
          else if (acc.tipo === 'tanquear_vehiculo' && acc.vehiculoId && onTanquearVehiculo) {
            await onTanquearVehiculo(acc.vehiculoId).catch(() => undefined)
          } else if (acc.tipo === 'escanear_radar' && onEscanearRadar) {
            await onEscanearRadar()
          } else if (acc.tipo === 'actualizar_precios' && onActualizarPrecios) {
            await onActualizarPrecios()
          }
        }
        return
      }

      // 2. Respaldo local (si no hay API key o Gemini está sin cuota)
      const resLocal = responderGema(textoAEnviar, {
        empleados,
        vehiculos,
        turnos,
        misiones,
        eventosRadar,
        rutasHabituales,
        preciosCombustible,
      })

      const gemaMsg: MensajeGema = {
        id: crearMsgId('g'),
        remitente: 'gema',
        texto: resLocal.respuesta,
        hora: horaActual(),
        fuente: 'local',
      }
      actualizarYGuardar([...historialConUsuario, gemaMsg])

      if (resLocal.accion?.tipo === 'rotar_turnos') {
        await onRotarTurnos()
      } else if (resLocal.accion?.tipo === 'escanear_radar' && onEscanearRadar) {
        await onEscanearRadar()
      } else if (resLocal.accion?.tipo === 'actualizar_precios' && onActualizarPrecios) {
        await onActualizarPrecios()
      }
    } finally {
      setEscribiendo(false)
    }
  }

  const chips = [
    '📋 Generar informe de hoy',
    '¿Quién está de guardia hoy? 👤',
    'Rotar turnos semanales (máx 42h) 💎',
    '¿Cómo está el combustible de la flota? ⛽',
    '¿Hay alertas viales en Caldas? 🚨',
  ]

  return (
    <div className="flex h-[620px] flex-col rounded-3xl border border-sky-400/25 bg-gradient-to-b from-sky-950/20 via-black/40 to-night-900 text-xs shadow-2xl backdrop-blur-md">
      {/* Barra superior */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-teal-400 to-emerald-400 font-black text-[#04241a] shadow-md">
            💎
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 font-extrabold text-white">
              <span>Gema · Radio de Operaciones Bear&apos;s Reserve</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/15 px-2 py-0.5 text-[9px] font-bold text-sky-200">
                <Sparkles className="h-2.5 w-2.5" />
                {geminiDisponible ? 'Gemini IA en vivo' : 'Modo respaldo local'}
              </span>
            </div>
            <div className="text-[11px] text-mist-400">
              Coordinación comunitaria 24/7 · Historial sincronizado en Firestore 🐻
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => actualizarYGuardar([mensajeBienvenida()])}
          className="cursor-pointer rounded-lg bg-white/[0.06] p-1.5 text-mist-400 hover:bg-white/10 hover:text-white"
          title="Reiniciar conversación"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mensajes.map((m) => {
          const esGema = m.remitente === 'gema'
          return (
            <div key={m.id} className={`flex gap-2.5 ${esGema ? 'justify-start' : 'justify-end'}`}>
              {esGema && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-400/20 text-sm shadow">
                  💎
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl p-3 sm:max-w-[75%] ${
                  esGema
                    ? 'border border-white/10 bg-white/[0.04] text-mist-100 shadow-md'
                    : 'bg-gradient-to-r from-sky-500 to-teal-400 font-medium text-[#04241a] shadow-lg'
                }`}
              >
                <div className="leading-relaxed text-xs">
                  {esGema ? (
                    <TextoEnriquecido texto={m.texto} />
                  ) : (
                    <div className="whitespace-pre-wrap">{m.texto}</div>
                  )}
                </div>
                <div
                  className={`mt-1 flex items-center justify-end gap-1.5 text-[9px] font-mono ${
                    esGema ? 'text-mist-500' : 'text-[#04241a]/70 font-bold'
                  }`}
                >
                  {esGema && m.fuente === 'gemini' && (
                    <span className="text-sky-400/80">Gemini IA ·</span>
                  )}
                  <span>{m.hora}</span>
                </div>
              </div>
              {!esGema && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-white">
                  <User className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          )
        })}

        {escribiendo && (
          <div className="flex items-center gap-2 text-[11px] italic text-sky-300">
            <span>💎 Gema está consultando la telemetría de Bear&apos;s Reserve...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Chips de sugerencias rápidas */}
      <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] bg-black/20 px-3 py-2">
        {chips.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            disabled={escribiendo}
            onClick={() => void enviar(chip)}
            className="cursor-pointer rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Entrada de texto */}
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <input
          type="text"
          value={input}
          disabled={escribiendo}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void enviar()
            }
          }}
          placeholder="Escríbele a Gema: turnos, alertas viales, rutas escolares, flota o tanqueos..."
          className="field-dark h-10 flex-1 rounded-2xl px-3.5 text-xs shadow-inner"
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!input.trim() || escribiendo}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-sky-400 to-teal-400 text-[#04241a] transition hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
