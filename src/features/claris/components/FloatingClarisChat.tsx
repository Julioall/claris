import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Expand, MessageCircle, MoreHorizontal, Pencil, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClarisIcon } from '@/components/ui/claris-logo';
import { cn } from '@/lib/utils';
import { CLARIS_CONFIGURED_STORAGE_KEY } from '@/lib/claris-settings';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { useMoodleSession } from '@/features/auth/context/MoodleSessionContext';
import {
  fetchClarisAvailability,
  invokeClarisChat,
  type ClarisAvailabilityStatus,
} from '@/features/claris/api/chat';
import {
  createClarisConversation,
  deleteClarisConversation,
  fetchClarisConversations,
  updateClarisConversation,
} from '@/features/claris/api/conversations';
import { usePermissions } from '@/hooks/usePermissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---- Types ----

type ChatRole = 'assistant' | 'user';
type ChatActionKind = 'quick_reply';

interface ChatAction {
  id: string;
  label: string;
  value: string;
  kind: ChatActionKind;
  jobId?: string;
}

interface RichColumn { key: string; label: string; }

interface DataTableBlock {
  type: 'data_table';
  tool: string;
  title: string;
  empty_message: string;
  columns: RichColumn[];
  rows: Record<string, string>[];
}

interface StatCard { label: string; value: string; variant: 'default' | 'warning' | 'danger'; }

interface StatCardsBlock {
  type: 'stat_cards';
  title: string;
  stats: StatCard[];
}

type ChatRichBlock = DataTableBlock | StatCardsBlock;

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  isSystem?: boolean;
  actions?: ChatAction[];
  richBlocks?: ChatRichBlock[];
}

interface ClarisChatHistoryItem { role: ChatRole; content: string; richBlocks?: ChatRichBlock[]; }

// ---- Constants ----

const CLARIS_PLACEHOLDER_REPLY =
  'Ainda estou em desenvolvimento, mas em breve estarei aqui para te ajudar no acompanhamento dos nossos alunos com orientações e insights em tempo real.';

const CLARIS_NOT_CONFIGURED_REPLY =
  'Ainda não estou configurada. Vá em Administração > Configurações > Claris IA para conectar um modelo.';

const CLARIS_INVALID_CONFIG_ADMIN_REPLY =
  'A configuração atual da Claris IA está inválida. Revise em Administração > Configurações > Claris IA para eu voltar a responder.';

const CLARIS_BLOCKED_COMMON_USER_REPLY =
  'Desculpe, no momento estou aguardando o Administrador do site me configurar e por enquanto não posso responder.';

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Sou a **Claris IA**. Como posso te ajudar hoje?',
};

const CLARIS_HISTORY_STORAGE_PREFIX = 'claris_chat_history';
const CLARIS_WIDGET_OPEN_STORAGE_KEY = 'claris_chat_widget_open';
const CHAT_MORPH_DURATION_MS = 360;
const CHAT_CONTENT_DELAY_MS = 120;

const GENERIC_QUICK_SUGGESTIONS = [
  'Alunos em risco — quem contatar hoje?',
  'Atividades aguardando correção',
  'Resumo geral da operação',
  'Pendências mais urgentes',
  'Alunos para acompanhar esta semana',
  'Como usar a plataforma Claris?',
];

const ROUTE_QUICK_SUGGESTIONS: Array<{ match: RegExp; suggestions: string[] }> = [
  { match: /\/alunos(?:\/|$)/, suggestions: ['Alunos em risco com último acesso', 'Piora de engajamento esta semana', 'Plano de acompanhamento — 5 mais críticos'] },
  { match: /\/tarefas(?:\/|$)/, suggestions: ['Tarefas em aberto por aluno', 'Tarefas com prazo próximo', 'Resumo de tarefas por curso'] },
  { match: /\/agenda(?:\/|$)/, suggestions: ['Próximos compromissos desta semana', 'Eventos por curso', 'Resumo da agenda mensal'] },
  { match: /\/mensagens(?:\/|$)/, suggestions: ['Templates para alunos em risco', 'Rascunho de acompanhamento', 'Alunos que precisam de contato'] },
  { match: /\/campanhas(?:\/|$)/, suggestions: ['Criar campanha para alunos em risco', 'Rascunho de comunicacao em massa', 'Modelos para lembrete de atividade'] },
  { match: /\/automacoes(?:\/|$)/, suggestions: ['Automacao para atividade atrasada', 'Fluxos para falta de resposta', 'Regras de acompanhamento automatico'] },
];

const CLEAR_HISTORY_COMMANDS = new Set(['/limpar', '/limparhistorico', '/limpar-historico', '/clear']);

// ---- Helpers ----

function normalizeCommand(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');
}

function isClearHistoryCommand(value: string) {
  const normalized = normalizeCommand(value);
  if (CLEAR_HISTORY_COMMANDS.has(normalized)) return true;
  return normalized === 'limparhistorico' || normalized === 'limparconversa';
}

function isValidHistoryItem(item: unknown): item is ClarisChatHistoryItem {
  return item !== null && typeof item === 'object'
    && ((item as { role?: unknown }).role === 'assistant' || (item as { role?: unknown }).role === 'user')
    && typeof (item as { content?: unknown }).content === 'string';
}

function mapHistoryItem(item: ClarisChatHistoryItem): ClarisChatHistoryItem {
  const base: ClarisChatHistoryItem = { role: item.role, content: item.content };
  const blocks = parseRichBlocks((item as Record<string, unknown>).richBlocks);
  if (blocks.length > 0) base.richBlocks = blocks;
  return base;
}

function parseStoredHistory(raw: string | null): ClarisChatHistoryItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidHistoryItem)
      .map(mapHistoryItem)
      .slice(-40);
  } catch { return []; }
}

function clearStoredHistory(key: string) { localStorage.removeItem(key); }

function buildContextualSuggestions(route: string): string[] {
  const HELP_SUGGESTION = 'Como usar a plataforma Claris?';
  const contextual = ROUTE_QUICK_SUGGESTIONS.find((e) => e.match.test(route))?.suggestions ?? [];
  const generic = GENERIC_QUICK_SUGGESTIONS.filter((s) => s !== HELP_SUGGESTION);
  const unique = Array.from(new Set([...contextual, ...generic]));
  return [...unique, HELP_SUGGESTION].slice(0, 6);
}

function parseHistoryFromJson(raw: unknown): ClarisChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isValidHistoryItem)
    .map(mapHistoryItem)
    .slice(-40);
}

function historyToChatMessages(history: ClarisChatHistoryItem[]): ChatMessage[] {
  return history.map((item, i) => ({
    id: `history-${i}-${Date.now()}`,
    role: item.role,
    content: item.content,
    ...(item.richBlocks && item.richBlocks.length > 0 ? { richBlocks: item.richBlocks } : {}),
  }));
}

function deriveConversationTitle(history: ClarisChatHistoryItem[]): string {
  const first = history.find((i) => i.role === 'user')?.content.trim();
  if (first && first.length > 0) return first.length > 64 ? `${first.slice(0, 61)}...` : first;
  return 'Nova conversa';
}

function parseUiActions(raw: unknown): ChatAction[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ChatAction[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `action-${i}-${Date.now()}`;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const value = typeof r.value === 'string' ? r.value.trim() : '';
    const kind: ChatActionKind | null = r.kind === 'quick_reply' ? 'quick_reply' : null;
    const jobId = typeof r.job_id === 'string' && r.job_id.trim().length > 0 ? r.job_id.trim() : undefined;
    if (!label || !value || !kind) continue;
    parsed.push({ id, label, value, kind, jobId });
    if (parsed.length >= 6) break;
  }
  return parsed;
}

function parseRichBlocks(raw: unknown): ChatRichBlock[] {
  if (!Array.isArray(raw)) return [];
  const result: ChatRichBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    if (r.type === 'data_table') {
      const columns = Array.isArray(r.columns) ? r.columns.filter((c): c is RichColumn => c !== null && typeof c === 'object' && typeof c.key === 'string' && typeof c.label === 'string') : [];
      const rows = Array.isArray(r.rows) ? r.rows.filter((row): row is Record<string, string> => row !== null && typeof row === 'object' && !Array.isArray(row)) : [];
      result.push({ type: 'data_table', tool: typeof r.tool === 'string' ? r.tool : '', title: typeof r.title === 'string' ? r.title : '', empty_message: typeof r.empty_message === 'string' ? r.empty_message : 'Nenhum resultado.', columns, rows });
    } else if (r.type === 'stat_cards') {
      const stats = Array.isArray(r.stats) ? r.stats.filter((s): s is StatCard => s !== null && typeof s === 'object' && typeof s.label === 'string' && typeof s.value === 'string') : [];
      result.push({ type: 'stat_cards', title: typeof r.title === 'string' ? r.title : '', stats });
    }
  }
  return result;
}

// ---- Block renderers ----

const RISK_COLORS: Record<string, string> = {
  'Crítico': 'text-destructive font-semibold', 'Risco': 'text-orange-500 font-medium',
  'Atenção': 'text-yellow-600 font-medium', 'Normal': 'text-green-600', 'Inativo': 'text-muted-foreground',
};
const PRIORITY_COLORS: Record<string, string> = { alta: 'text-destructive font-semibold', media: 'text-orange-500', media_alta: 'text-orange-500', baixa: 'text-muted-foreground' };

function cellClass(col: RichColumn, value: string): string {
  if (col.key === 'risco') return RISK_COLORS[value] ?? '';
  if (col.key === 'prioridade') return PRIORITY_COLORS[value.toLowerCase()] ?? '';
  if (col.key === 'status' && value === 'aberta') return 'text-yellow-600';
  if (col.key === 'status' && value === 'em_andamento') return 'text-blue-500';
  if (col.key === 'status' && value === 'concluida') return 'text-green-600';
  return '';
}

function DataTableBlockView({ block }: { block: DataTableBlock }) {
  const visibleCols = block.columns.filter((c) => c.key !== 'id');
  const primaryCols = visibleCols.slice(0, 2);
  const secondaryCols = visibleCols.slice(2);

  if (block.rows.length === 0) {
    return (
      <div className="mt-2 rounded-lg border border-border/60 text-xs overflow-hidden">
        <div className="bg-muted/60 px-3 py-2 font-semibold text-foreground">{block.title}</div>
        <div className="px-3 py-2 text-muted-foreground">{block.empty_message}</div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border/60 text-xs overflow-hidden">
      <div className="bg-muted/60 px-3 py-2 font-semibold text-foreground">{block.title}</div>
      <div className="divide-y divide-border/40">
        {block.rows.map((row, i) => (
          <div key={i} className="px-3 py-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              {primaryCols.map((col) => (
                <span key={col.key} className={cn('truncate', cellClass(col, row[col.key] ?? ''))} title={row[col.key] ?? '—'}>{row[col.key] ?? '—'}</span>
              ))}
            </div>
            {secondaryCols.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-muted-foreground">
                {secondaryCols.map((col) => {
                  const val = row[col.key] ?? '—';
                  if (val === '—') return null;
                  return <span key={col.key} className={cn(cellClass(col, val))}>{col.label}: <span className="text-foreground/80">{val}</span></span>;
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-muted/50',
  warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  danger: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:text-red-200',
};

function StatCardsBlockView({ block }: { block: StatCardsBlock }) {
  return (
    <div className="mt-2 rounded-lg border border-border/60 text-xs overflow-hidden">
      <div className="bg-muted/60 px-3 py-2 font-semibold text-foreground">{block.title}</div>
      <div className="grid grid-cols-2 gap-px bg-border/40 p-px">
        {block.stats.map((stat, i) => (
          <div key={i} className={cn('flex flex-col px-3 py-2.5 rounded', VARIANT_STYLES[stat.variant] ?? VARIANT_STYLES.default)}>
            <span className="text-muted-foreground leading-tight">{stat.label}</span>
            <span className="text-base font-bold leading-tight mt-0.5">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RichBlocksView({ blocks }: { blocks: ChatRichBlock[] }) {
  return (
    <div className="mt-2 space-y-2">
      {blocks.map((block, i) => block.type === 'data_table' ? <DataTableBlockView key={i} block={block} /> : <StatCardsBlockView key={i} block={block} />)}
    </div>
  );
}

// ---- Message bubble (GPT-style) ----

function AssistantMessage({ message, isSending, onAction }: { message: ChatMessage; isSending: boolean; onAction: (value: string, action: ChatAction) => void }) {
  return (
    <div className="flex justify-start py-2 px-2">
      <div className="max-w-[85%] space-y-1">
        <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-2.5">
          <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-2 [&_code]:rounded [&_code]:bg-background/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_a]:text-primary [&_a]:underline">
            <ReactMarkdown
              urlTransform={(url) => {
                // Allow only safe protocols; strip everything else to prevent XSS via
                // javascript:, data:, vbscript: and similar dangerous URL schemes.
                const safe = /^(https?|mailto):/i;
                return safe.test(url) ? url : '';
              }}
            >{message.content}</ReactMarkdown>
          </div>
        </div>
        {message.richBlocks && message.richBlocks.length > 0 && <RichBlocksView blocks={message.richBlocks} />}
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.actions.map((action) => (
              <Button key={action.id} type="button" variant="outline" size="sm" className="h-8 rounded-full text-xs" disabled={isSending} onClick={() => onAction(action.value, action)}>
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end py-4 px-2">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
}

// ---- Conversation thread type ----

interface ClarisConversationThread {
  id: string;
  title: string;
  history: ClarisChatHistoryItem[];
  updatedAt: string;
  lastContextRoute: string;
  isLocalOnly?: boolean;
}

type FloatingChatVisualState = 'closed' | 'opening' | 'open' | 'closing';

// ---- Main component ----

export interface FloatingClarisChatProps { variant?: 'floating' | 'page'; }

export function FloatingClarisChat({ variant = 'floating' }: FloatingClarisChatProps) {
  const auth = useAuth() as { user?: { id: string } | null };
  const moodleSession = useMoodleSession();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = auth.user?.id ?? 'anonymous';
  const isFloating = variant === 'floating';
  const historyStorageKey = `${CLARIS_HISTORY_STORAGE_PREFIX}:${userId}`;
  const contextFromQuery = new URLSearchParams(location.search).get('context')?.trim() ?? '';
  const activeRouteContext = contextFromQuery || location.pathname;

  const [visualState, setVisualState] = useState<FloatingChatVisualState>(() => {
    if (!isFloating) return 'open';
    return localStorage.getItem(CLARIS_WIDGET_OPEN_STORAGE_KEY) === 'true' ? 'open' : 'closed';
  });
  const [isChatVisible, setIsChatVisible] = useState(() => !isFloating || localStorage.getItem(CLARIS_WIDGET_OPEN_STORAGE_KEY) === 'true');
  const [isContentVisible, setIsContentVisible] = useState(() => !isFloating || localStorage.getItem(CLARIS_WIDGET_OPEN_STORAGE_KEY) === 'true');
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [conversations, setConversations] = useState<ClarisConversationThread[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [clarisAvailability, setClarisAvailability] = useState<ClarisAvailabilityStatus>('not_configured');
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isHydratingConversations, setIsHydratingConversations] = useState(true);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState('');
  const [editingConversationError, setEditingConversationError] = useState('');
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = visualState === 'opening' || visualState === 'open';

  const isClarisReady = clarisAvailability === 'ready';
  const canSend = useMemo(() => inputValue.trim().length > 0 && !isSending && isClarisReady, [inputValue, isSending, isClarisReady]);
  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeConversationId) ?? null, [conversations, activeConversationId]);
  const activeConversationTitle = activeConversation?.title ?? '';
  const suggestionsRoute = activeConversation?.lastContextRoute || activeRouteContext;
  const contextualSuggestions = useMemo(() => buildContextualSuggestions(suggestionsRoute), [suggestionsRoute]);
  const activeConversationHasMessages = (activeConversation?.history.length ?? 0) > 0;
  const shouldShowIcebreakers = !isHydratingConversations && !activeConversationHasMessages;
  const visibleConversations = useMemo(() => conversations.filter((c) => c.history.length > 0), [conversations]);

  const getUnavailableReply = useCallback((status: ClarisAvailabilityStatus) => {
    if (!isAdmin) return CLARIS_BLOCKED_COMMON_USER_REPLY;
    return status === 'invalid' ? CLARIS_INVALID_CONFIG_ADMIN_REPLY : CLARIS_NOT_CONFIGURED_REPLY;
  }, [isAdmin]);

  const refreshGlobalClarisConfiguration = useCallback(async () => {
    try {
      const status = await fetchClarisAvailability();
      setClarisAvailability(status);
      return status;
    } catch {
      localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, 'false');
      setClarisAvailability('not_configured');
      return 'not_configured' as ClarisAvailabilityStatus;
    } finally {
      setIsCheckingAvailability(false);
    }
  }, []);

  useEffect(() => { void refreshGlobalClarisConfiguration(); }, [refreshGlobalClarisConfiguration]);

  useEffect(() => {
    if (!isFloating) return;
    localStorage.setItem(CLARIS_WIDGET_OPEN_STORAGE_KEY, String(isOpen));
  }, [isFloating, isOpen]);

  useEffect(() => {
    if (!isFloating) return;
    if (visualState === 'opening') {
      setIsChatVisible(true);
      void refreshGlobalClarisConfiguration();
      const t = window.setTimeout(() => setVisualState('open'), CHAT_MORPH_DURATION_MS);
      return () => window.clearTimeout(t);
    }
    if (visualState === 'closing') {
      const t = window.setTimeout(() => { setVisualState('closed'); setIsChatVisible(false); }, CHAT_MORPH_DURATION_MS);
      return () => window.clearTimeout(t);
    }
    if (visualState === 'open') { setIsChatVisible(true); void refreshGlobalClarisConfiguration(); }
  }, [isFloating, refreshGlobalClarisConfiguration, visualState]);

  useEffect(() => {
    if (!isFloating) { setIsContentVisible(true); return; }
    if (visualState === 'opening') {
      const t = window.setTimeout(() => setIsContentVisible(true), CHAT_CONTENT_DELAY_MS);
      return () => window.clearTimeout(t);
    }
    if (visualState === 'closing' || visualState === 'closed') setIsContentVisible(false);
  }, [isFloating, visualState]);

  useEffect(() => { if (!isFloating) { setVisualState('open'); setIsChatVisible(true); setIsContentVisible(true); } }, [isFloating]);

  useEffect(() => {
    if (!isFloating || visualState !== 'open') return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [isFloating, visualState]);

  useEffect(() => {
    if (!isFloating) return;
    const isExpanded = visualState === 'open' || visualState === 'opening';
    if (!isExpanded) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisualState('closing'); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFloating, visualState]);

  const openFloatingChat = () => { if (!isFloating || visualState === 'open' || visualState === 'opening') return; setVisualState('opening'); };
  const closeFloatingChat = () => { if (!isFloating || visualState === 'closed' || visualState === 'closing') return; setVisualState('closing'); };

  useEffect(() => { if (scrollEndRef.current) scrollEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ---- Hydrate conversations ----
  useEffect(() => {
    let isMounted = true;
    const hydrate = async () => {
      setIsHydratingConversations(true);
      const localHistory = parseStoredHistory(localStorage.getItem(historyStorageKey));
      let fallbackThread: ClarisConversationThread | null = null;
      if (localHistory.length > 0) {
        fallbackThread = { id: `local-${Date.now()}`, title: deriveConversationTitle(localHistory), history: localHistory, updatedAt: new Date().toISOString(), lastContextRoute: activeRouteContext, isLocalOnly: true };
      }
      try {
        const rows = await fetchClarisConversations(userId);
        const remote: ClarisConversationThread[] = rows.map((row) => {
          const history = parseHistoryFromJson(row.messages);
          return { id: row.id, title: row.title || deriveConversationTitle(history), history, updatedAt: row.updated_at, lastContextRoute: row.last_context_route || activeRouteContext };
        });
        if (!isMounted) return;
        if (remote.length > 0) {
          const selected = remote[0];
          setConversations(remote);
          setActiveConversationId(selected.id);
          setMessages([INITIAL_MESSAGE, ...historyToChatMessages(selected.history)]);
          localStorage.setItem(historyStorageKey, JSON.stringify(selected.history));
        } else if (fallbackThread) {
          setConversations([fallbackThread]); setActiveConversationId(fallbackThread.id);
          setMessages([INITIAL_MESSAGE, ...historyToChatMessages(fallbackThread.history)]);
        } else {
          const empty: ClarisConversationThread = { id: `local-${Date.now()}`, title: 'Nova conversa', history: [], updatedAt: new Date().toISOString(), lastContextRoute: activeRouteContext, isLocalOnly: true };
          setConversations([empty]); setActiveConversationId(empty.id); setMessages([INITIAL_MESSAGE]);
        }
      } catch {
        if (!isMounted) return;
        if (fallbackThread) { setConversations([fallbackThread]); setActiveConversationId(fallbackThread.id); setMessages([INITIAL_MESSAGE, ...historyToChatMessages(fallbackThread.history)]); }
        else { const empty: ClarisConversationThread = { id: `local-${Date.now()}`, title: 'Nova conversa', history: [], updatedAt: new Date().toISOString(), lastContextRoute: activeRouteContext, isLocalOnly: true }; setConversations([empty]); setActiveConversationId(empty.id); setMessages([INITIAL_MESSAGE]); }
      } finally { if (isMounted) setIsHydratingConversations(false); }
    };
    hydrate();
    return () => { isMounted = false; };
  }, [activeRouteContext, historyStorageKey, userId]);

  // ---- Persist conversation ----
  useEffect(() => {
    if (isHydratingConversations || !activeConversationId) return;
    const historyToPersist = messages.filter((m) => m.id !== 'welcome' && !m.isSystem).map(({ role, content, richBlocks }) => ({
      role,
      content,
      ...(richBlocks && richBlocks.length > 0 ? { richBlocks } : {}),
    })).slice(-40);
    localStorage.setItem(historyStorageKey, JSON.stringify(historyToPersist));
    const nextTitle = deriveConversationTitle(historyToPersist);
    const shouldAutoTitle = activeConversationTitle.trim().toLowerCase() === 'nova conversa';
    const titleToPersist = shouldAutoTitle ? nextTitle : (activeConversationTitle || nextTitle);
    const nowIso = new Date().toISOString();
    setConversations((prev) => {
      const updated = prev.map((c) => c.id !== activeConversationId ? c : { ...c, title: titleToPersist, history: historyToPersist, updatedAt: nowIso, lastContextRoute: activeRouteContext });
      return [...updated].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    if (activeConversationId.startsWith('local-')) {
      void createClarisConversation(userId, titleToPersist, historyToPersist, activeRouteContext).then((data) => {
        setConversations((prev) => prev.map((c) => c.id === activeConversationId ? { id: data.id, title: data.title, history: parseHistoryFromJson(data.messages), updatedAt: data.updated_at, lastContextRoute: data.last_context_route || activeRouteContext } : c));
        setActiveConversationId(data.id);
      }).catch(() => {});
      return;
    }
    void updateClarisConversation(activeConversationId, userId, { title: titleToPersist, messages: historyToPersist, last_context_route: activeRouteContext });
  }, [activeConversationId, activeConversationTitle, activeRouteContext, historyStorageKey, isHydratingConversations, messages, userId]);

  const selectConversation = (id: string) => {
    const selected = conversations.find((c) => c.id === id);
    if (!selected) return;
    setActiveConversationId(selected.id);
    setMessages([INITIAL_MESSAGE, ...historyToChatMessages(selected.history)]);
    setInputValue('');
  };

  const createNewConversation = async () => {
    const reusable = conversations.find((c) => c.history.length === 0);
    if (reusable) { setActiveConversationId(reusable.id); setMessages([INITIAL_MESSAGE]); setInputValue(''); return; }
    const localConv: ClarisConversationThread = { id: `local-${Date.now()}`, title: 'Nova conversa', history: [], updatedAt: new Date().toISOString(), lastContextRoute: activeRouteContext, isLocalOnly: true };
    try {
      const data = await createClarisConversation(userId, 'Nova conversa', [], activeRouteContext);
      const created: ClarisConversationThread = { id: data.id, title: data.title, history: parseHistoryFromJson(data.messages), updatedAt: data.updated_at, lastContextRoute: data.last_context_route || activeRouteContext };
      setConversations((prev) => [created, ...prev]); setActiveConversationId(created.id);
    } catch {
      setConversations((prev) => [localConv, ...prev]); setActiveConversationId(localConv.id);
    }
    clearStoredHistory(historyStorageKey); setMessages([INITIAL_MESSAGE]); setInputValue('');
  };

  const startRenameConversation = (id: string, title: string) => { setEditingConversationId(id); setEditingConversationTitle(title); setEditingConversationError(''); };
  const cancelRenameConversation = () => { setEditingConversationId(null); setEditingConversationTitle(''); setEditingConversationError(''); };

  const saveConversationRename = async () => {
    if (!editingConversationId) return;
    const nextTitle = editingConversationTitle.trim();
    if (!nextTitle) { setEditingConversationError('O título não pode ficar vazio.'); return; }
    setEditingConversationError('');
    setConversations((prev) => prev.map((c) => c.id === editingConversationId ? { ...c, title: nextTitle, updatedAt: new Date().toISOString() } : c));
    if (!editingConversationId.startsWith('local-')) await updateClarisConversation(editingConversationId, userId, { title: nextTitle });
    cancelRenameConversation();
  };

  const deleteConversation = async (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const confirmed = window.confirm(`Deseja excluir a conversa "${conv.title}"?`);
    if (!confirmed) return;
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (!id.startsWith('local-')) await deleteClarisConversation(id, userId);
    if (activeConversationId === id) {
      if (remaining.length > 0) { const next = [...remaining].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]; setActiveConversationId(next.id); setMessages([INITIAL_MESSAGE, ...historyToChatMessages(next.history)]); }
      else await createNewConversation();
    }
    if (editingConversationId === id) cancelRenameConversation();
  };

  const clearConversation = () => {
    clearStoredHistory(historyStorageKey);
    setMessages([INITIAL_MESSAGE, { id: `assistant-${Date.now()}`, role: 'assistant', content: 'Histórico da conversa limpo com sucesso.' }]);
    setInputValue('');
  };

  const handleSend = async (messageOverride?: string, action?: ChatAction) => {
    const source = messageOverride ?? inputValue;
    const trimmed = source.trim();
    if (!trimmed) return;
    if (isClearHistoryCommand(trimmed)) { clearConversation(); return; }
    const history = messages.filter((m) => m.id !== 'welcome' && !m.isSystem).map(({ role, content }) => ({ role, content }));
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    setMessages((prev) => [...prev.map((m): ChatMessage => ({ ...m, actions: undefined })), userMsg]);
    if (!messageOverride) setInputValue('');
    const availability = isClarisReady ? 'ready' : await refreshGlobalClarisConfiguration();
    if (availability !== 'ready') {
      return;
    }
    setIsSending(true);
    try {
      const typedData = await invokeClarisChat({
        message: trimmed,
        history,
        moodleUrl: moodleSession?.moodleUrl,
        moodleToken: moodleSession?.moodleToken,
        action: action ? { kind: action.kind, value: action.value, jobId: action.jobId } : undefined,
      });
      const reply = typeof typedData.reply === 'string' && typedData.reply.trim().length > 0 ? typedData.reply : CLARIS_PLACEHOLDER_REPLY;
      const uiActions = parseUiActions(typedData.uiActions);
      const richBlocks = parseRichBlocks(typedData.richBlocks);
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', content: reply, actions: uiActions.length > 0 ? uiActions : undefined, richBlocks: richBlocks.length > 0 ? richBlocks : undefined }]);
    } catch {
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', content: 'Não consegui me conectar ao modelo agora. Verifique as configurações da Claris IA e tente novamente.' }]);
    } finally { setIsSending(false); }
  };

  // ---- Chat panel (GPT-style) ----

  const chatPanel = (
    <div className={cn('flex h-full w-full flex-col overflow-hidden', isFloating ? 'bg-card' : 'bg-background')}>
      {/* Header */}
      <div className="shrink-0 flex min-h-11 items-center justify-between border-b px-4 py-2.5 sm:min-h-[45px] sm:py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground p-1.5">Claris IA</span>
        <div className="flex items-center gap-1">
          {isFloating && (
            <>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/claris?context=${encodeURIComponent(location.pathname)}`)} aria-label="Expandir chat">
                <Expand className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={closeFloatingChat} aria-label="Fechar chat">
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Transition wrapper */}
      <div className={cn(
        'flex flex-1 min-h-0 flex-col transition-all duration-300',
        isFloating && !isContentVisible ? 'translate-y-2 scale-[0.985] opacity-0 pointer-events-none' : 'translate-y-0 scale-100 opacity-100'
      )} style={isFloating ? { transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' } : undefined}>

        {/* Messages */}
        <ScrollArea data-testid={isFloating ? 'floating-chat-scroll-area' : undefined} className="flex-1 min-h-0">
          <div className={cn('mx-auto w-full', isFloating ? 'max-w-full px-1' : 'max-w-3xl px-4')} data-testid="message-list">
            {messages.map((message) =>
              message.role === 'assistant'
                ? <AssistantMessage key={message.id} message={message} isSending={isSending} onAction={(v, a) => handleSend(v, a)} />
                : <UserMessage key={message.id} message={message} />
            )}

            {isSending && (
              <div className="flex justify-start py-2 px-2">
                <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {shouldShowIcebreakers && (
              <div className={cn('flex flex-wrap justify-center gap-2 py-6', isFloating ? 'px-2' : 'px-4')}>
                {contextualSuggestions.map((suggestion) => (
                  <Button key={suggestion} type="button" variant="outline" size="sm" className="h-auto max-w-[340px] rounded-full border-border/60 px-4 py-2.5 text-center text-xs leading-4 shadow-sm hover:bg-muted/80 transition-colors" onClick={() => handleSend(suggestion)} disabled={isSending || !isClarisReady}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0 text-primary/50" />
                    <span>{suggestion}</span>
                  </Button>
                ))}
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        {!isCheckingAvailability && clarisAvailability !== 'ready' && (
          <div className="shrink-0 border-t border-amber-200/50 bg-amber-50/60 px-4 py-2.5 dark:bg-amber-900/10">
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
              {getUnavailableReply(clarisAvailability)}
            </p>
          </div>
        )}
        <div className={cn('shrink-0 border-t', isFloating ? 'p-2' : 'px-4 py-3')}>
          <form className={cn('mx-auto flex items-center gap-2', !isFloating && 'max-w-3xl')} onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isClarisReady ? 'Mensagem para Claris IA...' : 'Claris IA indisponível no momento'}
                aria-label="Mensagem para Claris IA"
                disabled={isSending || !isClarisReady}
                className="rounded-full bg-muted/50 border-border/60 pr-10 focus-visible:ring-1"
              />
            </div>
            {isFloating && (
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={createNewConversation} aria-label="Nova conversa">
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <Button type="submit" size="icon" disabled={!canSend} className="h-9 w-9 shrink-0 rounded-full" aria-label="Enviar mensagem">
              {isSending ? <Spinner className="h-4 w-4" onAccent /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );

  // ---- Page variant with sidebar ----
  if (!isFloating) {
    return (
      <div className="flex h-full w-full flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="flex w-full shrink-0 flex-col border-b border-border/40 bg-muted/30 lg:w-[280px] lg:border-b-0 lg:border-r">
          <div className="flex min-h-11 items-center justify-between border-b px-4 py-2.5 sm:min-h-[45px] sm:py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seus Chats</span>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={createNewConversation} aria-label="Nova conversa">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="table min-w-full">
              <div className="w-full max-w-full p-2 space-y-0.5 lg:max-w-[278px]">
              {isHydratingConversations ? (
                <div className="flex items-center justify-center py-8"><Spinner className="h-5 w-5" /></div>
              ) : visibleConversations.length === 0 ? null : (
                visibleConversations.map((conv) => (
                  <div key={conv.id} className={cn(
                    'group rounded-md px-2.5 py-1.5 transition-colors cursor-pointer',
                    activeConversationId === conv.id ? 'bg-muted' : 'hover:bg-muted/50'
                  )}>
                    {editingConversationId === conv.id ? (
                      <div className="space-y-1.5">
                        <Input value={editingConversationTitle} onChange={(e) => { setEditingConversationTitle(e.target.value); if (editingConversationError) setEditingConversationError(''); }}
                          aria-label="Renomear conversa"
                          autoFocus onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveConversationRename(); } if (e.key === 'Escape') { e.preventDefault(); cancelRenameConversation(); } }}
                          className="h-7 text-xs" />
                        {editingConversationError && <p role="alert" className="text-[11px] text-destructive">{editingConversationError}</p>}
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={cancelRenameConversation} aria-label="Cancelar renomear conversa"><X className="h-3 w-3" /></Button>
                          <Button type="button" variant="outline" size="icon" className="h-6 w-6" onClick={() => void saveConversationRename()} aria-label="Salvar renomear conversa"><Check className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2" onClick={() => selectConversation(conv.id)}>
                        <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        <span className="flex-1 truncate text-sm text-foreground/90">{conv.title}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()} aria-label="Mais opções da conversa">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => startRenameConversation(conv.id, conv.title)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { void deleteConversation(conv.id); }}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))
              )}
              </div>
            </div>
          </ScrollArea>
        </aside>

        <div className="flex min-h-0 flex-1">{chatPanel}</div>
      </div>
    );
  }

  // ---- Floating variant ----
  return (
    <div className="fixed inset-x-2 bottom-4 z-50 hidden flex-col items-end gap-2 md:flex md:left-auto md:right-4 md:inset-x-auto">
      <div
        className={cn(
          'relative origin-bottom-right overflow-hidden border transition-[width,height,border-radius,transform,opacity,box-shadow] duration-[360ms] will-change-transform',
          isOpen ? 'h-[520px] w-full max-w-full rounded-2xl bg-card shadow-xl sm:w-[380px]' : 'h-14 w-14 rounded-full border-primary bg-primary text-primary-foreground shadow-lg',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        role={!isOpen ? 'button' : undefined}
        tabIndex={!isOpen ? 0 : undefined}
        aria-label={!isOpen ? 'Abrir chat da Claris IA' : undefined}
        onClick={!isOpen ? openFloatingChat : undefined}
        onKeyDown={!isOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFloatingChat(); } } : undefined}
      >
        <div className={cn('pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-200', !isOpen ? 'opacity-100' : 'opacity-0')} aria-hidden={isOpen}>
          <ClarisIcon className="h-7 w-7 text-primary-foreground" />
          <MessageCircle className="sr-only" />
        </div>
        {isChatVisible && chatPanel}
      </div>
    </div>
  );
}
