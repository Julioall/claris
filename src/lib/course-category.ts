export interface ParsedCourseCategoryPath {
  school: string;
  course: string;
  className: string;
  uc: string;
}

export interface CourseCategoryOptionSource {
  category?: string | null;
  courseName?: string | null;
}

export interface CourseCategoryFilterSelection {
  school?: string;
  course?: string;
  className?: string;
}

export interface CourseCategoryFilterOptions {
  schools: string[];
  courses: string[];
  classes: string[];
  ucs: string[];
}

const EMPTY_CATEGORY_PATH: ParsedCourseCategoryPath = {
  school: '',
  course: '',
  className: '',
  uc: '',
};

function splitCategoryPath(category: string): string[] {
  if (category.includes(' > ')) {
    return category.split(' > ').map(part => part.trim()).filter(Boolean);
  }

  if (category.includes(' / ')) {
    return category.split(' / ').map(part => part.trim()).filter(Boolean);
  }

  return [category.trim()].filter(Boolean);
}

function sortLabels(values: Set<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function parseCourseCategoryPath(category?: string | null): ParsedCourseCategoryPath {
  if (!category) {
    return EMPTY_CATEGORY_PATH;
  }

  const parts = splitCategoryPath(category);

  if (parts.length === 0) {
    return EMPTY_CATEGORY_PATH;
  }

  if (category.includes(' > ') && parts.length >= 4) {
    return {
      school: parts[1] || '',
      course: parts[2] || '',
      className: parts[3] || '',
      uc: parts[4] || '',
    };
  }

  return {
    school: parts[0] || '',
    course: parts[1] || '',
    className: parts[2] || '',
    uc: parts[3] || '',
  };
}

export function buildCourseCategoryFilterOptions(
  sources: CourseCategoryOptionSource[],
  selection: CourseCategoryFilterSelection = {},
): CourseCategoryFilterOptions {
  const schools = new Set<string>();
  const courses = new Set<string>();
  const classes = new Set<string>();
  const ucs = new Set<string>();

  sources.forEach(source => {
    const parsed = parseCourseCategoryPath(source.category);
    const ucLabel = parsed.uc || source.courseName || '';
    const matchesSchool = !selection.school || selection.school === 'todos' || parsed.school === selection.school;
    const matchesCourse = !selection.course || selection.course === 'todos' || parsed.course === selection.course;
    const matchesClass = !selection.className || selection.className === 'todos' || parsed.className === selection.className;

    if (parsed.school) {
      schools.add(parsed.school);
    }

    if (matchesSchool && parsed.course) {
      courses.add(parsed.course);
    }

    if (matchesSchool && matchesCourse && parsed.className) {
      classes.add(parsed.className);
    }

    if (matchesSchool && matchesCourse && matchesClass && ucLabel) {
      ucs.add(ucLabel);
    }
  });

  return {
    schools: sortLabels(schools),
    courses: sortLabels(courses),
    classes: sortLabels(classes),
    ucs: sortLabels(ucs),
  };
}
