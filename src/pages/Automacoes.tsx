import { useState } from 'react';
import { Zap, Send, Calendar, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkJobsTab } from '@/components/automacoes/BulkJobsTab';
import { ScheduledMessagesTab } from '@/components/automacoes/ScheduledMessagesTab';
import { RotinasTab } from '@/components/automacoes/RotinasTab';

export default function Automacoes() {
  const [activeTab, setActiveTab] = useState('jobs');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Automações
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Gerencie jobs de envio em massa, mensagens agendadas e rotinas automáticas.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="jobs" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Jobs de Envio
          </TabsTrigger>
          <TabsTrigger value="agendamentos" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Agendamentos
          </TabsTrigger>
          <TabsTrigger value="rotinas" className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Rotinas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4">
          <BulkJobsTab />
        </TabsContent>

        <TabsContent value="agendamentos" className="mt-4">
          <ScheduledMessagesTab />
        </TabsContent>

        <TabsContent value="rotinas" className="mt-4">
          <RotinasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
