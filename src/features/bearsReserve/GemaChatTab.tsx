import { useState, useRef, useEffect } from 'react'
import type { EmpleadoOperativo, MisionComunitaria, TurnoSemanal, VehiculoOperativo } from './types'
import { responderGema } from './gemaEngine'
import { Send, User, RefreshCw } from 'lucide-react'

function horaActual(): string {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
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
  onRotarTurnos: () => void
}

interface MensajeGema {
  id: string
  remitente: 'usuario' | 'gema'
  texto: string
  hora: string
}

const SALUDO_INICIAL_GEMA = `👋 ¡Hola de corazón! Soy **Gema** 💎, oficial de operaciones de **Bear's Reserve** 🐻.

Aquí en la radio comunitaria tengo ojos en Manizales y los caminos rurales de Caldas. ¿En qué puedo apoyarte hoy? Puedo rotarte los turnos semanales respetando los horarios de estudio (máx 42h), revisar el combustible de la flota o coordinar la ruta escolar. ❤️🏔️`

export default function GemaChatTab({
  empleados,
  vehiculos,
  turnos,
  misiones,
  onRotarTurnos,
}: Props) {
  const [mensajes, setMensajes] = useState<MensajeGema[]>([
    {
      id: 'gema-init',
      remitente: 'gema',
      texto: SALUDO_INICIAL_GEMA,
      hora: 'En vivo',
    },
  ])
  const [input, setInput] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, escribiendo])

  const enviar = (textoDirecto?: string) => {
    const textoAEnviar = textoDirecto || input.trim()
    if (!textoAEnviar) return

    const hora = horaActual()
    const userMsg: MensajeGema = {
      id: crearMsgId('u'),
      remitente: 'usuario',
      texto: textoAEnviar,
      hora,
    }

    setMensajes((prev) => [...prev, userMsg])
    if (!textoDirecto) setInput('')
    setEscribiendo(true)

    window.setTimeout(() => {
      const res = responderGema(textoAEnviar, { empleados, vehiculos, turnos, misiones })
      const gemaMsg: MensajeGema = {
        id: crearMsgId('g'),
        remitente: 'gema',
        texto: res.respuesta,
        hora: horaActual(),
      }
      setMensajes((prev) => [...prev, gemaMsg])
      setEscribiendo(false)

      if (res.accion?.tipo === 'rotar_turnos') {
        onRotarTurnos()
      }
    }, 600)
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
      {/* Barra superior de Radio Gema */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-teal-400 to-emerald-400 font-black text-[#04241a] shadow-md">
            💎
          </span>
          <div>
            <div className="flex items-center gap-1.5 font-extrabold text-white">
              <span>Gema · Radio de Operaciones Bear&apos;s Reserve</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[11px] text-mist-400">
              Coordinación comunitaria 24/7 · Manizales, Caldas y Eje Cafetero 🐻
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setMensajes([
              {
                id: `gema-${Date.now()}`,
                remitente: 'gema',
                texto: SALUDO_INICIAL_GEMA,
                hora: 'Ahora',
              },
            ])
          }
          className="cursor-pointer rounded-lg bg-white/[0.06] p-1.5 text-mist-400 hover:bg-white/10 hover:text-white"
          title="Reiniciar chat"
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
                <div className="whitespace-pre-wrap leading-relaxed text-xs">{m.texto}</div>
                <div
                  className={`mt-1 text-right text-[9px] font-mono ${
                    esGema ? 'text-mist-500' : 'text-[#04241a]/70 font-bold'
                  }`}
                >
                  {m.hora}
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
            <span>💎 Gema está revisando la radio comunitaria...</span>
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
            onClick={() => enviar(chip)}
            className="cursor-pointer rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-400/20"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Campo de entrada de texto */}
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              enviar()
            }
          }}
          placeholder="Escríbele a Gema: turnos, rutas escolares, camiones varados o gasolina..."
          className="field-dark h-10 flex-1 rounded-2xl px-3.5 text-xs shadow-inner"
        />
        <button
          type="button"
          onClick={() => enviar()}
          disabled={!input.trim()}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-sky-400 to-teal-400 text-[#04241a] transition hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
