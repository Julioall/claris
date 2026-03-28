import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BellRing,
  Clock3,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clearCampaignRoutineDraft,
  readCampaignRoutineDraft,
  type CampaignRoutineDraft,
} from "../lib/campaign-routine-draft";
import { RotinasTab } from "../components/RotinasTab";

const automationTabs = ["gatilhos", "regras", "governanca"] as const;
const legacyCampaignTabs: Record<string, string> = {
  "envio-massa": "nova-campanha",
  jobs: "execucoes",
  modelos: "modelos",
  agendamentos: "nova-campanha",
};

type AutomationTab = (typeof automationTabs)[number];

function getAutomationTab(value: string | null): AutomationTab {
  return automationTabs.includes(value as AutomationTab)
    ? (value as AutomationTab)
    : "gatilhos";
}

const automationCards = [
  {
    title: "Gatilhos",
    description:
      "Eventos como atraso, silencio ou nova atividade iniciam o fluxo.",
    icon: BellRing,
  },
  {
    title: "Regras",
    description:
      "Tempo de espera, filtros e segurancas evitam excesso de contato.",
    icon: Clock3,
  },
  {
    title: "Acoes",
    description:
      "Enviar mensagem automatica ou abrir uma campanha derivada quando necessario.",
    icon: Workflow,
  },
] as const;

const automationPlaybooks = [
  {
    title: "Atividade atrasada",
    trigger: "Aluno com atividade em atraso",
    waitTime: "24h apos o vencimento",
    conditions:
      "Somente matriculas ativas e sem envio recente do mesmo alerta.",
    action: "Enviar lembrete automatico e registrar a ocorrencia.",
    followUp: "Opcionalmente abrir campanha para a turma se o atraso escalar.",
  },
  {
    title: "Falta de resposta",
    trigger: "Sem resposta depois de um contato individual",
    waitTime: "48h apos a ultima mensagem",
    conditions: "Ignorar alunos que responderam em qualquer canal monitorado.",
    action: "Enviar follow-up automatico com novo CTA.",
    followUp: "Escalonar para monitor ou tutor quando o silencio persistir.",
  },
  {
    title: "Nova atividade liberada",
    trigger: "Publicacao de atividade relevante no curso",
    waitTime: "Ate 1h apos a liberacao",
    conditions:
      "Aplicar somente a turmas configuradas para comunicacao proativa.",
    action: "Notificar automaticamente os alunos elegiveis.",
    followUp: "Opcional: criar campanha derivada para reforco em massa.",
  },
] as const;

const automationRules = [
  {
    title: "Tempo de espera",
    description:
      "Cada automacao define a janela minima entre gatilho e envio para evitar acoes impulsivas.",
  },
  {
    title: "Condicoes adicionais",
    description:
      "Filtros por turma, curso, status e resposta recente refinam quem realmente deve receber a acao.",
  },
  {
    title: "Escalonamento",
    description:
      "Quando o caso sair do fluxo automatico, a automacao pode gerar uma campanha ou encaminhar para atendimento manual.",
  },
] as const;

const governancePillars = [
  {
    title: "Chats continuam separados",
    description:
      "Moodle e WhatsApp seguem como experiencias individuais. Automacao nao substitui atendimento.",
    icon: MessageSquare,
  },
  {
    title: "Campanhas nao entram aqui",
    description:
      "Envios manuais e monitoramento de disparos ficam exclusivamente no modulo Campanhas.",
    icon: Megaphone,
  },
  {
    title: "Governanca primeiro",
    description:
      "Cada fluxo automatico precisa de gatilho, regra de espera, condicao extra e acao auditavel.",
    icon: ShieldCheck,
  },
] as const;

export default function AutomacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [campaignDraft, setCampaignDraft] =
    useState<CampaignRoutineDraft | null>(() => readCampaignRoutineDraft());
  const [activeTab, setActiveTab] = useState<AutomationTab>(() =>
    getAutomationTab(requestedTab),
  );

  useEffect(() => {
    const tabFromUrl = getAutomationTab(searchParams.get("tab"));
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [activeTab, searchParams]);

  const handleTabChange = (value: string) => {
    const nextTab = getAutomationTab(value);
    setActiveTab(nextTab);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", nextTab);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const dismissCampaignDraft = () => {
    clearCampaignRoutineDraft();
    setCampaignDraft(null);
  };

  if (requestedTab && requestedTab in legacyCampaignTabs) {
    return (
      <Navigate
        to={`/campanhas?tab=${legacyCampaignTabs[requestedTab]}`}
        replace
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Zap className="h-6 w-6 text-primary" />
            Automacoes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fluxos automaticos baseados em gatilho, separados de campanhas
            manuais e dos chats individuais do Moodle e do WhatsApp.
          </p>
        </div>

        {campaignDraft && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Rascunho recebido de Campanhas
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Use esta base para definir gatilho, espera, condicoes e a
                    acao automatica equivalente, sem misturar o fluxo manual com
                    o fluxo recorrente.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Canal Moodle</Badge>
                  <Badge variant="outline">
                    {campaignDraft.recipientCount} destinatarios
                  </Badge>
                  {campaignDraft.filters.school && (
                    <Badge variant="outline">
                      Escola: {campaignDraft.filters.school}
                    </Badge>
                  )}
                  {campaignDraft.filters.course && (
                    <Badge variant="outline">
                      Curso: {campaignDraft.filters.course}
                    </Badge>
                  )}
                  {campaignDraft.filters.className && (
                    <Badge variant="outline">
                      Turma: {campaignDraft.filters.className}
                    </Badge>
                  )}
                  {campaignDraft.filters.uc && (
                    <Badge variant="outline">
                      UC: {campaignDraft.filters.uc}
                    </Badge>
                  )}
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                  <p className="text-xs font-medium text-foreground">
                    Mensagem base
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {campaignDraft.previewMessage ||
                      campaignDraft.messageContent}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={dismissCampaignDraft}
              >
                Descartar rascunho
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {automationCards.map((card) => (
            <Card key={card.title} className="border-border/70">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <card.icon className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{card.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="gatilhos" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Gatilhos
          </TabsTrigger>
          <TabsTrigger value="regras" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5" />
            Regras
          </TabsTrigger>
          <TabsTrigger value="governanca" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Governanca
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gatilhos" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-3">
            {automationPlaybooks.map((playbook) => (
              <Card key={playbook.title} className="border-border/70">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {playbook.title}
                      </p>
                      <Badge variant="outline">Blueprint</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {playbook.trigger}
                    </p>
                  </div>

                  <div className="space-y-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">Espera</p>
                      <p className="mt-1">{playbook.waitTime}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Condicoes</p>
                      <p className="mt-1">{playbook.conditions}</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="font-medium text-foreground">
                        Acao principal
                      </p>
                      <p className="mt-1">{playbook.action}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-primary">
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span>{playbook.followUp}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="regras" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="grid gap-4">
              {automationRules.map((rule) => (
                <Card key={rule.title} className="border-border/70">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Workflow className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {rule.title}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {rule.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-border/70">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-semibold text-foreground">
                  Estrutura minima de uma automacao
                </p>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="font-medium text-foreground">1. Evento</p>
                    <p className="mt-1">
                      O que aconteceu para iniciar o fluxo.
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="font-medium text-foreground">2. Espera</p>
                    <p className="mt-1">
                      Quanto tempo o sistema aguarda antes de agir.
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="font-medium text-foreground">3. Condicoes</p>
                    <p className="mt-1">
                      Quem pode ou nao pode entrar na execucao.
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="font-medium text-foreground">4. Acao</p>
                    <p className="mt-1">
                      Mensagem automatica ou campanha derivada com
                      rastreabilidade.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="governanca" className="mt-4">
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              {governancePillars.map((pillar) => (
                <Card key={pillar.title} className="border-border/70">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <pillar.icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {pillar.title}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {pillar.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <RotinasTab />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
