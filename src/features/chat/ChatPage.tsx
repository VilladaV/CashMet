import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { estimadosVehiculoCO, interpretarMensaje } from './engine'
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
import { construirEventos, guardarEventos } from '@/lib/firebase/calendarioRepo'

interface Msg {
  id: number
  rol: 'user' | 'ia'
  texto: string
  borrador?: BorradorMovimiento
  estado?: 'pendiente' | 'guardado' | 'cancelado'
}

const COD = (n: number) => `$${n.toLocaleString('es-CO')} COP`

const SUGERENCIAS = [
  '¿cuánto tengo?',
  'gasté 50.000 en mercado',
  'me consignaron 3.000.000 de salario',
  'muéstrame los últimos movimientos',
  'resumen de este mes',
  'genera el calendario',
]

export default function ChatPage() {
  const [msg, setMsg] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 0,
      rol: 'ia',
      texto:
        'Hola. Escríbeme por ejemplo: "gasté 50.000 en mercado", "me consignaron 3.000.000 de salario", "¿cuánto tengo?", "pagué 450.000 de cuota del crédito", "agrega vehículo Mazda 3 2019 placa ABC123", "investiga SOAT Mazda 3 2019 1500cc", "genera el calendario" o "resumen de este mes".',
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

    if (interp.acciones.includes('generar_calendario')) {
      try {
        const eventos = await construirEventos(12)
        if (!eventos.length) {
          push({
            rol: 'ia',
            texto: 'No hay vehículos, nómina o deudas registrados para generar eventos. Regístralos en sus pestañas.',
          })
        } else {
          const n = await guardarEventos(eventos)
          push({ rol: 'ia', texto: `Se guardaron ${n} eventos en el calendario para los próximos 12 meses.` })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude generar el calendario.' })
      }
      return
    }

    if (interp.acciones.includes('resumen_mes')) {
      try {
        const mes = String(interp.params?.mes ?? '')
        const todos = await listarTodosLosMovimientos(500)
        const delMes = todos.filter((m) => String(m.fecha).startsWith(mes))
        if (!delMes.length) {
          push({ rol: 'ia', texto: `No hay movimientos en ${mes}.` })
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
              `Resumen ${mes}:\nIngresos: ${COD(ingresos)}\nGastos: ${COD(gastos)}\nBalance: ${COD(ingresos - gastos)}` +
              (top ? `\n\nCategorías:\n${top}` : ''),
          })
        }
      } catch {
        push({ rol: 'ia', texto: 'No pude calcular el resumen.' })
      }
      return
    }

    if (interp.acciones.includes('pago_deuda')) {
      const monto = Number(interp.params?.monto) || 0
      const fecha = String(interp.params?.fecha ?? new Date().toISOString().slice(0, 10))
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
                ? 'No tienes deudas activas registradas. Ve a la pestaña "Deudas" para crear una.'
                : `Tengo varias deudas activas:\n${deudas.map((d) => `• ${d.nombre} (saldo ${COD(d.saldoPendiente || 0)})`).join('\n')}\n¿Cuál quieres pagar? Menciónala, ej: "pagué 100.000 de ${deudas[0].nombre}".`,
          })
          return
        }
        await registrarPagoDeuda(deuda.id, monto, fecha)
        push({
          rol: 'ia',
          texto: `Pago registrado: ${COD(monto)} a "${deuda.nombre}". Nuevo saldo: ${COD(Math.max(0, (deuda.saldoPendiente || 0) - monto))}.`,
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
          `Estimados Colombia (${String(p.marca)} ${String(p.linea)} - modelo ${p.modelo ?? '?'}):\n` +
          `• SOAT: ${COD(est.soatAnualEstimadoCOP)} (rango ${COD(est.soatRango.min)} - ${COD(est.soatRango.max)})\n` +
          `• Tecnicomecánica: ~${COD(est.tecnicomecanicaCostoEstimadoCOP)}\n` +
          `• Seguro todo riesgo: ${COD(est.seguroTodoRiesgoAnualEstimadoCOP)} (anual, rango ${COD(est.rangoSTR.min)} - ${COD(est.rangoSTR.max)})\n` +
          `\nNivel de confianza: medio. ${est.fuente} Registra el vehículo en la pestaña "Vehículos" para guardarlos definitivamente.`,
      })
      return
    }

    if (interp.acciones.includes('crear_vehiculo')) {
      const p = interp.params ?? {}
      try {
        await crearVehiculo({
          placa: String(p.placa ?? '').trim() || undefined,
          marca: String(p.marca),
          linea: String(p.linea),
          modelo: Number(p.modelo) || new Date().getFullYear(),
          tipo: String(p.tipo) as 'carro' | 'moto' | 'camion' | 'otro',
          cilindraje: Number(p.cilindraje) || undefined,
        })
        push({
          rol: 'ia',
          texto: `Vehículo registrado: ${String(p.marca)} ${String(p.linea)} (${p.modelo}). Puedes completar SOAT, tecnicomecánica y seguro en la pestaña "Vehículos".`,
        })
      } catch (e: any) {
        console.error('Error al crear vehículo:', e)
        setError(`No se pudo registrar el vehículo (${e?.code || 'error'}).`)
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
          <div className="h-96 overflow-auto border rounded-md p-3 bg-muted/20 text-sm space-y-3">
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${m.borrador && m.estado === 'pendiente' ? 'w-full' : ''}`}>
                  <div
                    className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${
                      m.rol === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-background border rounded-bl-sm'
                    }`}
                  >
                    {m.texto}
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
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex flex-wrap gap-1">
            {SUGERENCIAS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setMsg(s)}
              >
                {s}
              </Button>
            ))}
          </div>
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
