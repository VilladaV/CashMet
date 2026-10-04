import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function CalendarioPage() {
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Calendario - Vencimientos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>SOAT, Tecnicomecanica, Seguro TR, Primas julio/diciembre, Sueldos, Cuotas deudas, Predial.</p>
          <div className="flex gap-2">
            <Button size="sm">Generar vencimientos este año</Button>
            <Button size="sm" variant="secondary">
              Sincronizar con Google Calendar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
