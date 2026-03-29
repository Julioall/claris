import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useDeferredValue,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Send,
  Search,
  X,
  FileText,
  Eye,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
  Clock3,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DynamicVariableInput,
  resolveVariables,
  DYNAMIC_VARIABLES,
} from "./DynamicVariableInput";
import { useAuth } from "@/contexts/AuthContext";
import { useBackgroundActivityFlag } from "@/contexts/BackgroundActivityContext";
import { useMoodleSession } from "@/features/auth/context/MoodleSessionContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  buildCourseCategoryFilterOptions,
  parseCourseCategoryPath,
} from "@/lib/course-category";
import {
  buildBulkMessageVariableAvailability,
  getAvailableVariableKeys,
  getUnavailableTemplateVariables,
  resolveStudentCourseContext,
  type DynamicVariableKey,
} from "@/lib/message-template-context";
import { MESSAGE_TEMPLATE_CATEGORIES } from "@/lib/message-template-defaults";
import {
  buildStudentCourseKey,
  listBulkSendAudienceForUser,
  listRecentBulkMessageJobsForUser,
  startBulkMessageSend,
} from "@/features/messages/api/bulk-messaging.repository";
import { createScheduledMessage } from "@/features/automations/api/automations.repository";
import { writeCampaignRoutineDraft } from "@/features/automations/lib/campaign-routine-draft";
import { listMessageTemplateOptionsForUser } from "@/features/messages/api/message-templates.repository";
import type {
  BulkMessageJobPreview,
  GradeLookupValue,
  MessageTemplateOption,
  StudentOption,
} from "@/features/messages/types";

const variableLabels = new Map(
  DYNAMIC_VARIABLES.map((variable) => [variable.key, variable.label]),
);
const categoryLabels = new Map(
  MESSAGE_TEMPLATE_CATEGORIES.map((category) => [
    category.value,
    category.label,
  ]),
);
const riskLevelLabels: Record<string, string> = {
  todos: "Todos riscos",
  normal: "Normal",
  atencao: "Atencao",
  risco: "Risco",
  critico: "Critico",
  inativo: "Inativo",
};
const emailStatusLabels: Record<string, string> = {
  todos: "Todos e-mails",
  com_email: "Com e-mail",
  sem_email: "Sem e-mail",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function getVariableLabel(key: DynamicVariableKey) {
  return variableLabels.get(key) || key;
}

function getCategoryLabel(value?: string | null) {
  if (!value) return "Geral";
  return categoryLabels.get(value) || value;
}

function formatDateLabel(value?: string | null) {
  if (!value) return "Sem registro";

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "Sem registro";

  return dateFormatter.format(parsedDate);
}

function formatRiskLevel(value?: string | null) {
  if (!value) return "Sem classificacao";
  return riskLevelLabels[value] || value;
}

function normalizeRiskLevel(value?: string | null) {
  if (!value) return "inativo";
  return value.toLowerCase();
}

function formatEnrollmentStatusLabel(value?: string | null) {
  if (!value) return "Sem status";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatGradeLabel(grade?: GradeLookupValue) {
  if (grade?.gradeFormatted) return grade.gradeFormatted;
  if (grade?.gradePercentage != null)
    return `${Number(grade.gradePercentage).toFixed(1)}%`;
  return "Sem nota";
}

function buildUnavailableVariablesText(
  unavailableVariables: Array<{ key: DynamicVariableKey; reason?: string }>,
) {
  const labels = unavailableVariables
    .map((item) => getVariableLabel(item.key))
    .join(", ");
  const reasons = Array.from(
    new Set(
      unavailableVariables
        .map((item) => item.reason)
        .filter((reason): reason is string => Boolean(reason)),
    ),
  );

  return reasons.length > 0 ? `${labels}. ${reasons.join(" ")}` : labels;
}

function buildDefaultScheduledTitle(selectedCount: number) {
  return `Envio agendado para ${selectedCount} aluno${selectedCount !== 1 ? "s" : ""}`;
}

type DeliveryMode = "now" | "scheduled" | "routine";
type CampaignStep = "audience" | "message" | "review";

const campaignSteps: Array<{
  id: CampaignStep;
  title: string;
  description: string;
}> = [
  {
    id: "audience",
    title: "Destinatarios",
    description: "Escolha quem vai receber a campanha.",
  },
  {
    id: "message",
    title: "Mensagem",
    description: "Monte o conteudo e personalize o envio.",
  },
  {
    id: "review",
    title: "Revisao",
    description: "Valide o que sera enviado e decida a execucao.",
  },
];

const AUDIENCE_PAGE_SIZE = 25;

export function BulkSendTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const moodleSession = useMoodleSession();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [gradeLookup, setGradeLookup] = useState<
    Record<string, GradeLookupValue>
  >({});
  const [pendingLookup, setPendingLookup] = useState<Record<string, number>>(
    {},
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [messageContent, setMessageContent] = useState("");
  const [templates, setTemplates] = useState<MessageTemplateOption[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [recentJobs, setRecentJobs] = useState<BulkMessageJobPreview[]>([]);
  const [currentStep, setCurrentStep] = useState<CampaignStep>("audience");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("now");
  const [scheduledTitle, setScheduledTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledNotes, setScheduledNotes] = useState("");

  const [filterSchool, setFilterSchool] = useState<string>("todos");
  const [filterCourse, setFilterCourse] = useState<string>("todos");
  const [filterClass, setFilterClass] = useState<string>("todos");
  const [filterUC, setFilterUC] = useState<string>("todos");
  const [filterRiskStatus, setFilterRiskStatus] = useState<string>("todos");
  const [filterEnrollmentStatus, setFilterEnrollmentStatus] =
    useState<string>("todos");
  const [filterEmailStatus, setFilterEmailStatus] =
    useState<string>("todos");
  const [audiencePage, setAudiencePage] = useState(1);
  const deferredSearchQuery = useDeferredValue(
    searchQuery.trim().toLowerCase(),
  );

  const currentFilters = useMemo(
    () => ({
      school: filterSchool,
      course: filterCourse,
      className: filterClass,
      uc: filterUC,
    }),
    [filterSchool, filterCourse, filterClass, filterUC],
  );

  const fetchStudents = useCallback(async () => {
    if (!user) return;

    setIsLoadingStudents(true);

    try {
      const audience = await listBulkSendAudienceForUser(user.id);
      setStudents(audience.students);
      setGradeLookup(audience.gradeLookup);
      setPendingLookup(audience.pendingLookup);
    } catch (error) {
      console.error(error);
      setStudents([]);
      setGradeLookup({});
      setPendingLookup({});
      toast.error("Erro ao carregar alunos");
    } finally {
      setIsLoadingStudents(false);
    }
  }, [user]);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;

    try {
      setTemplates(await listMessageTemplateOptionsForUser(user.id));
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar modelos");
    }
  }, [user]);

  const fetchRecentJobs = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user) return;

      try {
        setRecentJobs(await listRecentBulkMessageJobsForUser(user.id));
      } catch (error) {
        console.error(error);
        if (!options?.silent) {
          toast.error("Erro ao carregar envios recentes");
        }
      }
    },
    [user],
  );

  useEffect(() => {
    fetchStudents();
    fetchTemplates();
    fetchRecentJobs();
  }, [fetchStudents, fetchTemplates, fetchRecentJobs]);

  const categorySources = useMemo(
    () =>
      students.flatMap((student) =>
        student.courses.map((course) => ({
          category: course.category,
          courseName: course.course_name,
        })),
      ),
    [students],
  );

  const filterOptions = useMemo(() => {
    return buildCourseCategoryFilterOptions(categorySources, {
      school: filterSchool,
      course: filterCourse,
      className: filterClass,
    });
  }, [categorySources, filterSchool, filterCourse, filterClass]);

  const enrollmentStatusOptions = useMemo(() => {
    const statuses = new Set<string>();

    students.forEach((student) => {
      if (student.enrollment_status) {
        statuses.add(student.enrollment_status.toLowerCase());
      }

      student.courses.forEach((course) => {
        if (course.enrollment_status) {
          statuses.add(course.enrollment_status.toLowerCase());
        }
      });
    });

    return Array.from(statuses).sort((left, right) =>
      left.localeCompare(right, "pt-BR"),
    );
  }, [students]);

  useEffect(() => {
    if (
      filterSchool !== "todos" &&
      !filterOptions.schools.includes(filterSchool)
    ) {
      setFilterSchool("todos");
      setFilterCourse("todos");
      setFilterClass("todos");
      setFilterUC("todos");
      return;
    }

    if (
      filterCourse !== "todos" &&
      !filterOptions.courses.includes(filterCourse)
    ) {
      setFilterCourse("todos");
      setFilterClass("todos");
      setFilterUC("todos");
      return;
    }

    if (
      filterClass !== "todos" &&
      !filterOptions.classes.includes(filterClass)
    ) {
      setFilterClass("todos");
      setFilterUC("todos");
      return;
    }

    if (filterUC !== "todos" && !filterOptions.ucs.includes(filterUC)) {
      setFilterUC("todos");
    }
  }, [filterSchool, filterCourse, filterClass, filterUC, filterOptions]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      if (
        deferredSearchQuery &&
        !student.full_name.toLowerCase().includes(deferredSearchQuery) &&
        !student.email?.toLowerCase().includes(deferredSearchQuery)
      ) {
        return false;
      }

      if (
        filterSchool !== "todos" ||
        filterCourse !== "todos" ||
        filterClass !== "todos" ||
        filterUC !== "todos"
      ) {
        const matchesCourse = student.courses.some((course) => {
          const parsed = parseCourseCategoryPath(course.category);
          if (filterSchool !== "todos" && parsed.school !== filterSchool)
            return false;
          if (filterCourse !== "todos" && parsed.course !== filterCourse)
            return false;
          if (filterClass !== "todos" && parsed.className !== filterClass)
            return false;
          if (
            filterUC !== "todos" &&
            (parsed.uc || course.course_name) !== filterUC
          )
            return false;
          return true;
        });
        if (!matchesCourse) return false;
      }

      if (filterRiskStatus !== "todos") {
        if (
          normalizeRiskLevel(student.current_risk_level) !== filterRiskStatus
        ) {
          return false;
        }
      }

      if (filterEnrollmentStatus !== "todos") {
        const normalizedStatus = filterEnrollmentStatus.toLowerCase();
        const studentStatus = student.enrollment_status?.toLowerCase();
        const hasMatchingCourseStatus = student.courses.some(
          (course) =>
            course.enrollment_status?.toLowerCase() === normalizedStatus,
        );

        if (studentStatus !== normalizedStatus && !hasMatchingCourseStatus) {
          return false;
        }
      }

      if (filterEmailStatus !== "todos") {
        const hasEmail = Boolean(student.email?.trim());

        if (filterEmailStatus === "com_email" && !hasEmail) return false;
        if (filterEmailStatus === "sem_email" && hasEmail) return false;
      }

      return true;
    });
  }, [
    students,
    deferredSearchQuery,
    filterSchool,
    filterCourse,
    filterClass,
    filterUC,
    filterRiskStatus,
    filterEnrollmentStatus,
    filterEmailStatus,
  ]);

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.has(student.id)),
    [selectedStudentIds, students],
  );
  const audienceTotalPages = Math.max(
    1,
    Math.ceil(filteredStudents.length / AUDIENCE_PAGE_SIZE),
  );
  const paginatedFilteredStudents = useMemo(() => {
    const startIndex = (audiencePage - 1) * AUDIENCE_PAGE_SIZE;
    return filteredStudents.slice(startIndex, startIndex + AUDIENCE_PAGE_SIZE);
  }, [audiencePage, filteredStudents]);

  const contextStudents = useMemo(
    () => (selectedStudents.length > 0 ? selectedStudents : filteredStudents),
    [filteredStudents, selectedStudents],
  );

  const variableAvailability = useMemo(
    () => buildBulkMessageVariableAvailability(contextStudents, currentFilters),
    [contextStudents, currentFilters],
  );

  const availableVariableKeys = useMemo(
    () => getAvailableVariableKeys(variableAvailability),
    [variableAvailability],
  );

  const messageUnavailableVariables = useMemo(
    () => getUnavailableTemplateVariables(messageContent, variableAvailability),
    [messageContent, variableAvailability],
  );

  const templateUnavailableVariables = useMemo(() => {
    return new Map(
      templates.map((template) => [
        template.id,
        getUnavailableTemplateVariables(template.content, variableAvailability),
      ]),
    );
  }, [templates, variableAvailability]);

  const canPreviewOrSend =
    selectedStudents.length > 0 &&
    messageContent.trim().length > 0 &&
    messageUnavailableVariables.length === 0;
  const hasActiveJobs = useMemo(
    () =>
      recentJobs.some(
        (job) => job.status === "pending" || job.status === "processing",
      ),
    [recentJobs],
  );
  const currentStepIndex = useMemo(
    () => campaignSteps.findIndex((step) => step.id === currentStep),
    [currentStep],
  );
  const stepProgress = useMemo(
    () => ((currentStepIndex + 1) / campaignSteps.length) * 100,
    [currentStepIndex],
  );
  const allFilteredSelected = useMemo(
    () =>
      filteredStudents.length > 0 &&
      filteredStudents.every((student) => selectedStudentIds.has(student.id)),
    [filteredStudents, selectedStudentIds],
  );
  const someFilteredSelected = useMemo(
    () =>
      !allFilteredSelected &&
      filteredStudents.some((student) => selectedStudentIds.has(student.id)),
    [allFilteredSelected, filteredStudents, selectedStudentIds],
  );
  const activeFilterBadges = useMemo(() => {
    const badges: string[] = [];

    if (filterSchool !== "todos") badges.push(`Escola: ${filterSchool}`);
    if (filterCourse !== "todos") badges.push(`Curso: ${filterCourse}`);
    if (filterClass !== "todos") badges.push(`Turma: ${filterClass}`);
    if (filterUC !== "todos") badges.push(`UC: ${filterUC}`);
    if (filterRiskStatus !== "todos") {
      badges.push(`Risco: ${formatRiskLevel(filterRiskStatus)}`);
    }
    if (filterEnrollmentStatus !== "todos") {
      badges.push(
        `Matricula: ${formatEnrollmentStatusLabel(filterEnrollmentStatus)}`,
      );
    }
    if (filterEmailStatus !== "todos") {
      badges.push(`E-mail: ${emailStatusLabels[filterEmailStatus]}`);
    }

    return badges;
  }, [
    filterClass,
    filterCourse,
    filterEmailStatus,
    filterEnrollmentStatus,
    filterRiskStatus,
    filterSchool,
    filterUC,
  ]);

  useBackgroundActivityFlag({
    id: user?.id
      ? `messages:bulk-send:request:${user.id}`
      : "messages:bulk-send:request",
    active: Boolean(user?.id) && (isSending || isScheduling),
    label:
      deliveryMode === "scheduled"
        ? "Agendando campanha"
        : "Preparando envio em massa",
    description:
      deliveryMode === "scheduled"
        ? "Congelando destinatarios e configurando a entrega futura."
        : "Enfileirando destinatarios e validando o disparo.",
    source: "messages",
  });

  useEffect(() => {
    if (!user || !hasActiveJobs) return;

    const intervalId = window.setInterval(() => {
      fetchRecentJobs({ silent: true });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchRecentJobs, hasActiveJobs, user]);

  useEffect(() => {
    setAudiencePage(1);
  }, [
    deferredSearchQuery,
    filterSchool,
    filterCourse,
    filterClass,
    filterUC,
    filterRiskStatus,
    filterEnrollmentStatus,
    filterEmailStatus,
  ]);

  useEffect(() => {
    if (audiencePage > audienceTotalPages) {
      setAudiencePage(audienceTotalPages);
    }
  }, [audiencePage, audienceTotalPages]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
  };

  const clearAll = () => setSelectedStudentIds(new Set());

  const handleSchoolChange = (value: string) => {
    setFilterSchool(value);
    setFilterCourse("todos");
    setFilterClass("todos");
    setFilterUC("todos");
  };

  const handleCourseChange = (value: string) => {
    setFilterCourse(value);
    setFilterClass("todos");
    setFilterUC("todos");
  };

  const handleClassChange = (value: string) => {
    setFilterClass(value);
    setFilterUC("todos");
  };

  const resetCampaignBuilder = useCallback(() => {
    setSelectedStudentIds(new Set());
    setMessageContent("");
    setDeliveryMode("now");
    setScheduledTitle("");
    setScheduledAt("");
    setScheduledNotes("");
    setCurrentStep("audience");
  }, []);

  const validateMessageContext = useCallback(
    (content: string, sourceLabel: string) => {
      const unavailableVariables = getUnavailableTemplateVariables(
        content,
        variableAvailability,
      );

      if (unavailableVariables.length === 0) return true;

      toast.error(
        `${sourceLabel} usa variaveis indisponiveis neste contexto: ${buildUnavailableVariablesText(unavailableVariables)}`,
      );
      return false;
    },
    [variableAvailability],
  );

  const buildStudentVariableData = useCallback(
    (student: StudentOption) => {
      const resolvedContext = resolveStudentCourseContext(
        student,
        currentFilters,
      );
      const selectedCourse = resolvedContext.selectedCourse;
      const courseLookupKey = selectedCourse
        ? buildStudentCourseKey(student.id, selectedCourse.course_id)
        : null;

      return {
        nome_aluno: student.full_name,
        email_aluno: student.email || "Sem email",
        ultimo_acesso: formatDateLabel(
          selectedCourse?.last_access || student.last_access,
        ),
        nivel_risco: formatRiskLevel(student.current_risk_level),
        nota_media: formatGradeLabel(
          courseLookupKey ? gradeLookup[courseLookupKey] : undefined,
        ),
        atividades_pendentes: String(
          courseLookupKey ? pendingLookup[courseLookupKey] || 0 : 0,
        ),
        unidade_curricular: resolvedContext.unidadeCurricular || "N/A",
        turma: resolvedContext.className || "N/A",
        curso: resolvedContext.course || "N/A",
        escola: resolvedContext.school || "N/A",
        nome_tutor: user?.full_name || "Tutor",
      };
    },
    [currentFilters, gradeLookup, pendingLookup, user],
  );

  const applyTemplate = (template: MessageTemplateOption) => {
    const unavailableVariables =
      templateUnavailableVariables.get(template.id) || [];

    if (unavailableVariables.length > 0) {
      toast.error(
        `O modelo "${template.title}" nao pode ser usado neste contexto: ${buildUnavailableVariablesText(unavailableVariables)}`,
      );
      return;
    }

    setMessageContent(template.content);
    setTemplateDialogOpen(false);
    toast.success(`Modelo "${template.title}" aplicado`);
  };

  const previewStudent = useMemo(() => {
    return selectedStudents[0];
  }, [selectedStudents]);

  const previewMessage = useMemo(() => {
    if (!previewStudent || !messageContent) return "";
    return resolveVariables(
      messageContent,
      buildStudentVariableData(previewStudent),
    );
  }, [buildStudentVariableData, messageContent, previewStudent]);

  const handlePreview = () => {
    if (!validateMessageContext(messageContent, "A mensagem")) return;
    setPreviewDialogOpen(true);
  };

  const handleSchedule = useCallback(async () => {
    if (
      !user ||
      selectedStudents.length === 0 ||
      !messageContent.trim()
    )
      return;
    if (!validateMessageContext(messageContent, "A mensagem")) return;

    const resolvedScheduledAt =
      scheduledAt.trim() || new Date(Date.now() + 60 * 60 * 1000).toISOString();

    setIsScheduling(true);

    try {
      const recipientSnapshot = selectedStudents.map((student) => ({
        student_id: student.id,
        moodle_user_id: student.moodle_user_id,
        student_name: student.full_name,
        personalized_message: resolveVariables(
          messageContent,
          buildStudentVariableData(student),
        ),
      }));

      await createScheduledMessage(user.id, {
        title:
          scheduledTitle.trim() ||
          buildDefaultScheduledTitle(selectedStudents.length),
        message_content: messageContent,
        scheduled_at: resolvedScheduledAt,
        recipient_count: selectedStudents.length,
        notes: scheduledNotes.trim() || undefined,
        channel: "moodle",
        execution_context: {
          schema_version: 1,
          mode: "bulk_message_snapshot",
          channel: "moodle",
          created_via: "bulk_send_tab",
          automatic_execution_supported: false,
          blocking_reason: moodleSession
            ? "credential_snapshot_missing"
            : "moodle_session_missing",
          moodle_url: moodleSession?.moodleUrl,
          recipient_snapshot: recipientSnapshot,
        },
      });

      toast.success("Campanha agendada com snapshot de destinatarios");
      resetCampaignBuilder();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar agendamento");
    } finally {
      setIsScheduling(false);
    }
  }, [
    buildStudentVariableData,
    messageContent,
    moodleSession,
    scheduledAt,
    scheduledNotes,
    scheduledTitle,
    selectedStudents,
    user,
    validateMessageContext,
    resetCampaignBuilder,
  ]);

  const handleSend = useCallback(async () => {
    if (
      !user ||
      !moodleSession ||
      selectedStudents.length === 0 ||
      !messageContent.trim()
    )
      return;
    if (!validateMessageContext(messageContent, "A mensagem")) return;

    if (hasActiveJobs) {
      toast.error(
        "Ja existe um envio em andamento ou na fila. Aguarde a finalizacao para evitar duplicidade.",
      );
      return;
    }

    setIsSending(true);

    try {
      const result = await startBulkMessageSend({
        userId: user.id,
        messageContent,
        moodleUrl: moodleSession.moodleUrl,
        moodleToken: moodleSession.moodleToken,
        recipients: selectedStudents.map((student) => ({
          studentId: student.id,
          moodleUserId: student.moodle_user_id,
          studentName: student.full_name,
          personalizedMessage: resolveVariables(
            messageContent,
            buildStudentVariableData(student),
          ),
        })),
      });

      if (result.kind === "duplicate") {
        toast.error(
          "Envio semelhante ja existe na fila/processamento. Evite duplicar o disparo.",
        );
        await fetchRecentJobs();
        return;
      }

      toast.success(
        `Envio em massa iniciado para ${selectedStudents.length} alunos`,
      );
      resetCampaignBuilder();
      await fetchRecentJobs();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao iniciar envio em massa");
    } finally {
      setIsSending(false);
    }
  }, [
    buildStudentVariableData,
    fetchRecentJobs,
    hasActiveJobs,
    messageContent,
    moodleSession,
    resetCampaignBuilder,
    selectedStudents,
    user,
    validateMessageContext,
  ]);

  const handleTransformToRoutine = useCallback(() => {
    if (!validateMessageContext(messageContent, "A mensagem")) return;
    if (selectedStudents.length === 0 || !messageContent.trim()) return;

    writeCampaignRoutineDraft({
      channel: "moodle",
      createdAt: new Date().toISOString(),
      messageContent,
      previewMessage: previewMessage || undefined,
      recipientCount: selectedStudents.length,
      recipientsPreview: selectedStudents.slice(0, 8).map((student) => ({
        id: student.id,
        name: student.full_name,
        email: student.email,
        riskLevel: student.current_risk_level,
      })),
      filters: {
        school: filterSchool !== "todos" ? filterSchool : undefined,
        course: filterCourse !== "todos" ? filterCourse : undefined,
        className: filterClass !== "todos" ? filterClass : undefined,
        uc: filterUC !== "todos" ? filterUC : undefined,
        riskStatus: filterRiskStatus !== "todos" ? filterRiskStatus : undefined,
        enrollmentStatus:
          filterEnrollmentStatus !== "todos"
            ? filterEnrollmentStatus
            : undefined,
        emailStatus: filterEmailStatus !== "todos" ? filterEmailStatus : undefined,
      },
    });

    toast.success("Rascunho enviado para Automacoes");
    navigate("/automacoes?tab=gatilhos");
  }, [
    filterClass,
    filterCourse,
    filterEmailStatus,
    filterEnrollmentStatus,
    filterRiskStatus,
    filterSchool,
    filterUC,
    messageContent,
    navigate,
    previewMessage,
    selectedStudents,
    validateMessageContext,
  ]);

  const handleStepChange = useCallback(
    (nextStep: CampaignStep) => {
      if (nextStep === currentStep) return;

      if (nextStep === "message" && selectedStudents.length === 0) {
        toast.error("Selecione pelo menos um destinatario para continuar.");
        return;
      }

      if (nextStep === "review") {
        if (selectedStudents.length === 0) {
          toast.error("Selecione pelo menos um destinatario para revisar.");
          return;
        }

        if (!messageContent.trim()) {
          toast.error("Escreva a mensagem da campanha antes de revisar.");
          return;
        }

        if (!validateMessageContext(messageContent, "A mensagem")) return;
      }

      setCurrentStep(nextStep);
    },
    [
      currentStep,
      messageContent,
      selectedStudents.length,
      validateMessageContext,
    ],
  );

  const getStatusBadge = (status: string) => {
    const map: Record<
      string,
      {
        label: string;
        variant: "default" | "secondary" | "destructive" | "outline";
      }
    > = {
      pending: { label: "Na fila", variant: "outline" },
      processing: { label: "Enviando...", variant: "default" },
      completed: { label: "Concluido", variant: "secondary" },
      failed: { label: "Falhou", variant: "destructive" },
      cancelled: { label: "Cancelado", variant: "outline" },
    };
    const m = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  const renderAudienceStep = () => (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">
              Etapa 1: selecionar destinatarios
            </CardTitle>
            <CardDescription className="mt-1">
              Comece pela audiencia. Use filtros, tabela e selecao em lote para
              fechar o recorte antes de escrever a mensagem.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {filteredStudents.length} no recorte
            </Badge>
            <Badge
              variant={selectedStudents.length > 0 ? "default" : "secondary"}
            >
              {selectedStudents.length} selecionados
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Select value={filterSchool} onValueChange={handleSchoolChange}>
            <SelectTrigger>
              <SelectValue placeholder="Escola" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas escolas</SelectItem>
              {filterOptions.schools.map((school) => (
                <SelectItem key={school} value={school}>
                  {school}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterCourse} onValueChange={handleCourseChange}>
            <SelectTrigger>
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos cursos</SelectItem>
              {filterOptions.courses.map((course) => (
                <SelectItem key={course} value={course}>
                  {course}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterClass} onValueChange={handleClassChange}>
            <SelectTrigger>
              <SelectValue placeholder="Turma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas turmas</SelectItem>
              {filterOptions.classes.map((className) => (
                <SelectItem key={className} value={className}>
                  {className}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterUC} onValueChange={setFilterUC}>
            <SelectTrigger>
              <SelectValue placeholder="UC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas UCs</SelectItem>
              {filterOptions.ucs.map((uc) => (
                <SelectItem key={uc} value={uc}>
                  {uc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterRiskStatus} onValueChange={setFilterRiskStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status de risco" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(riskLevelLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterEnrollmentStatus}
            onValueChange={setFilterEnrollmentStatus}
          >
            <SelectTrigger>
              <SelectValue placeholder="Matricula" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas matriculas</SelectItem>
              {enrollmentStatusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {formatEnrollmentStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterEmailStatus} onValueChange={setFilterEmailStatus}>
            <SelectTrigger>
              <SelectValue placeholder="E-mail" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(emailStatusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar aluno por nome ou email..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Selecionar todos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={selectedStudents.length === 0}
            >
              Limpar
            </Button>
          </div>
        </div>

        {selectedStudents.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/20 p-3">
            {selectedStudents.slice(0, 10).map((student) => (
              <Badge
                key={student.id}
                variant="secondary"
                className="gap-1 pr-1 text-[11px]"
              >
                {student.full_name}
                <button
                  type="button"
                  onClick={() => toggleStudent(student.id)}
                  className="rounded-full p-0.5 hover:bg-background/70 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedStudents.length > 10 && (
              <Badge variant="outline" className="text-[11px]">
                +{selectedStudents.length - 10} mais
              </Badge>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border">
          {isLoadingStudents ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        allFilteredSelected
                          ? true
                          : someFilteredSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          selectAll();
                          return;
                        }

                        clearAll();
                      }}
                      aria-label="Selecionar todos os alunos filtrados"
                    />
                  </TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Contexto academico
                  </TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead className="hidden lg:table-cell">Status</TableHead>
                  <TableHead className="hidden xl:table-cell">
                    Ultimo acesso
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      Nenhum aluno corresponde aos filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedFilteredStudents.map((student) => {
                    const isSelected = selectedStudentIds.has(student.id);
                    const courseNames = student.courses
                      .slice(0, 2)
                      .map((course) => course.course_name)
                      .join(", ");

                    return (
                      <TableRow
                        key={student.id}
                        data-state={isSelected ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => toggleStudent(student.id)}
                      >
                        <TableCell
                          className="w-12"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleStudent(student.id)}
                            aria-label={`Selecionar ${student.full_name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarImage
                                src={student.avatar_url ?? undefined}
                                alt={student.full_name}
                              />
                              <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                                {student.full_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {student.full_name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {student.email || "Sem email"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="space-y-1">
                            <p className="text-sm text-foreground">
                              {courseNames || "Sem curso vinculado"}
                            </p>
                            {student.courses.length > 2 && (
                              <p className="text-[11px] text-muted-foreground">
                                +{student.courses.length - 2} outros cursos no
                                perfil
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatRiskLevel(student.current_risk_level)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {student.enrollment_status || "ativo"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {formatDateLabel(student.last_access)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {filteredStudents.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Exibindo {(audiencePage - 1) * AUDIENCE_PAGE_SIZE + 1}-
              {(audiencePage - 1) * AUDIENCE_PAGE_SIZE +
                paginatedFilteredStudents.length}{" "}
              de {filteredStudents.length} destinatarios
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAudiencePage((current) => Math.max(1, current - 1))
                }
                disabled={audiencePage === 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Pagina {audiencePage} de {audienceTotalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAudiencePage((current) =>
                    Math.min(audienceTotalPages, current + 1),
                  )
                }
                disabled={audiencePage >= audienceTotalPages}
              >
                Proxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Feche o recorte agora. A etapa seguinte usa essa audiencia para
            liberar modelos, variaveis e preview.
          </p>
          <Button
            onClick={() => handleStepChange("message")}
            disabled={selectedStudents.length === 0}
          >
            Avancar para mensagem
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderMessageStep = () => (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">
              Etapa 2: construir a mensagem
            </CardTitle>
            <CardDescription className="mt-1">
              Escreva a mensagem, aplique modelos e valide o contexto dinamico
              antes de seguir para a revisao.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              fetchTemplates();
              setTemplateDialogOpen(true);
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            Usar modelo
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Destinatarios
            </p>
            <p className="mt-1 text-sm font-semibold">
              {selectedStudents.length}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Variaveis liberadas
            </p>
            <p className="mt-1 text-sm font-semibold">
              {availableVariableKeys.length}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Contexto UC
            </p>
            <p className="mt-1 text-sm font-semibold">
              {filterUC !== "todos" ? filterUC : "Amplo"}
            </p>
          </div>
        </div>

        <DynamicVariableInput
          value={messageContent}
          onChange={setMessageContent}
          rows={14}
          className="min-h-[20rem] resize-none"
          availableVariableKeys={availableVariableKeys}
          showInlinePreview={false}
        />

        {messageUnavailableVariables.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-medium">
              Este conteudo precisa de um contexto mais especifico para ser
              enviado.
            </p>
            <div className="mt-2 space-y-1">
              {messageUnavailableVariables.map((item) => (
                <p key={item.key}>
                  <span className="font-medium">
                    {getVariableLabel(item.key)}:
                  </span>{" "}
                  {item.reason}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={() => setCurrentStep("audience")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para destinatarios
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={!canPreviewOrSend}
            >
              <Eye className="mr-2 h-4 w-4" />
              Pre-visualizar
            </Button>
            <Button
              onClick={() => handleStepChange("review")}
              disabled={!canPreviewOrSend}
            >
              Revisar campanha
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderReviewStep = () => (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Etapa 3: revisar o envio</CardTitle>
        <CardDescription className="mt-1">
          Confira quem vai receber, veja o preview final e use os botoes abaixo
          para enviar agora, agendar ou transformar em rotina.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Canal
            </p>
            <p className="mt-1 text-sm font-semibold">Moodle</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Destinatarios
            </p>
            <p className="mt-1 text-sm font-semibold">
              {selectedStudents.length}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Variaveis
            </p>
            <p className="mt-1 text-sm font-semibold">
              {availableVariableKeys.length}
            </p>
          </div>
        </div>

        {selectedStudents.length > 0 && filterUC === "todos" && (
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            Selecione uma UC especifica se precisar liberar variaveis como
            Unidade Curricular, Nota Media e Atividades Pendentes.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">
              Preview da mensagem
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Exemplo real da mensagem que sera gerada para o primeiro
              destinatario selecionado.
            </p>

            {previewStudent ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {previewStudent.full_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {previewStudent.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {previewStudent.email || "Sem email"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-background p-4">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {previewMessage || messageContent}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                Selecione ao menos um destinatario para montar o preview.
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                Quem vai receber
              </p>
              <Badge variant="outline">{selectedStudents.length} alunos</Badge>
            </div>

            <div className="mt-4 space-y-2">
              {selectedStudents.length > 0 ? (
                <>
                  {selectedStudents.slice(0, 6).map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between rounded-2xl border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {student.full_name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {student.email || "Sem email"}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {formatRiskLevel(student.current_risk_level)}
                      </Badge>
                    </div>
                  ))}

                  {selectedStudents.length > 6 && (
                    <p className="text-[11px] text-muted-foreground">
                      +{selectedStudents.length - 6} outros destinatarios entram
                      neste envio.
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum destinatario selecionado.
                </div>
              )}
            </div>

            {activeFilterBadges.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Filtros ativos
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeFilterBadges.map((badge) => (
                    <Badge
                      key={badge}
                      variant="outline"
                      className="text-[11px]"
                    >
                      {badge}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={() => setCurrentStep("message")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para mensagem
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!canPreviewOrSend}
          >
            <Eye className="mr-2 h-4 w-4" />
            Pre-visualizar campanha
          </Button>

          <Button
            onClick={() => {
              setDeliveryMode("now");
              void handleSend();
            }}
            disabled={!canPreviewOrSend || isSending || isScheduling}
          >
            {isSending && deliveryMode === "now" ? (
              <Spinner className="mr-2 h-4 w-4" onAccent />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar agora
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setDeliveryMode("scheduled");
              void handleSchedule();
            }}
            disabled={!canPreviewOrSend || isSending || isScheduling}
          >
            {isScheduling ? (
              <Spinner className="mr-2 h-4 w-4" onAccent />
            ) : (
              <CalendarClock className="mr-2 h-4 w-4" />
            )}
            Agendar
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setDeliveryMode("routine");
              handleTransformToRoutine();
            }}
            disabled={!canPreviewOrSend || isSending || isScheduling}
          >
            <Workflow className="mr-2 h-4 w-4" />
            Transformar em rotina
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderRecentJobsCard = () =>
    recentJobs.length > 0 ? (
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Execucoes recentes</CardTitle>
          <CardDescription>
            Acompanhe os ultimos disparos sem sair da tela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentJobs.map((job) => (
            <div key={job.id} className="space-y-2 rounded-2xl border p-3">
              <div className="flex items-center justify-between gap-2">
                {getStatusBadge(job.status)}
                <span className="text-[11px] text-muted-foreground">
                  {job.sent_count}/{job.total_recipients} enviados
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-foreground">
                {job.message_content}
              </p>
              {job.status === "processing" && (
                <Progress
                  value={(job.sent_count / job.total_recipients) * 100}
                  className="h-1.5"
                />
              )}
              {job.failed_count > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {job.failed_count} falhas
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    ) : null;

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Construtor da campanha
              </p>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  Primeiro defina a audiencia, depois monte a mensagem e
                  finalize a execucao.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  O fluxo foi reorganizado para funcionar como um wizard de CRM:
                  selecao, criacao e revisao.
                </p>
              </div>
            </div>

            <Badge variant="secondary" className="w-fit">
              Canal Moodle
            </Badge>
          </div>

          <Progress value={stepProgress} className="h-2" />

          <div className="grid gap-3 md:grid-cols-3">
            {campaignSteps.map((step, index) => {
              const isActive = currentStep === step.id;
              const isCompleted = index < currentStepIndex;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleStepChange(step.id)}
                  className={cn(
                    "rounded-2xl border px-4 py-4 text-left transition-colors hover:bg-muted/40",
                    isActive && "border-primary bg-primary/5",
                    isCompleted && "border-primary/30",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                        isActive || isCompleted
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {step.title}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {currentStep === "audience" ? (
        <div className="space-y-4">
          {renderAudienceStep()}
          {renderRecentJobsCard()}
        </div>
      ) : (
        <div className="space-y-4">
          {currentStep === "message" && renderMessageStep()}
          {currentStep === "review" && renderReviewStep()}
          {renderRecentJobsCard()}
        </div>
      )}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher Modelo</DialogTitle>
            <DialogDescription>
              Selecione um modelo compativel com os filtros atuais de
              destinatarios.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum modelo criado. Crie um na aba "Modelos" desta tela.
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => {
                  const unavailableVariables =
                    templateUnavailableVariables.get(template.id) || [];
                  const disabled = unavailableVariables.length > 0;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        disabled
                          ? "cursor-not-allowed border-dashed opacity-70"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => applyTemplate(template)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">{template.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {getCategoryLabel(template.category)}
                        </Badge>
                        {template.is_favorite && (
                          <Badge variant="secondary" className="text-[10px]">
                            Favorito
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {template.content}
                      </p>
                      {disabled && (
                        <p className="mt-2 text-[11px] text-amber-700">
                          {buildUnavailableVariablesText(unavailableVariables)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pre-visualizacao da Mensagem</DialogTitle>
            <DialogDescription>
              Confira como a mensagem personalizada sera enviada para o primeiro
              destinatario selecionado.
            </DialogDescription>
          </DialogHeader>
          {previewStudent && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {previewStudent.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {previewStudent.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exemplo de como a mensagem sera enviada
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm whitespace-pre-wrap">{previewMessage}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Variaveis dependentes de UC ficam disponiveis somente quando uma
                Unidade Curricular especifica esta selecionada.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewDialogOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
