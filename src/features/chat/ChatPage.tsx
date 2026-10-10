import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { interpretarMensaje } from './engine'
import ConfirmacionCard, { type MovimientoConfirmado } from './ConfirmacionCard'
import type { BorradorMovimiento } from '@/ai/parser/nl'
import {
  crearMovimiento,
  listarCuentasBanco,
  listarMovimientos,
  obtenerResumenSaldos,
  type CuentaBanco,
} from '@/lib/firebase/movimientosRepo'

interface Msg {
  id: number
  rol: 'user' | 'ia'
  texto: string
  borrador?: BorradorMovimiento
  estado?: 'pendiente' | 'guardado' | 'cancelado'
}

const COD = (n: number) => `$${n.toLocaleString('es-CO')} COP`

export default function ChatPage() {
  const [msg, setMsg] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 0,
      rol: 'ia',
      texto:
        'Hola. Escríbeme por ejemplo: "gasté 50.000 en mercado", "me consignaron 3.000.000 de salario", "¿cuánto tengo?" o "muéstrame los últimos movimientos".',
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
      .catch(() => setError('No se pudieron cargar las cuentas. ¿Reglas de Firestore desplegadas?'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const push = (m: Omit<Msg, 'id'>) => {
    const id = idRef.current++
    setMsgs((prev) => [...prev, { ...m, id }])
    return id
  }

  const send = async () => {
    const texto = msg.trim()
    if (!texto) return
    setMsg('')
    setError('')
    push({ rol: 'user', texto })

    const interp = interpretarMensaje(texto)

    if (interp.acciones.includes('consulta_saldos')) {
      try {
        const { cuentas: cs, total } = await obtenerResumenSaldos()
        if (!cs.length) {
          push({ rol: 'ia', texto: 'No tienes cuentas registradas aún. Ve a la pestaña "Cuentas" para crear la primera.' })
        } else {
          const detalle = cs
            .map((c) => `• ${c.nombre}: ${COD(Number(c.saldoActual) || 0)}`)
            .join('\n')
          push({ rol: 'ia', texto: `Saldo total: ${COD(total)}\n${detalle}` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude consultar los saldos.' })
      }
      return
    }

    if (interp.acciones.includes('busqueda_movimientos')) {
      try {
        const movs = await listarMovimientos(10)
        if (!movs.length) {
          push({ rol: 'ia', texto: 'No hay movimientos registrados todavía.' })
        } else {
          const detalle = movs
            .map((m) => `• ${m.fecha} — ${m.concepto}: ${COD(Number(m.monto) || 0)} (${m.tipo})`)
            .join('\n')
          push({ rol: 'ia', texto: `Últimos ${movs.length} movimientos:\n${detalle}` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude buscar los movimientos.' })
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
        texto: `Guardado: ${data.tipo} de ${COD(data.monto)} — ${data.concepto} (${data.categoria}).`,
      })
      if (data.cuentaBancoId) {
        listarCuentasBanco().then(setCuentas).catch(() => {})
      }
    } catch (e: any) {
      console.error('Error al guardar movimiento:', e)
      const code = e?.code || (e && e.name) || 'desconocido'
      const msg = e?.message ? ` ${e.message}` : ''
      setError(`No se pudo guardar el movimiento (${code}).${msg}`)
    } finally {
      setGuardandoId(null)
    }
  }

  const cancelar = (id: number) => {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, estado: 'cancelado' } : m)))
  }

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>CashMet - Chat IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-96 overflow-auto border rounded-md p-3 bg-muted/20 text-sm space-y-2">
            {msgs.map((m) => (
              <div key={m.id}>
                <div className={m.rol === 'user' ? 'text-right' : ''}>
                  <span className="whitespace-pre-wrap">{m.texto}</span>
                </div>
                {m.borrador && m.estado === 'pendiente' && (
                  <div className="mt-2">
                    <ConfirmacionCard
                      borrador={m.borrador}
                      cuentas={cuentas}
                      guardando={guardandoId === m.id}
                      onConfirm={(data) => confirmar(m.id, data)}
                      onCancel={() => cancelar(m.id)}
                    />
                  </div>
                )}
                {m.estado === 'guardado' && <div className="text-xs text-green-700 mt-1">✔ Movimiento guardado</div>}
                {m.estado === 'cancelado' && <div className="text-xs text-muted-foreground mt-1">Cancelado</div>}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-2">
            <Input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Escribe gasto/ingreso/saldo..."
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <Button onClick={send}>Enviar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
