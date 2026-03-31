import { useEffect, useState } from "react";
import { BarChart3, FileText, Megaphone } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkJobsTab } from "@/features/campaigns/components/BulkJobsTab";
import { ScheduledMessagesTab } from "@/features/campaigns/components/ScheduledMessagesTab";
import { BulkSendTab } from "@/features/messages/components/BulkSendTab";
import { MessageTemplatesTab } from "@/features/messages/components/MessageTemplatesTab";

const campaignTabs = ["campanhas", "modelos"] as const;

type CampaignTab = (typeof campaignTabs)[number];

function getCampaignTab(value: string | null): CampaignTab {
  if (value === "nova-campanha") return "campanhas";
  if (value === "execucoes") return "campanhas";
  if (value === "executores") return "campanhas";
  if (value === "agendamentos") return "campanhas";
  return campaignTabs.includes(value as CampaignTab)
    ? (value as CampaignTab)
    : "campanhas";
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

    if (searchParams.get("tab") !== tabFromUrl) {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("tab", tabFromUrl);
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

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
          <TabsTrigger value="campanhas" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Modelos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="mt-4">
          <div className="space-y-6">
            <BulkSendTab compactTrigger />
            <BulkJobsTab mode="stats" />
            <ScheduledMessagesTab />
            <BulkJobsTab mode="list" title="Historico de campanhas realizadas" />
          </div>
        </TabsContent>

        <TabsContent value="modelos" className="mt-4">
          <MessageTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
