import { useEffect, useState } from "react";
import { BarChart3, FileText, Megaphone, Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkJobsTab } from "@/features/automations/components/BulkJobsTab";
import { BulkSendTab } from "@/features/messages/components/BulkSendTab";
import { MessageTemplatesTab } from "@/features/messages/components/MessageTemplatesTab";

const campaignTabs = ["nova-campanha", "execucoes", "modelos"] as const;

type CampaignTab = (typeof campaignTabs)[number];

function getCampaignTab(value: string | null): CampaignTab {
  if (value === "agendamentos") return "nova-campanha";
  return campaignTabs.includes(value as CampaignTab)
    ? (value as CampaignTab)
    : "nova-campanha";
}

export default function CampaignsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CampaignTab>(() =>
    getCampaignTab(searchParams.get("tab")),
  );

  useEffect(() => {
    const tabFromUrl = getCampaignTab(searchParams.get("tab"));
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [activeTab, searchParams]);

  const handleTabChange = (value: string) => {
    const nextTab = getCampaignTab(value);
    setActiveTab(nextTab);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", nextTab);
    setSearchParams(nextSearchParams, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Megaphone className="h-6 w-6 text-primary" />
            Campanhas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie envios estruturados, escolha entre entrega imediata ou agendada
            e acompanhe a execucao sem misturar campanhas com os chats
            individuais.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="nova-campanha" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Nova campanha
          </TabsTrigger>
          <TabsTrigger value="execucoes" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Execucoes
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Modelos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nova-campanha" className="mt-4">
          <BulkSendTab />
        </TabsContent>

        <TabsContent value="execucoes" className="mt-4">
          <BulkJobsTab />
        </TabsContent>

        <TabsContent value="modelos" className="mt-4">
          <MessageTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
