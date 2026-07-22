const STAFF_ROLE_SHORTNAMES = new Set(['manager', 'editingteacher', 'teacher', 'coursecreator'])
const STUDENT_ROLE_SHORTNAMES = new Set(['student', 'aluno', 'estudante'])

type MoodleUserRole = {
  shortname?: string
  name?: string
}

function normalizeRoleLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isStudentRoleLabel(role: string): boolean {
  if (STUDENT_ROLE_SHORTNAMES.has(role)) return true
  return role.includes('student') || role.includes('aluno') || role.includes('estudante')
}

function isStaffRoleLabel(role: string): boolean {
  if (STAFF_ROLE_SHORTNAMES.has(role)) return true
  return (
    role.includes('teacher') ||
    role.includes('professor') ||
    role.includes('docente') ||
    role.includes('tutor') ||
    role.includes('monitor') ||
    role.includes('coordenador') ||
    role.includes('manager') ||
    role.includes('admin')
  )
}

export function isStudentLikeUser(user: { roles?: MoodleUserRole[] }): boolean {
  const roleLabels = (user.roles || [])
    .flatMap((role) => [role.shortname, role.name])
    .map((roleLabel) => normalizeRoleLabel(String(roleLabel || '')))
    .filter(Boolean)

  // Missing roles are ambiguous and must not be treated as proof of a student.
  if (roleLabels.length === 0) return false

  if (roleLabels.some((role) => isStaffRoleLabel(role))) return false

  if (roleLabels.some((role) => isStudentRoleLabel(role))) return true

  // If user has explicit roles but none map to student, be conservative and exclude.
  return false
}
