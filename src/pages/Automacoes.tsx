import { useEffect, useState } from 'react';
import { Zap, Send, Calendar, RotateCcw, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkJobsTab } from '@/components/automacoes/BulkJobsTab';
import { ScheduledMessagesTab } from '@/components/automacoes/ScheduledMessagesTab';
import { RotinasTab } from '@/components/automacoes/RotinasTab';
import { BulkSendTab } from '@/components/messages/BulkSendTab';
import { MessageTemplatesTab } from '@/components/messages/MessageTemplatesTab';
import { useSearchParams } from 'react-router-dom';

const automationTabs = ['envio-massa', 'jobs', 'modelos', 'agendamentos', 'rotinas'] as const;

type AutomationTab = (typeof automationTabs)[number];

function getAutomationTab(value: string | null): AutomationTab {
  return automationTabs.includes(value as AutomationTab) ? (value as AutomationTab) : 'jobs';
}

export default function Automacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AutomationTab>(() => getAutomationTab(searchParams.get('tab')));

  useEffect(() => {
    const tabFromUrl = getAutomationTab(searchParams.get('tab'));
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [activeTab, searchParams]);

  const handleTabChange = (value: string) => {
    const nextTab = getAutomationTab(value);
    setActiveTab(nextTab);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('tab', nextTab);
    setSearchParams(nextSearchParams, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Automações
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Centralize envios em massa, modelos, jobs, agendamentos e rotinas automáticas.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="envio-massa" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Envio em Massa
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Jobs de Envio
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Modelos
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

        <TabsContent value="envio-massa" className="mt-4">
          <BulkSendTab />
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <BulkJobsTab />
        </TabsContent>

        <TabsContent value="modelos" className="mt-4">
          <MessageTemplatesTab />
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
