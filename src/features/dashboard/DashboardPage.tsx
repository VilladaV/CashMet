import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Saldos banco, deudas, patrimonio, gastos mensuales, próximos vencimientos.</p>
          <div className="flex gap-2">
            <Button size="sm">Actualizar resumen</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
