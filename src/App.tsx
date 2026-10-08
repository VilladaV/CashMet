import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ChatPage from './features/chat/ChatPage'
import CalendarioPage from './features/calendario/CalendarioPage'
import DashboardPage from './features/dashboard/DashboardPage'

export default function App() {
  return (
    <Tabs defaultValue="chat" className="w-full">
      <div className="border-b">
        <TabsList className="mx-auto max-w-6xl">
          <TabsTrigger value="chat">Chat IA</TabsTrigger>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="chat">
        <ChatPage />
      </TabsContent>
      <TabsContent value="calendario">
        <CalendarioPage />
      </TabsContent>
      <TabsContent value="dashboard">
        <DashboardPage />
      </TabsContent>
    </Tabs>
  )
}
