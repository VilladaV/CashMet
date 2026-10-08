import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { generarCalendarioTool } from '@/ai/tools/calendario'
import { useEffect } from 'react'

export default function CalendarioPage() {
  const [generando, setGenerando] = useState(false)
  const [msg, setMsg] = useState('')

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>Calendario (Colombia)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Genera vencimientos: SOAT, tecnicomecánica, STR, sueldos, primas julio/diciembre, predial, renovaciones.</p>
          <Button disabled={generando} onClick={async () => { setGenerando(true); setMsg(''); try { await generarCalendarioTool.run({ meses: 12, incluirPrimasNomina: true }) } catch (e:any) { setMsg(e?.message||'Error') } setGenerando(false); setMsg('Solicitado') }}>
            {generando ? 'Generando...' : 'Generar eventos (12 meses)'}
          </Button>
          {msg && <div className="text-xs">{msg}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
