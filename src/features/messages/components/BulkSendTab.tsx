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
  SlidersHorizontal,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Send,
  Search,
  X,
  FileText,
  Eye,
  EyeOff,
  Pencil,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
} from "@/features/messages/api/bulk-messaging.repository";
import { createScheduledMessage } from "@/features/automations/api/automations.repository";
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

type CampaignScheduleMode =
  | "specific_date"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly";

type WeekdayValue = "0" | "1" | "2" | "3" | "4" | "5" | "6";
type CampaignStep = "audience" | "message" | "review";

const WEEKDAY_OPTIONS: Array<{ value: WeekdayValue; label: string }> = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terca-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sabado" },
];

function computeFirstScheduledAt(input: {
  scheduleMode: CampaignScheduleMode;
  scheduledAt: string;
  routineStartDate: string;
  routineTimeOfDay: string;
  routineWeekday: WeekdayValue;
  routineMonthlyDay: string;
}) {
  if (input.scheduleMode === "specific_date") {
    return input.scheduledAt.trim();
  }

  if (!input.routineStartDate || !input.routineTimeOfDay) {
    return "";
  }

  const base = new Date(`${input.routineStartDate}T${input.routineTimeOfDay}:00`);
  if (Number.isNaN(base.getTime())) return "";

  if (input.scheduleMode === "daily") {
    return base.toISOString();
  }

  if (input.scheduleMode === "weekly" || input.scheduleMode === "biweekly") {
    const weekday = Number(input.routineWeekday);
    const candidate = new Date(base);
    const delta = (weekday - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + delta);
    return candidate.toISOString();
  }

  const requestedDay = Math.max(1, Math.min(31, Number(input.routineMonthlyDay || "1")));
  const candidate = new Date(base);
  candidate.setDate(1);
  const maxDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
  candidate.setDate(Math.min(requestedDay, maxDay));

  if (candidate < base) {
    candidate.setMonth(candidate.getMonth() + 1);
    const nextMax = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    candidate.setDate(Math.min(requestedDay, nextMax));
  }

  return candidate.toISOString();
}

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
  const [messageInlinePreviewOpen, setMessageInlinePreviewOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplateOption[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [recentJobs, setRecentJobs] = useState<BulkMessageJobPreview[]>([]);
  const [currentStep, setCurrentStep] = useState<CampaignStep>("audience");
  const [creationModalOpen, setCreationModalOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<CampaignScheduleMode>("specific_date");
  const [scheduledTitle, setScheduledTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledNotes, setScheduledNotes] = useState("");
  const [routineStartDate, setRoutineStartDate] = useState("");
  const [routineTimeOfDay, setRoutineTimeOfDay] = useState("");
  const [routineWeekday, setRoutineWeekday] = useState<WeekdayValue>("1");
  const [routineMonthlyDay, setRoutineMonthlyDay] = useState("1");

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
  useBackgroundActivityFlag({
    id: user?.id
      ? `messages:bulk-send:request:${user.id}`
      : "messages:bulk-send:request",
    active: Boolean(user?.id) && isScheduling,
    label: "Criando campanha agendada",
    description: "Congelando destinatarios e registrando configuracao de execucao.",
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

  const clearAllFilters = () => {
    setFilterSchool("todos");
    setFilterCourse("todos");
    setFilterClass("todos");
    setFilterUC("todos");
    setFilterRiskStatus("todos");
    setFilterEnrollmentStatus("todos");
    setFilterEmailStatus("todos");
    setSearchQuery("");
  };

  const resetCampaignBuilder = useCallback(() => {
    setSelectedStudentIds(new Set());
    setSearchQuery("");
    setFilterSchool("todos");
    setFilterCourse("todos");
    setFilterClass("todos");
    setFilterUC("todos");
    setFilterRiskStatus("todos");
    setFilterEnrollmentStatus("todos");
    setFilterEmailStatus("todos");
    setAudiencePage(1);
    setMessageContent("");
    setMessageInlinePreviewOpen(false);
    setScheduleMode("specific_date");
    setScheduledTitle("");
    setScheduledAt("");
    setScheduledNotes("");
    setRoutineStartDate("");
    setRoutineTimeOfDay("");
    setRoutineWeekday("1");
    setRoutineMonthlyDay("1");
    setCurrentStep("audience");
  }, []);

  const handleCreationModalOpenChange = useCallback(
    (open: boolean) => {
      setCreationModalOpen(open);
      if (!open) {
        resetCampaignBuilder();
      }
    },
    [resetCampaignBuilder],
  );

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

  const handleSchedule = useCallback(async () => {
    if (
      !user ||
      selectedStudents.length === 0 ||
      !messageContent.trim()
    )
      return;
    if (!validateMessageContext(messageContent, "A mensagem")) return;

    const resolvedScheduledAt = computeFirstScheduledAt({
      scheduleMode,
      scheduledAt,
      routineStartDate,
      routineTimeOfDay,
      routineWeekday,
      routineMonthlyDay,
    });

    if (!resolvedScheduledAt) {
      toast.error("Configure corretamente data e horario da campanha.");
      return;
    }

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
          schema_version: 2,
          mode: "bulk_message_snapshot",
          channel: "moodle",
          created_via: "campaigns_bulk_send_tab",
          automatic_execution_supported: true,
          moodle_url: moodleSession?.moodleUrl,
          schedule: {
            type: scheduleMode,
            start_date:
              scheduleMode === "specific_date" ? undefined : routineStartDate,
            time:
              scheduleMode === "specific_date" ? undefined : routineTimeOfDay,
            weekday:
              scheduleMode === "weekly" || scheduleMode === "biweekly"
                ? Number(routineWeekday)
                : undefined,
            monthly_day:
              scheduleMode === "monthly"
                ? Number(routineMonthlyDay)
                : undefined,
          },
          recipient_snapshot: recipientSnapshot,
        },
      });

      toast.success("Campanha criada com agendamento");
      resetCampaignBuilder();
      setCreationModalOpen(false);
      navigate("/campanhas?tab=campanhas");
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
    navigate,
    routineMonthlyDay,
    routineStartDate,
    routineTimeOfDay,
    routineWeekday,
    scheduleMode,
    scheduledAt,
    scheduledNotes,
    scheduledTitle,
    selectedStudents,
    user,
    validateMessageContext,
    resetCampaignBuilder,
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{filteredStudents.length} no recorte</Badge>
        <Badge variant={selectedStudents.length > 0 ? "default" : "secondary"}>
          {selectedStudents.length} selecionados
        </Badge>
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

          <div className="flex flex-wrap gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filtros
                  {(filterSchool !== "todos" ||
                    filterCourse !== "todos" ||
                    filterClass !== "todos" ||
                    filterUC !== "todos" ||
                    filterRiskStatus !== "todos" ||
                    filterEnrollmentStatus !== "todos" ||
                    filterEmailStatus !== "todos") && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      ativos
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Refinar audiencia
                </p>

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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    value={filterRiskStatus}
                    onValueChange={setFilterRiskStatus}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Risco" />
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
                </div>

                <Select
                  value={filterEmailStatus}
                  onValueChange={setFilterEmailStatus}
                >
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

                <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
                  Limpar filtros
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border">
          {isLoadingStudents ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
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
                  <p className="text-xs text-muted-foreground">
                    Selecionar todos os alunos da pagina
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {paginatedFilteredStudents.length} na pagina
                </Badge>
              </div>

              {filteredStudents.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum aluno corresponde aos filtros atuais.
                </p>
              ) : (
                paginatedFilteredStudents.map((student) => {
                  const isSelected = selectedStudentIds.has(student.id);

                  return (
                    <button
                      key={student.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "hover:bg-muted/40",
                      )}
                      onClick={() => toggleStudent(student.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleStudent(student.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Selecionar ${student.full_name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {student.full_name}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {formatRiskLevel(student.current_risk_level)}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.email || "Sem email"}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {student.courses[0]?.course_name || "Sem curso vinculado"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
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
        <p className="text-xs text-muted-foreground">
          Feche o recorte agora. A etapa seguinte usa essa audiencia para
          liberar modelos, variaveis e preview.
        </p>
    </div>
  );

  const renderMessageStep = () => (
    <div className="space-y-5">
      <div className="flex justify-end">
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

      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-7 z-10 h-8 w-8"
          onClick={() => {
            if (!messageInlinePreviewOpen && !validateMessageContext(messageContent, "A mensagem")) {
              return;
            }
            setMessageInlinePreviewOpen((current) => !current);
          }}
          disabled={!messageContent.trim()}
          title={messageInlinePreviewOpen ? "Voltar para edicao" : "Pre-visualizar mensagem"}
        >
          {messageInlinePreviewOpen ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>

        {messageInlinePreviewOpen ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Pre-visualizacao da mensagem para o primeiro destinatario selecionado.
            </p>
            <div className="min-h-[20rem] rounded-md border bg-muted/20 p-3">
              <div className="max-h-[20rem] overflow-auto whitespace-pre-wrap break-words text-sm text-foreground">
                {previewMessage || messageContent}
              </div>
            </div>
          </div>
        ) : (
          <DynamicVariableInput
            value={messageContent}
            onChange={setMessageContent}
            rows={14}
            className="min-h-[20rem] resize-none"
            availableVariableKeys={availableVariableKeys}
            showInlinePreview={false}
          />
        )}
      </div>

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
          Voltar
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => handleStepChange("review")}
            disabled={!canPreviewOrSend}
          >
            Agendar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-5">

        <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Configuracao de agendamento
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">Tipo de programacao</p>
              <Select
                value={scheduleMode}
                onValueChange={(value: CampaignScheduleMode) =>
                  setScheduleMode(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specific_date">Data especifica</SelectItem>
                  <SelectItem value="daily">Rotina diaria</SelectItem>
                  <SelectItem value="weekly">Rotina semanal</SelectItem>
                  <SelectItem value="biweekly">Rotina quinzenal</SelectItem>
                  <SelectItem value="monthly">Rotina mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scheduleMode === "specific_date" ? (
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-muted-foreground">Data e horario</p>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Data inicial</p>
                  <Input
                    type="date"
                    value={routineStartDate}
                    onChange={(event) => setRoutineStartDate(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Horario</p>
                  <Input
                    type="time"
                    value={routineTimeOfDay}
                    onChange={(event) => setRoutineTimeOfDay(event.target.value)}
                  />
                </div>
              </>
            )}

            {(scheduleMode === "weekly" || scheduleMode === "biweekly") && (
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-muted-foreground">Dia da semana</p>
                <Select
                  value={routineWeekday}
                  onValueChange={(value: WeekdayValue) =>
                    setRoutineWeekday(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduleMode === "monthly" && (
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs text-muted-foreground">Dia do mes</p>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={routineMonthlyDay}
                  onChange={(event) => setRoutineMonthlyDay(event.target.value)}
                />
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">Titulo do agendamento (opcional)</p>
              <Input
                value={scheduledTitle}
                onChange={(event) => setScheduledTitle(event.target.value)}
                placeholder="Ex: Lembrete semanal de atividades"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">Observacoes (opcional)</p>
              <Input
                value={scheduledNotes}
                onChange={(event) => setScheduledNotes(event.target.value)}
                placeholder="Contexto da campanha"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={() => setCurrentStep("message")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volta
          </Button>

          <Button onClick={() => void handleSchedule()} disabled={!canPreviewOrSend || isScheduling}>
            {isScheduling ? (
              <Spinner className="mr-2 h-4 w-4" onAccent />
            ) : (
              <CalendarClock className="mr-2 h-4 w-4" />
            )}
            Criar campanha
          </Button>
        </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Criacao de campanha</p>
            <p className="text-xs text-muted-foreground">
              Defina destinatarios, mensagem e data/agendamento/rotina no mesmo fluxo.
            </p>
          </div>
          <Button className="gap-2" onClick={() => setCreationModalOpen(true)}>
            <CalendarDays className="h-4 w-4" />
            Nova campanha
          </Button>
        </CardContent>
      </Card>

      <Dialog open={creationModalOpen} onOpenChange={handleCreationModalOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
            <DialogDescription>Destinatarios, mensagem e agendamento.</DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2" preventContentOverflow>
            <div className="space-y-4 pb-1">
              {currentStep === "audience" ? (
                <div className="space-y-4">{renderAudienceStep()}</div>
              ) : (
                <div className="space-y-4">
                  {currentStep === "message" && renderMessageStep()}
                  {currentStep === "review" && renderReviewStep()}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            {currentStep === "audience" ? (
              <Button
                onClick={() => handleStepChange("message")}
                disabled={selectedStudents.length === 0}
              >
                Mensagem
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
