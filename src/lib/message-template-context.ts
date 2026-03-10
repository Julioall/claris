import { parseCourseCategoryPath } from '@/lib/course-category';

export type DynamicVariableKey =
  | 'nome_aluno'
  | 'email_aluno'
  | 'ultimo_acesso'
  | 'nivel_risco'
  | 'nota_media'
  | 'atividades_pendentes'
  | 'unidade_curricular'
  | 'turma'
  | 'curso'
  | 'escola'
  | 'nome_tutor';

export interface BulkMessageContextCourse {
  course_id: string;
  course_name: string;
  category?: string | null;
  last_access?: string | null;
}

export interface BulkMessageContextStudent {
  id: string;
  courses: BulkMessageContextCourse[];
}

export interface BulkMessageContextFilters {
  school: string;
  course: string;
  className: string;
  uc: string;
}

export interface DynamicVariableAvailability {
  available: boolean;
  reason?: string;
}

export interface ResolvedStudentCourseContext {
  matches: Array<BulkMessageContextCourse & {
    parsed: ReturnType<typeof parseCourseCategoryPath>;
    ucLabel: string;
  }>;
  school?: string;
  course?: string;
  className?: string;
  unidadeCurricular?: string;
  selectedCourse?: BulkMessageContextCourse;
}

const ALWAYS_AVAILABLE_KEYS: DynamicVariableKey[] = [
  'nome_aluno',
  'email_aluno',
  'ultimo_acesso',
  'nivel_risco',
  'nome_tutor',
];

const CATEGORY_CONTEXT_KEYS: DynamicVariableKey[] = ['escola', 'curso', 'turma'];
const UC_CONTEXT_KEYS: DynamicVariableKey[] = ['unidade_curricular', 'nota_media', 'atividades_pendentes'];
const KNOWN_VARIABLE_KEYS = new Set<DynamicVariableKey>([
  ...ALWAYS_AVAILABLE_KEYS,
  ...CATEGORY_CONTEXT_KEYS,
  ...UC_CONTEXT_KEYS,
]);

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function matchesFilters(course: BulkMessageContextCourse, filters: BulkMessageContextFilters): boolean {
  const parsed = parseCourseCategoryPath(course.category);
  const ucLabel = parsed.uc || course.course_name;

  if (filters.school !== 'todos' && parsed.school !== filters.school) return false;
  if (filters.course !== 'todos' && parsed.course !== filters.course) return false;
  if (filters.className !== 'todos' && parsed.className !== filters.className) return false;
  if (filters.uc !== 'todos' && ucLabel !== filters.uc) return false;

  return true;
}

export function extractTemplateVariables(content: string): DynamicVariableKey[] {
  const matches = content.match(/\{([a-z_]+)\}/g) || [];
  const keys = matches.map(match => match.replace(/[{}]/g, '')).filter((key): key is DynamicVariableKey => {
    return KNOWN_VARIABLE_KEYS.has(key as DynamicVariableKey);
  });

  return Array.from(new Set(keys));
}

export function resolveStudentCourseContext(
  student: BulkMessageContextStudent,
  filters: BulkMessageContextFilters,
): ResolvedStudentCourseContext {
  const matches = student.courses
    .filter(course => matchesFilters(course, filters))
    .map(course => {
      const parsed = parseCourseCategoryPath(course.category);
      return {
        ...course,
        parsed,
        ucLabel: parsed.uc || course.course_name,
      };
    });

  const schools = uniqueValues(matches.map(match => match.parsed.school));
  const courses = uniqueValues(matches.map(match => match.parsed.course));
  const classes = uniqueValues(matches.map(match => match.parsed.className));
  const ucs = uniqueValues(matches.map(match => match.ucLabel));

  return {
    matches,
    school: schools.length === 1 ? schools[0] : undefined,
    course: courses.length === 1 ? courses[0] : undefined,
    className: classes.length === 1 ? classes[0] : undefined,
    unidadeCurricular: ucs.length === 1 ? ucs[0] : undefined,
    selectedCourse: matches.length === 1 ? matches[0] : undefined,
  };
}

export function buildBulkMessageVariableAvailability(
  students: BulkMessageContextStudent[],
  filters: BulkMessageContextFilters,
): Record<DynamicVariableKey, DynamicVariableAvailability> {
  const baseAvailability = Object.fromEntries(
    Array.from(KNOWN_VARIABLE_KEYS).map(key => [key, { available: ALWAYS_AVAILABLE_KEYS.includes(key) }]),
  ) as Record<DynamicVariableKey, DynamicVariableAvailability>;

  if (students.length === 0) {
    CATEGORY_CONTEXT_KEYS.forEach(key => {
      baseAvailability[key] = {
        available: false,
        reason: 'Selecione destinatários compatíveis com o contexto atual para liberar esta variável.',
      };
    });

    UC_CONTEXT_KEYS.forEach(key => {
      baseAvailability[key] = {
        available: false,
        reason: 'Selecione uma Unidade Curricular específica para liberar esta variável.',
      };
    });

    return baseAvailability;
  }

  const contexts = students.map(student => resolveStudentCourseContext(student, filters));
  const hasConsistentSchool = contexts.every(context => Boolean(context.school));
  const hasConsistentCourse = contexts.every(context => Boolean(context.course));
  const hasConsistentClass = contexts.every(context => Boolean(context.className));
  const hasSpecificUc = filters.uc !== 'todos';
  const hasUniqueUcContext = contexts.every(context => Boolean(context.selectedCourse && context.unidadeCurricular));

  baseAvailability.escola = hasConsistentSchool
    ? { available: true }
    : {
        available: false,
        reason: 'Refine os filtros para manter uma escola única por aluno.',
      };

  baseAvailability.curso = hasConsistentCourse
    ? { available: true }
    : {
        available: false,
        reason: 'Refine os filtros para manter um curso único por aluno.',
      };

  baseAvailability.turma = hasConsistentClass
    ? { available: true }
    : {
        available: false,
        reason: 'Refine os filtros para manter uma turma única por aluno.',
      };

  const ucReason = !hasSpecificUc
    ? 'Selecione uma Unidade Curricular específica para liberar esta variável.'
    : 'O contexto atual ainda corresponde a mais de uma Unidade Curricular por aluno.';

  UC_CONTEXT_KEYS.forEach(key => {
    baseAvailability[key] = hasSpecificUc && hasUniqueUcContext
      ? { available: true }
      : { available: false, reason: ucReason };
  });

  return baseAvailability;
}

export function getUnavailableTemplateVariables(
  content: string,
  availability: Record<DynamicVariableKey, DynamicVariableAvailability>,
): Array<{ key: DynamicVariableKey; reason?: string }> {
  return extractTemplateVariables(content)
    .filter(key => !availability[key]?.available)
    .map(key => ({ key, reason: availability[key]?.reason }));
}

export function getAvailableVariableKeys(
  availability: Record<DynamicVariableKey, DynamicVariableAvailability>,
): DynamicVariableKey[] {
  return (Object.entries(availability) as Array<[DynamicVariableKey, DynamicVariableAvailability]>)
    .filter(([, value]) => value.available)
    .map(([key]) => key);
}
