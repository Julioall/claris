export interface CourseDateLike {
  id: string;
  category?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  effective_end_date?: string | null;
}

export type CourseLifecycleStatus = 'nao_iniciada' | 'em_andamento' | 'finalizada';

function splitCategoryPath(category: string): string[] {
  if (category.includes(' > ')) {
    return category.split(' > ').map(part => part.trim()).filter(Boolean);
  }

  if (category.includes(' / ')) {
    return category.split(' / ').map(part => part.trim()).filter(Boolean);
  }

  return [category.trim()].filter(Boolean);
}

function getCourseDateGroupKey(course: Pick<CourseDateLike, 'id' | 'category'>): string {
  const category = course.category?.trim();
  if (!category) {
    return `course:${course.id}`;
  }

  const parts = splitCategoryPath(category);

  if (category.includes(' > ') && parts.length >= 4) {
    return parts.slice(0, 4).join('::');
  }

  if (parts.length >= 3) {
    return parts.slice(0, 3).join('::');
  }

  return category;
}

function getSortableStartDate(date?: string | null): number {
  if (!date) return Number.POSITIVE_INFINITY;

  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function hasSharedModuleEndDate<T extends CourseDateLike>(courses: T[]): boolean {
  if (courses.length < 2) return false;

  const endDates = courses.map(course => course.end_date?.trim() || null);
  if (endDates.some(endDate => !endDate)) return false;

  return new Set(endDates).size === 1;
}

export function withEffectiveCourseDates<T extends CourseDateLike>(
  courses: T[],
): Array<T & { effective_end_date: string | null }> {
  const groupedCourses = new Map<string, Array<{ course: T; index: number }>>();

  courses.forEach((course, index) => {
    const groupKey = getCourseDateGroupKey(course);
    const group = groupedCourses.get(groupKey) || [];
    group.push({ course, index });
    groupedCourses.set(groupKey, group);
  });

  const effectiveEndDates = new Map<string, string | null>();

  groupedCourses.forEach(group => {
    const sortedGroup = [...group].sort((left, right) => {
      const leftStart = getSortableStartDate(left.course.start_date);
      const rightStart = getSortableStartDate(right.course.start_date);

      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }

      return left.index - right.index;
    });

    const moduleBasedEndDate = hasSharedModuleEndDate(sortedGroup.map(item => item.course));

    sortedGroup.forEach((item, index) => {
      const rawEndDate = item.course.end_date?.trim() || null;
      const nextStartDate = sortedGroup[index + 1]?.course.start_date?.trim() || null;

      const effectiveEndDate = ((moduleBasedEndDate && nextStartDate) || (!rawEndDate && nextStartDate))
        ? nextStartDate
        : rawEndDate;

      effectiveEndDates.set(item.course.id, effectiveEndDate);
    });
  });

  return courses.map(course => ({
    ...course,
    effective_end_date: effectiveEndDates.get(course.id) ?? course.effective_end_date ?? course.end_date ?? null,
  }));
}

export function getCourseEffectiveEndDate(course: CourseDateLike): string | null {
  return course.effective_end_date?.trim() || course.end_date?.trim() || null;
}

export function isCourseEffectivelyActive(course: CourseDateLike, referenceDate: Date = new Date()): boolean {
  const effectiveEndDate = getCourseEffectiveEndDate(course);
  return !effectiveEndDate || new Date(effectiveEndDate) >= referenceDate;
}

export function isCourseEffectivelyFinished(course: CourseDateLike, referenceDate: Date = new Date()): boolean {
  const effectiveEndDate = getCourseEffectiveEndDate(course);
  return Boolean(effectiveEndDate && new Date(effectiveEndDate) < referenceDate);
}

export function getCourseLifecycleStatus(
  course: CourseDateLike,
  referenceDate: Date = new Date(),
): CourseLifecycleStatus {
  if (course.start_date && new Date(course.start_date) > referenceDate) {
    return 'nao_iniciada';
  }

  return isCourseEffectivelyFinished(course, referenceDate) ? 'finalizada' : 'em_andamento';
}
