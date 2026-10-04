import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ChatPage() {
  const [msg, setMsg] = useState('')
  const [hist, setHist] = useState<string[]>([])
  const send = () => {
    if (!msg.trim()) return
    setHist((h) => [...h, 'TU: ' + msg, 'IA: (pendiente conectar Genkit)'])
    setMsg('')
  }
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>CashMet - Chat IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-80 overflow-auto border rounded-md p-3 bg-muted/20 text-sm">
            {hist.map((m, i) => (
              <div key={i} className="mb-1">
                {m}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Escribe gasto/ingreso/saldo..." onKeyDown={(e) => e.key === 'Enter' && send()} />
            <Button onClick={send}>Enviar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
